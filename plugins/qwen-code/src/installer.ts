import type { PluginDisk, PluginDiskDeclaration, PluginDiskRef, PluginDiskRoots, PluginHeld, PluginInstaller, PluginInstallReport, PluginJournalCommit, PluginTools } from "./contracts.ts"
import { QWEN_ID } from "./locations.ts"
import { parseQwenSnapshot, qwenActivation, qwenClearWorkspaceActivation, qwenLocalIdentity, qwenProjection, qwenProjectionHash, qwenSetActivation, type QwenSnapshot } from "./plugin-state.ts"

const config = (path: string): PluginDiskRef => ({ root: "config", path })
const plugins = (path: string): PluginDiskRef => ({ root: "plugins", path })
const library = (path: string): PluginDiskRef => ({ root: "library", path })
const stateRef = config("extension-store/state.json")
const previousRef = config("extension-store/state.previous.json")
const ownerRef = config("extension-store/.context-hub-ownership.json")
const pendingRef = config("extension-store/transactions")
const stagingRef = config("extension-store/staging")
const rollbackRef = config("extension-store/rollback")
const projectionRef = plugins("extension-enablement.json")

export const qwenDiskScope: PluginDiskDeclaration = {
  home: ".qwen", homeEnv: "QWEN_HOME", canonicalWorkspace: true, state: "extensions",
  config: { write: ["extension-store/lock", "extension-store/state.json", "extension-store/state.previous.json", "extension-store/.context-hub-ownership.json", "extension-store/transactions/*", "extension-store/staging/*", "extension-store/rollback/*"], read: ["extension-store/transactions", "extension-store/staging", "extension-store/rollback"] },
  stateFiles: { write: ["*"], read: ["", "*/**"] },
  directories: [":name"], workspace: { write: [], read: [] }, library: { write: [], read: ["**"] }, external: [],
  lease: { ref: config("extension-store/lock"), stale: 60000, update: 5000, retries: { retries: 60, factor: 1.2, minTimeout: 50, maxTimeout: 500, randomize: true } },
}

type Owners = { version: 1; entries: Record<string, Record<string, string>> }
const object = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)
const digest = /^[a-f0-9]{64}$/
function validName(name: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(name) && !name.endsWith(".") && !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(name)
}

function ownersOf(text: string | null): Owners {
  if (text === null) return { version: 1, entries: {} }
  const value: unknown = JSON.parse(text)
  if (!object(value) || value.version !== 1 || !object(value.entries)) throw new Error("Invalid Qwen ownership record")
  for (const [id, generations] of Object.entries(value.entries)) {
    if (!digest.test(id) || !object(generations) || Object.entries(generations).some(([generation, hash]) => !/^(0|[1-9][0-9]*)$/.test(generation) || typeof hash !== "string" || !digest.test(hash))) throw new Error("Invalid Qwen ownership record")
  }
  return value as Owners
}
function manifestOf(text: string | null, forInstall = false): { name: string; version: string; description: string } {
  if (text === null) throw new Error("Qwen native manifest is required")
  const value: unknown = JSON.parse(text)
  if (!object(value) || typeof value.name !== "string" || !validName(value.name) || typeof value.version !== "string" || value.version.trim() === "" || (value.description !== undefined && typeof value.description !== "string")) throw new Error("Invalid Qwen native manifest")
  if (forInstall && value.settings !== undefined && (!Array.isArray(value.settings) || value.settings.length > 0)) throw new Error("Qwen extensions requiring settings cannot be installed automatically")
  return { name: value.name, version: value.version, description: typeof value.description === "string" ? value.description : "" }
}
async function getDisk(tools: PluginTools): Promise<PluginDisk> {
  if (!tools.disk || typeof tools.disk.journalCommit !== "function") throw new Error("This Context Hub version lacks journalled plugin transactions")
  return tools.disk
}
async function assertProjection(snapshot: QwenSnapshot, text: string | null): Promise<void> {
  const value: unknown = text === null ? {} : JSON.parse(text)
  if (!object(value)) throw new Error("Qwen activation projection requires client reconciliation")
  const names = Object.keys(value).map(name => name.toLowerCase())
  if (new Set(names).size !== names.length || Object.values(value).some(entry => !object(entry) || !Array.isArray(entry.overrides) || !entry.overrides.every(rule => typeof rule === "string"))) throw new Error("Qwen activation projection requires client reconciliation")
  if (await qwenProjectionHash(value as Record<string, { overrides: string[] }>) !== snapshot.legacyProjectionHash) throw new Error("Qwen activation projection requires client reconciliation")
}
async function initialSnapshot(disk: PluginDisk, roots: PluginDiskRoots, text: string | null): Promise<QwenSnapshot> {
  if (text !== null) {
    const snapshot = parseQwenSnapshot(text)
    await assertProjection(snapshot, await disk.read(roots, projectionRef))
    return snapshot
  }
  const projection = await disk.read(roots, projectionRef)
  const previous = await disk.read(roots, previousRef)
  if (previous !== null || (projection !== null && (!object(JSON.parse(projection)) || Object.keys(JSON.parse(projection)).length !== 0))) throw new Error("Existing Qwen state requires client recovery")
  return { version: 2, generation: 0, legacyProjectionHash: await qwenProjectionHash({}), extensions: {} }
}
async function assertNoPrivateFiles(disk: PluginDisk, roots: PluginDiskRoots, ref: PluginDiskRef): Promise<void> {
  for (const entry of await disk.list(roots, ref)) {
    if (entry.name === ".git" || entry.name === ".env" || entry.name.startsWith(".env.") || entry.name === ".qwen-extension-install.json") throw new Error("Qwen package contains private installation data")
    if (entry.directory) await assertNoPrivateFiles(disk, roots, { root: ref.root, path: `${ref.path}/${entry.name}` })
  }
}
async function needsRecovery(disk: PluginDisk, roots: PluginDiskRoots): Promise<boolean> {
  for (const ref of [pendingRef, stagingRef, rollbackRef]) if ((await disk.list(roots, ref, { includeLinks: true })).length > 0) return true
  return false
}
async function preflight(disk: PluginDisk): Promise<PluginDiskRoots> {
  const roots = await disk.roots(qwenDiskScope)
  if (await needsRecovery(disk, roots)) throw new Error("Qwen transaction or staging requires recovery or inspection")
  await initialSnapshot(disk, roots, await disk.read(roots, stateRef))
  ownersOf(await disk.read(roots, ownerRef))
  return roots
}
async function checkedSource(disk: PluginDisk, roots: PluginDiskRoots, name: string): Promise<{ version: string; description: string; snapshot: string }> {
  if (!validName(name)) throw new Error("Invalid Qwen extension name")
  const manifest = manifestOf(await disk.read(roots, library(`${name}/qwen-extension.json`)), true)
  if (manifest.name !== name) throw new Error("Qwen manifest name does not match the library package")
  const rootEntries = await disk.list(roots, library(name))
  if (rootEntries.some(entry => !entry.directory && entry.name === "plugin.json")) throw new Error("Mixed plugin manifests are not accepted")
  for (const dir of [".claude-plugin", ".codex-plugin", ".cursor-plugin"]) {
    if (rootEntries.some(entry => entry.directory && entry.name === dir) && (await disk.list(roots, library(`${name}/${dir}`))).some(entry => entry.name === "plugin.json")) throw new Error("Mixed plugin manifests are not accepted")
  }
  await assertNoPrivateFiles(disk, roots, library(name))
  const snapshot = await disk.snapshotDirectory(roots, library(name))
  if (snapshot === null) throw new Error("Qwen library package is missing")
  return { version: manifest.version, description: manifest.description, snapshot }
}
async function owned(disk: PluginDisk, roots: PluginDiskRoots, snapshot: QwenSnapshot, owners: Owners, id: string): Promise<{ name: string; hash: string }> {
  const policy = snapshot.extensions[id]
  if (!policy || typeof policy.artifactGeneration !== "number" || policy.artifactDirectory !== policy.name || policy.declarationOnly === true) throw new Error("Qwen extension is not managed by Context Hub")
  await assertNoPrivateFiles(disk, roots, plugins(policy.name))
  const hash = owners.entries[id]?.[String(policy.artifactGeneration)]
  if (!hash || await disk.snapshotDirectory(roots, plugins(policy.name)) !== hash) throw new Error("Qwen extension ownership or contents changed")
  return { name: policy.name, hash }
}
async function recipeOf(disk: PluginDisk, roots: PluginDiskRoots, snapshot: QwenSnapshot, next: QwenSnapshot, state: string | null, changes: PluginJournalCommit["before"], artifact?: NonNullable<PluginJournalCommit["artifact"]>): Promise<PluginJournalCommit> {
  const prior = await disk.read(roots, previousRef)
  const projection = await disk.read(roots, projectionRef)
  if (state !== null) await assertProjection(snapshot, projection)
  const before = [...changes, ...(state === null ? [] : [{ ref: previousRef, before: prior, after: state }])]
  const recipe: PluginJournalCommit = { pending: pendingRef, guardEmpty: [stagingRef, rollbackRef], before, commit: { ref: stateRef, before: state, after: JSON.stringify(next, null, 2) }, after: [{ ref: projectionRef, before: projection, after: JSON.stringify(qwenProjection(next), null, 2) }] }
  if (artifact) {
    const transactionId = crypto.randomUUID()
    const staging = artifact.operation === "copy" ? config(`extension-store/staging/transaction-${transactionId}`) : undefined
    const backup = config(`extension-store/rollback/${transactionId}`)
    const base = {
      version: 1, transactionId, operation: artifact.operation === "remove" ? "uninstall" : artifact.before === null ? "install" : "update",
      destinationDirectory: await disk.path(roots, plugins(artifact.destination)),
      ...(staging ? { stagingDirectory: await disk.path(roots, staging) } : {}),
      backupDirectory: await disk.path(roots, backup), previousGeneration: snapshot.generation, targetGeneration: next.generation, targetSnapshot: next, orderMs: Date.now(),
    }
    const document = (phase: string) => JSON.stringify({ ...base, phase }, null, 2)
    recipe.journal = { ref: config(`extension-store/transactions/${transactionId}.json`), prepared: document("prepared"), swapped: document("artifact_swapped"), committed: document("state_committed") }
    recipe.artifact = { ...artifact, staging, backup }
  }
  return recipe
}
async function withLease(disk: PluginDisk, work: (roots: PluginDiskRoots) => Promise<PluginInstallReport>): Promise<PluginInstallReport> {
  let completed: PluginInstallReport | undefined
  try {
    return await disk.run(qwenDiskScope, async roots => {
      if (await needsRecovery(disk, roots)) throw new Error("Qwen transaction or staging requires recovery or inspection")
      completed = await work(roots)
      return completed
    })
  } catch (error) {
    if (!completed) throw error
    return { ...completed, warning: [completed.warning, `Lock release: ${String(error)}`].filter(Boolean).join("\n") }
  }
}
function report(warnings: string[], location?: string) {
  return { message: "Qwen Code extension updated.", ...(location ? { location } : {}), ...(warnings.length ? { warning: warnings.join("\n") } : {}) }
}

export function createQwenCodeInstaller(): PluginInstaller {
  return {
    id: QWEN_ID, label: "Qwen Code",
    places: [
      { id: "qwen-code-global", label: "Qwen Code", scope: "global", scopeWord: "user", switchable: true },
      { id: "qwen-code", label: "Qwen Code", scope: "workspace", scopeWord: "project", switchable: true, installable: false, initialInstallable: true, clearable: true, overrides: ["user"] },
    ],
    async available(tools) { return typeof tools.disk?.journalCommit === "function" },
    async held(tools) {
      const disk = await getDisk(tools), roots = await disk.roots(qwenDiskScope)
      const stateText = await disk.read(roots, stateRef), ownerText = await disk.read(roots, ownerRef)
      const pending = await needsRecovery(disk, roots)
      let snapshot: QwenSnapshot | null = null, owners: Owners | null = null
      try {
        if (stateText !== null) {
          snapshot = parseQwenSnapshot(stateText)
          await assertProjection(snapshot, await disk.read(roots, projectionRef))
        }
        owners = ownersOf(ownerText)
      } catch { snapshot = null }
      const result: PluginHeld[] = []
      for (const entry of await disk.list(roots, plugins(""))) {
        if (!entry.directory || !validName(entry.name)) continue
        const manifestText = await disk.read(roots, plugins(`${entry.name}/qwen-extension.json`))
        if (manifestText === null) continue
        try {
          const manifest = manifestOf(manifestText)
          if (manifest.name !== entry.name) continue
          const hasMetadata = (await disk.list(roots, plugins(entry.name))).some(file => file.name === ".qwen-extension-install.json")
          const id = hasMetadata ? `unknown:${entry.name}` : await qwenLocalIdentity(entry.name)
          let managed = false
          if (!pending && !hasMetadata && snapshot && owners) {
            try { await owned(disk, roots, snapshot, owners, id); managed = true } catch { /* External or changed artifacts stay read-only. */ }
          }
          const policy = snapshot?.extensions[id]
          result.push({ name: entry.name, id, version: manifest.version, scope: "user", ...(managed && policy ? { enabled: policy.defaultActivation === "enabled" } : {}), readOnly: !managed, marketplace: managed ? "context-hub" : null, sourceAvailable: true, source: { kind: "local", path: await disk.path(roots, plugins(entry.name)) }, pack: manifest })
        } catch {
          result.push({ name: entry.name, id: `unknown:${entry.name}`, version: "", scope: "user", readOnly: true, marketplace: null, sourceAvailable: false, pack: { name: entry.name, version: "", description: "" } })
        }
      }
      return result
    },
    async switches(tools) {
      const disk = await getDisk(tools), roots = await disk.roots(qwenDiskScope)
      if (await needsRecovery(disk, roots)) return { user: {}, project: {} }
      const text = await disk.read(roots, stateRef)
      if (text === null) return { user: {}, project: {} }
      const snapshot = parseQwenSnapshot(text), owners = ownersOf(await disk.read(roots, ownerRef))
      await assertProjection(snapshot, await disk.read(roots, projectionRef))
      const user: Record<string, boolean> = {}, project: Record<string, boolean> = {}
      for (const [id, policy] of Object.entries(snapshot.extensions)) {
        try { await owned(disk, roots, snapshot, owners, id) } catch { continue }
        user[id] = policy.defaultActivation === "enabled"
        if (roots.workspace !== null && roots.workspaceCanonical != null) project[id] = qwenActivation(policy, roots.workspace, roots.workspaceCanonical) === "enabled"
      }
      return { user, project }
    },
    async install(name, scope, tools) {
      if (scope !== "user" && scope !== "project") throw new Error("Unsupported Qwen installation scope")
      const disk = await getDisk(tools)
      const initialRoots = await preflight(disk)
      await checkedSource(disk, initialRoots, name)
      if (scope === "project" && initialRoots.workspaceCanonical == null) throw new Error("No workspace selected")
      const initialState = await initialSnapshot(disk, initialRoots, await disk.read(initialRoots, stateRef))
      const initialOwners = ownersOf(await disk.read(initialRoots, ownerRef))
      const initialId = await qwenLocalIdentity(name)
      const initialPolicy = initialState.extensions[initialId]
      if (Object.entries(initialState.extensions).some(([otherId, policy]) => otherId !== initialId && policy.name.toLowerCase() === name.toLowerCase())) throw new Error("Another Qwen extension has this name")
      if (initialPolicy) {
        if (initialPolicy.name !== name) throw new Error("Qwen extension identity does not match the package")
        await owned(disk, initialRoots, initialState, initialOwners, initialId)
      } else {
        await disk.path(initialRoots, plugins(name))
        if ((await disk.list(initialRoots, plugins(""))).some(entry => entry.name === name)) throw new Error("An unmanaged Qwen extension already exists")
      }
      return withLease(disk, async roots => {
        const source = await checkedSource(disk, roots, name), state = await disk.read(roots, stateRef)
        const snapshot = await initialSnapshot(disk, roots, state), ownersText = await disk.read(roots, ownerRef), owners = ownersOf(ownersText)
        const id = await qwenLocalIdentity(name), previous = snapshot.extensions[id]
        if (Object.entries(snapshot.extensions).some(([otherId, policy]) => otherId !== id && policy.name.toLowerCase() === name.toLowerCase())) throw new Error("Another Qwen extension has this name")
        if (previous && previous.name !== name) throw new Error("Qwen extension identity does not match the package")
        const oldHash = previous ? (await owned(disk, roots, snapshot, owners, id)).hash : null
        if (!previous) {
          await disk.path(roots, plugins(name))
          if ((await disk.list(roots, plugins(""))).some(entry => entry.name === name)) throw new Error("An unmanaged Qwen extension already exists")
        }
        if (previous && oldHash === source.snapshot) {
          const location = await disk.path(roots, plugins(name))
          if (scope === "user") return report([], location)
          if (roots.workspaceCanonical == null) throw new Error("No workspace selected")
          const activated = await qwenSetActivation(snapshot, id, name, roots.workspaceCanonical, true)
          const result = await disk.journalCommit(roots, await recipeOf(disk, roots, snapshot, activated, state, []))
          return report(result.warnings, location)
        }
        const next = structuredClone(snapshot)
        next.generation++
        if (!Number.isSafeInteger(next.generation)) throw new Error("Qwen generation overflow")
        if (previous) {
          next.extensions[id] = { ...previous, artifactDirectory: name, artifactGeneration: next.generation }
          delete next.extensions[id].preserveActivationOnNextInstall
        } else {
          if (scope === "project" && roots.workspaceCanonical == null) throw new Error("No workspace selected")
          const remainder = next.legacyProjectionRemainder as Record<string, { overrides: string[] }> | undefined
          const inherited = Object.entries(remainder ?? {}).find(([heldName]) => heldName.toLowerCase() === name.toLowerCase())?.[1].overrides ?? []
          next.extensions[id] = { name, defaultActivation: scope === "user" ? "enabled" : "disabled", workspaceOverrides: scope === "project" ? { [roots.workspaceCanonical!]: "enabled" } : {}, artifactDirectory: name, artifactGeneration: next.generation, ...(inherited.length ? { legacyPathRules: [...inherited] } : {}) }
          if (remainder) {
            const represented = new Set(Object.values(next.extensions).map(policy => policy.name.toLowerCase()))
            next.legacyProjectionRemainder = Object.fromEntries(Object.entries(remainder).filter(([heldName]) => !represented.has(heldName.toLowerCase())))
          }
        }
        next.legacyProjectionHash = await qwenProjectionHash(qwenProjection(next))
        const generations = owners.entries[id] ?? {}
        const existing = generations[String(next.generation)]
        if (existing && existing !== source.snapshot) throw new Error("Qwen ownership generation conflicts")
        owners.entries[id] = { ...generations, [String(next.generation)]: source.snapshot }
        const change = { ref: ownerRef, before: ownersText, after: JSON.stringify(owners, null, 2) }
        const artifact = { operation: "copy" as const, name, destination: name, before: oldHash, sourceSnapshot: source.snapshot, backup: config("unused"), manifests: ["qwen-extension.json"] }
        const location = await disk.path(roots, plugins(name))
        const result = await disk.journalCommit(roots, await recipeOf(disk, roots, snapshot, next, state, [change], artifact))
        return report(result.warnings, location)
      })
    },
    async setEnabled(id, scope, enabled, tools) {
      if (scope !== "user" && scope !== "project") throw new Error("Unsupported Qwen activation scope")
      const disk = await getDisk(tools)
      await preflight(disk)
      return withLease(disk, async roots => {
        const state = await disk.read(roots, stateRef)
        if (state === null) throw new Error("Qwen extension state is missing")
        const snapshot = parseQwenSnapshot(state), owners = ownersOf(await disk.read(roots, ownerRef))
        const item = await owned(disk, roots, snapshot, owners, id)
        if (scope === "project" && roots.workspaceCanonical == null) throw new Error("No workspace selected")
        const next = await qwenSetActivation(snapshot, id, item.name, scope === "user" ? null : roots.workspaceCanonical!, enabled)
        const result = await disk.journalCommit(roots, await recipeOf(disk, roots, snapshot, next, state, []))
        return report(result.warnings)
      })
    },
    async clearEnabled(id, scope, tools) {
      if (scope !== "project") throw new Error("Only a workspace override can be cleared")
      const disk = await getDisk(tools)
      await preflight(disk)
      return withLease(disk, async roots => {
        if (roots.workspace === null || roots.workspaceCanonical == null) throw new Error("No workspace selected")
        const state = await disk.read(roots, stateRef)
        if (state === null) throw new Error("Qwen extension state is missing")
        const snapshot = parseQwenSnapshot(state), owners = ownersOf(await disk.read(roots, ownerRef))
        const item = await owned(disk, roots, snapshot, owners, id)
        const next = await qwenClearWorkspaceActivation(snapshot, id, item.name, roots.workspace, roots.workspaceCanonical)
        const result = await disk.journalCommit(roots, await recipeOf(disk, roots, snapshot, next, state, []))
        return report(result.warnings)
      })
    },
    async remove(id, scope, tools) {
      if (scope !== "user") throw new Error("Workspace policy cannot remove a shared Qwen extension")
      const disk = await getDisk(tools)
      await preflight(disk)
      return withLease(disk, async roots => {
        const state = await disk.read(roots, stateRef)
        if (state === null) throw new Error("Qwen extension state is missing")
        const snapshot = parseQwenSnapshot(state), ownersText = await disk.read(roots, ownerRef), owners = ownersOf(ownersText)
        const item = await owned(disk, roots, snapshot, owners, id)
        const next = structuredClone(snapshot); delete next.extensions[id]; next.generation++
        if (!Number.isSafeInteger(next.generation)) throw new Error("Qwen generation overflow")
        next.legacyProjectionHash = await qwenProjectionHash(qwenProjection(next))
        delete owners.entries[id]
        const artifact = { operation: "remove" as const, name: item.name, destination: item.name, before: item.hash, backup: config("unused") }
        const recipe = await recipeOf(disk, roots, snapshot, next, state, [], artifact)
        recipe.after = [...recipe.after, { ref: ownerRef, before: ownersText, after: JSON.stringify(owners, null, 2) }]
        const result = await disk.journalCommit(roots, recipe)
        return report(result.warnings)
      })
    },
  }
}
