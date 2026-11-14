import { execFile } from 'node:child_process'
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
