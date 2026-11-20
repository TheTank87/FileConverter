import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readdir, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'

const directory = resolve(process.argv[2] ?? 'dist')
const entries = await readdir(directory, { withFileTypes: true })
const artifacts = entries
  .filter(
    (entry) =>
      entry.isFile() &&
      /\.(dmg|exe|msi|zip)$/i.test(entry.name) &&
      !entry.name.endsWith('.blockmap')
  )
  .map((entry) => entry.name)
  .sort()

if (artifacts.length === 0) {
  throw new Error(`No release artifacts found in ${directory}`)
}

const lines = []
for (const artifact of artifacts) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(join(directory, artifact))) {
    hash.update(chunk)
  }
  lines.push(`${hash.digest('hex')}  ${artifact}`)
}

const output = join(directory, 'CHECKSUMS.txt')
await writeFile(output, `${lines.join('\n')}\n`)
console.log(`Wrote ${basename(output)} for ${artifacts.length} artifacts`)
console.log(lines.join('\n'))
