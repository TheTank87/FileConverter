import { access, cp, mkdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const source = process.argv[2]
if (!source) {
  throw new Error('Usage: npm run stage:mac:x64 -- <path-to-darwin-x64-resources>')
}

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const destination = resolve(root, 'resources/bin/darwin-x64')
const resolvedSource = resolve(source)

try {
  await access(resolvedSource)
} catch {
  throw new Error(`The supplied macOS x64 resource directory does not exist: ${resolvedSource}`)
}

await rm(destination, { recursive: true, force: true })
await mkdir(destination, { recursive: true })
await cp(resolvedSource, destination, { recursive: true, dereference: true })
console.log(`Staged macOS x64 resources from ${resolvedSource}.`)
