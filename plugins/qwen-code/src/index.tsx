import type { ExtensionIcon, QwenScope } from "./contracts.ts"
import { LOCATIONS, QWEN_ID, QWEN_SKILL_DIR, SUPPORTS } from "./locations.ts"
import { qwenMessages, qwenZhMessages } from "./messages.ts"
import { createQwenCodeMcp } from "./provider.ts"
import { createQwenCodePrompts } from "./prompts.ts"
import { createQwenCodeInstaller } from "./installer.ts"

const QwenIcon: ExtensionIcon = ({ className, "aria-hidden": ariaHidden }) => (
  <img src="/hub/extensions/qwen-code/assets/icon.png" alt="" className={className} aria-hidden={ariaHidden} />
)

export function apply(ctx: QwenScope): void {
  ctx.skills.register({ id: QWEN_ID, places: [
    { id: "qwen-code", labelKey: "qwen-code.tab", icon: QwenIcon, scope: "workspace", dir: QWEN_SKILL_DIR, order: 20 },
    { id: "qwen-code-global", labelKey: "qwen-code.tab", icon: QwenIcon, scope: "global", dir: QWEN_SKILL_DIR, order: 20 },
  ] })
  ctx.mcp.register(createQwenCodeMcp(ctx.mcp.tools))
  ctx.prompts.register(createQwenCodePrompts(QwenIcon, ctx.prompts.tools))
  ctx.plugins.registerManifests(["qwen-extension.json"])
  ctx.plugins.register(createQwenCodeInstaller())
  ctx.targets.register({ id: QWEN_ID, displayName: "Qwen Code", icon: QwenIcon, supports: SUPPORTS, locations: LOCATIONS, format: "Markdown and JSON" })
  ctx.locales.register({ id: "en", label: "English", messages: qwenMessages })
  ctx.locales.register({ id: "zh-CN", label: "简体中文", messages: qwenZhMessages })
}
