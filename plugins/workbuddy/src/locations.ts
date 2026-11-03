export const WORKBUDDY_ID = "hub.target.workbuddy"
export const SKILL_DIR = ".workbuddy/skills"
export const MCP_FILE = ".workbuddy/mcp.json"
export const COMMAND_DIR = ".codebuddy/commands"
export const INSTRUCTION_FILE = ".codebuddy/CODEBUDDY.md"

export const PLUGIN_ROOTS = {
  home: ".workbuddy", state: "plugins",
  config: { write: ["settings.json"], read: [] },
  stateFiles: { write: ["installed_plugins.json", "known_marketplaces.json", "cache/*/*/*"], read: [] },
  workspace: { write: [".workbuddy/settings.json"], read: [".workbuddy/settings.local.json"] },
  library: { write: [], read: [".codebuddy-plugin/marketplace.json", "*", "*/.codebuddy-plugin/plugin.json"] },
  external: [".codebuddy-plugin/marketplace.json", ".codebuddy-plugin/plugin.json"],
} as const
