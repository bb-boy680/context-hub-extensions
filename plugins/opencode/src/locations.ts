/**
 * The facts this integration is built on: what OpenCode reads, where, and
 * which of those places Context Hub delivers into.
 *
 * OpenCode V2 (verified baseline v2.2.5) keeps its global configuration under
 * `~/.config/opencode` on every platform, including Windows — not under
 * `%APPDATA%`. A project keeps its own `.opencode` directory beside
 * `opencode.json(c)` at the folder root. The shared `.agents/skills` directory
 * is the Hub skills module's own place, and `.claude/skills` belongs to the
 * Claude Code extension; neither is registered again here.
 *
 * Only the default global root is covered. `XDG_CONFIG_HOME` and
 * `OPENCODE_CONFIG_DIR` overrides are outside the hub's place contract and are
 * handled by the user outside the hub.
 */

/** This integration's id; the kernel matches it against the manifest. */
export const OPENCODE_ID = "hub.target.opencode"

/** The skills directory OpenCode reads inside a project. */
export const OPENCODE_SKILL_DIR = ".opencode/skills"

/** The skills directory OpenCode reads outside every project. */
export const OPENCODE_GLOBAL_SKILL_DIR = ".config/opencode/skills"

/** A project's OpenCode configuration directory. */
export const OPENCODE_CONFIG_DIR = ".opencode"

/** The machine-wide OpenCode configuration directory. */
export const OPENCODE_GLOBAL_CONFIG_DIR = ".config/opencode"

/** A project's command files; the file name is the command id. */
export const OPENCODE_COMMAND_DIR = `${OPENCODE_CONFIG_DIR}/commands`

/** A project's agent files; the file name is the agent id. */
export const OPENCODE_AGENT_DIR = `${OPENCODE_CONFIG_DIR}/agents`

/** The machine-wide command files. */
export const OPENCODE_GLOBAL_COMMAND_DIR = `${OPENCODE_GLOBAL_CONFIG_DIR}/commands`

/** The machine-wide agent files. */
export const OPENCODE_GLOBAL_AGENT_DIR = `${OPENCODE_GLOBAL_CONFIG_DIR}/agents`

/** The machine-wide instruction file; the project entry is the hub's shared `AGENTS.md`. */
export const OPENCODE_GLOBAL_INSTRUCTION_FILE = `${OPENCODE_GLOBAL_CONFIG_DIR}/AGENTS.md`

/** One place OpenCode keeps MCP servers in. */
export interface OpenCodeMcpPlace {
  id: string
  label: string
  scope: "global" | "workspace"
  file: string
  installable?: boolean
}

/**
 * The six physical files OpenCode V2 reads MCP servers from.
 *
 * Each row is one file, because the hub's raw-text pane and line locator read
 * the exact place a switch writes. The labels name the file so a row says which
 * one it changes; they do not say which file OpenCode finally applies.
 */
export const OPENCODE_MCP_PLACES: readonly OpenCodeMcpPlace[] = [
  {
    id: "opencode-global-jsonc",
    label: "OpenCode · opencode.jsonc",
    scope: "global",
    file: ".config/opencode/opencode.jsonc",
    installable: false,
  },
  {
    id: "opencode-global-json",
    label: "OpenCode · opencode.json",
    scope: "global",
    file: ".config/opencode/opencode.json",
    installable: true,
  },
  {
    id: "opencode-workspace-jsonc",
    label: "OpenCode · opencode.jsonc",
    scope: "workspace",
    file: "opencode.jsonc",
    installable: false,
  },
  {
    id: "opencode-workspace-json",
    label: "OpenCode · opencode.json",
    scope: "workspace",
    file: "opencode.json",
    installable: true,
  },
  {
    id: "opencode-dotdir-jsonc",
    label: "OpenCode · .opencode/opencode.jsonc",
    scope: "workspace",
    file: ".opencode/opencode.jsonc",
    installable: false,
  },
  {
    id: "opencode-dotdir-json",
    label: "OpenCode · .opencode/opencode.json",
    scope: "workspace",
    file: ".opencode/opencode.json",
    installable: false,
  },
]

/** One place either scope reads assets from. */
export interface OpenCodeLocation {
  /** What the path holds, e.g. "Skills". */
  label: string
  /** The path as a person reads it. */
  path: string
}

/** What OpenCode reads outside any project. */
export const GLOBAL_LOCATIONS: OpenCodeLocation[] = [
  { label: "Skills", path: `~/${OPENCODE_GLOBAL_SKILL_DIR}/<name>/SKILL.md` },
  { label: "Commands", path: `~/${OPENCODE_GLOBAL_COMMAND_DIR}/<slug>.md` },
  { label: "Agents", path: `~/${OPENCODE_GLOBAL_AGENT_DIR}/<slug>.md` },
  { label: "Instructions", path: `~/${OPENCODE_GLOBAL_INSTRUCTION_FILE}` },
  { label: "Config", path: `~/${OPENCODE_GLOBAL_CONFIG_DIR}/opencode.jsonc` },
]

/** What OpenCode reads inside a project folder. */
export const PROJECT_LOCATIONS: OpenCodeLocation[] = [
  { label: "Project skills", path: `${OPENCODE_SKILL_DIR}/<name>/SKILL.md` },
  { label: "Commands", path: `${OPENCODE_COMMAND_DIR}/<slug>.md` },
  { label: "Agents", path: `${OPENCODE_AGENT_DIR}/<slug>.md` },
  { label: "Instructions", path: "AGENTS.md" },
  { label: "Config", path: "opencode.jsonc" },
]

/** The asset kinds OpenCode accepts, in the order a panel lists them. */
export const SUPPORTS = ["skill", "mcp", "memory", "agent"] as const
