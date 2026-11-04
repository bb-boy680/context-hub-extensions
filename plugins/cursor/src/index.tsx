import type { CursorScope, ExtensionIcon, SkillPlace } from "./contracts.ts"
import { CURSOR_ID, CURSOR_MANIFEST, CURSOR_SKILL_DIR, LOCATIONS, SUPPORTS } from "./locations.ts"
import { cursorMessages, cursorZhMessages } from "./messages.ts"
import { createCursorMcp } from "./provider.ts"
import { createCursorPrompts } from "./prompts.ts"
import { createCursorInstaller } from "./installer.ts"

const CursorIcon: ExtensionIcon = ({ className, "aria-hidden": ariaHidden }) => (
  <img src="/hub/extensions/cursor/assets/icon.svg" alt="" className={className} aria-hidden={ariaHidden} />
)

export function apply(ctx: CursorScope): void {
  if (typeof ctx.plugins.registerManifests !== "function") throw new Error("This Context Hub version lacks native plugin manifest registration")
  const places: SkillPlace[] = [
    { id: "cursor", labelKey: "cursor.tab", icon: CursorIcon, scope: "workspace", dir: CURSOR_SKILL_DIR, order: 20 },
    { id: "cursor-global", labelKey: "cursor.tab", icon: CursorIcon, scope: "global", dir: CURSOR_SKILL_DIR, order: 20 },
  ]
  ctx.skills.register({ id: CURSOR_ID, places })
  ctx.prompts.register(createCursorPrompts(ctx.prompts.tools, CursorIcon))
  ctx.mcp.register(createCursorMcp(ctx.mcp.tools))
  ctx.plugins.registerManifests([CURSOR_MANIFEST])
  ctx.plugins.register(createCursorInstaller())
  ctx.targets.register({ id: CURSOR_ID, displayName: "Cursor", icon: CursorIcon, supports: SUPPORTS, locations: LOCATIONS, format: "Markdown skills, commands, rules and agents; JSON MCP and plugins" })
  ctx.locales.register({ id: "en", label: "English", messages: cursorMessages })
  ctx.locales.register({ id: "zh-CN", label: "简体中文", messages: cursorZhMessages })
}
