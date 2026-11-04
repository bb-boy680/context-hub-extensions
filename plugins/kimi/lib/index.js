// src/locations.ts
var KIMI_CODE_ID = "hub.target.kimi-code";
var KIMI_SKILL_DIR = ".kimi-code/skills";
var KIMI_MCP_FILE = ".kimi-code/mcp.json";
var KIMI_AGENT_DIR = ".kimi-code/agents";
var KIMI_INSTRUCTION_FILE = ".kimi-code/AGENTS.md";
var SUPPORTS = ["skill", "mcp", "memory", "agent"];
var LOCATIONS = [
  { label: "Skills", path: "~/.kimi-code/skills/<name>/SKILL.md" },
  { label: "Agents", path: "~/.kimi-code/agents/<slug>.md" },
  { label: "Instructions", path: "~/.kimi-code/AGENTS.md" },
  { label: "MCP servers", path: "~/.kimi-code/mcp.json" },
  { label: "Plugins", path: "~/.kimi-code/plugins/installed.json" },
  { label: "Project skills", path: ".kimi-code/skills/<name>/SKILL.md" },
  { label: "Project agents", path: ".kimi-code/agents/<slug>.md" },
  { label: "Project instructions", path: ".kimi-code/AGENTS.md" },
  { label: "Project MCP servers", path: ".kimi-code/mcp.json" }
];

// src/messages.ts
var kimiMessages = {
  "kimi.tab": "Kimi Code",
  "kimi.menu.instructions": "Add to instructions",
  "kimi.menu.instructions.remove": "Remove from instructions",
  "kimi.error.unknownPlace": "Unknown Kimi location: {place}",
  "kimi.error.unknownForm": "Unknown Kimi delivery form: {form}",
  "kimi.error.parse": "Cannot read Kimi configuration: {file}",
  "kimi.error.invalidEntry": "Invalid Kimi MCP server: {name}",
  "kimi.error.missingEntry": "Kimi MCP server not found: {name}",
  "kimi.error.scope": "Invalid scope for Kimi location: {place}",
  "kimi.error.transport": "Cannot change transport while {name} has additional settings",
  "kimi.error.sectionBroken": "Incomplete or repeated instruction markers in {file}",
  "kimi.error.handwritten": "The existing file is not managed by Context Hub: {file}",
  "kimi.error.agentName": "Kimi agent names must use lowercase ASCII letters, digits and hyphens: {name}"
};
var kimiZhMessages = {
  "kimi.tab": "Kimi Code",
  "kimi.menu.instructions": "\u6DFB\u52A0\u5230\u6307\u4EE4",
  "kimi.menu.instructions.remove": "\u4ECE\u6307\u4EE4\u4E2D\u79FB\u9664",
  "kimi.error.unknownPlace": "\u672A\u77E5\u7684 Kimi \u4F4D\u7F6E\uFF1A{place}",
  "kimi.error.unknownForm": "\u672A\u77E5\u7684 Kimi \u4EA4\u4ED8\u5F62\u5F0F\uFF1A{form}",
  "kimi.error.parse": "\u65E0\u6CD5\u8BFB\u53D6 Kimi \u914D\u7F6E\uFF1A{file}",
  "kimi.error.invalidEntry": "\u65E0\u6548\u7684 Kimi MCP \u670D\u52A1\u5668\uFF1A{name}",
  "kimi.error.missingEntry": "\u627E\u4E0D\u5230 Kimi MCP \u670D\u52A1\u5668\uFF1A{name}",
  "kimi.error.scope": "Kimi \u4F4D\u7F6E\u7684\u4F5C\u7528\u57DF\u65E0\u6548\uFF1A{place}",
  "kimi.error.transport": "{name} \u5305\u542B\u989D\u5916\u914D\u7F6E\uFF0C\u65E0\u6CD5\u66F4\u6362\u4F20\u8F93\u65B9\u5F0F",
  "kimi.error.sectionBroken": "\u6307\u4EE4\u6587\u4EF6\u4E2D\u7684\u6807\u8BB0\u4E0D\u5B8C\u6574\u6216\u91CD\u590D\uFF1A{file}",
  "kimi.error.handwritten": "\u73B0\u6709\u6587\u4EF6\u4E0D\u7531 Context Hub \u7BA1\u7406\uFF1A{file}",
  "kimi.error.agentName": "Kimi Agent \u540D\u79F0\u53EA\u80FD\u5305\u542B\u5C0F\u5199\u82F1\u6587\u5B57\u6BCD\u3001\u6570\u5B57\u548C\u8FDE\u5B57\u7B26\uFF1A{name}"
};

// src/provider.ts
var places = [
  { id: "kimi-mcp-global", label: "Kimi Code", scope: "global", file: KIMI_MCP_FILE, installable: true, switchable: true },
  { id: "kimi-mcp-project", label: "Kimi Code", scope: "workspace", file: KIMI_MCP_FILE, installable: true, switchable: true }
];
var object = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var owned = /* @__PURE__ */ new Set(["command", "args", "env", "url", "headers", "transport", "enabled"]);
function createKimiMcp(tools) {
  const placeOf = (id) => {
    const place = places.find((item) => item.id === id);
    if (!place) throw new tools.McpError("kimi.error.unknownPlace", { place: id });
    return place;
  };
  const read = async (io, id) => {
    const place = placeOf(id);
    const text = await io.files.read({ scope: place.scope, file: place.file });
    let doc;
    try {
      doc = tools.readJsonObject(text);
    } catch (error) {
      throw new tools.McpError("kimi.error.parse", { file: place.file }, String(error));
    }
    const servers = doc?.mcpServers;
    if (servers !== void 0 && !object(servers)) throw new tools.McpError("kimi.error.parse", { file: place.file });
    return { place, text, servers };
  };
  const write = async (io, place, text) => io.files.write({ scope: place.scope, file: place.file }, text);
  return {
    id: KIMI_CODE_ID,
    places,
    async read(io, place) {
      const { servers } = await read(io, place);
      return Object.entries(servers ?? {}).map(([name, entry]) => ({
        name,
        declaration: tools.readDeclaration(entry),
        enabled: !object(entry) || entry.enabled !== false
      }));
    },
    async install(io, id, name, declaration) {
      const { place, text, servers } = await read(io, id);
      const prior = servers?.[name];
      if (prior !== void 0) {
        if (!object(prior)) throw new tools.McpError("kimi.error.invalidEntry", { name });
        const old = tools.readDeclaration(prior);
        if (old === null) throw new tools.McpError("kimi.error.invalidEntry", { name });
        if (old.transport !== declaration.transport && Object.keys(prior).some((key) => !owned.has(key))) {
          throw new tools.McpError("kimi.error.transport", { name });
        }
      }
      const path = ["mcpServers", name];
      const values = { ...tools.writeDeclaration(declaration), ...declaration.transport === "sse" ? { transport: "sse" } : {} };
      if (prior === void 0) {
        await write(io, place, tools.editJson(text, path, values));
      } else {
        let next = text;
        for (const key of ["command", "args", "env", "url", "headers", "transport"]) {
          next = tools.editJson(next, [...path, key], values[key]);
        }
        await write(io, place, next);
      }
    },
    async uninstall(io, id, name) {
      const { place, text, servers } = await read(io, id);
      if (servers?.[name] === void 0) return;
      await write(io, place, tools.editJson(text, ["mcpServers", name], void 0));
    },
    async setEnabled(io, id, scope, name, enabled) {
      const { place, text, servers } = await read(io, id);
      if (place.scope !== scope) throw new tools.McpError("kimi.error.scope", { place: id });
      if (!object(servers?.[name])) throw new tools.McpError("kimi.error.missingEntry", { name });
      await write(io, place, tools.editJson(text, ["mcpServers", name, "enabled"], enabled ? void 0 : false));
    },
    async locate(io, id, name) {
      const { text } = await read(io, id);
      return text === null ? null : tools.jsonValueLines(text, ["mcpServers", name]);
    }
  };
}

// src/prompts.ts
function broken(text, slug) {
  const open = `<!-- context-hub:${slug} -->`;
  const close = `<!-- /context-hub:${slug} -->`;
  const a = text.indexOf(open), b = text.indexOf(close);
  return (a !== -1 || b !== -1) && (a < 0 || b < a || text.indexOf(open, a + open.length) >= 0 || text.indexOf(close, b + close.length) >= 0);
}
function createKimiPrompts(icon, tools) {
  const forms = [
    { id: "agent", labelKey: "prompts.menu.agent", removeLabelKey: "prompts.menu.agent.remove" },
    { id: "instructions", labelKey: "kimi.menu.instructions", removeLabelKey: "kimi.menu.instructions.remove" }
  ];
  const places2 = [
    { id: "kimi-global", agent: KIMI_CODE_ID, labelKey: "kimi.tab", icon, scope: "global", order: 20, where: "~/.kimi-code", forms },
    { id: "kimi", agent: KIMI_CODE_ID, labelKey: "kimi.tab", icon, scope: "workspace", order: 20, where: ".kimi-code", forms }
  ];
  const target = (id, prompt, form, option) => {
    const place = places2.find((item) => item.id === id);
    if (!place) throw new tools.PromptError("kimi.error.unknownPlace", { place: id });
    if (option !== void 0 || !forms.some((item) => item.id === form)) throw new tools.PromptError("kimi.error.unknownForm", { form });
    const slug = tools.slugOf(prompt.name);
    return { slug, ref: { scope: place.scope, file: form === "agent" ? `${KIMI_AGENT_DIR}/${slug}.md` : KIMI_INSTRUCTION_FILE } };
  };
  const owned2 = (text, slug) => {
    const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
    if (lines[0]?.trim() !== "---") return false;
    const end = lines.findIndex((line, index2) => index2 > 0 && line.trim() === "---");
    return end >= 0 && lines.slice(end + 1).find((line) => line.trim() !== "") === `<!-- context-hub:${slug} -->`;
  };
  const marker = (slug) => `<!-- context-hub:${slug} -->`;
  return {
    id: KIMI_CODE_ID,
    places: places2,
    async held(io, place, prompt) {
      const agent = target(place, prompt, "agent");
      const instructions = target(place, prompt, "instructions");
      const [agentText, text] = await Promise.all([io.files.read(agent.ref), io.files.read(instructions.ref)]);
      return { agent: agentText !== null, instructions: text !== null && tools.withoutSection(text, instructions.slug) !== null };
    },
    async install(io, place, prompt, form, option) {
      const { slug, ref } = target(place, prompt, form, option);
      if (form === "agent" && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
        throw new tools.PromptError("kimi.error.agentName", { name: prompt.name });
      }
      const existing = await io.files.read(ref);
      if (form === "instructions") {
        if (existing !== null && broken(existing, slug)) throw new tools.PromptError("kimi.error.sectionBroken", { file: ref.file });
        await io.files.write(ref, tools.withSection(existing, { slug, title: prompt.name, body: prompt.prompt }));
      } else {
        if (existing !== null && !owned2(existing, slug)) throw new tools.PromptError("kimi.error.handwritten", { file: ref.file });
        const description = prompt.description.trim() || tools.describeBody(prompt.prompt) || slug;
        await io.files.write(ref, tools.commandFile({ name: slug, description, body: `${marker(slug)}
${prompt.prompt}`, frontmatter: true }));
      }
    },
    async remove(io, place, prompt, form, option) {
      const { slug, ref } = target(place, prompt, form, option);
      const existing = await io.files.read(ref);
      if (existing === null) return false;
      if (form === "instructions") {
        if (broken(existing, slug)) throw new tools.PromptError("kimi.error.sectionBroken", { file: ref.file });
        const next = tools.withoutSection(existing, slug);
        if (next === null) return false;
        if (next.trim() === "") await io.files.remove(ref);
        else await io.files.write(ref, next);
      } else {
        if (!owned2(existing, slug)) throw new tools.PromptError("kimi.error.handwritten", { file: ref.file });
        await io.files.remove(ref);
      }
      return true;
    }
  };
}

// src/plugin-state.ts
function readInstalled(text) {
  if (text === null) return { version: 1, plugins: [] };
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("Invalid Kimi installed.json; file was not changed");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Invalid Kimi installed.json");
  const doc = value;
  if (doc.version !== 1 || !Array.isArray(doc.plugins)) throw new Error("Unsupported Kimi installed.json version or plugins list");
  const ids = /* @__PURE__ */ new Set();
  for (const record of doc.plugins) {
    if (typeof record !== "object" || record === null || Array.isArray(record) || typeof record.id !== "string" || record.id === "" || typeof record.root !== "string" || record.root === "" || typeof record.enabled !== "boolean" || ids.has(record.id)) throw new Error("Invalid or duplicate Kimi plugin record");
    ids.add(record.id);
  }
  return doc;
}

// src/installer.ts
var KIMI_PLUGIN_ROOTS = {
  home: ".kimi-code",
  homeEnv: "KIMI_CODE_HOME",
  state: "plugins",
  config: { write: [], read: [] },
  stateFiles: { write: ["installed.json", "managed/*"], read: ["installed.json"] },
  workspace: { write: [], read: [] },
  library: { write: [], read: ["*", "*/kimi.plugin.json", "*/.kimi-plugin/plugin.json"] },
  directories: ["managed/:name"],
  external: []
};
var manifests = ["kimi.plugin.json", ".kimi-plugin/plugin.json"];
var index = { root: "plugins", path: "installed.json" };
var pluginName = /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*(?:@[A-Za-z0-9_-]+)?$/;
var normalize = (value, platform) => {
  const result = value.replace(/\\/g, "/").replace(/\/+$/, "");
  return platform === "win32" ? result.toLowerCase() : result;
};
var scopeOnly = (scope) => {
  if (scope !== "user") throw new Error("Kimi plugins support user scope only");
};
var diskOf = (tools) => {
  if (!tools.disk) throw new Error("Context Hub does not support plugin file operations");
  return tools.disk;
};
async function current(disk, roots) {
  const before = await disk.read(roots, index);
  return { before, document: readInstalled(before) };
}
async function manifestName(disk, roots, name) {
  for (const manifest of manifests) {
    const raw = await disk.read(roots, { root: "library", path: `${name}/${manifest}` });
    if (raw === null) continue;
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
      const value = parsed.name;
      return typeof value === "string" && pluginName.test(value) ? value.toLowerCase() : null;
    } catch {
      return null;
    }
  }
  return null;
}
async function verifyRoot(tools, roots) {
  if (normalize(await tools.root(), roots.platform) !== normalize(roots.library, roots.platform)) {
    throw new Error("Plugin library changed; retry the operation");
  }
}
function createKimiInstaller() {
  return {
    id: KIMI_CODE_ID,
    label: "Kimi Code",
    places: [{ id: "kimi-user", label: "Kimi Code", scope: "global", scopeWord: "user", switchable: true, file: ".kimi-code/plugins/installed.json" }],
    async available(tools) {
      return tools.has("kimi");
    },
    async held(tools) {
      const disk = diskOf(tools), roots = await disk.roots(KIMI_PLUGIN_ROOTS);
      const { document } = await current(disk, roots);
      const packs = await tools.packs().catch(() => []);
      return Promise.all(document.plugins.map(async (record) => {
        const matched = record.source === "local-path" && typeof record.originalSource === "string" ? packs.find((pack2) => normalize(`${roots.library}/${pack2.name}`, roots.platform) === normalize(record.originalSource, roots.platform) && normalize(`${roots.plugins}/managed/${pack2.name}`, roots.platform) === normalize(record.root, roots.platform)) : void 0;
        const declared = matched ? await manifestName(disk, roots, matched.name).catch(() => null) : null;
        const name = declared === record.id ? matched.name : record.id;
        const pack = await tools.describe(record.root, name).catch(() => ({ name, version: "", description: "" }));
        return {
          name,
          id: record.id,
          version: pack.version,
          scope: "user",
          enabled: record.enabled,
          marketplace: null,
          origin: "record",
          source: { kind: "local", path: record.root },
          pack
        };
      }));
    },
    async switches(tools) {
      const disk = diskOf(tools), roots = await disk.roots(KIMI_PLUGIN_ROOTS);
      const { document } = await current(disk, roots);
      return { user: Object.fromEntries(document.plugins.map((record) => [record.id, record.enabled])) };
    },
    async install(name, scope, tools) {
      scopeOnly(scope);
      const disk = diskOf(tools);
      return disk.run(KIMI_PLUGIN_ROOTS, async (roots) => {
        await verifyRoot(tools, roots);
        const sourceRef = { root: "library", path: name };
        const sourceSnapshot = await disk.snapshotDirectory(roots, sourceRef);
        if (sourceSnapshot === null) throw new Error("Plugin library source no longer exists");
        const source = await disk.path(roots, sourceRef);
        const destination = `managed/${name}`;
        const destRef = { root: "plugins", path: destination };
        const root = await disk.path(roots, destRef);
        const before = await disk.snapshotDirectory(roots, destRef);
        const id = await manifestName(disk, roots, name);
        if (id === null) throw new Error("Invalid Kimi plugin manifest name");
        const state = await current(disk, roots);
        const old = state.document.plugins.find((record2) => record2.id === id);
        const same = (a, b) => normalize(a, roots.platform) === normalize(b, roots.platform);
        if (state.document.plugins.some((record2) => record2.id !== id && same(record2.root, root))) {
          throw new Error("Kimi managed directory belongs to another plugin");
        }
        if (old && (old.source !== "local-path" || typeof old.originalSource !== "string" || !same(old.originalSource, source) || !same(old.root, root))) {
          throw new Error("Kimi plugin has another installation source; remove it in Kimi first");
        }
        if (!old && before !== null) throw new Error("Kimi managed directory already exists without a matching Hub record");
        if (old && before !== null && before !== sourceSnapshot) throw new Error("Kimi managed directory differs from the library; refusing to overwrite");
        const now = (/* @__PURE__ */ new Date()).toISOString();
        const record = {
          ...old,
          id,
          root,
          source: "local-path",
          originalSource: source,
          origin: "custom",
          enabled: old?.enabled ?? true,
          installedAt: old?.installedAt ?? now,
          updatedAt: now
        };
        const plugins = old ? state.document.plugins.map((entry) => entry === old ? record : entry) : [...state.document.plugins, record];
        await verifyRoot(tools, roots);
        await disk.commit(
          roots,
          [{ ref: index, before: state.before, after: JSON.stringify({ ...state.document, version: 1, plugins }, null, 2) }],
          { name, destination, replace: true, before, sourceSnapshot, manifests }
        );
        return { message: `${name} installed for Kimi Code; reload or start a new session`, location: root };
      });
    },
    async remove(id, scope, tools) {
      scopeOnly(scope);
      const disk = diskOf(tools);
      return disk.run(KIMI_PLUGIN_ROOTS, async (roots) => {
        await verifyRoot(tools, roots);
        const state = await current(disk, roots);
        const plugins = state.document.plugins.filter((record) => record.id !== id);
        if (plugins.length === state.document.plugins.length) throw new Error(`${id} is not installed`);
        await verifyRoot(tools, roots);
        await disk.commit(roots, [{ ref: index, before: state.before, after: JSON.stringify({ ...state.document, plugins }, null, 2) }]);
        return { message: `${id} removed; the managed copy remains. Reload or start a new session` };
      });
    },
    async setEnabled(id, scope, on, tools) {
      scopeOnly(scope);
      const disk = diskOf(tools);
      return disk.run(KIMI_PLUGIN_ROOTS, async (roots) => {
        await verifyRoot(tools, roots);
        const state = await current(disk, roots);
        if (!state.document.plugins.some((record) => record.id === id)) throw new Error(`${id} is not installed`);
        const plugins = state.document.plugins.map((record) => record.id === id ? { ...record, enabled: on, updatedAt: (/* @__PURE__ */ new Date()).toISOString() } : record);
        await verifyRoot(tools, roots);
        await disk.commit(roots, [{ ref: index, before: state.before, after: JSON.stringify({ ...state.document, plugins }, null, 2) }]);
        return { message: `${id} ${on ? "enabled" : "disabled"}; reload or start a new session` };
      });
    }
  };
}

// src/index.tsx
import { jsx } from "react/jsx-runtime";
var KimiIcon = ({ className, "aria-hidden": ariaHidden }) => /* @__PURE__ */ jsx(
  "img",
  {
    src: "/hub/extensions/kimi/assets/icon.png",
    className,
    "aria-hidden": ariaHidden,
    alt: ariaHidden === true ? "" : "Kimi Code"
  }
);
function apply(ctx) {
  ctx.skills.register({ id: KIMI_CODE_ID, places: [
    { id: "kimi", labelKey: "kimi.tab", icon: KimiIcon, scope: "workspace", dir: KIMI_SKILL_DIR, order: 20 },
    { id: "kimi-global", labelKey: "kimi.tab", icon: KimiIcon, scope: "global", dir: KIMI_SKILL_DIR, order: 20 }
  ] });
  ctx.mcp.register(createKimiMcp(ctx.mcp.tools));
  ctx.prompts.register(createKimiPrompts(KimiIcon, ctx.prompts.tools));
  ctx.plugins.registerManifests(["kimi.plugin.json", ".kimi-plugin/plugin.json"]);
  ctx.plugins.register(createKimiInstaller());
  ctx.targets.register({
    id: KIMI_CODE_ID,
    displayName: "Kimi Code",
    icon: KimiIcon,
    supports: [...SUPPORTS],
    locations: LOCATIONS,
    format: "Markdown skills and agents; JSON MCP; AGENTS.md instructions; kimi.plugin.json plugins"
  });
  ctx.locales.register({ id: "en", label: "English", messages: kimiMessages });
  ctx.locales.register({ id: "zh-CN", label: "\u7B80\u4F53\u4E2D\u6587", messages: kimiZhMessages });
}
export {
  apply
};
