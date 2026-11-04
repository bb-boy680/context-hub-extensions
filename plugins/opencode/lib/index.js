// src/locations.ts
var OPENCODE_ID = "hub.target.opencode";
var OPENCODE_SKILL_DIR = ".opencode/skills";
var OPENCODE_GLOBAL_SKILL_DIR = ".config/opencode/skills";
var OPENCODE_CONFIG_DIR = ".opencode";
var OPENCODE_GLOBAL_CONFIG_DIR = ".config/opencode";
var OPENCODE_COMMAND_DIR = `${OPENCODE_CONFIG_DIR}/commands`;
var OPENCODE_AGENT_DIR = `${OPENCODE_CONFIG_DIR}/agents`;
var OPENCODE_GLOBAL_COMMAND_DIR = `${OPENCODE_GLOBAL_CONFIG_DIR}/commands`;
var OPENCODE_GLOBAL_AGENT_DIR = `${OPENCODE_GLOBAL_CONFIG_DIR}/agents`;
var OPENCODE_GLOBAL_INSTRUCTION_FILE = `${OPENCODE_GLOBAL_CONFIG_DIR}/AGENTS.md`;
var OPENCODE_MCP_PLACES = [
  {
    id: "opencode-global-jsonc",
    label: "OpenCode \xB7 opencode.jsonc",
    scope: "global",
    file: ".config/opencode/opencode.jsonc",
    installable: false
  },
  {
    id: "opencode-global-json",
    label: "OpenCode \xB7 opencode.json",
    scope: "global",
    file: ".config/opencode/opencode.json",
    installable: true
  },
  {
    id: "opencode-workspace-jsonc",
    label: "OpenCode \xB7 opencode.jsonc",
    scope: "workspace",
    file: "opencode.jsonc",
    installable: false
  },
  {
    id: "opencode-workspace-json",
    label: "OpenCode \xB7 opencode.json",
    scope: "workspace",
    file: "opencode.json",
    installable: true
  },
  {
    id: "opencode-dotdir-jsonc",
    label: "OpenCode \xB7 .opencode/opencode.jsonc",
    scope: "workspace",
    file: ".opencode/opencode.jsonc",
    installable: false
  },
  {
    id: "opencode-dotdir-json",
    label: "OpenCode \xB7 .opencode/opencode.json",
    scope: "workspace",
    file: ".opencode/opencode.json",
    installable: false
  }
];
var GLOBAL_LOCATIONS = [
  { label: "Skills", path: `~/${OPENCODE_GLOBAL_SKILL_DIR}/<name>/SKILL.md` },
  { label: "Commands", path: `~/${OPENCODE_GLOBAL_COMMAND_DIR}/<slug>.md` },
  { label: "Agents", path: `~/${OPENCODE_GLOBAL_AGENT_DIR}/<slug>.md` },
  { label: "Instructions", path: `~/${OPENCODE_GLOBAL_INSTRUCTION_FILE}` },
  { label: "Config", path: `~/${OPENCODE_GLOBAL_CONFIG_DIR}/opencode.jsonc` }
];
var PROJECT_LOCATIONS = [
  { label: "Project skills", path: `${OPENCODE_SKILL_DIR}/<name>/SKILL.md` },
  { label: "Commands", path: `${OPENCODE_COMMAND_DIR}/<slug>.md` },
  { label: "Agents", path: `${OPENCODE_AGENT_DIR}/<slug>.md` },
  { label: "Instructions", path: "AGENTS.md" },
  { label: "Config", path: "opencode.jsonc" }
];
var SUPPORTS = ["skill", "mcp", "memory", "agent"];

// src/messages.ts
var openCodeMessages = {
  "opencode.tab": "OpenCode",
  "opencode.menu.instructions": "Add to AGENTS.md",
  "opencode.menu.instructions.remove": "Remove from AGENTS.md",
  "opencode.error.parse": "OpenCode's config file is not JSON this hub can read.",
  "opencode.error.refused": "The hub could not write {file}.",
  "opencode.error.unknownPlace": "OpenCode has no client file called {place}.",
  "opencode.error.unknownForm": "OpenCode has no prompt action called {form}.",
  "opencode.error.v2Only": "This file is not native OpenCode V2 configuration. It was left unchanged.",
  "opencode.error.sse": "OpenCode V2 has no SSE transport field, so this server was not written.",
  "opencode.error.invalidEntry": "{name} is not a complete OpenCode V2 server entry.",
  "opencode.error.missingEntry": "This file has no server called {name}, so its switch was not written.",
  "opencode.error.scope": "{place} is not a {scope} place.",
  "opencode.error.handwritten": "{file} is not a file this hub wrote, so it was left alone.",
  "opencode.error.sectionBroken": "{file} has an incomplete context-hub section for {slug}, so nothing was changed."
};
var openCodeZhMessages = {
  "opencode.tab": "OpenCode",
  "opencode.menu.instructions": "\u6DFB\u52A0\u5230 AGENTS.md",
  "opencode.menu.instructions.remove": "\u4ECE AGENTS.md \u79FB\u9664",
  "opencode.error.parse": "OpenCode \u7684\u914D\u7F6E\u6587\u4EF6\u4E0D\u662F\u53EF\u8BFB\u53D6\u7684 JSON\u3002",
  "opencode.error.refused": "\u65E0\u6CD5\u5199\u5165 {file}\u3002",
  "opencode.error.unknownPlace": "OpenCode \u6CA1\u6709\u540D\u4E3A {place} \u7684\u5BA2\u6237\u7AEF\u6587\u4EF6\u3002",
  "opencode.error.unknownForm": "OpenCode \u6CA1\u6709\u540D\u4E3A {form} \u7684\u63D0\u793A\u8BCD\u64CD\u4F5C\u3002",
  "opencode.error.v2Only": "\u8BE5\u6587\u4EF6\u4E0D\u662F\u539F\u751F OpenCode V2 \u914D\u7F6E\uFF0C\u5DF2\u4FDD\u6301\u539F\u6837\u3002",
  "opencode.error.sse": "OpenCode V2 \u6CA1\u6709 SSE \u4F20\u8F93\u5B57\u6BB5\uFF0C\u8BE5\u670D\u52A1\u5668\u672A\u5199\u5165\u3002",
  "opencode.error.invalidEntry": "{name} \u4E0D\u662F\u5B8C\u6574\u7684 OpenCode V2 \u670D\u52A1\u5668\u6761\u76EE\u3002",
  "opencode.error.missingEntry": "\u8BE5\u6587\u4EF6\u4E2D\u6CA1\u6709\u540D\u4E3A {name} \u7684\u670D\u52A1\u5668\uFF0C\u672A\u5199\u5165\u5F00\u5173\u3002",
  "opencode.error.scope": "{place} \u4E0D\u662F {scope} \u4F5C\u7528\u57DF\u7684\u4F4D\u7F6E\u3002",
  "opencode.error.handwritten": "{file} \u4E0D\u662F\u8FD9\u4E2A hub \u5199\u5165\u7684\u6587\u4EF6\uFF0C\u5DF2\u4FDD\u7559\u539F\u6837\u3002",
  "opencode.error.sectionBroken": "{file} \u4E2D {slug} \u7684 context-hub \u533A\u5757\u6807\u8BB0\u4E0D\u5B8C\u6574\uFF0C\u672A\u505A\u4EFB\u4F55\u4FEE\u6539\u3002"
};

// src/provider.ts
var SERVERS = ["mcp", "servers"];
var LEGACY_OAUTH = ["clientId", "clientSecret", "callbackPort", "redirectUri"];
function createOpenCodeMcp(tools) {
  const { McpError, editJson, jsonValueLines, readJsonObject } = tools;
  const placeOf = (id) => {
    const found = OPENCODE_MCP_PLACES.find((place) => place.id === id);
    if (found === void 0) throw new McpError("opencode.error.unknownPlace", { place: id });
    return found;
  };
  const fileOf2 = (id) => {
    const place = placeOf(id);
    return { scope: place.scope, file: place.file };
  };
  const readText = async (io, ref) => {
    try {
      return await io.files.read(ref) ?? "";
    } catch (error) {
      throw new McpError("opencode.error.refused", { file: ref.file }, messageOf(error));
    }
  };
  const writeText = async (io, ref, text) => {
    try {
      await io.files.write(ref, text);
    } catch (error) {
      throw new McpError("opencode.error.refused", { file: ref.file }, messageOf(error));
    }
  };
  const v2Only = (file, detail) => new McpError("opencode.error.v2Only", { file }, detail);
  const serversOf = (text, file) => {
    let document;
    try {
      document = readJsonObject(text);
    } catch (error) {
      throw new McpError("opencode.error.parse", { file }, messageOf(error));
    }
    if (document === null) return null;
    const mcp = document.mcp;
    if (mcp === void 0) return null;
    if (!isObject(mcp)) throw v2Only(file, "mcp is not an object");
    for (const [key, value] of Object.entries(mcp)) {
      if (key === "servers") continue;
      if (looksLikeServer(value)) {
        throw v2Only(file, `mcp.${key} is a flat server entry`);
      }
    }
    const servers = mcp.servers;
    if (servers === void 0) return null;
    if (!isObject(servers)) throw v2Only(file, "mcp.servers is not an object");
    for (const [name, entry] of Object.entries(servers)) {
      if (legacyEntry(entry)) throw v2Only(file, `server ${name} carries pre-V2 fields`);
    }
    return servers;
  };
  const declarationOf = (entry, name) => {
    if (!isObject(entry)) throw new McpError("opencode.error.invalidEntry", { name });
    if (entry.type === "local") {
      const argv = entry.command;
      if (!Array.isArray(argv) || argv.length === 0 || argv.some((item) => typeof item !== "string" || item === "")) {
        throw new McpError("opencode.error.invalidEntry", { name });
      }
      return {
        transport: "stdio",
        command: argv[0],
        args: argv.slice(1),
        env: stringsOf(entry.environment)
      };
    }
    if (entry.type === "remote") {
      if (typeof entry.url !== "string" || entry.url === "") {
        throw new McpError("opencode.error.invalidEntry", { name });
      }
      return { transport: "http", url: entry.url, headers: stringsOf(entry.headers) };
    }
    throw new McpError("opencode.error.invalidEntry", { name });
  };
  const edit = (file, change) => {
    try {
      return change();
    } catch (error) {
      throw new McpError("opencode.error.refused", { file }, messageOf(error));
    }
  };
  return {
    id: OPENCODE_ID,
    places: OPENCODE_MCP_PLACES.map((place) => ({
      id: place.id,
      label: place.label,
      switchable: true,
      installable: place.installable,
      scope: place.scope,
      file: place.file
    })),
    async read(io, place) {
      const ref = fileOf2(place);
      const text = await readText(io, ref);
      const servers = serversOf(text, ref.file);
      if (servers === null) return [];
      return Object.entries(servers).map(([name, entry]) => {
        if (legacyEntry(entry)) {
          throw v2Only(ref.file, `server ${name} carries pre-V2 fields`);
        }
        return {
          name,
          declaration: declarationOf(entry, name),
          /* V2 spells the switch backwards: a missing field is an enabled server. */
          enabled: fieldOf(entry, "disabled") !== true
        };
      });
    },
    async install(io, place, name, declaration) {
      const ref = fileOf2(place);
      if (declaration.transport === "sse") {
        throw new McpError("opencode.error.sse", { file: ref.file });
      }
      const text = await readText(io, ref);
      const servers = serversOf(text, ref.file);
      const existing = servers?.[name];
      if (existing !== void 0) {
        if (!isObject(existing)) throw new McpError("opencode.error.invalidEntry", { name });
        if (legacyEntry(existing)) {
          throw v2Only(ref.file, `server ${name} carries pre-V2 fields`);
        }
        if (!isV2Entry(existing)) {
          throw v2Only(ref.file, `server ${name} is not a native V2 entry`);
        }
      }
      const path = [...SERVERS, name];
      if (existing === void 0) {
        const entry = declaration.transport === "stdio" ? localEntry(declaration) : remoteEntry(declaration);
        await writeText(io, ref, edit(ref.file, () => editJson(text, path, entry)));
        return;
      }
      let next = text;
      if (declaration.transport === "stdio") {
        next = edit(ref.file, () => editJson(next, [...path, "type"], "local"));
        next = edit(
          ref.file,
          () => editJson(next, [...path, "command"], [declaration.command, ...declaration.args])
        );
        next = edit(
          ref.file,
          () => editJson(next, [...path, "environment"], optional(declaration.env))
        );
        next = edit(ref.file, () => editJson(next, [...path, "url"], void 0));
        next = edit(ref.file, () => editJson(next, [...path, "headers"], void 0));
        next = edit(ref.file, () => editJson(next, [...path, "oauth"], void 0));
      } else {
        next = edit(ref.file, () => editJson(next, [...path, "type"], "remote"));
        next = edit(ref.file, () => editJson(next, [...path, "url"], declaration.url));
        next = edit(
          ref.file,
          () => editJson(next, [...path, "headers"], optional(declaration.headers))
        );
        next = edit(ref.file, () => editJson(next, [...path, "command"], void 0));
        next = edit(ref.file, () => editJson(next, [...path, "environment"], void 0));
        next = edit(ref.file, () => editJson(next, [...path, "cwd"], void 0));
      }
      await writeText(io, ref, next);
    },
    async uninstall(io, place, name) {
      const ref = fileOf2(place);
      const text = await readText(io, ref);
      const servers = serversOf(text, ref.file);
      refuseLegacyTarget(ref.file, servers, name);
      if (servers?.[name] === void 0) return;
      await writeText(io, ref, edit(ref.file, () => editJson(text, [...SERVERS, name], void 0)));
    },
    async setEnabled(io, place, scope, name, enabled) {
      const target = placeOf(place);
      if (scope !== target.scope) {
        throw new McpError("opencode.error.scope", { place, scope });
      }
      const ref = fileOf2(place);
      const text = await readText(io, ref);
      const servers = serversOf(text, ref.file);
      const entry = servers?.[name];
      if (entry === void 0) {
        throw new McpError("opencode.error.missingEntry", { name, file: ref.file });
      }
      if (!isObject(entry)) throw new McpError("opencode.error.invalidEntry", { name });
      if (legacyEntry(entry)) {
        throw v2Only(ref.file, `server ${name} carries pre-V2 fields`);
      }
      declarationOf(entry, name);
      await writeText(
        io,
        ref,
        edit(
          ref.file,
          () => editJson(text, [...SERVERS, name, "disabled"], !enabled)
        )
      );
    },
    async locate(io, place, name) {
      const ref = fileOf2(place);
      const text = await io.files.read(ref);
      if (text === null) return null;
      return jsonValueLines(text, [...SERVERS, name]);
    }
  };
  function refuseLegacyTarget(file, servers, name) {
    const entry = servers?.[name];
    if (legacyEntry(entry)) {
      throw v2Only(file, `server ${name} carries pre-V2 fields`);
    }
  }
}
function localEntry(declaration) {
  return {
    type: "local",
    command: [declaration.command, ...declaration.args],
    ...Object.keys(declaration.env).length === 0 ? {} : { environment: { ...declaration.env } }
  };
}
function remoteEntry(declaration) {
  return {
    type: "remote",
    url: declaration.url,
    ...Object.keys(declaration.headers).length === 0 ? {} : { headers: { ...declaration.headers } }
  };
}
function optional(values) {
  return Object.keys(values).length === 0 ? void 0 : { ...values };
}
function legacyEntry(entry) {
  if (!isObject(entry)) return false;
  if (entry.type === "sse") return true;
  if ("enabled" in entry) return true;
  if (typeof entry.timeout === "number") return true;
  if (LEGACY_OAUTH.some((key) => key in entry)) return true;
  const oauth = entry.oauth;
  return isObject(oauth) && LEGACY_OAUTH.some((key) => key in oauth);
}
function isV2Entry(entry) {
  if (entry.type === "local") {
    const argv = entry.command;
    return Array.isArray(argv) && argv.length > 0 && argv.every((item) => typeof item === "string" && item !== "");
  }
  return entry.type === "remote" && typeof entry.url === "string" && entry.url !== "";
}
function looksLikeServer(value) {
  if (!isObject(value)) return false;
  return ["type", "command", "url", "enabled", "environment", "headers"].some(
    (key) => key in value
  );
}
function fieldOf(entry, field) {
  return isObject(entry) ? entry[field] : void 0;
}
function stringsOf(value) {
  if (!isObject(value)) return {};
  const pairs = Object.entries(value).filter(
    (pair) => typeof pair[1] === "string"
  );
  return Object.fromEntries(pairs);
}
function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

// src/prompts.ts
function formsOf(instructions) {
  const forms = [
    {
      id: "commands",
      labelKey: "prompts.menu.commands",
      removeLabelKey: "prompts.menu.commands.remove"
    },
    {
      id: "agent",
      labelKey: "prompts.menu.agent",
      removeLabelKey: "prompts.menu.agent.remove"
    }
  ];
  if (instructions) {
    forms.push({
      id: "instructions",
      labelKey: "opencode.menu.instructions",
      removeLabelKey: "opencode.menu.instructions.remove"
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
function scalar(value) {
  return JSON.stringify(value.replace(/\s+/g, " ").trim());
}
function fileOf(tools, prompt, slug, agent) {
  const description = prompt.description.trim() || tools.describeBody(prompt.prompt) || prompt.name;
  const body = tools.commandFile({
    name: prompt.name,
    description,
    body: prompt.prompt,
    frontmatter: false
  });
  const lines = [`description: ${scalar(description)}`];
  if (agent) lines.push("mode: subagent");
  return `---
${lines.join("\n")}
---

${markerOf(slug)}
${body}`;
}
function targetOf(tools, place, prompt, form, option) {
  const declared = place.forms.find((one) => one.id === form);
  const offered = declared !== void 0 && (declared.options === void 0 || declared.options.length === 0 ? option === void 0 : option !== void 0 && declared.options.some((one) => one.id === option));
  if (!offered) {
    throw new tools.PromptError("opencode.error.unknownForm", {
      form: option === void 0 ? form : `${form}:${option}`
    });
  }
  const workspace = place.scope === "workspace";
  const slug = `${tools.slugOf(prompt.name)}.md`;
  if (form === "commands") {
    const dir = workspace ? OPENCODE_COMMAND_DIR : OPENCODE_GLOBAL_COMMAND_DIR;
    return { scope: place.scope, file: `${dir}/${slug}` };
  }
  if (form === "agent") {
    const dir = workspace ? OPENCODE_AGENT_DIR : OPENCODE_GLOBAL_AGENT_DIR;
    return { scope: place.scope, file: `${dir}/${slug}` };
  }
  if (form === "instructions") {
    return { scope: place.scope, file: OPENCODE_GLOBAL_INSTRUCTION_FILE };
  }
  throw new tools.PromptError("opencode.error.unknownForm", {
    form: option === void 0 ? form : `${form}:${option}`
  });
}
function refused(tools, ref, failure) {
  const message = failure instanceof Error ? failure.message : String(failure);
  return new tools.PromptError("opencode.error.refused", { file: ref.file }, message);
}
function createOpenCodePrompts(icon, tools) {
  const places = [
    {
      id: "opencode-global",
      agent: OPENCODE_ID,
      labelKey: "opencode.tab",
      icon,
      scope: "global",
      where: "~/.config/opencode",
      forms: formsOf(true)
    },
    {
      id: "opencode",
      agent: OPENCODE_ID,
      labelKey: "opencode.tab",
      icon,
      scope: "workspace",
      where: ".opencode",
      forms: formsOf(false)
    }
  ];
  const placeOf = (id) => {
    const found = places.find((one) => one.id === id);
    if (found === void 0) {
      throw new tools.PromptError("opencode.error.unknownPlace", { place: id });
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
    id: OPENCODE_ID,
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
          throw new tools.PromptError("opencode.error.sectionBroken", {
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
        throw new tools.PromptError("opencode.error.handwritten", { file: ref.file });
      }
      await write(io, ref, fileOf(tools, prompt, slug, form === "agent"));
    },
    async remove(io, place, prompt, form, option) {
      const one = placeOf(place);
      const ref = targetOf(tools, one, prompt, form, option);
      const slug = tools.slugOf(prompt.name);
      if (form === "instructions") {
        const existing2 = await read(io, ref);
        if (existing2 === null) return false;
        if (brokenSection(existing2, slug)) {
          throw new tools.PromptError("opencode.error.sectionBroken", {
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
var OpenCodeIcon = ({ className, "aria-hidden": ariaHidden }) => /* @__PURE__ */ jsx(
  "img",
  {
    src: "/hub/extensions/opencode/assets/icon.svg",
    className,
    "aria-hidden": ariaHidden,
    alt: ariaHidden === true ? "" : "OpenCode"
  }
);
function skillPlaces(icon) {
  return [
    {
      id: "opencode",
      labelKey: "opencode.tab",
      icon,
      scope: "workspace",
      dir: OPENCODE_SKILL_DIR
    },
    {
      id: "opencode-global",
      labelKey: "opencode.tab",
      icon,
      scope: "global",
      dir: OPENCODE_GLOBAL_SKILL_DIR
    }
  ];
}
function apply(ctx) {
  const icon = OpenCodeIcon;
  ctx.skills.register({ id: OPENCODE_ID, places: skillPlaces(icon) });
  ctx.mcp.register(createOpenCodeMcp(ctx.mcp.tools));
  ctx.prompts.register(createOpenCodePrompts(icon, ctx.prompts.tools));
  ctx.targets.register({
    id: OPENCODE_ID,
    displayName: "OpenCode",
    icon,
    supports: [...SUPPORTS],
    locations: [...GLOBAL_LOCATIONS, ...PROJECT_LOCATIONS],
    format: "Markdown skills, commands and agents; JSONC or JSON configuration and MCP servers; AGENTS.md instructions"
  });
  ctx.locales.register({
    id: "en",
    label: "English",
    messages: openCodeMessages
  });
  ctx.locales.register({
    id: "zh-CN",
    label: "\u7B80\u4F53\u4E2D\u6587",
    messages: openCodeZhMessages
  });
}
export {
  apply
};
