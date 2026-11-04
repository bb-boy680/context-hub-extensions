import type { PluginDisk, PluginDiskChange, PluginDiskRoots, PluginTools } from "../src/contracts.ts"
import { ZCODE_PLUGIN_ROOTS } from "../src/locations.ts"

export function fixture() {
  const files = new Map<string, string>()
  const snapshots = new Map<string, string>()
  const removed: string[] = []
  const commits: { changes: readonly PluginDiskChange[]; copy?: { name: string; destination: string; manifests?: readonly string[]; sourceSnapshot?: string; before?: string | null } }[] = []
  const roots: PluginDiskRoots = { declaration: ZCODE_PLUGIN_ROOTS, config: "/temp/user/.zcode", plugins: "/temp/user/.zcode/cli/plugins", workspace: "/temp/work", library: "/temp/hub/plugins", platform: "posix" }
  const disk: PluginDisk = {
    async roots() { return roots },
    async read(_roots, ref) { return files.get(`${ref.root}:${ref.path}`) ?? null },
    async snapshotDirectory(_roots, ref) { return snapshots.get(`${ref.root}:${ref.path}`) ?? (ref.root === "library" ? "a".repeat(64) : null) },
    async readExternal(_roots, directory, relative) { return files.get(`external:${directory}/${relative}`) ?? null },
    async removeDirectory(_roots, ref) { removed.push(ref.path) },
    async commit(_roots, changes, copy, remove) {
      if (remove !== undefined && snapshots.get(`${remove.ref.root}:${remove.ref.path}`) !== remove.before) throw new Error("directory snapshot conflict")
      if (copy !== undefined && (snapshots.get(`plugins:${copy.destination}`) ?? null) !== copy.before) throw new Error("directory snapshot conflict")
      for (const change of changes) {
        if ((files.get(`${change.ref.root}:${change.ref.path}`) ?? null) !== change.before) throw new Error("snapshot conflict")
      }
      commits.push({ changes, copy })
      for (const change of changes) {
        const key = `${change.ref.root}:${change.ref.path}`
        if (change.after === null) files.delete(key)
        else files.set(key, change.after)
      }
      if (remove !== undefined) { removed.push(remove.ref.path); snapshots.delete(`${remove.ref.root}:${remove.ref.path}`) }
      if (copy !== undefined) {
        snapshots.set(`plugins:${copy.destination}`, copy.sourceSnapshot!)
        files.set(`external:${roots.plugins}/${copy.destination}/.zcode-plugin/plugin.json`, files.get(`library:${copy.name}/.zcode-plugin/plugin.json`)!)
      }
    },
    async run(_declaration, work) { return work(roots) },
  }
  const tools: PluginTools = {
    disk,
    async packs() { return [{ name: "demo", description: "fixture", version: "1.0.0" }] },
    async root() { return roots.library },
    async syncMarketplace(indexes) { for (const index of indexes) files.set(`library:${index.path}`, JSON.stringify(index.document)) },
    async has() { throw new Error("CLI has 禁止调用") },
    async run() { throw new Error("CLI run 禁止调用") },
  }
  files.set("library:demo/.zcode-plugin/plugin.json", '{"name":"demo","version":"1.0.0","description":"demo"}')
  return { files, snapshots, removed, commits, roots, disk, tools }
}
