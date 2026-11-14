import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { chmod, cp, mkdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, basename, join, relative, sep } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const binaryRoot = join(root, 'resources', 'bin')
const version = '7.1.2-35'

const releases = {
  'win32-x64': {
    archive: `ImageMagick-${version}-Q16-x64-static.exe`,
    url: `https://github.com/ImageMagick/ImageMagick/releases/download/${version}/ImageMagick-${version}-Q16-x64-static.exe`,
    sha256: '056a24e497baf60bca826a9efb0860f9dd08139b97b5fdeff2b950cb9f3ccba9',
    binary: 'magick.exe',
    kind: 'executable'
  },
  'win32-arm64': {
    archive: `ImageMagick-${version}-Q16-arm64-static.exe`,
    url: `https://github.com/ImageMagick/ImageMagick/releases/download/${version}/ImageMagick-${version}-Q16-arm64-static.exe`,
    sha256: '716797d321600e3001106bbca8c64c82458cf38a68bf8c9b52d1a50fbe2ad2e2',
    binary: 'magick.exe',
    kind: 'executable'
  }
}

const requestedPlatform = getOption('--platform') ?? process.platform
const requestedArch = getOption('--arch') ?? process.arch
const key = `${requestedPlatform}-${requestedArch}`
const release = releases[key]

if (requestedPlatform === 'darwin') {
  await fetchMacImageMagick(key, requestedArch)
  process.exit(0)
}

if (!release) {
  if (process.env.CI === 'true' || process.env.CI === '1') {
    throw new Error(
      `No verified ImageMagick release is configured for ${key}. Add a pinned artifact before building in CI.`
    )
  }

  console.warn(
    `Skipping ImageMagick download for ${key}; provide resources/bin/${key}/magick manually.`
  )
  process.exit(0)
}

const destinationDir = join(binaryRoot, key)
const destination = join(destinationDir, release.binary)

try {
  await stat(destination)
  console.log(`ImageMagick already present at ${destination}; skipping download.`)
  process.exit(0)
} catch (error) {
  if (error?.code !== 'ENOENT') throw error
}

await mkdir(destinationDir, { recursive: true })
const temporaryArchive = join(tmpdir(), `diat-${release.archive}`)

try {
  console.log(`Downloading ImageMagick ${version} for ${key}…`)
  await download(release.url, temporaryArchive)
  const actualSha256 = await sha256(temporaryArchive)
  if (actualSha256 !== release.sha256) {
    throw new Error(
      `Checksum mismatch for ${release.archive}: expected ${release.sha256}, got ${actualSha256}`
    )
  }

  if (release.kind === 'executable') {
    await rename(temporaryArchive, destination)
    if (requestedPlatform !== 'win32') await chmod(destination, 0o755)
    process.exit(0)
  }

  throw new Error(`Unsupported ImageMagick artifact type: ${release.kind}`)
} finally {
  await rm(temporaryArchive, { force: true })
}

async function download(url, output) {
  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok || !response.body) {
    throw new Error(`ImageMagick download failed (${response.status} ${response.statusText})`)
  }

  await pipeline(response.body, createWriteStream(output))
}

async function sha256(path) {
  const hash = createHash('sha256')
  await pipeline(createReadStream(path), hash)
  return hash.digest('hex')
}

async function fetchMacImageMagick(key, requestedArch) {
  if (requestedArch !== process.arch) {
    throw new Error(
      `Cannot fetch a ${key} ImageMagick binary on ${process.platform}-${process.arch}; run this on a matching macOS runner.`
    )
  }

  const destinationDir = join(binaryRoot, key)
  const launcher = join(destinationDir, 'magick')

  try {
    await stat(launcher)
    console.log(`ImageMagick already present at ${launcher}; skipping download.`)
    return
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }

  if (process.env.CI === 'true' || process.env.CI === '1') {
    await requireCommand('brew')
  } else {
    try {
      await requireCommand('brew')
    } catch (error) {
      console.warn(`${error.message} Skipping ImageMagick download for ${key}.`)
      return
    }
  }

  await execFileAsync('brew', ['install', 'imagemagick'], { stdio: 'inherit' })
  const formulaPrefix = (await execFileAsync('brew', ['--prefix', 'imagemagick'])).stdout.trim()
  if (!formulaPrefix) throw new Error('Homebrew did not return the ImageMagick prefix.')

  const dependencies = (await execFileAsync('brew', ['deps', '--installed', 'imagemagick'])).stdout
    .split(/\r?\n/)
    .map((dependency) => dependency.trim())
    .filter(Boolean)

  const temporaryDir = join(tmpdir(), `diat-imagemagick-${process.pid}`)
  const bundledPrefix = join(temporaryDir, 'imagemagick')
  const bundledLib = join(temporaryDir, 'lib')

  try {
    await rm(temporaryDir, { recursive: true, force: true })
    await mkdir(bundledLib, { recursive: true })
    await cp(formulaPrefix, bundledPrefix, { recursive: true, dereference: true })

    for (const dependency of dependencies) {
      const dependencyPrefix = (await execFileAsync('brew', ['--prefix', dependency])).stdout.trim()
      await copyLibraries(join(dependencyPrefix, 'lib'), bundledLib)
    }
    await copyLibraries(join(bundledPrefix, 'lib'), bundledLib)
    await rewriteDylibReferences(temporaryDir, bundledLib)
    await signMachOFiles(temporaryDir)

    await mkdir(destinationDir, { recursive: true })
    await cp(bundledPrefix, join(destinationDir, 'imagemagick'), {
      recursive: true,
      dereference: true
    })
    await cp(bundledLib, join(destinationDir, 'lib'), { recursive: true, dereference: true })
    await writeFile(
      launcher,
      `#!/bin/sh
set -e
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
export MAGICK_HOME="$ROOT/imagemagick"
export MAGICK_CONFIGURE_PATH="$ROOT/imagemagick/etc/ImageMagick-7:$ROOT/imagemagick/share/ImageMagick-7"
export MAGICK_CODER_MODULE_PATH="$ROOT/imagemagick/lib/ImageMagick/modules-Q16HDRI/coders"
export MAGICK_FILTER_MODULE_PATH="$ROOT/imagemagick/lib/ImageMagick/modules-Q16HDRI/filters"
export DYLD_LIBRARY_PATH="$ROOT/lib:$ROOT/imagemagick/lib\${DYLD_LIBRARY_PATH:+:$DYLD_LIBRARY_PATH}"
exec "$ROOT/imagemagick/bin/magick" "$@"
`
    )
    await chmod(launcher, 0o755)
    await execFileAsync(launcher, ['-version'], { env: { ...process.env } })
    console.log(`Fetched and bundled ImageMagick for ${key} at ${destinationDir}.`)
  } finally {
    await rm(temporaryDir, { recursive: true, force: true })
  }
}

async function copyLibraries(sourceDir, destinationDir) {
  try {
    const entries = await (await import('node:fs/promises')).readdir(sourceDir)
    for (const entry of entries) {
      if (entry.endsWith('.dylib') || entry.includes('.dylib.')) {
        await cp(join(sourceDir, entry), join(destinationDir, entry), {
          recursive: true,
          dereference: true
        })
      }
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
}

async function rewriteDylibReferences(rootDir, bundledLib) {
  const files = await findFiles(rootDir)
  for (const file of files) {
    if (!file.endsWith('.dylib') && basename(file) !== 'magick') continue
    const { stdout } = await execFileAsync('otool', ['-L', file])
    for (const line of stdout.split(/\r?\n/).slice(1)) {
      const dependency = line.trim().split(' ')[0]
      if (!dependency || dependency.startsWith('/usr/lib/') || dependency.startsWith('/System/'))
        continue
      const dependencyName = basename(dependency.split(' ')[0])
      const bundledDependency = join(bundledLib, dependencyName)
      try {
        await stat(bundledDependency)
      } catch {
        continue
      }
      const loaderRelativePath = relative(dirname(file), bundledDependency).split(sep).join('/')
      await execFileAsync('install_name_tool', [
        '-change',
        dependency,
        `@loader_path/${loaderRelativePath}`,
        file
      ])
    }
  }
}

async function signMachOFiles(rootDir) {
  await requireCommand('codesign')
  const files = await findFiles(rootDir)
  for (const file of files) {
    let fileType
    try {
      fileType = (await execFileAsync('file', ['-b', file])).stdout
    } catch {
      continue
    }
    if (!fileType.includes('Mach-O')) continue
    await execFileAsync('codesign', ['--force', '--sign', '-', file])
  }
}

async function findFiles(directory) {
  const entries = await (
    await import('node:fs/promises')
  ).readdir(directory, {
    withFileTypes: true
  })
  const files = []
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...(await findFiles(path)))
    else files.push(path)
  }
  return files
}

async function requireCommand(command) {
  try {
    await execFileAsync('which', [command])
  } catch {
    throw new Error(`Required command not found: ${command}`)
  }
}

function getOption(name) {
  const argument = process.argv.find((value) => value.startsWith(`${name}=`))
  return argument?.slice(name.length + 1)
}
