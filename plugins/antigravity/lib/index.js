// src/locations.ts
var ANTIGRAVITY_ID = "hub.target.antigravity";
var GLOBAL_SKILLS = ".gemini/config/skills";
var GLOBAL_MCP = ".gemini/config/mcp_config.json";
var WORKSPACE_MCP = ".agents/mcp_config.json";
var GLOBAL_LOCATIONS = [
  { label: "Skills", path: `~/${GLOBAL_SKILLS}/<name>/SKILL.md` },
  { label: "Rules", path: "~/.gemini/config/rules/<name>.md" },
  { label: "Agents", path: "~/.gemini/config/agents/<name>.md" },
  { label: "Instructions", path: "~/.gemini/AGENTS.md" },
  { label: "MCP", path: `~/${GLOBAL_MCP}` },
  { label: "Plugins", path: "~/.gemini/config/plugins.json" }
];
var PROJECT_LOCATIONS = [
  { label: "Skills", path: ".agents/skills/<name>/SKILL.md" },
  { label: "Rules", path: ".agents/rules/<name>.md" },
  { label: "Agents", path: ".agents/agents/<name>.md" },
  { label: "Instructions", path: "AGENTS.md" },
  { label: "MCP", path: WORKSPACE_MCP }
];
var SUPPORTS = ["skill", "mcp", "memory", "agent"];

// src/messages.ts
var messages = {
  "antigravity.tab": "Antigravity",
  "antigravity.menu.skill": "Skill",
  "antigravity.menu.skill.remove": "Remove skill",
  "antigravity.menu.instructions": "Global instructions",
  "antigravity.menu.instructions.remove": "Remove from global instructions",
  "antigravity.error.unknownPlace": "Unknown Antigravity location: {place}",
  "antigravity.error.unknownForm": "Unknown Antigravity form: {form}",
  "antigravity.error.refused": "Antigravity file operation failed",
  "antigravity.error.unsupported": "Unsupported Antigravity MCP server: {name}",
  "antigravity.error.conflict": "The file is not owned by Context Hub: {file}",
  "antigravity.error.tooLarge": "Antigravity file exceeds 24,000 bytes: {file}"
};
var zhMessages = {
  "antigravity.tab": "Antigravity",
  "antigravity.menu.skill": "\u6280\u80FD",
  "antigravity.menu.skill.remove": "\u79FB\u9664\u6280\u80FD",
  "antigravity.menu.instructions": "\u5168\u5C40\u6307\u4EE4",
  "antigravity.menu.instructions.remove": "\u4ECE\u5168\u5C40\u6307\u4EE4\u4E2D\u79FB\u9664",
  "antigravity.error.unknownPlace": "\u672A\u77E5\u7684 Antigravity \u4F4D\u7F6E\uFF1A{place}",
  "antigravity.error.unknownForm": "\u672A\u77E5\u7684 Antigravity \u5F62\u5F0F\uFF1A{form}",
  "antigravity.error.refused": "Antigravity \u6587\u4EF6\u64CD\u4F5C\u5931\u8D25",
  "antigravity.error.unsupported": "\u4E0D\u652F\u6301\u7684 Antigravity MCP \u670D\u52A1\uFF1A{name}",
  "antigravity.error.conflict": "\u6587\u4EF6\u4E0D\u5C5E\u4E8E Context Hub\uFF1A{file}",
  "antigravity.error.tooLarge": "Antigravity \u6587\u4EF6\u8D85\u8FC7 24,000 \u5B57\u8282\uFF1A{file}"
};

// src/provider.ts
var files = {
  "antigravity-global": { scope: "global", file: GLOBAL_MCP },
  antigravity: { scope: "workspace", file: WORKSPACE_MCP }
};
function object(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function createAntigravityMcp(tools) {
  const fileOf = (place) => {
    const file = Object.hasOwn(files, place) ? files[place] : void 0;
    if (!file) throw new tools.McpError("antigravity.error.unknownPlace", { place });
    return file;
  };
  const document = (text) => {
    if (text === null) return {};
    if (text.trim() === "") throw new tools.McpError("antigravity.error.refused", void 0, "empty MCP configuration");
    try {
      const value = tools.parseJsonc(text);
      if (!object(value) || value.mcpServers !== void 0 && !object(value.mcpServers)) throw new Error("invalid mcpServers container");
      return value;
    } catch (error) {
      throw new tools.McpError("antigravity.error.refused", void 0, String(error));
    }
  };
  const entry = (value, name) => {
    if (!object(value) || "url" in value || "httpUrl" in value || "command" in value && "serverUrl" in value || "serverUrl" in value && (typeof value.serverUrl !== "string" || value.serverUrl === "")) {
      throw new tools.McpError("antigravity.error.unsupported", { name });
    }
    const strings = (input) => object(input) && Object.values(input).every((item) => typeof item === "string");
    if ("args" in value && (!Array.isArray(value.args) || value.args.some((item) => typeof item !== "string")) || "env" in value && !strings(value.env) || "headers" in value && !strings(value.headers)) throw new tools.McpError("antigravity.error.unsupported", { name });
    const translated = typeof value.serverUrl === "string" ? { ...value, url: value.serverUrl } : value;
    const declaration = tools.readDeclaration(translated);
    if (!declaration) throw new tools.McpError("antigravity.error.unsupported", { name });
    return { value, declaration };
  };
  const load = async (io, place) => {
    const file = fileOf(place);
    const text = await io.files.read(file);
    const doc = document(text);
    return { file, text, servers: doc.mcpServers ?? {} };
  };
  return {
    id: ANTIGRAVITY_ID,
    places: Object.entries(files).map(([id, file]) => ({ id, label: "Antigravity", switchable: true, ...file })),
    async read(io, place) {
      const { servers } = await load(io, place);
      return Object.entries(servers).map(([name, value]) => {
        const found = entry(value, name);
        return { name, declaration: found.declaration, enabled: found.value.disabled !== true };
      });
    },
    async install(io, place, name, declaration) {
      const { file, text, servers } = await load(io, place);
      const existing = servers[name] === void 0 ? {} : entry(servers[name], name).value;
      if (declaration.transport === "sse") throw new tools.McpError("antigravity.error.unsupported", { name });
      const next = { ...existing };
      for (const key of ["command", "args", "env", "serverUrl", "headers"]) delete next[key];
      const written = tools.writeDeclaration(declaration);
      if (declaration.transport === "http") {
        next.serverUrl = written.url;
        if (written.headers !== void 0) next.headers = written.headers;
      } else Object.assign(next, written);
      entry(next, name);
      const doc = document(text);
      const path = doc.mcpServers === void 0 ? ["mcpServers"] : ["mcpServers", name];
      await io.files.write(file, tools.editJson(text, path, doc.mcpServers === void 0 ? { [name]: next } : next));
    },
    async uninstall(io, place, name) {
      const { file, text, servers } = await load(io, place);
      if (servers[name] === void 0) return;
      entry(servers[name], name);
      await io.files.write(file, tools.editJson(text, ["mcpServers", name], void 0));
    },
    async setEnabled(io, place, scope, name, enabled) {
      const { file, text, servers } = await load(io, place);
      if (scope !== file.scope || servers[name] === void 0) throw new tools.McpError("antigravity.error.unsupported", { name });
      entry(servers[name], name);
      await io.files.write(file, tools.editJson(text, ["mcpServers", name, "disabled"], !enabled));
    },
    async locate(io, place, name) {
      const { text } = await load(io, place);
      return text === null ? null : tools.jsonValueLines(text, ["mcpServers", name]);
    }
  };
}

// src/prompts.ts
var rule = { id: "rule", labelKey: "prompts.menu.rule", removeLabelKey: "prompts.menu.rule.remove" };
var globalForms = [
  { id: "skill", labelKey: "antigravity.menu.skill", removeLabelKey: "antigravity.menu.skill.remove" },
  rule,
  { id: "agent", labelKey: "prompts.menu.agent", removeLabelKey: "prompts.menu.agent.remove" },
  { id: "instructions", labelKey: "antigravity.menu.instructions", options: [{ id: "memory", labelKey: "antigravity.menu.instructions", removeLabelKey: "antigravity.menu.instructions.remove" }] }
];
function createAntigravityPrompts(icon2, tools) {
  const places = [
    { id: "antigravity-global", agent: ANTIGRAVITY_ID, labelKey: "antigravity.tab", icon: icon2, scope: "global", where: "~/.gemini", forms: globalForms },
    { id: "antigravity", agent: ANTIGRAVITY_ID, labelKey: "antigravity.tab", icon: icon2, scope: "workspace", where: ".agents", forms: [rule] }
  ];
  const placeOf = (id) => {
    const place = places.find((one) => one.id === id);
    if (!place) throw new tools.PromptError("antigravity.error.unknownPlace", { place: id });
    return place;
  };
  const target = (place, prompt, form, option) => {
    const offered = place.forms.find((one) => one.id === form);
    if (!offered || (offered.options ? !offered.options.some((one) => one.id === option) : option !== void 0)) throw new tools.PromptError("antigravity.error.unknownForm", { form });
    const slug = tools.slugOf(prompt.name);
    if (form === "instructions") return { scope: "global", file: ".gemini/AGENTS.md" };
    const base = place.scope === "global" ? ".gemini/config" : ".agents";
    if (form === "skill") return { scope: place.scope, file: `${base}/skills/${slug}/SKILL.md` };
    if (form === "agent") return { scope: place.scope, file: `${base}/agents/${slug}.md` };
    return { scope: place.scope, file: `${base}/rules/context-hub-${slug}.md` };
  };
  const owned = (text, slug) => {
    const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n(.*?)(?:\r?\n|$)/.exec(text);
    return match?.[1] === `<!-- context-hub:${slug} -->`;
  };
  const sectionSafe = (text, slug, ref) => {
    if (text === null) return;
    const open = `<!-- context-hub:${slug} -->`, close = `<!-- /context-hub:${slug} -->`;
    const first = text.indexOf(open), end = text.indexOf(close);
    if (first < 0 && end >= 0 || first >= 0 && (end < first || text.indexOf(open, first + open.length) >= 0 || text.indexOf(close, end + close.length) >= 0)) throw new tools.PromptError("antigravity.error.conflict", { file: ref.file });
  };
  const checkSize = (text, ref) => {
    if (new TextEncoder().encode(text).length > 24e3) throw new tools.PromptError("antigravity.error.tooLarge", { file: ref.file });
  };
  const generated = (prompt, form) => {
    const slug = tools.slugOf(prompt.name);
    const description = prompt.description.trim() || tools.describeBody(prompt.prompt) || prompt.name;
    const fields = form === "rule" ? `trigger: model_decision
description: ${JSON.stringify(description)}` : `name: ${JSON.stringify(prompt.name)}
description: ${JSON.stringify(description)}`;
    const body = tools.commandFile({ name: prompt.name, description, body: prompt.prompt, frontmatter: false });
    return `---
${fields}
---
<!-- context-hub:${slug} -->
${body}`;
  };
  return {
    id: ANTIGRAVITY_ID,
    places,
    async held(io, id, prompt) {
      const place = placeOf(id);
      const slug = tools.slugOf(prompt.name);
      const result = {};
      for (const form of place.forms) {
        const option = form.id === "instructions" ? "memory" : void 0;
        const text = await io.files.read(target(place, prompt, form.id, option));
        if (text !== null && (form.id === "instructions" ? tools.withoutSection(text, slug) !== null : owned(text, slug))) result[option ? `${form.id}:${option}` : form.id] = true;
      }
      return result;
    },
    async install(io, id, prompt, form, option) {
      const ref = target(placeOf(id), prompt, form, option);
      const slug = tools.slugOf(prompt.name);
      const existing = await io.files.read(ref);
      if (form === "instructions") {
        sectionSafe(existing, slug, ref);
        const next2 = tools.withSection(existing, { slug, title: prompt.name, body: prompt.prompt });
        checkSize(next2, ref);
        await io.files.write(ref, next2);
        return;
      }
      if (existing !== null && !owned(existing, slug)) throw new tools.PromptError("antigravity.error.conflict", { file: ref.file });
      const next = generated(prompt, form);
      if (form === "rule") checkSize(next, ref);
      await io.files.write(ref, next);
    },
    async remove(io, id, prompt, form, option) {
      const ref = target(placeOf(id), prompt, form, option);
      const slug = tools.slugOf(prompt.name);
      const existing = await io.files.read(ref);
      if (existing === null) return false;
      if (form === "instructions") {
        sectionSafe(existing, slug, ref);
        const next = tools.withoutSection(existing, slug);
        if (next === null) return false;
        if (next.trim() === "") await io.files.remove(ref);
        else await io.files.write(ref, next);
        return true;
      }
      if (!owned(existing, slug)) throw new tools.PromptError("antigravity.error.conflict", { file: ref.file });
      await io.files.remove(ref);
      return true;
    }
  };
}

// src/installer.ts
var MARKET = "context-hub";
var CONFIG = { root: "config", path: "config/plugins.json" };
var MANIFESTS = ["plugin.json", ".antigravity-plugin/plugin.json"];
var SCOPE = {
  home: ".gemini",
  state: "context-hub",
  config: { write: ["config/plugins.json"], read: ["config/plugins", "config/plugins/*", "config/plugins/*/plugin.json", "config/plugins/*/.antigravity-plugin/plugin.json", "antigravity-cli/plugins", "antigravity-cli/plugins/*", "antigravity-cli/plugins/*/plugin.json", "antigravity-cli/plugins/*/.antigravity-plugin/plugin.json"] },
  stateFiles: { write: ["cache/context-hub/*", "cache/context-hub/*/*"], read: ["cache", "cache/context-hub", "cache/context-hub/*"] },
  workspace: { write: [], read: [".agents/plugins.json", ".agents/plugins", ".agents/plugins/*", ".agents/plugins/*/plugin.json", ".agents/plugins/*/.antigravity-plugin/plugin.json"] },
  library: { write: [], read: ["*", "*/plugin.json", "*/.antigravity-plugin/plugin.json"] },
  external: ["plugin.json", ".antigravity-plugin/plugin.json"]
};
function object2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function safe(value) {
  return /^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(value) && !/[. ]$/.test(value) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value);
}
function nameOf(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || !safe(value)) throw new Error(`invalid plugin name: ${value}`);
  return value;
}
function versionOf(value) {
  const version = value === void 0 || value === "" ? "local" : value;
  if (typeof version !== "string" || !safe(version)) throw new Error("invalid plugin version");
  return version;
}
function diskOf(tools) {
  if (!tools.disk) throw new Error("plugin file access is unavailable");
  return tools.disk;
}
function same(a, b, platform) {
  const norm = (p) => {
    const s = p.replace(/^\\\\\?\\/, "").replace(/\\/g, "/").replace(/\/+$/, "");
    return platform === "win32" ? s.toLowerCase() : s;
  };
  return norm(a) === norm(b);
}
function insidePath(parent, target, platform) {
  const normal = (value) => {
    const path2 = value.replace(/^\\\\\?\\/, "").replace(/\\/g, "/").replace(/\/+$/, "");
    return platform === "win32" ? path2.toLowerCase() : path2;
  };
  const base = `${normal(parent)}/`, path = normal(target);
  return path.startsWith(base) ? path.slice(base.length) : null;
}
function resolve(base, input, platform) {
  const path = input.replace(/\\/g, "/");
  const root = base.replace(/\\/g, "/");
  const absolute = platform === "win32" ? /^[A-Za-z]:\//.test(path) || path.startsWith("//") : path.startsWith("/");
  const parts = (absolute ? path : `${root}/${path}`).split("/");
  const out = [];
  for (const part of parts) {
    if (part === "." || part === "") continue;
    if (part === "..") {
      if (out.length <= (platform === "win32" ? 1 : 0)) throw new Error("invalid discovery path");
      out.pop();
    } else out.push(part);
  }
  const prefix = platform === "win32" ? absolute && path.startsWith("//") ? "//" : "" : "/";
  return platform === "win32" ? `${prefix}${out.join("/").replace(/\//g, "\\")}` : `${prefix}${out.join("/")}`;
}
function manifest(raw) {
  if (raw === null) return null;
  const value = JSON.parse(raw);
  if (!object2(value) || typeof value.name !== "string") throw new Error("invalid Antigravity plugin manifest");
  nameOf(value.name);
  const allowed = /* @__PURE__ */ new Set(["$schema", "name", "displayName", "display_name", "description", "version", "disabled", "logo", "suggestedPrompts", "suggested_prompts", "skills", "author", "homepage", "repository", "license", "keywords", "extensions"]);
  if (Object.keys(value).some((key) => !allowed.has(key)) || value.version !== void 0 && typeof value.version !== "string" || value.description !== void 0 && typeof value.description !== "string") throw new Error("invalid Antigravity plugin manifest");
  if (value.$schema !== void 0 && typeof value.$schema !== "string" || typeof value.$schema === "string" && !/^https:\/\/antigravity\.google\/schemas\/v1\/plugin\.json$/.test(value.$schema)) throw new Error("foreign plugin manifest");
  for (const key of ["displayName", "display_name", "logo", "homepage", "repository", "license"]) if (value[key] !== void 0 && typeof value[key] !== "string") throw new Error(`invalid manifest ${key}`);
  if (value.disabled !== void 0 && typeof value.disabled !== "boolean") throw new Error("invalid manifest disabled");
  const strings = (input) => Array.isArray(input) && input.every((item) => typeof item === "string");
  for (const key of ["keywords", "suggestedPrompts", "suggested_prompts"]) if (value[key] !== void 0 && !strings(value[key])) throw new Error(`invalid manifest ${key}`);
  if (value.skills !== void 0 && typeof value.skills !== "string" && !strings(value.skills)) throw new Error("invalid manifest skills");
  if (value.author !== void 0 && typeof value.author !== "string" && (!object2(value.author) || Object.keys(value.author).some((key) => !["name", "email", "url"].includes(key) || typeof value.author[key] !== "string"))) throw new Error("invalid manifest author");
  if (value.extensions !== void 0 && (!object2(value.extensions) || Object.values(value.extensions).some((item) => !object2(item)))) throw new Error("invalid manifest extensions");
  return value;
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (object2(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}
function mergeManifests(first, second) {
  const a = manifest(first), b = manifest(second);
  if (!a && !b) throw new Error("Antigravity plugin manifest is missing");
  if (a && b && JSON.stringify(canonical(a)) !== JSON.stringify(canonical(b))) throw new Error("conflicting Antigravity plugin manifests");
  return a ?? b;
}
function discovery(text, json) {
  if (text === null) return { doc: {}, entries: [] };
  if (text.trim() === "") throw new Error("invalid plugins.json");
  const doc = json.parseJsonc(text);
  if (!object2(doc) || !Array.isArray(doc.entries) || doc.entries.some((entry) => !object2(entry) || typeof entry.path !== "string" || entry.path === "")) throw new Error("invalid plugins.json entries");
  return { doc, entries: doc.entries };
}
function createAntigravityInstaller(json) {
  return {
    id: ANTIGRAVITY_ID,
    label: "Antigravity",
    places: [{ id: "antigravity-user", label: "Antigravity", scope: "global", scopeWord: "user", switchable: false }],
    async available(tools) {
      try {
        const disk = diskOf(tools);
        if (typeof disk.snapshotDirectory !== "function") return false;
        await disk.roots(SCOPE);
        return true;
      } catch {
        return false;
      }
    },
    async held(tools) {
      const disk = diskOf(tools), roots = await disk.roots(SCOPE);
      const result = [], seen = [];
      const add = async (path, scope) => {
        if (seen.some((item) => same(item, path, roots.platform))) return;
        const values = await Promise.all(MANIFESTS.map((file) => disk.readExternal(roots, path, file)));
        const data = mergeManifests(values[0], values[1]);
        const name = nameOf(data.name), version = versionOf(data.version);
        const owned = scope === "user" && same(path, await disk.path(roots, { root: "plugins", path: `cache/${MARKET}/${name}/${version}` }), roots.platform);
        seen.push(path);
        const pack = await tools.describe(path, name);
        result.push({ name, id: owned ? `${name}@${MARKET}` : name, version, scope, marketplace: owned ? MARKET : null, readOnly: !owned, source: { kind: "local", path }, pack });
      };
      const lists = [{ ref: CONFIG, base: `${roots.config}/config`, scope: "user" }, ...roots.workspace ? [{ ref: { root: "workspace", path: ".agents/plugins.json" }, base: roots.workspace, scope: "project" }] : []];
      for (const list of lists) {
        const doc = discovery(await disk.read(roots, list.ref), json);
        for (const item of doc.entries) {
          const dir = resolve(list.base, item.path, roots.platform);
          const manifests = await Promise.all(MANIFESTS.map((file) => disk.readExternal(roots, dir, file)));
          if (manifests.some((value) => value !== null)) await add(dir, list.scope);
          else {
            const known = list.scope === "user" ? ["config/plugins", "antigravity-cli/plugins"].map((value) => resolve(roots.config, value, roots.platform)) : roots.workspace ? [resolve(roots.workspace, ".agents/plugins", roots.platform)] : [];
            if (!known.some((value) => same(dir, value, roots.platform))) throw new Error(`discovery entry has no Antigravity manifest: ${dir}`);
          }
        }
      }
      for (const root of [{ root: "config", path: "config/plugins", scope: "user" }, { root: "config", path: "antigravity-cli/plugins", scope: "user" }, ...roots.workspace ? [{ root: "workspace", path: ".agents/plugins", scope: "project" }] : []]) {
        for (const item of await disk.list(roots, root)) if (item.directory) await add(await disk.path(roots, { root: root.root, path: `${root.path}/${item.name}` }), root.scope);
      }
      return result;
    },
    async install(name, scope, tools) {
      if (scope !== "user") throw new Error("unsupported plugin scope");
      nameOf(name);
      const disk = diskOf(tools);
      if (typeof disk.snapshotDirectory !== "function") throw new Error("plugin directory snapshots are unavailable");
      return disk.run(SCOPE, async (roots) => {
        if (!same(await tools.root(), roots.library, roots.platform)) throw new Error("plugin library root changed");
        const sourceSnapshot = await disk.snapshotDirectory(roots, { root: "library", path: name });
        if (sourceSnapshot === null) throw new Error("plugin source is missing");
        const source = await Promise.all(MANIFESTS.map((path2) => disk.read(roots, { root: "library", path: `${name}/${path2}` })));
        const data = mergeManifests(source[0], source[1]);
        if (data.name !== name) throw new Error("plugin name does not match library name");
        const version = versionOf(data.version), destination = `cache/${MARKET}/${name}/${version}`;
        const path = await disk.path(roots, { root: "plugins", path: destination });
        const before = await disk.read(roots, CONFIG), found = discovery(before, json);
        const ownRoot = await disk.path(roots, { root: "plugins", path: `cache/${MARKET}/${name}` });
        const isOwn = (item) => {
          const relative = insidePath(ownRoot, resolve(`${roots.config}/config`, item.path, roots.platform), roots.platform);
          return relative !== null && safe(relative);
        };
        const previous = found.entries.filter(isOwn);
        const fields = (entry) => JSON.stringify(canonical(Object.fromEntries(Object.entries(entry).filter(([key]) => key !== "path"))));
        if (previous.some((entry) => fields(entry) !== fields(previous[0]))) throw new Error("conflicting managed discovery entries");
        const entries = [...found.entries.filter((item) => !isOwn(item)), { ...previous[0], path }];
        const after = json.editJson(before, ["entries"], entries);
        const cacheSnapshot = await disk.snapshotDirectory(roots, { root: "plugins", path: destination });
        await disk.commit(roots, [{ ref: CONFIG, before, after }], { name, destination, manifests: [...MANIFESTS], before: cacheSnapshot, sourceSnapshot });
        return { message: `${name} installed for Antigravity`, location: path };
      });
    },
    async remove(id, scope, tools) {
      if (scope !== "user" || !id.endsWith(`@${MARKET}`)) throw new Error("unsupported plugin identity or scope");
      const name = nameOf(id.slice(0, -`@${MARKET}`.length));
      const disk = diskOf(tools);
      return disk.run(SCOPE, async (roots) => {
        const before = await disk.read(roots, CONFIG), found = discovery(before, json);
        const ownedRoot = await disk.path(roots, { root: "plugins", path: `cache/${MARKET}/${name}` });
        const own = (item) => {
          const relative = insidePath(ownedRoot, resolve(`${roots.config}/config`, item.path, roots.platform), roots.platform);
          return relative !== null && safe(relative);
        };
        const removed = found.entries.filter(own);
        if (removed.length === 0) throw new Error("plugin is not installed");
        const after = json.editJson(before, ["entries"], found.entries.filter((entry) => !own(entry)));
        await disk.commit(roots, [{ ref: CONFIG, before, after }]);
        return { message: `${id} removed from discovery; cache retained at ${ownedRoot}` };
      });
    }
  };
}

// src/index.tsx
import { jsx } from "react/jsx-runtime";
var icon = ({ className, "aria-hidden": ariaHidden }) => /* @__PURE__ */ jsx("img", { src: "/hub/extensions/antigravity/assets/icon.svg", className, "aria-hidden": ariaHidden, alt: "" });
function apply(ctx) {
  ctx.skills.register({ id: ANTIGRAVITY_ID, places: [{ id: "antigravity-global", labelKey: "antigravity.tab", icon, scope: "global", dir: GLOBAL_SKILLS }] });
  ctx.mcp.register(createAntigravityMcp(ctx.mcp.tools));
  ctx.prompts.register(createAntigravityPrompts(icon, ctx.prompts.tools));
  ctx.plugins.registerManifests([".antigravity-plugin/plugin.json"]);
  ctx.plugins.register(createAntigravityInstaller(ctx.mcp.tools));
  ctx.targets.register({ id: ANTIGRAVITY_ID, displayName: "Antigravity", icon, supports: [...SUPPORTS], locations: [...GLOBAL_LOCATIONS, ...PROJECT_LOCATIONS], format: "Markdown skills, rules, agents and instructions; JSON MCP and plugins" });
  ctx.locales.register({ id: "en", label: "English", messages });
  ctx.locales.register({ id: "zh-CN", label: "\u7B80\u4F53\u4E2D\u6587", messages: zhMessages });
}
export {
  apply
};
