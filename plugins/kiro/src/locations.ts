export const KIRO_ID = "hub.target.kiro"
export const SKILL_DIR = ".kiro/skills"
export const MCP_FILE = ".kiro/settings/mcp.json"
export const SUPPORTS = ["skill", "mcp", "memory", "agent"] as const
export const LOCATIONS = [
  { label: "Skills", path: "~/.kiro/skills/<name>/SKILL.md" },
  { label: "Project skills", path: ".kiro/skills/<name>/SKILL.md" },
  { label: "MCP", path: "~/.kiro/settings/mcp.json" },
  { label: "Project MCP", path: ".kiro/settings/mcp.json" },
  { label: "Steering", path: "~/.kiro/steering/context-hub-<name>.md" },
  { label: "Project steering", path: ".kiro/steering/context-hub-<name>.md" },
  { label: "Agents", path: "~/.kiro/agents/context-hub-<name>.md" },
  { label: "Project agents", path: ".kiro/agents/context-hub-<name>.md" },
  { label: "Instructions", path: "~/.kiro/steering/AGENTS.md" },
  { label: "Project instructions", path: "AGENTS.md" },
]
