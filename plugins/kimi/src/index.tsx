import type { ExtensionIcon, KimiScope } from "./contracts.ts"
import { KIMI_CODE_ID, KIMI_SKILL_DIR, LOCATIONS, SUPPORTS } from "./locations.ts"
import { kimiMessages, kimiZhMessages } from "./messages.ts"
import { createKimiMcp } from "./provider.ts"
import { createKimiPrompts } from "./prompts.ts"
import { createKimiInstaller } from "./installer.ts"

const KimiIcon: ExtensionIcon = ({ className, "aria-hidden": ariaHidden }) => (
  <img src="/hub/extensions/kimi/assets/icon.png" className={className}
    aria-hidden={ariaHidden} alt={ariaHidden === true ? "" : "Kimi Code"} />
)

export function apply(ctx: KimiScope): void {
  ctx.skills.register({ id: KIMI_CODE_ID, places: [
    { id: "kimi", labelKey: "kimi.tab", icon: KimiIcon, scope: "workspace", dir: KIMI_SKILL_DIR, order: 20 },
    { id: "kimi-global", labelKey: "kimi.tab", icon: KimiIcon, scope: "global", dir: KIMI_SKILL_DIR, order: 20 },
  ] })
  ctx.mcp.register(createKimiMcp(ctx.mcp.tools))
  ctx.prompts.register(createKimiPrompts(KimiIcon, ctx.prompts.tools))
  ctx.plugins.registerManifests(["kimi.plugin.json", ".kimi-plugin/plugin.json"])
  ctx.plugins.register(createKimiInstaller())
  ctx.targets.register({
    id: KIMI_CODE_ID, displayName: "Kimi Code", icon: KimiIcon,
    supports: [...SUPPORTS], locations: LOCATIONS,
    format: "Markdown skills and agents; JSON MCP; AGENTS.md instructions; kimi.plugin.json plugins",
  })
  ctx.locales.register({ id: "en", label: "English", messages: kimiMessages })
  ctx.locales.register({ id: "zh-CN", label: "简体中文", messages: kimiZhMessages })
}
