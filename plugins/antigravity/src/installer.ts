import type { McpTools, PluginDisk, PluginDiskRoots, PluginHeld, PluginInstaller, PluginTools } from "./contracts.ts"
import { ANTIGRAVITY_ID } from "./locations.ts"

const MARKET = "context-hub"
const CONFIG = { root: "config", path: "config/plugins.json" } as const
const MANIFESTS = ["plugin.json", ".antigravity-plugin/plugin.json"] as const
const SCOPE = {
  home: ".gemini", state: "context-hub",
  config: { write: ["config/plugins.json"], read: ["config/plugins", "config/plugins/*", "config/plugins/*/plugin.json", "config/plugins/*/.antigravity-plugin/plugin.json", "antigravity-cli/plugins", "antigravity-cli/plugins/*", "antigravity-cli/plugins/*/plugin.json", "antigravity-cli/plugins/*/.antigravity-plugin/plugin.json"] },
  stateFiles: { write: ["cache/context-hub/*", "cache/context-hub/*/*"], read: ["cache", "cache/context-hub", "cache/context-hub/*"] },
  workspace: { write: [], read: [".agents/plugins.json", ".agents/plugins", ".agents/plugins/*", ".agents/plugins/*/plugin.json", ".agents/plugins/*/.antigravity-plugin/plugin.json"] },
  library: { write: [], read: ["*", "*/plugin.json", "*/.antigravity-plugin/plugin.json"] },
  external: ["plugin.json", ".antigravity-plugin/plugin.json"],
} as const

type Entry = Record<string, unknown> & { path: string }
function object(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value) }
function safe(value: string): boolean { return /^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(value) && !/[. ]$/.test(value) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value) }
function nameOf(value: string): string { if (!/^[A-Za-z0-9_-]+$/.test(value) || !safe(value)) throw new Error(`invalid plugin name: ${value}`); return value }
function versionOf(value: unknown): string { const version = value === undefined || value === "" ? "local" : value; if (typeof version !== "string" || !safe(version)) throw new Error("invalid plugin version"); return version }
function diskOf(tools: PluginTools): PluginDisk { if (!tools.disk) throw new Error("plugin file access is unavailable"); return tools.disk }
function same(a: string, b: string, platform: PluginDiskRoots["platform"]): boolean { const norm = (p: string) => { const s = p.replace(/^\\\\\?\\/, "").replace(/\\/g, "/").replace(/\/+$/, ""); return platform === "win32" ? s.toLowerCase() : s }; return norm(a) === norm(b) }
function insidePath(parent: string, target: string, platform: PluginDiskRoots["platform"]): string | null {
  const normal = (value: string) => { const path = value.replace(/^\\\\\?\\/, "").replace(/\\/g, "/").replace(/\/+$/, ""); return platform === "win32" ? path.toLowerCase() : path }
  const base = `${normal(parent)}/`, path = normal(target)
  return path.startsWith(base) ? path.slice(base.length) : null
}
function resolve(base: string, input: string, platform: PluginDiskRoots["platform"]): string {
  const path = input.replace(/\\/g, "/")
  const root = base.replace(/\\/g, "/")
  const absolute = platform === "win32" ? /^[A-Za-z]:\//.test(path) || path.startsWith("//") : path.startsWith("/")
  const parts = (absolute ? path : `${root}/${path}`).split("/")
  const out: string[] = []
  for (const part of parts) { if (part === "." || part === "") continue; if (part === "..") { if (out.length <= (platform === "win32" ? 1 : 0)) throw new Error("invalid discovery path"); out.pop() } else out.push(part) }
  const prefix = platform === "win32" ? (absolute && path.startsWith("//") ? "//" : "") : "/"
  return platform === "win32" ? `${prefix}${out.join("/").replace(/\//g, "\\")}` : `${prefix}${out.join("/")}`
}
function manifest(raw: string | null): Record<string, unknown> | null {
  if (raw === null) return null
  const value: unknown = JSON.parse(raw)
  if (!object(value) || typeof value.name !== "string") throw new Error("invalid Antigravity plugin manifest")
  nameOf(value.name)
  const allowed = new Set(["$schema", "name", "displayName", "display_name", "description", "version", "disabled", "logo", "suggestedPrompts", "suggested_prompts", "skills", "author", "homepage", "repository", "license", "keywords", "extensions"])
  if (Object.keys(value).some((key) => !allowed.has(key)) || (value.version !== undefined && typeof value.version !== "string") || (value.description !== undefined && typeof value.description !== "string")) throw new Error("invalid Antigravity plugin manifest")
  if ((value.$schema !== undefined && typeof value.$schema !== "string") || (typeof value.$schema === "string" && !/^https:\/\/antigravity\.google\/schemas\/v1\/plugin\.json$/.test(value.$schema))) throw new Error("foreign plugin manifest")
  for (const key of ["displayName", "display_name", "logo", "homepage", "repository", "license"]) if (value[key] !== undefined && typeof value[key] !== "string") throw new Error(`invalid manifest ${key}`)
  if (value.disabled !== undefined && typeof value.disabled !== "boolean") throw new Error("invalid manifest disabled")
  const strings = (input: unknown) => Array.isArray(input) && input.every((item) => typeof item === "string")
  for (const key of ["keywords", "suggestedPrompts", "suggested_prompts"]) if (value[key] !== undefined && !strings(value[key])) throw new Error(`invalid manifest ${key}`)
  if (value.skills !== undefined && typeof value.skills !== "string" && !strings(value.skills)) throw new Error("invalid manifest skills")
  if (value.author !== undefined && typeof value.author !== "string" && (!object(value.author) || Object.keys(value.author).some((key) => !["name", "email", "url"].includes(key) || typeof (value.author as Record<string, unknown>)[key] !== "string"))) throw new Error("invalid manifest author")
  if (value.extensions !== undefined && (!object(value.extensions) || Object.values(value.extensions).some((item) => !object(item)))) throw new Error("invalid manifest extensions")
  return value
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (object(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
  return value
}
function mergeManifests(first: string | null, second: string | null): Record<string, unknown> {
  const a = manifest(first), b = manifest(second)
  if (!a && !b) throw new Error("Antigravity plugin manifest is missing")
  if (a && b && JSON.stringify(canonical(a)) !== JSON.stringify(canonical(b))) throw new Error("conflicting Antigravity plugin manifests")
  return (a ?? b)!
}
function discovery(text: string | null, json: Pick<McpTools, "parseJsonc">): { doc: Record<string, unknown>; entries: Entry[] } {
  if (text === null) return { doc: {}, entries: [] }
  if (text.trim() === "") throw new Error("invalid plugins.json")
  const doc = json.parseJsonc(text)
  if (!object(doc) || !Array.isArray(doc.entries) || doc.entries.some((entry: unknown) => !object(entry) || typeof entry.path !== "string" || entry.path === "")) throw new Error("invalid plugins.json entries")
  return { doc, entries: doc.entries as Entry[] }
}

export function createAntigravityInstaller(json: Pick<McpTools, "parseJsonc" | "editJson">): PluginInstaller {
  return {
    id: ANTIGRAVITY_ID, label: "Antigravity",
    places: [{ id: "antigravity-user", label: "Antigravity", scope: "global", scopeWord: "user", switchable: false }],
    async available(tools) { try { const disk = diskOf(tools); if (typeof disk.snapshotDirectory !== "function") return false; await disk.roots(SCOPE); return true } catch { return false } },
    async held(tools) {
      const disk = diskOf(tools), roots = await disk.roots(SCOPE)
      const result: PluginHeld[] = [], seen: string[] = []
      const add = async (path: string, scope: "user" | "project") => {
        if (seen.some((item) => same(item, path, roots.platform))) return
        const values = await Promise.all(MANIFESTS.map((file) => disk.readExternal(roots, path, file)))
        const data = mergeManifests(values[0]!, values[1]!)
        const name = nameOf(data.name as string), version = versionOf(data.version)
        const owned = scope === "user" && same(path, await disk.path(roots, { root: "plugins", path: `cache/${MARKET}/${name}/${version}` }), roots.platform)
        seen.push(path)
        const pack = await tools.describe(path, name)
        result.push({ name, id: owned ? `${name}@${MARKET}` : name, version, scope, marketplace: owned ? MARKET : null, readOnly: !owned, source: { kind: "local", path }, pack })
      }
      const lists = [{ ref: CONFIG, base: `${roots.config}/config`, scope: "user" as const }, ...(roots.workspace ? [{ ref: { root: "workspace" as const, path: ".agents/plugins.json" }, base: roots.workspace, scope: "project" as const }] : [])]
      for (const list of lists) {
        const doc = discovery(await disk.read(roots, list.ref), json)
        for (const item of doc.entries) {
          const dir = resolve(list.base, item.path, roots.platform)
          const manifests = await Promise.all(MANIFESTS.map((file) => disk.readExternal(roots, dir, file)))
          if (manifests.some((value) => value !== null)) await add(dir, list.scope)
          else {
            const known = list.scope === "user" ? ["config/plugins", "antigravity-cli/plugins"].map((value) => resolve(roots.config, value, roots.platform)) : roots.workspace ? [resolve(roots.workspace, ".agents/plugins", roots.platform)] : []
            if (!known.some((value) => same(dir, value, roots.platform))) throw new Error(`discovery entry has no Antigravity manifest: ${dir}`)
          }
        }
      }
      for (const root of [{ root: "config" as const, path: "config/plugins", scope: "user" as const }, { root: "config" as const, path: "antigravity-cli/plugins", scope: "user" as const }, ...(roots.workspace ? [{ root: "workspace" as const, path: ".agents/plugins", scope: "project" as const }] : [])]) {
        for (const item of await disk.list(roots, root)) if (item.directory) await add(await disk.path(roots, { root: root.root, path: `${root.path}/${item.name}` }), root.scope)
      }
      return result
    },
    async install(name, scope, tools) {
      if (scope !== "user") throw new Error("unsupported plugin scope")
      nameOf(name)
      const disk = diskOf(tools)
      if (typeof disk.snapshotDirectory !== "function") throw new Error("plugin directory snapshots are unavailable")
      return disk.run(SCOPE, async (roots) => {
        if (!same(await tools.root(), roots.library, roots.platform)) throw new Error("plugin library root changed")
        const sourceSnapshot = await disk.snapshotDirectory(roots, { root: "library", path: name })
        if (sourceSnapshot === null) throw new Error("plugin source is missing")
        const source = await Promise.all(MANIFESTS.map((path) => disk.read(roots, { root: "library", path: `${name}/${path}` })))
        const data = mergeManifests(source[0]!, source[1]!)
        if (data.name !== name) throw new Error("plugin name does not match library name")
        const version = versionOf(data.version), destination = `cache/${MARKET}/${name}/${version}`
        const path = await disk.path(roots, { root: "plugins", path: destination })
        const before = await disk.read(roots, CONFIG), found = discovery(before, json)
        const ownRoot = await disk.path(roots, { root: "plugins", path: `cache/${MARKET}/${name}` })
        const isOwn = (item: Entry) => { const relative = insidePath(ownRoot, resolve(`${roots.config}/config`, item.path, roots.platform), roots.platform); return relative !== null && safe(relative) }
        const previous = found.entries.filter(isOwn)
        const fields = (entry: Entry) => JSON.stringify(canonical(Object.fromEntries(Object.entries(entry).filter(([key]) => key !== "path"))))
        if (previous.some((entry) => fields(entry) !== fields(previous[0]!))) throw new Error("conflicting managed discovery entries")
        const entries = [...found.entries.filter((item) => !isOwn(item)), { ...previous[0], path }]
        const after = json.editJson(before, ["entries"], entries)
        const cacheSnapshot = await disk.snapshotDirectory(roots, { root: "plugins", path: destination })
        await disk.commit(roots, [{ ref: CONFIG, before, after }], { name, destination, manifests: [...MANIFESTS], before: cacheSnapshot, sourceSnapshot })
        return { message: `${name} installed for Antigravity`, location: path }
      })
    },
    async remove(id, scope, tools) {
      if (scope !== "user" || !id.endsWith(`@${MARKET}`)) throw new Error("unsupported plugin identity or scope")
      const name = nameOf(id.slice(0, -(`@${MARKET}`.length)))
      const disk = diskOf(tools)
      return disk.run(SCOPE, async (roots) => {
        const before = await disk.read(roots, CONFIG), found = discovery(before, json)
        const ownedRoot = await disk.path(roots, { root: "plugins", path: `cache/${MARKET}/${name}` })
        const own = (item: Entry) => { const relative = insidePath(ownedRoot, resolve(`${roots.config}/config`, item.path, roots.platform), roots.platform); return relative !== null && safe(relative) }
        const removed = found.entries.filter(own)
        if (removed.length === 0) throw new Error("plugin is not installed")
        const after = json.editJson(before, ["entries"], found.entries.filter((entry) => !own(entry)))
        await disk.commit(roots, [{ ref: CONFIG, before, after }])
        return { message: `${id} removed from discovery; cache retained at ${ownedRoot}` }
      })
    },
  }
}
