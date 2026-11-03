import type { McpTools, PluginDisk, PluginDiskRoots, PluginHeld, PluginInstallScope, PluginInstaller, PluginTools } from "./contracts.ts"
import { COPILOT_ID } from "./locations.ts"
import { object, validatePlugin } from "./plugin-format.ts"

const MARKET = "context-hub"
const USER = { root: "config", path: "settings.json" } as const
const PROJECT = { root: "workspace", path: ".github/copilot/settings.json" } as const
const LOCAL = { root: "workspace", path: ".github/copilot/settings.local.json" } as const
const CLAUDE = [{ root: "workspace", path: ".claude/settings.json" }, { root: "workspace", path: ".claude/settings.local.json" }] as const
const SCOPE = {
  home: ".copilot", homeEnv: "COPILOT_HOME", state: "installed-plugins",
  config: { read: ["settings.local.json"], write: ["settings.json"] },
  stateFiles: { read: ["**"], write: [] }, // 根目录与子目录的列举共用读取范围。
  workspace: { read: [LOCAL.path, ...CLAUDE.map((ref) => ref.path)], write: [PROJECT.path] },
  library: { read: ["marketplace.json", "*/plugin.json", "*/mcp.json"], write: [] }, external: [],
} as const
const blank = { name: "", version: "", description: "" }
const empty = (v: unknown): Record<string, unknown> => object(v) ? v : {}
const join = (root: string, part: string, platform: string) => `${root.replace(/[\\/]+$/, "")}${platform === "win32" ? "\\" : "/"}${part}`
const samePath = (a: string, b: string, platform: string) => {
  const norm = (v: string) => v.replace(/^\\\\\?\\/, "").replace(/\\/g, "/").replace(/\/+$/, "")
  return platform === "win32" ? norm(a).toLowerCase() === norm(b).toLowerCase() : norm(a) === norm(b)
}
const identity = (id: string) => {
  const match = /^([a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)@([a-z0-9][a-z0-9.-]*)$/.exec(id)
  if (!match || match[1]!.includes("..") || match[1]!.includes("--")) throw new Error(`Invalid plugin identity: ${id}`)
  return { name: match[1]!, market: match[2]! }
}
const writable = (id: string) => {
  const parsed = identity(id)
  if (parsed.market !== MARKET) throw new Error("Plugin belongs to another marketplace")
  return parsed.name
}
const checkScope = (scope: PluginInstallScope) => {
  if (scope !== "user" && scope !== "project") throw new Error("Unsupported scope")
}
const diskOf = (tools: PluginTools): PluginDisk => {
  if (!tools.disk) throw new Error("Plugin file access is unavailable")
  return tools.disk
}

export function createCopilotInstaller(json: Pick<McpTools, "readJsonObject" | "editJson">): PluginInstaller {
  const parse = (text: string | null) => json.readJsonObject(text) ?? {}
  const edit = (text: string, key: string, id: string, value: unknown) => {
    let result = text
    if (value !== undefined && parse(result)[key] === undefined && result.trim()) result = json.editJson(result, [key], {})
    return json.editJson(result, [key, id], value)
  }
  const readSettings = async (disk: PluginDisk, roots: PluginDiskRoots) => {
    const userText = await disk.read(roots, USER)
    const projectText = roots.workspace ? await disk.read(roots, PROJECT) : null
    const localText = roots.workspace ? await disk.read(roots, LOCAL) : null
    const userLocalText = await disk.read(roots, { root: "config", path: "settings.local.json" })
    const compatTexts = roots.workspace ? await Promise.all(CLAUDE.map((ref) => disk.read(roots, ref))) : []
    return { userText, projectText, user: parse(userText), project: parse(projectText), local: parse(localText), userLocal: parse(userLocalText), compat: compatTexts.map(parse) }
  }
  const entries = (doc: Record<string, unknown>) => empty(doc.enabledPlugins)
  const checkMaps = (doc: Record<string, unknown>) => {
    for (const key of ["enabledPlugins", "extraKnownMarketplaces"]) if (doc[key] !== undefined && !object(doc[key])) throw new Error(`Invalid ${key} settings`)
  }
  const checkSettings = (s: Awaited<ReturnType<typeof readSettings>>) => {
    for (const doc of [s.user, s.project, s.local, s.userLocal, ...s.compat]) checkMaps(doc)
  }
  const checkShadow = (s: Awaited<ReturnType<typeof readSettings>>, id: string, scope: PluginInstallScope) => {
    for (const [file, doc] of [["settings.local.json", s.userLocal], [".github/copilot/settings.local.json", s.local], ...s.compat.map((x, i) => [CLAUDE[i]!.path, x] as const)] as const) {
      if (Object.hasOwn(entries(doc), id) || Object.hasOwn(empty(doc.extraKnownMarketplaces), MARKET)) throw new Error(`Plugin state is controlled by ${file}`)
    }
    if (Object.hasOwn(empty(s.project.extraKnownMarketplaces), MARKET)) throw new Error("Marketplace is controlled by .github/copilot/settings.json")
    if (scope === "user" && Object.hasOwn(entries(s.project), id)) throw new Error("Plugin state is controlled by .github/copilot/settings.json")
  }
  const marketPath = (user: Record<string, unknown>): string | null => {
    const value = empty(empty(user.extraKnownMarketplaces)[MARKET])
    const source = empty(value.source)
    return source.source === "directory" && typeof source.path === "string" ? source.path : null
  }
  const checkMarket = (s: Awaited<ReturnType<typeof readSettings>>, roots: PluginDiskRoots) => {
    const market = empty(s.user.extraKnownMarketplaces)[MARKET]
    if (market !== undefined && (marketPath(s.user) === null || !samePath(marketPath(s.user)!, roots.library, roots.platform))) throw new Error("Marketplace points to another directory")
  }
  const pack = async (disk: PluginDisk, roots: PluginDiskRoots, name: string) => validatePlugin(await disk.read(roots, { root: "library", path: `${name}/plugin.json` }), await disk.read(roots, { root: "library", path: `${name}/mcp.json` }), name)
  const sourceAvailable = async (disk: PluginDisk, roots: PluginDiskRoots, name: string, path: string | null) => {
    if (path === null || !samePath(path, roots.library, roots.platform)) return false
    try {
      const raw = await disk.read(roots, { root: "library", path: "marketplace.json" })
      if (raw === null) return false
      const index = parse(raw)
      if (index.name !== MARKET || !Array.isArray(index.plugins) || !index.plugins.some((v) => object(v) && v.name === name && v.source === `./${name}`)) return false
      await pack(disk, roots, name)
      return true
    } catch { return false }
  }
  const checkWritableSource = async (disk: PluginDisk, roots: PluginDiskRoots, s: Awaited<ReturnType<typeof readSettings>>, name: string) => {
    checkMarket(s, roots)
    if (!await sourceAvailable(disk, roots, name, marketPath(s.user))) throw new Error("Plugin source is unavailable")
  }
  return {
    id: COPILOT_ID, label: "GitHub Copilot",
    places: [
      { id: "copilot-plugin-user", label: "Copilot", scope: "global", scopeWord: "user", switchable: true, file: ".copilot/settings.json" },
      { id: "copilot-plugin-project", label: "Copilot", scope: "workspace", scopeWord: "project", switchable: true, file: ".github/copilot/settings.json", overrides: ["user"] },
    ],
    async available(tools) { try { await diskOf(tools).roots(SCOPE); return true } catch { return false } },
    async switches(tools) {
      const disk = diskOf(tools), roots = await disk.roots(SCOPE), s = await readSettings(disk, roots)
      return Object.fromEntries([["user", s.user], ["project", s.project]].map(([key, doc]) => [key, Object.fromEntries(Object.entries(entries(doc as Record<string, unknown>)).filter(([, v]) => typeof v === "boolean"))]))
    },
    async held(tools) {
      const disk = diskOf(tools), roots = await disk.roots(SCOPE), s = await readSettings(disk, roots), result: PluginHeld[] = []
      const marketplacePath = marketPath(s.user)
      for (const [scope, doc] of [["user", s.user], ["project", s.project]] as const) {
        for (const [id, value] of Object.entries(entries(doc))) {
          if (typeof value !== "boolean") continue
          let parsed: ReturnType<typeof identity>
          try { parsed = identity(id) } catch { continue }
          const source = parsed.market === MARKET
            ? (marketplacePath ? join(marketplacePath, parsed.name, roots.platform) : join(roots.library, parsed.name, roots.platform))
            : join(join(roots.plugins, parsed.market, roots.platform), parsed.name, roots.platform)
          const available = parsed.market === MARKET && await sourceAvailable(disk, roots, parsed.name, marketplacePath)
          let blocked = false
          try { checkSettings(s); checkShadow(s, id, scope) } catch { blocked = true }
          let description = blank
          if (available) {
            const manifest = await pack(disk, roots, parsed.name)
            const described = await tools.describe(source, parsed.name).catch(() => blank)
            description = { ...described, name: parsed.name, version: typeof manifest.version === "string" ? manifest.version : "", description: typeof manifest.description === "string" ? manifest.description : "" }
          }
          result.push({ name: parsed.name, id, version: description.version, scope, enabled: available && !blocked ? (typeof entries(s.local)[id] === "boolean" ? entries(s.local)[id] as boolean : typeof entries(s.project)[id] === "boolean" ? entries(s.project)[id] as boolean : value) : undefined, marketplace: parsed.market, readOnly: parsed.market !== MARKET || !available || blocked, origin: "declaration", ...(parsed.market === MARKET ? { sourceAvailable: available } : {}), source: { kind: "local", path: source }, pack: description })
        }
      }
      for (const market of await disk.list(roots, { root: "plugins", path: "" })) {
        if (!market.directory) continue
        for (const item of await disk.list(roots, { root: "plugins", path: market.name })) {
          if (!item.directory) continue
          const id = `${item.name}@${market.name}`
          if (result.some((v) => v.id === id)) continue
          const source = join(join(roots.plugins, market.name, roots.platform), item.name, roots.platform)
          const description = await tools.describe(source, item.name).catch(() => blank)
          result.push({ name: item.name, id, version: description.version, scope: "user", marketplace: market.name, origin: "record", readOnly: true, source: { kind: "local", path: source }, pack: description })
        }
      }
      return result
    },
    async install(name, scope, tools) {
      const id = `${name}@${MARKET}`; writable(id)
      checkScope(scope)
      const disk = diskOf(tools)
      return disk.run(SCOPE, async (roots) => {
        if (scope === "project" && !roots.workspace) throw new Error("Workspace unavailable")
        const s = await readSettings(disk, roots)
        checkSettings(s); checkShadow(s, id, scope); checkMarket(s, roots)
        await pack(disk, roots, name)
        const valid: { name: string; description: string; version: string }[] = []
        for (const candidate of await tools.packs()) {
          try { await pack(disk, roots, candidate.name); valid.push(candidate) } catch { /* 排除其他客户端的包格式。 */ }
        }
        if (!valid.some((v) => v.name === name)) throw new Error("Plugin is absent from the library")
        const existingIndexText = await disk.read(roots, { root: "library", path: "marketplace.json" })
        if (existingIndexText !== null && parse(existingIndexText).name !== MARKET) throw new Error("Existing marketplace index belongs to another owner")
        let user = s.userText ?? ""
        if (!marketPath(s.user)) user = edit(user, "extraKnownMarketplaces", MARKET, { source: { source: "directory", path: roots.library } })
        const changes: { ref: typeof USER | typeof PROJECT; before: string | null; after: string }[] = []
        if (scope === "user") user = edit(user, "enabledPlugins", id, true)
        if (user !== (s.userText ?? "")) changes.push({ ref: USER, before: s.userText, after: user })
        if (scope === "project") changes.push({ ref: PROJECT, before: s.projectText, after: edit(s.projectText ?? "", "enabledPlugins", id, true) })
        await tools.syncMarketplace([{ path: "marketplace.json", document: { name: MARKET, owner: { name: "Context Hub" }, plugins: valid.map((v) => ({ name: v.name, description: v.description, version: v.version, source: `./${v.name}` })) } }])
        try {
          await disk.commit(roots, changes)
        } catch (error) {
          throw new Error(`Plugin settings could not be committed; the marketplace index may have been updated. Check the declaration and index before retrying: ${error instanceof Error ? error.message : String(error)}`, { cause: error })
        }
        return { message: `${id} declared for Copilot`, location: join(roots.library, name, roots.platform) }
      })
    },
    async remove(id, scope, tools) {
      checkScope(scope); const name = writable(id)
      const disk = diskOf(tools)
      return disk.run(SCOPE, async (roots) => {
        const s = await readSettings(disk, roots); checkSettings(s); checkShadow(s, id, scope)
        await checkWritableSource(disk, roots, s, name)
        const ref = scope === "user" ? USER : PROJECT, doc = scope === "user" ? s.user : s.project, before = scope === "user" ? s.userText : s.projectText
        if (!Object.hasOwn(entries(doc), id)) throw new Error("Plugin declaration does not exist")
        await disk.commit(roots, [{ ref, before, after: json.editJson(before ?? "", ["enabledPlugins", id], undefined) }])
        return { message: `${id} declaration removed` }
      })
    },
    async setEnabled(id, scope, on, tools) {
      checkScope(scope); const name = writable(id)
      const disk = diskOf(tools)
      return disk.run(SCOPE, async (roots) => {
        const s = await readSettings(disk, roots); checkSettings(s); checkShadow(s, id, scope)
        await checkWritableSource(disk, roots, s, name)
        const ref = scope === "user" ? USER : PROJECT, doc = scope === "user" ? s.user : s.project, before = scope === "user" ? s.userText : s.projectText
        if (!Object.hasOwn(entries(doc), id) && !Object.hasOwn(entries(s.user), id)) throw new Error("Plugin declaration does not exist")
        await disk.commit(roots, [{ ref, before, after: edit(before ?? "", "enabledPlugins", id, on) }])
        return { message: `${id} declaration updated` }
      })
    },
  }
}
