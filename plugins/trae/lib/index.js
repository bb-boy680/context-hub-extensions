// src/locations.ts
var IDE_ID = "hub.target.trae-ide";
var CLI_ID = "hub.target.trae-cli";
var IDE_PROJECT_SKILLS = ".trae/skills";
var IDE_GLOBAL_SKILLS = ".trae-cn/skills";
var IDE_MCP = ".trae/mcp.json";
var IDE_RULES = ".trae/rules";
var CLI_MCP = ".trae/traecli.toml";

// src/cli-provider.ts
var PLACE = "trae-cli-mcp-global";
var FILE = { scope: "global", file: CLI_MCP };
var TABLE = "mcp_servers";
var UNSUPPORTED = [
  "env",
  "url",
  "headers",
  "type",
  "transport",
  "oauth",
  "auth",
  "authorization",
  "bearer_token_env_var",
  "bearer_token",
  "auth_token",
  "api_key"
];
function object(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function strings(value) {
  return object(value) && Object.values(value).every((item) => typeof item === "string");
}
function declarationOf(entry) {
  if (!object(entry) || UNSUPPORTED.some((key) => key in entry)) return null;
  if (typeof entry.command !== "string" || entry.command === "") return null;
  if (entry.args !== void 0 && (!Array.isArray(entry.args) || !entry.args.every((arg) => typeof arg === "string"))) return null;
  return { transport: "stdio", command: entry.command, args: entry.args ?? [], env: {} };
}
function createTraeCliMcp(tools) {
  const { McpError } = tools;
  const assertPlace = (place) => {
    if (place !== PLACE) throw new McpError("trae.error.unknownPlace", { place });
  };
  const tableOf = (text) => {
    let document;
    try {
      document = tools.parseToml(text);
    } catch (error) {
      throw new McpError("trae.error.parse", { file: CLI_MCP }, String(error));
    }
    const table = document[TABLE];
    if (table === void 0) return {};
    if (!object(table)) throw new McpError("trae.error.invalid", { file: CLI_MCP });
    return table;
  };
  const editable = (entry, name) => {
    if (entry === void 0) return {};
    if (!object(entry) || declarationOf(entry) === null) throw new McpError("trae.error.invalidEntry", { name });
    const values = {};
    for (const [key, value] of Object.entries(entry)) {
      if (typeof value === "string" || typeof value === "boolean" || Array.isArray(value) && value.every((item) => typeof item === "string") || strings(value)) {
        values[key] = value;
      } else throw new McpError("trae.error.invalidEntry", { name });
    }
    return values;
  };
  return {
    id: CLI_ID,
    places: [{ id: PLACE, label: "TRAE CLI 2.0", switchable: false, ...FILE }],
    async read(io, place) {
      assertPlace(place);
      const table = tableOf(await io.files.read(FILE) ?? "");
      return Object.entries(table).map(([name, entry]) => {
        if (!object(entry)) throw new McpError("trae.error.invalidEntry", { name });
        return { name, declaration: declarationOf(entry), enabled: true };
      });
    },
    async install(io, place, name, declaration) {
      assertPlace(place);
      if (declaration.transport !== "stdio") throw new McpError("trae.error.stdioOnly");
      if (Object.keys(declaration.env).length) throw new McpError("trae.error.env");
      if (!declaration.command) throw new McpError("trae.error.command");
      const text = await io.files.read(FILE) ?? "";
      const values = editable(tableOf(text)[name], name);
      values.command = declaration.command;
      if (declaration.args.length) values.args = declaration.args;
      else delete values.args;
      let next;
      try {
        next = tools.setTomlEntry(text, TABLE, name, values);
      } catch (error) {
        throw new McpError("trae.error.refused", { file: CLI_MCP }, String(error));
      }
      if (next !== text) await io.files.write(FILE, next);
    },
    async uninstall(io, place, name) {
      assertPlace(place);
      const text = await io.files.read(FILE) ?? "";
      const entry = tableOf(text)[name];
      if (entry === void 0) return;
      editable(entry, name);
      let next;
      try {
        next = tools.clearTomlEntry(text, TABLE, name);
      } catch (error) {
        throw new McpError("trae.error.refused", { file: CLI_MCP }, String(error));
      }
      if (next !== text) await io.files.write(FILE, next);
    },
    async locate(io, place, name) {
      assertPlace(place);
      const text = await io.files.read(FILE);
      if (text === null) return null;
      tableOf(text);
      return tools.tomlEntryLines(text, TABLE, name);
    }
  };
}

// src/prompts.ts
var PLACE2 = "trae-ide-rules";
var FORM = "rule";
function owned(text, slug) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return false;
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  return end > 0 && lines.slice(end + 1).find((line) => line.trim() !== "") === `<!-- context-hub:${slug} -->`;
}
function createTraeIdePrompts(icon, tools) {
  const refOf = (place, prompt, form = FORM, option) => {
    if (place !== PLACE2) throw new tools.PromptError("trae.error.unknownPlace", { place });
    if (form !== FORM || option !== void 0) throw new tools.PromptError("trae.error.unknownForm", { form });
    if (/[\\/]/.test(prompt.name) || /^\.*$/.test(prompt.name.trim()) || /^[a-z]:/i.test(prompt.name)) {
      throw new tools.PromptError("trae.error.name", { name: prompt.name });
    }
    const slug = tools.slugOf(prompt.name);
    return { slug, ref: { scope: "workspace", file: `${IDE_RULES}/${slug}.md` } };
  };
  const fileOf = (prompt, slug) => {
    const description = prompt.description.trim() || tools.describeBody(prompt.prompt) || prompt.name;
    const scalar = JSON.stringify(description.replace(/\s+/g, " ").trim());
    const body = tools.commandFile({ name: prompt.name, description, body: prompt.prompt, frontmatter: false });
    return `---
alwaysApply: false
description: ${scalar}
---

<!-- context-hub:${slug} -->
${body}`;
  };
  return {
    id: IDE_ID,
    places: [{
      id: PLACE2,
      agent: IDE_ID,
      labelKey: "trae.ide",
      icon,
      scope: "workspace",
      where: IDE_RULES,
      forms: [{ id: FORM, labelKey: "prompts.menu.rule", removeLabelKey: "prompts.menu.rule.remove" }]
    }],
    async held(io, place, prompt) {
      const { slug, ref } = refOf(place, prompt);
      const text = await io.files.read(ref);
      return text !== null && owned(text, slug) ? { rule: true } : {};
    },
    async install(io, place, prompt, form, option) {
      const { slug, ref } = refOf(place, prompt, form, option);
      const existing = await io.files.read(ref);
      if (existing !== null && !owned(existing, slug)) throw new tools.PromptError("trae.error.handwritten", { file: ref.file });
      const next = fileOf(prompt, slug);
      if (existing !== next) await io.files.write(ref, next);
    },
    async remove(io, place, prompt, form, option) {
      const { slug, ref } = refOf(place, prompt, form, option);
      const existing = await io.files.read(ref);
      if (existing === null || !owned(existing, slug)) return false;
      await io.files.remove(ref);
      return true;
    }
  };
}

// src/provider.ts
var IDE_PLACE = "trae-ide-mcp";
var IDE_FILE = { scope: "workspace", file: IDE_MCP };
function object2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function strings2(value) {
  return object2(value) && Object.values(value).every((item) => typeof item === "string");
}
function declarationOf2(entry) {
  if (!object2(entry) || "command" in entry && "url" in entry || ["type", "transport", "oauth", "cwd", "enabled", "disabled", "autoApprove", "auth", "authorization", "bearer_token_env_var"].some((key) => key in entry)) return null;
  if (typeof entry.command === "string" && entry.command !== "" && !/\s/.test(entry.command) && (entry.args === void 0 || Array.isArray(entry.args) && entry.args.every((item) => typeof item === "string")) && (entry.env === void 0 || strings2(entry.env)) && !("headers" in entry)) {
    return { transport: "stdio", command: entry.command, args: entry.args ?? [], env: entry.env ?? {} };
  }
  if (typeof entry.url === "string" && entry.url !== "" && (entry.headers === void 0 || strings2(entry.headers)) && !("args" in entry) && !("env" in entry)) {
    return { transport: "http", url: entry.url, headers: entry.headers ?? {} };
  }
  return null;
}
function createTraeIdeMcp(tools) {
  const { McpError } = tools;
  const assertPlace = (place) => {
    if (place !== IDE_PLACE) throw new McpError("trae.error.unknownPlace", { place });
  };
  const serversOf = (text) => {
    let document;
    try {
      document = tools.readJsonObject(text);
    } catch (error) {
      throw new McpError("trae.error.parse", { file: IDE_MCP }, String(error));
    }
    const servers = document?.mcpServers;
    if (servers === void 0) return {};
    if (!object2(servers)) throw new McpError("trae.error.invalid", { file: IDE_MCP });
    return servers;
  };
  const targetOf = (servers, name) => {
    const entry = servers[name];
    if (entry === void 0) return void 0;
    if (!object2(entry) || declarationOf2(entry) === null) {
      throw new McpError("trae.error.invalidEntry", { name });
    }
    return entry;
  };
  const edit = (text, path, value) => {
    try {
      return tools.editJson(text, path, value);
    } catch (error) {
      throw new McpError("trae.error.refused", { file: IDE_MCP }, String(error));
    }
  };
  return {
    id: IDE_ID,
    places: [{ id: IDE_PLACE, label: "Trae IDE (CN)", switchable: false, ...IDE_FILE }],
    async read(io, place) {
      assertPlace(place);
      const servers = serversOf(await io.files.read(IDE_FILE));
      return Object.entries(servers).map(([name, entry]) => {
        const declaration = declarationOf2(entry);
        if (declaration === null) throw new McpError("trae.error.invalidEntry", { name });
        return { name, declaration, enabled: true };
      });
    },
    async install(io, place, name, declaration) {
      assertPlace(place);
      if (declaration.transport === "sse") throw new McpError("trae.error.sse");
      if (declaration.transport === "stdio" && (declaration.command === "" || /\s/.test(declaration.command))) {
        throw new McpError("trae.error.command");
      }
      if (declaration.transport === "http" && declaration.url === "") throw new McpError("trae.error.invalidEntry", { name });
      const text = await io.files.read(IDE_FILE);
      const existing = targetOf(serversOf(text), name);
      const path = ["mcpServers", name];
      const values = declaration.transport === "stdio" ? { command: declaration.command, args: declaration.args.length ? declaration.args : void 0, env: Object.keys(declaration.env).length ? declaration.env : void 0, url: void 0, headers: void 0 } : { url: declaration.url, headers: Object.keys(declaration.headers).length ? declaration.headers : void 0, command: void 0, args: void 0, env: void 0 };
      let next = text;
      if (existing === void 0) {
        next = edit(next, path, Object.fromEntries(Object.entries(values).filter(([, value]) => value !== void 0)));
      } else {
        for (const [key, value] of Object.entries(values)) next = edit(next, [...path, key], value);
      }
      if (next !== null && next !== text) await io.files.write(IDE_FILE, next);
    },
    async uninstall(io, place, name) {
      assertPlace(place);
      const text = await io.files.read(IDE_FILE);
      if (targetOf(serversOf(text), name) === void 0) return;
      await io.files.write(IDE_FILE, edit(text, ["mcpServers", name], void 0));
    },
    async locate(io, place, name) {
      assertPlace(place);
      const text = await io.files.read(IDE_FILE);
      serversOf(text);
      return text === null ? null : tools.jsonValueLines(text, ["mcpServers", name]);
    }
  };
}

// src/messages.ts
var messages = {
  "trae.ide": "Trae IDE (CN)",
  "trae.cli": "TRAE CLI 2.0",
  "trae.error.unknownPlace": "Unknown Trae location: {place}",
  "trae.error.unknownForm": "Unknown Trae form: {form}",
  "trae.error.parse": "Could not parse {file}.",
  "trae.error.invalid": "Invalid configuration in {file}.",
  "trae.error.invalidEntry": "Cannot safely change server {name}.",
  "trae.error.refused": "Could not safely update {file}.",
  "trae.error.sse": "Trae IDE MCP does not accept SSE delivery.",
  "trae.error.stdioOnly": "TRAE CLI MCP accepts stdio declarations only.",
  "trae.error.env": "TRAE CLI MCP environment variables are not confirmed.",
  "trae.error.command": "The MCP command is invalid.",
  "trae.error.name": "The rule name is not safe: {name}",
  "trae.error.handwritten": "The rule already exists and is not owned by Context Hub: {file}"
};
var zhMessages = {
  "trae.ide": "Trae IDE\uFF08\u4E2D\u56FD\u7248\uFF09",
  "trae.cli": "TRAE CLI 2.0",
  "trae.error.unknownPlace": "\u672A\u77E5\u7684 Trae \u4F4D\u7F6E\uFF1A{place}",
  "trae.error.unknownForm": "\u672A\u77E5\u7684 Trae \u8868\u5355\uFF1A{form}",
  "trae.error.parse": "\u65E0\u6CD5\u89E3\u6790 {file}\u3002",
  "trae.error.invalid": "{file} \u4E2D\u7684\u914D\u7F6E\u7ED3\u6784\u65E0\u6548\u3002",
  "trae.error.invalidEntry": "\u65E0\u6CD5\u5B89\u5168\u4FEE\u6539\u670D\u52A1\u5668 {name}\u3002",
  "trae.error.refused": "\u65E0\u6CD5\u5B89\u5168\u66F4\u65B0 {file}\u3002",
  "trae.error.sse": "Trae IDE MCP \u4E0D\u63A5\u53D7 SSE \u4EA4\u4ED8\u3002",
  "trae.error.stdioOnly": "TRAE CLI MCP \u53EA\u63A5\u53D7 stdio \u58F0\u660E\u3002",
  "trae.error.env": "\u5C1A\u672A\u786E\u8BA4 TRAE CLI MCP \u7684\u73AF\u5883\u53D8\u91CF\u914D\u7F6E\u3002",
  "trae.error.command": "MCP \u547D\u4EE4\u65E0\u6548\u3002",
  "trae.error.name": "\u89C4\u5219\u540D\u79F0\u4E0D\u5B89\u5168\uFF1A{name}",
  "trae.error.handwritten": "\u89C4\u5219\u6587\u4EF6\u5DF2\u5B58\u5728\u4E14\u4E0D\u5C5E\u4E8E Context Hub\uFF1A{file}"
};

// src/index.tsx
import { jsx } from "react/jsx-runtime";
var TraeIcon = ({ className, "aria-hidden": ariaHidden }) => /* @__PURE__ */ jsx("img", { src: "/hub/extensions/trae/assets/icon.png", className, "aria-hidden": ariaHidden, alt: "" });
function apply(ctx) {
  ctx.skills.register({ id: IDE_ID, places: [
    { id: "trae-ide-skills", labelKey: "trae.ide", icon: TraeIcon, scope: "workspace", dir: IDE_PROJECT_SKILLS },
    { id: "trae-ide-skills-global", labelKey: "trae.ide", icon: TraeIcon, scope: "global", dir: IDE_GLOBAL_SKILLS }
  ] });
  ctx.skills.register({ id: CLI_ID, places: [] });
  ctx.mcp.register(createTraeIdeMcp(ctx.mcp.tools));
  ctx.mcp.register(createTraeCliMcp(ctx.mcp.tools));
  ctx.prompts.register(createTraeIdePrompts(TraeIcon, ctx.prompts.tools));
  ctx.targets.register({
    id: IDE_ID,
    displayName: "Trae IDE (CN)",
    icon: TraeIcon,
    supports: ["skill", "mcp", "memory"],
    locations: [
      { label: "Project skills", path: `${IDE_PROJECT_SKILLS}/<name>/SKILL.md` },
      { label: "Skills", path: `~/${IDE_GLOBAL_SKILLS}/<name>/SKILL.md` },
      { label: "Project MCP", path: IDE_MCP },
      { label: "Project rules", path: `${IDE_RULES}/<name>.md` }
    ],
    format: "Markdown and JSONC"
  });
  ctx.targets.register({
    id: CLI_ID,
    displayName: "TRAE CLI 2.0",
    icon: TraeIcon,
    supports: ["mcp"],
    locations: [{ label: "MCP", path: `~/${CLI_MCP}` }],
    format: "TOML"
  });
  ctx.locales.register({ id: "en", label: "English", messages });
  ctx.locales.register({ id: "zh-CN", label: "\u7B80\u4F53\u4E2D\u6587", messages: zhMessages });
}
export {
  apply
};
