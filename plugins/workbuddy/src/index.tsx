import type { ExtensionIcon } from "./contracts.ts"
import { createWorkBuddyInstaller } from "./installer.ts"
import { WORKBUDDY_ID, SKILL_DIR } from "./locations.ts"
import { workBuddyMessages, workBuddyZhMessages } from "./messages.ts"
import { createWorkBuddyMcp } from "./provider.ts"
import { createWorkBuddyPrompts } from "./prompts.ts"

const WorkBuddyIcon: ExtensionIcon = ({ className, "aria-hidden": ariaHidden }) => (
  <img src="/hub/extensions/workbuddy/assets/icon.svg" className={className}
    aria-hidden={ariaHidden} alt={ariaHidden === true ? "" : "WorkBuddy"} />
)

/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- services are supplied by the host */
export function apply(ctx: any): void {
  ctx.plugins.registerManifests([".codebuddy-plugin/plugin.json"])
  ctx.skills.register({ id: WORKBUDDY_ID, places: [
    { id: "workbuddy", labelKey: "workbuddy.tab", icon: WorkBuddyIcon, scope: "workspace", dir: SKILL_DIR },
    { id: "workbuddy-global", labelKey: "workbuddy.tab", icon: WorkBuddyIcon, scope: "global", dir: SKILL_DIR },
  ] })
  ctx.mcp.register(createWorkBuddyMcp(ctx.mcp.tools))
  ctx.prompts.register(createWorkBuddyPrompts(WorkBuddyIcon, ctx.prompts.tools))
  ctx.plugins.register(createWorkBuddyInstaller(ctx.mcp.tools))
  ctx.targets.register({
    id: WORKBUDDY_ID, displayName: "WorkBuddy", icon: WorkBuddyIcon,
    supports: ["skill", "mcp", "memory", "agent"],
    locations: [
      { label: "Skills", path: "~/.workbuddy/skills/<name>/SKILL.md" },
      { label: "Skills", path: ".workbuddy/skills/<name>/SKILL.md" },
      { label: "MCP", path: "~/.workbuddy/mcp.json" },
      { label: "MCP", path: ".workbuddy/mcp.json" },
      { label: "Coding commands", path: ".codebuddy/commands/<name>.md" },
      { label: "Coding instructions", path: "~/.codebuddy/CODEBUDDY.md" },
    ],
    format: "Markdown and JSON",
  })
  ctx.locales.register({ id: "en", label: "English", messages: workBuddyMessages })
  ctx.locales.register({ id: "zh-CN", label: "简体中文", messages: workBuddyZhMessages })
}
