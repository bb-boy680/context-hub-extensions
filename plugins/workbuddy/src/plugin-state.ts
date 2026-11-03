import type {
  PluginDisk,
  PluginDiskRef,
  PluginDiskRoots,
  PluginHeld,
  PluginJsonTools,
  PluginSwitches,
} from "./contracts.ts"

export const INDEX: PluginDiskRef = { root: "plugins", path: "installed_plugins.json" }
export const MARKETS: PluginDiskRef = { root: "plugins", path: "known_marketplaces.json" }
export const USER_SETTINGS: PluginDiskRef = { root: "config", path: "settings.json" }
export const PROJECT_SETTINGS: PluginDiskRef = { root: "workspace", path: ".workbuddy/settings.json" }
export const LOCAL_SETTINGS: PluginDiskRef = { root: "workspace", path: ".workbuddy/settings.local.json" }

export interface InstalledRecord extends Record<string, unknown> {
  scope: string
  projectPath?: string
  installPath?: string
  version?: string
}

export interface InstalledIndex {
  document: Record<string, unknown>
  plugins: Record<string, InstalledRecord[]>
}

export interface PluginState {
  raw: { index: string | null; markets: string | null; user: string | null; project: string | null; local: string | null }
  index: InstalledIndex
  markets: Record<string, unknown>
  settings: { user: Record<string, unknown>; project: Record<string, unknown>; local: Record<string, unknown> }
  switches: PluginSwitches
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function document(json: PluginJsonTools, raw: string | null, name: string): Record<string, unknown> {
  if (raw !== null && raw.trim() === "") throw new Error(`${name} is empty`)
  try {
    return json.readJsonObject(raw) ?? {}
  } catch (error) {
    throw new Error(`cannot read ${name}: ${error instanceof Error ? error.message : String(error)}`, { cause: error })
  }
}

export function installedIndex(json: PluginJsonTools, raw: string | null): InstalledIndex {
  if (raw === null) return { document: { version: 2, plugins: {} }, plugins: {} }
  const parsed = document(json, raw, "installed_plugins.json")
  if (parsed.version !== 2) throw new Error("unsupported installed_plugins.json version")
  if (!object(parsed.plugins)) throw new Error("invalid installed_plugins.json plugins")
  const plugins: Record<string, InstalledRecord[]> = {}
  for (const [id, value] of Object.entries(parsed.plugins)) {
    const records = value
    if (!Array.isArray(records) || records.some((entry) => !object(entry) || typeof entry.scope !== "string" ||
      (entry.installPath !== undefined && typeof entry.installPath !== "string") ||
      (entry.version !== undefined && typeof entry.version !== "string") ||
      ((entry.scope === "project" || entry.scope === "local") && typeof entry.projectPath !== "string"))) {
      throw new Error(`invalid installed plugin record: ${id}`)
    }
    plugins[id] = records as InstalledRecord[]
  }
  return { document: parsed, plugins }
}

function settingsSwitches(settings: Record<string, unknown>, name: string): Record<string, boolean> {
  const enabled = settings.enabledPlugins
  if (enabled === undefined) return {}
  if (!object(enabled) || Object.values(enabled).some((value) => typeof value !== "boolean")) {
    throw new Error(`invalid enabledPlugins in ${name}`)
  }
  return enabled as Record<string, boolean>
}

export async function readState(disk: PluginDisk, roots: PluginDiskRoots, json: PluginJsonTools): Promise<PluginState> {
  const [index, markets, user, project, local] = await Promise.all([
    disk.read(roots, INDEX),
    disk.read(roots, MARKETS),
    disk.read(roots, USER_SETTINGS),
    roots.workspace === null ? null : disk.read(roots, PROJECT_SETTINGS),
    roots.workspace === null ? null : disk.read(roots, LOCAL_SETTINGS),
  ])
  const settings = {
    user: document(json, user, "user settings"),
    project: document(json, project, "project settings"),
    local: document(json, local, "local settings"),
  }
  return {
    raw: { index, markets, user, project, local },
    index: installedIndex(json, index),
    markets: document(json, markets, "known_marketplaces.json"),
    settings,
    switches: {
      user: settingsSwitches(settings.user, "user settings"),
      project: settingsSwitches(settings.project, "project settings"),
      local: settingsSwitches(settings.local, "local settings"),
    },
  }
}

export function sameProject(a: string, b: string, platform: PluginDiskRoots["platform"]): boolean {
  const normalize = (value: string): string => {
    const clean = value.replace(/\\/g, "/").replace(/\/+$/, "") || "/"
    return platform === "win32" ? clean.toLowerCase() : clean
  }
  return normalize(a) === normalize(b)
}

export function effective(switches: PluginSwitches, id: string): boolean | undefined {
  const values = [switches.local?.[id], switches.project?.[id], switches.user?.[id]].filter((value) => value !== undefined)
  return values.length > 0 && values.every((value) => value === values[0]) ? values[0] : undefined
}

function marketplaceLocation(market: unknown): string | null {
  if (!object(market) || !object(market.source) || market.source.source !== "directory") return null
  return typeof market.source.path === "string" ? market.source.path : null
}

export async function marketplacePack(
  disk: PluginDisk,
  roots: PluginDiskRoots,
  json: PluginJsonTools,
  market: unknown,
  name: string,
): Promise<string | null> {
  const directory = marketplaceLocation(market)
  if (directory === null) return null
  const raw = await disk.readExternal(roots, directory, ".codebuddy-plugin/marketplace.json")
  if (raw === null) return null
  const metadata = document(json, raw, "marketplace.json")
  if (!Array.isArray(metadata.plugins)) throw new Error("invalid marketplace plugins")
  const entry = metadata.plugins.find((one) => object(one) && one.name === name)
  if (!object(entry) || typeof entry.source !== "string" || !entry.source.startsWith("./")) return null
  /* "./" names the marketplace directory itself, which `readExternal` above has
     already validated; an empty relative path is not one the host accepts. */
  const relative = entry.source.slice(2)
  return relative === "" ? directory : disk.external(roots, directory, relative)
}

const EMPTY_PACK = { name: "", version: "", description: "" }

export async function heldFromState(disk: PluginDisk, roots: PluginDiskRoots, json: PluginJsonTools, state: PluginState): Promise<PluginHeld[]> {
  const found: PluginHeld[] = []
  const seen = new Set<string>()
  const managed = new Set(Object.entries(state.index.plugins)
    .filter(([, records]) => records.some((record) => record.scope === "managed"))
    .map(([id]) => id))
  for (const [id, records] of Object.entries(state.index.plugins)) {
    const at = id.lastIndexOf("@")
    if (at <= 0 || at === id.length - 1) continue
    const name = id.slice(0, at)
    const marketplace = id.slice(at + 1)
    for (const record of records) {
      if (record.scope === "session" || marketplace === "inline") continue
      if ((record.scope === "project" || record.scope === "local") &&
          (roots.workspace === null || !sameProject(record.projectPath!, roots.workspace, roots.platform))) continue
      const market = state.markets[marketplace]
      /* A market manifest that cannot be read says nothing about whether the
         pack is installed: the record's own cache path still answers. */
      const fromMarket = marketplaceLocation(market) === null
        ? null
        : await marketplacePack(disk, roots, json, market, name).catch(() => null)
      const source = fromMarket ?? record.installPath
      found.push({
        name, id, marketplace, scope: record.scope, version: record.version ?? "",
        enabled: effective(state.switches, id), origin: "record",
        readOnly: managed.has(id) || marketplace !== "context-hub" || !["user", "project"].includes(record.scope),
        ...(source === undefined ? {} : { source: { kind: "local", path: source } }), pack: EMPTY_PACK,
      })
      seen.add(`${id}\0${record.scope}`)
    }
  }
  return found
}
