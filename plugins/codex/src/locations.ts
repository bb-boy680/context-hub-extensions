/**
 * The facts this integration is built on: what Codex reads, where, and which
 * of those places Context Hub delivers into.
 *
 * Codex keeps one user directory under `~/.codex` and one project directory
 * named `.codex` per folder. The shared `.agents/skills` directory is the Hub
 * skills module's own place, so it is deliberately not registered again here.
 */

/** This integration's id; the kernel matches it against the manifest. */
export const CODEX_ID = "hub.target.codex"

/**
 * The skills directory Codex reads, relative to the workspace and to the home
 * directory alike: `.codex/skills` under a project, `~/.codex/skills` outside
 * one. The user-level path is Codex's older location but is still read.
 */
export const CODEX_SKILL_DIR = ".codex/skills"

/** The user-level configuration file; its `[mcp_servers]` table holds MCP servers. */
export const CODEX_CONFIG_FILE = ".codex/config.toml"

/** The user-level instructions file Codex reads; `AGENTS.override.md` wins when present. */
export const CODEX_GLOBAL_INSTRUCTION_FILE = ".codex/AGENTS.md"

/**
 * The user-level override Codex reads in place of `AGENTS.md`.
 *
 * A non-empty file here wins outright, so a prompt added to `AGENTS.md` would
 * never be read. The provider checks it before writing and refuses rather than
 * reporting a delivery that Codex ignores.
 */
export const CODEX_GLOBAL_OVERRIDE_FILE = ".codex/AGENTS.override.md"

/**
 * Where Codex discovers agent roles, under both roots: one TOML file per role,
 * found recursively. `name`, `description` and `developer_instructions` are the
 * fields a generated role carries.
 */
export const CODEX_AGENT_DIR = ".codex/agents"

/** One place either scope reads assets from. */
export interface CodexLocation {
  /** What the path holds, e.g. "Skills". */
  label: string
  /** The path as a person reads it. */
  path: string
}

/** What Codex reads outside any project. */
export const GLOBAL_LOCATIONS: CodexLocation[] = [
  { label: "Skills", path: `~/${CODEX_SKILL_DIR}/<name>/SKILL.md` },
  { label: "Instructions", path: `~/${CODEX_GLOBAL_INSTRUCTION_FILE}` },
  { label: "Agents", path: `~/${CODEX_AGENT_DIR}/<name>.toml` },
  { label: "Config", path: `~/${CODEX_CONFIG_FILE}` },
]

/** What Codex reads inside a project folder. */
export const PROJECT_LOCATIONS: CodexLocation[] = [
  { label: "Project skills", path: `${CODEX_SKILL_DIR}/<name>/SKILL.md` },
  { label: "Instructions", path: "AGENTS.md" },
  { label: "Agents", path: `${CODEX_AGENT_DIR}/<name>.toml` },
]

/** The asset kinds Codex accepts, in the order a panel lists them. */
export const SUPPORTS = ["skill", "mcp", "memory", "agent"] as const
