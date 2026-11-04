import type { PluginDisk, PluginDiskDeclaration, PluginDiskRef, PluginDiskRoots, PluginInstaller, PluginTools } from "./plugin-contracts.ts"
import { KIMI_CODE_ID } from "./locations.ts"
import { readInstalled } from "./plugin-state.ts"

export const KIMI_PLUGIN_ROOTS: PluginDiskDeclaration = {
  home: ".kimi-code", homeEnv: "KIMI_CODE_HOME", state: "plugins",
  config: { write: [], read: [] },
  stateFiles: { write: ["installed.json", "managed/*"], read: ["installed.json"] },
  workspace: { write: [], read: [] },
  library: { write: [], read: ["*", "*/kimi.plugin.json", "*/.kimi-plugin/plugin.json"] },
  directories: ["managed/:name"], external: [],
}
const manifests = ["kimi.plugin.json", ".kimi-plugin/plugin.json"]
const index: PluginDiskRef = { root: "plugins", path: "installed.json" }
const pluginName = /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*(?:@[A-Za-z0-9_-]+)?$/
const normalize = (value: string, platform: PluginDiskRoots["platform"]) => {
  const result = value.replace(/\\/g, "/").replace(/\/+$/, "")
  return platform === "win32" ? result.toLowerCase() : result
}
const scopeOnly = (scope: string) => { if (scope !== "user") throw new Error("Kimi plugins support user scope only") }
const diskOf = (tools: PluginTools): PluginDisk => {
  if (!tools.disk) throw new Error("Context Hub does not support plugin file operations")
  return tools.disk
}
async function current(disk: PluginDisk, roots: PluginDiskRoots) {
  const before = await disk.read(roots, index)
  return { before, document: readInstalled(before) }
}
async function manifestName(disk: PluginDisk, roots: PluginDiskRoots, name: string): Promise<string | null> {
  for (const manifest of manifests) {
    const raw = await disk.read(roots, { root: "library", path: `${name}/${manifest}` })
    if (raw === null) continue
    try {
      const parsed: unknown = JSON.parse(raw)
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null
      const value = (parsed as Record<string, unknown>).name
      return typeof value === "string" && pluginName.test(value) ? value.toLowerCase() : null
    } catch { return null }
  }
  return null
}
async function verifyRoot(tools: PluginTools, roots: PluginDiskRoots) {
  if (normalize(await tools.root(), roots.platform) !== normalize(roots.library, roots.platform)) {
    throw new Error("Plugin library changed; retry the operation")
  }
}

export function createKimiInstaller(): PluginInstaller {
  return {
    id: KIMI_CODE_ID, label: "Kimi Code",
    places: [{ id: "kimi-user", label: "Kimi Code", scope: "global", scopeWord: "user", switchable: true, file: ".kimi-code/plugins/installed.json" }],
    async available(tools) { return tools.has("kimi") },
    async held(tools) {
      const disk = diskOf(tools), roots = await disk.roots(KIMI_PLUGIN_ROOTS)
      const { document } = await current(disk, roots)
      const packs = await tools.packs().catch(() => [])
      return Promise.all(document.plugins.map(async (record) => {
        const matched = record.source === "local-path" && typeof record.originalSource === "string"
          ? packs.find((pack) => normalize(`${roots.library}/${pack.name}`, roots.platform) === normalize(record.originalSource as string, roots.platform) &&
            normalize(`${roots.plugins}/managed/${pack.name}`, roots.platform) === normalize(record.root, roots.platform))
          : undefined
        const declared = matched ? await manifestName(disk, roots, matched.name).catch(() => null) : null
        const name = declared === record.id ? matched!.name : record.id
        const pack = await tools.describe(record.root, name).catch(() => ({ name, version: "", description: "" }))
        return { name, id: record.id, version: pack.version, scope: "user", enabled: record.enabled,
          marketplace: null, origin: "record" as const, source: { kind: "local" as const, path: record.root }, pack }
      }))
    },
    async switches(tools) {
      const disk = diskOf(tools), roots = await disk.roots(KIMI_PLUGIN_ROOTS)
      const { document } = await current(disk, roots)
      return { user: Object.fromEntries(document.plugins.map((record) => [record.id, record.enabled])) }
    },
    async install(name, scope, tools) {
      scopeOnly(scope)
      const disk = diskOf(tools)
      return disk.run(KIMI_PLUGIN_ROOTS, async (roots) => {
        await verifyRoot(tools, roots)
        const sourceRef: PluginDiskRef = { root: "library", path: name }
        const sourceSnapshot = await disk.snapshotDirectory(roots, sourceRef)
        if (sourceSnapshot === null) throw new Error("Plugin library source no longer exists")
        const source = await disk.path(roots, sourceRef)
        const destination = `managed/${name}`
        const destRef: PluginDiskRef = { root: "plugins", path: destination }
        const root = await disk.path(roots, destRef)
        const before = await disk.snapshotDirectory(roots, destRef)
        const id = await manifestName(disk, roots, name)
        if (id === null) throw new Error("Invalid Kimi plugin manifest name")
        const state = await current(disk, roots)
        const old = state.document.plugins.find((record) => record.id === id)
        const same = (a: string, b: string) => normalize(a, roots.platform) === normalize(b, roots.platform)
        if (state.document.plugins.some((record) => record.id !== id && same(record.root, root))) {
          throw new Error("Kimi managed directory belongs to another plugin")
        }
        if (old && (old.source !== "local-path" || typeof old.originalSource !== "string" || !same(old.originalSource, source) || !same(old.root, root))) {
          throw new Error("Kimi plugin has another installation source; remove it in Kimi first")
        }
        if (!old && before !== null) throw new Error("Kimi managed directory already exists without a matching Hub record")
        if (old && before !== null && before !== sourceSnapshot) throw new Error("Kimi managed directory differs from the library; refusing to overwrite")
        const now = new Date().toISOString()
        const record = { ...old, id, root, source: "local-path", originalSource: source, origin: "custom", enabled: old?.enabled ?? true,
          installedAt: old?.installedAt ?? now, updatedAt: now }
        const plugins = old ? state.document.plugins.map((entry) => entry === old ? record : entry) : [...state.document.plugins, record]
        await verifyRoot(tools, roots)
        await disk.commit(roots, [{ ref: index, before: state.before, after: JSON.stringify({ ...state.document, version: 1, plugins }, null, 2) }],
          { name, destination, replace: true, before, sourceSnapshot, manifests })
        return { message: `${name} installed for Kimi Code; reload or start a new session`, location: root }
      })
    },
    async remove(id, scope, tools) {
      scopeOnly(scope)
      const disk = diskOf(tools)
      return disk.run(KIMI_PLUGIN_ROOTS, async (roots) => {
        await verifyRoot(tools, roots)
        const state = await current(disk, roots)
        const plugins = state.document.plugins.filter((record) => record.id !== id)
        if (plugins.length === state.document.plugins.length) throw new Error(`${id} is not installed`)
        await verifyRoot(tools, roots)
        await disk.commit(roots, [{ ref: index, before: state.before, after: JSON.stringify({ ...state.document, plugins }, null, 2) }])
        return { message: `${id} removed; the managed copy remains. Reload or start a new session` }
      })
    },
    async setEnabled(id, scope, on, tools) {
      scopeOnly(scope)
      const disk = diskOf(tools)
      return disk.run(KIMI_PLUGIN_ROOTS, async (roots) => {
        await verifyRoot(tools, roots)
        const state = await current(disk, roots)
        if (!state.document.plugins.some((record) => record.id === id)) throw new Error(`${id} is not installed`)
        const plugins = state.document.plugins.map((record) => record.id === id ? { ...record, enabled: on, updatedAt: new Date().toISOString() } : record)
        await verifyRoot(tools, roots)
        await disk.commit(roots, [{ ref: index, before: state.before, after: JSON.stringify({ ...state.document, plugins }, null, 2) }])
        return { message: `${id} ${on ? "enabled" : "disabled"}; reload or start a new session` }
      })
    },
  }
}
