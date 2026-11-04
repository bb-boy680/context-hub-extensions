import type { McpTools, PluginDisk, PluginDiskChange, PluginDiskRef, PluginDiskRoots, PluginHeld, PluginInstaller, PluginInstallReport, PluginJournalCommit, PluginTools } from "./contracts.ts"
import { QODER_ID, QODER_MANIFEST, QODER_PLUGIN_PLACES, QODER_PLUGIN_ROOTS } from "./locations.ts"
import { dependenciesOf, editSwitch, effectiveSwitch, isOwned, nativeManifest, readOwnership, readRegistry, readSwitches, recordAt, replaceOwnership, replaceRecord, safePluginSegment, samePath, type InstallScope, type Ownership, type Registry } from "./plugin-state.ts"

export const REGISTRY: PluginDiskRef = { root: "plugins", path: "installed_plugins_v2.json" }
export const OWNERSHIP: PluginDiskRef = { root: "library", path: ".installer-ownership/qoder.json" }
export const SETTINGS: Record<InstallScope, PluginDiskRef> = {
  user: { root: "config", path: "settings.json" },
  project: { root: "workspace", path: ".qoder/settings.json" },
  local: { root: "workspace", path: ".qoder/settings.local.json" },
}

export interface QoderPluginState {
  registry: Registry
  ownership: Ownership
  switches: Record<InstallScope, Record<string, boolean>>
  raw: { registry: string | null; ownership: string | null; user: string | null; project: string | null; local: string | null }
}

export async function loadPluginState(disk: PluginDisk, roots: PluginDiskRoots, json: Pick<McpTools, "readJsonObject">): Promise<QoderPluginState> {
  const [registry, ownership, user, project, local] = await Promise.all([
    disk.read(roots, REGISTRY), disk.read(roots, OWNERSHIP), disk.read(roots, SETTINGS.user),
    roots.workspace === null ? null : disk.read(roots, SETTINGS.project),
    roots.workspace === null ? null : disk.read(roots, SETTINGS.local),
  ])
  return {
    registry: readRegistry(registry), ownership: readOwnership(ownership),
    switches: {
      user: readSwitches(user, json.readJsonObject), project: readSwitches(project, json.readJsonObject), local: readSwitches(local, json.readJsonObject),
    },
    raw: { registry, ownership, user, project, local },
  }
}

function applies(row: Registry["plugins"][string][number], roots: PluginDiskRoots): boolean {
  if (row.scope === "user" || row.scope === "managed") return true
  if (roots.workspace === null) return false
  if (row.projectPath === undefined) return true
  if (roots.platform === "posix" ? !row.projectPath.startsWith("/") : !/^(?:[a-z]:[\\/]|[\\/]{2})/i.test(row.projectPath)) return true
  const normalize = (value: string) => roots.platform === "win32" ? value.replace(/\\/g, "/").toLowerCase() : value
  const parent = normalize(row.projectPath).replace(/\/+$/, "")
  const current = normalize(roots.workspace).replace(/\/+$/, "")
  return current === parent || current.startsWith(`${parent}/`)
}

async function dependenciesAt(disk: PluginDisk, roots: PluginDiskRoots, directory: string): Promise<string[]> {
  const raw = await disk.readExternal(roots, directory, QODER_MANIFEST)
  if (raw === null) return []
  let document: unknown
  try { document = JSON.parse(raw) } catch { throw new Error("无法验证插件依赖清单") }
  if (typeof document !== "object" || document === null || Array.isArray(document)) throw new Error("无法验证插件依赖清单")
  return dependenciesOf(document as Record<string, unknown>)
}

async function verifyDependencies(disk: PluginDisk, roots: PluginDiskRoots, state: QoderPluginState, id: string, direct: readonly string[]): Promise<void> {
  const visiting = new Set([id]), checked = new Set<string>()
  const visit = async (dependency: string, market: string): Promise<void> => {
    const target = dependency.includes("@") ? dependency : `${dependency}@${market}`
    if (visiting.has(target)) throw new Error(`插件依赖存在循环：${target}`)
    if (checked.has(target)) return
    const rows = (state.registry.plugins[target] ?? []).filter((row) => applies(row, roots))
    if (rows.length === 0 || enabledAt(state, target) !== true) throw new Error(`插件依赖未安装或未启用：${target}`)
    const rank: Record<string, number> = { managed: 0, local: 1, project: 2, user: 3 }
    rows.sort((a, b) => rank[a.scope]! - rank[b.scope]!)
    visiting.add(target)
    const nested = await dependenciesAt(disk, roots, rows[0]!.installPath)
    for (const one of nested) await visit(one, target.slice(target.indexOf("@") + 1))
    visiting.delete(target)
    checked.add(target)
  }
  for (const dependency of direct) await visit(dependency, "local")
}

async function assertNoDependents(disk: PluginDisk, roots: PluginDiskRoots, state: QoderPluginState, target: string, scope: InstallScope): Promise<void> {
  for (const [id, rows] of Object.entries(state.registry.plugins)) {
    if (id === target || (scope !== "user" && enabledAt(state, id) === false)) continue
    for (const row of rows) {
      if (scope !== "user" && !applies(row, roots)) continue
      const dependencies = await dependenciesAt(disk, roots, row.installPath)
      const market = id.slice(id.indexOf("@") + 1)
      if (dependencies.some((dependency) => (dependency.includes("@") ? dependency : `${dependency}@${market}`) === target)) {
        throw new Error(`插件仍被 ${id} 依赖`)
      }
    }
  }
}

export async function prepareInstall(disk: PluginDisk, roots: PluginDiskRoots, state: QoderPluginState, name: string, scope: InstallScope) {
  if (!safePluginSegment(name)) throw new Error("不安全的 Qoder 插件名称")
  const id = `${name}@local`
  const previous = recordAt(state.registry, id, scope, roots.workspace)
  const records = state.registry.plugins[id] ?? []
  if (records.some((row) => row.scope === "managed")) throw new Error("受管理插件不能由 Hub 覆盖")
  const identities = new Set<string>()
  for (const row of records) {
    const identity = JSON.stringify([row.scope, row.scope === "user" ? null : row.projectPath ?? null])
    if (identities.has(identity)) throw new Error("插件安装记录存在重复身份")
    identities.add(identity)
    if (!await ownedAt(disk, roots, state, id, row)) throw new Error("已有同名插件无法证明归属，拒绝覆盖")
  }
  const raw = await disk.read(roots, { root: "library", path: `${name}/${QODER_MANIFEST}` })
  const manifest = nativeManifest(raw, name)
  await verifyDependencies(disk, roots, state, id, manifest.dependencies)
  const sourceSnapshot = await disk.snapshotDirectory(roots, { root: "library", path: name })
  if (sourceSnapshot === null) throw new Error("插件库源目录不存在")
  const destination = `cache/local/${name}/${manifest.cacheVersion}`
  const before = await disk.snapshotDirectory(roots, { root: "plugins", path: destination })
  if (before !== null) {
    let owned = false
    for (const row of state.registry.plugins[id] ?? []) {
      if (row.version === manifest.version && await ownedAt(disk, roots, state, id, row)) { owned = true; break }
    }
    if (!owned) throw new Error("同名插件缓存无法证明归属，拒绝覆盖")
    if (before !== sourceSnapshot) throw new Error("同版本插件内容已变化，拒绝覆盖共享缓存")
  }
  return { id, previous, manifest, sourceSnapshot, destination, before, raw }
}

export function installChanges(
  roots: PluginDiskRoots, state: QoderPluginState, scope: InstallScope,
  plan: Awaited<ReturnType<typeof prepareInstall>>, timestamp: string,
  json: Pick<McpTools, "editJson" | "readJsonObject">
) {
  if (timestamp === "") throw new Error("缺少插件安装时间")
  const separator = roots.platform === "win32" ? "\\" : "/"
  const installPath = `${roots.plugins.replace(/[\\/]+$/, "")}${separator}${plan.destination.split("/").join(separator)}`
  const installedAt = plan.previous?.installedAt ?? timestamp
  const row = {
    ...plan.previous, scope, installPath, version: plan.manifest.version, installedAt,
    ...(scope === "user" ? {} : { projectPath: roots.workspace! }),
  }
  const owner = {
    scope, ...(scope === "user" ? {} : { projectPath: roots.workspace! }),
    configRoot: roots.config, pluginsRoot: roots.plugins, installPath,
    version: plan.manifest.version, installedAt, snapshot: plan.sourceSnapshot,
  }
  const registry = replaceRecord(state.registry, plan.id, scope, roots.workspace, row)
  const ownership = replaceOwnership(state.ownership, plan.id, scope, roots.workspace, roots, owner)
  const on = state.switches[scope][plan.id] ?? true
  const settings = editSwitch(state.raw[scope], plan.id, on, json)
  return { registry, ownership, settings, installPath }
}

export async function prepareSetEnabled(
  disk: PluginDisk, roots: PluginDiskRoots, state: QoderPluginState, id: string, scope: InstallScope, on: boolean,
  json: Pick<McpTools, "editJson" | "readJsonObject">
) {
  if (!id.endsWith("@local") || !safePluginSegment(id.slice(0, -"@local".length))) throw new Error("第三方插件由 Qoder 管理")
  if (!["user", "project", "local"].includes(scope) || typeof on !== "boolean") throw new Error("无效插件开关参数")
  if (scope !== "user" && roots.workspace === null) throw new Error("未选择工作区")
  const installed = state.registry.plugins[id] ?? []
  const records = installed.filter((row) =>
    scope === "user" ? row.scope === "user" : applies(row, roots))
  if (records.length === 0) throw new Error(installed.length === 0 ? "插件未安装" : "不能扩大或改变插件作用域")
  for (const row of records) {
    if (!await ownedAt(disk, roots, state, id, row)) throw new Error("插件无法证明归属，拒绝修改")
  }
  const order: Record<InstallScope, number> = { user: 0, project: 1, local: 2 }
  const candidates = records.filter((row) => {
    if (row.scope === "managed") return false
    return order[row.scope] <= order[scope] && applies(row, roots)
  })
  if (candidates.length === 0) throw new Error("此作用域没有可管理的插件")
  if (on) {
    const row = candidates.sort((a, b) => order[b.scope as InstallScope] - order[a.scope as InstallScope])[0]!
    const raw = await disk.readExternal(roots, row.installPath, QODER_MANIFEST)
    const manifest = nativeManifest(raw, id.slice(0, -"@local".length))
    await verifyDependencies(disk, roots, state, id, manifest.dependencies)
  } else await assertNoDependents(disk, roots, state, id, scope)
  return { settings: editSwitch(state.raw[scope], id, on, json) }
}

export async function prepareRemove(
  disk: PluginDisk, roots: PluginDiskRoots, state: QoderPluginState, id: string, scope: InstallScope,
  json: Pick<McpTools, "editJson" | "readJsonObject">
) {
  if (!id.endsWith("@local")) throw new Error("第三方插件由 Qoder 管理")
  const name = id.slice(0, -"@local".length)
  if (!safePluginSegment(name)) throw new Error("无效 Qoder 本地插件身份")
  const row = recordAt(state.registry, id, scope, roots.workspace)
  if (row === undefined || !await ownedAt(disk, roots, state, id, row)) throw new Error("插件无法证明归属，拒绝卸载")
  await assertNoDependents(disk, roots, state, id, scope)
  const manifest = nativeManifest(JSON.stringify({ name, version: row.version }), name)
  const destination = `cache/local/${name}/${manifest.cacheVersion}`
  const before = await disk.snapshotDirectory(roots, { root: "plugins", path: destination })
  if (!isOwned(state.ownership, id, row, roots, before)) throw new Error("插件目录已变化，请重试")
  const registry = replaceRecord(state.registry, id, scope, roots.workspace)
  const ownership = replaceOwnership(state.ownership, id, scope, roots.workspace, roots)
  const stillReferenced = Object.values(registry.plugins).some((rows) => rows.some((other) => samePath(other.installPath, row.installPath, roots.platform)))
  return {
    destination, before, removeDirectory: !stillReferenced,
    registry, ownership, settings: editSwitch(state.raw[scope], id, undefined, json),
  }
}

export const PENDING: PluginDiskRef = { root: "library", path: ".installer-ownership/qoder-transactions" }

/** Prepared journal data stays in the Hub's private transaction directory. */
export function journalRecipe(
  roots: PluginDiskRoots, operation: "install" | "remove" | "setEnabled", id: string, scope: InstallScope,
  changes: readonly PluginDiskChange[], artifact?: { operation: "copy" | "remove"; name: string; destination: string; before: string | null; sourceSnapshot?: string }
): PluginJournalCommit | null {
  const changed = changes.filter((change) => change.before !== change.after && change.after !== null)
  if (changed.length === 0) {
    if (artifact !== undefined || changes.some((change) => change.before !== change.after)) throw new Error("无法确定插件事务提交点")
    return null
  }
  const commit = changed.find((change) => change.ref.root === OWNERSHIP.root && change.ref.path === OWNERSHIP.path) ?? changed[0]!
  const transactionId = globalThis.crypto.randomUUID()
  const journalRef: PluginDiskRef = { root: "library", path: `.installer-ownership/qoder-transactions/${transactionId}.json` }
  const backup: PluginDiskRef | undefined = artifact === undefined ? undefined : { root: "plugins", path: `cache/local/${artifact.name}/hub-${transactionId}-backup` }
  const staging: PluginDiskRef | undefined = artifact?.operation === "copy" ? { root: "plugins", path: `cache/local/${artifact.name}/hub-${transactionId}-staging` } : undefined
  const payload = {
    version: 1, transactionId, operation, id, scope,
    roots: { config: roots.config, plugins: roots.plugins, workspace: roots.workspace, library: roots.library },
    files: changes.map((change) => ({ ref: change.ref, beforeExists: change.before !== null, afterExists: change.after !== null, changed: change.before !== change.after })),
    artifact: artifact === undefined ? undefined : { ...artifact, backup, staging },
  }
  const phase = (value: string) => JSON.stringify({ ...payload, phase: value })
  return {
    pending: PENDING,
    journal: { ref: journalRef, prepared: phase("prepared"), swapped: phase("artifact_swapped"), committed: phase("committed") },
    before: changes.filter((change) => change !== commit), commit, after: [],
    ...(artifact === undefined ? {} : { artifact: { ...artifact, backup: backup!, ...(staging === undefined ? {} : { staging }), manifests: [QODER_MANIFEST] } }),
  }
}

/** Only a native local record with a matching Hub snapshot can be modified. */
export async function ownedAt(
  disk: PluginDisk, roots: PluginDiskRoots, state: QoderPluginState, id: string,
  row: Registry["plugins"][string][number]
): Promise<boolean> {
  const suffix = "@local"
  if (!id.endsWith(suffix) || row.version === undefined) return false
  const name = id.slice(0, -suffix.length)
  let cacheVersion: string
  try { cacheVersion = nativeManifest(JSON.stringify({ name, version: row.version }), name).cacheVersion }
  catch { return false }
  const relative = `cache/local/${name}/${cacheVersion}`
  const separator = roots.platform === "win32" ? "\\" : "/"
  const expected = `${roots.plugins.replace(/[\\/]+$/, "")}${separator}${relative.split("/").join(separator)}`
  if (!samePath(row.installPath, expected, roots.platform)) return false
  const snapshot = await disk.snapshotDirectory(roots, { root: "plugins", path: relative })
  return isOwned(state.ownership, id, row, roots, snapshot)
}

export function enabledAt(state: QoderPluginState, id: string): boolean | undefined {
  return effectiveSwitch(state.switches, id)
}

/** Inventory is client-reported; a missing Hub ownership proof makes it read-only. */
export async function listInstalled(disk: PluginDisk, roots: PluginDiskRoots, state: QoderPluginState): Promise<PluginHeld[]> {
  const result: PluginHeld[] = []
  for (const [id, records] of Object.entries(state.registry.plugins)) {
    const at = id.indexOf("@"), name = id.slice(0, at), marketplace = id.slice(at + 1)
    for (const row of records) {
      if ((row.scope === "project" || row.scope === "local") && (roots.workspace === null || row.projectPath !== roots.workspace)) continue
      const duplicates = records.filter((one) => one.scope === row.scope && (row.scope === "user" || row.scope === "managed" || one.projectPath === row.projectPath)).length > 1
      let own = false
      if (!duplicates && row.scope !== "managed") {
        try { own = await ownedAt(disk, roots, state, id, row) } catch { own = false }
      }
      let pack = { name: "", version: "", description: "" }
      try {
        const text = await disk.readExternal(roots, row.installPath, QODER_MANIFEST)
        if (text !== null) {
          const parsed: unknown = JSON.parse(text)
          if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
            const fields = parsed as Record<string, unknown>
            pack = { name: typeof fields.name === "string" ? fields.name : "", version: typeof fields.version === "string" ? fields.version : "", description: typeof fields.description === "string" ? fields.description : "" }
          }
        }
      } catch { /* A missing or unreadable manifest leaves metadata unknown. */ }
      result.push({
        name, id, scope: row.scope, version: row.version ?? "", marketplace,
        enabled: enabledAt(state, id), readOnly: !own,
        source: { kind: "local", path: row.installPath }, pack,
      })
    }
  }
  return result
}

type TransactionDisk = PluginDisk & Required<Pick<PluginDisk, "list" | "journalCommit">>
function diskOf(tools: PluginTools): TransactionDisk {
  const disk = tools.disk
  if (disk === undefined || typeof disk.list !== "function" || typeof disk.journalCommit !== "function") {
    throw new Error("此 Hub 版本缺少 Qoder 所需的插件文件事务能力")
  }
  return disk as TransactionDisk
}

async function ready(disk: TransactionDisk, roots: PluginDiskRoots): Promise<void> {
  const declared = roots.declaration
  if (JSON.stringify(declared.copyExcludeTop) !== JSON.stringify(QODER_PLUGIN_ROOTS.copyExcludeTop) ||
      JSON.stringify(declared.copyRejectNested) !== JSON.stringify(QODER_PLUGIN_ROOTS.copyRejectNested) || declared.lease === undefined) {
    throw new Error("此 Hub 版本缺少 Qoder 所需的安全复制过滤或事务租约")
  }
  if ((await disk.list(roots, PENDING)).length > 0) throw new Error("存在未完成的 Qoder 插件事务；日志不含配置原文，请检查事务目录并手动恢复")
}

async function withTransaction(disk: TransactionDisk, work: (roots: PluginDiskRoots) => Promise<PluginInstallReport>): Promise<PluginInstallReport> {
  let result: PluginInstallReport | undefined
  try {
    return await disk.run(QODER_PLUGIN_ROOTS, async (roots) => {
      await ready(disk, roots)
      result = await work(roots)
      return result
    })
  } catch (error) {
    if (result === undefined) throw error
    return { ...result, warning: [result.warning, `事务租约释放失败：${String(error)}`].filter(Boolean).join("\n") }
  }
}

function requireSafeSettingsWrite(roots: PluginDiskRoots, before: string | null, after: string | null): void {
  if (roots.platform === "win32" && before !== null && before !== after) {
    throw new Error("无法确认 Windows 设置文件的原有 ACL 会被保留，拒绝替换可能含凭据的文件")
  }
}

function report(message: string, warnings: readonly string[], location?: string): PluginInstallReport {
  return { message, ...(location === undefined ? {} : { location }), ...(warnings.length === 0 ? {} : { warning: warnings.join("\n") }) }
}

export function createQoderInstaller(json: Pick<McpTools, "editJson" | "readJsonObject">): PluginInstaller {
  return {
    id: QODER_ID, label: "Qoder CLI", places: QODER_PLUGIN_PLACES,
    async available(tools) {
      if (tools.disk === undefined || typeof tools.disk.list !== "function" || typeof tools.disk.journalCommit !== "function") return false
      const disk = diskOf(tools), roots = await disk.roots(QODER_PLUGIN_ROOTS)
      await ready(disk, roots)
      return true
    },
    async held(tools) {
      const disk = diskOf(tools), roots = await disk.roots(QODER_PLUGIN_ROOTS)
      await ready(disk, roots)
      return listInstalled(disk, roots, await loadPluginState(disk, roots, json))
    },
    async switches(tools) {
      const disk = diskOf(tools), roots = await disk.roots(QODER_PLUGIN_ROOTS)
      await ready(disk, roots)
      return (await loadPluginState(disk, roots, json)).switches
    },
    async install(name, scope, tools) {
      const disk = diskOf(tools)
      return withTransaction(disk, async (roots) => {
        const state = await loadPluginState(disk, roots, json)
        const plan = await prepareInstall(disk, roots, state, name, scope)
        const next = installChanges(roots, state, scope, plan, new Date().toISOString(), json)
        requireSafeSettingsWrite(roots, state.raw[scope], next.settings)
        const changes: PluginDiskChange[] = [
          { ref: REGISTRY, before: state.raw.registry, after: `${JSON.stringify(next.registry, null, 2)}\n` },
          { ref: SETTINGS[scope], before: state.raw[scope], after: next.settings },
          { ref: OWNERSHIP, before: state.raw.ownership, after: `${JSON.stringify(next.ownership, null, 2)}\n` },
        ]
        const artifact = plan.before === plan.sourceSnapshot ? undefined : { operation: "copy" as const, name, destination: plan.destination, before: plan.before, sourceSnapshot: plan.sourceSnapshot }
        const recipe = journalRecipe(roots, "install", plan.id, scope, changes, artifact)
        if (recipe === null) return report(`${plan.id} 已安装`, [], next.installPath)
        const result = await disk.journalCommit(roots, recipe)
        return report(`${plan.id} 已安装`, result.warnings, next.installPath)
      })
    },
    async remove(id, scope, tools) {
      const disk = diskOf(tools)
      return withTransaction(disk, async (roots) => {
        const state = await loadPluginState(disk, roots, json)
        const plan = await prepareRemove(disk, roots, state, id, scope, json)
        requireSafeSettingsWrite(roots, state.raw[scope], plan.settings)
        const changes: PluginDiskChange[] = [
          { ref: REGISTRY, before: state.raw.registry, after: `${JSON.stringify(plan.registry, null, 2)}\n` },
          { ref: SETTINGS[scope], before: state.raw[scope], after: plan.settings },
          { ref: OWNERSHIP, before: state.raw.ownership, after: `${JSON.stringify(plan.ownership, null, 2)}\n` },
        ]
        const artifact = plan.removeDirectory ? { operation: "remove" as const, name: id.slice(0, -"@local".length), destination: plan.destination, before: plan.before } : undefined
        const recipe = journalRecipe(roots, "remove", id, scope, changes, artifact)
        if (recipe === null) throw new Error("插件卸载事务没有变更")
        const result = await disk.journalCommit(roots, recipe)
        return report(`${id} 已卸载；插件数据保留`, result.warnings)
      })
    },
    async setEnabled(id, scope, on, tools) {
      const disk = diskOf(tools)
      return withTransaction(disk, async (roots) => {
        const state = await loadPluginState(disk, roots, json)
        const next = await prepareSetEnabled(disk, roots, state, id, scope, on, json)
        requireSafeSettingsWrite(roots, state.raw[scope], next.settings)
        const changes: PluginDiskChange[] = [
          { ref: REGISTRY, before: state.raw.registry, after: state.raw.registry },
          { ref: OWNERSHIP, before: state.raw.ownership, after: state.raw.ownership },
          { ref: SETTINGS[scope], before: state.raw[scope], after: next.settings },
        ]
        const recipe = journalRecipe(roots, "setEnabled", id, scope, changes)
        if (recipe === null) return report(`${id} 状态未变化`, [])
        const result = await disk.journalCommit(roots, recipe)
        return report(`${id} 已${on ? "启用" : "停用"}`, result.warnings)
      })
    },
  }
}
