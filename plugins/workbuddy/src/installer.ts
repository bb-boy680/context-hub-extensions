import type {
  PluginDisk,
  PluginDiskChange,
  PluginDiskRef,
  PluginDiskRoots,
  PluginHeld,
  PluginInstaller,
  PluginJsonTools,
  PluginPlace,
  PluginTools,
} from "./contracts.ts"
import { WORKBUDDY_ID, PLUGIN_ROOTS } from "./locations.ts"
import {
  effective,
  heldFromState,
  marketplacePack,
  readState,
  sameProject,
  type InstalledRecord,
  type PluginState,
} from "./plugin-state.ts"

const LABEL = "WorkBuddy"
const MARKETPLACE = "context-hub"
const PLACES: readonly PluginPlace[] = [
  { id: "workbuddy-user", label: LABEL, scope: "global", scopeWord: "user", switchable: true, file: ".workbuddy/settings.json" },
  { id: "workbuddy-project", label: LABEL, scope: "workspace", scopeWord: "project", switchable: true, file: ".workbuddy/settings.json", overrides: ["user"] },
]
const SETTINGS: Record<string, PluginDiskRef> = {
  user: { root: "config", path: "settings.json" },
  project: { root: "workspace", path: ".workbuddy/settings.json" },
  local: { root: "workspace", path: ".workbuddy/settings.local.json" },
}

function diskOf(tools: PluginTools): PluginDisk {
  if (tools.disk === undefined) throw new Error("This Context Hub version does not support plugin file operations")
  return tools.disk
}

async function withPacks(tools: PluginTools, packs: PluginHeld[]): Promise<PluginHeld[]> {
  return Promise.all(packs.map(async (pack) => pack.source === undefined
    ? pack
    : { ...pack, pack: await tools.describe(pack.source.path, pack.name).catch(() => pack.pack) }))
}

function join(root: string, relative: string): string {
  const separator = root.includes("\\") ? "\\" : "/"
  return `${root.replace(/[\\/]+$/, "")}${separator}${relative.replace(/\//g, separator)}`
}

function normalized(value: string, platform: PluginDiskRoots["platform"]): string {
  const clean = value.replace(/\\/g, "/").replace(/\/+$/, "")
  return platform === "win32" ? clean.toLowerCase() : clean
}

function versionSegment(version: string): string {
  if (version === "") throw new Error("plugin version is required")
  if (/[<>:"|?*\\/]/.test(version) || [...version].some((char) => char.codePointAt(0)! < 32) || version.startsWith(".") || version !== version.trim() ||
      /[. ]$/.test(version) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(version)) {
    throw new Error(`invalid plugin version: ${version}`)
  }
  return version
}

function safeSegment(value: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value) && !/[. ]$/.test(value) &&
    !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(value)
}

function validateManifest(manifest: Record<string, unknown>, name: string): string {
  if (!safeSegment(name) || manifest.name !== name || typeof manifest.version !== "string") {
    throw new Error("native manifest with matching name and version is required")
  }
  const version = versionSegment(manifest.version)
  for (const key of ["skills", "commands", "agents", "hooks", "mcpServers"]) {
    const value = manifest[key]
    const paths = typeof value === "string" ? [value] : Array.isArray(value) ? value : []
    for (const path of paths) {
      if (typeof path !== "string" || path.includes("\\") || path.startsWith("/") ||
          /^[A-Za-z]:/.test(path) || path.split("/").some((part) => part === ".." || part === "")) {
        throw new Error(`unsafe ${key} path in native manifest`)
      }
    }
  }
  if (manifest.userConfig !== undefined || manifest.connectors !== undefined) throw new Error("plugin configuration and connectors are not supported")
  return version
}

function manifestOf(json: PluginJsonTools, raw: string | null, where: string): Record<string, unknown> | null {
  if (raw === null) return null
  try {
    return json.readJsonObject(raw) ?? {}
  } catch (error) {
    throw new Error(`cannot read ${where}: ${error instanceof Error ? error.message : String(error)}`, { cause: error })
  }
}

function dependenciesOf(manifest: Record<string, unknown> | null): string[] {
  const value = manifest?.dependencies
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new Error("invalid plugin dependencies")
  return value.map((one) => {
    if (typeof one === "string" && one !== "") return one
    if (typeof one === "object" && one !== null && typeof (one as { name?: unknown }).name === "string") {
      return (one as { name: string }).name
    }
    throw new Error("invalid plugin dependency")
  })
}

function writable(scope: string, id: string): void {
  if (scope !== "user" && scope !== "project") throw new Error(`${scope} installs are read-only`)
  if (id.lastIndexOf("@") <= 0 || id.endsWith("@")) throw new Error("invalid plugin identity")
  const marketplace = id.slice(id.lastIndexOf("@") + 1)
  if (marketplace !== MARKETPLACE) throw new Error(`${marketplace} plugins are read-only`)
}

function assertUnmanaged(state: PluginState, id: string): void {
  if (state.index.plugins[id]?.some((record) => record.scope === "managed")) {
    throw new Error(`${id} is controlled by managed policy`)
  }
}

function atScope(records: readonly InstalledRecord[], scope: string, roots: PluginDiskRoots): InstalledRecord[] {
  return records.filter((record) => record.scope === scope &&
    (scope === "user" || (record.projectPath !== undefined && roots.workspace !== null && sameProject(record.projectPath, roots.workspace, roots.platform))))
}

function withSwitch(state: PluginState, scope: string, id: string, on: boolean | undefined, json: PluginJsonTools): PluginDiskChange | null {
  const ref = SETTINGS[scope]
  if (ref === undefined) throw new Error(`${scope} installs are read-only`)
  const raw = state.raw[scope as "user"]
  const recorded = state.switches[scope]?.[id]
  if (recorded === on) return null
  return { ref, before: raw, after: json.editJson(raw, ["enabledPlugins", id], on) }
}

async function sourceOf(disk: PluginDisk, roots: PluginDiskRoots, json: PluginJsonTools, state: PluginState, id: string, record: InstalledRecord | undefined): Promise<string | null> {
  const marketplace = id.slice(id.lastIndexOf("@") + 1)
  return await marketplacePack(disk, roots, json, state.markets[marketplace], id.slice(0, id.lastIndexOf("@"))) ??
    record?.installPath ?? null
}

async function dependenciesAt(disk: PluginDisk, roots: PluginDiskRoots, json: PluginJsonTools, directory: string | null): Promise<string[]> {
  if (directory === null) throw new Error("cannot verify plugin dependencies without its source directory")
  const raw = await disk.readExternal(roots, directory, ".codebuddy-plugin/plugin.json")
  const manifest = manifestOf(json, raw, "plugin.json")
  if (manifest === null) throw new Error(`cannot verify dependencies without native manifest: ${directory}`)
  return dependenciesOf(manifest)
}

async function assertNotRequired(disk: PluginDisk, roots: PluginDiskRoots, json: PluginJsonTools, state: PluginState, id: string): Promise<void> {
  const declared = await heldFromState(disk, roots, json, state)
  for (const [other, records] of Object.entries(state.index.plugins)) {
    if (other === id || effective(state.switches, other) === false) continue
    const record = records.find((entry) => entry.scope === "user" ||
      ((entry.scope === "project" || entry.scope === "local") && roots.workspace !== null &&
       entry.projectPath !== undefined && sameProject(entry.projectPath, roots.workspace, roots.platform)))
    if (record === undefined) continue
    const source = await sourceOf(disk, roots, json, state, other, record)
    if (source === null) throw new Error(`cannot check dependencies of ${other}`)
    const dependencies = await dependenciesAt(disk, roots, json, source)
    const marketplace = other.slice(other.lastIndexOf("@") + 1)
    if (dependencies.some((dependency) => (dependency.includes("@") ? dependency : `${dependency}@${marketplace}`) === id)) {
      throw new Error(`${id} is required by enabled plugin ${other}`)
    }
  }
  for (const entry of declared) {
    if (entry.origin !== "declaration" || entry.id === id || !entry.enabled) continue
    const dependencies = await dependenciesAt(disk, roots, json, entry.source?.path ?? null)
    if (dependencies.some((dependency) => (dependency.includes("@") ? dependency : `${dependency}@${entry.marketplace}`) === id)) {
      throw new Error(`${id} is required by enabled plugin ${entry.id}`)
    }
  }
}

function marketChanges(state: PluginState, root: string, json: PluginJsonTools, now: string, statePlatform: PluginDiskRoots["platform"]): PluginDiskChange[] {
  const changes: PluginDiskChange[] = []
  const known = state.markets[MARKETPLACE]
  const knownSource = typeof known === "object" && known !== null ? (known as { source?: unknown }).source : undefined
  const knownPath = typeof knownSource === "object" && knownSource !== null && (knownSource as { source?: unknown }).source === "directory"
    ? (knownSource as { path?: unknown }).path : undefined
  if (known === undefined) {
    changes.push({
      ref: { root: "plugins", path: "known_marketplaces.json" },
      before: state.raw.markets,
      after: json.editJson(state.raw.markets, [MARKETPLACE], {
        source: { source: "directory", path: root },
        installLocation: root,
        lastUpdated: now,
      }),
    })
  } else if (typeof knownPath !== "string" || normalized(knownPath, statePlatform) !== normalized(root, statePlatform)) {
    throw new Error(`${MARKETPLACE} marketplace already points at another directory`)
  }
  const declared = state.settings.user.extraKnownMarketplaces
  const declaration = typeof declared === "object" && declared !== null ? (declared as Record<string, unknown>)[MARKETPLACE] : undefined
  const declaredSource = typeof declaration === "object" && declaration !== null ? (declaration as { source?: unknown }).source : undefined
  const declaredPath = typeof declaredSource === "object" && declaredSource !== null && (declaredSource as { source?: unknown }).source === "directory"
    ? (declaredSource as { path?: unknown }).path : undefined
  if (declaration === undefined) {
    changes.push({
      ref: SETTINGS.user,
      before: state.raw.user,
      after: json.editJson(state.raw.user, ["extraKnownMarketplaces", MARKETPLACE], { source: { source: "directory", path: root } }),
    })
  } else if (typeof declaredPath !== "string" || normalized(declaredPath, statePlatform) !== normalized(root, statePlatform)) {
    throw new Error(`${MARKETPLACE} marketplace is already declared at another directory`)
  }
  return changes
}

function indexChange(state: PluginState, id: string, records: InstalledRecord[] | undefined, json: PluginJsonTools): PluginDiskChange {
  const ref: PluginDiskRef = { root: "plugins", path: "installed_plugins.json" }
  const before = state.raw.index
  return {
    ref,
    before,
    after: before === null
      ? `${JSON.stringify({ version: 2, plugins: records === undefined ? {} : { [id]: records } }, null, 2)}\n`
      : json.editJson(before, ["plugins", id], records),
  }
}

export function createWorkBuddyInstaller(json: PluginJsonTools): PluginInstaller {
  return {
    id: WORKBUDDY_ID,
    label: LABEL,
    places: PLACES,

    async available(tools) {
      await diskOf(tools).roots(PLUGIN_ROOTS)
      return true
    },

    async held(tools) {
      const disk = diskOf(tools)
      const roots = await disk.roots(PLUGIN_ROOTS)
      const state = await readState(disk, roots, json)
      return withPacks(tools, await heldFromState(disk, roots, json, state))
    },

    async switches(tools) {
      const disk = diskOf(tools)
      return (await readState(disk, await disk.roots(PLUGIN_ROOTS), json)).switches
    },

    async install(name, scope, tools) {
      const disk = diskOf(tools)
      if (scope !== "user" && scope !== "project") throw new Error(`${scope} installs are read-only`)
      const root = await tools.root()
      return disk.run(PLUGIN_ROOTS, async (roots) => {
        if (normalized(root, roots.platform) !== normalized(roots.library, roots.platform)) {
          throw new Error("plugin library changed; retry the installation")
        }
        if (scope === "project" && roots.workspace === null) throw new Error("Select a workspace before installing into the project")
        const state = await readState(disk, roots, json)
        const id = `${name}@${MARKETPLACE}`
        writable(scope, id)
        assertUnmanaged(state, id)
        if (!safeSegment(name)) throw new Error("invalid plugin name")
        const sourceSnapshot = await disk.snapshotDirectory(roots, { root: "library", path: name })
        if (sourceSnapshot === null) throw new Error("plugin source is missing")
        const manifest = manifestOf(
          json,
          await disk.read(roots, { root: "library", path: `${name}/.codebuddy-plugin/plugin.json` }),
          `${name}/.codebuddy-plugin/plugin.json`,
        )
        if (manifest === null) throw new Error("native manifest is required")
        const version = validateManifest(manifest, name)
        const dependencies = dependenciesOf(manifest)
        if (dependencies.length > 0) {
          throw new Error(`${name} depends on ${dependencies.join(", ")}; dependencies cannot be installed from files yet`)
        }
        const now = new Date().toISOString()
        const marketUpdates = marketChanges(state, root, json, now, roots.platform)
        const packs = await tools.packs()
        await tools.syncMarketplace([{ path: ".codebuddy-plugin/marketplace.json", document: {
          name: MARKETPLACE, description: "Plugin packs collected by Context Hub.", owner: { name: "Context Hub" },
          plugins: packs.map((pack) => ({ name: pack.name, source: `./${pack.name}`, description: pack.description, version: pack.version })),
        } }])
        const index = manifestOf(json, await disk.read(roots, { root: "library", path: ".codebuddy-plugin/marketplace.json" }), "marketplace.json")
        if (!Array.isArray(index?.plugins)) throw new Error("invalid Hub marketplace index")
        const listed = index.plugins.find((entry) => typeof entry === "object" && entry !== null && (entry as { name?: unknown }).name === name)
        if (listed === undefined) throw new Error(`${name} is not listed in the Hub marketplace`)

        const existing = state.index.plugins[id] ?? []
        const current = atScope(existing, scope, roots)[0]
        const destination = `cache/${MARKETPLACE}/${name}/${versionSegment(version)}`
        const record: InstalledRecord = {
          ...current,
          scope,
          ...(scope === "project" ? { projectPath: current?.projectPath ?? roots.workspace! } : {}),
          installPath: join(roots.plugins, destination),
          version,
          installedAt: current?.installedAt ?? now,
          lastUpdated: current?.installPath === join(roots.plugins, destination) && current.version === version
            ? (current.lastUpdated ?? now)
            : now,
        }
        const records = current === undefined
          ? [...existing, record]
          : existing.map((one) => (one === current ? record : one))
        const changes: PluginDiskChange[] = [
          ...marketUpdates,
          indexChange(state, id, records, json),
        ]
        const defaultEnabled = manifest.defaultEnabled !== false
        const enabled = state.switches[scope]?.[id] === undefined ? withSwitch(state, scope, id, defaultEnabled, json) : null
        if (enabled !== null) {
          const prior = changes.find((change) => change.ref.root === enabled.ref.root && change.ref.path === enabled.ref.path)
          if (prior === undefined) changes.push(enabled)
          else prior.after = json.editJson(prior.after, ["enabledPlugins", id], defaultEnabled)
        }
        const before = await disk.snapshotDirectory(roots, { root: "plugins", path: destination })
        await disk.commit(roots, changes, { name, destination, before, sourceSnapshot, manifests: [".codebuddy-plugin/plugin.json"] })
        return {
          message: `${name} installed for WorkBuddy at ${scope} scope`,
          location: record.installPath,
        }
      })
    },

    async remove(id, scope, tools) {
      const disk = diskOf(tools)
      writable(scope, id)
      return disk.run(PLUGIN_ROOTS, async (roots) => {
        if (scope === "project" && roots.workspace === null) throw new Error("Select a workspace before removing a project installation")
        const state = await readState(disk, roots, json)
        assertUnmanaged(state, id)
        const existing = state.index.plugins[id] ?? []
        const targets = atScope(existing, scope, roots)
        if (targets.length === 0) {
          const declared = (await heldFromState(disk, roots, json, state)).some((entry) =>
            entry.id === id && entry.scope === scope && entry.origin === "declaration" && !entry.readOnly)
          if (!declared) throw new Error(`${id} is not installed for WorkBuddy at ${scope} scope`)
          await assertNotRequired(disk, roots, json, state, id)
          const change = withSwitch(state, scope, id, undefined, json)
          if (change !== null) await disk.commit(roots, [change])
          return { message: `${id} removed from WorkBuddy at ${scope} scope` }
        }
        const remaining = existing.filter((record) => !targets.includes(record))
        await assertNotRequired(disk, roots, json, state, id)
        const changes: PluginDiskChange[] = []
        const disabled = withSwitch(state, scope, id, undefined, json)
        if (disabled !== null) changes.push(disabled)
        changes.push(indexChange(state, id, remaining.length === 0 ? undefined : remaining, json))
        await disk.commit(roots, changes)
        return { message: `${id} removed from WorkBuddy at ${scope} scope` }
      })
    },

    async setEnabled(id, scope, on, tools) {
      const disk = diskOf(tools)
      writable(scope, id)
      return disk.run(PLUGIN_ROOTS, async (roots) => {
        if (scope === "project" && roots.workspace === null) throw new Error("Select a workspace before switching a project installation")
        const state = await readState(disk, roots, json)
        assertUnmanaged(state, id)
        if (scope === "project" && state.switches.local?.[id] !== undefined && state.switches.local[id] !== on) {
          throw new Error(`${id} is controlled by .workbuddy/settings.local.json`)
        }
        if (scope === "user" && [state.switches.local?.[id], state.switches.project?.[id]].some((value) => value !== undefined && value !== on)) {
          throw new Error(`${id} has a conflicting workspace setting`)
        }
        const records = state.index.plugins[id]
        const here = records === undefined ? [] : atScope(records, scope, roots)
        const declared = state.switches[scope]?.[id] !== undefined
        if (here.length === 0 && !declared && !(scope === "project" && records?.some((record) => record.scope === "user"))) {
          throw new Error(`${id} is not installed for WorkBuddy at ${scope} scope`)
        }
        if (on) {
          const dependencies = await dependenciesAt(disk, roots, json, await sourceOf(disk, roots, json, state, id, here[0] ?? records?.[0]))
          if (dependencies.length > 0) {
            throw new Error(`${id} depends on ${dependencies.join(", ")}; dependencies cannot be installed from files yet`)
          }
        } else {
          await assertNotRequired(disk, roots, json, state, id)
        }
        const change = withSwitch(state, scope, id, on, json)
        if (change !== null) await disk.commit(roots, [change])
        return { message: `${id} ${on ? "enabled" : "disabled"} for WorkBuddy at ${scope} scope` }
      })
    },
  }
}
