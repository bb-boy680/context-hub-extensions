// src/locations.ts
var KIRO_ID = "hub.target.kiro";
var SKILL_DIR = ".kiro/skills";
var MCP_FILE = ".kiro/settings/mcp.json";
var SUPPORTS = ["skill", "mcp", "memory", "agent"];
var LOCATIONS = [
  { label: "Skills", path: "~/.kiro/skills/<name>/SKILL.md" },
  { label: "Project skills", path: ".kiro/skills/<name>/SKILL.md" },
  { label: "MCP", path: "~/.kiro/settings/mcp.json" },
  { label: "Project MCP", path: ".kiro/settings/mcp.json" },
  { label: "Steering", path: "~/.kiro/steering/context-hub-<name>.md" },
  { label: "Project steering", path: ".kiro/steering/context-hub-<name>.md" },
  { label: "Agents", path: "~/.kiro/agents/context-hub-<name>.md" },
  { label: "Project agents", path: ".kiro/agents/context-hub-<name>.md" },
  { label: "Instructions", path: "~/.kiro/steering/AGENTS.md" },
  { label: "Project instructions", path: "AGENTS.md" }
];

// src/messages.ts
var kiroMessages = {
  "kiro.tab": "Kiro",
  "kiro.menu.instructions": "Instructions",
  "kiro.menu.instructions.remove": "Remove instructions",
  "kiro.error.unknownPlace": "Unknown Kiro location.",
  "kiro.error.unknownForm": "Unknown Kiro prompt form.",
  "kiro.error.invalidName": "Invalid prompt name.",
  "kiro.error.conflict": "The target contains content that cannot be safely changed.",
  "kiro.error.invalidMcp": "The Kiro MCP configuration is invalid.",
  "kiro.error.mcpConflict": "The existing MCP server cannot be safely changed.",
  "kiro.error.unsupportedSse": "Kiro SSE delivery is not supported."
};
var kiroZhMessages = {
  "kiro.tab": "Kiro",
  "kiro.menu.instructions": "\u6307\u4EE4",
  "kiro.menu.instructions.remove": "\u79FB\u9664\u6307\u4EE4",
  "kiro.error.unknownPlace": "\u672A\u77E5\u7684 Kiro \u4F4D\u7F6E\u3002",
  "kiro.error.unknownForm": "\u672A\u77E5\u7684 Kiro \u63D0\u793A\u8BCD\u5F62\u5F0F\u3002",
  "kiro.error.invalidName": "\u63D0\u793A\u8BCD\u540D\u79F0\u65E0\u6548\u3002",
  "kiro.error.conflict": "\u76EE\u6807\u5305\u542B\u65E0\u6CD5\u5B89\u5168\u4FEE\u6539\u7684\u5185\u5BB9\u3002",
  "kiro.error.invalidMcp": "Kiro MCP \u914D\u7F6E\u65E0\u6548\u3002",
  "kiro.error.mcpConflict": "\u65E0\u6CD5\u5B89\u5168\u4FEE\u6539\u73B0\u6709 MCP \u670D\u52A1\u3002",
  "kiro.error.unsupportedSse": "\u6682\u4E0D\u652F\u6301\u5411 Kiro \u4EA4\u4ED8 SSE\u3002"
};

// src/provider.ts
function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function createKiroMcp(tools) {
  const fileOf = (id) => {
    if (id === "kiro") return { scope: "workspace", file: MCP_FILE };
    if (id === "kiro-global") return { scope: "global", file: MCP_FILE };
    throw new tools.McpError("kiro.error.unknownPlace", { place: id });
  };
  const validateEntry = (value) => {
    if (!isObject(value) || value.disabled !== void 0 && typeof value.disabled !== "boolean" || Object.hasOwn(value, "command") && Object.hasOwn(value, "url")) throw new tools.McpError("kiro.error.mcpConflict");
    const declaration = tools.readDeclaration(value);
    if (!declaration || declaration.transport === "sse") throw new tools.McpError("kiro.error.mcpConflict");
    if (value.args !== void 0 && (!Array.isArray(value.args) || !value.args.every((item) => typeof item === "string"))) throw new tools.McpError("kiro.error.mcpConflict");
    for (const key of ["env", "headers"]) {
      if (value[key] !== void 0 && (!isObject(value[key]) || !Object.values(value[key]).every((item) => typeof item === "string"))) throw new tools.McpError("kiro.error.mcpConflict");
    }
    return declaration;
  };
  const serversOf = (text) => {
    if (text !== null && text.trim() === "") throw new tools.McpError("kiro.error.invalidMcp");
    const document2 = tools.readJsonObject(text);
    const servers = document2?.mcpServers;
    if (servers !== void 0 && !isObject(servers)) throw new tools.McpError("kiro.error.invalidMcp");
    const result = servers ?? {};
    for (const value of Object.values(result)) validateEntry(value);
    return result;
  };
  return {
    id: KIRO_ID,
    places: [
      { id: "kiro", label: "Kiro", switchable: true, ...fileOf("kiro") },
      { id: "kiro-global", label: "Kiro", switchable: true, ...fileOf("kiro-global") }
    ],
    async read(io, place) {
      const servers = serversOf(await io.files.read(fileOf(place)));
      return Object.entries(servers).map(([name, value]) => ({ name, declaration: validateEntry(value), enabled: value.disabled !== true }));
    },
    async install(io, place, name, declaration) {
      const file = fileOf(place);
      if (declaration.transport === "sse") throw new tools.McpError("kiro.error.unsupportedSse");
      const text = await io.files.read(file);
      const servers = serversOf(text);
      const existing = Object.hasOwn(servers, name) ? servers[name] : void 0;
      if (existing !== void 0 && validateEntry(existing).transport !== declaration.transport) throw new tools.McpError("kiro.error.mcpConflict");
      const values = tools.writeDeclaration(declaration);
      let next = text;
      if (text !== null && !Object.hasOwn(tools.readJsonObject(text) ?? {}, "mcpServers")) next = tools.editJson(text, ["mcpServers"], {});
      if (existing === void 0) {
        next = tools.editJson(next, ["mcpServers", name], { ...values, disabled: false });
      } else {
        const keys = declaration.transport === "stdio" ? ["command", "args", "env"] : ["url", "headers"];
        for (const key of keys) {
          if (Object.hasOwn(existing, key) || Object.hasOwn(values, key)) next = tools.editJson(next, ["mcpServers", name, key], values[key]);
        }
      }
      await io.files.write(file, next ?? "");
    },
    async uninstall(io, place, name) {
      const file = fileOf(place);
      const text = await io.files.read(file);
      const servers = serversOf(text);
      if (!Object.hasOwn(servers, name)) return;
      await io.files.write(file, tools.editJson(text, ["mcpServers", name], void 0));
    },
    async setEnabled(io, place, scope, name, enabled) {
      const file = fileOf(place);
      if (scope !== file.scope) throw new tools.McpError("kiro.error.unknownPlace", { place });
      const text = await io.files.read(file);
      const servers = serversOf(text);
      if (!Object.hasOwn(servers, name)) throw new tools.McpError("kiro.error.mcpConflict");
      await io.files.write(file, tools.editJson(text, ["mcpServers", name, "disabled"], !enabled));
    },
    async locate(io, place, name) {
      const text = await io.files.read(fileOf(place));
      serversOf(text);
      return text === null ? null : tools.jsonValueLines(text, ["mcpServers", name]);
    }
  };
}

// src/prompts.ts
var rule = { id: "rule", labelKey: "prompts.menu.rule", removeLabelKey: "prompts.menu.rule.remove" };
var agent = { id: "agent", labelKey: "prompts.menu.agent", removeLabelKey: "prompts.menu.agent.remove" };
var instructions = { id: "instructions", labelKey: "kiro.menu.instructions", options: [{ id: "agents", labelKey: "kiro.menu.instructions", removeLabelKey: "kiro.menu.instructions.remove" }] };
function createKiroPrompts(tools, icon) {
  const places = [
    { id: "kiro", agent: KIRO_ID, labelKey: "kiro.tab", icon, scope: "workspace", where: ".kiro", forms: [rule, agent] },
    { id: "kiro-global", agent: KIRO_ID, labelKey: "kiro.tab", icon, scope: "global", where: "~/.kiro", forms: [rule, agent, instructions] }
  ];
  const placeOf = (id) => {
    const place = places.find((item) => item.id === id);
    if (!place) throw new tools.PromptError("kiro.error.unknownPlace", { place: id });
    return place;
  };
  const slugOf = (prompt) => {
    const slug = tools.slugOf(prompt.name);
    if (!/^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u.test(slug) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(slug)) throw new tools.PromptError("kiro.error.invalidName");
    return slug;
  };
  const target = (place, slug, form, option) => {
    const offered = place.forms.find((item) => item.id === form);
    if (!offered || (offered.options ? !offered.options.some((item) => item.id === option) : option !== void 0)) throw new tools.PromptError("kiro.error.unknownForm", { form });
    if (form === "instructions") return { scope: "global", file: ".kiro/steering/AGENTS.md" };
    return { scope: place.scope, file: `.kiro/${form === "rule" ? "steering" : "agents"}/context-hub-${slug}.md` };
  };
  const owned = (text, slug) => {
    const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n(.*?)(?:\r?\n|$)/.exec(text);
    return match?.[1] === `<!-- context-hub:${slug} -->`;
  };
  const sectionSafe = (text, slug, ref) => {
    if (text === null) return;
    const open = `<!-- context-hub:${slug} -->`, close = `<!-- /context-hub:${slug} -->`;
    const start = text.indexOf(open), end = text.indexOf(close);
    if (start < 0 && end >= 0 || start >= 0 && (end < start || text.indexOf(open, start + open.length) >= 0 || text.indexOf(close, end + close.length) >= 0)) throw new tools.PromptError("kiro.error.conflict", { file: ref.file });
  };
  const generated = (prompt, slug, form) => {
    const name = `context-hub-${slug}`;
    const description = prompt.description.trim() || tools.describeBody(prompt.prompt) || prompt.name;
    const body = prompt.prompt.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").replace(/\n*$/, "");
    return `---
${form === "rule" ? "inclusion: auto\n" : ""}name: ${JSON.stringify(name)}
description: ${JSON.stringify(description)}
---
<!-- context-hub:${slug} -->
${body}
`;
  };
  return {
    id: KIRO_ID,
    places,
    async held(io, id, prompt) {
      const place = placeOf(id), slug = slugOf(prompt);
      const result = {};
      for (const form of place.forms) {
        const option = form.id === "instructions" ? "agents" : void 0;
        const ref = target(place, slug, form.id, option);
        const text = await io.files.read(ref);
        if (form.id === "instructions") sectionSafe(text, slug, ref);
        if (text !== null && (form.id === "instructions" ? tools.withoutSection(text, slug) !== null : owned(text, slug))) result[option ? `${form.id}:${option}` : form.id] = true;
      }
      return result;
    },
    async install(io, id, prompt, form, option) {
      const slug = slugOf(prompt), ref = target(placeOf(id), slug, form, option);
      const existing = await io.files.read(ref);
      if (form === "instructions") {
        sectionSafe(existing, slug, ref);
        await io.files.write(ref, tools.withSection(existing, { slug, title: prompt.name, body: prompt.prompt }));
      } else {
        if (existing !== null && !owned(existing, slug)) throw new tools.PromptError("kiro.error.conflict", { file: ref.file });
        await io.files.write(ref, generated(prompt, slug, form));
      }
    },
    async remove(io, id, prompt, form, option) {
      const slug = slugOf(prompt), ref = target(placeOf(id), slug, form, option);
      const existing = await io.files.read(ref);
      if (existing === null) return false;
      if (form === "instructions") {
        sectionSafe(existing, slug, ref);
        const next = tools.withoutSection(existing, slug);
        if (next === null) return false;
        if (next.trim() === "") await io.files.remove(ref);
        else await io.files.write(ref, next);
      } else {
        if (!owned(existing, slug)) throw new tools.PromptError("kiro.error.conflict", { file: ref.file });
        await io.files.remove(ref);
      }
      return true;
    }
  };
}

// src/installer.ts
var SCOPE = {
  home: ".kiro",
  state: "powers",
  directories: ["installed/:name"],
  config: { read: [], write: [] },
  stateFiles: { read: ["installed", "installed/*/plugin.json", "registries", "registries/*", "registry.json"], write: ["installed/*", "installed.json", "registries/user-added.json", "context-hub-ownership.json"] },
  workspace: { read: [], write: [] },
  library: { read: ["*", "*/**"], write: [] },
  external: []
};
var INSTALLED = { root: "plugins", path: "installed.json" };
var REGISTRY = { root: "plugins", path: "registries/user-added.json" };
var OWNERS = { root: "plugins", path: "context-hub-ownership.json" };
var SCHEMA = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";
var isObject2 = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var destination = (name) => ({ root: "plugins", path: `installed/${name}` });
function safeName(name) {
  if (name.length > 64 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(name)) throw new Error("Invalid Kiro power name");
  return name;
}
function readableName(name) {
  return name.length <= 128 && /^[a-z0-9][a-z0-9._-]*$/i.test(name) && !name.includes("..") && !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name);
}
function diskOf(tools) {
  if (!tools.disk || typeof tools.disk.snapshotDirectory !== "function") throw new Error("This Context Hub version lacks the required plugin file transaction API");
  return tools.disk;
}
function document(text, initial, field) {
  const value = text === null ? initial : JSON.parse(text);
  if (!isObject2(value) || !Array.isArray(value[field]) || !value[field].every((entry) => isObject2(entry) && typeof entry.name === "string")) throw new Error(`Invalid Kiro ${field} record`);
  if (field === "installedPowers" && (value.version !== void 0 && value.version !== "1.0.0" || value.dismissedAutoInstalls !== void 0 && !Array.isArray(value.dismissedAutoInstalls))) throw new Error("Invalid Kiro installedPowers record");
  return value;
}
function entries(value, field) {
  return value[field];
}
function ownerDocument(text) {
  const value = text === null ? {} : JSON.parse(text);
  if (!isObject2(value)) throw new Error("Invalid Kiro ownership record");
  for (const [name, item] of Object.entries(value)) {
    safeName(name);
    if (!isObject2(item) || typeof item.hash !== "string" || !/^[a-f0-9]{64}$/.test(item.hash) || typeof item.source !== "string" || typeof item.description !== "string") throw new Error("Invalid Kiro ownership record");
  }
  return Object.assign(/* @__PURE__ */ Object.create(null), value);
}
function manifestOf(text, name) {
  if (text === null) throw new Error("Agent Plugins manifest is missing");
  const value = JSON.parse(text);
  if (!isObject2(value) || value.$schema !== SCHEMA || value.name !== name || typeof value.version !== "string" || !value.version || typeof value.description !== "string" || !isObject2(value.author) || typeof value.author.name !== "string" || !Array.isArray(value.keywords) || !value.keywords.every((word) => typeof word === "string")) throw new Error("Invalid Agent Plugins manifest");
  return { version: value.version, description: value.description };
}
var serialize = (value) => `${JSON.stringify(value, null, 2)}
`;
var registryEntry = (name, owner) => ({ name, description: owner.description, source: { type: "local", path: owner.source } });
function isOwned(name, owner, snapshot, installed, registry) {
  const records = installed.filter((entry) => entry.name === name), sources = registry.filter((entry) => entry.name === name);
  if (!owner || snapshot !== owner.hash || records.length !== 1 || sources.length !== 1) return false;
  const record = records[0], source = sources[0];
  return record.name === name && record.registryId === "user-added" && (record.autoInstalled === void 0 || record.autoInstalled === false) && Object.keys(record).every((key) => ["name", "registryId", "autoInstalled"].includes(key)) && source.description === owner.description && isObject2(source.source) && source.source.type === "local" && source.source.path === owner.source && Object.keys(source.source).every((key) => ["type", "path"].includes(key)) && (source.autoInstall === void 0 || source.autoInstall === false) && Object.keys(source).every((key) => ["name", "description", "source", "autoInstall"].includes(key));
}
async function rejectGit(disk, roots, name, relative = "") {
  const base = relative ? `${name}/${relative}` : name;
  for (const entry of await disk.list(roots, { root: "library", path: base })) {
    if (entry.name === ".git") throw new Error("Agent Plugins with .git entries cannot be copied safely");
    if (entry.directory) await rejectGit(disk, roots, name, relative ? `${relative}/${entry.name}` : entry.name);
  }
}
function createKiroInstaller() {
  return {
    id: KIRO_ID,
    label: "Kiro",
    places: [{ id: "kiro-user", label: "Kiro", scope: "global", scopeWord: "user", switchable: false }],
    async available(tools) {
      await diskOf(tools).roots(SCOPE);
      return true;
    },
    async held(tools) {
      const disk = diskOf(tools), roots = await disk.roots(SCOPE);
      const installed = document(await disk.read(roots, INSTALLED), { version: "1.0.0", installedPowers: [], dismissedAutoInstalls: [] }, "installedPowers");
      const registry = document(await disk.read(roots, REGISTRY), { powers: [] }, "powers");
      const owners = ownerDocument(await disk.read(roots, OWNERS));
      const result = [];
      for (const entry of entries(installed, "installedPowers")) {
        const name = entry.name;
        if (!readableName(name)) continue;
        const ref = destination(name), owner = owners[name];
        let snapshot = null, raw = null, sourceAvailable = false, sourceMatches = false;
        try {
          snapshot = await disk.snapshotDirectory(roots, ref);
          raw = await disk.read(roots, { root: "plugins", path: `${ref.path}/plugin.json` });
          if (owner && await disk.path(roots, { root: "library", path: name }) === owner.source) {
            const sourceHash = await disk.snapshotDirectory(roots, { root: "library", path: name });
            sourceAvailable = sourceHash !== null;
            sourceMatches = sourceHash === owner.hash;
          }
        } catch {
        }
        let version = "", description = "", valid = false;
        try {
          ({ version, description } = manifestOf(raw, name));
          valid = true;
        } catch {
        }
        result.push({ name, id: name, version, scope: "user", marketplace: null, readOnly: !valid || !sourceMatches || !isOwned(name, owner, snapshot, entries(installed, "installedPowers"), entries(registry, "powers")), sourceAvailable, source: { kind: "local", path: await disk.path(roots, ref) }, pack: { name, version, description } });
      }
      return result;
    },
    async install(name, scope, tools) {
      if (scope !== "user") throw new Error("Kiro powers only support the user scope");
      safeName(name);
      const disk = diskOf(tools);
      return disk.run(SCOPE, async (roots) => {
        const source = { root: "library", path: name }, ref = destination(name);
        const sourceHash = await disk.snapshotDirectory(roots, source);
        if (sourceHash === null) throw new Error("Plugin pack is missing");
        const manifest = manifestOf(await disk.read(roots, { root: "library", path: `${name}/plugin.json` }), name);
        await rejectGit(disk, roots, name);
        const beforeInstalled = await disk.read(roots, INSTALLED), beforeRegistry = await disk.read(roots, REGISTRY), beforeOwners = await disk.read(roots, OWNERS);
        const installed = document(beforeInstalled, { version: "1.0.0", installedPowers: [], dismissedAutoInstalls: [] }, "installedPowers");
        const registry = document(beforeRegistry, { powers: [] }, "powers"), owners = ownerDocument(beforeOwners);
        const records = entries(installed, "installedPowers"), sources = entries(registry, "powers");
        const old = await disk.snapshotDirectory(roots, ref), oldOwner = owners[name];
        if (old !== null || oldOwner || records.some((entry) => entry.name === name) || sources.some((entry) => entry.name === name)) {
          if (!isOwned(name, oldOwner, old, records, sources)) throw new Error("Kiro power conflicts with an unmanaged or modified installation");
        }
        const owner = { hash: sourceHash, source: await disk.path(roots, source), description: `Custom power from ${await disk.path(roots, source)}` };
        owners[name] = owner;
        installed.installedPowers = [...records.filter((entry) => entry.name !== name), { name, registryId: "user-added" }];
        registry.powers = [...sources.filter((entry) => entry.name !== name), registryEntry(name, owner)];
        await disk.commit(roots, [
          { ref: INSTALLED, before: beforeInstalled, after: serialize(installed) },
          { ref: REGISTRY, before: beforeRegistry, after: serialize(registry) },
          { ref: OWNERS, before: beforeOwners, after: serialize(owners) }
        ], { name, destination: ref.path, replace: old !== null, before: old, sourceSnapshot: sourceHash, manifests: ["plugin.json"] });
        return { message: `${name} installed for Kiro; reload Kiro to discover it`, location: await disk.path(roots, ref), output: manifest.version };
      });
    },
    async remove(id, scope, tools) {
      if (scope !== "user") throw new Error("Kiro powers only support the user scope");
      const name = safeName(id), disk = diskOf(tools);
      return disk.run(SCOPE, async (roots) => {
        const beforeInstalled = await disk.read(roots, INSTALLED), beforeRegistry = await disk.read(roots, REGISTRY), beforeOwners = await disk.read(roots, OWNERS);
        const installed = document(beforeInstalled, { version: "1.0.0", installedPowers: [], dismissedAutoInstalls: [] }, "installedPowers");
        const registry = document(beforeRegistry, { powers: [] }, "powers"), owners = ownerDocument(beforeOwners);
        const records = entries(installed, "installedPowers"), sources = entries(registry, "powers"), ref = destination(name);
        const snapshot = await disk.snapshotDirectory(roots, ref), owner = owners[name];
        if (!isOwned(name, owner, snapshot, records, sources) || snapshot === null) throw new Error("Kiro power is not managed or was modified");
        if (await disk.path(roots, { root: "library", path: name }) !== owner.source || await disk.snapshotDirectory(roots, { root: "library", path: name }) !== owner.hash) throw new Error("Kiro power source is unavailable or changed");
        const target = await disk.path(roots, ref);
        let shared = false;
        for (const entry of sources) {
          if (entry.name === name || !isObject2(entry.source) || entry.source.type !== "local" || typeof entry.source.path !== "string") continue;
          if (entry.source.path === target || entry.source.path.startsWith(`${target}/`) || entry.source.path.startsWith(`${target}\\`)) shared = true;
        }
        const others = await disk.list(roots, { root: "plugins", path: "registries" });
        if (others.some((entry) => entry.name !== "user-added.json") || await disk.read(roots, { root: "plugins", path: "registry.json" }) !== null) shared = true;
        delete owners[name];
        installed.installedPowers = records.filter((entry) => entry.name !== name);
        registry.powers = sources.filter((entry) => entry.name !== name);
        await disk.commit(roots, [
          { ref: INSTALLED, before: beforeInstalled, after: serialize(installed) },
          { ref: REGISTRY, before: beforeRegistry, after: serialize(registry) },
          { ref: OWNERS, before: beforeOwners, after: serialize(owners) }
        ], void 0, shared ? void 0 : { ref, before: snapshot });
        return { message: shared ? `${name} removed from Kiro; files retained because other sources may reference them` : `${name} removed from Kiro; reload Kiro to refresh` };
      });
    }
  };
}

// src/index.tsx
import { jsx } from "react/jsx-runtime";
var KiroIcon = ({ className, "aria-hidden": ariaHidden }) => /* @__PURE__ */ jsx("img", { src: "/hub/extensions/kiro/assets/icon.svg", alt: "", className, "aria-hidden": ariaHidden });
function apply(ctx) {
  const places = [
    { id: "kiro", labelKey: "kiro.tab", icon: KiroIcon, scope: "workspace", dir: SKILL_DIR },
    { id: "kiro-global", labelKey: "kiro.tab", icon: KiroIcon, scope: "global", dir: SKILL_DIR }
  ];
  ctx.skills.register({ id: KIRO_ID, places });
  ctx.prompts.register(createKiroPrompts(ctx.prompts.tools, KiroIcon));
  ctx.mcp.register(createKiroMcp(ctx.mcp.tools));
  ctx.plugins.register(createKiroInstaller());
  ctx.targets.register({ id: KIRO_ID, displayName: "Kiro", icon: KiroIcon, supports: SUPPORTS, locations: LOCATIONS, format: "Markdown skills, steering and agents; JSON MCP" });
  ctx.locales.register({ id: "en", label: "English", messages: kiroMessages });
  ctx.locales.register({ id: "zh-CN", label: "\u7B80\u4F53\u4E2D\u6587", messages: kiroZhMessages });
}
export {
  apply
};
