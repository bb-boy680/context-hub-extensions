// src/locations.ts
var CURSOR_ID = "hub.target.cursor";
var CURSOR_SKILL_DIR = ".cursor/skills";
var CURSOR_MCP_FILE = ".cursor/mcp.json";
var CURSOR_MANIFEST = ".cursor-plugin/plugin.json";
var SUPPORTS = ["skill", "mcp", "memory", "agent"];
var LOCATIONS = [
  { label: "Skills", path: "~/.cursor/skills/<name>/SKILL.md" },
  { label: "Shared skills", path: "~/.agents/skills/<name>/SKILL.md" },
  { label: "MCP", path: "~/.cursor/mcp.json" },
  { label: "Agents", path: "~/.cursor/agents/<name>.md" },
  { label: "Local plugins", path: "~/.cursor/plugins/local/<name>" },
  { label: "Project skills", path: ".cursor/skills/<name>/SKILL.md" },
  { label: "Project MCP", path: ".cursor/mcp.json" },
  { label: "Commands", path: ".cursor/commands/<name>.md" },
  { label: "Rules", path: ".cursor/rules/<name>.mdc" },
  { label: "Project agents", path: ".cursor/agents/<name>.md" },
  { label: "Instructions", path: "AGENTS.md" }
];

// src/messages.ts
var cursorMessages = {
  "cursor.tab": "Cursor",
  "cursor.menu.rule": "Rule",
  "cursor.menu.rule.remove": "Remove rule",
  "cursor.error.unknownPlace": "Unknown Cursor place: {place}",
  "cursor.error.unknownForm": "Unknown Cursor form: {form}",
  "cursor.error.refused": "Cursor could not update {file}",
  "cursor.error.exists": "A file already exists at {file} and was not created by Context Hub.",
  "cursor.error.invalidMcp": "Cursor MCP configuration must contain an object at mcpServers.",
  "cursor.error.mcpConflict": "This MCP entry contains fields incompatible with the requested transport."
};
var cursorZhMessages = {
  "cursor.tab": "Cursor",
  "cursor.menu.rule": "\u89C4\u5219",
  "cursor.menu.rule.remove": "\u79FB\u9664\u89C4\u5219",
  "cursor.error.unknownPlace": "\u672A\u77E5\u7684 Cursor \u4F4D\u7F6E\uFF1A{place}",
  "cursor.error.unknownForm": "\u672A\u77E5\u7684 Cursor \u5F62\u5F0F\uFF1A{form}",
  "cursor.error.refused": "Cursor \u65E0\u6CD5\u66F4\u65B0 {file}",
  "cursor.error.exists": "{file} \u5DF2\u5B58\u5728\u4E14\u4E0D\u662F\u7531 Context Hub \u521B\u5EFA\u3002",
  "cursor.error.invalidMcp": "Cursor MCP \u914D\u7F6E\u4E2D\u7684 mcpServers \u5FC5\u987B\u662F\u5BF9\u8C61\u3002",
  "cursor.error.mcpConflict": "\u6B64 MCP \u6761\u76EE\u5305\u542B\u4E0E\u76EE\u6807\u4F20\u8F93\u65B9\u5F0F\u4E0D\u517C\u5BB9\u7684\u5B57\u6BB5\u3002"
};

// src/provider.ts
function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function createCursorMcp(tools) {
  const fileOf = (id) => {
    if (id === "cursor") return { scope: "workspace", file: CURSOR_MCP_FILE };
    if (id === "cursor-global") return { scope: "global", file: CURSOR_MCP_FILE };
    throw new tools.McpError("cursor.error.unknownPlace", { place: id });
  };
  const readDocument = (text) => {
    const document = tools.readJsonObject(text);
    const servers = document?.mcpServers;
    if (servers !== void 0 && !isObject(servers)) throw new tools.McpError("cursor.error.invalidMcp");
    return servers ?? {};
  };
  const update = (existing, declaration) => {
    if (existing !== void 0 && !isObject(existing)) throw new tools.McpError("cursor.error.mcpConflict");
    if (existing !== void 0 && !tools.readDeclaration(existing)) throw new tools.McpError("cursor.error.mcpConflict");
    const entry = { ...existing ?? {} };
    const priorUsesStdio = typeof entry.command === "string" || entry.type === "stdio";
    const priorUsesRemote = typeof entry.url === "string" || entry.type === "http" || entry.type === "sse";
    if (declaration.transport === "stdio" && priorUsesRemote && Object.hasOwn(entry, "auth") || declaration.transport !== "stdio" && priorUsesStdio && ["cwd", "envFile"].some((key) => Object.hasOwn(entry, key))) {
      throw new tools.McpError("cursor.error.mcpConflict");
    }
    for (const key of ["type", "transport", "command", "args", "env", "url", "headers"]) delete entry[key];
    return { ...entry, ...tools.writeDeclaration(declaration), type: declaration.transport };
  };
  return {
    id: CURSOR_ID,
    places: [
      { id: "cursor", label: "Cursor", switchable: false, ...fileOf("cursor") },
      { id: "cursor-global", label: "Cursor", switchable: false, ...fileOf("cursor-global") }
    ],
    async read(io, place) {
      const servers = readDocument(await io.files.read(fileOf(place)));
      return Object.entries(servers).flatMap(([name, value]) => {
        const declaration = tools.readDeclaration(value);
        return declaration ? [{ name, declaration, enabled: true }] : [];
      });
    },
    async install(io, place, name, declaration) {
      const file = fileOf(place);
      const text = await io.files.read(file);
      const servers = readDocument(text);
      const value = update(Object.hasOwn(servers, name) ? servers[name] : void 0, declaration);
      const nextValues = tools.writeDeclaration(declaration);
      let next = text;
      if (text !== null && text.trim() !== "" && tools.valueAt(tools.readJsonObject(text), ["mcpServers"]) === void 0) {
        next = tools.editJson(text, ["mcpServers"], {});
      }
      if (Object.hasOwn(servers, name) && isObject(servers[name])) {
        const prior = servers[name];
        for (const key of ["type", "transport", "command", "args", "env", "url", "headers"]) {
          const nextValue = Object.hasOwn(nextValues, key) ? nextValues[key] : key === "type" ? declaration.transport : void 0;
          if (Object.hasOwn(prior, key) || nextValue !== void 0) next = tools.editJson(next, ["mcpServers", name, key], nextValue);
        }
      } else {
        next = tools.editJson(next, ["mcpServers", name], value);
      }
      await io.files.write(file, next ?? "");
    },
    async uninstall(io, place, name) {
      const file = fileOf(place);
      const text = await io.files.read(file);
      const servers = readDocument(text);
      if (!Object.hasOwn(servers, name)) return;
      await io.files.write(file, tools.editJson(text, ["mcpServers", name], void 0));
    },
    async locate(io, place, name) {
      const text = await io.files.read(fileOf(place));
      readDocument(text);
      return text === null ? null : tools.jsonValueLines(text, ["mcpServers", name]);
    }
  };
}

// src/prompts.ts
function createCursorPrompts(tools, icon) {
  const agent = { id: "agent", labelKey: "prompts.menu.agent", removeLabelKey: "prompts.menu.agent.remove" };
  const places = [
    { id: "cursor", agent: CURSOR_ID, labelKey: "cursor.tab", icon, scope: "workspace", order: 20, where: ".cursor", forms: [
      { id: "commands", labelKey: "prompts.menu.commands", removeLabelKey: "prompts.menu.commands.remove" },
      { id: "rule", labelKey: "cursor.menu.rule", removeLabelKey: "cursor.menu.rule.remove" },
      agent
    ] },
    { id: "cursor-global", agent: CURSOR_ID, labelKey: "cursor.tab", icon, scope: "global", order: 20, where: "~/.cursor", forms: [agent] }
  ];
  const placeOf = (id) => {
    const place = places.find((item) => item.id === id);
    if (!place) throw new tools.PromptError("cursor.error.unknownPlace", { place: id });
    return place;
  };
  const target = (place, prompt, form, option) => {
    if (option !== void 0 || !place.forms.some((item) => item.id === form)) {
      throw new tools.PromptError("cursor.error.unknownForm", { form: option === void 0 ? form : `${form}:${option}` });
    }
    const slug = tools.slugOf(prompt.name);
    if (!slug || slug.startsWith(".") || /[\\/<>:"|?*]/.test(slug) || [...slug].some((char) => char.codePointAt(0) < 32) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(slug)) {
      throw new tools.PromptError("cursor.error.unknownForm", { form });
    }
    const suffix = form === "rule" ? `rules/${slug}.mdc` : form === "commands" ? `commands/${slug}.md` : `agents/${slug}.md`;
    return { scope: place.scope, file: `.cursor/${suffix}` };
  };
  const marker = (prompt) => `<!-- context-hub:${tools.slugOf(prompt.name)} -->`;
  const owns = (text, prompt) => {
    if (text === null) return false;
    const end = text.indexOf("\n---\n", 4);
    return text.startsWith("---\n") && end >= 0 && text.slice(end + 5).trimStart().startsWith(`${marker(prompt)}
`);
  };
  const read = async (io, ref) => {
    try {
      return await io.files.read(ref);
    } catch (error) {
      throw new tools.PromptError("cursor.error.refused", { file: ref.file }, String(error));
    }
  };
  return {
    id: CURSOR_ID,
    places,
    async held(io, id, prompt) {
      const place = placeOf(id);
      const result = {};
      for (const form of place.forms) {
        if (owns(await read(io, target(place, prompt, form.id)), prompt)) result[form.id] = true;
      }
      return result;
    },
    async install(io, id, prompt, form, option) {
      const ref = target(placeOf(id), prompt, form, option);
      const existing = await read(io, ref);
      if (existing !== null && !owns(existing, prompt)) throw new tools.PromptError("cursor.error.exists", { file: ref.file });
      const description = prompt.description.trim() || tools.describeBody(prompt.prompt) || prompt.name;
      const body = prompt.prompt.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").replace(/\s+$/, "");
      const raw = form === "rule" ? `---
description: ${JSON.stringify(description)}
alwaysApply: false
---

${body}
` : tools.commandFile({ name: tools.slugOf(prompt.name), description, body, frontmatter: true });
      const end = raw.indexOf("\n---\n", 4);
      if (end < 0) throw new tools.PromptError("cursor.error.refused", { file: ref.file }, "Missing frontmatter");
      const text = `${raw.slice(0, end + 5)}
${marker(prompt)}
${raw.slice(end + 5).trimStart()}`;
      try {
        await io.files.write(ref, text);
      } catch (error) {
        throw new tools.PromptError("cursor.error.refused", { file: ref.file }, String(error));
      }
    },
    async remove(io, id, prompt, form, option) {
      const ref = target(placeOf(id), prompt, form, option);
      if (!owns(await read(io, ref), prompt)) return false;
      try {
        await io.files.remove(ref);
      } catch (error) {
        throw new tools.PromptError("cursor.error.refused", { file: ref.file }, String(error));
      }
      return true;
    }
  };
}

// src/plugin-state.ts
function object(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function safeName(name) {
  if (!name || name.startsWith(".") || name !== name.trim() || /[\\/<>:"|?*]/.test(name) || [...name].some((char) => char.codePointAt(0) < 32) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(name)) {
    throw new Error("Invalid Cursor plugin name");
  }
  return name;
}
function nativePath(value) {
  const path = value.startsWith("./") ? value.slice(2) : value;
  if (!path || path.startsWith("/") || /[\\:]/.test(path) || path.split("/").some((part, index, parts) => part === "" && index !== parts.length - 1 || part === "." || part === ".." || [...part].some((char) => char.codePointAt(0) < 32))) {
    throw new Error(`Invalid Cursor plugin component path: ${value}`);
  }
}
function rejectUnsupportedVariables(value) {
  if (typeof value === "string" && /\$\{(?:PLUGIN_ROOT|PLUGIN_DATA|CLAUDE_PLUGIN_ROOT|CLAUDE_PLUGIN_DATA)\}/.test(value)) {
    throw new Error("Unsupported plugin variable");
  }
  if (Array.isArray(value)) value.forEach(rejectUnsupportedVariables);
  else if (object(value)) Object.values(value).forEach(rejectUnsupportedVariables);
}
function nativeManifest(text, name) {
  if (text === null) throw new Error("Cursor native plugin manifest is required");
  const manifest = JSON.parse(text);
  if (!object(manifest) || manifest.name !== safeName(name)) throw new Error("Cursor plugin manifest name must match the pack");
  if (manifest.version !== void 0 && typeof manifest.version !== "string") throw new Error("Invalid Cursor plugin version");
  for (const key of ["skills", "rules", "agents", "commands"]) {
    const field = manifest[key];
    if (field === void 0) continue;
    const paths = Array.isArray(field) ? field : [field];
    if (paths.length === 0 || paths.some((item) => typeof item !== "string")) throw new Error(`Invalid ${key} paths`);
    for (const item of paths) nativePath(item);
  }
  const hooks = manifest.hooks;
  if (typeof hooks === "string") nativePath(hooks);
  else if (hooks !== void 0 && !object(hooks)) throw new Error("Invalid hooks configuration");
  const mcp = manifest.mcpServers;
  if (mcp !== void 0) {
    for (const entry of Array.isArray(mcp) ? mcp : [mcp]) {
      if (typeof entry === "string") nativePath(entry);
      else if (!object(entry)) throw new Error("Invalid MCP configuration");
    }
  }
  for (const key of ["icon", "logo"]) {
    const value = manifest[key];
    if (value !== void 0) {
      if (typeof value !== "string") throw new Error(`Invalid ${key} path`);
      if (key !== "logo" || !/^https:\/\//i.test(value)) nativePath(value);
    }
  }
  if (manifest.variables !== void 0 && !object(manifest.variables)) throw new Error("Invalid variables schema");
  rejectUnsupportedVariables(manifest);
  return manifest;
}

// src/installer.ts
var SCOPE = {
  home: ".cursor",
  state: "plugins",
  directories: ["local/:name"],
  config: { read: [], write: [] },
  stateFiles: { read: ["local", "local/*/.cursor-plugin/plugin.json"], write: ["local/*", "context-hub-ownership.json"] },
  workspace: { read: [], write: [] },
  library: { read: ["*", "*/**"], write: [] },
  external: []
};
var OWNERS = { root: "plugins", path: "context-hub-ownership.json" };
var localRef = (name) => ({ root: "plugins", path: `local/${safeName(name)}` });
function diskOf(tools) {
  if (!tools.disk || typeof tools.disk.snapshotDirectory !== "function") throw new Error("This Context Hub version lacks the required plugin file transaction API");
  return tools.disk;
}
function ownersOf(text) {
  if (text === null) return /* @__PURE__ */ Object.create(null);
  const value = JSON.parse(text);
  if (typeof value !== "object" || value === null || Array.isArray(value) || Object.entries(value).some(([name, hash]) => {
    try {
      safeName(name);
    } catch {
      return true;
    }
    return typeof hash !== "string" || !/^[a-f0-9]{64}$/.test(hash);
  })) throw new Error("Invalid Cursor plugin ownership record");
  return Object.assign(/* @__PURE__ */ Object.create(null), value);
}
function idOf(name) {
  return `local:${safeName(name)}`;
}
function nameOf(id) {
  if (!id.startsWith("local:")) throw new Error("Only local Cursor plugins can be removed");
  return safeName(id.slice(6));
}
async function validatePackFiles(disk, roots, name, relative = "") {
  const prefix = relative ? `${name}/${relative}` : name;
  for (const entry of await disk.list(roots, { root: "library", path: prefix })) {
    const child = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.directory) await validatePackFiles(disk, roots, name, child);
    else if (!/\.(?:png|jpe?g|gif|webp|ico|pdf|zip|gz|woff2?|ttf|otf|mp[34]|webm|wasm|exe|dll|so|dylib)$/i.test(entry.name)) {
      rejectUnsupportedVariables(await disk.read(roots, { root: "library", path: `${name}/${child}` }));
    }
  }
}
function createCursorInstaller() {
  return {
    id: CURSOR_ID,
    label: "Cursor",
    places: [{ id: "cursor-user", label: "Cursor", scope: "global", scopeWord: "user", switchable: false }],
    async available(tools) {
      await diskOf(tools).roots(SCOPE);
      return true;
    },
    async held(tools) {
      const disk = diskOf(tools);
      const roots = await disk.roots(SCOPE);
      const owners = ownersOf(await disk.read(roots, OWNERS));
      const result = [];
      for (const entry of await disk.list(roots, { root: "plugins", path: "local" })) {
        if (!entry.directory) continue;
        const name = safeName(entry.name);
        const ref = localRef(name);
        const source = await disk.path(roots, ref);
        let snapshot = null;
        let raw = null;
        try {
          snapshot = await disk.snapshotDirectory(roots, ref);
          raw = await disk.read(roots, { root: "plugins", path: `local/${name}/${CURSOR_MANIFEST}` });
        } catch {
        }
        const managed = snapshot !== null && Object.hasOwn(owners, name) && snapshot === owners[name];
        let version = "", description = "", valid = false;
        try {
          const doc = nativeManifest(raw, name);
          valid = true;
          version = typeof doc.version === "string" ? doc.version : "";
          description = typeof doc.description === "string" ? doc.description : "";
        } catch {
        }
        result.push({ name, id: idOf(name), version, scope: "user", marketplace: null, readOnly: !managed || !valid, source: { kind: "local", path: source }, pack: { name, version, description } });
      }
      return result;
    },
    async install(name, scope, tools) {
      if (scope !== "user") throw new Error("Cursor only supports user-local plugin delivery");
      safeName(name);
      const disk = diskOf(tools);
      return disk.run(SCOPE, async (roots) => {
        const source = { root: "library", path: name };
        const sourceSnapshot = await disk.snapshotDirectory(roots, source);
        if (sourceSnapshot === null) throw new Error("Plugin pack is missing");
        const raw = await disk.read(roots, { root: "library", path: `${name}/${CURSOR_MANIFEST}` });
        const manifest = nativeManifest(raw, name);
        await validatePackFiles(disk, roots, name);
        const referenced = [manifest.hooks, ...Array.isArray(manifest.mcpServers) ? manifest.mcpServers : [manifest.mcpServers]];
        for (const item of referenced) {
          if (typeof item !== "string") continue;
          nativePath(item);
          const relative = item.startsWith("./") ? item.slice(2) : item;
          const text = await disk.read(roots, { root: "library", path: `${name}/${relative}` });
          if (text === null) throw new Error("Cursor plugin configuration is missing");
          rejectUnsupportedVariables(text);
        }
        if (await disk.snapshotDirectory(roots, source) !== sourceSnapshot) throw new Error("Plugin pack changed during validation; retry");
        const before = await disk.read(roots, OWNERS);
        const owners = ownersOf(before);
        const destination = localRef(name);
        const existing = await disk.snapshotDirectory(roots, destination);
        if (existing !== null && (!Object.hasOwn(owners, name) || owners[name] !== existing)) throw new Error("Cursor local plugin conflicts with a non-managed or modified directory");
        owners[name] = sourceSnapshot;
        const after = `${JSON.stringify(owners, null, 2)}
`;
        await disk.commit(roots, [{ ref: OWNERS, before, after }], { name, destination: destination.path, replace: existing !== null, before: existing, sourceSnapshot, manifests: [CURSOR_MANIFEST] });
        return { message: `${name} copied for Cursor; reload Cursor to discover it`, location: await disk.path(roots, destination) };
      });
    },
    async remove(id, scope, tools) {
      if (scope !== "user") throw new Error("Cursor only supports user-local plugin delivery");
      const name = nameOf(id);
      const disk = diskOf(tools);
      return disk.run(SCOPE, async (roots) => {
        const before = await disk.read(roots, OWNERS);
        const owners = ownersOf(before);
        const ref = localRef(name);
        const snapshot = await disk.snapshotDirectory(roots, ref);
        if (!Object.hasOwn(owners, name) || snapshot === null || owners[name] !== snapshot) throw new Error("Cursor local plugin is not managed or was modified");
        delete owners[name];
        await disk.commit(roots, [{ ref: OWNERS, before, after: `${JSON.stringify(owners, null, 2)}
` }], void 0, { ref, before: snapshot });
        return { message: `${name} removed from Cursor; reload Cursor to refresh` };
      });
    }
  };
}

// src/index.tsx
import { jsx } from "react/jsx-runtime";
var CursorIcon = ({ className, "aria-hidden": ariaHidden }) => /* @__PURE__ */ jsx("img", { src: "/hub/extensions/cursor/assets/icon.svg", alt: "", className, "aria-hidden": ariaHidden });
function apply(ctx) {
  if (typeof ctx.plugins.registerManifests !== "function") throw new Error("This Context Hub version lacks native plugin manifest registration");
  const places = [
    { id: "cursor", labelKey: "cursor.tab", icon: CursorIcon, scope: "workspace", dir: CURSOR_SKILL_DIR, order: 20 },
    { id: "cursor-global", labelKey: "cursor.tab", icon: CursorIcon, scope: "global", dir: CURSOR_SKILL_DIR, order: 20 }
  ];
  ctx.skills.register({ id: CURSOR_ID, places });
  ctx.prompts.register(createCursorPrompts(ctx.prompts.tools, CursorIcon));
  ctx.mcp.register(createCursorMcp(ctx.mcp.tools));
  ctx.plugins.registerManifests([CURSOR_MANIFEST]);
  ctx.plugins.register(createCursorInstaller());
  ctx.targets.register({ id: CURSOR_ID, displayName: "Cursor", icon: CursorIcon, supports: SUPPORTS, locations: LOCATIONS, format: "Markdown skills, commands, rules and agents; JSON MCP and plugins" });
  ctx.locales.register({ id: "en", label: "English", messages: cursorMessages });
  ctx.locales.register({ id: "zh-CN", label: "\u7B80\u4F53\u4E2D\u6587", messages: cursorZhMessages });
}
export {
  apply
};
