export const QWEN_ID = "hub.target.qwen-code"
export const QWEN_SKILL_DIR = ".qwen/skills"
export const QWEN_MCP_FILE = ".qwen/settings.json"
export const LOCATIONS = [
  { label: "Native extensions", path: "~/.qwen/extensions/<name>" },
  { label: "MCP", path: "~/.qwen/settings.json" },
  { label: "Project MCP", path: ".qwen/settings.json" },
  { label: "Skills", path: "~/.qwen/skills/<name>/SKILL.md" },
  { label: "Agents", path: "~/.qwen/agents/<name>.md" },
  { label: "Commands", path: "~/.qwen/commands/<name>.md" },
  { label: "Instructions", path: "~/.qwen/QWEN.md" },
  { label: "Project agents", path: ".qwen/agents/<name>.md" },
  { label: "Project commands", path: ".qwen/commands/<name>.md" },
  { label: "Project instructions", path: "QWEN.md" },
  { label: "Project skills", path: ".qwen/skills/<name>/SKILL.md" },
]
export const SUPPORTS = ["skill", "mcp", "memory", "agent"] as const
