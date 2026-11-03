import type { JsonTools, PluginDisk, PluginDiskChange, PluginDiskRoots, PluginHeld, PluginInstaller, PluginTools } from "./contracts.ts"
import { ZCODE_GLOBAL_CONFIG, ZCODE_ID, ZCODE_MANIFEST, ZCODE_PLUGIN_ROOTS } from "./locations.ts"
import { CATALOG, INSTALLED, KNOWN, MARKET, USER, dependencies, document, effective, identity, join, object, readState, samePath, segment, versionSegment, type InstalledRecord, type State } from "./plugin-state.ts"

function diskOf(tools: PluginTools): PluginDisk {
  if (tools.disk === undefined || typeof tools.disk.snapshotDirectory !== "function") throw new Error("此 Hub 版本不支持 ZCode 必需的文件安装及目录快照契约")
  return tools.disk
}
function userOnly(scope: string): void {
  if (scope !== "user") throw new Error("ZCode v1 仅支持 user 插件安装和启停")
}
function writable(id: string): string {
  const [name, market] = identity(id)
  if (market !== MARKET) throw new Error("第三方、inline 与 builtin 插件只读")
  return name
}
function manifest(raw: string | null, expected: string): Record<string, unknown> {
  if (raw === null) throw new Error(`缺少原生 ${ZCODE_MANIFEST}，不支持清单回退`)
  const value = document(raw, ZCODE_MANIFEST)
  if (typeof value.name !== "string" || value.name !== expected) throw new Error("原生清单 name 与 Hub 库名不一致")
  segment(value.name)
  if (value.version !== undefined && (typeof value.version !== "string" || value.version.trim() === "")) throw new Error("原生插件 version 类型无效")
  if (value.description !== undefined && typeof value.description !== "string") throw new Error("原生插件 description 类型无效")
  return value
}
function requiredOptions(pack: Record<string, unknown>, state: State, id: string): void {
  if (pack.userConfig === undefined) return
  if (!object(pack.userConfig)) throw new Error("原生 userConfig 必须为 object")
  const options = { ...state.user.options[id], ...state.project.options[id] }
  const missing: string[] = []
  for (const [key, option] of Object.entries(pack.userConfig)) {
    if (!object(option) || (option.required !== undefined && typeof option.required !== "boolean") || (option.sensitive !== undefined && typeof option.sensitive !== "boolean")) throw new Error("userConfig schema 无效")
    if (option.type !== undefined && !["string", "number", "boolean", "directory", "file"].includes(String(option.type))) throw new Error("未知 userConfig 类型")
    const value = Object.hasOwn(options, key) ? options[key] : option.default
    if (value !== undefined) {
      const type = option.type === "directory" || option.type === "file" ? "string" : option.type
      if (!["string", "number", "boolean"].includes(typeof value) || (type !== undefined && typeof value !== type) || (typeof value === "number" && !Number.isFinite(value))) throw new Error(`userConfig 值类型无效：${key}`)
    }
    if (option.required === true && (value === undefined || value === "")) missing.push(key)
  }
  if (missing.length > 0) throw new Error(`缺少必需 userConfig：${missing.join(", ")}`)
}
function owned(record: InstalledRecord, roots: PluginDiskRoots): boolean {
  if (record.marketplace !== MARKET || typeof record.contextHubSnapshot !== "string" || !/^[a-f0-9]{64}$/.test(record.contextHubSnapshot)) return false
  const relative = `cache/${MARKET}/${segment(record.name)}/${versionSegment(record.version)}`
  return samePath(record.installPath, join(roots.plugins, relative, roots.platform), roots.platform)
}
function control(state: State, id: string, on: boolean): void {
  if (on && (state.user.plugins.enabled === false || state.project.plugins.enabled === false)) throw new Error("plugins.enabled 总门关闭；请在 ZCode 中管理控制配置")
  const override = state.project.enabled[id]
  if (override !== undefined && override !== on) throw new Error("当前项目 .zcode/config.json 覆盖 user 开关；请在 ZCode 中修改")
}
async function unchanged(disk: PluginDisk, roots: PluginDiskRoots, state: State): Promise<void> {
  if (roots.workspace !== null && await disk.read(roots, { root: "workspace", path: ".zcode/config.json" }) !== state.raw.project) throw new Error("工作区配置已变化，请重试")
}
async function notRequired(disk: PluginDisk, roots: PluginDiskRoots, state: State, id: string): Promise<void> {
  for (const other of state.records) {
    if (other.id === id || effective(state, other.id) === false) continue
    const raw = await disk.readExternal(roots, other.installPath, ZCODE_MANIFEST)
    const pack = manifest(raw, other.name)
    const required = [...dependencies(pack), ...dependencies({ dependencies: other.dependencies ?? [] })]
    if (required.some((dependency) => (dependency.includes("@") ? dependency : `${dependency}@${other.marketplace}`) === id)) {
      throw new Error(`${id} 被已启用或状态未知的 ${other.id} 依赖`)
    }
  }
  if (Array.isArray(state.user.plugins.dirs) && state.user.plugins.dirs.length > 0) throw new Error("存在 inline 插件，无法验证反向依赖；请在 ZCode 中管理")
  if (state.user.plugins.dirs !== undefined && !Array.isArray(state.user.plugins.dirs)) throw new Error("plugins.dirs schema 无效")
}

export function createZCodeInstaller(json: Pick<JsonTools, "editJson">): PluginInstaller {
  return {
    id: ZCODE_ID, label: "ZCode",
    places: [{ id: "zcode-user", label: "ZCode", scope: "global", scopeWord: "user", switchable: true, file: ZCODE_GLOBAL_CONFIG }],
    async available(tools) { await diskOf(tools).roots(ZCODE_PLUGIN_ROOTS); return true },
    async held(tools) {
      const disk = diskOf(tools)
      const roots = await disk.roots(ZCODE_PLUGIN_ROOTS)
      const state = await readState(disk, roots)
      const result: PluginHeld[] = []
      for (const record of state.records) {
        const raw = await disk.readExternal(roots, record.installPath, ZCODE_MANIFEST)
        let pack: Record<string, unknown> = {}
        if (raw !== null) pack = manifest(raw, record.name)
        result.push({
          name: record.name, id: record.id, version: record.version, scope: "user",
          enabled: raw === null ? undefined : effective(state, record.id) ?? (owned(record, roots) ? false : undefined),
          readOnly: !owned(record, roots), marketplace: record.marketplace,
          source: { kind: "local", path: record.installPath },
          pack: { name: typeof pack.name === "string" ? pack.name : "", version: typeof pack.version === "string" ? pack.version : "", description: typeof pack.description === "string" ? pack.description : "" },
        })
      }
      return result
    },
    async switches(tools) {
      const disk = diskOf(tools)
      const roots = await disk.roots(ZCODE_PLUGIN_ROOTS)
      const state = await readState(disk, roots)
      return { user: { ...state.user.enabled } }
    },
    async install(name, scope, tools) {
      userOnly(scope)
      segment(name)
      const disk = diskOf(tools)
      return disk.run(ZCODE_PLUGIN_ROOTS, async (roots) => {
        const state = await readState(disk, roots)
        const sourceSnapshot = await disk.snapshotDirectory(roots, { root: "library", path: name })
        if (sourceSnapshot === null) throw new Error("原生源包目录不存在")
        const raw = await disk.read(roots, { root: "library", path: `${name}/${ZCODE_MANIFEST}` })
        const pack = manifest(raw, name)
        const id = `${name}@${MARKET}`
        if (dependencies(pack).length > 0) throw new Error("ZCode v1 不安装有 dependencies 的插件")
        requiredOptions(pack, state, id)
        const on = state.user.enabled[id] ?? true
        if (state.user.plugins.enabled === false || state.project.plugins.enabled === false) throw new Error("plugins.enabled 总门关闭；安装前请在 ZCode 中管理控制配置")
        control(state, id, on)
        const version = versionSegment(typeof pack.version === "string" ? pack.version : "0.0.0")
        const existing = state.records.find((record) => record.id === id)
        if (existing !== undefined && !owned(existing, roots)) throw new Error("已有记录不属于 Hub 规范缓存，拒绝覆盖")
        const known = state.markets.find((market) => market.id === MARKET || market.name === MARKET)
        if (known !== undefined && (known.id !== MARKET || known.name !== MARKET || known.source.source !== "directory" || typeof known.source.path !== "string" || !samePath(known.source.path, roots.library, roots.platform))) throw new Error("context-hub 市场已指向其它来源")
        if (state.raw.catalog !== null) {
          const cached = document(state.raw.catalog, CATALOG.path)
          if (cached.name !== MARKET || !Array.isArray(cached.plugins)) throw new Error("缓存市场目录无效")
        }
        const listed = []
        for (const candidate of await tools.packs()) {
          segment(candidate.name)
          const candidateRaw = await disk.read(roots, { root: "library", path: `${candidate.name}/${ZCODE_MANIFEST}` })
          if (candidateRaw === null) continue
          const native = manifest(candidateRaw, candidate.name)
          listed.push({ name: candidate.name, source: `./${candidate.name}`, version: native.version ?? "0.0.0", description: native.description ?? "" })
        }
        if (!listed.some((entry) => entry.name === name)) throw new Error("原生插件不在 Hub 资产库")
        const catalog = { name: MARKET, description: "Plugin packs collected by Context Hub.", plugins: listed }
        const now = new Date().toISOString()
        const destination = `cache/${MARKET}/${name}/${version}`
        const location = join(roots.plugins, destination, roots.platform)
        const sameVersion = existing?.version === version
        const before = sameVersion ? existing?.contextHubSnapshot : null
        if (sameVersion && (typeof before !== "string" || !/^[a-f0-9]{64}$/.test(before))) throw new Error("缺少已安装目录快照，拒绝覆盖；请在 ZCode 中管理")
        if (sameVersion && before !== sourceSnapshot) throw new Error("同版本源内容已变化，拒绝覆盖已有缓存")
        const record = { ...existing, id, name, marketplace: MARKET, version, installPath: location, installedAt: existing?.installedAt ?? now, updatedAt: now, scope: "user", source: `./${name}`, contextHubSnapshot: sourceSnapshot }
        const records = existing === undefined ? [...state.records, record] : state.records.map((one) => one.id === id ? record : one)
        const market = { ...known, id: MARKET, name: MARKET, source: { ...(known?.source ?? {}), source: "directory", path: roots.library }, addedAt: known?.addedAt ?? now, pluginCount: listed.length, lastUpdated: now }
        const markets = known === undefined ? [...state.markets, market] : state.markets.map((one) => one === known ? market : one)
        const changes: PluginDiskChange[] = [
          { ref: INSTALLED, before: state.raw.installed, after: json.editJson(state.raw.installed ?? JSON.stringify(state.installed), ["plugins"], records) },
          { ref: KNOWN, before: state.raw.known, after: json.editJson(state.raw.known ?? JSON.stringify(state.known), ["marketplaces"], markets) },
          { ref: CATALOG, before: state.raw.catalog, after: `${JSON.stringify(catalog, null, 2)}\n` },
          { ref: USER, before: state.raw.user, after: json.editJson(state.raw.user, ["plugins", "enabledPlugins", id], on) },
        ]
        await unchanged(disk, roots, state)
        if (await disk.read(roots, { root: "library", path: `${name}/${ZCODE_MANIFEST}` }) !== raw) throw new Error("源清单已变化，请重试")
        await tools.syncMarketplace([{ path: ".claude-plugin/marketplace.json", document: catalog }])
        await disk.commit(roots, changes, { name, destination, manifests: [ZCODE_MANIFEST], sourceSnapshot, before: before as string | null })
        return { message: `${id} 已安装到 ZCode user`, location }
      })
    },
    async remove(id, scope, tools) {
      userOnly(scope)
      writable(id)
      const disk = diskOf(tools)
      return disk.run(ZCODE_PLUGIN_ROOTS, async (roots) => {
        const state = await readState(disk, roots)
        const record = state.records.find((one) => one.id === id)
        if (record === undefined || !owned(record, roots)) throw new Error("插件不属于 Hub 规范缓存")
        await notRequired(disk, roots, state, id)
        await unchanged(disk, roots, state)
        const snapshot = record.contextHubSnapshot
        if (typeof snapshot !== "string" || !/^[a-f0-9]{64}$/.test(snapshot)) throw new Error("缺少已安装目录快照，拒绝删除；请在 ZCode 中管理")
        const relative = `cache/${MARKET}/${record.name}/${versionSegment(record.version)}`
        await disk.commit(roots, [
          { ref: INSTALLED, before: state.raw.installed, after: json.editJson(state.raw.installed!, ["plugins"], state.records.filter((one) => one.id !== id)) },
          { ref: USER, before: state.raw.user, after: json.editJson(state.raw.user, ["plugins", "enabledPlugins", id], undefined) },
        ], undefined, { ref: { root: "plugins", path: relative }, before: snapshot })
        return { message: `${id} 已卸载；data、options、项目覆盖和旧版本缓存保留` }
      })
    },
    async setEnabled(id, scope, on, tools) {
      userOnly(scope)
      writable(id)
      const disk = diskOf(tools)
      return disk.run(ZCODE_PLUGIN_ROOTS, async (roots) => {
        const state = await readState(disk, roots)
        const record = state.records.find((one) => one.id === id)
        if (record === undefined || !owned(record, roots)) throw new Error("插件不属于 Hub 规范缓存")
        control(state, id, on)
        if (!on) await notRequired(disk, roots, state, id)
        await unchanged(disk, roots, state)
        await disk.commit(roots, [{ ref: USER, before: state.raw.user, after: json.editJson(state.raw.user, ["plugins", "enabledPlugins", id], on) }])
        return { message: `${id} user 开关已${on ? "开启" : "关闭"}` }
      })
    },
  }
}
