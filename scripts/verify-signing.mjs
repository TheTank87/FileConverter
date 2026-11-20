import { execFile } from 'node:child_process'
import { readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

function parseArgs(argv) {
  const parsed = {}
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue
    const separator = arg.indexOf('=')
    const key = arg.slice(2, separator === -1 ? undefined : separator)
    parsed[key] = separator === -1 ? 'true' : arg.slice(separator + 1)
  }
  return parsed
}

const args = parseArgs(process.argv.slice(2))
const targetPlatform = args.platform ?? process.platform
const distDir = resolve(args.dir ?? 'dist')

async function findEntries(predicate) {
  const entries = await readdir(distDir, { recursive: true, withFileTypes: true })
  return entries.filter(predicate).map((entry) => join(entry.parentPath ?? entry.path, entry.name))
}

async function run(command, commandArgs) {
  const { stdout, stderr } = await execFileAsync(command, commandArgs, {
    maxBuffer: 20 * 1024 * 1024
  })
  return `${stdout}\n${stderr}`.trim()
}

async function verifyMac() {
  const apps = await findEntries((entry) => entry.isDirectory() && entry.name.endsWith('.app'))
  if (apps.length === 0) {
    throw new Error(`No .app bundle found under ${distDir}`)
  }

  for (const app of apps) {
    const details = await run('codesign', ['-dv', '--verbose=4', app])
    if (!details.includes('Authority=Developer ID Application:')) {
      throw new Error(`${app} is not signed with a Developer ID Application certificate`)
    }
    if (
      process.env.APPLE_TEAM_ID &&
      !details.includes(`TeamIdentifier=${process.env.APPLE_TEAM_ID}`)
    ) {
      throw new Error(`${app} was signed by a different Apple team`)
    }
    await run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', app])
    await run('spctl', ['-a', '-vv', '--type', 'execute', app])
    await run('xcrun', ['stapler', 'validate', app])
  }

  const dmgs = await findEntries((entry) => entry.isFile() && entry.name.endsWith('.dmg'))
  if (dmgs.length === 0) {
    throw new Error(`No .dmg found under ${distDir}`)
  }
}

async function verifyWindows() {
  const executables = await findEntries((entry) => entry.isFile() && entry.name.endsWith('.exe'))
  if (executables.length === 0) {
    throw new Error(`No .exe found under ${distDir}`)
  }

  for (const executable of executables) {
    const path = executable.replaceAll("'", "''")
    const script =
      `$signature = Get-AuthenticodeSignature -LiteralPath '${path}'; ` +
      `if ($signature.Status -ne 'Valid') { throw "Invalid signature on ${path}: $($signature.Status)" }; ` +
      '$signature.SignerCertificate.Subject'
    const subject = await run('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      script
    ])
    if (!subject) {
      throw new Error(`${executable} has no Authenticode signer`)
    }
  }
}

try {
  if (targetPlatform === 'darwin') await verifyMac()
  else if (targetPlatform === 'win32') await verifyWindows()
  else throw new Error(`Signing verification is not supported for ${targetPlatform}`)
  console.log(`Signing verification passed for ${targetPlatform}`)
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`Signing verification failed: ${message}`)
  process.exitCode = 1
}
