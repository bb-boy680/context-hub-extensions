import type { McpTools, PluginDisk, PluginDiskRoots, PluginHeld, PluginInstaller, PluginTools } from "./contracts.ts"
import { CODEX_ID } from "./locations.ts"

const MARKETPLACE = "context-hub"
const CONFIG = { root: "config", path: "config.toml" } as const
const SCOPE = {
  home: ".codex", homeEnv: "CODEX_HOME", state: "plugins",
  config: { write: ["config.toml"], read: [] },
  stateFiles: { write: ["cache/*/*", "cache/*/*/*"], read: ["cache/*/*"] },
  workspace: { write: [], read: [] },
  library: { write: [], read: [".agents/plugins/marketplace.json", "*/.codex-plugin/plugin.json", "*/.claude-plugin/plugin.json", "*/plugin.json"] },
  external: [],
} as const

function diskOf(tools: PluginTools): PluginDisk {
  if (!tools.disk) throw new Error("plugin file access is unavailable")
  return tools.disk
}
function object(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
function identifier(id: string): [string, string] {
  const match = /^([A-Za-z0-9_-][A-Za-z0-9_.-]*)@([A-Za-z0-9_-][A-Za-z0-9_.-]*)$/.exec(id)
  if (!match) throw new Error(`invalid plugin id: ${id}`)
  return [match[1]!, match[2]!]
}
function writable(id: string): string {
  const [name, market] = identifier(id)
  if (market !== MARKETPLACE) throw new Error("plugin belongs to another marketplace")
  return name
}
function join(root: string, relative: string, platform: PluginDiskRoots["platform"]): string {
  const separator = platform === "win32" ? "\\" : "/"
  return `${root.replace(/[\\/]+$/, "")}${separator}${relative.split("/").join(separator)}`
}
/** Codex writes verbatim `\\?\` paths; the same directory must not read as a different one. */
function samePath(a: string, b: string, platform: PluginDiskRoots["platform"]): boolean {
  const normalize = (value: string): string => {
    const clean = value.replace(/^\\\\\?\\/, "").replace(/\\/g, "/").replace(/\/+$/, "")
    return platform === "win32" ? clean.toLowerCase() : clean
  }
  return normalize(a) === normalize(b)
}
function manifest(raw: string | null): Record<string, unknown> {
  if (raw === null) return {}
  const value: unknown = JSON.parse(raw)
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("invalid plugin manifest")
  return value as Record<string, unknown>
}

export function createCodexInstaller(toml: Pick<McpTools, "parseToml" | "setTomlEntry" | "setTomlField" | "clearTomlEntry">): PluginInstaller {
  const parse = (text: string | null) => text === null || text.trim() === "" ? {} : toml.parseToml(text)
  const entries = async (tools: PluginTools): Promise<PluginHeld[]> => {
    const disk = diskOf(tools)
    const roots = await disk.roots(SCOPE)
    const plugins = object(parse(await disk.read(roots, CONFIG)).plugins)
    const fallback = object(plugins._default).enabled
    const result: PluginHeld[] = []
    for (const [id, value] of Object.entries(plugins)) {
      if (id === "_default" || typeof value !== "object" || value === null || Array.isArray(value)) continue
      let name: string, market: string
      try { [name, market] = identifier(id) } catch { continue }
      const versions = (await disk.list(roots, { root: "plugins", path: `cache/${market}/${name}` })).filter((entry) => entry.directory).map((entry) => entry.name).sort()
      if (versions.length === 0) continue
      const version = versions[versions.length - 1]!
      const enabled = object(value).enabled
      const source = join(roots.plugins, `cache/${market}/${name}/${version}`, roots.platform)
      const pack = await tools.describe(source, name).catch(() => ({ name: "", version: "", description: "" }))
      result.push({ name, id, version, scope: "user", enabled: typeof enabled === "boolean" ? enabled : typeof fallback === "boolean" ? fallback : true, marketplace: market, readOnly: market !== MARKETPLACE, source: { kind: "local", path: source }, pack })
    }
    return result
  }
  return {
    id: CODEX_ID, label: "Codex",
    places: [{ id: "codex-user", label: "Codex", scope: "global", scopeWord: "user", switchable: true, file: "config.toml" }],
    async available(tools) { try { await diskOf(tools).roots(SCOPE); return true } catch { return false } },
    held: entries,
    async switches(tools) { return { user: Object.fromEntries((await entries(tools)).map((entry) => [entry.id, entry.enabled])) } },
    async install(name, scope, tools) {
      if (scope !== "user") throw new Error("unsupported plugin scope")
      writable(`${name}@${MARKETPLACE}`)
      const disk = diskOf(tools)
      const packs = await tools.packs()
      await tools.syncMarketplace([{ path: ".agents/plugins/marketplace.json", document: {
        name: MARKETPLACE, description: "Plugin packs collected by Context Hub.", interface: { displayName: "Context Hub" },
        plugins: packs.map((pack) => ({ name: pack.name, source: { source: "local", path: `./${pack.name}` }, policy: { installation: "AVAILABLE" }, category: "Other", description: pack.description, version: pack.version })),
      } }])
      return disk.run(SCOPE, async (roots) => {
        const index = manifest(await disk.read(roots, { root: "library", path: ".agents/plugins/marketplace.json" }))
        const listed = Array.isArray(index.plugins) ? index.plugins.find((entry) => object(entry).name === name) : undefined
        if (!listed) throw new Error(`${name} is not listed in the Hub marketplace`)
        const first = manifest(await disk.read(roots, { root: "library", path: `${name}/.codex-plugin/plugin.json` }))
        const second = manifest(await disk.read(roots, { root: "library", path: `${name}/.claude-plugin/plugin.json` }))
        const version = [first.version, second.version, object(listed).version].find((value) => typeof value === "string" && value !== "") ?? "local"
        if (typeof version !== "string" || !/^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(version) || version === "..") throw new Error("invalid plugin version")
        const before = await disk.read(roots, CONFIG)
        const document = parse(before)
        const existingMarket = object(document.marketplaces)[MARKETPLACE]
        const market = object(existingMarket)
        if (existingMarket !== undefined && (market.source_type !== "local" || typeof market.source !== "string" || !samePath(market.source, roots.library, roots.platform))) throw new Error("marketplace points to another directory")
        let after = existingMarket === undefined ? toml.setTomlEntry(before ?? "", "marketplaces", MARKETPLACE, { source_type: "local", source: roots.library }) : before ?? ""
        const id = `${name}@${MARKETPLACE}`
        const existing = object(object(document.plugins)[id])
        after = Object.keys(existing).length > 0 ? toml.setTomlField(after, "plugins", id, "enabled", true) : toml.setTomlEntry(after, "plugins", id, { enabled: true })
        const destination = `cache/${MARKETPLACE}/${name}/${version}`
        await disk.commit(roots, [{ ref: CONFIG, before, after }], { name, destination, replace: true, pruneVersions: true })
        return { message: `${name} installed for Codex`, location: join(roots.plugins, destination, roots.platform) }
      })
    },
    async remove(id, scope, tools) {
      if (scope !== "user") throw new Error("unsupported plugin scope")
      const name = writable(id)
      const disk = diskOf(tools)
      return disk.run(SCOPE, async (roots) => {
        const before = await disk.read(roots, CONFIG)
        if (!Object.hasOwn(object(parse(before).plugins), id)) throw new Error("plugin is not installed")
        const after = toml.clearTomlEntry(before ?? "", "plugins", id)
        await disk.commit(roots, [{ ref: CONFIG, before, after }])
        await disk.removeDirectory(roots, { root: "plugins", path: `cache/${MARKETPLACE}/${name}` })
        return { message: `${id} removed from Codex` }
      })
    },
    async setEnabled(id, scope, on, tools) {
      if (scope !== "user") throw new Error("unsupported plugin scope")
      writable(id)
      const disk = diskOf(tools)
      return disk.run(SCOPE, async (roots) => {
        const before = await disk.read(roots, CONFIG)
        if (!Object.hasOwn(object(parse(before).plugins), id)) throw new Error("plugin is not installed")
        const after = toml.setTomlField(before ?? "", "plugins", id, "enabled", on)
        await disk.commit(roots, [{ ref: CONFIG, before, after }])
        return { message: `${id} ${on ? "enabled" : "disabled"} for Codex` }
      })
    },
  }
}
