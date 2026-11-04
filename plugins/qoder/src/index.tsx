import iconUrl from "../assets/icon.png"
import type { ExtensionIcon, QoderScope, SkillPlace } from "./contracts.ts"
import { GLOBAL_LOCATIONS, PROJECT_LOCATIONS, QODER_ID, QODER_MANIFEST, QODER_SKILL_DIR, SUPPORTS } from "./locations.ts"
import { qoderMessages, qoderZhMessages } from "./messages.ts"
import { createQoderMcp } from "./provider.ts"
import { createQoderPrompts } from "./prompts.ts"
import { createQoderInstaller } from "./installer.ts"

const QoderIcon: ExtensionIcon = ({ className, "aria-hidden": ariaHidden }) => (
  <img src={iconUrl} alt={ariaHidden ? "" : "Qoder CLI"} className={className} aria-hidden={ariaHidden} />
)

function skillPlaces(icon: ExtensionIcon): SkillPlace[] {
  return [
    { id: "qoder", labelKey: "qoder.tab", icon, scope: "workspace", dir: QODER_SKILL_DIR, order: 20 },
    { id: "qoder-global", labelKey: "qoder.tab", icon, scope: "global", dir: QODER_SKILL_DIR, order: 20 },
  ]
}

export function apply(ctx: QoderScope): void {
  if (typeof ctx.plugins.registerManifests !== "function") throw new Error("此 Hub 版本缺少 Qoder 原生清单契约")
  if (typeof ctx.plugins.register !== "function") throw new Error("此 Hub 版本缺少 Qoder 插件安装契约")
  ctx.plugins.registerManifests([QODER_MANIFEST])
  ctx.plugins.register(createQoderInstaller({ editJson: ctx.mcp.tools.editJson, readJsonObject: ctx.mcp.tools.readJsonObject }))
  ctx.skills.register({ id: QODER_ID, places: skillPlaces(QoderIcon) })
  ctx.mcp.register(createQoderMcp(ctx.mcp.tools))
  ctx.prompts.register(createQoderPrompts(QoderIcon, ctx.prompts.tools))
  ctx.targets.register({
    id: QODER_ID,
    displayName: "Qoder CLI",
    icon: QoderIcon,
    supports: SUPPORTS,
    locations: [...GLOBAL_LOCATIONS, ...PROJECT_LOCATIONS],
    format: "Markdown skills, commands, rules and agents; JSONC MCP; native plugin manifest collection",
  })
  ctx.locales.register({ id: "en", label: "English", messages: qoderMessages })
  ctx.locales.register({ id: "zh-CN", label: "简体中文", messages: qoderZhMessages })
}
