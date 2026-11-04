import type { PluginDiskDeclaration } from "./contracts.ts"

export const QODER_ID = "hub.target.qoder"
export const QODER_MANIFEST = ".qoder-plugin/plugin.json"
export const QODER_PLUGIN_ROOTS: PluginDiskDeclaration = {
  home: ".qoder", homeEnv: "QODER_CONFIG_DIR", state: "plugins", stateEnv: "QODER_PLUGIN_CACHE_DIR",
  copyExcludeTop: [".git", "node_modules", ".env", ".env.*"],
  copyRejectNested: [".env", ".env.*"],
  lease: { ref: { root: "plugins", path: ".installer-ownership/qoder-lock" }, stale: 60000, update: 5000, retries: { retries: 60, factor: 1.2, minTimeout: 50, maxTimeout: 500, randomize: true } },
  config: { write: ["settings.json"], read: [] },
  stateFiles: { write: ["installed_plugins_v2.json", "cache/local/*/*", ".installer-ownership/qoder-lock"], read: [] },
  workspace: { write: [".qoder/settings.json", ".qoder/settings.local.json"], read: [] },
  library: { write: [".installer-ownership/qoder.json", ".installer-ownership/qoder-transactions/*"], read: ["*", "*/.qoder-plugin/plugin.json", ".installer-ownership/qoder-transactions"] },
  external: [".qoder-plugin/plugin.json"],
}
export const QODER_SKILL_DIR = ".qoder/skills"
export const QODER_SETTINGS = ".qoder/settings.json"
export const QODER_LOCAL_SETTINGS = ".qoder/settings.local.json"
export const QODER_PROJECT_MCP = ".mcp.json"
export const QODER_COMMAND_DIR = ".qoder/commands"
export const QODER_RULE_DIR = ".qoder/rules"
export const QODER_AGENT_DIR = ".qoder/agents"
export const QODER_INSTRUCTIONS = ".qoder/AGENTS.md"
export const QODER_PLUGIN_PLACES = [
  { id: "qoder-plugin-user", label: "Qoder CLI", scope: "global", scopeWord: "user", switchable: true, file: "settings.json" },
  { id: "qoder-plugin-project", label: "Qoder CLI", scope: "workspace", scopeWord: "project", switchable: true, file: QODER_SETTINGS, overrides: ["user"] },
  { id: "qoder-plugin-local", label: "Qoder CLI", scope: "workspace", scopeWord: "local", switchable: true, file: QODER_LOCAL_SETTINGS, overrides: ["user", "project"] },
] as const
export const SUPPORTS = ["skill", "mcp", "memory", "agent"] as const
export const GLOBAL_LOCATIONS = [
  { label: "Skills", path: `~/${QODER_SKILL_DIR}` },
  { label: "MCP", path: `~/${QODER_SETTINGS}` },
  { label: "Commands", path: `~/${QODER_COMMAND_DIR}` },
  { label: "Rules", path: `~/${QODER_RULE_DIR}` },
  { label: "Agents", path: `~/${QODER_AGENT_DIR}` },
  { label: "Instructions", path: `~/${QODER_INSTRUCTIONS}` },
] as const
export const PROJECT_LOCATIONS = [
  { label: "Skills", path: QODER_SKILL_DIR },
  { label: "MCP", path: QODER_PROJECT_MCP },
  { label: "MCP", path: QODER_SETTINGS },
  { label: "MCP", path: QODER_LOCAL_SETTINGS },
  { label: "Commands", path: QODER_COMMAND_DIR },
  { label: "Rules", path: QODER_RULE_DIR },
  { label: "Agents", path: QODER_AGENT_DIR },
] as const
