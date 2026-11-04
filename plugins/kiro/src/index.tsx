import type { ExtensionIcon, KiroScope, SkillPlace } from "./contracts.ts"
import { KIRO_ID, LOCATIONS, SKILL_DIR, SUPPORTS } from "./locations.ts"
import { kiroMessages, kiroZhMessages } from "./messages.ts"
import { createKiroMcp } from "./provider.ts"
import { createKiroPrompts } from "./prompts.ts"
import { createKiroInstaller } from "./installer.ts"

const KiroIcon: ExtensionIcon = ({ className, "aria-hidden": ariaHidden }) => (
  <img src="/hub/extensions/kiro/assets/icon.svg" alt="" className={className} aria-hidden={ariaHidden} />
)

export function apply(ctx: KiroScope): void {
  const places: SkillPlace[] = [
    { id: "kiro", labelKey: "kiro.tab", icon: KiroIcon, scope: "workspace", dir: SKILL_DIR },
    { id: "kiro-global", labelKey: "kiro.tab", icon: KiroIcon, scope: "global", dir: SKILL_DIR },
  ]
  ctx.skills.register({ id: KIRO_ID, places })
  ctx.prompts.register(createKiroPrompts(ctx.prompts.tools, KiroIcon))
  ctx.mcp.register(createKiroMcp(ctx.mcp.tools))
  ctx.plugins.register(createKiroInstaller())
  ctx.targets.register({ id: KIRO_ID, displayName: "Kiro", icon: KiroIcon, supports: SUPPORTS, locations: LOCATIONS, format: "Markdown skills, steering and agents; JSON MCP" })
  ctx.locales.register({ id: "en", label: "English", messages: kiroMessages })
  ctx.locales.register({ id: "zh-CN", label: "简体中文", messages: kiroZhMessages })
}
