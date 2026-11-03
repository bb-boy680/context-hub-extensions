export const CURSOR_ID = "hub.target.cursor"
export const CURSOR_SKILL_DIR = ".cursor/skills"
export const CURSOR_MCP_FILE = ".cursor/mcp.json"
export const CURSOR_MANIFEST = ".cursor-plugin/plugin.json"
export const SUPPORTS = ["skill", "mcp", "memory", "agent"] as const
export const LOCATIONS = [
  { label: "Skills", path: "~/.cursor/skills/<name>/SKILL.md" },
  { label: "Shared skills", path: "~/.agents/skills/<name>/SKILL.md" },
  { label: "MCP", path: "~/.cursor/mcp.json" },
  { label: "Agents", path: "~/.cursor/agents/<name>.md" },
  { label: "Local plugins", path: "~/.cursor/plugins/local/<name>" },
  { label: "Project skills", path: ".cursor/skills/<name>/SKILL.md" },
  { label: "Project MCP", path: ".cursor/mcp.json" },
  { label: "Commands", path: ".cursor/commands/<name>.md" },
  { label: "Rules", path: ".cursor/rules/<name>.mdc" },
  { label: "Project agents", path: ".cursor/agents/<name>.md" },
  { label: "Instructions", path: "AGENTS.md" },
]
