import type { CopilotScope } from "./contracts.ts"
import { CopilotIcon } from "./icon.tsx"
import { createCopilotInstaller } from "./installer.ts"
import { COPILOT_ID } from "./locations.ts"
import { copilotMessages, copilotZhMessages } from "./messages.ts"
import { createCopilotMcp } from "./provider.ts"
import { createCopilotPrompts } from "./prompts.ts"

export function apply(ctx: CopilotScope): void {
  ctx.skills.register({ id: COPILOT_ID, places: [
    { id: "copilot-skills", labelKey: "copilot.tab", icon: CopilotIcon, scope: "workspace", dir: ".github/skills" },
    { id: "copilot-skills-global", labelKey: "copilot.tab", icon: CopilotIcon, scope: "global", dir: ".copilot/skills" },
  ] })
  ctx.mcp.register(createCopilotMcp(ctx.mcp.tools))
  ctx.prompts.register(createCopilotPrompts(ctx.prompts.tools, CopilotIcon))
  ctx.plugins.register(createCopilotInstaller(ctx.mcp.tools))
  ctx.targets.register({ id: COPILOT_ID, displayName: "GitHub Copilot", icon: CopilotIcon, supports: ["skill", "mcp", "memory", "agent"], locations: [
    { label: "Skills", path: ".github/skills, ~/.copilot/skills" },
    { label: "Instructions and agents", path: ".github, ~/.copilot" },
    { label: "MCP", path: ".mcp.json, .github/mcp.json, ~/.copilot/mcp-config.json, .vscode/mcp.json (VS Code Local)" },
    { label: "Home", path: "Default ~/.copilot only for skills, MCP and prompts; custom COPILOT_HOME applies to plugins only" },
  ], format: "Markdown; JSONC MCP; Agent Plugins 1.1.0" })
  ctx.locales.register({ id: "en", label: "English", messages: copilotMessages })
  ctx.locales.register({ id: "zh-CN", label: "简体中文", messages: copilotZhMessages })
}
