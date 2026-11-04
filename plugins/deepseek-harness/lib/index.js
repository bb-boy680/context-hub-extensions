// src/locations.ts
var DEEPSEEK_HARNESS_ID = "hub.target.deepseek-harness";
var DEEPSEEK_SKILL_DIR = ".dsh/skills";
var DEEPSEEK_INSTRUCTIONS = ".dsh/AGENTS.md";

// src/messages.ts
var deepSeekHarnessMessages = {
  "deepseekHarness.tab": "DeepSeek Harness",
  "deepseekHarness.menu.instructions": "Add to AGENTS.md",
  "deepseekHarness.menu.instructions.remove": "Remove from AGENTS.md",
  "deepseekHarness.error.unknownPlace": "DeepSeek Harness has no place named {place}.",
  "deepseekHarness.error.unknownForm": "DeepSeek Harness has no prompt action named {form}.",
  "deepseekHarness.error.refused": "The hub could not access {file}.",
  "deepseekHarness.error.sectionBroken": "The context-hub section for {slug} in {file} has invalid markers; no changes were made.",
  "deepseekHarness.error.unsupported": "This version of Context Hub cannot safely manage this file.",
  "deepseekHarness.error.conflict": "The declaration in {file} is ambiguous or changed; no changes were made.",
  "deepseekHarness.error.invalidName": "{name} is not a valid DeepSeek Harness server name.",
  "deepseekHarness.error.invalidEntry": "{name} is not a valid MCP declaration.",
  "deepseekHarness.error.sse": "DeepSeek Harness does not support SSE transport.",
  "deepseekHarness.error.scanOnly": "{file} is available for scanning existing declarations only.",
  "deepseekHarness.error.missingEntry": "There is no declaration named {name} in this file.",
  "deepseekHarness.error.scope": "{place} is not a {scope} location."
};
var deepSeekHarnessZhMessages = {
  "deepseekHarness.tab": "DeepSeek Harness",
  "deepseekHarness.menu.instructions": "\u6DFB\u52A0\u5230 AGENTS.md",
  "deepseekHarness.menu.instructions.remove": "\u4ECE AGENTS.md \u79FB\u9664",
  "deepseekHarness.error.unknownPlace": "DeepSeek Harness \u6CA1\u6709\u540D\u4E3A {place} \u7684\u4F4D\u7F6E\u3002",
  "deepseekHarness.error.unknownForm": "DeepSeek Harness \u6CA1\u6709\u540D\u4E3A {form} \u7684\u63D0\u793A\u8BCD\u64CD\u4F5C\u3002",
  "deepseekHarness.error.refused": "\u65E0\u6CD5\u8BBF\u95EE {file}\u3002",
  "deepseekHarness.error.sectionBroken": "{file} \u4E2D {slug} \u7684 context-hub \u533A\u5757\u6807\u8BB0\u65E0\u6548\uFF0C\u672A\u505A\u4EFB\u4F55\u4FEE\u6539\u3002",
  "deepseekHarness.error.unsupported": "\u5F53\u524D Context Hub \u7248\u672C\u65E0\u6CD5\u5B89\u5168\u7BA1\u7406\u6B64\u6587\u4EF6\u3002",
  "deepseekHarness.error.conflict": "{file} \u4E2D\u7684\u58F0\u660E\u5B58\u5728\u6B67\u4E49\u6216\u5DF2\u53D1\u751F\u53D8\u5316\uFF0C\u672A\u505A\u4EFB\u4F55\u4FEE\u6539\u3002",
  "deepseekHarness.error.invalidName": "{name} \u4E0D\u662F\u6709\u6548\u7684 DeepSeek Harness \u670D\u52A1\u5668\u540D\u79F0\u3002",
  "deepseekHarness.error.invalidEntry": "{name} \u4E0D\u662F\u6709\u6548\u7684 MCP \u58F0\u660E\u3002",
  "deepseekHarness.error.sse": "DeepSeek Harness \u4E0D\u652F\u6301 SSE \u4F20\u8F93\u3002",
  "deepseekHarness.error.scanOnly": "{file} \u4EC5\u7528\u4E8E\u626B\u63CF\u5DF2\u6709\u58F0\u660E\u3002",
  "deepseekHarness.error.missingEntry": "\u6B64\u6587\u4EF6\u4E2D\u6CA1\u6709\u540D\u4E3A {name} \u7684\u58F0\u660E\u3002",
  "deepseekHarness.error.scope": "{place} \u4E0D\u5C5E\u4E8E {scope} \u4F5C\u7528\u57DF\u3002"
};

// src/prompts.ts
var PLACE = "deepseek-harness-global";
var REF = { scope: "global", file: DEEPSEEK_INSTRUCTIONS };
function brokenSection(text, slug) {
  const open = `<!-- context-hub:${slug} -->`;
  const close = `<!-- /context-hub:${slug} -->`;
  const start = text.indexOf(open);
  const end = text.indexOf(close);
  if (start < 0 && end < 0) return false;
  return start < 0 || end < start || text.indexOf(open, start + open.length) >= 0 || text.indexOf(close, end + close.length) >= 0 || /<!-- \/?context-hub:[^>]+ -->/.test(text.slice(start + open.length, end));
}
function createDeepSeekHarnessPrompts(icon, tools) {
  function assertPlace(place) {
    if (place !== PLACE) throw new tools.PromptError("deepseekHarness.error.unknownPlace", { place });
  }
  function assertForm(form, option) {
    if (form !== "instructions" || option !== void 0) {
      throw new tools.PromptError("deepseekHarness.error.unknownForm", { form: option === void 0 ? form : `${form}:${option}` });
    }
  }
  async function read(io, slug) {
    let text;
    try {
      text = await io.files.read(REF);
    } catch (failure) {
      throw new tools.PromptError("deepseekHarness.error.refused", { file: REF.file }, String(failure));
    }
    if (text !== null && brokenSection(text, slug)) {
      throw new tools.PromptError("deepseekHarness.error.sectionBroken", { file: REF.file, slug });
    }
    return text;
  }
  async function change(io, text) {
    try {
      if (text === null) await io.files.remove(REF);
      else await io.files.write(REF, text);
    } catch (failure) {
      throw new tools.PromptError("deepseekHarness.error.refused", { file: REF.file }, String(failure));
    }
  }
  return {
    id: DEEPSEEK_HARNESS_ID,
    places: [{
      id: PLACE,
      agent: DEEPSEEK_HARNESS_ID,
      labelKey: "deepseekHarness.tab",
      icon,
      scope: "global",
      where: "~/.dsh",
      generatedOnly: true,
      forms: [{ id: "instructions", labelKey: "deepseekHarness.menu.instructions", removeLabelKey: "deepseekHarness.menu.instructions.remove" }]
    }],
    async held(io, place, prompt) {
      assertPlace(place);
      const slug = tools.slugOf(prompt.name);
      const text = await read(io, slug);
      return text !== null && tools.withoutSection(text, slug) !== null ? { instructions: true } : {};
    },
    async install(io, place, prompt, form, option) {
      assertPlace(place);
      assertForm(form, option);
      const slug = tools.slugOf(prompt.name);
      const content = `${prompt.name}
${prompt.prompt}`;
      if (/<!-- \/?context-hub:[^>]+ -->/.test(content)) {
        throw new tools.PromptError("deepseekHarness.error.sectionBroken", { file: REF.file, slug });
      }
      const text = await read(io, slug);
      await change(io, tools.withSection(text, { slug, title: prompt.name, body: prompt.prompt }));
    },
    async remove(io, place, prompt, form, option) {
      assertPlace(place);
      assertForm(form, option);
      const slug = tools.slugOf(prompt.name);
      const text = await read(io, slug);
      if (text === null) return false;
      const next = tools.withoutSection(text, slug);
      if (next === null) return false;
      await change(io, next.trim() === "" ? null : next);
      return true;
    }
  };
}

// src/mcp-config.ts
function validServerName(name) {
  return typeof name === "string" && /^[A-Za-z0-9_-]{1,32}$/.test(name);
}
function strings(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  return entries.every(([, item]) => typeof item === "string") ? Object.fromEntries(entries) : null;
}
function readMcpConfig(config) {
  if (config.transport === "stdio") {
    const args = config.args === void 0 ? [] : config.args;
    const env = config.env === void 0 ? {} : strings(config.env);
    if (typeof config.command !== "string" || config.command.trim() === "" || !Array.isArray(args) || !args.every((arg) => typeof arg === "string") || env === null) return null;
    return { transport: "stdio", command: config.command, args, env };
  }
  if (config.transport === "streamable-http") {
    const headers = config.headers === void 0 ? {} : strings(config.headers);
    if (typeof config.url !== "string" || config.url.trim() === "" || headers === null) return null;
    return { transport: "http", url: config.url, headers };
  }
  return null;
}
function writeMcpConfig(name, declaration) {
  if (!validServerName(name)) return null;
  if (declaration.transport === "stdio") {
    if (!Array.isArray(declaration.args) || !declaration.args.every((arg) => typeof arg === "string") || strings(declaration.env) === null) return null;
    const config = { serverName: name, transport: "stdio", command: declaration.command, args: declaration.args, env: declaration.env };
    return readMcpConfig(config) === null ? null : config;
  }
  if (declaration.transport === "http") {
    if (strings(declaration.headers) === null) return null;
    const config = { serverName: name, transport: "streamable-http", url: declaration.url, headers: declaration.headers };
    return readMcpConfig(config) === null ? null : config;
  }
  return null;
}

// src/mcp-places.ts
var ROOT = { home: ".dsh", homeEnv: "DSH_HOME", list: ["profiles", "profiles/*/node_modules", "profiles/*/node_modules/*"] };
var HOME_PLACE = {
  id: "deepseek-harness-home",
  label: "DeepSeek Harness \xB7 cordis.patch.yml",
  scope: "global",
  file: "cordis.patch.yml",
  root: ROOT,
  switchable: true,
  installable: true
};
function ref(file, rootIdentity) {
  return { scope: "global", file, root: ROOT, rootIdentity };
}
function validProfile(name) {
  return name !== "" && name !== "." && name !== ".." && name !== "node_modules" && !name.includes("/") && !name.includes("\\") && !name.includes(":");
}
function profileId(name) {
  return `deepseek-harness-profile-${Array.from(new TextEncoder().encode(name), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}
function profileManifest(text) {
  if (text === null) return false;
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return false;
  }
  if (typeof value !== "object" || value === null) return false;
  const dsh = value.dsh;
  const bundles = dsh?.profile?.bundles;
  return Array.isArray(bundles) && bundles.every((bundle) => typeof bundle === "string" && bundle.trim() !== "");
}
async function mcpPlaces(io, tools, expectedRoot) {
  if (io.files.list === void 0 || io.files.snapshot === void 0) throw new tools.McpError("deepseekHarness.error.unsupported");
  const home = expectedRoot === void 0 ? HOME_PLACE : { ...HOME_PLACE, rootIdentity: expectedRoot };
  const rootIdentity = (await io.files.snapshot(home)).root;
  const names = await io.files.list(ref("profiles", rootIdentity));
  const profiles = [];
  for (const name of names) {
    if (!validProfile(name)) continue;
    if (!profileManifest(await io.files.read(ref(`profiles/${name}/package.json`, rootIdentity)))) continue;
    profiles.push({
      id: profileId(name),
      label: `DeepSeek Harness \xB7 ${name}`,
      scope: "global",
      file: `profiles/${name}/cordis.patch.yml`,
      root: ROOT,
      rootIdentity,
      switchable: true,
      installable: false
    });
  }
  return [{ ...HOME_PLACE, rootIdentity }, ...profiles];
}

// src/mcp-patch.ts
var MODULE = "@deepseek-ai/dsh-mcp-client";
function field(node, name) {
  return node?.kind === "map" ? node.pairs?.find((pair) => pair.key.kind === "scalar" && !pair.key.tag && !pair.key.anchor && pair.key.value === name)?.value ?? null : null;
}
function literal(node) {
  if (node === null || node.tag || node.anchor || node.kind === "alias") return void 0;
  if (node.kind === "scalar") return node.value;
  if (node.kind === "seq") return node.items?.map(literal);
  const entries = node.pairs ?? [];
  if (entries.some((pair) => typeof literal(pair.key) !== "string" || literal(pair.key) === "<<" || pair.value === null)) return void 0;
  const values = entries.map((pair) => [literal(pair.key), literal(pair.value)]);
  if (values.some(([, value]) => value === void 0)) return void 0;
  return Object.fromEntries(values);
}
function safe(node) {
  if (node === null || node.tag || node.anchor || node.kind === "alias") return false;
  if (node.kind === "seq") return (node.items ?? []).every(safe);
  if (node.kind === "map") return (node.pairs ?? []).every((pair) => literal(pair.key) !== "<<" && safe(pair.key) && pair.value !== null && safe(pair.value));
  return true;
}
function safeStructure(node) {
  if (node === null || node.anchor || node.kind === "alias") return false;
  if (node.kind === "seq") return (node.items ?? []).every(safeStructure);
  if (node.kind === "map") return (node.pairs ?? []).every((pair) => typeof literal(pair.key) === "string" && literal(pair.key) !== "<<" && safeStructure(pair.key) && pair.value !== null && safeStructure(pair.value));
  return true;
}
function configData(node) {
  if (node?.kind !== "map" || node.tag || node.anchor) return null;
  const data = {};
  for (const name of ["serverName", "transport", "command", "args", "env", "url", "headers"]) {
    const child = field(node, name);
    if (child === null) continue;
    const value = literal(child);
    if (value === void 0) return null;
    data[name] = value;
  }
  return data;
}
function idOf(node) {
  const id = literal(field(node, "id"));
  return typeof id === "string" && id !== "" ? id : null;
}
function parsePatch(text, tools) {
  const root = tools.parseYamlDocument(text);
  if (root === null || root.kind !== "seq" || root.anchor || root.tag) throw new Error("patch must be a plain YAML sequence");
  const rows = [];
  const ids = [];
  const overrides = [];
  let uncertain = false;
  function visit(node, patch, insert, nested) {
    if (node.kind !== "map") {
      uncertain = true;
      return;
    }
    if ((node.pairs ?? []).some((pair) => typeof literal(pair.key) !== "string")) uncertain = true;
    const id = idOf(node);
    if (id !== null) ids.push(id);
    else if (field(node, "id") !== null) uncertain = true;
    const nameNode = field(node, "name");
    const module = literal(nameNode);
    if (nameNode !== null && module === void 0) uncertain = true;
    const config = field(node, "config");
    if (module === MODULE) {
      if (config?.kind === "map" && (config.pairs ?? []).some((pair) => typeof literal(pair.key) !== "string" || literal(pair.key) === "<<")) uncertain = true;
      const data = configData(config);
      const name = literal(field(config, "serverName"));
      const display = typeof name === "string" && validServerName(name) ? name : id;
      if (typeof name !== "string" || !validServerName(name)) uncertain = true;
      if (display === null || display === void 0) {
        uncertain = true;
        return;
      }
      const disabled = field(node, "disabled");
      const flag = disabled === null ? false : literal(disabled);
      const enabled = typeof flag === "boolean" ? !flag : null;
      const declaration = data !== null && typeof data === "object" && !Array.isArray(data) ? readMcpConfig(data) : null;
      rows.push({
        entry: {
          name: display,
          declaration,
          enabled,
          ...nested || id === null || declaration === null || enabled === null || !safeStructure(node) || !safeStructure(patch) || config === null || text[config.range[0]] === "{" || text[node.range[0]] === "{" ? { readOnly: true } : {}
        },
        id,
        node,
        patch,
        insert,
        config,
        override: null
      });
    }
    const group = field(node, "group");
    if (group !== null && literal(group) === void 0) uncertain = true;
    if (literal(group) === true) {
      if (config?.kind === "seq") {
        for (const child of config.items ?? []) visit(child, patch, insert, true);
      } else uncertain = true;
    }
  }
  for (const patch of root.items ?? []) {
    if (patch.kind !== "map") {
      uncertain = true;
      continue;
    }
    if ((patch.pairs ?? []).some((pair) => typeof literal(pair.key) !== "string")) uncertain = true;
    const insert = field(patch, "insert");
    if (insert !== null) {
      if (insert.kind !== "seq") {
        uncertain = true;
        continue;
      }
      const target = field(patch, "id");
      if (target !== null && typeof literal(target) !== "string") uncertain = true;
      for (const node of insert.items ?? []) visit(node, patch, insert, target !== null);
    } else if (field(patch, "id") !== null) {
      if (idOf(patch) === null) uncertain = true;
      overrides.push(patch);
    }
  }
  for (const row of rows) {
    const relevant = overrides.filter((override) => idOf(override) === row.id && row.id !== null);
    const duplicate = rows.filter((candidate) => candidate.entry.name === row.entry.name).length > 1 || row.id !== null && ids.filter((id) => id === row.id).length > 1;
    if (relevant.length > 1 || duplicate) {
      row.entry.readOnly = true;
      row.entry.enabled = null;
    }
    if (relevant.length === 1) {
      const override = relevant[0];
      row.override = override;
      const keys = override.pairs?.map((pair) => literal(pair.key)) ?? [];
      const name = literal(field(override, "name"));
      const disabled = field(override, "disabled");
      const value = disabled === null ? void 0 : literal(disabled);
      if (!safe(override) || keys.some((key) => key !== "id" && key !== "name" && key !== "disabled") || name !== void 0 && name !== MODULE || typeof value !== "boolean") {
        row.entry.readOnly = true;
        row.entry.enabled = null;
      } else row.entry.enabled = duplicate ? null : !value;
    }
  }
  if (uncertain) for (const row of rows) row.entry.readOnly = true;
  for (const override of overrides) {
    const id = idOf(override);
    if (id !== null && !ids.includes(id)) ids.push(id);
  }
  return { root, rows, ids, uncertain };
}
function retainedComments(source, indent, newline) {
  const comments = [];
  for (const line of source.split(/\r?\n/)) {
    if (/:\s*[|>][+-]?[0-9]?(?:\s*#.*)?\s*$/.test(line)) throw new Error("cannot safely remove a block scalar");
    let quote = "";
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      if (quote === '"' && char === "\\") {
        index += 1;
        continue;
      }
      if (quote === "'" && char === "'" && line[index + 1] === "'") {
        index += 1;
        continue;
      }
      if (quote && char === quote) {
        quote = "";
        continue;
      }
      if (!quote && (char === "'" || char === '"') && (index === 0 || /[\s[{:?,-]/.test(line[index - 1]))) {
        quote = char;
        continue;
      }
      if (!quote && char === "#" && (index === 0 || /\s/.test(line[index - 1]))) {
        comments.push(`${indent}${line.slice(index)}`);
        break;
      }
    }
    if (quote) throw new Error("cannot safely remove a multiline quoted scalar");
  }
  return comments.length === 0 ? "" : `${comments.join(newline)}${newline}`;
}
function updateFields(text, node, updates, tools) {
  if (node.kind !== "map" || node.tag || !safeStructure(node) || text[node.range[0]] === "{") throw new Error("unsafe YAML mapping");
  const pairs = node.pairs ?? [];
  if (pairs.length === 0) throw new Error("empty YAML mapping");
  const changes = [];
  const add = [];
  const first = pairs[0].key.range[0];
  const line = text.lastIndexOf("\n", first - 1) + 1;
  const prefix = text.slice(line, first);
  const sequence = /^(\s*)-\s+$/.exec(prefix);
  const indent = sequence === null ? prefix : `${sequence[1]}  `;
  if (!/^\s*$/.test(indent)) throw new Error("unsafe mapping indentation");
  for (const [name, value] of Object.entries(updates)) {
    const pair = pairs.find((item) => literal(item.key) === name);
    if (pair === void 0) {
      if (value !== void 0) add.push(`${indent}${name}: ${JSON.stringify(value)}`);
      continue;
    }
    if (pair.value === null || !safe(pair.value)) throw new Error("unsafe YAML value");
    if (value === void 0) {
      const removed = text.slice(pair.key.range[0], pair.value.range[1]);
      if (retainedComments(removed, "", "\n") !== "") throw new Error("cannot preserve comments inside removed value");
      changes.push({ start: pair.key.range[0], end: pair.value.range[1], text: "" });
    } else {
      const replaced = text.slice(pair.value.range[0], pair.value.range[1]);
      if (retainedComments(replaced, "", "\n") !== "") throw new Error("cannot preserve comments inside replaced value");
      changes.push({ start: pair.value.range[0], end: pair.value.range[1], text: JSON.stringify(value) });
    }
  }
  if (add.length) {
    const last = pairs.at(-1).value;
    if (last === null) throw new Error("unsafe mapping boundary");
    let valueEnd = last.range[1];
    while (valueEnd > last.range[0] && (text[valueEnd - 1] === "\n" || text[valueEnd - 1] === "\r")) valueEnd -= 1;
    const end = text.indexOf("\n", valueEnd);
    const offset = end < 0 ? text.length : end > 0 && text[end - 1] === "\r" ? end - 1 : end;
    const newline = text.includes("\r\n") ? "\r\n" : "\n";
    changes.push({ start: offset, end: offset, text: `${newline}${add.join(newline)}` });
  }
  let result = text;
  for (const change of changes.sort((a, b) => b.start - a.start)) {
    result = tools.spliceYamlDocument(result, change.start, change.end, change.text);
  }
  return result;
}

// src/mcp.ts
var EMPTY = "[]\n";
function appendPatch(text, patch, tools) {
  const root = tools.parseYamlDocument(text);
  if (root === null || root.kind !== "seq") throw new Error("patch must be a sequence");
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  const block = patch.replace(/\n/g, newline);
  if ((root.items ?? []).length === 0 && text.slice(root.range[0], root.range[1]).trim() === "[]") {
    return tools.spliceYamlDocument(text, root.range[0], root.range[1], block);
  }
  return tools.spliceYamlDocument(text, text.length, text.length, `${text.endsWith("\n") ? "" : newline}${block}${newline}`);
}
function deleteRow(text, node, tools) {
  const start = text.lastIndexOf("\n", node.range[0] - 1) + 1;
  const prefix = text.slice(start, node.range[0]);
  if (!/^\s*-\s+$/.test(prefix)) throw new Error("unsafe sequence entry");
  const end = node.range[1];
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  const indent = /^(\s*)-/.exec(prefix)?.[1] ?? "";
  const comments = retainedComments(text.slice(start, end), indent, newline);
  const root = tools.parseYamlDocument(text);
  const only = root?.kind === "seq" && root.items?.length === 1 && root.items[0]?.range[0] === node.range[0];
  return tools.spliceYamlDocument(text, start, end, `${comments}${only ? `[]${newline}` : ""}`);
}
async function stableId(name) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(name));
  return `context-hub-mcp-${Array.from(new Uint8Array(digest).slice(0, 12), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}
function entryPatch(id, config) {
  const fields = Object.entries(config).map(([key, value]) => `        ${key}: ${JSON.stringify(value)}`);
  return [`- insert:`, `    - id: ${JSON.stringify(id)}`, `      name: "@deepseek-ai/dsh-mcp-client"`, `      config:`, ...fields].join("\n");
}
function createDeepSeekHarnessMcp(tools) {
  const failure = (key, params, reason) => new tools.McpError(`deepseekHarness.error.${key}`, params, reason instanceof Error ? reason.message : String(reason ?? ""));
  let resolved = [HOME_PLACE];
  const places = async (io) => {
    const current = await mcpPlaces(io, tools);
    resolved = current;
    return current;
  };
  async function placeOf(io, id) {
    const found = (await places(io)).find((place) => place.id === id);
    if (found === void 0) throw failure("unknownPlace", { place: id });
    return found;
  }
  async function ensureProfile(io, place) {
    if (place.installable === false && !profileManifest(await io.files.read({ ...place, file: place.file.replace(/cordis\.patch\.yml$/, "package.json") }))) {
      throw failure("unknownPlace", { place: place.id });
    }
  }
  async function snapshot(io, place) {
    if (io.files.snapshot === void 0 || io.files.commit === void 0) throw failure("unsupported");
    const before = await io.files.snapshot(place);
    const profile = place.installable === false ? await io.files.snapshot({ ...place, file: place.file.replace(/cordis\.patch\.yml$/, "package.json") }) : void 0;
    const text = before.text ?? EMPTY;
    return { place, before, ...profile === void 0 ? {} : { profile }, text, parsed: parsePatch(text, tools) };
  }
  async function all(io) {
    const current = await mcpPlaces(io, tools, io.place?.rootIdentity);
    return Promise.all(current.map((place) => snapshot(io, place)));
  }
  async function commit(io, states, target, next) {
    if (io.files.snapshot === void 0 || io.files.commit === void 0) throw failure("unsupported");
    const current = await mcpPlaces(io, tools, target.before.root);
    if (current.map((place) => place.id).join("\n") !== states.map((state) => state.place.id).join("\n")) {
      throw failure("conflict", { file: target.place.file });
    }
    for (const state of states) {
      const before = await io.files.snapshot(state.place);
      if (before.root !== state.before.root || before.text !== state.before.text) throw failure("conflict", { file: state.place.file });
      if (state.profile !== void 0) {
        const manifest = await io.files.snapshot({ ...state.place, file: state.place.file.replace(/cordis\.patch\.yml$/, "package.json") });
        if (manifest.root !== state.profile.root || manifest.text !== state.profile.text) throw failure("conflict", { file: state.place.file });
      }
    }
    if (next !== target.text || target.before.text === null) await io.files.commit(target.place, target.before, next);
  }
  function selected(states, id) {
    const found = states.find((state) => state.place.id === id);
    if (found === void 0) throw failure("unknownPlace", { place: id });
    return found;
  }
  function unique(state, name) {
    const matches = state.parsed.rows.filter((row) => row.entry.name === name);
    if (matches.length > 1 || matches[0]?.entry.readOnly === true) throw failure("conflict", { file: state.place.file });
    return matches[0] ?? null;
  }
  async function mutate(io, id, name, action, declaration, enabled) {
    if (!validServerName(name)) throw failure("invalidName", { name });
    if (io.place !== void 0 && (io.place.id !== id || io.place.rootIdentity === void 0)) throw failure("conflict", { file: id });
    let file = id;
    try {
      const states = await all(io);
      const target = selected(states, id);
      file = target.place.file;
      if (io.place !== void 0 && (io.place.id !== id || io.place.rootIdentity === void 0 || io.place.rootIdentity !== target.place.rootIdentity || io.place.file !== target.place.file)) {
        throw failure("conflict", { file });
      }
      const uncertain = states.find((state) => state.parsed.uncertain);
      if (uncertain !== void 0) throw failure("conflict", { file: uncertain.place.file });
      const row = unique(target, name);
      let next = target.text;
      if (action === "install") {
        const conflict = target.place.id === HOME_PLACE.id ? states.find((state) => state.place.id !== id && state.parsed.rows.some((candidate) => candidate.entry.name === name)) : void 0;
        if (conflict !== void 0) throw failure("conflict", { file: conflict.place.file });
        if (declaration === void 0) throw failure("invalidEntry", { name });
        const config = writeMcpConfig(name, declaration);
        if (config === null) throw failure(declaration.transport === "sse" ? "sse" : "invalidEntry", { name });
        if (row === null) {
          if (target.place.installable === false) throw failure("scanOnly", { file: target.place.file });
          if (states.some((state) => state.parsed.rows.some((candidate) => candidate.entry.name === name))) {
            throw failure("conflict", { file: target.place.file });
          }
          const entryId = await stableId(name);
          if (states.some((state) => state.parsed.ids.includes(entryId))) throw failure("conflict", { file: target.place.file });
          next = appendPatch(next, entryPatch(entryId, config), tools);
        } else {
          if (row.config === null) throw failure("conflict", { file: target.place.file });
          const updates = { ...config };
          if (declaration.transport === "stdio") {
            updates.url = void 0;
            updates.headers = void 0;
          } else {
            updates.command = void 0;
            updates.args = void 0;
            updates.env = void 0;
            updates.cwd = void 0;
          }
          next = updateFields(next, row.config, updates, tools);
        }
      } else if (action === "enable") {
        if (row === null || row.id === null || enabled === void 0) throw failure("missingEntry", { name });
        if (row.entry.enabled === enabled) return;
        if (row.override !== null) next = updateFields(next, row.override, { disabled: !enabled }, tools);
        else next = appendPatch(next, `- id: ${JSON.stringify(row.id)}
  disabled: ${!enabled}`, tools);
      } else {
        if (row === null) return;
        if (row.override !== null) {
          next = deleteRow(next, row.override, tools);
          const reparsed = parsePatch(next, tools);
          const remaining = reparsed.rows.find((candidate) => candidate.entry.name === name);
          if (remaining === void 0) throw failure("conflict", { file: target.place.file });
          next = removeDeclaration(next, remaining, tools);
        } else next = removeDeclaration(next, row, tools);
      }
      await commit(io, states, target, next);
    } catch (reason) {
      if (reason instanceof tools.McpError) throw reason;
      throw failure("refused", { file }, reason);
    }
  }
  return {
    id: DEEPSEEK_HARNESS_ID,
    places: [HOME_PLACE],
    placesFor: places,
    async read(io, id) {
      if (io.place !== void 0 && (io.place.id !== id || io.place.rootIdentity === void 0)) throw failure("conflict", { file: id });
      const place = io.place ?? resolved.find((entry) => entry.id === id) ?? await placeOf(io, id);
      await ensureProfile(io, place);
      const text = await io.files.read(place);
      return text === null ? [] : parsePatch(text, tools).rows.map((row) => row.entry);
    },
    install: (io, id, name, declaration) => mutate(io, id, name, "install", declaration),
    uninstall: (io, id, name) => mutate(io, id, name, "remove"),
    async setEnabled(io, id, scope, name, enabled) {
      if (scope !== "global") throw failure("scope", { place: id, scope });
      await mutate(io, id, name, "enable", void 0, enabled);
    },
    async locate(io, id, name) {
      if (io.place !== void 0 && (io.place.id !== id || io.place.rootIdentity === void 0)) throw failure("conflict", { file: id });
      const place = io.place ?? await placeOf(io, id);
      await ensureProfile(io, place);
      const text = await io.files.read(place);
      if (text === null) return null;
      const row = parsePatch(text, tools).rows.find((candidate) => candidate.entry.name === name);
      if (row === void 0) return null;
      let end = row.node.range[1];
      while (end > row.node.range[0] && (text[end - 1] === "\n" || text[end - 1] === "\r")) end -= 1;
      return [text.slice(0, row.node.range[0]).split("\n").length, text.slice(0, end).split("\n").length];
    }
  };
}
function removeDeclaration(text, row, tools) {
  if ((row.insert.items ?? []).length === 1) {
    if ((row.patch.pairs ?? []).length !== 1) throw new Error("insert patch has additional fields");
    return deleteRow(text, row.patch, tools);
  }
  return deleteRow(text, row.node, tools);
}

// src/bundle-state.ts
function object(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : null;
}
function bundleNameParts(name) {
  if (typeof name !== "string" || name === "" || name.includes("\\") || name.length > 214) return null;
  const parts = name.split("/");
  if (parts.length > 2 || parts.length === 2 && !parts[0]?.startsWith("@") || parts.length === 1 && name.startsWith("@")) return null;
  const segments = parts.map((part, index) => index === 0 && part.startsWith("@") ? part.slice(1) : part);
  if (segments.some((part) => !/^[a-z0-9][a-z0-9._~-]*$/.test(part) || part === "node_modules" || part.endsWith(".") || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(part))) return null;
  return parts;
}
function patchPath(path) {
  if (typeof path !== "string" || path === "" || path.startsWith("/") || path.includes("\\") || path.includes(":") || path.includes("\0")) return false;
  const relative = path.startsWith("./") ? path.slice(2) : path;
  return relative !== "" && relative.split("/").every((part) => part !== "" && part !== "." && part !== ".." && !part.endsWith(".") && !part.endsWith(" ") && !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(part));
}
function bundleManifest(text) {
  if (text === null) return null;
  let document;
  try {
    document = object(JSON.parse(text));
  } catch {
    return null;
  }
  const dsh = object(document?.dsh);
  const bundle = object(dsh?.bundle);
  const declared = bundle?.patch;
  const patches = typeof declared === "string" ? [declared] : declared;
  if (typeof document?.name !== "string" || bundleNameParts(document.name) === null || typeof document.version !== "string" || document.version.trim() === "" || !Array.isArray(patches) || patches.length === 0 || !patches.every(patchPath)) return null;
  return { name: document.name, version: document.version, description: typeof document.description === "string" ? document.description : "", patches };
}
function profileBundleState(text) {
  if (text === null) return null;
  let document;
  try {
    document = object(JSON.parse(text));
  } catch {
    return null;
  }
  const dsh = object(document?.dsh);
  const profile = object(dsh?.profile);
  const selected = profile?.bundles;
  const dependencies = document?.dependencies === void 0 ? {} : object(document.dependencies);
  if (!Array.isArray(selected) || !selected.every((name) => typeof name === "string" && bundleNameParts(name) !== null) || dependencies === null || !Object.entries(dependencies).every(([name, spec]) => bundleNameParts(name) !== null && typeof spec === "string" && spec !== "")) return null;
  return { selected, dependencies };
}

// src/installer.ts
var DECLARATION = {
  home: ".dsh",
  homeEnv: "DSH_HOME",
  state: "profiles",
  config: {
    write: [],
    read: [
      "profiles",
      "profiles/*/package.json",
      "profiles/*/node_modules/*/package.json",
      "profiles/*/node_modules/*/*/package.json"
    ]
  },
  stateFiles: { write: [], read: [] },
  workspace: { write: [], read: [] },
  library: { write: [], read: [] },
  directories: [],
  external: []
};
function profilePlaces(names) {
  return names.map((profile) => ({
    id: profileId(profile),
    label: `DeepSeek Harness \xB7 ${profile}`,
    scope: "global",
    scopeWord: "user",
    switchable: false,
    installable: false,
    initialInstallable: false
  }));
}
async function readBundle(tools, roots, profile, name) {
  const disk = tools.disk;
  const parts = bundleNameParts(name);
  if (parts === null || disk === void 0) return null;
  const base = `profiles/${profile}/node_modules`;
  const path = parts.length === 2 ? `${base}/${parts[0]}/${parts[1]}/package.json` : `${base}/${parts[0]}/package.json`;
  const raw = await disk.read(roots, { root: "config", path }).catch(() => null);
  const parsed = bundleManifest(raw);
  return parsed?.name === name ? parsed : null;
}
function createDeepSeekHarnessInstaller() {
  const install = async (tools) => {
    const disk = tools.disk;
    if (disk === void 0) return [];
    const roots = await disk.roots(DECLARATION);
    const entries = await disk.list(roots, { root: "config", path: "profiles" });
    const names = [];
    for (const entry of entries) {
      if (!entry.directory) continue;
      const raw = await disk.read(roots, { root: "config", path: `profiles/${entry.name}/package.json` }).catch(() => null);
      if (profileBundleState(raw) !== null) names.push(entry.name);
    }
    return profilePlaces(names);
  };
  return {
    id: DEEPSEEK_HARNESS_ID,
    label: "DeepSeek Harness",
    places: [],
    placesFor: install,
    async available(tools) {
      return (await install(tools)).length > 0;
    },
    async held(tools) {
      const disk = tools.disk;
      if (disk === void 0) return [];
      const roots = await disk.roots(DECLARATION);
      const entries = (await disk.list(roots, { root: "config", path: "profiles" })).filter((entry) => entry.directory);
      const packs = [];
      for (const entry of entries) {
        const state = profileBundleState(
          await disk.read(roots, { root: "config", path: `profiles/${entry.name}/package.json` }).catch(() => null)
        );
        if (state === null) continue;
        const placeId = profileId(entry.name);
        for (const name of [.../* @__PURE__ */ new Set([...state.selected, ...Object.keys(state.dependencies)])]) {
          const bundle = await readBundle(tools, roots, entry.name, name);
          packs.push({
            name: bundle?.name ?? name,
            id: `${name}@deepseek-harness:${entry.name}`,
            version: bundle?.version ?? "",
            scope: "user",
            placeId,
            enabled: state.selected.includes(name),
            readOnly: true,
            origin: "record",
            marketplace: null,
            pack: {
              name: bundle?.name ?? name,
              version: bundle?.version ?? "",
              description: bundle?.description ?? ""
            }
          });
        }
      }
      return packs;
    },
    async install() {
      throw new Error("DeepSeek Harness bundles require dependency preparation; this hub does not install them yet");
    },
    async remove() {
      throw new Error("DeepSeek Harness bundles are read-only in this hub");
    }
  };
}

// src/index.tsx
import { jsx } from "react/jsx-runtime";
var DeepSeekHarnessIcon = ({ className, "aria-hidden": ariaHidden }) => /* @__PURE__ */ jsx(
  "img",
  {
    src: "/hub/extensions/deepseek-harness/assets/icon.svg",
    className,
    "aria-hidden": ariaHidden,
    alt: ariaHidden === true ? "" : "DeepSeek Harness"
  }
);
function apply(ctx) {
  ctx.plugins.registerManifestRules([
    { file: "package.json", required: [{ path: ["dsh", "bundle", "patch"], kind: "nonempty-string-or-array" }] }
  ]);
  ctx.plugins.register(createDeepSeekHarnessInstaller());
  ctx.skills.register({
    id: DEEPSEEK_HARNESS_ID,
    places: [
      { id: "deepseek-harness", labelKey: "deepseekHarness.tab", icon: DeepSeekHarnessIcon, scope: "workspace", dir: DEEPSEEK_SKILL_DIR },
      { id: "deepseek-harness-global", labelKey: "deepseekHarness.tab", icon: DeepSeekHarnessIcon, scope: "global", dir: DEEPSEEK_SKILL_DIR }
    ]
  });
  ctx.prompts.register(createDeepSeekHarnessPrompts(DeepSeekHarnessIcon, ctx.prompts.tools));
  ctx.mcp.register(createDeepSeekHarnessMcp(ctx.mcp.tools));
  ctx.targets.register({
    id: DEEPSEEK_HARNESS_ID,
    displayName: "DeepSeek Harness",
    icon: DeepSeekHarnessIcon,
    supports: ["skill", "memory", "mcp"],
    locations: [
      { label: "Project skills", path: ".dsh/skills/<name>/SKILL.md" },
      { label: "Shared project skills", path: ".agents/skills/<name>/SKILL.md" },
      { label: "Skills", path: "~/.dsh/skills/<name>/SKILL.md" },
      { label: "Instructions", path: "~/.dsh/AGENTS.md" },
      { label: "MCP", path: "~/.dsh/cordis.patch.yml" },
      { label: "Project instructions", path: "AGENTS.md" }
    ],
    format: "Markdown skills and instructions; YAML MCP patches"
  });
  ctx.locales.register({ id: "en", label: "English", messages: deepSeekHarnessMessages });
  ctx.locales.register({ id: "zh-CN", label: "\u7B80\u4F53\u4E2D\u6587", messages: deepSeekHarnessZhMessages });
}
export {
  apply
};
