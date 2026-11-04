import type { PluginDisk, PluginDiskRef, PluginHeld, PluginInstaller, PluginTools } from "./contracts.ts"
import { CURSOR_ID, CURSOR_MANIFEST } from "./locations.ts"
import { nativeManifest, nativePath, rejectUnsupportedVariables, safeName } from "./plugin-state.ts"

const SCOPE = {
  home: ".cursor", state: "plugins", directories: ["local/:name"],
  config: { read: [], write: [] },
  stateFiles: { read: ["local", "local/*/.cursor-plugin/plugin.json"], write: ["local/*", "context-hub-ownership.json"] },
  workspace: { read: [], write: [] },
  library: { read: ["*", "*/**"], write: [] }, external: [],
} as const
const OWNERS: PluginDiskRef = { root: "plugins", path: "context-hub-ownership.json" }
const localRef = (name: string): PluginDiskRef => ({ root: "plugins", path: `local/${safeName(name)}` })

function diskOf(tools: PluginTools): PluginDisk {
  if (!tools.disk || typeof tools.disk.snapshotDirectory !== "function") throw new Error("This Context Hub version lacks the required plugin file transaction API")
  return tools.disk
}
function ownersOf(text: string | null): Record<string, string> {
  if (text === null) return Object.create(null) as Record<string, string>
  const value: unknown = JSON.parse(text)
  if (typeof value !== "object" || value === null || Array.isArray(value) || Object.entries(value).some(([name, hash]) => {
    try { safeName(name) } catch { return true }
    return typeof hash !== "string" || !/^[a-f0-9]{64}$/.test(hash)
  })) throw new Error("Invalid Cursor plugin ownership record")
  return Object.assign(Object.create(null) as Record<string, string>, value)
}
function idOf(name: string): string { return `local:${safeName(name)}` }
function nameOf(id: string): string {
  if (!id.startsWith("local:")) throw new Error("Only local Cursor plugins can be removed")
  return safeName(id.slice(6))
}

async function validatePackFiles(disk: PluginDisk, roots: Parameters<PluginDisk["read"]>[0], name: string, relative = ""): Promise<void> {
  const prefix = relative ? `${name}/${relative}` : name
  for (const entry of await disk.list(roots, { root: "library", path: prefix })) {
    const child = relative ? `${relative}/${entry.name}` : entry.name
    if (entry.directory) await validatePackFiles(disk, roots, name, child)
    else if (!/\.(?:png|jpe?g|gif|webp|ico|pdf|zip|gz|woff2?|ttf|otf|mp[34]|webm|wasm|exe|dll|so|dylib)$/i.test(entry.name)) {
      rejectUnsupportedVariables(await disk.read(roots, { root: "library", path: `${name}/${child}` }))
    }
  }
}

export function createCursorInstaller(): PluginInstaller {
  return {
    id: CURSOR_ID,
    label: "Cursor",
    places: [{ id: "cursor-user", label: "Cursor", scope: "global", scopeWord: "user", switchable: false }],
    async available(tools) {
      await diskOf(tools).roots(SCOPE)
      return true
    },
    async held(tools) {
      const disk = diskOf(tools)
      const roots = await disk.roots(SCOPE)
      const owners = ownersOf(await disk.read(roots, OWNERS))
      const result: PluginHeld[] = []
      for (const entry of await disk.list(roots, { root: "plugins", path: "local" })) {
        if (!entry.directory) continue
        const name = safeName(entry.name)
        const ref = localRef(name)
        const source = await disk.path(roots, ref)
        let snapshot: string | null = null
        let raw: string | null = null
        try {
          snapshot = await disk.snapshotDirectory(roots, ref)
          raw = await disk.read(roots, { root: "plugins", path: `local/${name}/${CURSOR_MANIFEST}` })
        } catch { /* A failed inspection must not be mistaken for a missing directory. */ }
        const managed = snapshot !== null && Object.hasOwn(owners, name) && snapshot === owners[name]
        let version = "", description = "", valid = false
        try {
          const doc = nativeManifest(raw, name)
          valid = true
          version = typeof doc.version === "string" ? doc.version : ""
          description = typeof doc.description === "string" ? doc.description : ""
        } catch { /* Report the directory as read-only when its manifest is unusable. */ }
        result.push({ name, id: idOf(name), version, scope: "user", marketplace: null, readOnly: !managed || !valid, source: { kind: "local", path: source }, pack: { name, version, description } })
      }
      return result
    },
    async install(name, scope, tools) {
      if (scope !== "user") throw new Error("Cursor only supports user-local plugin delivery")
      safeName(name)
      const disk = diskOf(tools)
      return disk.run(SCOPE, async (roots) => {
        const source = { root: "library", path: name } as const
        const sourceSnapshot = await disk.snapshotDirectory(roots, source)
        if (sourceSnapshot === null) throw new Error("Plugin pack is missing")
        const raw = await disk.read(roots, { root: "library", path: `${name}/${CURSOR_MANIFEST}` })
        const manifest = nativeManifest(raw, name)
        await validatePackFiles(disk, roots, name)
        const referenced = [manifest.hooks, ...(Array.isArray(manifest.mcpServers) ? manifest.mcpServers : [manifest.mcpServers])]
        for (const item of referenced) {
          if (typeof item !== "string") continue
          nativePath(item)
          const relative = item.startsWith("./") ? item.slice(2) : item
          const text = await disk.read(roots, { root: "library", path: `${name}/${relative}` })
          if (text === null) throw new Error("Cursor plugin configuration is missing")
          rejectUnsupportedVariables(text)
        }
        if (await disk.snapshotDirectory(roots, source) !== sourceSnapshot) throw new Error("Plugin pack changed during validation; retry")
        const before = await disk.read(roots, OWNERS)
        const owners = ownersOf(before)
        const destination = localRef(name)
        const existing = await disk.snapshotDirectory(roots, destination)
        if (existing !== null && (!Object.hasOwn(owners, name) || owners[name] !== existing)) throw new Error("Cursor local plugin conflicts with a non-managed or modified directory")
        owners[name] = sourceSnapshot
        const after = `${JSON.stringify(owners, null, 2)}\n`
        await disk.commit(roots, [{ ref: OWNERS, before, after }], { name, destination: destination.path, replace: existing !== null, before: existing, sourceSnapshot, manifests: [CURSOR_MANIFEST] })
        return { message: `${name} copied for Cursor; reload Cursor to discover it`, location: await disk.path(roots, destination) }
      })
    },
    async remove(id, scope, tools) {
      if (scope !== "user") throw new Error("Cursor only supports user-local plugin delivery")
      const name = nameOf(id)
      const disk = diskOf(tools)
      return disk.run(SCOPE, async (roots) => {
        const before = await disk.read(roots, OWNERS)
        const owners = ownersOf(before)
        const ref = localRef(name)
        const snapshot = await disk.snapshotDirectory(roots, ref)
        if (!Object.hasOwn(owners, name) || snapshot === null || owners[name] !== snapshot) throw new Error("Cursor local plugin is not managed or was modified")
        delete owners[name]
        await disk.commit(roots, [{ ref: OWNERS, before, after: `${JSON.stringify(owners, null, 2)}\n` }], undefined, { ref, before: snapshot })
        return { message: `${name} removed from Cursor; reload Cursor to refresh` }
      })
    },
  }
}
