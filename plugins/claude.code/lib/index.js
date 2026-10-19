// src/locations.ts
var CLAUDE_CODE_ID = "hub.target.claude-code";
var CLAUDE_CODE_SKILL_DIR = ".claude/skills";
var CLAUDE_CODE_MCP_FILE = ".mcp.json";
var CLAUDE_CODE_GLOBAL_MCP_FILE = ".claude.json";
var CLAUDE_CODE_MCP_KEY = "mcpServers";
var CLAUDE_CODE_DISABLED_KEY = "disabledMcpServers";
var CLAUDE_CODE_SETTINGS_FILE = ".claude/settings.json";
var CLAUDE_CODE_ENABLED_KEY = "enabledPlugins";
var CLAUDE_CODE_COMMAND_DIR = ".claude/commands";
var CLAUDE_CODE_RULE_DIR = ".claude/rules";
var CLAUDE_CODE_AGENT_DIR = ".claude/agents";
var CLAUDE_CODE_GLOBAL_INSTRUCTION_FILE = ".claude/CLAUDE.md";
var GLOBAL_LOCATIONS = [
  { label: "Skills", path: "~/.claude/skills/<name>/SKILL.md" },
  { label: "Commands", path: "~/.claude/commands/<name>.md" },
  { label: "Rules", path: "~/.claude/rules/<name>.md" },
  { label: "Memory", path: "~/.claude/CLAUDE.md" },
  { label: "MCP servers", path: "~/.claude.json" },
  { label: "Hooks", path: "~/.claude/settings.json" }
];
var PROJECT_LOCATIONS = [
  { label: "Skills", path: ".claude/skills/<name>/SKILL.md" },
  { label: "Commands", path: ".claude/commands/<name>.md" },
  { label: "Rules", path: ".claude/rules/<name>.md" },
  { label: "Memory", path: "CLAUDE.md" }
];
var SUPPORTS = ["skill", "mcp", "memory", "hook"];
function normalizeProjectPath(value) {
  return value.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

// src/installer.ts
var MARKETPLACE = "context-hub";
var PROGRAM = "claude";
var JSON_FLAG = "--json";
var LABEL = "Claude Code";
var PLACES = [
  {
    id: "claude-code-user",
    label: LABEL,
    scope: "global",
    scopeWord: "user",
    switchable: true,
    file: CLAUDE_CODE_SETTINGS_FILE
  },
  {
    id: "claude-code-project",
    label: LABEL,
    scope: "workspace",
    scopeWord: "project",
    switchable: true,
    file: CLAUDE_CODE_SETTINGS_FILE,
    /* The repository's file decides over the machine's, so a pack the machine
       switched on can still be switched off for one repository — which is why
       this place is offered for a pack only the machine holds. */
    overrides: ["user"]
  }
];
async function switchesAt(tools, place) {
  const files = tools.files;
  if (files === null || place.file === void 0) return {};
  const text = await files.read({ scope: place.scope, file: place.file }).catch(() => null);
  if (text === null) return {};
  try {
    const document = JSON.parse(text.replace(/^\uFEFF/, ""));
    const recorded = document[CLAUDE_CODE_ENABLED_KEY];
    if (typeof recorded !== "object" || recorded === null) return {};
    return Object.fromEntries(
      Object.entries(recorded).filter((entry) => {
        return typeof entry[1] === "boolean";
      })
    );
  } catch {
    return {};
  }
}
async function ensureMarketplace(tools) {
  await tools.syncMarketplace();
  const root = await tools.root();
  await tools.run(PROGRAM, ["plugin", "marketplace", "add", root, JSON_FLAG]);
  return root;
}
function reportOf(output) {
  try {
    const parsed = JSON.parse(output.trim().split("\n").at(-1) ?? "");
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}
function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value !== "") return value;
  }
  return void 0;
}
function readHeld(output, folder = null) {
  let parsed;
  try {
    parsed = JSON.parse(output);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const found = [];
  for (const value of parsed) {
    if (typeof value !== "object" || value === null) continue;
    const entry = value;
    if (typeof entry.id !== "string" || typeof entry.scope !== "string") continue;
    const at = entry.id.lastIndexOf("@");
    if (at <= 0 || at === entry.id.length - 1) continue;
    const project = firstString(entry.projectPath);
    if (folder !== null && project !== void 0 && normalizeProjectPath(project) !== normalizeProjectPath(folder)) {
      continue;
    }
    const path = firstString(entry.readFromFolder, entry.installPath);
    found.push({
      name: entry.id.slice(0, at),
      id: entry.id,
      version: typeof entry.version === "string" ? entry.version : "",
      scope: entry.scope,
      enabled: entry.enabled === true,
      marketplace: entry.id.slice(at + 1),
      ...path === void 0 ? {} : { source: { kind: "local", path } },
      pack: { name: "", version: "", description: "" }
    });
  }
  return found;
}
async function folderInUse(tools) {
  return await tools.files?.workspace().catch(() => null) ?? null;
}
async function withPacks(tools, packs) {
  return Promise.all(
    packs.map(
      async (pack) => pack.source === void 0 ? pack : { ...pack, pack: await tools.describe(pack.source.path, pack.name).catch(() => pack.pack) }
    )
  );
}
var claudeCodeInstaller = {
  id: CLAUDE_CODE_ID,
  label: LABEL,
  places: PLACES,
  available: (tools) => tools.has(PROGRAM),
  async held(tools) {
    return withPacks(
      tools,
      readHeld(await tools.run(PROGRAM, ["plugin", "list", JSON_FLAG]), await folderInUse(tools))
    );
  },
  async switches(tools) {
    const recorded = {};
    for (const place of PLACES) {
      recorded[place.scopeWord] = await switchesAt(tools, place);
    }
    return recorded;
  },
  async install(id, scope, tools) {
    await ensureMarketplace(tools);
    const report = reportOf(
      await tools.run(PROGRAM, [
        "plugin",
        "install",
        `${id}@${MARKETPLACE}`,
        "--scope",
        scope,
        JSON_FLAG,
        "-y"
      ])
    );
    return {
      message: `${id} installed for Claude Code at ${scope} scope`,
      location: report.installPath
    };
  },
  async remove(id, scope, tools) {
    await tools.run(PROGRAM, [
      "plugin",
      "uninstall",
      id,
      "--scope",
      scope,
      JSON_FLAG
    ]);
    return { message: `${id} removed from Claude Code at ${scope} scope` };
  },
  async setEnabled(id, scope, on, tools) {
    await tools.run(PROGRAM, [
      "plugin",
      on ? "enable" : "disable",
      id,
      "--scope",
      scope,
      JSON_FLAG
    ]);
    return { message: `${id} ${on ? "enabled" : "disabled"} for Claude Code at ${scope} scope` };
  }
};

// src/messages.ts
var claudeCodeMessages = {
  "claudeCode.tab": "Claude Code",
  "claudeCode.menu.instructions": "Add to CLAUDE.md",
  "claudeCode.menu.instructions.remove": "Remove from CLAUDE.md",
  "claudeCode.error.refused": "The hub could not read or write Claude Code's config files.",
  "claudeCode.error.unknownPlace": "Claude Code has no client file called {place}.",
  "claudeCode.error.noProject": "Claude Code has no record for this folder in {file}, so it has nowhere to keep the switch.",
  "claudeCode.error.noWorkspace": "No workspace is open, so there is no project to switch.",
  "claudeCode.error.machineScope": "Claude Code keeps the switch in a project's record, so a machine-wide place has none."
};

// src/provider.ts
var FILES = {
  workspace: { scope: "workspace", file: CLAUDE_CODE_MCP_FILE },
  global: { scope: "global", file: CLAUDE_CODE_GLOBAL_MCP_FILE }
};
var STATE = { scope: "global", file: CLAUDE_CODE_GLOBAL_MCP_FILE };
var PROJECTS = "projects";
function createClaudeCodeMcp(tools) {
  const {
    McpError,
    editJson,
    jsonValueLines,
    readDeclaration,
    readJsonObject,
    valueAt,
    writeDeclaration
  } = tools;
  const fileOf = (place) => {
    if (place === "claude-code-global") return FILES.global;
    if (place === "claude-code") return FILES.workspace;
    throw new McpError("claudeCode.error.unknownPlace", { place });
  };
  const read = async (io, place) => {
    try {
      return await io.files.read(place) ?? "";
    } catch (error) {
      throw new McpError("claudeCode.error.refused", void 0, messageOf(error));
    }
  };
  const write = async (io, place, text) => {
    try {
      await io.files.write(place, text);
    } catch (error) {
      throw new McpError("claudeCode.error.refused", void 0, messageOf(error));
    }
  };
  const disabledNames = async (io) => {
    const document = readJsonObject(await io.files.read(STATE));
    const key = await existingProjectKey(io, document);
    if (key === null) return [];
    const listed = valueAt(document, [PROJECTS, key, CLAUDE_CODE_DISABLED_KEY]);
    return Array.isArray(listed) ? listed.filter((item) => typeof item === "string") : [];
  };
  const existingProjectKey = async (io, document) => {
    const workspace = await io.files.workspace();
    if (workspace === null) return null;
    const projects = valueAt(document, [PROJECTS]);
    if (typeof projects !== "object" || projects === null) return null;
    const wanted = normalizeProjectPath(workspace);
    return Object.keys(projects).find((key) => normalizeProjectPath(key) === wanted) ?? null;
  };
  return {
    id: CLAUDE_CODE_ID,
    places: [
      /* Only a project's record holds the switch, so a server declared in the
         machine-wide file is one the hub may not switch off. */
      {
        id: "claude-code-global",
        label: "Claude Code",
        switchable: false,
        ...FILES.global
      },
      {
        id: "claude-code",
        label: "Claude Code",
        switchable: true,
        ...FILES.workspace
      }
    ],
    async read(io, place) {
      const text = await io.files.read(fileOf(place));
      const document = readJsonObject(text);
      const held = valueAt(document, [CLAUDE_CODE_MCP_KEY]);
      if (typeof held !== "object" || held === null) return [];
      const disabled = await disabledNames(io);
      return Object.entries(held).map(
        ([name, entry]) => ({
          name,
          declaration: readDeclaration(entry),
          /* A name no project has disabled is one Claude Code connects. */
          enabled: !disabled.includes(name)
        })
      );
    },
    async install(io, place, name, declaration) {
      const file = fileOf(place);
      const text = await read(io, file);
      const entry = {
        ...writeDeclaration(declaration)
      };
      if (declaration.transport !== "stdio") entry.type = declaration.transport;
      await write(io, file, editJson(text, [CLAUDE_CODE_MCP_KEY, name], entry));
    },
    async uninstall(io, place, name) {
      const file = fileOf(place);
      const text = await read(io, file);
      await write(io, file, editJson(text, [CLAUDE_CODE_MCP_KEY, name], void 0));
    },
    async setEnabled(io, place, scope, name, enabled) {
      fileOf(place);
      if (scope !== "workspace") throw new McpError("claudeCode.error.machineScope");
      const text = await read(io, STATE);
      const document = readJsonObject(text);
      const key = await existingProjectKey(io, document);
      if (key === null) {
        throw new McpError("claudeCode.error.noProject", {
          file: CLAUDE_CODE_GLOBAL_MCP_FILE
        });
      }
      const path = [PROJECTS, key, CLAUDE_CODE_DISABLED_KEY];
      const listed = valueAt(document, path);
      const names = Array.isArray(listed) ? listed.filter((item) => typeof item === "string") : [];
      const next = enabled ? names.filter((item) => item !== name) : [.../* @__PURE__ */ new Set([...names, name])];
      await write(
        io,
        STATE,
        editJson(text, path, next.length === 0 ? void 0 : next)
      );
    },
    async locate(io, place, name) {
      const text = await io.files.read(fileOf(place));
      return text === null ? null : jsonValueLines(text, [CLAUDE_CODE_MCP_KEY, name]);
    }
  };
}
function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

// src/index.tsx
import { jsx } from "react/jsx-runtime";
var ClaudeCodeIcon = ({ className, "aria-hidden": ariaHidden }) => /* @__PURE__ */ jsx("svg", { viewBox: "0 0 24 24", className, "aria-hidden": ariaHidden, children: /* @__PURE__ */ jsx(
  "path",
  {
    clipRule: "evenodd",
    fillRule: "evenodd",
    fill: "#D97757",
    d: "M20.998 10.949H24v3.102h-3v3.028h-1.487V20H18v-2.921h-1.487V20H15v-2.921H9V20H7.488v-2.921H6V20H4.487v-2.921H3V14.05H0V10.95h3V5h17.998v5.949zM6 10.949h1.488V8.102H6v2.847zm10.51 0H18V8.102h-1.49v2.847z"
  }
) });
function skillPlaces(icon) {
  return [
    {
      id: "claude-code",
      labelKey: "claudeCode.tab",
      icon,
      scope: "workspace",
      dir: CLAUDE_CODE_SKILL_DIR,
      order: 20
    },
    {
      id: "claude-code-global",
      labelKey: "claudeCode.tab",
      icon,
      scope: "global",
      dir: CLAUDE_CODE_SKILL_DIR,
      order: 20
    }
  ];
}
function promptPlaces(icon) {
  return [
    {
      id: "claude-code",
      agent: CLAUDE_CODE_ID,
      labelKey: "claudeCode.tab",
      icon,
      scope: "workspace",
      commandDir: CLAUDE_CODE_COMMAND_DIR,
      ruleDir: CLAUDE_CODE_RULE_DIR,
      agentDir: CLAUDE_CODE_AGENT_DIR,
      order: 20
    },
    {
      id: "claude-code-global",
      agent: CLAUDE_CODE_ID,
      labelKey: "claudeCode.tab",
      icon,
      scope: "global",
      commandDir: CLAUDE_CODE_COMMAND_DIR,
      ruleDir: CLAUDE_CODE_RULE_DIR,
      agentDir: CLAUDE_CODE_AGENT_DIR,
      documents: [
        {
          id: "claude",
          labelKey: "claudeCode.menu.instructions",
          removeLabelKey: "claudeCode.menu.instructions.remove",
          file: CLAUDE_CODE_GLOBAL_INSTRUCTION_FILE
        }
      ],
      order: 20
    }
  ];
}
function apply(ctx) {
  const icon = ClaudeCodeIcon;
  const skillPlacesHere = skillPlaces(icon);
  const promptPlacesHere = promptPlaces(icon);
  ctx.skills.register({ id: CLAUDE_CODE_ID, places: skillPlacesHere });
  ctx.prompts.register({ id: CLAUDE_CODE_ID, places: promptPlacesHere });
  ctx.mcp.register(createClaudeCodeMcp(ctx.mcp.tools));
  ctx.plugins.register(claudeCodeInstaller);
  ctx.targets.register({
    id: CLAUDE_CODE_ID,
    displayName: "Claude Code",
    icon,
    supports: [...SUPPORTS],
    locations: [...GLOBAL_LOCATIONS, ...PROJECT_LOCATIONS].map((location) => ({
      label: location.label,
      path: location.path
    })),
    format: "Markdown with YAML frontmatter; JSON for MCP servers and hooks"
  });
  ctx.locales.register({
    id: "en",
    label: "English",
    messages: claudeCodeMessages
  });
}
export {
  apply
};
