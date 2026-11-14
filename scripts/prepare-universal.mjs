import { execFile } from 'node:child_process'
import { access, chmod, copyFile, mkdir } from 'node:fs/promises'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

await execFileAsync(
  process.platform === 'win32' ? 'npm.cmd' : 'npm',
  [
    'install',
    '--ignore-scripts',
    '--no-save',
    '--force',
    '@img/sharp-darwin-x64@0.35.5',
    '@img/sharp-libvips-darwin-x64@1.3.4'
  ],
  { stdio: 'inherit' }
)

await execFileAsync(
  process.platform === 'win32' ? 'npm.cmd' : 'npm',
  ['install', '--no-save', '--force', 'ffmpeg-static@5.3.0'],
  {
    stdio: 'inherit',
    env: { ...process.env, npm_config_arch: 'x64' }
  }
)

const source = new URL('../node_modules/ffmpeg-static/ffmpeg', import.meta.url)
const destinationDir = new URL('../resources/bin/darwin-x64/', import.meta.url)
await mkdir(destinationDir, { recursive: true })
await copyFile(source, new URL('ffmpeg', destinationDir))
await chmod(new URL('ffmpeg', destinationDir), 0o755)

const x64Resources = new URL('../resources/bin/darwin-x64/', import.meta.url)
const requiredResources = ['magick', 'pandoc', 'ffmpeg']

for (const resource of requiredResources) {
  try {
    await access(new URL(resource, x64Resources))
  } catch {
    throw new Error(
      `Universal macOS packaging requires resources/bin/darwin-x64/${resource}. ` +
        'Build the x64 ImageMagick, Ghostscript, Pandoc, and FFmpeg resources on an Intel macOS ' +
        'runner (or provide the complete darwin-x64 bundle) before running npm run build:mac.'
    )
  }
}
