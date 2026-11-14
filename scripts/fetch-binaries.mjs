import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, rename, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
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

const key = `${process.platform}-${process.arch}`
const release = releases[key]

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
