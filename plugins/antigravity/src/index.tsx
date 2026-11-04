import type { AntigravityScope, ExtensionIcon } from "./contracts.ts"
import { ANTIGRAVITY_ID, GLOBAL_LOCATIONS, GLOBAL_SKILLS, PROJECT_LOCATIONS, SUPPORTS } from "./locations.ts"
import { messages, zhMessages } from "./messages.ts"
import { createAntigravityMcp } from "./provider.ts"
import { createAntigravityPrompts } from "./prompts.ts"
import { createAntigravityInstaller } from "./installer.ts"

const icon: ExtensionIcon = ({ className, "aria-hidden": ariaHidden }) => (
  <img src="/hub/extensions/antigravity/assets/icon.svg" className={className} aria-hidden={ariaHidden} alt="" />
)

export function apply(ctx: AntigravityScope): void {
  ctx.skills.register({ id: ANTIGRAVITY_ID, places: [{ id: "antigravity-global", labelKey: "antigravity.tab", icon, scope: "global", dir: GLOBAL_SKILLS, order: 20 }] })
  ctx.mcp.register(createAntigravityMcp(ctx.mcp.tools))
  ctx.prompts.register(createAntigravityPrompts(icon, ctx.prompts.tools))
  ctx.plugins.registerManifests([".antigravity-plugin/plugin.json"])
  ctx.plugins.register(createAntigravityInstaller(ctx.mcp.tools))
  ctx.targets.register({ id: ANTIGRAVITY_ID, displayName: "Antigravity", icon, supports: [...SUPPORTS], locations: [...GLOBAL_LOCATIONS, ...PROJECT_LOCATIONS], format: "Markdown skills, rules, agents and instructions; JSON MCP and plugins" })
  ctx.locales.register({ id: "en", label: "English", messages })
  ctx.locales.register({ id: "zh-CN", label: "简体中文", messages: zhMessages })
}
