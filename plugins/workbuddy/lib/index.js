// src/locations.ts
var WORKBUDDY_ID = "hub.target.workbuddy";
var SKILL_DIR = ".workbuddy/skills";
var MCP_FILE = ".workbuddy/mcp.json";
var COMMAND_DIR = ".codebuddy/commands";
var INSTRUCTION_FILE = ".codebuddy/CODEBUDDY.md";
var PLUGIN_ROOTS = {
  home: ".workbuddy",
  state: "plugins",
  config: { write: ["settings.json"], read: [] },
  stateFiles: { write: ["installed_plugins.json", "known_marketplaces.json", "cache/*/*/*"], read: [] },
  workspace: { write: [".workbuddy/settings.json"], read: [".workbuddy/settings.local.json"] },
  library: { write: [], read: [".codebuddy-plugin/marketplace.json", "*", "*/.codebuddy-plugin/plugin.json"] },
  external: [".codebuddy-plugin/marketplace.json", ".codebuddy-plugin/plugin.json"]
};

// src/plugin-state.ts
var INDEX = { root: "plugins", path: "installed_plugins.json" };
var MARKETS = { root: "plugins", path: "known_marketplaces.json" };
var USER_SETTINGS = { root: "config", path: "settings.json" };
var PROJECT_SETTINGS = { root: "workspace", path: ".workbuddy/settings.json" };
var LOCAL_SETTINGS = { root: "workspace", path: ".workbuddy/settings.local.json" };
function object(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function document(json, raw, name) {
  if (raw !== null && raw.trim() === "") throw new Error(`${name} is empty`);
  try {
    return json.readJsonObject(raw) ?? {};
  } catch (error) {
    throw new Error(`cannot read ${name}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
}
function installedIndex(json, raw) {
  if (raw === null) return { document: { version: 2, plugins: {} }, plugins: {} };
  const parsed = document(json, raw, "installed_plugins.json");
  if (parsed.version !== 2) throw new Error("unsupported installed_plugins.json version");
  if (!object(parsed.plugins)) throw new Error("invalid installed_plugins.json plugins");
  const plugins = {};
  for (const [id, value] of Object.entries(parsed.plugins)) {
    const records = value;
    if (!Array.isArray(records) || records.some((entry) => !object(entry) || typeof entry.scope !== "string" || entry.installPath !== void 0 && typeof entry.installPath !== "string" || entry.version !== void 0 && typeof entry.version !== "string" || (entry.scope === "project" || entry.scope === "local") && typeof entry.projectPath !== "string")) {
      throw new Error(`invalid installed plugin record: ${id}`);
    }
    plugins[id] = records;
  }
  return { document: parsed, plugins };
}
function settingsSwitches(settings, name) {
  const enabled = settings.enabledPlugins;
  if (enabled === void 0) return {};
  if (!object(enabled) || Object.values(enabled).some((value) => typeof value !== "boolean")) {
    throw new Error(`invalid enabledPlugins in ${name}`);
  }
  return enabled;
}
async function readState(disk, roots, json) {
  const [index, markets, user, project, local] = await Promise.all([
    disk.read(roots, INDEX),
    disk.read(roots, MARKETS),
    disk.read(roots, USER_SETTINGS),
    roots.workspace === null ? null : disk.read(roots, PROJECT_SETTINGS),
    roots.workspace === null ? null : disk.read(roots, LOCAL_SETTINGS)
  ]);
  const settings = {
    user: document(json, user, "user settings"),
    project: document(json, project, "project settings"),
    local: document(json, local, "local settings")
  };
  return {
    raw: { index, markets, user, project, local },
    index: installedIndex(json, index),
    markets: document(json, markets, "known_marketplaces.json"),
    settings,
    switches: {
      user: settingsSwitches(settings.user, "user settings"),
      project: settingsSwitches(settings.project, "project settings"),
      local: settingsSwitches(settings.local, "local settings")
    }
  };
}
function sameProject(a, b, platform) {
  const normalize = (value) => {
    const clean = value.replace(/\\/g, "/").replace(/\/+$/, "") || "/";
    return platform === "win32" ? clean.toLowerCase() : clean;
  };
  return normalize(a) === normalize(b);
}
function effective(switches, id) {
  const values = [switches.local?.[id], switches.project?.[id], switches.user?.[id]].filter((value) => value !== void 0);
  return values.length > 0 && values.every((value) => value === values[0]) ? values[0] : void 0;
}
function marketplaceLocation(market) {
  if (!object(market) || !object(market.source) || market.source.source !== "directory") return null;
  return typeof market.source.path === "string" ? market.source.path : null;
}
async function marketplacePack(disk, roots, json, market, name) {
  const directory = marketplaceLocation(market);
  if (directory === null) return null;
  const raw = await disk.readExternal(roots, directory, ".codebuddy-plugin/marketplace.json");
  if (raw === null) return null;
  const metadata = document(json, raw, "marketplace.json");
  if (!Array.isArray(metadata.plugins)) throw new Error("invalid marketplace plugins");
  const entry = metadata.plugins.find((one) => object(one) && one.name === name);
  if (!object(entry) || typeof entry.source !== "string" || !entry.source.startsWith("./")) return null;
  const relative = entry.source.slice(2);
  return relative === "" ? directory : disk.external(roots, directory, relative);
}
var EMPTY_PACK = { name: "", version: "", description: "" };
async function heldFromState(disk, roots, json, state) {
  const found = [];
  const seen = /* @__PURE__ */ new Set();
  const managed = new Set(Object.entries(state.index.plugins).filter(([, records]) => records.some((record) => record.scope === "managed")).map(([id]) => id));
  for (const [id, records] of Object.entries(state.index.plugins)) {
    const at = id.lastIndexOf("@");
    if (at <= 0 || at === id.length - 1) continue;
    const name = id.slice(0, at);
    const marketplace = id.slice(at + 1);
    for (const record of records) {
      if (record.scope === "session" || marketplace === "inline") continue;
      if ((record.scope === "project" || record.scope === "local") && (roots.workspace === null || !sameProject(record.projectPath, roots.workspace, roots.platform))) continue;
      const market = state.markets[marketplace];
      const fromMarket = marketplaceLocation(market) === null ? null : await marketplacePack(disk, roots, json, market, name).catch(() => null);
      const source = fromMarket ?? record.installPath;
      found.push({
        name,
        id,
        marketplace,
        scope: record.scope,
        version: record.version ?? "",
        enabled: effective(state.switches, id),
        origin: "record",
        readOnly: managed.has(id) || marketplace !== "context-hub" || !["user", "project"].includes(record.scope),
        ...source === void 0 ? {} : { source: { kind: "local", path: source } },
        pack: EMPTY_PACK
      });
      seen.add(`${id}\0${record.scope}`);
    }
  }
  return found;
}

// src/installer.ts
var LABEL = "WorkBuddy";
var MARKETPLACE = "context-hub";
var PLACES = [
  { id: "workbuddy-user", label: LABEL, scope: "global", scopeWord: "user", switchable: true, file: ".workbuddy/settings.json" },
  { id: "workbuddy-project", label: LABEL, scope: "workspace", scopeWord: "project", switchable: true, file: ".workbuddy/settings.json", overrides: ["user"] }
];
var SETTINGS = {
  user: { root: "config", path: "settings.json" },
  project: { root: "workspace", path: ".workbuddy/settings.json" },
  local: { root: "workspace", path: ".workbuddy/settings.local.json" }
};
function diskOf(tools) {
  if (tools.disk === void 0) throw new Error("This Context Hub version does not support plugin file operations");
  return tools.disk;
}
async function withPacks(tools, packs) {
  return Promise.all(packs.map(async (pack) => pack.source === void 0 ? pack : { ...pack, pack: await tools.describe(pack.source.path, pack.name).catch(() => pack.pack) }));
}
function join(root, relative) {
  const separator = root.includes("\\") ? "\\" : "/";
  return `${root.replace(/[\\/]+$/, "")}${separator}${relative.replace(/\//g, separator)}`;
}
function normalized(value, platform) {
  const clean = value.replace(/\\/g, "/").replace(/\/+$/, "");
  return platform === "win32" ? clean.toLowerCase() : clean;
}
function versionSegment(version) {
  if (version === "") throw new Error("plugin version is required");
  if (/[<>:"|?*\\/]/.test(version) || [...version].some((char) => char.codePointAt(0) < 32) || version.startsWith(".") || version !== version.trim() || /[. ]$/.test(version) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(version)) {
    throw new Error(`invalid plugin version: ${version}`);
  }
  return version;
}
function safeSegment(value) {
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value) && !/[. ]$/.test(value) && !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(value);
}
function validateManifest(manifest, name) {
  if (!safeSegment(name) || manifest.name !== name || typeof manifest.version !== "string") {
    throw new Error("native manifest with matching name and version is required");
  }
  const version = versionSegment(manifest.version);
  for (const key of ["skills", "commands", "agents", "hooks", "mcpServers"]) {
    const value = manifest[key];
    const paths = typeof value === "string" ? [value] : Array.isArray(value) ? value : [];
    for (const path of paths) {
      if (typeof path !== "string" || path.includes("\\") || path.startsWith("/") || /^[A-Za-z]:/.test(path) || path.split("/").some((part) => part === ".." || part === "")) {
        throw new Error(`unsafe ${key} path in native manifest`);
      }
    }
  }
  if (manifest.userConfig !== void 0 || manifest.connectors !== void 0) throw new Error("plugin configuration and connectors are not supported");
  return version;
}
function manifestOf(json, raw, where) {
  if (raw === null) return null;
  try {
    return json.readJsonObject(raw) ?? {};
  } catch (error) {
    throw new Error(`cannot read ${where}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
}
function dependenciesOf(manifest) {
  const value = manifest?.dependencies;
  if (value === void 0) return [];
  if (!Array.isArray(value)) throw new Error("invalid plugin dependencies");
  return value.map((one) => {
    if (typeof one === "string" && one !== "") return one;
    if (typeof one === "object" && one !== null && typeof one.name === "string") {
      return one.name;
    }
    throw new Error("invalid plugin dependency");
  });
}
function writable(scope, id) {
  if (scope !== "user" && scope !== "project") throw new Error(`${scope} installs are read-only`);
  if (id.lastIndexOf("@") <= 0 || id.endsWith("@")) throw new Error("invalid plugin identity");
  const marketplace = id.slice(id.lastIndexOf("@") + 1);
  if (marketplace !== MARKETPLACE) throw new Error(`${marketplace} plugins are read-only`);
}
function assertUnmanaged(state, id) {
  if (state.index.plugins[id]?.some((record) => record.scope === "managed")) {
    throw new Error(`${id} is controlled by managed policy`);
  }
}
function atScope(records, scope, roots) {
  return records.filter((record) => record.scope === scope && (scope === "user" || record.projectPath !== void 0 && roots.workspace !== null && sameProject(record.projectPath, roots.workspace, roots.platform)));
}
function withSwitch(state, scope, id, on, json) {
  const ref = SETTINGS[scope];
  if (ref === void 0) throw new Error(`${scope} installs are read-only`);
  const raw = state.raw[scope];
  const recorded = state.switches[scope]?.[id];
  if (recorded === on) return null;
  return { ref, before: raw, after: json.editJson(raw, ["enabledPlugins", id], on) };
}
async function sourceOf(disk, roots, json, state, id, record) {
  const marketplace = id.slice(id.lastIndexOf("@") + 1);
  return await marketplacePack(disk, roots, json, state.markets[marketplace], id.slice(0, id.lastIndexOf("@"))) ?? record?.installPath ?? null;
}
async function dependenciesAt(disk, roots, json, directory) {
  if (directory === null) throw new Error("cannot verify plugin dependencies without its source directory");
  const raw = await disk.readExternal(roots, directory, ".codebuddy-plugin/plugin.json");
  const manifest = manifestOf(json, raw, "plugin.json");
  if (manifest === null) throw new Error(`cannot verify dependencies without native manifest: ${directory}`);
  return dependenciesOf(manifest);
}
async function assertNotRequired(disk, roots, json, state, id) {
  const declared = await heldFromState(disk, roots, json, state);
  for (const [other, records] of Object.entries(state.index.plugins)) {
    if (other === id || effective(state.switches, other) === false) continue;
    const record = records.find((entry) => entry.scope === "user" || (entry.scope === "project" || entry.scope === "local") && roots.workspace !== null && entry.projectPath !== void 0 && sameProject(entry.projectPath, roots.workspace, roots.platform));
    if (record === void 0) continue;
    const source = await sourceOf(disk, roots, json, state, other, record);
    if (source === null) throw new Error(`cannot check dependencies of ${other}`);
    const dependencies = await dependenciesAt(disk, roots, json, source);
    const marketplace = other.slice(other.lastIndexOf("@") + 1);
    if (dependencies.some((dependency) => (dependency.includes("@") ? dependency : `${dependency}@${marketplace}`) === id)) {
      throw new Error(`${id} is required by enabled plugin ${other}`);
    }
  }
  for (const entry of declared) {
    if (entry.origin !== "declaration" || entry.id === id || !entry.enabled) continue;
    const dependencies = await dependenciesAt(disk, roots, json, entry.source?.path ?? null);
    if (dependencies.some((dependency) => (dependency.includes("@") ? dependency : `${dependency}@${entry.marketplace}`) === id)) {
      throw new Error(`${id} is required by enabled plugin ${entry.id}`);
    }
  }
}
function marketChanges(state, root, json, now, statePlatform) {
  const changes = [];
  const known = state.markets[MARKETPLACE];
  const knownSource = typeof known === "object" && known !== null ? known.source : void 0;
  const knownPath = typeof knownSource === "object" && knownSource !== null && knownSource.source === "directory" ? knownSource.path : void 0;
  if (known === void 0) {
    changes.push({
      ref: { root: "plugins", path: "known_marketplaces.json" },
      before: state.raw.markets,
      after: json.editJson(state.raw.markets, [MARKETPLACE], {
        source: { source: "directory", path: root },
        installLocation: root,
        lastUpdated: now
      })
    });
  } else if (typeof knownPath !== "string" || normalized(knownPath, statePlatform) !== normalized(root, statePlatform)) {
    throw new Error(`${MARKETPLACE} marketplace already points at another directory`);
  }
  const declared = state.settings.user.extraKnownMarketplaces;
  const declaration = typeof declared === "object" && declared !== null ? declared[MARKETPLACE] : void 0;
  const declaredSource = typeof declaration === "object" && declaration !== null ? declaration.source : void 0;
  const declaredPath = typeof declaredSource === "object" && declaredSource !== null && declaredSource.source === "directory" ? declaredSource.path : void 0;
  if (declaration === void 0) {
    changes.push({
      ref: SETTINGS.user,
      before: state.raw.user,
      after: json.editJson(state.raw.user, ["extraKnownMarketplaces", MARKETPLACE], { source: { source: "directory", path: root } })
    });
  } else if (typeof declaredPath !== "string" || normalized(declaredPath, statePlatform) !== normalized(root, statePlatform)) {
    throw new Error(`${MARKETPLACE} marketplace is already declared at another directory`);
  }
  return changes;
}
function indexChange(state, id, records, json) {
  const ref = { root: "plugins", path: "installed_plugins.json" };
  const before = state.raw.index;
  return {
    ref,
    before,
    after: before === null ? `${JSON.stringify({ version: 2, plugins: records === void 0 ? {} : { [id]: records } }, null, 2)}
` : json.editJson(before, ["plugins", id], records)
  };
}
function createWorkBuddyInstaller(json) {
  return {
    id: WORKBUDDY_ID,
    label: LABEL,
    places: PLACES,
    async available(tools) {
      await diskOf(tools).roots(PLUGIN_ROOTS);
      return true;
    },
    async held(tools) {
      const disk = diskOf(tools);
      const roots = await disk.roots(PLUGIN_ROOTS);
      const state = await readState(disk, roots, json);
      return withPacks(tools, await heldFromState(disk, roots, json, state));
    },
    async switches(tools) {
      const disk = diskOf(tools);
      return (await readState(disk, await disk.roots(PLUGIN_ROOTS), json)).switches;
    },
    async install(name, scope, tools) {
      const disk = diskOf(tools);
      if (scope !== "user" && scope !== "project") throw new Error(`${scope} installs are read-only`);
      const root = await tools.root();
      return disk.run(PLUGIN_ROOTS, async (roots) => {
        if (normalized(root, roots.platform) !== normalized(roots.library, roots.platform)) {
          throw new Error("plugin library changed; retry the installation");
        }
        if (scope === "project" && roots.workspace === null) throw new Error("Select a workspace before installing into the project");
        const state = await readState(disk, roots, json);
        const id = `${name}@${MARKETPLACE}`;
        writable(scope, id);
        assertUnmanaged(state, id);
        if (!safeSegment(name)) throw new Error("invalid plugin name");
        const sourceSnapshot = await disk.snapshotDirectory(roots, { root: "library", path: name });
        if (sourceSnapshot === null) throw new Error("plugin source is missing");
        const manifest = manifestOf(
          json,
          await disk.read(roots, { root: "library", path: `${name}/.codebuddy-plugin/plugin.json` }),
          `${name}/.codebuddy-plugin/plugin.json`
        );
        if (manifest === null) throw new Error("native manifest is required");
        const version = validateManifest(manifest, name);
        const dependencies = dependenciesOf(manifest);
        if (dependencies.length > 0) {
          throw new Error(`${name} depends on ${dependencies.join(", ")}; dependencies cannot be installed from files yet`);
        }
        const now = (/* @__PURE__ */ new Date()).toISOString();
        const marketUpdates = marketChanges(state, root, json, now, roots.platform);
        const packs = await tools.packs();
        await tools.syncMarketplace([{ path: ".codebuddy-plugin/marketplace.json", document: {
          name: MARKETPLACE,
          description: "Plugin packs collected by Context Hub.",
          owner: { name: "Context Hub" },
          plugins: packs.map((pack) => ({ name: pack.name, source: `./${pack.name}`, description: pack.description, version: pack.version }))
        } }]);
        const index = manifestOf(json, await disk.read(roots, { root: "library", path: ".codebuddy-plugin/marketplace.json" }), "marketplace.json");
        if (!Array.isArray(index?.plugins)) throw new Error("invalid Hub marketplace index");
        const listed = index.plugins.find((entry) => typeof entry === "object" && entry !== null && entry.name === name);
        if (listed === void 0) throw new Error(`${name} is not listed in the Hub marketplace`);
        const existing = state.index.plugins[id] ?? [];
        const current = atScope(existing, scope, roots)[0];
        const destination = `cache/${MARKETPLACE}/${name}/${versionSegment(version)}`;
        const record = {
          ...current,
          scope,
          ...scope === "project" ? { projectPath: current?.projectPath ?? roots.workspace } : {},
          installPath: join(roots.plugins, destination),
          version,
          installedAt: current?.installedAt ?? now,
          lastUpdated: current?.installPath === join(roots.plugins, destination) && current.version === version ? current.lastUpdated ?? now : now
        };
        const records = current === void 0 ? [...existing, record] : existing.map((one) => one === current ? record : one);
        const changes = [
          ...marketUpdates,
          indexChange(state, id, records, json)
        ];
        const defaultEnabled = manifest.defaultEnabled !== false;
        const enabled = state.switches[scope]?.[id] === void 0 ? withSwitch(state, scope, id, defaultEnabled, json) : null;
        if (enabled !== null) {
          const prior = changes.find((change) => change.ref.root === enabled.ref.root && change.ref.path === enabled.ref.path);
          if (prior === void 0) changes.push(enabled);
          else prior.after = json.editJson(prior.after, ["enabledPlugins", id], defaultEnabled);
        }
        const before = await disk.snapshotDirectory(roots, { root: "plugins", path: destination });
        await disk.commit(roots, changes, { name, destination, before, sourceSnapshot, manifests: [".codebuddy-plugin/plugin.json"] });
        return {
          message: `${name} installed for WorkBuddy at ${scope} scope`,
          location: record.installPath
        };
      });
    },
    async remove(id, scope, tools) {
      const disk = diskOf(tools);
      writable(scope, id);
      return disk.run(PLUGIN_ROOTS, async (roots) => {
        if (scope === "project" && roots.workspace === null) throw new Error("Select a workspace before removing a project installation");
        const state = await readState(disk, roots, json);
        assertUnmanaged(state, id);
        const existing = state.index.plugins[id] ?? [];
        const targets = atScope(existing, scope, roots);
        if (targets.length === 0) {
          const declared = (await heldFromState(disk, roots, json, state)).some((entry) => entry.id === id && entry.scope === scope && entry.origin === "declaration" && !entry.readOnly);
          if (!declared) throw new Error(`${id} is not installed for WorkBuddy at ${scope} scope`);
          await assertNotRequired(disk, roots, json, state, id);
          const change = withSwitch(state, scope, id, void 0, json);
          if (change !== null) await disk.commit(roots, [change]);
          return { message: `${id} removed from WorkBuddy at ${scope} scope` };
        }
        const remaining = existing.filter((record) => !targets.includes(record));
        await assertNotRequired(disk, roots, json, state, id);
        const changes = [];
        const disabled = withSwitch(state, scope, id, void 0, json);
        if (disabled !== null) changes.push(disabled);
        changes.push(indexChange(state, id, remaining.length === 0 ? void 0 : remaining, json));
        await disk.commit(roots, changes);
        return { message: `${id} removed from WorkBuddy at ${scope} scope` };
      });
    },
    async setEnabled(id, scope, on, tools) {
      const disk = diskOf(tools);
      writable(scope, id);
      return disk.run(PLUGIN_ROOTS, async (roots) => {
        if (scope === "project" && roots.workspace === null) throw new Error("Select a workspace before switching a project installation");
        const state = await readState(disk, roots, json);
        assertUnmanaged(state, id);
        if (scope === "project" && state.switches.local?.[id] !== void 0 && state.switches.local[id] !== on) {
          throw new Error(`${id} is controlled by .workbuddy/settings.local.json`);
        }
        if (scope === "user" && [state.switches.local?.[id], state.switches.project?.[id]].some((value) => value !== void 0 && value !== on)) {
          throw new Error(`${id} has a conflicting workspace setting`);
        }
        const records = state.index.plugins[id];
        const here = records === void 0 ? [] : atScope(records, scope, roots);
        const declared = state.switches[scope]?.[id] !== void 0;
        if (here.length === 0 && !declared && !(scope === "project" && records?.some((record) => record.scope === "user"))) {
          throw new Error(`${id} is not installed for WorkBuddy at ${scope} scope`);
        }
        if (on) {
          const dependencies = await dependenciesAt(disk, roots, json, await sourceOf(disk, roots, json, state, id, here[0] ?? records?.[0]));
          if (dependencies.length > 0) {
            throw new Error(`${id} depends on ${dependencies.join(", ")}; dependencies cannot be installed from files yet`);
          }
        } else {
          await assertNotRequired(disk, roots, json, state, id);
        }
        const change = withSwitch(state, scope, id, on, json);
        if (change !== null) await disk.commit(roots, [change]);
        return { message: `${id} ${on ? "enabled" : "disabled"} for WorkBuddy at ${scope} scope` };
      });
    }
  };
}

// src/messages.ts
var workBuddyMessages = {
  "workbuddy.tab": "WorkBuddy",
  "workbuddy.coding": "WorkBuddy Coding",
  "workbuddy.menu.instructions": "Coding instructions",
  "workbuddy.menu.instructions.remove": "Remove Coding instructions",
  "workbuddy.error.unknownPlace": "Unknown WorkBuddy location: {place}",
  "workbuddy.error.unknownForm": "Unknown WorkBuddy form: {form}",
  "workbuddy.error.refused": "Cannot write {file}",
  "workbuddy.error.handwritten": "The file {file} is not managed by Context Hub",
  "workbuddy.error.sectionBroken": "Incomplete Context Hub section {slug} in {file}",
  "workbuddy.error.invalidMcp": "Invalid MCP server container in {file}",
  "workbuddy.error.invalidEntry": "Unsupported MCP server entry: {name}",
  "workbuddy.error.transport": "WorkBuddy MCP delivery currently supports stdio only",
  "workbuddy.error.switch": "WorkBuddy MCP switching is not supported"
};
var workBuddyZhMessages = {
  "workbuddy.tab": "WorkBuddy",
  "workbuddy.coding": "WorkBuddy \u4EE3\u7801\u5F00\u53D1",
  "workbuddy.menu.instructions": "\u4EE3\u7801\u5F00\u53D1\u6307\u4EE4",
  "workbuddy.menu.instructions.remove": "\u79FB\u9664\u4EE3\u7801\u5F00\u53D1\u6307\u4EE4",
  "workbuddy.error.unknownPlace": "\u672A\u77E5 WorkBuddy \u4F4D\u7F6E\uFF1A{place}",
  "workbuddy.error.unknownForm": "\u672A\u77E5 WorkBuddy \u5F62\u5F0F\uFF1A{form}",
  "workbuddy.error.refused": "\u65E0\u6CD5\u5199\u5165 {file}",
  "workbuddy.error.handwritten": "\u6587\u4EF6 {file} \u4E0D\u7531 Context Hub \u7BA1\u7406",
  "workbuddy.error.sectionBroken": "{file} \u4E2D\u7684 Context Hub \u6BB5\u843D {slug} \u4E0D\u5B8C\u6574",
  "workbuddy.error.invalidMcp": "{file} \u4E2D\u7684 MCP \u670D\u52A1\u5BB9\u5668\u65E0\u6548",
  "workbuddy.error.invalidEntry": "\u4E0D\u652F\u6301\u7684 MCP \u670D\u52A1\u914D\u7F6E\uFF1A{name}",
  "workbuddy.error.transport": "WorkBuddy MCP \u4EA4\u4ED8\u76EE\u524D\u4EC5\u652F\u6301 stdio",
  "workbuddy.error.switch": "\u4E0D\u652F\u6301\u5207\u6362 WorkBuddy MCP \u72B6\u6001"
};

// src/provider.ts
var object2 = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
function createWorkBuddyMcp(tools) {
  const { McpError, editJson, jsonValueLines, readJsonObject, readDeclaration, writeDeclaration } = tools;
  const fileOf2 = (place) => {
    if (place === "workbuddy") return { scope: "workspace", file: MCP_FILE };
    if (place === "workbuddy-global") return { scope: "global", file: MCP_FILE };
    throw new McpError("workbuddy.error.unknownPlace", { place });
  };
  const read = async (io, place) => {
    const ref = fileOf2(place);
    const text = await io.files.read(ref);
    const doc = readJsonObject(text);
    const servers = doc?.mcpServers;
    if (servers !== void 0 && !object2(servers)) throw new McpError("workbuddy.error.invalidMcp", { file: ref.file });
    return { ref, text, servers: servers ?? {} };
  };
  const valid = (entry) => object2(entry) && typeof entry.command === "string" && entry.command !== "" && (entry.type === void 0 || entry.type === "stdio") && !("url" in entry) && (entry.args === void 0 || Array.isArray(entry.args) && entry.args.every((arg) => typeof arg === "string")) && (entry.env === void 0 || object2(entry.env) && Object.values(entry.env).every((value) => typeof value === "string"));
  const check = (entry, name) => {
    if (!valid(entry)) throw new McpError("workbuddy.error.invalidEntry", { name });
  };
  return {
    id: WORKBUDDY_ID,
    places: ["global", "workspace"].map((scope) => ({
      id: scope === "global" ? "workbuddy-global" : "workbuddy",
      label: "WorkBuddy",
      scope,
      file: MCP_FILE,
      switchable: false
    })),
    async read(io, place) {
      const { servers } = await read(io, place);
      return Object.entries(servers).map(([name, entry]) => ({
        name,
        declaration: valid(entry) ? readDeclaration(entry) : null,
        enabled: true
      }));
    },
    async install(io, place, name, declaration) {
      if (declaration.transport !== "stdio") throw new McpError("workbuddy.error.transport");
      const { ref, text, servers } = await read(io, place);
      const entry = servers[name];
      if (entry !== void 0) check(entry, name);
      const path = ["mcpServers", name];
      if (entry === void 0) {
        await io.files.write(ref, editJson(text, path, writeDeclaration(declaration)));
        return;
      }
      const next = writeDeclaration(declaration);
      let updated = text;
      for (const key of ["command", "args", "env"]) updated = editJson(updated, [...path, key], next[key]);
      await io.files.write(ref, updated);
    },
    async uninstall(io, place, name) {
      const { ref, text, servers } = await read(io, place);
      if (servers[name] === void 0) return;
      check(servers[name], name);
      await io.files.write(ref, editJson(text, ["mcpServers", name], void 0));
    },
    async setEnabled() {
      throw new McpError("workbuddy.error.switch");
    },
    async locate(io, place, name) {
      const { text } = await read(io, place);
      return text === null ? null : jsonValueLines(text, ["mcpServers", name]);
    }
  };
}

// src/prompts.ts
function formsOf(instructions) {
  const forms = [
    {
      id: "commands",
      labelKey: "prompts.menu.commands",
      removeLabelKey: "prompts.menu.commands.remove"
    }
  ];
  if (instructions) {
    forms.push({
      id: "instructions",
      labelKey: "workbuddy.menu.instructions",
      removeLabelKey: "workbuddy.menu.instructions.remove"
    });
  }
  return forms;
}
function markerOf(slug) {
  return `<!-- context-hub:${slug} -->`;
}
function markersOf(slug) {
  return { open: markerOf(slug), close: `<!-- /context-hub:${slug} -->` };
}
function ownedBy(text, slug) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return false;
  const end = lines.findIndex((line, at) => at > 0 && line.trim() === "---");
  if (end < 0) return false;
  const first = lines.slice(end + 1).find((line) => line.trim() !== "");
  return first === markerOf(slug);
}
function brokenSection(text, slug) {
  const { open, close } = markersOf(slug);
  const opened = text.indexOf(open);
  const closed = text.indexOf(close);
  if (opened < 0 && closed < 0) return false;
  return opened < 0 || closed < 0 || closed < opened || text.indexOf(open, opened + open.length) >= 0 || text.indexOf(close, closed + close.length) >= 0;
}
function fileOf(tools, prompt, slug) {
  const generated = tools.commandFile({
    name: prompt.name,
    description: prompt.description,
    body: prompt.prompt,
    frontmatter: true
  });
  const lines = generated.split("\n");
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (lines[0]?.trim() !== "---" || end < 0) throw new Error("generated command has no frontmatter");
  lines.splice(end + 1, 0, "", markerOf(slug));
  return lines.join("\n");
}
function targetOf(tools, place, prompt, form, option) {
  const declared = place.forms.find((one) => one.id === form);
  const offered = declared !== void 0 && (declared.options === void 0 || declared.options.length === 0 ? option === void 0 : option !== void 0 && declared.options.some((one) => one.id === option));
  if (!offered) {
    throw new tools.PromptError("workbuddy.error.unknownForm", {
      form: option === void 0 ? form : `${form}:${option}`
    });
  }
  const slug = `${tools.slugOf(prompt.name)}.md`;
  if (form === "commands") {
    return { scope: place.scope, file: `${COMMAND_DIR}/${slug}` };
  }
  if (form === "instructions") {
    return { scope: place.scope, file: INSTRUCTION_FILE };
  }
  throw new tools.PromptError("workbuddy.error.unknownForm", {
    form: option === void 0 ? form : `${form}:${option}`
  });
}
function refused(tools, ref, failure) {
  const message = failure instanceof Error ? failure.message : String(failure);
  return new tools.PromptError("workbuddy.error.refused", { file: ref.file }, message);
}
function createWorkBuddyPrompts(icon, tools) {
  const places = [
    {
      id: "workbuddy-coding-global",
      agent: WORKBUDDY_ID,
      labelKey: "workbuddy.coding",
      icon,
      scope: "global",
      order: 20,
      where: "~/.codebuddy",
      forms: formsOf(true)
    },
    {
      id: "workbuddy-coding",
      agent: WORKBUDDY_ID,
      labelKey: "workbuddy.coding",
      icon,
      scope: "workspace",
      order: 20,
      where: ".codebuddy",
      forms: formsOf(false)
    }
  ];
  const placeOf = (id) => {
    const found = places.find((one) => one.id === id);
    if (found === void 0) {
      throw new tools.PromptError("workbuddy.error.unknownPlace", { place: id });
    }
    return found;
  };
  const read = async (io, ref) => {
    try {
      return await io.files.read(ref);
    } catch (failure) {
      throw refused(tools, ref, failure);
    }
  };
  const write = async (io, ref, text) => {
    try {
      await io.files.write(ref, text);
    } catch (failure) {
      throw refused(tools, ref, failure);
    }
  };
  const removeFile = async (io, ref) => {
    try {
      await io.files.remove(ref);
    } catch (failure) {
      throw refused(tools, ref, failure);
    }
  };
  return {
    id: WORKBUDDY_ID,
    places,
    async held(io, place, prompt) {
      const one = placeOf(place);
      const slug = tools.slugOf(prompt.name);
      const answer = {};
      for (const form of one.forms) {
        if (form.id === "instructions") {
          const text2 = await read(io, targetOf(tools, one, prompt, form.id));
          if (text2 !== null && tools.withoutSection(text2, slug) !== null) {
            answer.instructions = true;
          }
          continue;
        }
        const text = await read(io, targetOf(tools, one, prompt, form.id));
        if (text !== null && ownedBy(text, slug)) answer[form.id] = true;
      }
      return answer;
    },
    async install(io, place, prompt, form, option) {
      const one = placeOf(place);
      const ref = targetOf(tools, one, prompt, form, option);
      const slug = tools.slugOf(prompt.name);
      if (form === "instructions") {
        const existing2 = await read(io, ref);
        if (existing2 !== null && brokenSection(existing2, slug)) {
          throw new tools.PromptError("workbuddy.error.sectionBroken", {
            file: ref.file,
            slug
          });
        }
        await write(
          io,
          ref,
          tools.withSection(existing2, {
            slug,
            title: prompt.name,
            body: prompt.prompt
          })
        );
        return;
      }
      const existing = await read(io, ref);
      if (existing !== null && !ownedBy(existing, slug)) {
        throw new tools.PromptError("workbuddy.error.handwritten", { file: ref.file });
      }
      await write(io, ref, fileOf(tools, prompt, slug));
    },
    async remove(io, place, prompt, form, option) {
      const one = placeOf(place);
      const ref = targetOf(tools, one, prompt, form, option);
      const slug = tools.slugOf(prompt.name);
      if (form === "instructions") {
        const existing2 = await read(io, ref);
        if (existing2 === null) return false;
        if (brokenSection(existing2, slug)) {
          throw new tools.PromptError("workbuddy.error.sectionBroken", {
            file: ref.file,
            slug
          });
        }
        const next = tools.withoutSection(existing2, slug);
        if (next === null) return false;
        if (next.trim() === "") await removeFile(io, ref);
        else await write(io, ref, next);
        return true;
      }
      const existing = await read(io, ref);
      if (existing === null || !ownedBy(existing, slug)) return false;
      await removeFile(io, ref);
      return true;
    }
  };
}

// src/index.tsx
import { jsx } from "react/jsx-runtime";
var WorkBuddyIcon = ({ className, "aria-hidden": ariaHidden }) => /* @__PURE__ */ jsx(
  "img",
  {
    src: "/hub/extensions/workbuddy/assets/icon.svg",
    className,
    "aria-hidden": ariaHidden,
    alt: ariaHidden === true ? "" : "WorkBuddy"
  }
);
function apply(ctx) {
  ctx.plugins.registerManifests([".codebuddy-plugin/plugin.json"]);
  ctx.skills.register({ id: WORKBUDDY_ID, places: [
    { id: "workbuddy", labelKey: "workbuddy.tab", icon: WorkBuddyIcon, scope: "workspace", dir: SKILL_DIR, order: 20 },
    { id: "workbuddy-global", labelKey: "workbuddy.tab", icon: WorkBuddyIcon, scope: "global", dir: SKILL_DIR, order: 20 }
  ] });
  ctx.mcp.register(createWorkBuddyMcp(ctx.mcp.tools));
  ctx.prompts.register(createWorkBuddyPrompts(WorkBuddyIcon, ctx.prompts.tools));
  ctx.plugins.register(createWorkBuddyInstaller(ctx.mcp.tools));
  ctx.targets.register({
    id: WORKBUDDY_ID,
    displayName: "WorkBuddy",
    icon: WorkBuddyIcon,
    supports: ["skill", "mcp", "memory", "agent"],
    locations: [
      { label: "Skills", path: "~/.workbuddy/skills/<name>/SKILL.md" },
      { label: "Skills", path: ".workbuddy/skills/<name>/SKILL.md" },
      { label: "MCP", path: "~/.workbuddy/mcp.json" },
      { label: "MCP", path: ".workbuddy/mcp.json" },
      { label: "Coding commands", path: ".codebuddy/commands/<name>.md" },
      { label: "Coding instructions", path: "~/.codebuddy/CODEBUDDY.md" }
    ],
    format: "Markdown and JSON"
  });
  ctx.locales.register({ id: "en", label: "English", messages: workBuddyMessages });
  ctx.locales.register({ id: "zh-CN", label: "\u7B80\u4F53\u4E2D\u6587", messages: workBuddyZhMessages });
}
export {
  apply
};
