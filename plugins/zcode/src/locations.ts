export const ZCODE_ID = "hub.target.zcode"
export const ZCODE_SKILL_DIR = ".zcode/skills"
export const ZCODE_COMMAND_DIR = ".zcode/commands"
export const ZCODE_AGENT_DIR = ".zcode/agents"
export const ZCODE_INSTRUCTIONS = ".zcode/AGENTS.md"
export const ZCODE_CONFIG = ".zcode/config.json"
export const ZCODE_GLOBAL_CONFIG = ".zcode/cli/config.json"
export const ZCODE_MCP_FALLBACK = ".agents/mcp.json"
export const ZCODE_MANIFEST = ".zcode-plugin/plugin.json"
export const ZCODE_PLUGIN_ROOTS = {
  home: ".zcode", state: "cli/plugins",
  config: { write: ["cli/config.json"], read: [] },
  stateFiles: {
    write: ["installed_plugins.json", "known_marketplaces.json", "marketplaces/context-hub/marketplace.json", "cache/context-hub/*/*"],
    read: ["cache/*/*/*/.zcode-plugin/plugin.json", "cache/context-hub/*/*"],
  },
  workspace: { write: [], read: [".zcode/config.json"] },
  library: { write: [], read: ["*", "*/.zcode-plugin/plugin.json", ".claude-plugin/marketplace.json"] },
  external: [".zcode-plugin/plugin.json"],
} as const
export const SUPPORTS = ["skill", "mcp", "memory", "agent"] as const

export const GLOBAL_LOCATIONS = [
  { label: "Skills", path: `~/${ZCODE_SKILL_DIR}` },
  { label: "MCP / Plugins", path: `~/${ZCODE_GLOBAL_CONFIG}` },
  { label: "Commands", path: `~/${ZCODE_COMMAND_DIR}` },
  { label: "Instructions", path: `~/${ZCODE_INSTRUCTIONS}` },
  { label: "Agents", path: `~/${ZCODE_AGENT_DIR}` },
] as const
export const PROJECT_LOCATIONS = [
  { label: "Skills", path: ZCODE_SKILL_DIR },
  { label: "MCP", path: ZCODE_CONFIG },
  { label: "Commands", path: ZCODE_COMMAND_DIR },
  { label: "Agents", path: ZCODE_AGENT_DIR },
] as const
