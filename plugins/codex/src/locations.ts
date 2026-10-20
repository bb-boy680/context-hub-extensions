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
  { label: "Config", path: `~/${CODEX_CONFIG_FILE}` },
]

/** What Codex reads inside a project folder. */
export const PROJECT_LOCATIONS: CodexLocation[] = [
  { label: "Project skills", path: `${CODEX_SKILL_DIR}/<name>/SKILL.md` },
  { label: "Instructions", path: "AGENTS.md" },
]

/** The asset kinds Codex accepts, in the order a panel lists them. */
export const SUPPORTS = ["skill", "mcp", "memory"] as const
