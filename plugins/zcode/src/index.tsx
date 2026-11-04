import type { ExtensionIcon, SkillPlace, ZCodeScope } from "./contracts.ts"
import { GLOBAL_LOCATIONS, PROJECT_LOCATIONS, SUPPORTS, ZCODE_ID, ZCODE_MANIFEST, ZCODE_SKILL_DIR } from "./locations.ts"
import { zcodeMessages, zcodeZhMessages } from "./messages.ts"
import { createZCodeMcp } from "./provider.ts"
import { createZCodePrompts } from "./prompts.ts"
import { createZCodeInstaller } from "./installer.ts"

const ZCodeIcon: ExtensionIcon = ({ className, "aria-hidden": ariaHidden }) => (
  <svg viewBox="0 0 256 218" fill="none" className={className} aria-hidden={ariaHidden} focusable="false">
    <title>ZCode</title>
    <path fill="currentColor" d="M134.4 0.130152L116.48 25.6022C113.665 29.5699 109.054 32.0019 104.064 32.0019H6.3999V0C6.3999 0.130149 134.4 0.130152 134.4 0.130152Z" />
    <path fill="currentColor" d="M256 0.130127L102.401 217.732H0L153.599 0.130127H256Z" />
    <path fill="currentColor" d="M121.601 217.732L139.65 192.134C142.465 188.166 147.076 185.734 152.067 185.734H249.604V217.736H121.601V217.732Z" />
  </svg>
)

function skillPlaces(icon: ExtensionIcon): SkillPlace[] {
  return [
    { id: "zcode", labelKey: "zcode.tab", icon, scope: "workspace", dir: ZCODE_SKILL_DIR, order: 20 },
    { id: "zcode-global", labelKey: "zcode.tab", icon, scope: "global", dir: ZCODE_SKILL_DIR, order: 20 },
  ]
}

export function apply(ctx: ZCodeScope): void {
  if (typeof ctx.plugins.registerManifests !== "function") throw new Error("此 Hub 版本缺少 ZCode 原生清单契约")
  const icon = ZCodeIcon
  ctx.plugins.registerManifests([ZCODE_MANIFEST])
  ctx.plugins.register(createZCodeInstaller(ctx.mcp.tools))
  ctx.skills.register({ id: ZCODE_ID, places: skillPlaces(icon) })
  ctx.mcp.register(createZCodeMcp(ctx.mcp.tools))
  ctx.prompts.register(createZCodePrompts(icon, ctx.prompts.tools))
  ctx.targets.register({
    id: ZCODE_ID,
    displayName: "ZCode",
    icon,
    supports: SUPPORTS,
    locations: [...GLOBAL_LOCATIONS, ...PROJECT_LOCATIONS],
    format: "Markdown skills, commands and agents; strict JSON MCP and native plugin packs",
  })
  ctx.locales.register({ id: "en", label: "English", messages: zcodeMessages })
  ctx.locales.register({ id: "zh-CN", label: "简体中文", messages: zcodeZhMessages })
}
