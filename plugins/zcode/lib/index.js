// src/locations.ts
var ZCODE_ID = "hub.target.zcode";
var ZCODE_SKILL_DIR = ".zcode/skills";
var ZCODE_COMMAND_DIR = ".zcode/commands";
var ZCODE_AGENT_DIR = ".zcode/agents";
var ZCODE_INSTRUCTIONS = ".zcode/AGENTS.md";
var ZCODE_CONFIG = ".zcode/config.json";
var ZCODE_GLOBAL_CONFIG = ".zcode/cli/config.json";
var ZCODE_MCP_FALLBACK = ".agents/mcp.json";
var ZCODE_MANIFEST = ".zcode-plugin/plugin.json";
var ZCODE_PLUGIN_ROOTS = {
  home: ".zcode",
  state: "cli/plugins",
  config: { write: ["cli/config.json"], read: [] },
  stateFiles: {
    write: ["installed_plugins.json", "known_marketplaces.json", "marketplaces/context-hub/marketplace.json", "cache/context-hub/*/*"],
    read: ["cache/*/*/*/.zcode-plugin/plugin.json", "cache/context-hub/*/*"]
  },
  workspace: { write: [], read: [".zcode/config.json"] },
  library: { write: [], read: ["*", "*/.zcode-plugin/plugin.json", ".claude-plugin/marketplace.json"] },
  external: [".zcode-plugin/plugin.json"]
};
var SUPPORTS = ["skill", "mcp", "memory", "agent"];
var GLOBAL_LOCATIONS = [
  { label: "Skills", path: `~/${ZCODE_SKILL_DIR}` },
  { label: "MCP / Plugins", path: `~/${ZCODE_GLOBAL_CONFIG}` },
  { label: "Commands", path: `~/${ZCODE_COMMAND_DIR}` },
  { label: "Instructions", path: `~/${ZCODE_INSTRUCTIONS}` },
  { label: "Agents", path: `~/${ZCODE_AGENT_DIR}` }
];
var PROJECT_LOCATIONS = [
  { label: "Skills", path: ZCODE_SKILL_DIR },
  { label: "MCP", path: ZCODE_CONFIG },
  { label: "Commands", path: ZCODE_COMMAND_DIR },
  { label: "Agents", path: ZCODE_AGENT_DIR }
];

// src/messages.ts
var zcodeMessages = {
  "zcode.tab": "ZCode",
  "zcode.menu.instructions": "Add to ZCode AGENTS.md",
  "zcode.menu.instructions.remove": "Remove from ZCode AGENTS.md",
  "zcode.error.slug": "ZCode requires an ASCII name of at most 64 characters: {name}",
  "zcode.error.form": "Unsupported ZCode prompt form: {form}",
  "zcode.error.reserved": "ZCode reserves agent name: {name}",
  "zcode.error.handwritten": "A hand-written file already exists: {file}",
  "zcode.error.description": "ZCode agents require a description.",
  "zcode.error.section": "The Hub instruction markers are incomplete or duplicated: {file}",
  "zcode.error.unknownPlace": "Unknown ZCode place: {place}",
  "zcode.error.json": "ZCode configuration must be a supported strict JSON object: {file}",
  "zcode.error.refused": "Cannot read or write ZCode file: {file}",
  "zcode.error.unsupported": "ZCode MCP declaration is not the current native format: {file}",
  "zcode.error.fallback": "This write would hide Desktop MCP servers in {file}; migrate them in ZCode settings first.",
  "zcode.error.scope": "ZCode place and scope do not match: {file}",
  "zcode.error.missing": "ZCode MCP declaration does not exist: {file}"
};
var zcodeZhMessages = {
  "zcode.tab": "ZCode",
  "zcode.menu.instructions": "\u6DFB\u52A0\u5230 ZCode AGENTS.md",
  "zcode.menu.instructions.remove": "\u4ECE ZCode AGENTS.md \u79FB\u9664",
  "zcode.error.slug": "ZCode \u540D\u79F0\u5FC5\u987B\u4E3A\u6700\u591A 64 \u5B57\u7B26\u7684 ASCII \u5B89\u5168\u540D\u79F0\uFF1A{name}",
  "zcode.error.form": "\u4E0D\u652F\u6301\u7684 ZCode \u63D0\u793A\u8BCD\u5F62\u5F0F\uFF1A{form}",
  "zcode.error.reserved": "ZCode \u4FDD\u7559\u6B64 Agent \u540D\u79F0\uFF1A{name}",
  "zcode.error.handwritten": "\u5DF2\u5B58\u5728\u624B\u5199\u6587\u4EF6\uFF1A{file}",
  "zcode.error.description": "ZCode Agent \u5FC5\u987B\u6709\u975E\u7A7A\u63CF\u8FF0\u3002",
  "zcode.error.section": "Hub \u6307\u4EE4\u6807\u8BB0\u4E0D\u5B8C\u6574\u6216\u91CD\u590D\uFF1A{file}",
  "zcode.error.unknownPlace": "\u672A\u77E5 ZCode \u4F4D\u7F6E\uFF1A{place}",
  "zcode.error.json": "ZCode \u914D\u7F6E\u4E0D\u662F\u53D7\u652F\u6301\u7684\u4E25\u683C JSON object\uFF1A{file}",
  "zcode.error.refused": "\u65E0\u6CD5\u8BFB\u5199 ZCode \u6587\u4EF6\uFF1A{file}",
  "zcode.error.unsupported": "ZCode MCP \u58F0\u660E\u4E0D\u662F\u5F53\u524D\u539F\u751F\u683C\u5F0F\uFF1A{file}",
  "zcode.error.fallback": "\u5199\u5165\u4F1A\u906E\u853D {file} \u7684 Desktop MCP\uFF1B\u8BF7\u5148\u5728 ZCode \u539F\u751F\u8BBE\u7F6E\u4E2D\u8FC1\u79FB\u3002",
  "zcode.error.scope": "ZCode \u4F4D\u7F6E\u4E0E\u4F5C\u7528\u57DF\u4E0D\u5339\u914D\uFF1A{file}",
  "zcode.error.missing": "ZCode MCP \u58F0\u660E\u4E0D\u5B58\u5728\uFF1A{file}"
};

// src/provider.ts
function object(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function strings(value) {
  return object(value) && Object.values(value).every((item) => typeof item === "string");
}
function canonical(value) {
  if (!object(value) || ["environment", "http_headers", "enable"].some((key) => Object.hasOwn(value, key))) return false;
  if (value.enabled !== void 0 && typeof value.enabled !== "boolean") return false;
  if (value.type === "stdio") {
    return typeof value.command === "string" && value.command.trim() !== "" && (value.args === void 0 || Array.isArray(value.args) && value.args.every((arg) => typeof arg === "string")) && (value.env === void 0 || strings(value.env)) && value.url === void 0 && value.headers === void 0;
  }
  return (value.type === "http" || value.type === "sse") && typeof value.url === "string" && value.url.trim() !== "" && (value.headers === void 0 || strings(value.headers)) && value.command === void 0 && value.args === void 0 && value.env === void 0;
}
function createZCodeMcp(tools) {
  const places = [
    { id: "zcode-global", label: "ZCode", scope: "global", file: ZCODE_GLOBAL_CONFIG, switchable: true },
    { id: "zcode", label: "ZCode", scope: "workspace", file: ZCODE_CONFIG, switchable: true }
  ];
  const fail = (key, file, failure) => new tools.McpError(
    `zcode.error.${key}`,
    { file },
    failure instanceof Error ? failure.message : failure === void 0 ? void 0 : String(failure)
  );
  const fileOf = (id) => {
    const place = places.find((one) => one.id === id);
    if (place === void 0) throw new tools.McpError("zcode.error.unknownPlace", { place: id });
    return { scope: place.scope, file: place.file };
  };
  const read = async (io, ref) => {
    try {
      return await io.files.read(ref);
    } catch (error) {
      throw fail("refused", ref.file, error);
    }
  };
  const parse = (text2, ref) => {
    if (text2 === null) return {};
    try {
      const document2 = JSON.parse(text2);
      if (!object(document2)) throw new Error("\u914D\u7F6E\u5FC5\u987B\u662F JSON object");
      return document2;
    } catch (error) {
      throw fail("json", ref.file, error);
    }
  };
  const serversOf = (document2, ref) => {
    if (!Object.hasOwn(document2, "mcp")) return {};
    if (!object(document2.mcp)) throw fail("json", ref.file);
    if (!Object.hasOwn(document2.mcp, "servers")) return {};
    if (!object(document2.mcp.servers)) throw fail("json", ref.file);
    return document2.mcp.servers;
  };
  const entryOf = (servers, name, ref) => {
    if (!Object.hasOwn(servers, name)) return void 0;
    const entry = servers[name];
    if (!canonical(entry)) throw fail("unsupported", ref.file);
    return entry;
  };
  const write = async (io, ref, text2) => {
    try {
      await io.files.write(ref, text2);
    } catch (error) {
      throw fail("refused", ref.file, error);
    }
  };
  const fallbackCheck = async (io, ref) => {
    const fallback = { scope: ref.scope, file: ZCODE_MCP_FALLBACK };
    const document2 = parse(await read(io, fallback), fallback);
    if (!Object.hasOwn(document2, "mcpServers")) return;
    if (!object(document2.mcpServers)) throw fail("json", fallback.file);
    if (Object.keys(document2.mcpServers).length > 0) throw fail("fallback", fallback.file);
  };
  return {
    id: ZCODE_ID,
    places,
    async read(io, place) {
      const ref = fileOf(place);
      const servers = serversOf(parse(await read(io, ref), ref), ref);
      return Object.entries(servers).map(([name, entry]) => ({
        name,
        declaration: canonical(entry) ? tools.readDeclaration(entry) : null,
        enabled: object(entry) && entry.enabled === false ? false : true
      }));
    },
    async install(io, place, name, declaration) {
      const ref = fileOf(place);
      const text2 = await read(io, ref);
      const servers = serversOf(parse(text2, ref), ref);
      const existing = entryOf(servers, name, ref);
      const values = { ...tools.writeDeclaration(declaration), type: declaration.transport };
      if (name.trim() === "" || !canonical(values)) throw fail("unsupported", ref.file);
      if (Object.keys(servers).length === 0) await fallbackCheck(io, ref);
      const target = ["mcp", "servers", name];
      let after = text2;
      if (existing === void 0) after = tools.editJson(after, target, values);
      else {
        for (const key of ["type", "command", "args", "env", "url", "headers"]) {
          after = tools.editJson(after, [...target, key], values[key]);
        }
      }
      await write(io, ref, after);
    },
    async uninstall(io, place, name) {
      const ref = fileOf(place);
      const text2 = await read(io, ref);
      const servers = serversOf(parse(text2, ref), ref);
      if (entryOf(servers, name, ref) === void 0) return;
      await write(io, ref, tools.editJson(text2, ["mcp", "servers", name], void 0));
    },
    async setEnabled(io, place, scope, name, enabled) {
      const ref = fileOf(place);
      if (scope !== ref.scope) throw fail("scope", ref.file);
      const text2 = await read(io, ref);
      const servers = serversOf(parse(text2, ref), ref);
      if (entryOf(servers, name, ref) === void 0) throw fail("missing", ref.file);
      await write(io, ref, tools.editJson(text2, ["mcp", "servers", name, "enabled"], enabled ? void 0 : false));
    },
    async locate(io, place, name) {
      const ref = fileOf(place);
      const text2 = await read(io, ref);
      serversOf(parse(text2, ref), ref);
      return text2 === null ? null : tools.jsonValueLines(text2, ["mcp", "servers", name]);
    }
  };
}

// src/prompts.ts
function createZCodePrompts(icon, tools) {
  const commands = { id: "commands", labelKey: "prompts.menu.commands", removeLabelKey: "prompts.menu.commands.remove" };
  const agent = { id: "agent", labelKey: "prompts.menu.agent", removeLabelKey: "prompts.menu.agent.remove" };
  const places = [
    { id: "zcode-global", agent: ZCODE_ID, labelKey: "zcode.tab", icon, scope: "global", where: "~/.zcode", forms: [commands, agent, { id: "instructions", labelKey: "zcode.menu.instructions", removeLabelKey: "zcode.menu.instructions.remove" }] },
    { id: "zcode", agent: ZCODE_ID, labelKey: "zcode.tab", icon, scope: "workspace", where: ".zcode", forms: [commands, agent] }
  ];
  const fail = (key, params, failure) => new tools.PromptError(
    `zcode.error.${key}`,
    params,
    failure instanceof Error ? failure.message : failure === void 0 ? void 0 : String(failure)
  );
  const placeOf = (id) => {
    const place = places.find((one) => one.id === id);
    if (place === void 0) throw fail("unknownPlace", { place: id });
    return place;
  };
  const slugOf = (prompt) => {
    const normalized = prompt.name.normalize("NFC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "");
    if (normalized.length > 64 || /[\\/]/.test(prompt.name)) throw fail("slug", { name: prompt.name });
    const slug = tools.slugOf(prompt.name);
    if (!/^[a-z0-9][a-z0-9_:-]{0,63}$/.test(slug)) throw fail("slug", { name: prompt.name });
    return slug;
  };
  const target = (place, prompt, form, option) => {
    if (option !== void 0 || !place.forms.some((one) => one.id === form)) throw fail("form", { form });
    const slug = slugOf(prompt);
    if (form === "agent" && ["general-purpose", "explore"].includes(slug)) throw fail("reserved", { name: slug });
    return { scope: place.scope, file: form === "instructions" ? ZCODE_INSTRUCTIONS : `${form === "commands" ? ZCODE_COMMAND_DIR : ZCODE_AGENT_DIR}/${slug}.md` };
  };
  const read = async (io, ref) => {
    try {
      return await io.files.read(ref);
    } catch (error) {
      throw fail("refused", { file: ref.file }, error);
    }
  };
  const write = async (io, ref, text2) => {
    try {
      if (text2 === null) await io.files.remove(ref);
      else await io.files.write(ref, text2);
    } catch (error) {
      throw fail("refused", { file: ref.file }, error);
    }
  };
  const marker = (prompt) => `<!-- context-hub:${slugOf(prompt)} -->`;
  const owned2 = (text2, prompt) => text2.split(/\r?\n/).includes(marker(prompt));
  const sectionCheck = (text2, prompt) => {
    if (text2 === null) return;
    const opening = marker(prompt);
    const closing = `<!-- /context-hub:${slugOf(prompt)} -->`;
    const open = text2.split(opening).length - 1;
    const close = text2.split(closing).length - 1;
    if (open !== close || open > 1 || open === 1 && text2.indexOf(closing) < text2.indexOf(opening)) {
      throw fail("section", { file: ZCODE_INSTRUCTIONS });
    }
  };
  return {
    id: ZCODE_ID,
    places,
    async held(io, id, prompt) {
      const place = placeOf(id);
      const answer = {};
      for (const form of place.forms) {
        if (form.id === "agent" && ["general-purpose", "explore"].includes(slugOf(prompt))) continue;
        const ref = target(place, prompt, form.id);
        const text2 = await read(io, ref);
        if (form.id === "instructions") sectionCheck(text2, prompt);
        if (text2 !== null && owned2(text2, prompt)) answer[form.id] = true;
      }
      return answer;
    },
    async install(io, id, prompt, form, option) {
      const place = placeOf(id);
      const ref = target(place, prompt, form, option);
      const text2 = await read(io, ref);
      if (form === "instructions") {
        sectionCheck(text2, prompt);
        await write(io, ref, tools.withSection(text2, { slug: slugOf(prompt), title: prompt.name, body: prompt.prompt }));
        return;
      }
      if (text2 !== null && !owned2(text2, prompt)) throw fail("handwritten", { file: ref.file });
      const description = prompt.description.trim() || tools.describeBody(prompt.prompt).trim() || prompt.name.trim();
      if (description === "") throw fail("description");
      await write(io, ref, tools.commandFile({
        name: slugOf(prompt),
        description,
        body: `${marker(prompt)}
${prompt.prompt}`,
        frontmatter: true
      }));
    },
    async remove(io, id, prompt, form, option) {
      const place = placeOf(id);
      const ref = target(place, prompt, form, option);
      const text2 = await read(io, ref);
      if (text2 === null) return false;
      if (form === "instructions") {
        sectionCheck(text2, prompt);
        const next = tools.withoutSection(text2, slugOf(prompt));
        if (next === null) return false;
        await write(io, ref, next.trim() === "" ? null : next);
        return true;
      }
      if (!owned2(text2, prompt)) throw fail("handwritten", { file: ref.file });
      await write(io, ref, null);
      return true;
    }
  };
}

// src/plugin-state.ts
var USER = { root: "config", path: "cli/config.json" };
var PROJECT = { root: "workspace", path: ".zcode/config.json" };
var INSTALLED = { root: "plugins", path: "installed_plugins.json" };
var KNOWN = { root: "plugins", path: "known_marketplaces.json" };
var CATALOG = { root: "plugins", path: "marketplaces/context-hub/marketplace.json" };
var MARKET = "context-hub";
function object2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function document(text2, where) {
  if (text2 === null) return {};
  let value;
  try {
    value = JSON.parse(text2);
  } catch {
    throw new Error(`\u65E0\u6548\u4E25\u683C JSON\uFF1A${where}`);
  }
  if (!object2(value)) throw new Error(`JSON \u5FC5\u987B\u4E3A object\uFF1A${where}`);
  return value;
}
function segment(value) {
  if (!/^[a-z0-9][a-z0-9._-]{0,127}$/.test(value) || /[. ]$/.test(value) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value)) {
    throw new Error(`\u4E0D\u5B89\u5168\u7684\u63D2\u4EF6\u8DEF\u5F84\u6BB5\uFF1A${value}`);
  }
  return value;
}
function versionSegment(value) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$/.test(value) || value.endsWith(".") || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value)) throw new Error("\u4E0D\u5B89\u5168\u7684\u63D2\u4EF6\u7248\u672C");
  return value;
}
function identity(id) {
  const parts = id.split("@");
  if (parts.length !== 2) throw new Error("\u65E0\u6548\u63D2\u4EF6\u8EAB\u4EFD");
  return [segment(parts[0]), segment(parts[1])];
}
function join(root, relative, platform) {
  const separator = platform === "win32" ? "\\" : "/";
  return `${root.replace(/[\\/]+$/, "")}${separator}${relative.split("/").join(separator)}`;
}
function samePath(first, second, platform) {
  const normalize = (value) => {
    const clean = value.replace(/\\/g, "/").replace(/\/+$/, "");
    return platform === "win32" ? clean.toLowerCase() : clean;
  };
  return normalize(first) === normalize(second);
}
function text(record, key) {
  if (typeof record[key] !== "string" || record[key] === "") throw new Error(`\u6CE8\u518C\u8868\u5B57\u6BB5\u65E0\u6548\uFF1A${key}`);
}
function optional(record, keys) {
  for (const key of keys) if (record[key] !== void 0 && typeof record[key] !== "string") throw new Error(`\u6CE8\u518C\u8868\u5B57\u6BB5\u65E0\u6548\uFF1A${key}`);
}
function config(raw, where) {
  const root = document(raw, where);
  const plugins = root.plugins === void 0 ? {} : root.plugins;
  if (!object2(plugins)) throw new Error(`plugins \u5FC5\u987B\u4E3A object\uFF1A${where}`);
  if (plugins.enabled !== void 0 && typeof plugins.enabled !== "boolean") throw new Error(`plugins.enabled \u5FC5\u987B\u4E3A boolean\uFF1A${where}`);
  const enabled = plugins.enabledPlugins === void 0 ? {} : plugins.enabledPlugins;
  const options = plugins.options === void 0 ? {} : plugins.options;
  if (!object2(enabled) || Object.values(enabled).some((value) => typeof value !== "boolean")) throw new Error(`enabledPlugins \u5FC5\u987B\u4E3A\u5E03\u5C14\u6620\u5C04\uFF1A${where}`);
  if (!object2(options) || Object.values(options).some((value) => !object2(value))) throw new Error(`options \u5FC5\u987B\u4E3A\u5BF9\u8C61\u6620\u5C04\uFF1A${where}`);
  return { document: root, plugins, enabled, options };
}
function installed(raw) {
  if (raw === null) return { root: { version: 1, plugins: [] }, records: [] };
  const root = document(raw, INSTALLED.path);
  if (root.version !== 1 || !Array.isArray(root.plugins)) throw new Error("\u4E0D\u652F\u6301 installed_plugins.json schema\uFF1B\u4EC5\u63A5\u53D7 version 1 \u6570\u7EC4");
  const ids = /* @__PURE__ */ new Set();
  for (const value of root.plugins) {
    if (!object2(value)) throw new Error("\u65E0\u6548\u5B89\u88C5\u8BB0\u5F55");
    for (const key of ["id", "name", "marketplace", "version", "installPath", "installedAt"]) text(value, key);
    optional(value, ["updatedAt", "cacheTransactionId"]);
    const [name, market] = identity(value.id);
    if (value.name !== name || value.marketplace !== market || value.scope !== "user" || ids.has(value.id)) throw new Error("\u4E0D\u652F\u6301\u91CD\u590D\u8EAB\u4EFD\u6216\u975E user \u5B89\u88C5\u8BB0\u5F55");
    if (value.dependencies !== void 0 && (!Array.isArray(value.dependencies) || value.dependencies.some((one) => typeof one !== "string"))) throw new Error("\u5B89\u88C5\u4F9D\u8D56\u5B57\u6BB5\u65E0\u6548");
    ids.add(value.id);
  }
  return { root, records: root.plugins };
}
function known(raw) {
  if (raw === null) return { root: { version: 1, marketplaces: [] }, markets: [] };
  const root = document(raw, KNOWN.path);
  if (root.version !== 1 || !Array.isArray(root.marketplaces)) throw new Error("\u4E0D\u652F\u6301 known_marketplaces.json schema\uFF1B\u4EC5\u63A5\u53D7 version 1 \u6570\u7EC4");
  const ids = /* @__PURE__ */ new Set();
  for (const value of root.marketplaces) {
    if (!object2(value)) throw new Error("\u65E0\u6548\u5E02\u573A\u8BB0\u5F55");
    for (const key of ["id", "name", "addedAt"]) text(value, key);
    optional(value, ["description", "lastUpdated", "cacheTransactionId"]);
    if (!object2(value.source) || typeof value.source.source !== "string" || typeof value.pluginCount !== "number" || !Number.isInteger(value.pluginCount) || value.pluginCount < 0 || ids.has(value.id)) throw new Error("\u65E0\u6548\u5E02\u573A\u5B57\u6BB5");
    const source = value.source;
    const required = { directory: ["path"], file: ["path"], git: ["url"], github: ["repo"], url: ["url"], npm: ["package"], hostPattern: ["hostPattern"], pathPattern: ["pathPattern"], settings: [] };
    const keys = required[source.source];
    if (keys === void 0) throw new Error("\u672A\u77E5\u5E02\u573A source schema");
    for (const key of keys) text(source, key);
    if (source.source === "settings" && !object2(source.marketplace)) throw new Error("\u65E0\u6548\u5185\u8054\u5E02\u573A");
    ids.add(value.id);
  }
  return { root, markets: root.marketplaces };
}
async function readState(disk, roots) {
  const refs = [USER, INSTALLED, KNOWN, CATALOG];
  const [user, index, markets, catalog] = await Promise.all(refs.map((ref) => disk.read(roots, ref)));
  const project = roots.workspace === null ? null : await disk.read(roots, PROJECT);
  const inventory = installed(index);
  const registry = known(markets);
  return {
    raw: { user, project, installed: index, known: markets, catalog },
    user: config(user, USER.path),
    project: config(project, PROJECT.path),
    installed: inventory.root,
    records: inventory.records,
    known: registry.root,
    markets: registry.markets
  };
}
function effective(state, id) {
  if (state.project.plugins.enabled === false || state.user.plugins.enabled === false) return false;
  return state.project.enabled[id] ?? state.user.enabled[id];
}
function dependencies(manifest2) {
  if (manifest2.dependencies === void 0) return [];
  if (!Array.isArray(manifest2.dependencies)) throw new Error("\u65E0\u6CD5\u9A8C\u8BC1\u63D2\u4EF6\u4F9D\u8D56");
  return manifest2.dependencies.map((value) => {
    let id;
    if (typeof value === "string" && value !== "") id = value;
    else if (object2(value) && typeof value.name === "string" && (value.marketplace === void 0 || typeof value.marketplace === "string")) {
      id = `${value.name}${value.marketplace === void 0 ? "" : `@${value.marketplace}`}`;
    } else throw new Error("\u65E0\u6CD5\u9A8C\u8BC1\u63D2\u4EF6\u4F9D\u8D56");
    if (id.includes("@")) identity(id);
    else segment(id);
    return id;
  });
}

// src/installer.ts
function diskOf(tools) {
  if (tools.disk === void 0 || typeof tools.disk.snapshotDirectory !== "function") throw new Error("\u6B64 Hub \u7248\u672C\u4E0D\u652F\u6301 ZCode \u5FC5\u9700\u7684\u6587\u4EF6\u5B89\u88C5\u53CA\u76EE\u5F55\u5FEB\u7167\u5951\u7EA6");
  return tools.disk;
}
function userOnly(scope) {
  if (scope !== "user") throw new Error("ZCode v1 \u4EC5\u652F\u6301 user \u63D2\u4EF6\u5B89\u88C5\u548C\u542F\u505C");
}
function writable(id) {
  const [name, market] = identity(id);
  if (market !== MARKET) throw new Error("\u7B2C\u4E09\u65B9\u3001inline \u4E0E builtin \u63D2\u4EF6\u53EA\u8BFB");
  return name;
}
function manifest(raw, expected) {
  if (raw === null) throw new Error(`\u7F3A\u5C11\u539F\u751F ${ZCODE_MANIFEST}\uFF0C\u4E0D\u652F\u6301\u6E05\u5355\u56DE\u9000`);
  const value = document(raw, ZCODE_MANIFEST);
  if (typeof value.name !== "string" || value.name !== expected) throw new Error("\u539F\u751F\u6E05\u5355 name \u4E0E Hub \u5E93\u540D\u4E0D\u4E00\u81F4");
  segment(value.name);
  if (value.version !== void 0 && (typeof value.version !== "string" || value.version.trim() === "")) throw new Error("\u539F\u751F\u63D2\u4EF6 version \u7C7B\u578B\u65E0\u6548");
  if (value.description !== void 0 && typeof value.description !== "string") throw new Error("\u539F\u751F\u63D2\u4EF6 description \u7C7B\u578B\u65E0\u6548");
  return value;
}
function requiredOptions(pack, state, id) {
  if (pack.userConfig === void 0) return;
  if (!object2(pack.userConfig)) throw new Error("\u539F\u751F userConfig \u5FC5\u987B\u4E3A object");
  const options = { ...state.user.options[id], ...state.project.options[id] };
  const missing = [];
  for (const [key, option] of Object.entries(pack.userConfig)) {
    if (!object2(option) || option.required !== void 0 && typeof option.required !== "boolean" || option.sensitive !== void 0 && typeof option.sensitive !== "boolean") throw new Error("userConfig schema \u65E0\u6548");
    if (option.type !== void 0 && !["string", "number", "boolean", "directory", "file"].includes(String(option.type))) throw new Error("\u672A\u77E5 userConfig \u7C7B\u578B");
    const value = Object.hasOwn(options, key) ? options[key] : option.default;
    if (value !== void 0) {
      const type = option.type === "directory" || option.type === "file" ? "string" : option.type;
      if (!["string", "number", "boolean"].includes(typeof value) || type !== void 0 && typeof value !== type || typeof value === "number" && !Number.isFinite(value)) throw new Error(`userConfig \u503C\u7C7B\u578B\u65E0\u6548\uFF1A${key}`);
    }
    if (option.required === true && (value === void 0 || value === "")) missing.push(key);
  }
  if (missing.length > 0) throw new Error(`\u7F3A\u5C11\u5FC5\u9700 userConfig\uFF1A${missing.join(", ")}`);
}
function owned(record, roots) {
  if (record.marketplace !== MARKET || typeof record.contextHubSnapshot !== "string" || !/^[a-f0-9]{64}$/.test(record.contextHubSnapshot)) return false;
  const relative = `cache/${MARKET}/${segment(record.name)}/${versionSegment(record.version)}`;
  return samePath(record.installPath, join(roots.plugins, relative, roots.platform), roots.platform);
}
function control(state, id, on) {
  if (on && (state.user.plugins.enabled === false || state.project.plugins.enabled === false)) throw new Error("plugins.enabled \u603B\u95E8\u5173\u95ED\uFF1B\u8BF7\u5728 ZCode \u4E2D\u7BA1\u7406\u63A7\u5236\u914D\u7F6E");
  const override = state.project.enabled[id];
  if (override !== void 0 && override !== on) throw new Error("\u5F53\u524D\u9879\u76EE .zcode/config.json \u8986\u76D6 user \u5F00\u5173\uFF1B\u8BF7\u5728 ZCode \u4E2D\u4FEE\u6539");
}
async function unchanged(disk, roots, state) {
  if (roots.workspace !== null && await disk.read(roots, { root: "workspace", path: ".zcode/config.json" }) !== state.raw.project) throw new Error("\u5DE5\u4F5C\u533A\u914D\u7F6E\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u8BD5");
}
async function notRequired(disk, roots, state, id) {
  for (const other of state.records) {
    if (other.id === id || effective(state, other.id) === false) continue;
    const raw = await disk.readExternal(roots, other.installPath, ZCODE_MANIFEST);
    const pack = manifest(raw, other.name);
    const required = [...dependencies(pack), ...dependencies({ dependencies: other.dependencies ?? [] })];
    if (required.some((dependency) => (dependency.includes("@") ? dependency : `${dependency}@${other.marketplace}`) === id)) {
      throw new Error(`${id} \u88AB\u5DF2\u542F\u7528\u6216\u72B6\u6001\u672A\u77E5\u7684 ${other.id} \u4F9D\u8D56`);
    }
  }
  if (Array.isArray(state.user.plugins.dirs) && state.user.plugins.dirs.length > 0) throw new Error("\u5B58\u5728 inline \u63D2\u4EF6\uFF0C\u65E0\u6CD5\u9A8C\u8BC1\u53CD\u5411\u4F9D\u8D56\uFF1B\u8BF7\u5728 ZCode \u4E2D\u7BA1\u7406");
  if (state.user.plugins.dirs !== void 0 && !Array.isArray(state.user.plugins.dirs)) throw new Error("plugins.dirs schema \u65E0\u6548");
}
function createZCodeInstaller(json) {
  return {
    id: ZCODE_ID,
    label: "ZCode",
    places: [{ id: "zcode-user", label: "ZCode", scope: "global", scopeWord: "user", switchable: true, file: ZCODE_GLOBAL_CONFIG }],
    async available(tools) {
      await diskOf(tools).roots(ZCODE_PLUGIN_ROOTS);
      return true;
    },
    async held(tools) {
      const disk = diskOf(tools);
      const roots = await disk.roots(ZCODE_PLUGIN_ROOTS);
      const state = await readState(disk, roots);
      const result = [];
      for (const record of state.records) {
        const raw = await disk.readExternal(roots, record.installPath, ZCODE_MANIFEST);
        let pack = {};
        if (raw !== null) pack = manifest(raw, record.name);
        result.push({
          name: record.name,
          id: record.id,
          version: record.version,
          scope: "user",
          enabled: raw === null ? void 0 : effective(state, record.id) ?? (owned(record, roots) ? false : void 0),
          readOnly: !owned(record, roots),
          marketplace: record.marketplace,
          source: { kind: "local", path: record.installPath },
          pack: { name: typeof pack.name === "string" ? pack.name : "", version: typeof pack.version === "string" ? pack.version : "", description: typeof pack.description === "string" ? pack.description : "" }
        });
      }
      return result;
    },
    async switches(tools) {
      const disk = diskOf(tools);
      const roots = await disk.roots(ZCODE_PLUGIN_ROOTS);
      const state = await readState(disk, roots);
      return { user: { ...state.user.enabled } };
    },
    async install(name, scope, tools) {
      userOnly(scope);
      segment(name);
      const disk = diskOf(tools);
      return disk.run(ZCODE_PLUGIN_ROOTS, async (roots) => {
        const state = await readState(disk, roots);
        const sourceSnapshot = await disk.snapshotDirectory(roots, { root: "library", path: name });
        if (sourceSnapshot === null) throw new Error("\u539F\u751F\u6E90\u5305\u76EE\u5F55\u4E0D\u5B58\u5728");
        const raw = await disk.read(roots, { root: "library", path: `${name}/${ZCODE_MANIFEST}` });
        const pack = manifest(raw, name);
        const id = `${name}@${MARKET}`;
        if (dependencies(pack).length > 0) throw new Error("ZCode v1 \u4E0D\u5B89\u88C5\u6709 dependencies \u7684\u63D2\u4EF6");
        requiredOptions(pack, state, id);
        const on = state.user.enabled[id] ?? true;
        if (state.user.plugins.enabled === false || state.project.plugins.enabled === false) throw new Error("plugins.enabled \u603B\u95E8\u5173\u95ED\uFF1B\u5B89\u88C5\u524D\u8BF7\u5728 ZCode \u4E2D\u7BA1\u7406\u63A7\u5236\u914D\u7F6E");
        control(state, id, on);
        const version = versionSegment(typeof pack.version === "string" ? pack.version : "0.0.0");
        const existing = state.records.find((record2) => record2.id === id);
        if (existing !== void 0 && !owned(existing, roots)) throw new Error("\u5DF2\u6709\u8BB0\u5F55\u4E0D\u5C5E\u4E8E Hub \u89C4\u8303\u7F13\u5B58\uFF0C\u62D2\u7EDD\u8986\u76D6");
        const known2 = state.markets.find((market2) => market2.id === MARKET || market2.name === MARKET);
        if (known2 !== void 0 && (known2.id !== MARKET || known2.name !== MARKET || known2.source.source !== "directory" || typeof known2.source.path !== "string" || !samePath(known2.source.path, roots.library, roots.platform))) throw new Error("context-hub \u5E02\u573A\u5DF2\u6307\u5411\u5176\u5B83\u6765\u6E90");
        if (state.raw.catalog !== null) {
          const cached = document(state.raw.catalog, CATALOG.path);
          if (cached.name !== MARKET || !Array.isArray(cached.plugins)) throw new Error("\u7F13\u5B58\u5E02\u573A\u76EE\u5F55\u65E0\u6548");
        }
        const listed = [];
        for (const candidate of await tools.packs()) {
          segment(candidate.name);
          const candidateRaw = await disk.read(roots, { root: "library", path: `${candidate.name}/${ZCODE_MANIFEST}` });
          if (candidateRaw === null) continue;
          const native = manifest(candidateRaw, candidate.name);
          listed.push({ name: candidate.name, source: `./${candidate.name}`, version: native.version ?? "0.0.0", description: native.description ?? "" });
        }
        if (!listed.some((entry) => entry.name === name)) throw new Error("\u539F\u751F\u63D2\u4EF6\u4E0D\u5728 Hub \u8D44\u4EA7\u5E93");
        const catalog = { name: MARKET, description: "Plugin packs collected by Context Hub.", plugins: listed };
        const now = (/* @__PURE__ */ new Date()).toISOString();
        const destination = `cache/${MARKET}/${name}/${version}`;
        const location = join(roots.plugins, destination, roots.platform);
        const sameVersion = existing?.version === version;
        const before = sameVersion ? existing?.contextHubSnapshot : null;
        if (sameVersion && (typeof before !== "string" || !/^[a-f0-9]{64}$/.test(before))) throw new Error("\u7F3A\u5C11\u5DF2\u5B89\u88C5\u76EE\u5F55\u5FEB\u7167\uFF0C\u62D2\u7EDD\u8986\u76D6\uFF1B\u8BF7\u5728 ZCode \u4E2D\u7BA1\u7406");
        if (sameVersion && before !== sourceSnapshot) throw new Error("\u540C\u7248\u672C\u6E90\u5185\u5BB9\u5DF2\u53D8\u5316\uFF0C\u62D2\u7EDD\u8986\u76D6\u5DF2\u6709\u7F13\u5B58");
        const record = { ...existing, id, name, marketplace: MARKET, version, installPath: location, installedAt: existing?.installedAt ?? now, updatedAt: now, scope: "user", source: `./${name}`, contextHubSnapshot: sourceSnapshot };
        const records = existing === void 0 ? [...state.records, record] : state.records.map((one) => one.id === id ? record : one);
        const market = { ...known2, id: MARKET, name: MARKET, source: { ...known2?.source ?? {}, source: "directory", path: roots.library }, addedAt: known2?.addedAt ?? now, pluginCount: listed.length, lastUpdated: now };
        const markets = known2 === void 0 ? [...state.markets, market] : state.markets.map((one) => one === known2 ? market : one);
        const changes = [
          { ref: INSTALLED, before: state.raw.installed, after: json.editJson(state.raw.installed ?? JSON.stringify(state.installed), ["plugins"], records) },
          { ref: KNOWN, before: state.raw.known, after: json.editJson(state.raw.known ?? JSON.stringify(state.known), ["marketplaces"], markets) },
          { ref: CATALOG, before: state.raw.catalog, after: `${JSON.stringify(catalog, null, 2)}
` },
          { ref: USER, before: state.raw.user, after: json.editJson(state.raw.user, ["plugins", "enabledPlugins", id], on) }
        ];
        await unchanged(disk, roots, state);
        if (await disk.read(roots, { root: "library", path: `${name}/${ZCODE_MANIFEST}` }) !== raw) throw new Error("\u6E90\u6E05\u5355\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u8BD5");
        await tools.syncMarketplace([{ path: ".claude-plugin/marketplace.json", document: catalog }]);
        await disk.commit(roots, changes, { name, destination, manifests: [ZCODE_MANIFEST], sourceSnapshot, before });
        return { message: `${id} \u5DF2\u5B89\u88C5\u5230 ZCode user`, location };
      });
    },
    async remove(id, scope, tools) {
      userOnly(scope);
      writable(id);
      const disk = diskOf(tools);
      return disk.run(ZCODE_PLUGIN_ROOTS, async (roots) => {
        const state = await readState(disk, roots);
        const record = state.records.find((one) => one.id === id);
        if (record === void 0 || !owned(record, roots)) throw new Error("\u63D2\u4EF6\u4E0D\u5C5E\u4E8E Hub \u89C4\u8303\u7F13\u5B58");
        await notRequired(disk, roots, state, id);
        await unchanged(disk, roots, state);
        const snapshot = record.contextHubSnapshot;
        if (typeof snapshot !== "string" || !/^[a-f0-9]{64}$/.test(snapshot)) throw new Error("\u7F3A\u5C11\u5DF2\u5B89\u88C5\u76EE\u5F55\u5FEB\u7167\uFF0C\u62D2\u7EDD\u5220\u9664\uFF1B\u8BF7\u5728 ZCode \u4E2D\u7BA1\u7406");
        const relative = `cache/${MARKET}/${record.name}/${versionSegment(record.version)}`;
        await disk.commit(roots, [
          { ref: INSTALLED, before: state.raw.installed, after: json.editJson(state.raw.installed, ["plugins"], state.records.filter((one) => one.id !== id)) },
          { ref: USER, before: state.raw.user, after: json.editJson(state.raw.user, ["plugins", "enabledPlugins", id], void 0) }
        ], void 0, { ref: { root: "plugins", path: relative }, before: snapshot });
        return { message: `${id} \u5DF2\u5378\u8F7D\uFF1Bdata\u3001options\u3001\u9879\u76EE\u8986\u76D6\u548C\u65E7\u7248\u672C\u7F13\u5B58\u4FDD\u7559` };
      });
    },
    async setEnabled(id, scope, on, tools) {
      userOnly(scope);
      writable(id);
      const disk = diskOf(tools);
      return disk.run(ZCODE_PLUGIN_ROOTS, async (roots) => {
        const state = await readState(disk, roots);
        const record = state.records.find((one) => one.id === id);
        if (record === void 0 || !owned(record, roots)) throw new Error("\u63D2\u4EF6\u4E0D\u5C5E\u4E8E Hub \u89C4\u8303\u7F13\u5B58");
        control(state, id, on);
        if (!on) await notRequired(disk, roots, state, id);
        await unchanged(disk, roots, state);
        await disk.commit(roots, [{ ref: USER, before: state.raw.user, after: json.editJson(state.raw.user, ["plugins", "enabledPlugins", id], on) }]);
        return { message: `${id} user \u5F00\u5173\u5DF2${on ? "\u5F00\u542F" : "\u5173\u95ED"}` };
      });
    }
  };
}

// src/index.tsx
import { jsx, jsxs } from "react/jsx-runtime";
var ZCodeIcon = ({ className, "aria-hidden": ariaHidden }) => /* @__PURE__ */ jsxs("svg", { viewBox: "0 0 256 218", fill: "none", className, "aria-hidden": ariaHidden, focusable: "false", children: [
  /* @__PURE__ */ jsx("title", { children: "ZCode" }),
  /* @__PURE__ */ jsx("path", { fill: "currentColor", d: "M134.4 0.130152L116.48 25.6022C113.665 29.5699 109.054 32.0019 104.064 32.0019H6.3999V0C6.3999 0.130149 134.4 0.130152 134.4 0.130152Z" }),
  /* @__PURE__ */ jsx("path", { fill: "currentColor", d: "M256 0.130127L102.401 217.732H0L153.599 0.130127H256Z" }),
  /* @__PURE__ */ jsx("path", { fill: "currentColor", d: "M121.601 217.732L139.65 192.134C142.465 188.166 147.076 185.734 152.067 185.734H249.604V217.736H121.601V217.732Z" })
] });
function skillPlaces(icon) {
  return [
    { id: "zcode", labelKey: "zcode.tab", icon, scope: "workspace", dir: ZCODE_SKILL_DIR },
    { id: "zcode-global", labelKey: "zcode.tab", icon, scope: "global", dir: ZCODE_SKILL_DIR }
  ];
}
function apply(ctx) {
  if (typeof ctx.plugins.registerManifests !== "function") throw new Error("\u6B64 Hub \u7248\u672C\u7F3A\u5C11 ZCode \u539F\u751F\u6E05\u5355\u5951\u7EA6");
  const icon = ZCodeIcon;
  ctx.plugins.registerManifests([ZCODE_MANIFEST]);
  ctx.plugins.register(createZCodeInstaller(ctx.mcp.tools));
  ctx.skills.register({ id: ZCODE_ID, places: skillPlaces(icon) });
  ctx.mcp.register(createZCodeMcp(ctx.mcp.tools));
  ctx.prompts.register(createZCodePrompts(icon, ctx.prompts.tools));
  ctx.targets.register({
    id: ZCODE_ID,
    displayName: "ZCode",
    icon,
    supports: SUPPORTS,
    locations: [...GLOBAL_LOCATIONS, ...PROJECT_LOCATIONS],
    format: "Markdown skills, commands and agents; strict JSON MCP and native plugin packs"
  });
  ctx.locales.register({ id: "en", label: "English", messages: zcodeMessages });
  ctx.locales.register({ id: "zh-CN", label: "\u7B80\u4F53\u4E2D\u6587", messages: zcodeZhMessages });
}
export {
  apply
};
