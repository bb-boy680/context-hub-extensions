import type { PluginDisk, PluginDiskRef, PluginHeld, PluginInstaller, PluginTools } from "./contracts.ts"
import { KIRO_ID } from "./locations.ts"

const SCOPE = {
  home: ".kiro", state: "powers", directories: ["installed/:name"],
  config: { read: [], write: [] },
  stateFiles: { read: ["installed", "installed/*/plugin.json", "registries", "registries/*", "registry.json"], write: ["installed/*", "installed.json", "registries/user-added.json", "context-hub-ownership.json"] },
  workspace: { read: [], write: [] }, library: { read: ["*", "*/**"], write: [] }, external: [],
} as const
const INSTALLED: PluginDiskRef = { root: "plugins", path: "installed.json" }
const REGISTRY: PluginDiskRef = { root: "plugins", path: "registries/user-added.json" }
const OWNERS: PluginDiskRef = { root: "plugins", path: "context-hub-ownership.json" }
const SCHEMA = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json"
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)
const destination = (name: string): PluginDiskRef => ({ root: "plugins", path: `installed/${name}` })

function safeName(name: string): string {
  if (name.length > 64 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(name)) throw new Error("Invalid Kiro power name")
  return name
}
function readableName(name: string): boolean {
  return name.length <= 128 && /^[a-z0-9][a-z0-9._-]*$/i.test(name) && !name.includes("..") && !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)
}
function diskOf(tools: PluginTools): PluginDisk {
  if (!tools.disk || typeof tools.disk.snapshotDirectory !== "function") throw new Error("This Context Hub version lacks the required plugin file transaction API")
  return tools.disk
}
function document(text: string | null, initial: Record<string, unknown>, field: string): Record<string, unknown> {
  const value: unknown = text === null ? initial : JSON.parse(text)
  if (!isObject(value) || !Array.isArray(value[field]) || !(value[field] as unknown[]).every((entry) => isObject(entry) && typeof entry.name === "string")) throw new Error(`Invalid Kiro ${field} record`)
  if (field === "installedPowers" && ((value.version !== undefined && value.version !== "1.0.0") || (value.dismissedAutoInstalls !== undefined && !Array.isArray(value.dismissedAutoInstalls)))) throw new Error("Invalid Kiro installedPowers record")
  return value
}
function entries(value: Record<string, unknown>, field: string): Record<string, unknown>[] {
  return value[field] as Record<string, unknown>[]
}
function ownerDocument(text: string | null): Record<string, { hash: string; source: string; description: string }> {
  const value: unknown = text === null ? {} : JSON.parse(text)
  if (!isObject(value)) throw new Error("Invalid Kiro ownership record")
  for (const [name, item] of Object.entries(value)) {
    safeName(name)
    if (!isObject(item) || typeof item.hash !== "string" || !/^[a-f0-9]{64}$/.test(item.hash) || typeof item.source !== "string" || typeof item.description !== "string") throw new Error("Invalid Kiro ownership record")
  }
  return Object.assign(Object.create(null) as Record<string, { hash: string; source: string; description: string }>, value)
}
function manifestOf(text: string | null, name: string): { version: string; description: string } {
  if (text === null) throw new Error("Agent Plugins manifest is missing")
  const value: unknown = JSON.parse(text)
  if (!isObject(value) || value.$schema !== SCHEMA || value.name !== name || typeof value.version !== "string" || !value.version || typeof value.description !== "string" || !isObject(value.author) || typeof value.author.name !== "string" || !Array.isArray(value.keywords) || !value.keywords.every((word) => typeof word === "string")) throw new Error("Invalid Agent Plugins manifest")
  return { version: value.version, description: value.description }
}
const serialize = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`
const registryEntry = (name: string, owner: { source: string; description: string }) => ({ name, description: owner.description, source: { type: "local", path: owner.source } })
function isOwned(name: string, owner: { hash: string; source: string; description: string } | undefined, snapshot: string | null, installed: Record<string, unknown>[], registry: Record<string, unknown>[]): boolean {
  const records = installed.filter((entry) => entry.name === name), sources = registry.filter((entry) => entry.name === name)
  if (!owner || snapshot !== owner.hash || records.length !== 1 || sources.length !== 1) return false
  const record = records[0], source = sources[0]
  return record.name === name && record.registryId === "user-added" && (record.autoInstalled === undefined || record.autoInstalled === false) &&
    Object.keys(record).every((key) => ["name", "registryId", "autoInstalled"].includes(key)) &&
    source.description === owner.description && isObject(source.source) && source.source.type === "local" && source.source.path === owner.source &&
    Object.keys(source.source).every((key) => ["type", "path"].includes(key)) &&
    (source.autoInstall === undefined || source.autoInstall === false) && Object.keys(source).every((key) => ["name", "description", "source", "autoInstall"].includes(key))
}
async function rejectGit(disk: PluginDisk, roots: Parameters<PluginDisk["read"]>[0], name: string, relative = ""): Promise<void> {
  const base = relative ? `${name}/${relative}` : name
  for (const entry of await disk.list(roots, { root: "library", path: base })) {
    if (entry.name === ".git") throw new Error("Agent Plugins with .git entries cannot be copied safely")
    if (entry.directory) await rejectGit(disk, roots, name, relative ? `${relative}/${entry.name}` : entry.name)
  }
}

export function createKiroInstaller(): PluginInstaller {
  return {
    id: KIRO_ID, label: "Kiro",
    places: [{ id: "kiro-user", label: "Kiro", scope: "global", scopeWord: "user", switchable: false }],
    async available(tools) { await diskOf(tools).roots(SCOPE); return true },
    async held(tools) {
      const disk = diskOf(tools), roots = await disk.roots(SCOPE)
      const installed = document(await disk.read(roots, INSTALLED), { version: "1.0.0", installedPowers: [], dismissedAutoInstalls: [] }, "installedPowers")
      const registry = document(await disk.read(roots, REGISTRY), { powers: [] }, "powers")
      const owners = ownerDocument(await disk.read(roots, OWNERS))
      const result: PluginHeld[] = []
      for (const entry of entries(installed, "installedPowers")) {
        const name = entry.name as string
        if (!readableName(name)) continue
        const ref = destination(name), owner = owners[name]
        let snapshot: string | null = null, raw: string | null = null, sourceAvailable = false, sourceMatches = false
        try {
          snapshot = await disk.snapshotDirectory(roots, ref)
          raw = await disk.read(roots, { root: "plugins", path: `${ref.path}/plugin.json` })
          if (owner && await disk.path(roots, { root: "library", path: name }) === owner.source) {
            const sourceHash = await disk.snapshotDirectory(roots, { root: "library", path: name })
            sourceAvailable = sourceHash !== null
            sourceMatches = sourceHash === owner.hash
          }
        } catch { /* Unreadable files must not become writable. */ }
        let version = "", description = "", valid = false
        try { ({ version, description } = manifestOf(raw, name)); valid = true } catch { /* Keep unknown installations visible. */ }
        result.push({ name, id: name, version, scope: "user", marketplace: null, readOnly: !valid || !sourceMatches || !isOwned(name, owner, snapshot, entries(installed, "installedPowers"), entries(registry, "powers")), sourceAvailable, source: { kind: "local", path: await disk.path(roots, ref) }, pack: { name, version, description } })
      }
      return result
    },
    async install(name, scope, tools) {
      if (scope !== "user") throw new Error("Kiro powers only support the user scope")
      safeName(name)
      const disk = diskOf(tools)
      return disk.run(SCOPE, async (roots) => {
        const source: PluginDiskRef = { root: "library", path: name }, ref = destination(name)
        const sourceHash = await disk.snapshotDirectory(roots, source)
        if (sourceHash === null) throw new Error("Plugin pack is missing")
        const manifest = manifestOf(await disk.read(roots, { root: "library", path: `${name}/plugin.json` }), name)
        await rejectGit(disk, roots, name)
        const beforeInstalled = await disk.read(roots, INSTALLED), beforeRegistry = await disk.read(roots, REGISTRY), beforeOwners = await disk.read(roots, OWNERS)
        const installed = document(beforeInstalled, { version: "1.0.0", installedPowers: [], dismissedAutoInstalls: [] }, "installedPowers")
        const registry = document(beforeRegistry, { powers: [] }, "powers"), owners = ownerDocument(beforeOwners)
        const records = entries(installed, "installedPowers"), sources = entries(registry, "powers")
        const old = await disk.snapshotDirectory(roots, ref), oldOwner = owners[name]
        if (old !== null || oldOwner || records.some((entry) => entry.name === name) || sources.some((entry) => entry.name === name)) {
          if (!isOwned(name, oldOwner, old, records, sources)) throw new Error("Kiro power conflicts with an unmanaged or modified installation")
        }
        const owner = { hash: sourceHash, source: await disk.path(roots, source), description: `Custom power from ${await disk.path(roots, source)}` }
        owners[name] = owner
        installed.installedPowers = [...records.filter((entry) => entry.name !== name), { name, registryId: "user-added" }]
        registry.powers = [...sources.filter((entry) => entry.name !== name), registryEntry(name, owner)]
        await disk.commit(roots, [
          { ref: INSTALLED, before: beforeInstalled, after: serialize(installed) },
          { ref: REGISTRY, before: beforeRegistry, after: serialize(registry) },
          { ref: OWNERS, before: beforeOwners, after: serialize(owners) },
        ], { name, destination: ref.path, replace: old !== null, before: old, sourceSnapshot: sourceHash, manifests: ["plugin.json"] })
        return { message: `${name} installed for Kiro; reload Kiro to discover it`, location: await disk.path(roots, ref), output: manifest.version }
      })
    },
    async remove(id, scope, tools) {
      if (scope !== "user") throw new Error("Kiro powers only support the user scope")
      const name = safeName(id), disk = diskOf(tools)
      return disk.run(SCOPE, async (roots) => {
        const beforeInstalled = await disk.read(roots, INSTALLED), beforeRegistry = await disk.read(roots, REGISTRY), beforeOwners = await disk.read(roots, OWNERS)
        const installed = document(beforeInstalled, { version: "1.0.0", installedPowers: [], dismissedAutoInstalls: [] }, "installedPowers")
        const registry = document(beforeRegistry, { powers: [] }, "powers"), owners = ownerDocument(beforeOwners)
        const records = entries(installed, "installedPowers"), sources = entries(registry, "powers"), ref = destination(name)
        const snapshot = await disk.snapshotDirectory(roots, ref), owner = owners[name]
        if (!isOwned(name, owner, snapshot, records, sources) || snapshot === null) throw new Error("Kiro power is not managed or was modified")
        if (await disk.path(roots, { root: "library", path: name }) !== owner.source || await disk.snapshotDirectory(roots, { root: "library", path: name }) !== owner.hash) throw new Error("Kiro power source is unavailable or changed")
        const target = await disk.path(roots, ref)
        let shared = false
        for (const entry of sources) {
          if (entry.name === name || !isObject(entry.source) || entry.source.type !== "local" || typeof entry.source.path !== "string") continue
          if (entry.source.path === target || entry.source.path.startsWith(`${target}/`) || entry.source.path.startsWith(`${target}\\`)) shared = true
        }
        // shortcut: other registries may reference this directory; inspect their sources before deleting it.
        const others = await disk.list(roots, { root: "plugins", path: "registries" })
        if (others.some((entry) => entry.name !== "user-added.json") || await disk.read(roots, { root: "plugins", path: "registry.json" }) !== null) shared = true
        delete owners[name]
        installed.installedPowers = records.filter((entry) => entry.name !== name)
        registry.powers = sources.filter((entry) => entry.name !== name)
        await disk.commit(roots, [
          { ref: INSTALLED, before: beforeInstalled, after: serialize(installed) },
          { ref: REGISTRY, before: beforeRegistry, after: serialize(registry) },
          { ref: OWNERS, before: beforeOwners, after: serialize(owners) },
        ], undefined, shared ? undefined : { ref, before: snapshot })
        return { message: shared ? `${name} removed from Kiro; files retained because other sources may reference them` : `${name} removed from Kiro; reload Kiro to refresh` }
      })
    },
  }
}
