import type { PluginDisk, PluginDiskRef, PluginDiskRoots } from "./contracts.ts"

export const USER = { root: "config", path: "cli/config.json" } as const
export const PROJECT = { root: "workspace", path: ".zcode/config.json" } as const
export const INSTALLED = { root: "plugins", path: "installed_plugins.json" } as const
export const KNOWN = { root: "plugins", path: "known_marketplaces.json" } as const
export const CATALOG = { root: "plugins", path: "marketplaces/context-hub/marketplace.json" } as const
export const MARKET = "context-hub"
export interface InstalledRecord extends Record<string, unknown> {
  id: string; name: string; marketplace: string; version: string; installPath: string; installedAt: string; scope: "user"
  updatedAt?: string; dependencies?: string[]
}
export interface MarketRecord extends Record<string, unknown> {
  id: string; name: string; source: Record<string, unknown>; addedAt: string; pluginCount: number
}
export interface Config {
  document: Record<string, unknown>
  plugins: Record<string, unknown>
  enabled: Record<string, boolean>
  options: Record<string, Record<string, unknown>>
}
export interface State {
  raw: { user: string | null; project: string | null; installed: string | null; known: string | null; catalog: string | null }
  user: Config; project: Config
  installed: Record<string, unknown>; records: InstalledRecord[]
  known: Record<string, unknown>; markets: MarketRecord[]
}
export function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
export function document(text: string | null, where: string): Record<string, unknown> {
  if (text === null) return {}
  let value: unknown
  try { value = JSON.parse(text) } catch { throw new Error(`无效严格 JSON：${where}`) }
  if (!object(value)) throw new Error(`JSON 必须为 object：${where}`)
  return value
}
export function segment(value: string): string {
  if (!/^[a-z0-9][a-z0-9._-]{0,127}$/.test(value) || /[. ]$/.test(value) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value)) {
    throw new Error(`不安全的插件路径段：${value}`)
  }
  return value
}
export function versionSegment(value: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$/.test(value) || value.endsWith(".") || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value)) throw new Error("不安全的插件版本")
  return value
}
export function identity(id: string): [string, string] {
  const parts = id.split("@")
  if (parts.length !== 2) throw new Error("无效插件身份")
  return [segment(parts[0]!), segment(parts[1]!)]
}
export function join(root: string, relative: string, platform: PluginDiskRoots["platform"]): string {
  const separator = platform === "win32" ? "\\" : "/"
  return `${root.replace(/[\\/]+$/, "")}${separator}${relative.split("/").join(separator)}`
}
export function samePath(first: string, second: string, platform: PluginDiskRoots["platform"]): boolean {
  const normalize = (value: string) => {
    const clean = value.replace(/\\/g, "/").replace(/\/+$/, "")
    return platform === "win32" ? clean.toLowerCase() : clean
  }
  return normalize(first) === normalize(second)
}
function text(record: Record<string, unknown>, key: string): void {
  if (typeof record[key] !== "string" || record[key] === "") throw new Error(`注册表字段无效：${key}`)
}
function optional(record: Record<string, unknown>, keys: readonly string[]): void {
  for (const key of keys) if (record[key] !== undefined && typeof record[key] !== "string") throw new Error(`注册表字段无效：${key}`)
}
function config(raw: string | null, where: string): Config {
  const root = document(raw, where)
  const plugins = root.plugins === undefined ? {} : root.plugins
  if (!object(plugins)) throw new Error(`plugins 必须为 object：${where}`)
  if (plugins.enabled !== undefined && typeof plugins.enabled !== "boolean") throw new Error(`plugins.enabled 必须为 boolean：${where}`)
  const enabled = plugins.enabledPlugins === undefined ? {} : plugins.enabledPlugins
  const options = plugins.options === undefined ? {} : plugins.options
  if (!object(enabled) || Object.values(enabled).some((value) => typeof value !== "boolean")) throw new Error(`enabledPlugins 必须为布尔映射：${where}`)
  if (!object(options) || Object.values(options).some((value) => !object(value))) throw new Error(`options 必须为对象映射：${where}`)
  return { document: root, plugins, enabled: enabled as Record<string, boolean>, options: options as Record<string, Record<string, unknown>> }
}
function installed(raw: string | null): { root: Record<string, unknown>; records: InstalledRecord[] } {
  if (raw === null) return { root: { version: 1, plugins: [] }, records: [] }
  const root = document(raw, INSTALLED.path)
  if (root.version !== 1 || !Array.isArray(root.plugins)) throw new Error("不支持 installed_plugins.json schema；仅接受 version 1 数组")
  const ids = new Set<string>()
  for (const value of root.plugins) {
    if (!object(value)) throw new Error("无效安装记录")
    for (const key of ["id", "name", "marketplace", "version", "installPath", "installedAt"]) text(value, key)
    optional(value, ["updatedAt", "cacheTransactionId"])
    const [name, market] = identity(value.id as string)
    if (value.name !== name || value.marketplace !== market || value.scope !== "user" || ids.has(value.id as string)) throw new Error("不支持重复身份或非 user 安装记录")
    if (value.dependencies !== undefined && (!Array.isArray(value.dependencies) || value.dependencies.some((one) => typeof one !== "string"))) throw new Error("安装依赖字段无效")
    ids.add(value.id as string)
  }
  return { root, records: root.plugins as InstalledRecord[] }
}
function known(raw: string | null): { root: Record<string, unknown>; markets: MarketRecord[] } {
  if (raw === null) return { root: { version: 1, marketplaces: [] }, markets: [] }
  const root = document(raw, KNOWN.path)
  if (root.version !== 1 || !Array.isArray(root.marketplaces)) throw new Error("不支持 known_marketplaces.json schema；仅接受 version 1 数组")
  const ids = new Set<string>()
  for (const value of root.marketplaces) {
    if (!object(value)) throw new Error("无效市场记录")
    for (const key of ["id", "name", "addedAt"]) text(value, key)
    optional(value, ["description", "lastUpdated", "cacheTransactionId"])
    if (!object(value.source) || typeof value.source.source !== "string" || typeof value.pluginCount !== "number" || !Number.isInteger(value.pluginCount) || value.pluginCount < 0 || ids.has(value.id as string)) throw new Error("无效市场字段")
    const source = value.source
    const required: Record<string, string[]> = { directory: ["path"], file: ["path"], git: ["url"], github: ["repo"], url: ["url"], npm: ["package"], hostPattern: ["hostPattern"], pathPattern: ["pathPattern"], settings: [] }
    const keys = required[source.source as string]
    if (keys === undefined) throw new Error("未知市场 source schema")
    for (const key of keys) text(source, key)
    if (source.source === "settings" && !object(source.marketplace)) throw new Error("无效内联市场")
    ids.add(value.id as string)
  }
  return { root, markets: root.marketplaces as MarketRecord[] }
}
export async function readState(disk: PluginDisk, roots: PluginDiskRoots): Promise<State> {
  const refs: readonly PluginDiskRef[] = [USER, INSTALLED, KNOWN, CATALOG]
  const [user, index, markets, catalog] = await Promise.all(refs.map((ref) => disk.read(roots, ref)))
  const project = roots.workspace === null ? null : await disk.read(roots, PROJECT)
  const inventory = installed(index!)
  const registry = known(markets!)
  return {
    raw: { user: user!, project, installed: index!, known: markets!, catalog: catalog! },
    user: config(user!, USER.path), project: config(project, PROJECT.path),
    installed: inventory.root, records: inventory.records, known: registry.root, markets: registry.markets,
  }
}
export function effective(state: State, id: string): boolean | undefined {
  if (state.project.plugins.enabled === false || state.user.plugins.enabled === false) return false
  return state.project.enabled[id] ?? state.user.enabled[id]
}
export function dependencies(manifest: Record<string, unknown>): string[] {
  if (manifest.dependencies === undefined) return []
  if (!Array.isArray(manifest.dependencies)) throw new Error("无法验证插件依赖")
  return manifest.dependencies.map((value) => {
    let id: string
    if (typeof value === "string" && value !== "") id = value
    else if (object(value) && typeof value.name === "string" && (value.marketplace === undefined || typeof value.marketplace === "string")) {
      id = `${value.name}${value.marketplace === undefined ? "" : `@${value.marketplace}`}`
    } else throw new Error("无法验证插件依赖")
    if (id.includes("@")) identity(id)
    else segment(id)
    return id
  })
}
