export const ANTIGRAVITY_ID = "hub.target.antigravity"
export const GLOBAL_SKILLS = ".gemini/config/skills"
export const GLOBAL_MCP = ".gemini/config/mcp_config.json"
export const WORKSPACE_MCP = ".agents/mcp_config.json"
export const GLOBAL_LOCATIONS = [
  { label: "Skills", path: `~/${GLOBAL_SKILLS}/<name>/SKILL.md` },
  { label: "Rules", path: "~/.gemini/config/rules/<name>.md" },
  { label: "Agents", path: "~/.gemini/config/agents/<name>.md" },
  { label: "Instructions", path: "~/.gemini/AGENTS.md" },
  { label: "MCP", path: `~/${GLOBAL_MCP}` },
  { label: "Plugins", path: "~/.gemini/config/plugins.json" },
]
export const PROJECT_LOCATIONS = [
  { label: "Skills", path: ".agents/skills/<name>/SKILL.md" },
  { label: "Rules", path: ".agents/rules/<name>.md" },
  { label: "Agents", path: ".agents/agents/<name>.md" },
  { label: "Instructions", path: "AGENTS.md" },
  { label: "MCP", path: WORKSPACE_MCP },
]
export const SUPPORTS = ["skill", "mcp", "memory", "agent"] as const
