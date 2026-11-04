// src/locations.ts
var CLAUDE_CODE_ID = "hub.target.claude-code";
var CLAUDE_CODE_SKILL_DIR = ".claude/skills";
var CLAUDE_CODE_MCP_FILE = ".mcp.json";
var CLAUDE_CODE_GLOBAL_MCP_FILE = ".claude.json";
var CLAUDE_CODE_MCP_KEY = "mcpServers";
var CLAUDE_CODE_DISABLED_KEY = "disabledMcpServers";
var CLAUDE_CODE_SETTINGS_FILE = ".claude/settings.json";
var CLAUDE_PLUGIN_ROOTS = {
  home: ".claude",
  homeEnv: "CLAUDE_CONFIG_DIR",
  state: "plugins",
  stateEnv: "CLAUDE_CODE_PLUGIN_CACHE_DIR",
  config: { write: ["settings.json"], read: ["skills", "skills/*", "skills/*/.claude-plugin/plugin.json"] },
  stateFiles: { write: ["installed_plugins.json", "known_marketplaces.json", "cache/*/*/*", "cache/*/*/*/.orphaned_at"], read: [] },
  workspace: { write: [".claude/settings.json", ".claude/settings.local.json"], read: [".claude/skills", ".claude/skills/*", ".claude/skills/*/.claude-plugin/plugin.json"] },
  library: { write: [], read: [".claude-plugin/marketplace.json", "*/.claude-plugin/plugin.json", "*/.claude-plugin/marketplace.json", "*/plugin.json"] },
  external: [".claude-plugin/marketplace.json", ".claude-plugin/plugin.json"]
};
var CLAUDE_CODE_COMMAND_DIR = ".claude/commands";
var CLAUDE_CODE_RULE_DIR = ".claude/rules";
var CLAUDE_CODE_AGENT_DIR = ".claude/agents";
var CLAUDE_CODE_GLOBAL_INSTRUCTION_FILE = ".claude/CLAUDE.md";
var GLOBAL_LOCATIONS = [
  { label: "Skills", path: "~/.claude/skills/<name>/SKILL.md" },
  { label: "Commands", path: "~/.claude/commands/<name>.md" },
  { label: "Rules", path: "~/.claude/rules/<name>.md" },
  { label: "Agents", path: "~/.claude/agents/<name>.md" },
  { label: "Memory", path: "~/.claude/CLAUDE.md" },
  { label: "MCP servers", path: "~/.claude.json" },
  { label: "Hooks", path: "~/.claude/settings.json" }
];
var PROJECT_LOCATIONS = [
  { label: "Skills", path: ".claude/skills/<name>/SKILL.md" },
  { label: "Commands", path: ".claude/commands/<name>.md" },
  { label: "Rules", path: ".claude/rules/<name>.md" },
  { label: "Agents", path: ".claude/agents/<name>.md" },
  { label: "Memory", path: "CLAUDE.md" }
];
var SUPPORTS = ["skill", "mcp", "memory", "hook", "agent"];
function normalizeProjectPath(value) {
  return value.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

// src/plugin-state.ts
var INDEX = { root: "plugins", path: "installed_plugins.json" };
var MARKETS = { root: "plugins", path: "known_marketplaces.json" };
var USER_SETTINGS = { root: "config", path: "settings.json" };
var PROJECT_SETTINGS = { root: "workspace", path: ".claude/settings.json" };
var LOCAL_SETTINGS = { root: "workspace", path: ".claude/settings.local.json" };
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
  if (parsed.version !== 1 && parsed.version !== 2) throw new Error("unsupported installed_plugins.json version");
  if (!object(parsed.plugins)) throw new Error("invalid installed_plugins.json plugins");
  const plugins = {};
  for (const [id, value] of Object.entries(parsed.plugins)) {
    const records = parsed.version === 1 ? [value] : value;
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
  return switches.local?.[id] ?? switches.project?.[id] ?? switches.user?.[id] ?? false;
}
function marketplaceLocation(market) {
  if (!object(market) || !object(market.source) || market.source.source !== "directory") return null;
  return typeof market.source.path === "string" ? market.source.path : null;
}
async function marketplacePack(disk, roots, json, market, name) {
  const directory = marketplaceLocation(market);
  if (directory === null) return null;
  const raw = await disk.readExternal(roots, directory, ".claude-plugin/marketplace.json");
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
        readOnly: managed.has(id) || !["user", "project"].includes(record.scope) || ["skills-dir", "synced"].includes(marketplace),
        ...source === void 0 ? {} : { source: { kind: "local", path: source } },
        pack: EMPTY_PACK
      });
      seen.add(`${id}\0${record.scope}`);
    }
  }
  for (const scope of ["user", "project", "local"]) {
    for (const id of Object.keys(state.switches[scope] ?? {})) {
      if (seen.has(`${id}\0${scope}`)) continue;
      const at = id.lastIndexOf("@");
      if (at <= 0 || at === id.length - 1) continue;
      const name = id.slice(0, at);
      const marketplace = id.slice(at + 1);
      const localMarket = state.settings.local.extraKnownMarketplaces;
      const projectMarket = state.settings.project.extraKnownMarketplaces;
      const userMarket = state.settings.user.extraKnownMarketplaces;
      const market = state.markets[marketplace] ?? (scope === "local" && object(localMarket) ? localMarket[marketplace] : void 0) ?? (scope !== "user" && object(projectMarket) ? projectMarket[marketplace] : void 0) ?? (object(userMarket) ? userMarket[marketplace] : void 0);
      const source = await marketplacePack(disk, roots, json, market, name).catch(() => null);
      if (source === null) continue;
      found.push({ name, id, marketplace, scope, version: "", enabled: effective(state.switches, id), origin: "declaration", readOnly: managed.has(id) || scope === "local", source: { kind: "local", path: source }, pack: EMPTY_PACK });
      seen.add(`${id}\0${scope}`);
    }
  }
  for (const [scope, root, prefix] of [["user", "config", "skills"], ["project", "workspace", ".claude/skills"]]) {
    if (scope === "project" && roots.workspace === null) continue;
    for (const entry of await disk.list(roots, { root, path: prefix })) {
      if (!entry.directory) continue;
      const ref = { root, path: `${prefix}/${entry.name}/.claude-plugin/plugin.json` };
      if (await disk.read(roots, ref) === null) continue;
      const id = `${entry.name}@skills-dir`;
      if (seen.has(`${id}\0${scope}`)) continue;
      const source = await disk.path(roots, { root, path: `${prefix}/${entry.name}` });
      found.push({ name: entry.name, id, marketplace: "skills-dir", scope, version: "", enabled: effective(state.switches, id), origin: "skills-dir", readOnly: true, source: { kind: "local", path: source }, pack: EMPTY_PACK });
    }
  }
  return found;
}

// src/installer.ts
var LABEL = "Claude Code";
var MARKETPLACE = "context-hub";
var PLACES = [
  { id: "claude-code-user", label: LABEL, scope: "global", scopeWord: "user", switchable: true, file: CLAUDE_CODE_SETTINGS_FILE },
  { id: "claude-code-project", label: LABEL, scope: "workspace", scopeWord: "project", switchable: true, file: CLAUDE_CODE_SETTINGS_FILE, overrides: ["user"] }
];
var SETTINGS = {
  user: { root: "config", path: "settings.json" },
  project: { root: "workspace", path: ".claude/settings.json" },
  local: { root: "workspace", path: ".claude/settings.local.json" }
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
  if (version === "") return "unknown";
  if (/[<>:"|?*\\/]/.test(version) || [...version].some((char) => char.codePointAt(0) < 32) || version.startsWith(".") || version !== version.trim() || /[. ]$/.test(version) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(version)) {
    throw new Error(`invalid plugin version: ${version}`);
  }
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
  if (marketplace === "skills-dir" || marketplace === "synced" || marketplace === "inline") {
    throw new Error(`${marketplace} plugins are read-only`);
  }
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
  const raw = await disk.readExternal(roots, directory, ".claude-plugin/plugin.json");
  return dependenciesOf(manifestOf(json, raw, "plugin.json"));
}
async function assertNotRequired(disk, roots, json, state, id) {
  const declared = await heldFromState(disk, roots, json, state);
  for (const [other, records] of Object.entries(state.index.plugins)) {
    if (other === id || !effective(state.switches, other)) continue;
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
  if (state.index.document.version === 1) {
    const plugins = { ...state.index.plugins };
    if (records === void 0) delete plugins[id];
    else plugins[id] = records;
    return { ref, before, after: `${JSON.stringify({ ...state.index.document, version: 2, plugins }, null, 2)}
` };
  }
  return {
    ref,
    before,
    after: before === null ? `${JSON.stringify({ version: 2, plugins: records === void 0 ? {} : { [id]: records } }, null, 2)}
` : json.editJson(before, ["plugins", id], records)
  };
}
function cacheRelative(roots, installPath) {
  const root = `${normalized(roots.plugins, roots.platform)}/cache/`;
  const path = normalized(installPath, roots.platform);
  if (!path.startsWith(root)) return null;
  const original = installPath.replace(/\\/g, "/");
  const relative = original.slice(root.length);
  return relative === "" || relative.split("/").includes("..") ? null : relative;
}
function createClaudeCodeInstaller(json) {
  return {
    id: CLAUDE_CODE_ID,
    label: LABEL,
    places: PLACES,
    async available(tools) {
      await diskOf(tools).roots(CLAUDE_PLUGIN_ROOTS);
      return true;
    },
    async held(tools) {
      const disk = diskOf(tools);
      const roots = await disk.roots(CLAUDE_PLUGIN_ROOTS);
      const state = await readState(disk, roots, json);
      return withPacks(tools, await heldFromState(disk, roots, json, state));
    },
    async switches(tools) {
      const disk = diskOf(tools);
      return (await readState(disk, await disk.roots(CLAUDE_PLUGIN_ROOTS), json)).switches;
    },
    async install(name, scope, tools) {
      const disk = diskOf(tools);
      if (scope !== "user" && scope !== "project") throw new Error(`${scope} installs are read-only`);
      const root = await tools.root();
      return disk.run(CLAUDE_PLUGIN_ROOTS, async (roots) => {
        if (normalized(root, roots.platform) !== normalized(roots.library, roots.platform)) {
          throw new Error("plugin library changed; retry the installation");
        }
        if (scope === "project" && roots.workspace === null) throw new Error("Select a workspace before installing into the project");
        const state = await readState(disk, roots, json);
        const id = `${name}@${MARKETPLACE}`;
        writable(scope, id);
        assertUnmanaged(state, id);
        const manifest = manifestOf(
          json,
          await disk.read(roots, { root: "library", path: `${name}/.claude-plugin/plugin.json` }),
          `${name}/.claude-plugin/plugin.json`
        );
        const alternative = manifest === null ? manifestOf(json, await disk.read(roots, { root: "library", path: `${name}/plugin.json` }), `${name}/plugin.json`) ?? manifestOf(json, await disk.read(roots, { root: "library", path: `${name}/.claude-plugin/marketplace.json` }), `${name}/.claude-plugin/marketplace.json`) : null;
        const dependencies = [...dependenciesOf(manifest), ...dependenciesOf(alternative)];
        if (dependencies.length > 0) {
          throw new Error(`${name} depends on ${dependencies.join(", ")}; dependencies cannot be installed from files yet`);
        }
        const now = (/* @__PURE__ */ new Date()).toISOString();
        const marketUpdates = marketChanges(state, root, json, now, roots.platform);
        const packs = await tools.packs();
        await tools.syncMarketplace([{ path: ".claude-plugin/marketplace.json", document: {
          name: MARKETPLACE,
          description: "Plugin packs collected by Context Hub.",
          owner: { name: "Context Hub" },
          plugins: packs.map((pack) => ({ name: pack.name, source: `./${pack.name}`, description: pack.description, version: pack.version }))
        } }]);
        const index = manifestOf(json, await disk.read(roots, { root: "library", path: ".claude-plugin/marketplace.json" }), "marketplace.json");
        if (!Array.isArray(index?.plugins)) throw new Error("invalid Hub marketplace index");
        const listed = index.plugins.find((entry) => typeof entry === "object" && entry !== null && entry.name === name);
        if (listed === void 0) throw new Error(`${name} is not listed in the Hub marketplace`);
        const marketVersion = listed.version;
        const version = (typeof manifest?.version === "string" && manifest.version !== "" ? manifest.version : void 0) ?? (typeof marketVersion === "string" && marketVersion !== "" ? marketVersion : "unknown");
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
        const marker = { root: "plugins", path: `${destination}/.orphaned_at` };
        const markerText = await disk.read(roots, marker);
        const changes = [
          ...markerText === null ? [] : [{ ref: marker, before: markerText, after: null }],
          ...marketUpdates,
          indexChange(state, id, records, json)
        ];
        const enabled = withSwitch(state, scope, id, true, json);
        if (enabled !== null) {
          const prior = changes.find((change) => change.ref.root === enabled.ref.root && change.ref.path === enabled.ref.path);
          if (prior === void 0) changes.push(enabled);
          else prior.after = json.editJson(prior.after, ["enabledPlugins", id], true);
        }
        await disk.commit(roots, changes, { name, destination });
        return {
          message: `${name} installed for Claude Code at ${scope} scope`,
          location: record.installPath
        };
      });
    },
    async remove(id, scope, tools) {
      const disk = diskOf(tools);
      writable(scope, id);
      return disk.run(CLAUDE_PLUGIN_ROOTS, async (roots) => {
        if (scope === "project" && roots.workspace === null) throw new Error("Select a workspace before removing a project installation");
        const state = await readState(disk, roots, json);
        assertUnmanaged(state, id);
        const existing = state.index.plugins[id] ?? [];
        const targets = atScope(existing, scope, roots);
        if (targets.length === 0) {
          const declared = (await heldFromState(disk, roots, json, state)).some((entry) => entry.id === id && entry.scope === scope && entry.origin === "declaration" && !entry.readOnly);
          if (!declared) throw new Error(`${id} is not installed for Claude Code at ${scope} scope`);
          await assertNotRequired(disk, roots, json, state, id);
          const change = withSwitch(state, scope, id, void 0, json);
          if (change !== null) await disk.commit(roots, [change]);
          return { message: `${id} removed from Claude Code at ${scope} scope` };
        }
        const remaining = existing.filter((record) => !targets.includes(record));
        await assertNotRequired(disk, roots, json, state, id);
        const remainingRecords = Object.entries(state.index.plugins).flatMap(([other, records]) => other === id ? remaining : records);
        const changes = [];
        const disabled = withSwitch(state, scope, id, void 0, json);
        if (disabled !== null) changes.push(disabled);
        changes.push(indexChange(state, id, remaining.length === 0 ? void 0 : remaining, json));
        const paths = new Set(targets.flatMap((record) => record.installPath === void 0 ? [] : [record.installPath]));
        for (const installPath of paths) {
          if (remainingRecords.some((record) => record.installPath !== void 0 && normalized(record.installPath, roots.platform) === normalized(installPath, roots.platform))) continue;
          const relative = cacheRelative(roots, installPath);
          if (relative === null) continue;
          const marker = { root: "plugins", path: `cache/${relative}/.orphaned_at` };
          changes.push({ ref: marker, before: await disk.read(roots, marker), after: String(Date.now()) });
        }
        await disk.commit(roots, changes);
        return { message: `${id} removed from Claude Code at ${scope} scope` };
      });
    },
    async setEnabled(id, scope, on, tools) {
      const disk = diskOf(tools);
      writable(scope, id);
      return disk.run(CLAUDE_PLUGIN_ROOTS, async (roots) => {
        if (scope === "project" && roots.workspace === null) throw new Error("Select a workspace before switching a project installation");
        const state = await readState(disk, roots, json);
        assertUnmanaged(state, id);
        const records = state.index.plugins[id];
        const here = records === void 0 ? [] : atScope(records, scope, roots);
        const declared = state.switches[scope]?.[id] !== void 0;
        if (here.length === 0 && !declared && !(scope === "project" && records?.some((record) => record.scope === "user"))) {
          throw new Error(`${id} is not installed for Claude Code at ${scope} scope`);
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
        return { message: `${id} ${on ? "enabled" : "disabled"} for Claude Code at ${scope} scope` };
      });
    }
  };
}

// src/messages.ts
var claudeCodeMessages = {
  "claudeCode.tab": "Claude Code",
  "claudeCode.menu.documents": "Add to a memory file",
  "claudeCode.menu.instructions": "Add to CLAUDE.md",
  "claudeCode.menu.instructions.remove": "Remove from CLAUDE.md",
  "claudeCode.error.refused": "The hub could not read or write Claude Code's config files.",
  "claudeCode.error.unknownPlace": "Claude Code has no client file called {place}.",
  "claudeCode.error.unknownForm": "Claude Code has no prompt action called {form}.",
  "claudeCode.error.noProject": "Claude Code has no record for this folder in {file}, so it has nowhere to keep the switch.",
  "claudeCode.error.noWorkspace": "No workspace is open, so there is no project to switch.",
  "claudeCode.error.machineScope": "Claude Code keeps the switch in a project's record, so a machine-wide place has none."
};
var claudeCodeZhMessages = {
  "claudeCode.tab": "Claude Code",
  "claudeCode.menu.documents": "\u6DFB\u52A0\u5230\u8BB0\u5FC6\u6587\u4EF6",
  "claudeCode.menu.instructions": "\u6DFB\u52A0\u5230 CLAUDE.md",
  "claudeCode.menu.instructions.remove": "\u4ECE CLAUDE.md \u79FB\u9664",
  "claudeCode.error.refused": "\u8BFB\u5199 Claude Code \u7684\u914D\u7F6E\u6587\u4EF6\u5931\u8D25\u3002",
  "claudeCode.error.unknownPlace": "Claude Code \u6CA1\u6709\u540D\u4E3A {place} \u7684\u5BA2\u6237\u7AEF\u6587\u4EF6\u3002",
  "claudeCode.error.unknownForm": "Claude Code \u6CA1\u6709\u540D\u4E3A {form} \u7684\u63D0\u793A\u8BCD\u64CD\u4F5C\u3002",
  "claudeCode.error.noProject": "Claude Code \u5728 {file} \u91CC\u6CA1\u6709\u8FD9\u4E2A\u6587\u4EF6\u5939\u7684\u8BB0\u5F55\uFF0C\u6CA1\u6709\u5730\u65B9\u653E\u8FD9\u4E2A\u5F00\u5173\u3002",
  "claudeCode.error.noWorkspace": "\u5F53\u524D\u6CA1\u6709\u5DE5\u4F5C\u533A\uFF0C\u6CA1\u6709\u53EF\u5207\u6362\u7684\u9879\u76EE\u3002",
  "claudeCode.error.machineScope": "Claude Code \u628A\u5F00\u5173\u8BB0\u5728\u9879\u76EE\u7684\u8BB0\u5F55\u91CC\uFF0C\u6574\u673A\u4F4D\u7F6E\u6CA1\u6709\u53EF\u5199\u7684\u5730\u65B9\u3002"
};

// src/provider.ts
var FILES = {
  workspace: { scope: "workspace", file: CLAUDE_CODE_MCP_FILE },
  global: { scope: "global", file: CLAUDE_CODE_GLOBAL_MCP_FILE }
};
var STATE = { scope: "global", file: CLAUDE_CODE_GLOBAL_MCP_FILE };
var PROJECTS = "projects";
function createClaudeCodeMcp(tools) {
  const {
    McpError,
    editJson,
    jsonValueLines,
    readDeclaration,
    readJsonObject,
    valueAt,
    writeDeclaration
  } = tools;
  const fileOf = (place) => {
    if (place === "claude-code-global") return FILES.global;
    if (place === "claude-code") return FILES.workspace;
    throw new McpError("claudeCode.error.unknownPlace", { place });
  };
  const read = async (io, place) => {
    try {
      return await io.files.read(place) ?? "";
    } catch (error) {
      throw new McpError("claudeCode.error.refused", void 0, messageOf(error));
    }
  };
  const write = async (io, place, text) => {
    try {
      await io.files.write(place, text);
    } catch (error) {
      throw new McpError("claudeCode.error.refused", void 0, messageOf(error));
    }
  };
  const disabledNames = async (io) => {
    const document2 = readJsonObject(await io.files.read(STATE));
    const key = await existingProjectKey(io, document2);
    if (key === null) return [];
    const listed = valueAt(document2, [PROJECTS, key, CLAUDE_CODE_DISABLED_KEY]);
    return Array.isArray(listed) ? listed.filter((item) => typeof item === "string") : [];
  };
  const existingProjectKey = async (io, document2) => {
    const workspace = await io.files.workspace();
    if (workspace === null) return null;
    const projects = valueAt(document2, [PROJECTS]);
    if (typeof projects !== "object" || projects === null) return null;
    const wanted = normalizeProjectPath(workspace);
    return Object.keys(projects).find((key) => normalizeProjectPath(key) === wanted) ?? null;
  };
  return {
    id: CLAUDE_CODE_ID,
    places: [
      /* Only a project's record holds the switch, so a server declared in the
         machine-wide file is one the hub may not switch off. */
      {
        id: "claude-code-global",
        label: "Claude Code",
        switchable: false,
        ...FILES.global
      },
      {
        id: "claude-code",
        label: "Claude Code",
        switchable: true,
        ...FILES.workspace
      }
    ],
    async read(io, place) {
      const text = await io.files.read(fileOf(place));
      const document2 = readJsonObject(text);
      const held = valueAt(document2, [CLAUDE_CODE_MCP_KEY]);
      if (typeof held !== "object" || held === null) return [];
      const disabled = await disabledNames(io);
      return Object.entries(held).map(
        ([name, entry]) => ({
          name,
          declaration: readDeclaration(entry),
          /* A name no project has disabled is one Claude Code connects. */
          enabled: !disabled.includes(name)
        })
      );
    },
    async install(io, place, name, declaration) {
      const file = fileOf(place);
      const text = await read(io, file);
      const entry = {
        ...writeDeclaration(declaration)
      };
      if (declaration.transport !== "stdio") entry.type = declaration.transport;
      await write(io, file, editJson(text, [CLAUDE_CODE_MCP_KEY, name], entry));
    },
    async uninstall(io, place, name) {
      const file = fileOf(place);
      const text = await read(io, file);
      await write(io, file, editJson(text, [CLAUDE_CODE_MCP_KEY, name], void 0));
    },
    async setEnabled(io, place, scope, name, enabled) {
      fileOf(place);
      if (scope !== "workspace") throw new McpError("claudeCode.error.machineScope");
      const text = await read(io, STATE);
      const document2 = readJsonObject(text);
      const key = await existingProjectKey(io, document2);
      if (key === null) {
        throw new McpError("claudeCode.error.noProject", {
          file: CLAUDE_CODE_GLOBAL_MCP_FILE
        });
      }
      const path = [PROJECTS, key, CLAUDE_CODE_DISABLED_KEY];
      const listed = valueAt(document2, path);
      const names = Array.isArray(listed) ? listed.filter((item) => typeof item === "string") : [];
      const next = enabled ? names.filter((item) => item !== name) : [.../* @__PURE__ */ new Set([...names, name])];
      await write(
        io,
        STATE,
        editJson(text, path, next.length === 0 ? void 0 : next)
      );
    },
    async locate(io, place, name) {
      const text = await io.files.read(fileOf(place));
      return text === null ? null : jsonValueLines(text, [CLAUDE_CODE_MCP_KEY, name]);
    }
  };
}
function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

// src/prompts.ts
var INSTRUCTIONS = "claude";
function formsOf(memory) {
  const forms = [
    {
      id: "commands",
      labelKey: "prompts.menu.commands",
      removeLabelKey: "prompts.menu.commands.remove"
    },
    {
      id: "rule",
      labelKey: "prompts.menu.rule",
      removeLabelKey: "prompts.menu.rule.remove"
    },
    {
      id: "agent",
      labelKey: "prompts.menu.agent",
      removeLabelKey: "prompts.menu.agent.remove"
    }
  ];
  if (memory) {
    forms.push({
      id: "instructions",
      labelKey: "claudeCode.menu.documents",
      options: [
        {
          id: INSTRUCTIONS,
          labelKey: "claudeCode.menu.instructions",
          removeLabelKey: "claudeCode.menu.instructions.remove"
        }
      ]
    });
  }
  return forms;
}
function targetOf(tools, place, prompt, form, option) {
  const declared = place.forms.find((one) => one.id === form);
  const offered = declared !== void 0 && (declared.options === void 0 || declared.options.length === 0 ? option === void 0 : option !== void 0 && declared.options.some((one) => one.id === option));
  if (!offered) {
    throw new tools.PromptError("claudeCode.error.unknownForm", {
      form: option === void 0 ? form : `${form}:${option}`
    });
  }
  const slug = `${tools.slugOf(prompt.name)}.md`;
  if (form === "commands") return { scope: place.scope, file: `${CLAUDE_CODE_COMMAND_DIR}/${slug}` };
  if (form === "rule") return { scope: place.scope, file: `${CLAUDE_CODE_RULE_DIR}/${slug}` };
  if (form === "agent") return { scope: place.scope, file: `${CLAUDE_CODE_AGENT_DIR}/${slug}` };
  if (form === "instructions") {
    return { scope: place.scope, file: CLAUDE_CODE_GLOBAL_INSTRUCTION_FILE };
  }
  throw new tools.PromptError("claudeCode.error.unknownForm", {
    form: option === void 0 ? form : `${form}:${option}`
  });
}
function refused(tools, failure) {
  const message = failure instanceof Error ? failure.message : String(failure);
  return new tools.PromptError("claudeCode.error.refused", void 0, message);
}
function createClaudeCodePrompts(icon, tools) {
  const places = [
    {
      id: "claude-code",
      agent: CLAUDE_CODE_ID,
      labelKey: "claudeCode.tab",
      icon,
      scope: "workspace",
      order: 20,
      where: ".claude",
      forms: formsOf(false)
    },
    {
      id: "claude-code-global",
      agent: CLAUDE_CODE_ID,
      labelKey: "claudeCode.tab",
      icon,
      scope: "global",
      order: 20,
      where: "~/.claude",
      forms: formsOf(true)
    }
  ];
  const placeOf = (id) => {
    const found = places.find((one) => one.id === id);
    if (found === void 0) {
      throw new tools.PromptError("claudeCode.error.unknownPlace", { place: id });
    }
    return found;
  };
  const read = async (io, ref) => {
    try {
      return await io.files.read(ref);
    } catch (failure) {
      throw refused(tools, failure);
    }
  };
  return {
    id: CLAUDE_CODE_ID,
    places,
    async held(io, place, prompt) {
      const one = placeOf(place);
      const slug = tools.slugOf(prompt.name);
      const answer = {};
      for (const form of one.forms) {
        if (form.id === "instructions") {
          const text = await read(io, targetOf(tools, one, prompt, form.id, INSTRUCTIONS));
          if (text === null) continue;
          const there = tools.withoutSection(text, slug) !== null;
          for (const option of form.options ?? []) {
            if (there) answer[`${form.id}:${option.id}`] = true;
          }
          continue;
        }
        if (await read(io, targetOf(tools, one, prompt, form.id)) !== null) {
          answer[form.id] = true;
        }
      }
      return answer;
    },
    async install(io, place, prompt, form, option) {
      const one = placeOf(place);
      const ref = targetOf(tools, one, prompt, form, option);
      try {
        if (form === "instructions") {
          const existing = await io.files.read(ref);
          await io.files.write(
            ref,
            tools.withSection(existing, {
              slug: tools.slugOf(prompt.name),
              title: prompt.name,
              body: prompt.prompt
            })
          );
          return;
        }
        await io.files.write(
          ref,
          tools.commandFile({
            name: prompt.name,
            description: prompt.description,
            body: prompt.prompt,
            /* A command and an agents file carry the frontmatter; a rule is the
               prompt as it was written. */
            frontmatter: form !== "rule"
          })
        );
      } catch (failure) {
        throw refused(tools, failure);
      }
    },
    async remove(io, place, prompt, form, option) {
      const one = placeOf(place);
      const ref = targetOf(tools, one, prompt, form, option);
      try {
        if (form === "instructions") {
          const existing = await io.files.read(ref);
          if (existing === null) return false;
          const next = tools.withoutSection(existing, tools.slugOf(prompt.name));
          if (next === null) return false;
          if (next.trim() === "") await io.files.remove(ref);
          else await io.files.write(ref, next);
          return true;
        }
        if (await io.files.read(ref) === null) return false;
        await io.files.remove(ref);
        return true;
      } catch (failure) {
        throw refused(tools, failure);
      }
    }
  };
}

// src/index.tsx
import { jsx } from "react/jsx-runtime";
var ClaudeCodeIcon = ({ className, "aria-hidden": ariaHidden }) => /* @__PURE__ */ jsx("svg", { viewBox: "0 0 24 24", className, "aria-hidden": ariaHidden, children: /* @__PURE__ */ jsx(
  "path",
  {
    clipRule: "evenodd",
    fillRule: "evenodd",
    fill: "#D97757",
    d: "M20.998 10.949H24v3.102h-3v3.028h-1.487V20H18v-2.921h-1.487V20H15v-2.921H9V20H7.488v-2.921H6V20H4.487v-2.921H3V14.05H0V10.95h3V5h17.998v5.949zM6 10.949h1.488V8.102H6v2.847zm10.51 0H18V8.102h-1.49v2.847z"
  }
) });
function skillPlaces(icon) {
  return [
    {
      id: "claude-code",
      labelKey: "claudeCode.tab",
      icon,
      scope: "workspace",
      dir: CLAUDE_CODE_SKILL_DIR,
      order: 20
    },
    {
      id: "claude-code-global",
      labelKey: "claudeCode.tab",
      icon,
      scope: "global",
      dir: CLAUDE_CODE_SKILL_DIR,
      order: 20
    }
  ];
}
function apply(ctx) {
  const icon = ClaudeCodeIcon;
  ctx.skills.register({ id: CLAUDE_CODE_ID, places: skillPlaces(icon) });
  ctx.prompts.register(createClaudeCodePrompts(icon, ctx.prompts.tools));
  ctx.mcp.register(createClaudeCodeMcp(ctx.mcp.tools));
  ctx.plugins.register(createClaudeCodeInstaller(ctx.mcp.tools));
  ctx.targets.register({
    id: CLAUDE_CODE_ID,
    displayName: "Claude Code",
    icon,
    supports: [...SUPPORTS],
    locations: [...GLOBAL_LOCATIONS, ...PROJECT_LOCATIONS].map((location) => ({
      label: location.label,
      path: location.path
    })),
    format: "Markdown with YAML frontmatter; JSON for MCP servers and hooks"
  });
  ctx.locales.register({
    id: "en",
    label: "English",
    messages: claudeCodeMessages
  });
  ctx.locales.register({
    id: "zh-CN",
    label: "\u7B80\u4F53\u4E2D\u6587",
    messages: claudeCodeZhMessages
  });
}
export {
  apply
};
