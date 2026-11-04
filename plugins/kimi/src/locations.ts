export const KIMI_CODE_ID = "hub.target.kimi-code"
export const KIMI_SKILL_DIR = ".kimi-code/skills"
export const KIMI_MCP_FILE = ".kimi-code/mcp.json"
export const KIMI_AGENT_DIR = ".kimi-code/agents"
export const KIMI_INSTRUCTION_FILE = ".kimi-code/AGENTS.md"
export const SUPPORTS = ["skill", "mcp", "memory", "agent"] as const

export const LOCATIONS = [
  { label: "Skills", path: "~/.kimi-code/skills/<name>/SKILL.md" },
  { label: "Agents", path: "~/.kimi-code/agents/<slug>.md" },
  { label: "Instructions", path: "~/.kimi-code/AGENTS.md" },
  { label: "MCP servers", path: "~/.kimi-code/mcp.json" },
  { label: "Plugins", path: "~/.kimi-code/plugins/installed.json" },
  { label: "Project skills", path: ".kimi-code/skills/<name>/SKILL.md" },
  { label: "Project agents", path: ".kimi-code/agents/<slug>.md" },
  { label: "Project instructions", path: ".kimi-code/AGENTS.md" },
  { label: "Project MCP servers", path: ".kimi-code/mcp.json" },
]
