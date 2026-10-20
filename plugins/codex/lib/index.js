// src/index.tsx
import { useId } from "react";

// src/locations.ts
var CODEX_ID = "hub.target.codex";
var CODEX_SKILL_DIR = ".codex/skills";
var CODEX_CONFIG_FILE = ".codex/config.toml";
var CODEX_GLOBAL_INSTRUCTION_FILE = ".codex/AGENTS.md";
var CODEX_GLOBAL_OVERRIDE_FILE = ".codex/AGENTS.override.md";
var CODEX_AGENT_DIR = ".codex/agents";
var GLOBAL_LOCATIONS = [
  { label: "Skills", path: `~/${CODEX_SKILL_DIR}/<name>/SKILL.md` },
  { label: "Instructions", path: `~/${CODEX_GLOBAL_INSTRUCTION_FILE}` },
  { label: "Agents", path: `~/${CODEX_AGENT_DIR}/<name>.toml` },
  { label: "Config", path: `~/${CODEX_CONFIG_FILE}` }
];
var PROJECT_LOCATIONS = [
  { label: "Project skills", path: `${CODEX_SKILL_DIR}/<name>/SKILL.md` },
  { label: "Instructions", path: "AGENTS.md" },
  { label: "Agents", path: `${CODEX_AGENT_DIR}/<name>.toml` }
];
var SUPPORTS = ["skill", "mcp", "memory", "agent"];

// src/installer.ts
var MARKETPLACE = "context-hub";
var PROGRAM = "codex";
var JSON_FLAG = "--json";
var LABEL = "Codex";
async function ensureMarketplace(tools) {
  await tools.syncMarketplace();
  const root = await tools.root();
  await tools.run(PROGRAM, ["plugin", "marketplace", "add", root, JSON_FLAG]);
  return root;
}
function listed(output) {
  try {
    const parsed = JSON.parse(output);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}
function reportOf(output) {
  try {
    const parsed = JSON.parse(output.trim());
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}
function readHeld(output) {
  const { installed } = listed(output);
  if (!Array.isArray(installed)) return [];
  const found = [];
  for (const value of installed) {
    if (typeof value !== "object" || value === null) continue;
    const entry = value;
    if (typeof entry.name !== "string" || entry.name === "") continue;
    if (entry.installed === false) continue;
    const source = entry.source;
    const path = typeof source === "object" && source !== null ? source.path : void 0;
    found.push({
      name: entry.name,
      id: typeof entry.pluginId === "string" && entry.pluginId !== "" ? entry.pluginId : entry.name,
      version: typeof entry.version === "string" ? entry.version : "",
      scope: "user",
      enabled: entry.enabled !== false,
      marketplace: typeof entry.marketplaceName === "string" && entry.marketplaceName !== "" ? entry.marketplaceName : null,
      ...typeof path === "string" && path !== "" ? { source: { kind: "local", path } } : {},
      pack: { name: "", version: "", description: "" }
    });
  }
  return found;
}
async function withPacks(tools, packs) {
  return Promise.all(
    packs.map(
      async (pack) => pack.source === void 0 ? pack : { ...pack, pack: await tools.describe(pack.source.path, pack.name).catch(() => pack.pack) }
    )
  );
}
var codexInstaller = {
  id: CODEX_ID,
  label: LABEL,
  /* Codex installs a plugin for the machine, with no per-project variant, and
     keeps no switch for one — so its single place names no file and is not the
     hub's to move. */
  places: [
    {
      id: "codex-user",
      label: LABEL,
      scope: "global",
      scopeWord: "user",
      switchable: false
    }
  ],
  available: (tools) => tools.has(PROGRAM),
  async held(tools) {
    return withPacks(tools, readHeld(await tools.run(PROGRAM, ["plugin", "list", JSON_FLAG])));
  },
  async install(name, _scope, tools) {
    await ensureMarketplace(tools);
    const report = reportOf(
      await tools.run(PROGRAM, ["plugin", "add", `${name}@${MARKETPLACE}`, JSON_FLAG])
    );
    return {
      message: `${name} installed for Codex`,
      ...typeof report.installedPath === "string" && report.installedPath !== "" ? { location: report.installedPath } : {}
    };
  },
  async remove(id, _scope, tools) {
    await tools.run(PROGRAM, ["plugin", "remove", id, JSON_FLAG]);
    return { message: `${id} removed from Codex` };
  }
};

// src/messages.ts
var codexMessages = {
  "codex.tab": "Codex",
  "codex.menu.instructions": "Add to AGENTS.md",
  "codex.menu.instructions.remove": "Remove from AGENTS.md",
  "codex.error.parse": "Codex's config file is not TOML this hub can read.",
  "codex.error.refused": "The hub could not write {file}.",
  "codex.error.unknownPlace": "Codex has no client file called {place}.",
  "codex.error.unknownForm": "Codex has no prompt action called {form}.",
  "codex.error.override": "Codex reads {file} instead of AGENTS.md, so the section was not written.",
  "codex.error.agentExists": "{file} is an agent file this hub did not write, so it was left alone."
};
var codexZhMessages = {
  "codex.tab": "Codex",
  "codex.menu.instructions": "\u6DFB\u52A0\u5230 AGENTS.md",
  "codex.menu.instructions.remove": "\u4ECE AGENTS.md \u79FB\u9664",
  "codex.error.parse": "Codex \u7684\u914D\u7F6E\u6587\u4EF6\u4E0D\u662F\u53EF\u8BFB\u7684 TOML\u3002",
  "codex.error.refused": "\u65E0\u6CD5\u5199\u5165 {file}\u3002",
  "codex.error.unknownPlace": "Codex \u6CA1\u6709\u540D\u4E3A {place} \u7684\u5BA2\u6237\u7AEF\u6587\u4EF6\u3002",
  "codex.error.unknownForm": "Codex \u6CA1\u6709\u540D\u4E3A {form} \u7684\u63D0\u793A\u8BCD\u64CD\u4F5C\u3002",
  "codex.error.override": "Codex \u8BFB\u53D6\u7684\u662F {file}\uFF0C\u800C\u4E0D\u662F AGENTS.md\uFF0C\u6240\u4EE5\u8FD9\u4E00\u6BB5\u6CA1\u6709\u5199\u5165\u3002",
  "codex.error.agentExists": "{file} \u4E0D\u662F\u8FD9\u4E2A hub \u5199\u5165\u7684 agent \u6587\u4EF6\uFF0C\u5DF2\u4FDD\u7559\u539F\u6837\u3002"
};

// src/provider.ts
var TABLE = "mcp_servers";
var ENABLED = "enabled";
var PLACE = "codex-global";
var FILE = { scope: "global", file: CODEX_CONFIG_FILE };
function createCodexMcp(tools) {
  const {
    McpError,
    clearTomlEntry,
    parseToml,
    readDeclaration,
    setTomlEntry,
    setTomlField,
    tomlEntryLines,
    writeDeclaration
  } = tools;
  const assertPlace = (place) => {
    if (place !== PLACE) throw new McpError("codex.error.unknownPlace", { place });
  };
  const readFile = async (io) => {
    try {
      return await io.files.read(FILE) ?? "";
    } catch (error) {
      throw new McpError("codex.error.refused", { file: FILE.file }, messageOf(error));
    }
  };
  const tableOf = (text) => {
    if (text.trim() === "") return {};
    let document;
    try {
      document = parseToml(text);
    } catch (error) {
      throw new McpError("codex.error.parse", void 0, messageOf(error));
    }
    const held = document[TABLE];
    if (typeof held !== "object" || held === null) return {};
    return held;
  };
  const edit = (change) => {
    try {
      return change();
    } catch (error) {
      throw new McpError("codex.error.refused", { file: FILE.file }, messageOf(error));
    }
  };
  return {
    id: CODEX_ID,
    places: [{ id: PLACE, label: "Codex", switchable: true, ...FILE }],
    async read(io, place) {
      assertPlace(place);
      const text = await readFile(io);
      return Object.entries(tableOf(text)).map(
        ([name, entry]) => ({
          name,
          declaration: readDeclaration(entry),
          /* An entry that names no `enabled` field is one Codex connects. */
          enabled: fieldOf(entry, ENABLED) !== false
        })
      );
    },
    async install(io, place, name, declaration) {
      assertPlace(place);
      const text = await readFile(io);
      const values = { ...writeDeclaration(declaration) };
      if (fieldOf(tableOf(text)[name], ENABLED) === false) values[ENABLED] = false;
      await io.files.write(FILE, edit(() => setTomlEntry(text, TABLE, name, values)));
    },
    async uninstall(io, place, name) {
      assertPlace(place);
      const text = await readFile(io);
      await io.files.write(FILE, edit(() => clearTomlEntry(text, TABLE, name)));
    },
    /* Codex records the state on the entry itself rather than under a root, so
       the scope the caller names does not change what is written. */
    async setEnabled(io, place, _scope, name, enabled) {
      assertPlace(place);
      const text = await readFile(io);
      await io.files.write(FILE, edit(() => setTomlField(text, TABLE, name, ENABLED, enabled)));
    },
    async locate(io, place, name) {
      assertPlace(place);
      const text = await io.files.read(FILE);
      return text === null ? null : tomlEntryLines(text, TABLE, name);
    }
  };
}
function fieldOf(entry, field) {
  if (typeof entry !== "object" || entry === null) return void 0;
  return entry[field];
}
function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

// src/prompts.ts
function formsOf(instructions) {
  const agent = {
    id: "agent",
    labelKey: "prompts.menu.agent",
    removeLabelKey: "prompts.menu.agent.remove"
  };
  return instructions ? [
    {
      id: "instructions",
      labelKey: "codex.menu.instructions",
      removeLabelKey: "codex.menu.instructions.remove"
    },
    agent
  ] : [agent];
}
function normalizeBody(text) {
  return text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").replace(/\s+$/, "");
}
function markerOf(slug) {
  return `# context-hub:${slug}`;
}
function targetOf(tools, place, prompt, form, option) {
  const declared = place.forms.find((one) => one.id === form);
  const offered = declared !== void 0 && (declared.options === void 0 || declared.options.length === 0 ? option === void 0 : option !== void 0 && declared.options.some((one) => one.id === option));
  if (!offered) {
    throw new tools.PromptError("codex.error.unknownForm", {
      form: option === void 0 ? form : `${form}:${option}`
    });
  }
  if (form === "instructions") {
    return { scope: place.scope, file: CODEX_GLOBAL_INSTRUCTION_FILE };
  }
  if (form === "agent") {
    return {
      scope: place.scope,
      file: `${CODEX_AGENT_DIR}/${tools.slugOf(prompt.name)}.toml`
    };
  }
  throw new tools.PromptError("codex.error.unknownForm", {
    form: option === void 0 ? form : `${form}:${option}`
  });
}
function refused(tools, ref, failure) {
  const message = failure instanceof Error ? failure.message : String(failure);
  return new tools.PromptError("codex.error.refused", { file: ref.file }, message);
}
function createCodexPrompts(promptTools, mcp, icon) {
  const places = [
    {
      id: "codex-global",
      agent: CODEX_ID,
      labelKey: "codex.tab",
      icon,
      scope: "global",
      order: 20,
      where: "~/.codex",
      forms: formsOf(true)
    },
    {
      id: "codex",
      agent: CODEX_ID,
      labelKey: "codex.tab",
      icon,
      scope: "workspace",
      order: 20,
      where: ".codex",
      forms: formsOf(false)
    }
  ];
  const placeOf = (id) => {
    const found = places.find((one) => one.id === id);
    if (found === void 0) {
      throw new promptTools.PromptError("codex.error.unknownPlace", { place: id });
    }
    return found;
  };
  const read = async (io, ref) => {
    try {
      return await io.files.read(ref);
    } catch (failure) {
      throw refused(promptTools, ref, failure);
    }
  };
  const write = async (io, ref, text) => {
    try {
      await io.files.write(ref, text);
    } catch (failure) {
      throw refused(promptTools, ref, failure);
    }
  };
  const removeFile = async (io, ref) => {
    try {
      await io.files.remove(ref);
    } catch (failure) {
      throw refused(promptTools, ref, failure);
    }
  };
  const instructionsHeld = async (io, place, prompt) => {
    const override = await read(io, {
      scope: place.scope,
      file: CODEX_GLOBAL_OVERRIDE_FILE
    });
    if (override !== null && override.trim() !== "") return false;
    const text = await read(io, { scope: place.scope, file: CODEX_GLOBAL_INSTRUCTION_FILE });
    if (text === null) return false;
    return promptTools.withoutSection(text, promptTools.slugOf(prompt.name)) !== null;
  };
  const agentHeld = async (io, place, prompt) => {
    const ref = targetOf(promptTools, place, prompt, "agent");
    const text = await read(io, ref);
    return text !== null && text.includes(markerOf(promptTools.slugOf(prompt.name)));
  };
  return {
    id: CODEX_ID,
    places,
    async held(io, place, prompt) {
      const one = placeOf(place);
      const answer = {};
      for (const form of one.forms) {
        if (form.id === "instructions") {
          if (await instructionsHeld(io, one, prompt)) answer.instructions = true;
        } else if (form.id === "agent") {
          if (await agentHeld(io, one, prompt)) answer.agent = true;
        }
      }
      return answer;
    },
    async install(io, place, prompt, form, option) {
      const one = placeOf(place);
      const ref = targetOf(promptTools, one, prompt, form, option);
      if (form === "instructions") {
        const override = await read(io, {
          scope: one.scope,
          file: CODEX_GLOBAL_OVERRIDE_FILE
        });
        if (override !== null && override.trim() !== "") {
          throw new promptTools.PromptError("codex.error.override", {
            file: CODEX_GLOBAL_OVERRIDE_FILE
          });
        }
        const existing2 = await read(io, ref);
        await write(
          io,
          ref,
          promptTools.withSection(existing2, {
            slug: promptTools.slugOf(prompt.name),
            title: prompt.name,
            body: prompt.prompt
          })
        );
        return;
      }
      const slug = promptTools.slugOf(prompt.name);
      const existing = await read(io, ref);
      if (existing !== null && !existing.includes(markerOf(slug))) {
        throw new promptTools.PromptError("codex.error.agentExists", { file: ref.file });
      }
      const description = prompt.description.trim() || promptTools.describeBody(prompt.prompt) || prompt.name;
      const text = [
        markerOf(slug),
        `name = ${mcp.writeTomlString(prompt.name)}`,
        `description = ${mcp.writeTomlString(description)}`,
        `developer_instructions = ${mcp.writeTomlString(normalizeBody(prompt.prompt))}`,
        ""
      ].join("\n");
      await write(io, ref, text);
    },
    async remove(io, place, prompt, form, option) {
      const one = placeOf(place);
      const ref = targetOf(promptTools, one, prompt, form, option);
      if (form === "instructions") {
        const existing2 = await read(io, ref);
        if (existing2 === null) return false;
        const next = promptTools.withoutSection(existing2, promptTools.slugOf(prompt.name));
        if (next === null) return false;
        if (next.trim() === "") await removeFile(io, ref);
        else await write(io, ref, next);
        return true;
      }
      const existing = await read(io, ref);
      if (existing === null) return false;
      if (!existing.includes(markerOf(promptTools.slugOf(prompt.name)))) return false;
      await removeFile(io, ref);
      return true;
    }
  };
}

// src/index.tsx
import { jsx, jsxs } from "react/jsx-runtime";
var CodexIcon = ({ className, "aria-hidden": ariaHidden }) => {
  const gradient = `codex-${useId().replace(/:/g, "")}`;
  return /* @__PURE__ */ jsxs("svg", { viewBox: "0 0 24 24", className, "aria-hidden": ariaHidden, children: [
    /* @__PURE__ */ jsx("title", { children: "Codex" }),
    /* @__PURE__ */ jsx(
      "path",
      {
        d: "M19.503 0H4.496A4.496 4.496 0 000 4.496v15.007A4.496 4.496 0 004.496 24h15.007A4.496 4.496 0 0024 19.503V4.496A4.496 4.496 0 0019.503 0z",
        fill: "#fff"
      }
    ),
    /* @__PURE__ */ jsx(
      "path",
      {
        d: "M9.064 3.344a4.578 4.578 0 012.285-.312c1 .115 1.891.54 2.673 1.275.01.01.024.017.037.021a.09.09 0 00.043 0 4.55 4.55 0 013.046.275l.047.022.116.057a4.581 4.581 0 012.188 2.399c.209.51.313 1.041.315 1.595a4.24 4.24 0 01-.134 1.223.123.123 0 00.03.115c.594.607.988 1.33 1.183 2.17.289 1.425-.007 2.71-.887 3.854l-.136.166a4.548 4.548 0 01-2.201 1.388.123.123 0 00-.081.076c-.191.551-.383 1.023-.74 1.494-.9 1.187-2.222 1.846-3.711 1.838-1.187-.006-2.239-.44-3.157-1.302a.107.107 0 00-.105-.024c-.388.125-.78.143-1.204.138a4.441 4.441 0 01-1.945-.466 4.544 4.544 0 01-1.61-1.335c-.152-.202-.303-.392-.414-.617a5.81 5.81 0 01-.37-.961 4.582 4.582 0 01-.014-2.298.124.124 0 00.006-.056.085.085 0 00-.027-.048 4.467 4.467 0 01-1.034-1.651 3.896 3.896 0 01-.251-1.192 5.189 5.189 0 01.141-1.6c.337-1.112.982-1.985 1.933-2.618.212-.141.413-.251.601-.33.215-.089.43-.164.646-.227a.098.098 0 00.065-.066 4.51 4.51 0 01.829-1.615 4.535 4.535 0 011.837-1.388zm3.482 10.565a.637.637 0 000 1.272h3.636a.637.637 0 100-1.272h-3.636zM8.462 9.23a.637.637 0 00-1.106.631l1.272 2.224-1.266 2.136a.636.636 0 101.095.649l1.454-2.455a.636.636 0 00.005-.64L8.462 9.23z",
        fill: `url(#${gradient})`
      }
    ),
    /* @__PURE__ */ jsx("defs", { children: /* @__PURE__ */ jsxs(
      "linearGradient",
      {
        gradientUnits: "userSpaceOnUse",
        id: gradient,
        x1: "12",
        x2: "12",
        y1: "3",
        y2: "21",
        children: [
          /* @__PURE__ */ jsx("stop", { stopColor: "#B1A7FF" }),
          /* @__PURE__ */ jsx("stop", { offset: ".5", stopColor: "#7A9DFF" }),
          /* @__PURE__ */ jsx("stop", { offset: "1", stopColor: "#3941FF" })
        ]
      }
    ) })
  ] });
};
function skillPlaces(icon) {
  return [
    {
      id: "codex",
      labelKey: "codex.tab",
      icon,
      scope: "workspace",
      dir: CODEX_SKILL_DIR,
      order: 20
    },
    {
      id: "codex-global",
      labelKey: "codex.tab",
      icon,
      scope: "global",
      dir: CODEX_SKILL_DIR,
      order: 20
    }
  ];
}
function apply(ctx) {
  const icon = CodexIcon;
  ctx.skills.register({ id: CODEX_ID, places: skillPlaces(icon) });
  ctx.prompts.register(createCodexPrompts(ctx.prompts.tools, ctx.mcp.tools, icon));
  ctx.mcp.register(createCodexMcp(ctx.mcp.tools));
  ctx.plugins.register(codexInstaller);
  ctx.targets.register({
    id: CODEX_ID,
    displayName: "Codex",
    icon,
    supports: [...SUPPORTS],
    locations: [...GLOBAL_LOCATIONS, ...PROJECT_LOCATIONS],
    format: "Markdown skills and instructions; TOML agents, configuration and MCP servers"
  });
  ctx.locales.register({
    id: "en",
    label: "English",
    messages: codexMessages
  });
  ctx.locales.register({
    id: "zh-CN",
    label: "\u7B80\u4F53\u4E2D\u6587",
    messages: codexZhMessages
  });
}
export {
  apply
};
