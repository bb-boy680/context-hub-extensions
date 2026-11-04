import type { McpIo, McpPlace, McpTools, YamlNode } from "./contracts.ts"
import { mcpPlaces } from "./mcp-places.ts"

export interface BundleManifest {
  name: string
  version: string
  description: string
  patches: readonly string[]
}

export interface ProfileBundleCandidate {
  name: string
  selected: boolean
  dependency: string | null
  /** profile 目录可证实的包，或需要上游安装根才能确定的状态。 */
  manifest: BundleManifest | null
  resolution: "profile" | "unresolved" | "external-link" | "invalid"
}

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : null
}

/** 保持 npm 原生身份，路径每一段都必须是安全单段。 */
export function bundleNameParts(name: string): string[] | null {
  if (typeof name !== "string" || name === "" || name.includes("\\") || name.length > 214) return null
  const parts = name.split("/")
  if (parts.length > 2 || (parts.length === 2 && !parts[0]?.startsWith("@")) ||
    (parts.length === 1 && name.startsWith("@"))) return null
  const segments = parts.map((part, index) => index === 0 && part.startsWith("@") ? part.slice(1) : part)
  if (segments.some((part) => !/^[a-z0-9][a-z0-9._~-]*$/.test(part) || part === "node_modules" || part.endsWith(".") ||
    /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(part))) return null
  return parts
}

function patchPath(path: unknown): path is string {
  if (typeof path !== "string" || path === "" || path.startsWith("/") || path.includes("\\") || path.includes(":") || path.includes("\0")) return false
  const relative = path.startsWith("./") ? path.slice(2) : path
  return relative !== "" && relative.split("/").every((part) => part !== "" && part !== "." && part !== ".." &&
    !part.endsWith(".") && !part.endsWith(" ") && !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(part))
}

/** 只接受带原生 bundle 配置层的 npm 清单，普通 package.json 不算 bundle。 */
export function bundleManifest(text: string | null): BundleManifest | null {
  if (text === null) return null
  let document: Record<string, unknown> | null
  try { document = object(JSON.parse(text)) } catch { return null }
  const dsh = object(document?.dsh)
  const bundle = object(dsh?.bundle)
  const declared = bundle?.patch
  const patches = typeof declared === "string" ? [declared] : declared
  if (typeof document?.name !== "string" || bundleNameParts(document.name) === null ||
    typeof document.version !== "string" || document.version.trim() === "" ||
    !Array.isArray(patches) || patches.length === 0 || !patches.every(patchPath)) return null
  return { name: document.name, version: document.version, description: typeof document.description === "string" ? document.description : "", patches }
}

/** 只读取 profile 清单自身；安装根是否提供同名包需要宿主另行确认。 */
export function profileBundleState(text: string | null): { selected: string[]; dependencies: Record<string, string> } | null {
  if (text === null) return null
  let document: Record<string, unknown> | null
  try { document = object(JSON.parse(text)) } catch { return null }
  const dsh = object(document?.dsh)
  const profile = object(dsh?.profile)
  const selected = profile?.bundles
  const dependencies = document?.dependencies === undefined ? {} : object(document.dependencies)
  if (!Array.isArray(selected) || !selected.every((name) => typeof name === "string" && bundleNameParts(name) !== null) || dependencies === null ||
    !Object.entries(dependencies).every(([name, spec]) => bundleNameParts(name) !== null && typeof spec === "string" && spec !== "")) return null
  return { selected, dependencies: dependencies as Record<string, string> }
}

export interface BundlePreflight {
  manifest: BundleManifest
  /** candidate 仅说明静态预检通过，不代表依赖或加载已确认。 */
  status: "candidate" | "needs-preparation"
  reasons: string[]
}

function hasComplexYaml(node: YamlNode | null): boolean {
  if (node === null) return false
  if (node.tag || node.anchor || node.kind === "alias") return true
  if (node.kind === "seq") return (node.items ?? []).some(hasComplexYaml)
  if (node.kind === "map") return (node.pairs ?? []).some((pair) => hasComplexYaml(pair.key) || hasComplexYaml(pair.value))
  return false
}

/** 只做静态预检；readRelative 必须由受限文件端口提供，写入前仍须证明依赖与记录协议。 */
export async function preflightBundleArtifact(
  text: string,
  readRelative: (path: string) => Promise<string | null>,
  tools: Pick<McpTools, "parseYamlDocument">
): Promise<BundlePreflight> {
  const manifest = bundleManifest(text)
  if (manifest === null) throw new Error("不是有效的原生 bundle 清单")
  const document = object(JSON.parse(text))!
  const reasons: string[] = []
  for (const key of ["dependencies", "optionalDependencies", "peerDependencies", "bundleDependencies", "bundledDependencies"]) {
    const value = document[key]
    if (value !== undefined && (object(value) === null || Object.keys(value as object).length > 0)) reasons.push(key)
  }
  const scripts = document.scripts === undefined ? {} : object(document.scripts)
  if (scripts === null || ["preinstall", "install", "postinstall", "prepare"].some((key) => scripts[key] !== undefined)) reasons.push("lifecycle")
  if (document.main !== undefined || document.exports !== undefined || document.bin !== undefined || document.gypfile === true) reasons.push("runtime-entry")
  for (const path of manifest.patches) {
    const source = await readRelative(path.startsWith("./") ? path.slice(2) : path)
    if (source === null) throw new Error(`bundle patch 不存在：${path}`)
    const node = tools.parseYamlDocument(source)
    if (node?.kind !== "seq" || hasComplexYaml(node)) throw new Error(`bundle patch 无法安全静态分析：${path}`)
  }
  return { manifest, status: reasons.length === 0 ? "candidate" : "needs-preparation", reasons }
}

/** 仅转换选择列表；调用方写入前仍须核验来源、兼容性和管理组件保护。 */
export function updateProfileSelection(text: string, name: string, enabled: boolean, tools: Pick<McpTools, "editJson">): string | null {
  const state = profileBundleState(text)
  if (state === null || bundleNameParts(name) === null) throw new Error("profile 清单或 bundle 名无效")
  const next = enabled
    ? state.selected.includes(name) ? state.selected : [...state.selected, name]
    : state.selected.filter((item) => item !== name)
  if (next.length === state.selected.length && next.every((item, index) => item === state.selected[index])) return null
  return tools.editJson(text, ["dsh", "profile", "bundles"], next)
}

export interface ProfileBundleView {
  id: string
  profile: string
  place: McpPlace
  candidates: ProfileBundleCandidate[]
}

/** 解析每个已初始化 profile，不将不同 profile 折叠为同一 user scope。 */
export async function readAllProfileBundleCandidates(io: McpIo, tools: McpTools): Promise<ProfileBundleView[]> {
  const places = await mcpPlaces(io, tools)
  const profiles: ProfileBundleView[] = []
  for (const place of places) {
    if (place.installable !== false) continue
    profiles.push({
      id: place.id,
      profile: place.file.slice("profiles/".length, -"/cordis.patch.yml".length),
      place,
      candidates: await readProfileBundleCandidates(io, place),
    })
  }
  return profiles
}

/** 只枚举 profile 明确列出的包，不执行包代码或推断安装根。 */
export async function readProfileBundleCandidates(io: McpIo, place: McpPlace): Promise<ProfileBundleCandidate[]> {
  const placeParts = place.file.split("/")
  const profile = placeParts.length === 3 && placeParts[0] === "profiles" && placeParts[2] === "cordis.patch.yml" ? placeParts[1] ?? "" : ""
  if (place.installable !== false || !profile || profile.includes("/") || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(profile) ||
    place.rootIdentity === undefined || !/^[a-f0-9]{64}$/.test(place.rootIdentity)) {
    throw new Error("需要已解析的 profile 位置")
  }
  const directory = place.file.slice(0, -"cordis.patch.yml".length)
  const state = profileBundleState(await io.files.read({ ...place, file: `${directory}package.json` }))
  if (state === null) throw new Error("profile 清单无效或已消失")
  const names = [...new Set([...state.selected, ...Object.keys(state.dependencies)])]
  const candidates: ProfileBundleCandidate[] = []
  for (const name of names) {
    const parts = bundleNameParts(name)!
    const scoped = parts.length === 2
    const template = scoped
      ? `profiles/${profile}/node_modules/${parts[0]}/${"${name}"}/package.json`
      : `profiles/${profile}/node_modules/${"${name}"}/package.json`
    const directoryName = scoped ? parts[1]! : parts[0]!
    const file = template.replace("${name}", directoryName)
    let raw: string | null
    try {
      raw = await io.files.read({ ...place, file, pathTemplate: { file: template, name: directoryName } })
    } catch (reason) {
      if (typeof reason === "object" && reason !== null && "code" in reason && reason.code === "PLACE_PATH_MISSING") {
        raw = null
      } else if (typeof reason === "object" && reason !== null && "code" in reason && reason.code === "PLACE_PATH_LINK") {
        candidates.push({ name, selected: state.selected.includes(name), dependency: state.dependencies[name] ?? null, manifest: null, resolution: "external-link" })
        continue
      } else throw reason
    }
    const manifest = bundleManifest(raw)
    candidates.push({
      name,
      selected: state.selected.includes(name),
      dependency: state.dependencies[name] ?? null,
      manifest: manifest?.name === name ? manifest : null,
      resolution: raw === null ? "unresolved" : manifest?.name === name ? "profile" : "invalid",
    })
  }
  return candidates
}
