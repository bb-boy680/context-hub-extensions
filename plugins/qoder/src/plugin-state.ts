export interface InstalledRecord extends Record<string, unknown> {
  scope: "user" | "project" | "local" | "managed"
  installPath: string
  projectPath?: string
  version?: string
  installedAt?: string
}
export interface Registry extends Record<string, unknown> {
  version: 2
  plugins: Record<string, InstalledRecord[]>
}

export interface OwnedRecord {
  scope: "user" | "project" | "local"
  projectPath?: string
  configRoot: string
  pluginsRoot: string
  installPath: string
  version: string
  installedAt: string
  snapshot: string
}
export interface Ownership extends Record<string, unknown> {
  version: 1
  plugins: Record<string, OwnedRecord[]>
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** Qoder CLI 1.1.81's installed_plugins_v2 schema; unknown fields stay intact. */
export function readRegistry(text: string | null): Registry {
  if (text === null) return { version: 2, plugins: {} }
  let value: unknown
  try { value = JSON.parse(text) } catch { throw new Error("无效 Qoder 插件注册表 JSON") }
  if (!object(value) || value.version !== 2 || !object(value.plugins)) throw new Error("不支持的 Qoder 插件注册表格式")
  const idPattern = /^[a-z0-9][-a-z0-9._]*@[a-z0-9][-a-z0-9._]*(?:\/[a-z0-9][-a-z0-9._]*)*$/i
  for (const [id, rows] of Object.entries(value.plugins)) {
    if (!idPattern.test(id) || !Array.isArray(rows)) throw new Error("无效 Qoder 插件身份或记录")
    for (const row of rows) {
      if (!object(row) || !["user", "project", "local", "managed"].includes(String(row.scope)) || typeof row.installPath !== "string") throw new Error("无效 Qoder 插件安装记录")
      for (const key of ["projectPath", "version", "installedAt", "lastUpdated", "gitCommitSha", "orgId", "displayName", "fileHash"]) {
        if (row[key] !== undefined && typeof row[key] !== "string") throw new Error(`无效 Qoder 插件字段：${key}`)
      }
      for (const key of ["userVisible", "userCanDisable"]) {
        if (row[key] !== undefined && typeof row[key] !== "boolean") throw new Error(`无效 Qoder 插件字段：${key}`)
      }
      if (row.fileSize !== undefined && (typeof row.fileSize !== "number" || !Number.isFinite(row.fileSize))) throw new Error("无效 Qoder 插件字段：fileSize")
    }
  }
  return value as Registry
}

export type InstallScope = "user" | "project" | "local"

export function readSwitches(text: string | null, parse: (text: string | null) => Record<string, unknown> | null): Record<string, boolean> {
  if (text === null) return {}
  if (text.trim() === "") throw new Error("Qoder 插件设置文件为空")
  let document: Record<string, unknown> | null
  try { document = parse(text) } catch { throw new Error("无效 Qoder 插件设置") }
  if (document === null || !object(document)) throw new Error("无效 Qoder 插件设置")
  if (!Object.hasOwn(document, "enabledPlugins")) return {}
  if (!object(document.enabledPlugins) || Object.values(document.enabledPlugins).some((value) => typeof value !== "boolean")) throw new Error("无效 Qoder 插件启用状态")
  return document.enabledPlugins as Record<string, boolean>
}

export function editSwitch(
  text: string | null, id: string, enabled: boolean | undefined,
  tools: { readJsonObject(text: string | null): Record<string, unknown> | null; editJson(text: string | null, path: readonly (string | number)[], value: unknown): string }
): string | null {
  const existing = readSwitches(text, tools.readJsonObject)
  if (enabled === undefined && !Object.hasOwn(existing, id)) return text
  let next = text
  if (text !== null && tools.readJsonObject(text)?.enabledPlugins === undefined) next = tools.editJson(text, ["enabledPlugins"], {})
  return tools.editJson(next, ["enabledPlugins", id], enabled)
}

export function effectiveSwitch(switches: Record<InstallScope, Record<string, boolean>>, id: string): boolean | undefined {
  return switches.local[id] ?? switches.project[id] ?? switches.user[id]
}

export function safePluginSegment(part: string): boolean {
  return /^[a-z0-9][a-z0-9._-]{0,127}$/i.test(part) && !part.endsWith(".") && !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)
}

export function dependenciesOf(manifest: Record<string, unknown>): string[] {
  if (manifest.dependencies === undefined) return []
  if (!Array.isArray(manifest.dependencies)) throw new Error("无效 Qoder 插件依赖")
  const name = /^[a-z0-9][-a-z0-9._]*$/i
  const reference = /^[a-z0-9][-a-z0-9._]*(@[a-z0-9][-a-z0-9._]*)?(@\^[^@]*)?$/i
  return manifest.dependencies.map((dependency) => {
    if (typeof dependency === "string" && reference.test(dependency)) return dependency.replace(/@\^[^@]*$/, "")
    if (object(dependency) && typeof dependency.name === "string" && name.test(dependency.name) &&
        (dependency.marketplace === undefined || (typeof dependency.marketplace === "string" && name.test(dependency.marketplace)))) {
      return dependency.marketplace === undefined ? dependency.name : `${dependency.name}@${dependency.marketplace}`
    }
    throw new Error("无效 Qoder 插件依赖")
  })
}

/** The native local installer requires a safe name and copies to a versioned cache. */
export function nativeManifest(text: string | null, expectedName: string): { name: string; version: string; cacheVersion: string; description: string; dependencies: string[] } {
  if (text === null) throw new Error("缺少 Qoder 原生插件清单")
  let value: unknown
  try { value = JSON.parse(text) } catch { throw new Error("无效 Qoder 原生插件清单") }
  if (!object(value) || typeof value.name !== "string" || value.name !== expectedName) throw new Error("插件清单 name 与库名称不一致")
  if (!safePluginSegment(value.name)) throw new Error("不安全的 Qoder 插件名称")
  const version = value.version === undefined ? "local" : value.version
  if (typeof version !== "string" || !/^[a-z0-9][a-z0-9._+-]{0,127}$/i.test(version)) throw new Error("不安全的 Qoder 插件版本")
  const cacheVersion = version.replace(/[^a-zA-Z0-9\-_.]/g, "-")
  if (!safePluginSegment(cacheVersion)) throw new Error("不安全的 Qoder 插件缓存版本")
  if (value.description !== undefined && typeof value.description !== "string") throw new Error("无效插件描述")
  const dependencies = dependenciesOf(value)
  return { name: value.name, version, cacheVersion, description: typeof value.description === "string" ? value.description : "", dependencies }
}

export function recordAt(registry: Registry, id: string, scope: InstallScope, workspace: string | null): InstalledRecord | undefined {
  if (!["user", "project", "local"].includes(scope)) throw new Error("不支持的插件作用域")
  if (scope !== "user" && workspace === null) throw new Error("未选择工作区")
  const rows = (registry.plugins[id] ?? []).filter((row) => row.scope === scope && (scope === "user" || row.projectPath === workspace))
  if (rows.length > 1) throw new Error("插件安装记录存在重复身份")
  return rows[0]
}

export function replaceRecord(registry: Registry, id: string, scope: InstallScope, workspace: string | null, replacement?: InstalledRecord): Registry {
  if (!/^[a-z0-9][-a-z0-9._]*@local$/i.test(id)) throw new Error("无效 Qoder 本地插件身份")
  const previous = recordAt(registry, id, scope, workspace)
  if (replacement !== undefined && (replacement.scope !== scope || (scope === "user" ? replacement.projectPath !== undefined : replacement.projectPath !== workspace))) throw new Error("插件安装记录作用域不一致")
  const next = structuredClone(registry)
  const rows = next.plugins[id] ?? []
  const index = previous === undefined ? -1 : (registry.plugins[id] ?? []).indexOf(previous)
  if (index < 0 && replacement !== undefined) rows.push(structuredClone(replacement))
  else if (index >= 0 && replacement === undefined) rows.splice(index, 1)
  else if (index >= 0 && replacement !== undefined) rows[index] = structuredClone(replacement)
  if (rows.length === 0) delete next.plugins[id]
  else next.plugins[id] = rows
  return next
}

/** The Hub's own record is separate from Qoder's registry and fails closed. */
export function readOwnership(text: string | null): Ownership {
  if (text === null) return { version: 1, plugins: {} }
  let value: unknown
  try { value = JSON.parse(text) } catch { throw new Error("无效插件归属记录") }
  if (!object(value) || value.version !== 1 || !object(value.plugins)) throw new Error("不支持的插件归属记录格式")
  if (Object.hasOwn(value, "pending")) throw new Error("存在未完成的插件事务，需要先恢复")
  for (const [id, rows] of Object.entries(value.plugins)) {
    if (!/^[a-z0-9][-a-z0-9._]*@local$/i.test(id) || !Array.isArray(rows)) throw new Error("无效插件归属身份")
    for (const row of rows) {
      if (!object(row) || !["user", "project", "local"].includes(String(row.scope))) throw new Error("无效插件归属作用域")
      for (const key of ["configRoot", "pluginsRoot", "installPath", "version", "installedAt", "snapshot"]) {
        if (typeof row[key] !== "string" || row[key] === "") throw new Error(`无效插件归属字段：${key}`)
      }
      if (!/^[a-f0-9]{64}$/.test(row.snapshot as string)) throw new Error("无效插件归属快照")
      if ((row.scope === "project" || row.scope === "local") && (typeof row.projectPath !== "string" || row.projectPath === "")) throw new Error("插件归属缺少项目路径")
      if (row.scope === "user" && row.projectPath !== undefined) throw new Error("全局插件归属不能带项目路径")
    }
  }
  return value as Ownership
}

export function samePath(a: string, b: string, platform: "win32" | "posix"): boolean {
  const normalize = (value: string) => platform === "win32" ? value.replace(/\\/g, "/").toLowerCase() : value
  return normalize(a) === normalize(b)
}

export function replaceOwnership(
  ownership: Ownership, id: string, scope: InstallScope, workspace: string | null,
  roots: { config: string; plugins: string; platform: "win32" | "posix" }, replacement?: OwnedRecord
): Ownership {
  if (!/^[a-z0-9][-a-z0-9._]*@local$/i.test(id)) throw new Error("无效插件归属身份")
  if (!["user", "project", "local"].includes(scope)) throw new Error("不支持的插件作用域")
  if (scope !== "user" && workspace === null) throw new Error("未选择工作区")
  const matches = (row: OwnedRecord) => row.scope === scope && row.projectPath === (scope === "user" ? undefined : workspace) &&
    samePath(row.configRoot, roots.config, roots.platform) && samePath(row.pluginsRoot, roots.plugins, roots.platform)
  if (replacement !== undefined && !matches(replacement)) throw new Error("插件归属作用域不一致")
  const source = ownership.plugins[id] ?? []
  const indexes = source.flatMap((row, index) => matches(row) ? [index] : [])
  if (indexes.length > 1) throw new Error("插件归属记录存在重复身份")
  const next = structuredClone(ownership)
  const rows = next.plugins[id] ?? []
  const index = indexes[0]
  if (index === undefined && replacement !== undefined) rows.push(structuredClone(replacement))
  else if (index !== undefined && replacement === undefined) rows.splice(index, 1)
  else if (index !== undefined && replacement !== undefined) rows[index] = structuredClone(replacement)
  if (rows.length === 0) delete next.plugins[id]
  else next.plugins[id] = rows
  return readOwnership(JSON.stringify(next))
}

/** An installed row is manageable only when its durable identity and content match. */
export function isOwned(
  ownership: Ownership, id: string, row: InstalledRecord,
  roots: { config: string; plugins: string; platform: "win32" | "posix" }, snapshot: string | null
): boolean {
  return (ownership.plugins[id] ?? []).some((owned) =>
    owned.scope === row.scope && owned.projectPath === row.projectPath &&
    samePath(owned.configRoot, roots.config, roots.platform) && samePath(owned.pluginsRoot, roots.plugins, roots.platform) &&
    samePath(owned.installPath, row.installPath, roots.platform) && owned.version === row.version &&
    owned.installedAt === row.installedAt && owned.snapshot === snapshot
  )
}
