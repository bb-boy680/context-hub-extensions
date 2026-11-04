// Qwen Code 0.26.6: extensionManager.ts and extension-store.ts at commit 042c023b7beb4ad2a9ef95b2906b3564e3f23089.
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)
const integer = (value: unknown): boolean => Number.isSafeInteger(value) && (value as number) >= 0
const namePattern = /^[a-zA-Z0-9_.-]+$/
const hashPattern = /^[a-f0-9]{64}$/
const state = (value: unknown): boolean => value === "enabled" || value === "disabled"

export interface QwenPolicy extends Record<string, unknown> {
  name: string
  defaultActivation: "enabled" | "disabled"
  workspaceOverrides: Record<string, "enabled" | "disabled" | "inherit">
}
export interface QwenSnapshot extends Record<string, unknown> {
  version: 2
  generation: number
  legacyProjectionHash: string
  extensions: Record<string, QwenPolicy>
}

function validProjection(value: unknown): boolean {
  if (!record(value)) return false
  const keys = Object.keys(value).map(key => key.toLowerCase())
  return new Set(keys).size === keys.length && Object.values(value).every(item => record(item) && Array.isArray(item.overrides) && item.overrides.every(rule => typeof rule === "string"))
}
function validPolicy(value: unknown): value is QwenPolicy {
  if (!record(value) || typeof value.name !== "string" || !namePattern.test(value.name) || !state(value.defaultActivation) || !record(value.workspaceOverrides)) return false
  if (!Object.values(value.workspaceOverrides).every(item => state(item) || item === "inherit")) return false
  if (value.artifactDirectory !== undefined && (typeof value.artifactDirectory !== "string" || !namePattern.test(value.artifactDirectory) || value.artifactDirectory === "." || value.artifactDirectory === "..")) return false
  if (value.artifactGeneration !== undefined && !integer(value.artifactGeneration)) return false
  if (value.declarationOnly !== undefined && value.declarationOnly !== true) return false
  if (value.preserveActivationOnNextInstall !== undefined && value.preserveActivationOnNextInstall !== true) return false
  if (value.legacyPathRules !== undefined && (!Array.isArray(value.legacyPathRules) || !value.legacyPathRules.every(rule => typeof rule === "string"))) return false
  if (value.skillWorkspaceOverrides !== undefined && (!record(value.skillWorkspaceOverrides) || !Object.values(value.skillWorkspaceOverrides).every(item => record(item) && Object.values(item).every(enabled => typeof enabled === "boolean")))) return false
  return true
}

export function parseQwenSnapshot(text: string): QwenSnapshot {
  const parsed: unknown = JSON.parse(text)
  if (!record(parsed) || parsed.version !== 2 || !integer(parsed.generation) || typeof parsed.legacyProjectionHash !== "string" || !hashPattern.test(parsed.legacyProjectionHash) || !record(parsed.extensions)) throw new Error("Invalid Qwen extension store")
  if (parsed.legacyProjectionRemainder !== undefined && !validProjection(parsed.legacyProjectionRemainder)) throw new Error("Invalid Qwen extension store")
  if (!Object.entries(parsed.extensions).every(([id, policy]) => hashPattern.test(id) && validPolicy(policy))) throw new Error("Invalid Qwen extension store")
  return parsed as QwenSnapshot
}

export async function qwenLocalIdentity(name: string): Promise<string> {
  if (!namePattern.test(name) || name === "." || name === "..") throw new Error("Invalid Qwen extension name")
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(name))
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("")
}

export function qwenStoredIdentity(metadata: { type?: string; credentialPersistence?: string; installId?: string }): string | null {
  if (!metadata.installId || (metadata.type !== "snapshot" && metadata.credentialPersistence !== "stored")) return null
  if (!hashPattern.test(metadata.installId)) throw new Error("Invalid Qwen extension identity")
  return metadata.installId
}

function rulePath(value: string): string {
  let path = value.replace(/\\/g, "/")
  if (!path.startsWith("/")) path = `/${path}`
  if (!path.endsWith("/")) path += "/"
  return path
}

function ruleMatches(rule: string, candidate: string): boolean {
  const raw = rule.startsWith("!") ? rule.slice(1) : rule
  const escaped = raw.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/(\/)?\*/g, "($1.*)?")
  return new RegExp(`^${escaped}$`).test(candidate)
}

export function qwenActivation(policy: QwenPolicy, workspace: string, canonicalWorkspace: string): "enabled" | "disabled" {
  const exact = policy.workspaceOverrides[canonicalWorkspace]
  if (exact === "enabled" || exact === "disabled") return exact
  if (exact === "inherit") return policy.defaultActivation
  let result = policy.defaultActivation
  const paths = [rulePath(workspace), rulePath(canonicalWorkspace)]
  for (const rule of (policy.legacyPathRules as string[] | undefined) ?? []) {
    if (paths.some(path => ruleMatches(rule, path))) result = rule.startsWith("!") ? "disabled" : "enabled"
  }
  return result
}

export function qwenProjection(snapshot: QwenSnapshot): Record<string, { overrides: string[] }> {
  const projection: Record<string, { overrides: string[] }> = Object.create(null)
  const represented = new Set(Object.values(snapshot.extensions).map(policy => policy.name.toLowerCase()))
  const remainder = (snapshot.legacyProjectionRemainder ?? {}) as Record<string, { overrides: string[] }>
  for (const [name, config] of Object.entries(remainder)) {
    if (!represented.has(name.toLowerCase())) projection[name] = { overrides: [...config.overrides] }
  }
  for (const policy of Object.values(snapshot.extensions)) {
    const overrides: string[] = []
    if (policy.defaultActivation === "disabled") overrides.push("!/*")
    overrides.push(...((policy.legacyPathRules as string[] | undefined) ?? []))
    for (const [workspace, value] of Object.entries(policy.workspaceOverrides)) {
      const effective = value === "inherit" ? policy.defaultActivation : value
      const input = `${effective === "disabled" ? "!" : ""}${workspace}`
      overrides.push(`${input.startsWith("!") ? "!" : ""}${rulePath(input.startsWith("!") ? input.slice(1) : input)}`)
    }
    if (overrides.length) projection[policy.name] = { overrides }
  }
  return projection
}

export async function qwenSetActivation(snapshot: QwenSnapshot, id: string, name: string, workspace: string | null, enabled: boolean): Promise<QwenSnapshot> {
  const next = structuredClone(snapshot)
  const policy = next.extensions[id]
  if (!policy || policy.name !== name || policy.declarationOnly === true || !Number.isSafeInteger(next.generation + 1)) throw new Error("Invalid Qwen extension policy")
  const activation = enabled ? "enabled" : "disabled"
  if (workspace === null) policy.defaultActivation = activation
  else policy.workspaceOverrides[workspace] = activation
  next.generation += 1
  next.legacyProjectionHash = await qwenProjectionHash(qwenProjection(next))
  return next
}

export async function qwenClearWorkspaceActivation(snapshot: QwenSnapshot, id: string, name: string, workspace: string, canonicalWorkspace: string): Promise<QwenSnapshot> {
  const next = structuredClone(snapshot)
  const policy = next.extensions[id]
  if (!policy || policy.name !== name || policy.declarationOnly === true || !Number.isSafeInteger(next.generation + 1)) throw new Error("Invalid Qwen extension policy")
  const paths = [rulePath(workspace), rulePath(canonicalWorkspace)]
  const legacyMatch = ((policy.legacyPathRules as string[] | undefined) ?? []).some(rule => paths.some(path => ruleMatches(rule, path)))
  if (legacyMatch) policy.workspaceOverrides[canonicalWorkspace] = "inherit"
  else delete policy.workspaceOverrides[canonicalWorkspace]
  next.generation += 1
  next.legacyProjectionHash = await qwenProjectionHash(qwenProjection(next))
  return next
}

export async function qwenProjectionHash(projection: Record<string, { overrides: string[] }>): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(projection)))
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("")
}
