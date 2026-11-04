// src/locations.ts
var QWEN_ID = "hub.target.qwen-code";
var QWEN_SKILL_DIR = ".qwen/skills";
var QWEN_MCP_FILE = ".qwen/settings.json";
var LOCATIONS = [
  { label: "Native extensions", path: "~/.qwen/extensions/<name>" },
  { label: "MCP", path: "~/.qwen/settings.json" },
  { label: "Project MCP", path: ".qwen/settings.json" },
  { label: "Skills", path: "~/.qwen/skills/<name>/SKILL.md" },
  { label: "Agents", path: "~/.qwen/agents/<name>.md" },
  { label: "Commands", path: "~/.qwen/commands/<name>.md" },
  { label: "Instructions", path: "~/.qwen/QWEN.md" },
  { label: "Project agents", path: ".qwen/agents/<name>.md" },
  { label: "Project commands", path: ".qwen/commands/<name>.md" },
  { label: "Project instructions", path: "QWEN.md" },
  { label: "Project skills", path: ".qwen/skills/<name>/SKILL.md" }
];
var SUPPORTS = ["skill", "mcp", "memory", "agent"];

// src/messages.ts
var qwenMessages = {
  "qwen-code.tab": "Qwen Code",
  "qwen-code.menu.skill": "Skill",
  "qwen-code.menu.skill.remove": "Remove skill",
  "qwen-code.menu.instructions": "Instructions",
  "qwen-code.menu.instructions.remove": "Remove instructions",
  "qwen-code.error.unknownForm": "Unknown Qwen Code form: {form}",
  "qwen-code.error.invalidName": "The generated filename is invalid.",
  "qwen-code.error.conflict": "Cannot safely change {file}.",
  "qwen-code.error.unknownPlace": "Unknown Qwen Code place: {place}",
  "qwen-code.error.invalidMcp": "Invalid Qwen Code MCP configuration.",
  "qwen-code.error.mcpConflict": "This MCP entry cannot be safely changed."
};
var qwenZhMessages = {
  "qwen-code.tab": "Qwen Code",
  "qwen-code.menu.skill": "\u6280\u80FD",
  "qwen-code.menu.skill.remove": "\u79FB\u9664\u6280\u80FD",
  "qwen-code.menu.instructions": "\u6307\u4EE4",
  "qwen-code.menu.instructions.remove": "\u79FB\u9664\u6307\u4EE4",
  "qwen-code.error.unknownForm": "\u672A\u77E5\u7684 Qwen Code \u5F62\u5F0F\uFF1A{form}",
  "qwen-code.error.invalidName": "\u751F\u6210\u7684\u6587\u4EF6\u540D\u65E0\u6548\u3002",
  "qwen-code.error.conflict": "\u65E0\u6CD5\u5B89\u5168\u4FEE\u6539 {file}\u3002",
  "qwen-code.error.unknownPlace": "\u672A\u77E5\u7684 Qwen Code \u4F4D\u7F6E\uFF1A{place}",
  "qwen-code.error.invalidMcp": "Qwen Code MCP \u914D\u7F6E\u65E0\u6548\u3002",
  "qwen-code.error.mcpConflict": "\u65E0\u6CD5\u5B89\u5168\u4FEE\u6539\u6B64 MCP \u6761\u76EE\u3002"
};

// src/provider.ts
var object = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var strings = (value) => object(value) && Object.values(value).every((item) => typeof item === "string");
var managed = ["command", "args", "env", "httpUrl", "url", "headers"];
function createQwenCodeMcp(tools) {
  const fileOf = (id) => {
    if (id === "qwen-code") return { scope: "workspace", file: QWEN_MCP_FILE };
    if (id === "qwen-code-global") return { scope: "global", file: QWEN_MCP_FILE };
    throw new tools.McpError("qwen-code.error.unknownPlace", { place: id });
  };
  const serversOf = (text) => {
    if (text !== null && text.trim() === "") throw new tools.McpError("qwen-code.error.invalidMcp");
    const doc = tools.readJsonObject(text);
    const servers = doc?.mcpServers;
    if (servers !== void 0 && !object(servers)) throw new tools.McpError("qwen-code.error.invalidMcp");
    return servers ?? {};
  };
  const declarationOf = (value) => {
    if (!object(value) || "type" in value || "transport" in value) return null;
    const keys = ["command", "httpUrl", "url"].filter((key) => Object.hasOwn(value, key));
    if (keys.length !== 1 || typeof value[keys[0]] !== "string" || !value[keys[0]].trim()) return null;
    if (value.args !== void 0 && (!Array.isArray(value.args) || !value.args.every((item) => typeof item === "string"))) return null;
    if (value.env !== void 0 && !strings(value.env)) return null;
    if (value.headers !== void 0 && !strings(value.headers)) return null;
    if (keys[0] === "command" && Object.hasOwn(value, "headers")) return null;
    if (keys[0] !== "command" && (Object.hasOwn(value, "args") || Object.hasOwn(value, "env"))) return null;
    if (keys[0] === "httpUrl") return tools.readDeclaration({ ...value, url: value.httpUrl, type: "http" });
    if (keys[0] === "url") return tools.readDeclaration({ ...value, type: "sse" });
    return tools.readDeclaration(value);
  };
  const valuesOf = (declaration) => {
    const values = tools.writeDeclaration(declaration);
    if (declaration.transport === "http") {
      values.httpUrl = values.url;
      delete values.url;
    }
    return values;
  };
  return {
    id: QWEN_ID,
    places: ["qwen-code", "qwen-code-global"].map((id) => ({ id, label: "Qwen Code", switchable: false, ...fileOf(id) })),
    async read(io, place) {
      return Object.entries(serversOf(await io.files.read(fileOf(place)))).map(([name, value]) => ({ name, declaration: declarationOf(value), enabled: true }));
    },
    async install(io, place, name, declaration) {
      const file = fileOf(place);
      const text = await io.files.read(file);
      const servers = serversOf(text);
      const prior = Object.hasOwn(servers, name) ? servers[name] : void 0;
      const previous = prior === void 0 ? null : declarationOf(prior);
      if (prior !== void 0 && (!previous || !object(prior))) throw new tools.McpError("qwen-code.error.mcpConflict");
      if (object(prior) && previous && previous.transport !== declaration.transport) {
        const conflicting = declaration.transport === "stdio" ? ["headers", "oauth"] : previous.transport === "stdio" ? ["cwd", "envFile"] : [];
        if (conflicting.some((key) => Object.hasOwn(prior, key))) throw new tools.McpError("qwen-code.error.mcpConflict");
      }
      const values = valuesOf(declaration);
      if (declarationOf(values)?.transport !== declaration.transport) throw new tools.McpError("qwen-code.error.mcpConflict");
      let next = text;
      if (text !== null && tools.readJsonObject(text)?.mcpServers === void 0) next = tools.editJson(text, ["mcpServers"], {});
      if (object(prior)) {
        for (const key of managed) {
          if (Object.hasOwn(prior, key) || Object.hasOwn(values, key)) next = tools.editJson(next, ["mcpServers", name, key], values[key]);
        }
      } else next = tools.editJson(next, ["mcpServers", name], values);
      await io.files.write(file, next);
    },
    async uninstall(io, place, name) {
      const file = fileOf(place);
      const text = await io.files.read(file);
      const servers = serversOf(text);
      if (!Object.hasOwn(servers, name)) return;
      if (!declarationOf(servers[name])) throw new tools.McpError("qwen-code.error.mcpConflict");
      await io.files.write(file, tools.editJson(text, ["mcpServers", name], void 0));
    },
    async locate(io, place, name) {
      const text = await io.files.read(fileOf(place));
      serversOf(text);
      return text === null ? null : tools.jsonValueLines(text, ["mcpServers", name]);
    }
  };
}

// src/prompts.ts
var forms = [
  { id: "commands", labelKey: "prompts.menu.commands", removeLabelKey: "prompts.menu.commands.remove" },
  { id: "skill", labelKey: "qwen-code.menu.skill", removeLabelKey: "qwen-code.menu.skill.remove" },
  { id: "agent", labelKey: "prompts.menu.agent", removeLabelKey: "prompts.menu.agent.remove" },
  { id: "instructions", labelKey: "qwen-code.menu.instructions", removeLabelKey: "qwen-code.menu.instructions.remove" }
];
function createQwenCodePrompts(icon, tools) {
  const places = [
    { id: "qwen-code", agent: QWEN_ID, labelKey: "qwen-code.tab", icon, scope: "workspace", where: ".qwen", forms },
    { id: "qwen-code-global", agent: QWEN_ID, labelKey: "qwen-code.tab", icon, scope: "global", where: "~/.qwen", forms }
  ];
  const placeOf = (id) => {
    const place = places.find((item) => item.id === id);
    if (!place) throw new tools.PromptError("qwen-code.error.unknownPlace", { place: id });
    return place;
  };
  const slugOf = (prompt) => {
    const slug = tools.slugOf(prompt.name);
    if (!/^[\p{L}\p{N}-]+$/u.test(slug) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(slug)) {
      throw new tools.PromptError("qwen-code.error.invalidName");
    }
    return slug;
  };
  const target = (place, slug, form, option) => {
    if (!place.forms.some((item) => item.id === form) || option !== void 0) throw new tools.PromptError("qwen-code.error.unknownForm", { form });
    if (form === "instructions") return { scope: place.scope, file: place.scope === "global" ? ".qwen/QWEN.md" : "QWEN.md" };
    if (form === "skill") return { scope: place.scope, file: `.qwen/skills/${slug}/SKILL.md` };
    return { scope: place.scope, file: `.qwen/${form === "commands" ? "commands" : "agents"}/${slug}.md` };
  };
  const owned2 = (text, slug) => {
    const lines = (text.charCodeAt(0) === 65279 ? text.slice(1) : text).split(/\r?\n/);
    if (lines[0] !== "---") return false;
    const end = lines.findIndex((line, index) => index > 0 && line === "---");
    return end >= 0 && lines[end + 1] === `<!-- context-hub:${slug} -->`;
  };
  const sectionSafe = (text, slug, ref) => {
    if (text === null) return;
    const open = `<!-- context-hub:${slug} -->`, close = `<!-- /context-hub:${slug} -->`;
    const start = text.indexOf(open), end = text.indexOf(close);
    if (start < 0 && end >= 0 || start >= 0 && (end < start || text.indexOf(open, start + open.length) >= 0 || text.indexOf(close, end + close.length) >= 0)) {
      throw new tools.PromptError("qwen-code.error.conflict", { file: ref.file });
    }
  };
  const generated = (prompt, slug, form) => {
    const description = prompt.description.trim() || tools.describeBody(prompt.prompt) || prompt.name;
    const fields = form === "commands" ? [] : [`name: ${JSON.stringify(slug)}`];
    fields.push(`description: ${JSON.stringify(description)}`);
    const body = tools.commandFile({ name: prompt.name, description, body: prompt.prompt, frontmatter: false });
    return `---
${fields.join("\n")}
---
<!-- context-hub:${slug} -->
${body}`;
  };
  return {
    id: QWEN_ID,
    places,
    async held(io, id, prompt) {
      const place = placeOf(id), slug = slugOf(prompt), result = {};
      for (const form of forms) {
        const ref = target(place, slug, form.id);
        const text = await io.files.read(ref);
        if (text === null) continue;
        if (form.id === "instructions") {
          sectionSafe(text, slug, ref);
          if (tools.withoutSection(text, slug) !== null) result[form.id] = true;
        } else if (owned2(text, slug)) result[form.id] = true;
      }
      return result;
    },
    async install(io, id, prompt, form, option) {
      const slug = slugOf(prompt), ref = target(placeOf(id), slug, form, option);
      const text = await io.files.read(ref);
      if (form === "instructions") {
        sectionSafe(text, slug, ref);
        await io.files.write(ref, tools.withSection(text, { slug, title: prompt.name, body: prompt.prompt }));
      } else {
        if (text !== null && !owned2(text, slug)) throw new tools.PromptError("qwen-code.error.conflict", { file: ref.file });
        await io.files.write(ref, generated(prompt, slug, form));
      }
    },
    async remove(io, id, prompt, form, option) {
      const slug = slugOf(prompt), ref = target(placeOf(id), slug, form, option);
      const text = await io.files.read(ref);
      if (text === null) return false;
      if (form === "instructions") {
        sectionSafe(text, slug, ref);
        const next = tools.withoutSection(text, slug);
        if (next === null) return false;
        if (next.trim() === "") await io.files.remove(ref);
        else await io.files.write(ref, next);
      } else {
        if (!owned2(text, slug)) throw new tools.PromptError("qwen-code.error.conflict", { file: ref.file });
        await io.files.remove(ref);
      }
      return true;
    }
  };
}

// src/plugin-state.ts
var record = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var integer = (value) => Number.isSafeInteger(value) && value >= 0;
var namePattern = /^[a-zA-Z0-9_.-]+$/;
var hashPattern = /^[a-f0-9]{64}$/;
var state = (value) => value === "enabled" || value === "disabled";
function validProjection(value) {
  if (!record(value)) return false;
  const keys = Object.keys(value).map((key) => key.toLowerCase());
  return new Set(keys).size === keys.length && Object.values(value).every((item) => record(item) && Array.isArray(item.overrides) && item.overrides.every((rule) => typeof rule === "string"));
}
function validPolicy(value) {
  if (!record(value) || typeof value.name !== "string" || !namePattern.test(value.name) || !state(value.defaultActivation) || !record(value.workspaceOverrides)) return false;
  if (!Object.values(value.workspaceOverrides).every((item) => state(item) || item === "inherit")) return false;
  if (value.artifactDirectory !== void 0 && (typeof value.artifactDirectory !== "string" || !namePattern.test(value.artifactDirectory) || value.artifactDirectory === "." || value.artifactDirectory === "..")) return false;
  if (value.artifactGeneration !== void 0 && !integer(value.artifactGeneration)) return false;
  if (value.declarationOnly !== void 0 && value.declarationOnly !== true) return false;
  if (value.preserveActivationOnNextInstall !== void 0 && value.preserveActivationOnNextInstall !== true) return false;
  if (value.legacyPathRules !== void 0 && (!Array.isArray(value.legacyPathRules) || !value.legacyPathRules.every((rule) => typeof rule === "string"))) return false;
  if (value.skillWorkspaceOverrides !== void 0 && (!record(value.skillWorkspaceOverrides) || !Object.values(value.skillWorkspaceOverrides).every((item) => record(item) && Object.values(item).every((enabled) => typeof enabled === "boolean")))) return false;
  return true;
}
function parseQwenSnapshot(text) {
  const parsed = JSON.parse(text);
  if (!record(parsed) || parsed.version !== 2 || !integer(parsed.generation) || typeof parsed.legacyProjectionHash !== "string" || !hashPattern.test(parsed.legacyProjectionHash) || !record(parsed.extensions)) throw new Error("Invalid Qwen extension store");
  if (parsed.legacyProjectionRemainder !== void 0 && !validProjection(parsed.legacyProjectionRemainder)) throw new Error("Invalid Qwen extension store");
  if (!Object.entries(parsed.extensions).every(([id, policy]) => hashPattern.test(id) && validPolicy(policy))) throw new Error("Invalid Qwen extension store");
  return parsed;
}
async function qwenLocalIdentity(name) {
  if (!namePattern.test(name) || name === "." || name === "..") throw new Error("Invalid Qwen extension name");
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(name));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
function rulePath(value) {
  let path = value.replace(/\\/g, "/");
  if (!path.startsWith("/")) path = `/${path}`;
  if (!path.endsWith("/")) path += "/";
  return path;
}
function ruleMatches(rule, candidate) {
  const raw = rule.startsWith("!") ? rule.slice(1) : rule;
  const escaped = raw.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/(\/)?\*/g, "($1.*)?");
  return new RegExp(`^${escaped}$`).test(candidate);
}
function qwenActivation(policy, workspace, canonicalWorkspace) {
  const exact = policy.workspaceOverrides[canonicalWorkspace];
  if (exact === "enabled" || exact === "disabled") return exact;
  if (exact === "inherit") return policy.defaultActivation;
  let result = policy.defaultActivation;
  const paths = [rulePath(workspace), rulePath(canonicalWorkspace)];
  for (const rule of policy.legacyPathRules ?? []) {
    if (paths.some((path) => ruleMatches(rule, path))) result = rule.startsWith("!") ? "disabled" : "enabled";
  }
  return result;
}
function qwenProjection(snapshot) {
  const projection = /* @__PURE__ */ Object.create(null);
  const represented = new Set(Object.values(snapshot.extensions).map((policy) => policy.name.toLowerCase()));
  const remainder = snapshot.legacyProjectionRemainder ?? {};
  for (const [name, config2] of Object.entries(remainder)) {
    if (!represented.has(name.toLowerCase())) projection[name] = { overrides: [...config2.overrides] };
  }
  for (const policy of Object.values(snapshot.extensions)) {
    const overrides = [];
    if (policy.defaultActivation === "disabled") overrides.push("!/*");
    overrides.push(...policy.legacyPathRules ?? []);
    for (const [workspace, value] of Object.entries(policy.workspaceOverrides)) {
      const effective = value === "inherit" ? policy.defaultActivation : value;
      const input = `${effective === "disabled" ? "!" : ""}${workspace}`;
      overrides.push(`${input.startsWith("!") ? "!" : ""}${rulePath(input.startsWith("!") ? input.slice(1) : input)}`);
    }
    if (overrides.length) projection[policy.name] = { overrides };
  }
  return projection;
}
async function qwenSetActivation(snapshot, id, name, workspace, enabled) {
  const next = structuredClone(snapshot);
  const policy = next.extensions[id];
  if (!policy || policy.name !== name || policy.declarationOnly === true || !Number.isSafeInteger(next.generation + 1)) throw new Error("Invalid Qwen extension policy");
  const activation = enabled ? "enabled" : "disabled";
  if (workspace === null) policy.defaultActivation = activation;
  else policy.workspaceOverrides[workspace] = activation;
  next.generation += 1;
  next.legacyProjectionHash = await qwenProjectionHash(qwenProjection(next));
  return next;
}
async function qwenClearWorkspaceActivation(snapshot, id, name, workspace, canonicalWorkspace) {
  const next = structuredClone(snapshot);
  const policy = next.extensions[id];
  if (!policy || policy.name !== name || policy.declarationOnly === true || !Number.isSafeInteger(next.generation + 1)) throw new Error("Invalid Qwen extension policy");
  const paths = [rulePath(workspace), rulePath(canonicalWorkspace)];
  const legacyMatch = (policy.legacyPathRules ?? []).some((rule) => paths.some((path) => ruleMatches(rule, path)));
  if (legacyMatch) policy.workspaceOverrides[canonicalWorkspace] = "inherit";
  else delete policy.workspaceOverrides[canonicalWorkspace];
  next.generation += 1;
  next.legacyProjectionHash = await qwenProjectionHash(qwenProjection(next));
  return next;
}
async function qwenProjectionHash(projection) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(projection)));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// src/installer.ts
var config = (path) => ({ root: "config", path });
var plugins = (path) => ({ root: "plugins", path });
var library = (path) => ({ root: "library", path });
var stateRef = config("extension-store/state.json");
var previousRef = config("extension-store/state.previous.json");
var ownerRef = config("extension-store/.context-hub-ownership.json");
var pendingRef = config("extension-store/transactions");
var stagingRef = config("extension-store/staging");
var rollbackRef = config("extension-store/rollback");
var projectionRef = plugins("extension-enablement.json");
var qwenDiskScope = {
  home: ".qwen",
  homeEnv: "QWEN_HOME",
  canonicalWorkspace: true,
  state: "extensions",
  config: { write: ["extension-store/lock", "extension-store/state.json", "extension-store/state.previous.json", "extension-store/.context-hub-ownership.json", "extension-store/transactions/*", "extension-store/staging/*", "extension-store/rollback/*"], read: ["extension-store/transactions", "extension-store/staging", "extension-store/rollback"] },
  stateFiles: { write: ["*"], read: ["", "*/**"] },
  directories: [":name"],
  workspace: { write: [], read: [] },
  library: { write: [], read: ["**"] },
  external: [],
  lease: { ref: config("extension-store/lock"), stale: 6e4, update: 5e3, retries: { retries: 60, factor: 1.2, minTimeout: 50, maxTimeout: 500, randomize: true } }
};
var object2 = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var digest = /^[a-f0-9]{64}$/;
function validName(name) {
  return /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(name) && !name.endsWith(".") && !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(name);
}
function ownersOf(text) {
  if (text === null) return { version: 1, entries: {} };
  const value = JSON.parse(text);
  if (!object2(value) || value.version !== 1 || !object2(value.entries)) throw new Error("Invalid Qwen ownership record");
  for (const [id, generations] of Object.entries(value.entries)) {
    if (!digest.test(id) || !object2(generations) || Object.entries(generations).some(([generation, hash]) => !/^(0|[1-9][0-9]*)$/.test(generation) || typeof hash !== "string" || !digest.test(hash))) throw new Error("Invalid Qwen ownership record");
  }
  return value;
}
function manifestOf(text, forInstall = false) {
  if (text === null) throw new Error("Qwen native manifest is required");
  const value = JSON.parse(text);
  if (!object2(value) || typeof value.name !== "string" || !validName(value.name) || typeof value.version !== "string" || value.version.trim() === "" || value.description !== void 0 && typeof value.description !== "string") throw new Error("Invalid Qwen native manifest");
  if (forInstall && value.settings !== void 0 && (!Array.isArray(value.settings) || value.settings.length > 0)) throw new Error("Qwen extensions requiring settings cannot be installed automatically");
  return { name: value.name, version: value.version, description: typeof value.description === "string" ? value.description : "" };
}
async function getDisk(tools) {
  if (!tools.disk || typeof tools.disk.journalCommit !== "function") throw new Error("This Context Hub version lacks journalled plugin transactions");
  return tools.disk;
}
async function assertProjection(snapshot, text) {
  const value = text === null ? {} : JSON.parse(text);
  if (!object2(value)) throw new Error("Qwen activation projection requires client reconciliation");
  const names = Object.keys(value).map((name) => name.toLowerCase());
  if (new Set(names).size !== names.length || Object.values(value).some((entry) => !object2(entry) || !Array.isArray(entry.overrides) || !entry.overrides.every((rule) => typeof rule === "string"))) throw new Error("Qwen activation projection requires client reconciliation");
  if (await qwenProjectionHash(value) !== snapshot.legacyProjectionHash) throw new Error("Qwen activation projection requires client reconciliation");
}
async function initialSnapshot(disk, roots, text) {
  if (text !== null) {
    const snapshot = parseQwenSnapshot(text);
    await assertProjection(snapshot, await disk.read(roots, projectionRef));
    return snapshot;
  }
  const projection = await disk.read(roots, projectionRef);
  const previous = await disk.read(roots, previousRef);
  if (previous !== null || projection !== null && (!object2(JSON.parse(projection)) || Object.keys(JSON.parse(projection)).length !== 0)) throw new Error("Existing Qwen state requires client recovery");
  return { version: 2, generation: 0, legacyProjectionHash: await qwenProjectionHash({}), extensions: {} };
}
async function assertNoPrivateFiles(disk, roots, ref) {
  for (const entry of await disk.list(roots, ref)) {
    if (entry.name === ".git" || entry.name === ".env" || entry.name.startsWith(".env.") || entry.name === ".qwen-extension-install.json") throw new Error("Qwen package contains private installation data");
    if (entry.directory) await assertNoPrivateFiles(disk, roots, { root: ref.root, path: `${ref.path}/${entry.name}` });
  }
}
async function needsRecovery(disk, roots) {
  for (const ref of [pendingRef, stagingRef, rollbackRef]) if ((await disk.list(roots, ref, { includeLinks: true })).length > 0) return true;
  return false;
}
async function preflight(disk) {
  const roots = await disk.roots(qwenDiskScope);
  if (await needsRecovery(disk, roots)) throw new Error("Qwen transaction or staging requires recovery or inspection");
  await initialSnapshot(disk, roots, await disk.read(roots, stateRef));
  ownersOf(await disk.read(roots, ownerRef));
  return roots;
}
async function checkedSource(disk, roots, name) {
  if (!validName(name)) throw new Error("Invalid Qwen extension name");
  const manifest = manifestOf(await disk.read(roots, library(`${name}/qwen-extension.json`)), true);
  if (manifest.name !== name) throw new Error("Qwen manifest name does not match the library package");
  const rootEntries = await disk.list(roots, library(name));
  if (rootEntries.some((entry) => !entry.directory && entry.name === "plugin.json")) throw new Error("Mixed plugin manifests are not accepted");
  for (const dir of [".claude-plugin", ".codex-plugin", ".cursor-plugin"]) {
    if (rootEntries.some((entry) => entry.directory && entry.name === dir) && (await disk.list(roots, library(`${name}/${dir}`))).some((entry) => entry.name === "plugin.json")) throw new Error("Mixed plugin manifests are not accepted");
  }
  await assertNoPrivateFiles(disk, roots, library(name));
  const snapshot = await disk.snapshotDirectory(roots, library(name));
  if (snapshot === null) throw new Error("Qwen library package is missing");
  return { version: manifest.version, description: manifest.description, snapshot };
}
async function owned(disk, roots, snapshot, owners, id) {
  const policy = snapshot.extensions[id];
  if (!policy || typeof policy.artifactGeneration !== "number" || policy.artifactDirectory !== policy.name || policy.declarationOnly === true) throw new Error("Qwen extension is not managed by Context Hub");
  await assertNoPrivateFiles(disk, roots, plugins(policy.name));
  const hash = owners.entries[id]?.[String(policy.artifactGeneration)];
  if (!hash || await disk.snapshotDirectory(roots, plugins(policy.name)) !== hash) throw new Error("Qwen extension ownership or contents changed");
  return { name: policy.name, hash };
}
async function recipeOf(disk, roots, snapshot, next, state2, changes, artifact) {
  const prior = await disk.read(roots, previousRef);
  const projection = await disk.read(roots, projectionRef);
  if (state2 !== null) await assertProjection(snapshot, projection);
  const before = [...changes, ...state2 === null ? [] : [{ ref: previousRef, before: prior, after: state2 }]];
  const recipe = { pending: pendingRef, guardEmpty: [stagingRef, rollbackRef], before, commit: { ref: stateRef, before: state2, after: JSON.stringify(next, null, 2) }, after: [{ ref: projectionRef, before: projection, after: JSON.stringify(qwenProjection(next), null, 2) }] };
  if (artifact) {
    const transactionId = crypto.randomUUID();
    const staging = artifact.operation === "copy" ? config(`extension-store/staging/transaction-${transactionId}`) : void 0;
    const backup = config(`extension-store/rollback/${transactionId}`);
    const base = {
      version: 1,
      transactionId,
      operation: artifact.operation === "remove" ? "uninstall" : artifact.before === null ? "install" : "update",
      destinationDirectory: await disk.path(roots, plugins(artifact.destination)),
      ...staging ? { stagingDirectory: await disk.path(roots, staging) } : {},
      backupDirectory: await disk.path(roots, backup),
      previousGeneration: snapshot.generation,
      targetGeneration: next.generation,
      targetSnapshot: next,
      orderMs: Date.now()
    };
    const document = (phase) => JSON.stringify({ ...base, phase }, null, 2);
    recipe.journal = { ref: config(`extension-store/transactions/${transactionId}.json`), prepared: document("prepared"), swapped: document("artifact_swapped"), committed: document("state_committed") };
    recipe.artifact = { ...artifact, staging, backup };
  }
  return recipe;
}
async function withLease(disk, work) {
  let completed;
  try {
    return await disk.run(qwenDiskScope, async (roots) => {
      if (await needsRecovery(disk, roots)) throw new Error("Qwen transaction or staging requires recovery or inspection");
      completed = await work(roots);
      return completed;
    });
  } catch (error) {
    if (!completed) throw error;
    return { ...completed, warning: [completed.warning, `Lock release: ${String(error)}`].filter(Boolean).join("\n") };
  }
}
function report(warnings, location) {
  return { message: "Qwen Code extension updated.", ...location ? { location } : {}, ...warnings.length ? { warning: warnings.join("\n") } : {} };
}
function createQwenCodeInstaller() {
  return {
    id: QWEN_ID,
    label: "Qwen Code",
    places: [
      { id: "qwen-code-global", label: "Qwen Code", scope: "global", scopeWord: "user", switchable: true },
      { id: "qwen-code", label: "Qwen Code", scope: "workspace", scopeWord: "project", switchable: true, installable: false, initialInstallable: true, clearable: true, overrides: ["user"] }
    ],
    async available(tools) {
      return typeof tools.disk?.journalCommit === "function";
    },
    async held(tools) {
      const disk = await getDisk(tools), roots = await disk.roots(qwenDiskScope);
      const stateText = await disk.read(roots, stateRef), ownerText = await disk.read(roots, ownerRef);
      const pending = await needsRecovery(disk, roots);
      let snapshot = null, owners = null;
      try {
        if (stateText !== null) {
          snapshot = parseQwenSnapshot(stateText);
          await assertProjection(snapshot, await disk.read(roots, projectionRef));
        }
        owners = ownersOf(ownerText);
      } catch {
        snapshot = null;
      }
      const result = [];
      for (const entry of await disk.list(roots, plugins(""))) {
        if (!entry.directory || !validName(entry.name)) continue;
        const manifestText = await disk.read(roots, plugins(`${entry.name}/qwen-extension.json`));
        if (manifestText === null) continue;
        try {
          const manifest = manifestOf(manifestText);
          if (manifest.name !== entry.name) continue;
          const hasMetadata = (await disk.list(roots, plugins(entry.name))).some((file) => file.name === ".qwen-extension-install.json");
          const id = hasMetadata ? `unknown:${entry.name}` : await qwenLocalIdentity(entry.name);
          let managed2 = false;
          if (!pending && !hasMetadata && snapshot && owners) {
            try {
              await owned(disk, roots, snapshot, owners, id);
              managed2 = true;
            } catch {
            }
          }
          const policy = snapshot?.extensions[id];
          result.push({ name: entry.name, id, version: manifest.version, scope: "user", ...managed2 && policy ? { enabled: policy.defaultActivation === "enabled" } : {}, readOnly: !managed2, marketplace: managed2 ? "context-hub" : null, sourceAvailable: true, source: { kind: "local", path: await disk.path(roots, plugins(entry.name)) }, pack: manifest });
        } catch {
          result.push({ name: entry.name, id: `unknown:${entry.name}`, version: "", scope: "user", readOnly: true, marketplace: null, sourceAvailable: false, pack: { name: entry.name, version: "", description: "" } });
        }
      }
      return result;
    },
    async switches(tools) {
      const disk = await getDisk(tools), roots = await disk.roots(qwenDiskScope);
      if (await needsRecovery(disk, roots)) return { user: {}, project: {} };
      const text = await disk.read(roots, stateRef);
      if (text === null) return { user: {}, project: {} };
      const snapshot = parseQwenSnapshot(text), owners = ownersOf(await disk.read(roots, ownerRef));
      await assertProjection(snapshot, await disk.read(roots, projectionRef));
      const user = {}, project = {};
      for (const [id, policy] of Object.entries(snapshot.extensions)) {
        try {
          await owned(disk, roots, snapshot, owners, id);
        } catch {
          continue;
        }
        user[id] = policy.defaultActivation === "enabled";
        if (roots.workspace !== null && roots.workspaceCanonical != null) project[id] = qwenActivation(policy, roots.workspace, roots.workspaceCanonical) === "enabled";
      }
      return { user, project };
    },
    async install(name, scope, tools) {
      if (scope !== "user" && scope !== "project") throw new Error("Unsupported Qwen installation scope");
      const disk = await getDisk(tools);
      const initialRoots = await preflight(disk);
      await checkedSource(disk, initialRoots, name);
      if (scope === "project" && initialRoots.workspaceCanonical == null) throw new Error("No workspace selected");
      const initialState = await initialSnapshot(disk, initialRoots, await disk.read(initialRoots, stateRef));
      const initialOwners = ownersOf(await disk.read(initialRoots, ownerRef));
      const initialId = await qwenLocalIdentity(name);
      const initialPolicy = initialState.extensions[initialId];
      if (Object.entries(initialState.extensions).some(([otherId, policy]) => otherId !== initialId && policy.name.toLowerCase() === name.toLowerCase())) throw new Error("Another Qwen extension has this name");
      if (initialPolicy) {
        if (initialPolicy.name !== name) throw new Error("Qwen extension identity does not match the package");
        await owned(disk, initialRoots, initialState, initialOwners, initialId);
      } else {
        await disk.path(initialRoots, plugins(name));
        if ((await disk.list(initialRoots, plugins(""))).some((entry) => entry.name === name)) throw new Error("An unmanaged Qwen extension already exists");
      }
      return withLease(disk, async (roots) => {
        const source = await checkedSource(disk, roots, name), state2 = await disk.read(roots, stateRef);
        const snapshot = await initialSnapshot(disk, roots, state2), ownersText = await disk.read(roots, ownerRef), owners = ownersOf(ownersText);
        const id = await qwenLocalIdentity(name), previous = snapshot.extensions[id];
        if (Object.entries(snapshot.extensions).some(([otherId, policy]) => otherId !== id && policy.name.toLowerCase() === name.toLowerCase())) throw new Error("Another Qwen extension has this name");
        if (previous && previous.name !== name) throw new Error("Qwen extension identity does not match the package");
        const oldHash = previous ? (await owned(disk, roots, snapshot, owners, id)).hash : null;
        if (!previous) {
          await disk.path(roots, plugins(name));
          if ((await disk.list(roots, plugins(""))).some((entry) => entry.name === name)) throw new Error("An unmanaged Qwen extension already exists");
        }
        if (previous && oldHash === source.snapshot) {
          const location2 = await disk.path(roots, plugins(name));
          if (scope === "user") return report([], location2);
          if (roots.workspaceCanonical == null) throw new Error("No workspace selected");
          const activated = await qwenSetActivation(snapshot, id, name, roots.workspaceCanonical, true);
          const result2 = await disk.journalCommit(roots, await recipeOf(disk, roots, snapshot, activated, state2, []));
          return report(result2.warnings, location2);
        }
        const next = structuredClone(snapshot);
        next.generation++;
        if (!Number.isSafeInteger(next.generation)) throw new Error("Qwen generation overflow");
        if (previous) {
          next.extensions[id] = { ...previous, artifactDirectory: name, artifactGeneration: next.generation };
          delete next.extensions[id].preserveActivationOnNextInstall;
        } else {
          if (scope === "project" && roots.workspaceCanonical == null) throw new Error("No workspace selected");
          const remainder = next.legacyProjectionRemainder;
          const inherited = Object.entries(remainder ?? {}).find(([heldName]) => heldName.toLowerCase() === name.toLowerCase())?.[1].overrides ?? [];
          next.extensions[id] = { name, defaultActivation: scope === "user" ? "enabled" : "disabled", workspaceOverrides: scope === "project" ? { [roots.workspaceCanonical]: "enabled" } : {}, artifactDirectory: name, artifactGeneration: next.generation, ...inherited.length ? { legacyPathRules: [...inherited] } : {} };
          if (remainder) {
            const represented = new Set(Object.values(next.extensions).map((policy) => policy.name.toLowerCase()));
            next.legacyProjectionRemainder = Object.fromEntries(Object.entries(remainder).filter(([heldName]) => !represented.has(heldName.toLowerCase())));
          }
        }
        next.legacyProjectionHash = await qwenProjectionHash(qwenProjection(next));
        const generations = owners.entries[id] ?? {};
        const existing = generations[String(next.generation)];
        if (existing && existing !== source.snapshot) throw new Error("Qwen ownership generation conflicts");
        owners.entries[id] = { ...generations, [String(next.generation)]: source.snapshot };
        const change = { ref: ownerRef, before: ownersText, after: JSON.stringify(owners, null, 2) };
        const artifact = { operation: "copy", name, destination: name, before: oldHash, sourceSnapshot: source.snapshot, backup: config("unused"), manifests: ["qwen-extension.json"] };
        const location = await disk.path(roots, plugins(name));
        const result = await disk.journalCommit(roots, await recipeOf(disk, roots, snapshot, next, state2, [change], artifact));
        return report(result.warnings, location);
      });
    },
    async setEnabled(id, scope, enabled, tools) {
      if (scope !== "user" && scope !== "project") throw new Error("Unsupported Qwen activation scope");
      const disk = await getDisk(tools);
      await preflight(disk);
      return withLease(disk, async (roots) => {
        const state2 = await disk.read(roots, stateRef);
        if (state2 === null) throw new Error("Qwen extension state is missing");
        const snapshot = parseQwenSnapshot(state2), owners = ownersOf(await disk.read(roots, ownerRef));
        const item = await owned(disk, roots, snapshot, owners, id);
        if (scope === "project" && roots.workspaceCanonical == null) throw new Error("No workspace selected");
        const next = await qwenSetActivation(snapshot, id, item.name, scope === "user" ? null : roots.workspaceCanonical, enabled);
        const result = await disk.journalCommit(roots, await recipeOf(disk, roots, snapshot, next, state2, []));
        return report(result.warnings);
      });
    },
    async clearEnabled(id, scope, tools) {
      if (scope !== "project") throw new Error("Only a workspace override can be cleared");
      const disk = await getDisk(tools);
      await preflight(disk);
      return withLease(disk, async (roots) => {
        if (roots.workspace === null || roots.workspaceCanonical == null) throw new Error("No workspace selected");
        const state2 = await disk.read(roots, stateRef);
        if (state2 === null) throw new Error("Qwen extension state is missing");
        const snapshot = parseQwenSnapshot(state2), owners = ownersOf(await disk.read(roots, ownerRef));
        const item = await owned(disk, roots, snapshot, owners, id);
        const next = await qwenClearWorkspaceActivation(snapshot, id, item.name, roots.workspace, roots.workspaceCanonical);
        const result = await disk.journalCommit(roots, await recipeOf(disk, roots, snapshot, next, state2, []));
        return report(result.warnings);
      });
    },
    async remove(id, scope, tools) {
      if (scope !== "user") throw new Error("Workspace policy cannot remove a shared Qwen extension");
      const disk = await getDisk(tools);
      await preflight(disk);
      return withLease(disk, async (roots) => {
        const state2 = await disk.read(roots, stateRef);
        if (state2 === null) throw new Error("Qwen extension state is missing");
        const snapshot = parseQwenSnapshot(state2), ownersText = await disk.read(roots, ownerRef), owners = ownersOf(ownersText);
        const item = await owned(disk, roots, snapshot, owners, id);
        const next = structuredClone(snapshot);
        delete next.extensions[id];
        next.generation++;
        if (!Number.isSafeInteger(next.generation)) throw new Error("Qwen generation overflow");
        next.legacyProjectionHash = await qwenProjectionHash(qwenProjection(next));
        delete owners.entries[id];
        const artifact = { operation: "remove", name: item.name, destination: item.name, before: item.hash, backup: config("unused") };
        const recipe = await recipeOf(disk, roots, snapshot, next, state2, [], artifact);
        recipe.after = [...recipe.after, { ref: ownerRef, before: ownersText, after: JSON.stringify(owners, null, 2) }];
        const result = await disk.journalCommit(roots, recipe);
        return report(result.warnings);
      });
    }
  };
}

// src/index.tsx
import { jsx } from "react/jsx-runtime";
var QwenIcon = ({ className, "aria-hidden": ariaHidden }) => /* @__PURE__ */ jsx("img", { src: "/hub/extensions/qwen-code/assets/icon.png", alt: "", className, "aria-hidden": ariaHidden });
function apply(ctx) {
  ctx.skills.register({ id: QWEN_ID, places: [
    { id: "qwen-code", labelKey: "qwen-code.tab", icon: QwenIcon, scope: "workspace", dir: QWEN_SKILL_DIR },
    { id: "qwen-code-global", labelKey: "qwen-code.tab", icon: QwenIcon, scope: "global", dir: QWEN_SKILL_DIR }
  ] });
  ctx.mcp.register(createQwenCodeMcp(ctx.mcp.tools));
  ctx.prompts.register(createQwenCodePrompts(QwenIcon, ctx.prompts.tools));
  ctx.plugins.registerManifests(["qwen-extension.json"]);
  ctx.plugins.register(createQwenCodeInstaller());
  ctx.targets.register({ id: QWEN_ID, displayName: "Qwen Code", icon: QwenIcon, supports: SUPPORTS, locations: LOCATIONS, format: "Markdown and JSON" });
  ctx.locales.register({ id: "en", label: "English", messages: qwenMessages });
  ctx.locales.register({ id: "zh-CN", label: "\u7B80\u4F53\u4E2D\u6587", messages: qwenZhMessages });
}
export {
  apply
};
