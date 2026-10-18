/**
 * The directory hash the hub records as `integrity`.
 *
 * This is the same algorithm as `folderHash` in `@context-hub/core`: every
 * file's relative path and bytes, in path order, fed to one SHA-256. Do not
 * change the order, the separator or what is skipped — an installed plugin
 * would stop matching its index entry.
 */
import { createHash } from "node:crypto"
import { promises as fs } from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"

const SKIPPED = new Set([".git", "node_modules"])

async function collect(dir, at, into) {
  const entries = await fs.readdir(at, { withFileTypes: true })
  for (const entry of entries) {
    if (SKIPPED.has(entry.name)) continue
    const full = path.join(at, entry.name)
    if (entry.isDirectory()) {
      await collect(dir, full, into)
      continue
    }
    if (!entry.isFile()) continue
    into.push({
      relative: path.relative(dir, full).split(path.sep).join("/"),
      bytes: await fs.readFile(full),
    })
  }
}

export async function folderHash(dir) {
  const files = []
  await collect(dir, dir, files)
  files.sort((left, right) => left.relative.localeCompare(right.relative))
  const hash = createHash("sha256")
  for (const file of files) {
    hash.update(file.relative)
    hash.update(file.bytes)
  }
  return hash.digest("hex")
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = process.argv[2]
  if (dir === undefined) {
    console.error("usage: node tools/hash-extension.mjs <plugin-dir>")
    process.exit(2)
  }
  console.log(await folderHash(dir))
}
