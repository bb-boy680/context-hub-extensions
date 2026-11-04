// src/icon.tsx
import { jsx, jsxs } from "react/jsx-runtime";
var CopilotIcon = ({ className, "aria-hidden": ariaHidden }) => /* @__PURE__ */ jsxs("svg", { viewBox: "0 0 24 24", className, "aria-hidden": ariaHidden, children: [
  /* @__PURE__ */ jsx("path", { d: "M23.922 16.992c-.861 1.495-5.859 5.023-11.922 5.023-6.063 0-11.061-3.528-11.922-5.023A.641.641 0 0 1 0 16.736v-2.869a.841.841 0 0 1 .053-.22c.372-.935 1.347-2.292 2.605-2.656.167-.429.414-1.055.644-1.517a10.195 10.195 0 0 1-.052-1.086c0-1.331.282-2.499 1.132-3.368.397-.406.89-.717 1.474-.952 1.399-1.136 3.392-2.093 6.122-2.093 2.731 0 4.767.957 6.166 2.093.584.235 1.077.546 1.474.952.85.869 1.132 2.037 1.132 3.368 0 .368-.014.733-.052 1.086.23.462.477 1.088.644 1.517 1.258.364 2.233 1.721 2.605 2.656a.832.832 0 0 1 .053.22v2.869a.641.641 0 0 1-.078.256ZM12.172 11h-.344a4.323 4.323 0 0 1-.355.508C10.703 12.455 9.555 13 7.965 13c-1.725 0-2.989-.359-3.782-1.259a2.005 2.005 0 0 1-.085-.104L4 11.741v6.585c1.435.779 4.514 2.179 8 2.179 3.486 0 6.565-1.4 8-2.179v-6.585l-.098-.104s-.033.045-.085.104c-.793.9-2.057 1.259-3.782 1.259-1.59 0-2.738-.545-3.508-1.492a4.323 4.323 0 0 1-.355-.508h-.016.016Zm.641-2.935c.136 1.057.403 1.913.878 2.497.442.544 1.134.938 2.344.938 1.573 0 2.292-.337 2.657-.751.384-.435.558-1.15.558-2.361 0-1.14-.243-1.847-.705-2.319-.477-.488-1.319-.862-2.824-1.025-1.487-.161-2.192.138-2.533.529-.269.307-.437.808-.438 1.578v.021c0 .265.021.562.063.893Zm-1.626 0c.042-.331.063-.628.063-.894v-.02c-.001-.77-.169-1.271-.438-1.578-.341-.391-1.046-.69-2.533-.529-1.505.163-2.347.537-2.824 1.025-.462.472-.705 1.179-.705 2.319 0 1.211.175 1.926.558 2.361.365.414 1.084.751 2.657.751 1.21 0 1.902-.394 2.344-.938.475-.584.742-1.44.878-2.497Z" }),
  /* @__PURE__ */ jsx("path", { d: "M14.5 14.25a1 1 0 0 1 1 1v2a1 1 0 0 1-2 0v-2a1 1 0 0 1 1-1Zm-5 0a1 1 0 0 1 1 1v2a1 1 0 0 1-2 0v-2a1 1 0 0 1 1-1Z" })
] });

// src/locations.ts
var COPILOT_ID = "hub.target.copilot";

// src/plugin-format.ts
var PLUGIN_SCHEMA = "https://agent-plugins.org/schemas/1.1.0/plugin.schema.json";
var MCP_SCHEMA = "https://agent-plugins.org/schemas/1.1.0/mcp.schema.json";
var object = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
var keys = (v, allowed) => Object.keys(v).every((key) => allowed.includes(key));
var strings = (v) => object(v) && Object.values(v).every((item) => typeof item === "string");
var optionalString = (v) => v === void 0 || typeof v === "string";
function validatePlugin(text, mcp, expectedName) {
  if (text === null) throw new Error("Missing plugin.json");
  const value = JSON.parse(text);
  if (!object(value) || value.$schema !== PLUGIN_SCHEMA || value.name !== expectedName || typeof value.name !== "string" || value.name.length > 64 || !/^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(value.name) || !keys(value, ["$schema", "name", "version", "description", "author", "homepage", "repository", "license", "keywords", "extensions"])) throw new Error("Invalid Agent Plugins 1.1.0 manifest");
  if (![value.version, value.description, value.homepage, value.repository, value.license].every(optionalString) || value.keywords !== void 0 && (!Array.isArray(value.keywords) || !value.keywords.every((x) => typeof x === "string")) || value.author !== void 0 && (!object(value.author) || !keys(value.author, ["name", "email", "url"]) || !Object.values(value.author).every((x) => typeof x === "string")) || value.extensions !== void 0 && (!object(value.extensions) || !Object.values(value.extensions).every(object))) throw new Error("Invalid Agent Plugins 1.1.0 manifest fields");
  if (mcp !== null) {
    const doc = JSON.parse(mcp);
    if (!object(doc) || doc.$schema !== MCP_SCHEMA || !keys(doc, ["$schema", "mcpServers"]) || !object(doc.mcpServers)) throw new Error("Invalid Agent Plugins 1.1.0 MCP file");
    for (const server of Object.values(doc.mcpServers)) {
      if (!object(server)) throw new Error("Invalid plugin MCP server");
      if (server.type === "stdio") {
        if (!keys(server, ["type", "command", "args", "env", "cwd"]) || typeof server.command !== "string" || !server.command || server.args !== void 0 && (!Array.isArray(server.args) || !server.args.every((v) => typeof v === "string")) || server.env !== void 0 && (!strings(server.env) || Object.hasOwn(server.env, "PLUGIN_ROOT") || Object.hasOwn(server.env, "PLUGIN_DATA")) || server.cwd !== void 0 && (typeof server.cwd !== "string" || !/^(?:\.\/|\$\{PLUGIN_ROOT\}(?:\/|$)|\$\{PLUGIN_DATA\}(?:\/|$))/.test(server.cwd))) throw new Error("Invalid plugin stdio server");
      } else if (server.type === "streamable-http" || server.type === "sse") {
        if (!keys(server, ["type", "url", "headers"]) || typeof server.url !== "string" || !server.url || server.headers !== void 0 && !strings(server.headers)) throw new Error("Invalid plugin remote server");
      } else throw new Error("Unsupported plugin MCP transport");
    }
  }
  return value;
}

// src/installer.ts
var MARKET = "context-hub";
var USER = { root: "config", path: "settings.json" };
var PROJECT = { root: "workspace", path: ".github/copilot/settings.json" };
var LOCAL = { root: "workspace", path: ".github/copilot/settings.local.json" };
var CLAUDE = [{ root: "workspace", path: ".claude/settings.json" }, { root: "workspace", path: ".claude/settings.local.json" }];
var SCOPE = {
  home: ".copilot",
  homeEnv: "COPILOT_HOME",
  state: "installed-plugins",
  config: { read: ["settings.local.json"], write: ["settings.json"] },
  stateFiles: { read: ["**"], write: [] },
  // 根目录与子目录的列举共用读取范围。
  workspace: { read: [LOCAL.path, ...CLAUDE.map((ref) => ref.path)], write: [PROJECT.path] },
  library: { read: ["marketplace.json", "*/plugin.json", "*/mcp.json"], write: [] },
  external: []
};
var blank = { name: "", version: "", description: "" };
var empty = (v) => object(v) ? v : {};
var join = (root, part, platform) => `${root.replace(/[\\/]+$/, "")}${platform === "win32" ? "\\" : "/"}${part}`;
var samePath = (a, b, platform) => {
  const norm = (v) => v.replace(/^\\\\\?\\/, "").replace(/\\/g, "/").replace(/\/+$/, "");
  return platform === "win32" ? norm(a).toLowerCase() === norm(b).toLowerCase() : norm(a) === norm(b);
};
var identity = (id) => {
  const match = /^([a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)@([a-z0-9][a-z0-9.-]*)$/.exec(id);
  if (!match || match[1].includes("..") || match[1].includes("--")) throw new Error(`Invalid plugin identity: ${id}`);
  return { name: match[1], market: match[2] };
};
var writable = (id) => {
  const parsed = identity(id);
  if (parsed.market !== MARKET) throw new Error("Plugin belongs to another marketplace");
  return parsed.name;
};
var checkScope = (scope) => {
  if (scope !== "user" && scope !== "project") throw new Error("Unsupported scope");
};
var diskOf = (tools) => {
  if (!tools.disk) throw new Error("Plugin file access is unavailable");
  return tools.disk;
};
function createCopilotInstaller(json) {
  const parse = (text) => json.readJsonObject(text) ?? {};
  const edit = (text, key, id, value) => {
    let result = text;
    if (value !== void 0 && parse(result)[key] === void 0 && result.trim()) result = json.editJson(result, [key], {});
    return json.editJson(result, [key, id], value);
  };
  const readSettings = async (disk, roots) => {
    const userText = await disk.read(roots, USER);
    const projectText = roots.workspace ? await disk.read(roots, PROJECT) : null;
    const localText = roots.workspace ? await disk.read(roots, LOCAL) : null;
    const userLocalText = await disk.read(roots, { root: "config", path: "settings.local.json" });
    const compatTexts = roots.workspace ? await Promise.all(CLAUDE.map((ref) => disk.read(roots, ref))) : [];
    return { userText, projectText, user: parse(userText), project: parse(projectText), local: parse(localText), userLocal: parse(userLocalText), compat: compatTexts.map(parse) };
  };
  const entries = (doc) => empty(doc.enabledPlugins);
  const checkMaps = (doc) => {
    for (const key of ["enabledPlugins", "extraKnownMarketplaces"]) if (doc[key] !== void 0 && !object(doc[key])) throw new Error(`Invalid ${key} settings`);
  };
  const checkSettings = (s) => {
    for (const doc of [s.user, s.project, s.local, s.userLocal, ...s.compat]) checkMaps(doc);
  };
  const checkShadow = (s, id, scope) => {
    for (const [file, doc] of [["settings.local.json", s.userLocal], [".github/copilot/settings.local.json", s.local], ...s.compat.map((x, i) => [CLAUDE[i].path, x])]) {
      if (Object.hasOwn(entries(doc), id) || Object.hasOwn(empty(doc.extraKnownMarketplaces), MARKET)) throw new Error(`Plugin state is controlled by ${file}`);
    }
    if (Object.hasOwn(empty(s.project.extraKnownMarketplaces), MARKET)) throw new Error("Marketplace is controlled by .github/copilot/settings.json");
    if (scope === "user" && Object.hasOwn(entries(s.project), id)) throw new Error("Plugin state is controlled by .github/copilot/settings.json");
  };
  const marketPath = (user) => {
    const value = empty(empty(user.extraKnownMarketplaces)[MARKET]);
    const source = empty(value.source);
    return source.source === "directory" && typeof source.path === "string" ? source.path : null;
  };
  const checkMarket = (s, roots) => {
    const market = empty(s.user.extraKnownMarketplaces)[MARKET];
    if (market !== void 0 && (marketPath(s.user) === null || !samePath(marketPath(s.user), roots.library, roots.platform))) throw new Error("Marketplace points to another directory");
  };
  const pack = async (disk, roots, name) => validatePlugin(await disk.read(roots, { root: "library", path: `${name}/plugin.json` }), await disk.read(roots, { root: "library", path: `${name}/mcp.json` }), name);
  const sourceAvailable = async (disk, roots, name, path) => {
    if (path === null || !samePath(path, roots.library, roots.platform)) return false;
    try {
      const raw = await disk.read(roots, { root: "library", path: "marketplace.json" });
      if (raw === null) return false;
      const index = parse(raw);
      if (index.name !== MARKET || !Array.isArray(index.plugins) || !index.plugins.some((v) => object(v) && v.name === name && v.source === `./${name}`)) return false;
      await pack(disk, roots, name);
      return true;
    } catch {
      return false;
    }
  };
  const checkWritableSource = async (disk, roots, s, name) => {
    checkMarket(s, roots);
    if (!await sourceAvailable(disk, roots, name, marketPath(s.user))) throw new Error("Plugin source is unavailable");
  };
  return {
    id: COPILOT_ID,
    label: "GitHub Copilot",
    places: [
      { id: "copilot-plugin-user", label: "Copilot", scope: "global", scopeWord: "user", switchable: true, file: ".copilot/settings.json" },
      { id: "copilot-plugin-project", label: "Copilot", scope: "workspace", scopeWord: "project", switchable: true, file: ".github/copilot/settings.json", overrides: ["user"] }
    ],
    async available(tools) {
      try {
        await diskOf(tools).roots(SCOPE);
        return true;
      } catch {
        return false;
      }
    },
    async switches(tools) {
      const disk = diskOf(tools), roots = await disk.roots(SCOPE), s = await readSettings(disk, roots);
      return Object.fromEntries([["user", s.user], ["project", s.project]].map(([key, doc]) => [key, Object.fromEntries(Object.entries(entries(doc)).filter(([, v]) => typeof v === "boolean"))]));
    },
    async held(tools) {
      const disk = diskOf(tools), roots = await disk.roots(SCOPE), s = await readSettings(disk, roots), result = [];
      const marketplacePath = marketPath(s.user);
      for (const [scope, doc] of [["user", s.user], ["project", s.project]]) {
        for (const [id, value] of Object.entries(entries(doc))) {
          if (typeof value !== "boolean") continue;
          let parsed;
          try {
            parsed = identity(id);
          } catch {
            continue;
          }
          const source = parsed.market === MARKET ? marketplacePath ? join(marketplacePath, parsed.name, roots.platform) : join(roots.library, parsed.name, roots.platform) : join(join(roots.plugins, parsed.market, roots.platform), parsed.name, roots.platform);
          const available = parsed.market === MARKET && await sourceAvailable(disk, roots, parsed.name, marketplacePath);
          let blocked = false;
          try {
            checkSettings(s);
            checkShadow(s, id, scope);
          } catch {
            blocked = true;
          }
          let description = blank;
          if (available) {
            const manifest = await pack(disk, roots, parsed.name);
            const described = await tools.describe(source, parsed.name).catch(() => blank);
            description = { ...described, name: parsed.name, version: typeof manifest.version === "string" ? manifest.version : "", description: typeof manifest.description === "string" ? manifest.description : "" };
          }
          result.push({ name: parsed.name, id, version: description.version, scope, enabled: available && !blocked ? typeof entries(s.local)[id] === "boolean" ? entries(s.local)[id] : typeof entries(s.project)[id] === "boolean" ? entries(s.project)[id] : value : void 0, marketplace: parsed.market, readOnly: parsed.market !== MARKET || !available || blocked, origin: "declaration", ...parsed.market === MARKET ? { sourceAvailable: available } : {}, source: { kind: "local", path: source }, pack: description });
        }
      }
      for (const market of await disk.list(roots, { root: "plugins", path: "" })) {
        if (!market.directory) continue;
        for (const item of await disk.list(roots, { root: "plugins", path: market.name })) {
          if (!item.directory) continue;
          const id = `${item.name}@${market.name}`;
          if (result.some((v) => v.id === id)) continue;
          const source = join(join(roots.plugins, market.name, roots.platform), item.name, roots.platform);
          const description = await tools.describe(source, item.name).catch(() => blank);
          result.push({ name: item.name, id, version: description.version, scope: "user", marketplace: market.name, origin: "record", readOnly: true, source: { kind: "local", path: source }, pack: description });
        }
      }
      return result;
    },
    async install(name, scope, tools) {
      const id = `${name}@${MARKET}`;
      writable(id);
      checkScope(scope);
      const disk = diskOf(tools);
      return disk.run(SCOPE, async (roots) => {
        if (scope === "project" && !roots.workspace) throw new Error("Workspace unavailable");
        const s = await readSettings(disk, roots);
        checkSettings(s);
        checkShadow(s, id, scope);
        checkMarket(s, roots);
        await pack(disk, roots, name);
        const valid = [];
        for (const candidate of await tools.packs()) {
          try {
            await pack(disk, roots, candidate.name);
            valid.push(candidate);
          } catch {
          }
        }
        if (!valid.some((v) => v.name === name)) throw new Error("Plugin is absent from the library");
        const existingIndexText = await disk.read(roots, { root: "library", path: "marketplace.json" });
        if (existingIndexText !== null && parse(existingIndexText).name !== MARKET) throw new Error("Existing marketplace index belongs to another owner");
        let user = s.userText ?? "";
        if (!marketPath(s.user)) user = edit(user, "extraKnownMarketplaces", MARKET, { source: { source: "directory", path: roots.library } });
        const changes = [];
        if (scope === "user") user = edit(user, "enabledPlugins", id, true);
        if (user !== (s.userText ?? "")) changes.push({ ref: USER, before: s.userText, after: user });
        if (scope === "project") changes.push({ ref: PROJECT, before: s.projectText, after: edit(s.projectText ?? "", "enabledPlugins", id, true) });
        await tools.syncMarketplace([{ path: "marketplace.json", document: { name: MARKET, owner: { name: "Context Hub" }, plugins: valid.map((v) => ({ name: v.name, description: v.description, version: v.version, source: `./${v.name}` })) } }]);
        try {
          await disk.commit(roots, changes);
        } catch (error) {
          throw new Error(`Plugin settings could not be committed; the marketplace index may have been updated. Check the declaration and index before retrying: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
        }
        return { message: `${id} declared for Copilot`, location: join(roots.library, name, roots.platform) };
      });
    },
    async remove(id, scope, tools) {
      checkScope(scope);
      const name = writable(id);
      const disk = diskOf(tools);
      return disk.run(SCOPE, async (roots) => {
        const s = await readSettings(disk, roots);
        checkSettings(s);
        checkShadow(s, id, scope);
        await checkWritableSource(disk, roots, s, name);
        const ref = scope === "user" ? USER : PROJECT, doc = scope === "user" ? s.user : s.project, before = scope === "user" ? s.userText : s.projectText;
        if (!Object.hasOwn(entries(doc), id)) throw new Error("Plugin declaration does not exist");
        await disk.commit(roots, [{ ref, before, after: json.editJson(before ?? "", ["enabledPlugins", id], void 0) }]);
        return { message: `${id} declaration removed` };
      });
    },
    async setEnabled(id, scope, on, tools) {
      checkScope(scope);
      const name = writable(id);
      const disk = diskOf(tools);
      return disk.run(SCOPE, async (roots) => {
        const s = await readSettings(disk, roots);
        checkSettings(s);
        checkShadow(s, id, scope);
        await checkWritableSource(disk, roots, s, name);
        const ref = scope === "user" ? USER : PROJECT, doc = scope === "user" ? s.user : s.project, before = scope === "user" ? s.userText : s.projectText;
        if (!Object.hasOwn(entries(doc), id) && !Object.hasOwn(entries(s.user), id)) throw new Error("Plugin declaration does not exist");
        await disk.commit(roots, [{ ref, before, after: edit(before ?? "", "enabledPlugins", id, on) }]);
        return { message: `${id} declaration updated` };
      });
    }
  };
}

// src/messages.ts
var copilotMessages = {
  "copilot.tab": "GitHub Copilot",
  "copilot.vscode": "VS Code Local",
  "copilot.menu.instructions": "Instructions",
  "copilot.menu.rule": "Project rule",
  "copilot.error.unknownPlace": "Unknown Copilot location: {place}",
  "copilot.error.unknownForm": "Unknown Copilot form: {form}",
  "copilot.error.fileExists": "The file is not owned by Context Hub: {file}",
  "copilot.error.invalidEnvelope": "The MCP file does not use the expected envelope.",
  "copilot.error.unsupportedEntry": "The MCP server cannot be edited: {name}"
};
var copilotZhMessages = {
  "copilot.tab": "GitHub Copilot",
  "copilot.vscode": "VS Code Local",
  "copilot.menu.instructions": "\u6307\u4EE4",
  "copilot.menu.rule": "\u9879\u76EE\u89C4\u5219",
  "copilot.error.unknownPlace": "\u672A\u77E5\u7684 Copilot \u4F4D\u7F6E\uFF1A{place}",
  "copilot.error.unknownForm": "\u672A\u77E5\u7684 Copilot \u5F62\u5F0F\uFF1A{form}",
  "copilot.error.fileExists": "\u6587\u4EF6\u4E0D\u5C5E\u4E8E Context Hub\uFF1A{file}",
  "copilot.error.invalidEnvelope": "MCP \u6587\u4EF6\u672A\u4F7F\u7528\u9884\u671F\u7684\u5C01\u88C5\u7ED3\u6784\u3002",
  "copilot.error.unsupportedEntry": "\u4E0D\u80FD\u7F16\u8F91 MCP \u670D\u52A1\uFF1A{name}"
};

// src/provider.ts
var places = [
  { id: "copilot-mcp-global", label: "Copilot", scope: "global", file: ".copilot/mcp-config.json", switchable: false, key: "mcpServers" },
  { id: "copilot-mcp", label: "Copilot", scope: "workspace", file: ".mcp.json", switchable: false, key: "mcpServers" },
  { id: "copilot-mcp-github", label: "Copilot CLI", scope: "workspace", file: ".github/mcp.json", switchable: false, key: "mcpServers" },
  { id: "copilot-mcp-vscode", label: "VS Code Local", scope: "workspace", file: ".vscode/mcp.json", switchable: false, key: "servers" }
];
var object2 = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
function createCopilotMcp(tools) {
  const placeOf = (id) => {
    const place = places.find((p) => p.id === id);
    if (!place) throw new tools.McpError("copilot.error.unknownPlace", { place: id });
    return place;
  };
  const document = (text, key) => {
    const doc = tools.readJsonObject(text) ?? {};
    if (doc[key] !== void 0 && !object2(doc[key])) throw new tools.McpError("copilot.error.invalidEnvelope");
    const entryKeys = ["command", "url", "type", "args", "env", "headers"];
    const bare = Object.entries(doc).some(([name, value]) => ![key, "inputs", "sandbox", "$schema"].includes(name) && object2(value) && (Object.keys(value).length === 0 || Object.keys(value).some((key2) => entryKeys.includes(key2))));
    if (bare) throw new tools.McpError("copilot.error.invalidEnvelope");
    return doc;
  };
  const contents = async (io, id) => {
    const place = placeOf(id);
    const text = await io.files.read(place);
    const doc = document(text, place.key);
    return { place, text: text ?? "", entries: object2(doc[place.key]) ? doc[place.key] : {} };
  };
  const known = (entry) => {
    if (!object2(entry) || !["stdio", "http", "sse"].includes(String(entry.type ?? "stdio"))) return false;
    if (entry.args !== void 0 && (!Array.isArray(entry.args) || !entry.args.every((v) => typeof v === "string"))) return false;
    for (const key of ["env", "headers"]) {
      const value = entry[key];
      if (value !== void 0 && (!object2(value) || !Object.values(value).every((v) => typeof v === "string"))) return false;
    }
    const allowed = ["type", "command", "args", "env", "url", "headers"];
    return Object.keys(entry).every((key) => allowed.includes(key));
  };
  return {
    id: COPILOT_ID,
    places,
    async read(io, id) {
      const { entries } = await contents(io, id);
      return Object.entries(entries).map(([name, entry]) => ({ name, declaration: known(entry) ? tools.readDeclaration(entry) : null, enabled: true }));
    },
    async install(io, id, name, declaration) {
      const { place, text, entries } = await contents(io, id);
      const previous = entries[name];
      if (previous !== void 0 && (!object2(previous) || previous.type === "local" || !["stdio", "http", "sse"].includes(String(previous.type ?? "stdio")))) throw new tools.McpError("copilot.error.unsupportedEntry", { name });
      const values = tools.writeDeclaration(declaration);
      const extras = object2(previous) ? { ...previous } : {};
      for (const key of ["type", "command", "args", "env", "url", "headers"]) delete extras[key];
      const next = { ...extras, ...values, type: declaration.transport };
      const prepared = tools.readJsonObject(text) === null || tools.readJsonObject(text)?.[place.key] !== void 0 ? text : tools.editJson(text, [place.key], {});
      await io.files.write(place, tools.editJson(prepared, [place.key, name], next));
    },
    async uninstall(io, id, name) {
      const { place, text, entries } = await contents(io, id);
      if (entries[name] !== void 0 && (!object2(entries[name]) || !["stdio", "http", "sse"].includes(String(entries[name].type ?? "stdio")))) throw new tools.McpError("copilot.error.unsupportedEntry", { name });
      await io.files.write(place, tools.editJson(text, [place.key, name], void 0));
    },
    async locate(io, id, name) {
      const { place, text } = await contents(io, id);
      return tools.jsonValueLines(text, [place.key, name]);
    }
  };
}

// src/prompts.ts
function createCopilotPrompts(tools, icon) {
  const forms = [
    { id: "instructions", labelKey: "copilot.menu.instructions" },
    { id: "rule", labelKey: "copilot.menu.rule" },
    { id: "agent", labelKey: "prompts.menu.agent" }
  ];
  const places2 = [
    { id: "copilot-prompts", agent: COPILOT_ID, labelKey: "copilot.tab", icon, scope: "workspace", order: 20, where: ".github", forms },
    { id: "copilot-prompts-global", agent: COPILOT_ID, labelKey: "copilot.tab", icon, scope: "global", order: 20, where: "~/.copilot", forms },
    { id: "copilot-prompts-vscode", agent: COPILOT_ID, labelKey: "copilot.vscode", icon, scope: "workspace", order: 21, where: ".github/prompts", forms: [{ id: "commands", labelKey: "prompts.menu.commands" }] }
  ];
  const placeOf = (id) => {
    const place = places2.find((p) => p.id === id);
    if (!place) throw new tools.PromptError("copilot.error.unknownPlace", { place: id });
    return place;
  };
  const target = (place, prompt, form, option) => {
    if (option !== void 0 || !place.forms.some((f) => f.id === form)) throw new tools.PromptError("copilot.error.unknownForm", { form });
    const root = place.scope === "global" ? ".copilot" : ".github";
    const slug = tools.slugOf(prompt.name);
    const path = form === "instructions" ? "copilot-instructions.md" : form === "rule" ? `instructions/${slug}.instructions.md` : form === "agent" ? `agents/${slug}.agent.md` : `prompts/${slug}.prompt.md`;
    return { scope: place.scope, file: `${root}/${path}` };
  };
  const marker = (slug) => `<!-- context-hub:${slug} -->`;
  const checkSection = (text, slug, file) => {
    const open = text?.indexOf(marker(slug)) ?? -1;
    if (open >= 0 && text.indexOf(`<!-- /context-hub:${slug} -->`, open) < 0) throw new tools.PromptError("copilot.error.fileExists", { file });
  };
  return {
    id: COPILOT_ID,
    places: places2,
    async held(io, id, prompt) {
      const place = placeOf(id), result = {}, slug = tools.slugOf(prompt.name);
      for (const form of place.forms) {
        const text = await io.files.read(target(place, prompt, form.id));
        if (text !== null && (form.id === "instructions" ? tools.withoutSection(text, slug) !== null : text.includes(marker(slug)))) result[form.id] = true;
      }
      return result;
    },
    async install(io, id, prompt, form, option) {
      const place = placeOf(id), ref = target(place, prompt, form, option), slug = tools.slugOf(prompt.name);
      const existing = await io.files.read(ref);
      if (form === "instructions") {
        checkSection(existing, slug, ref.file);
        await io.files.write(ref, tools.withSection(existing, { slug, title: prompt.name, body: prompt.prompt }));
        return;
      }
      if (existing !== null && !existing.includes(marker(slug))) throw new tools.PromptError("copilot.error.fileExists", { file: ref.file });
      const description = prompt.description.trim() || tools.describeBody(prompt.prompt) || prompt.name;
      const body = prompt.prompt.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").replace(/\s+$/, "");
      const yaml = form === "rule" ? `description: ${JSON.stringify(description)}
applyTo: "**"` : `name: ${JSON.stringify(prompt.name)}
description: ${JSON.stringify(description)}`;
      await io.files.write(ref, `---
${yaml}
---
${marker(slug)}

${body}
`);
    },
    async remove(io, id, prompt, form, option) {
      const place = placeOf(id), ref = target(place, prompt, form, option), slug = tools.slugOf(prompt.name);
      const existing = await io.files.read(ref);
      if (existing === null) return false;
      if (form === "instructions") {
        checkSection(existing, slug, ref.file);
        const next = tools.withoutSection(existing, slug);
        if (next === null) return false;
        if (next.trim()) await io.files.write(ref, next);
        else await io.files.remove(ref);
      } else {
        if (!existing.includes(marker(slug))) return false;
        await io.files.remove(ref);
      }
      return true;
    }
  };
}

// src/index.tsx
function apply(ctx) {
  ctx.skills.register({ id: COPILOT_ID, places: [
    { id: "copilot-skills", labelKey: "copilot.tab", icon: CopilotIcon, scope: "workspace", dir: ".github/skills", order: 20 },
    { id: "copilot-skills-global", labelKey: "copilot.tab", icon: CopilotIcon, scope: "global", dir: ".copilot/skills", order: 20 }
  ] });
  ctx.mcp.register(createCopilotMcp(ctx.mcp.tools));
  ctx.prompts.register(createCopilotPrompts(ctx.prompts.tools, CopilotIcon));
  ctx.plugins.register(createCopilotInstaller(ctx.mcp.tools));
  ctx.targets.register({ id: COPILOT_ID, displayName: "GitHub Copilot", icon: CopilotIcon, supports: ["skill", "mcp", "memory", "agent"], locations: [
    { label: "Skills", path: ".github/skills, ~/.copilot/skills" },
    { label: "Instructions and agents", path: ".github, ~/.copilot" },
    { label: "MCP", path: ".mcp.json, .github/mcp.json, ~/.copilot/mcp-config.json, .vscode/mcp.json (VS Code Local)" },
    { label: "Home", path: "Default ~/.copilot only for skills, MCP and prompts; custom COPILOT_HOME applies to plugins only" }
  ], format: "Markdown; JSONC MCP; Agent Plugins 1.1.0" });
  ctx.locales.register({ id: "en", label: "English", messages: copilotMessages });
  ctx.locales.register({ id: "zh-CN", label: "\u7B80\u4F53\u4E2D\u6587", messages: copilotZhMessages });
}
export {
  apply
};
