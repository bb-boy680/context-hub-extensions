import type { ExtensionIcon, TraeScope } from "./contracts.ts"
import { CLI_ID, CLI_MCP, IDE_ID, IDE_PROJECT_SKILLS, IDE_GLOBAL_SKILLS, IDE_MCP, IDE_RULES } from "./locations.ts"
import { createTraeCliMcp } from "./cli-provider.ts"
import { createTraeIdePrompts } from "./prompts.ts"
import { createTraeIdeMcp } from "./provider.ts"
import { messages, zhMessages } from "./messages.ts"

const TraeIcon: ExtensionIcon = ({ className, "aria-hidden": ariaHidden }) => (
  <img src="/hub/extensions/trae/assets/icon.png" className={className} aria-hidden={ariaHidden} alt="" />
)

export function apply(ctx: TraeScope): void {
  ctx.skills.register({ id: IDE_ID, places: [
    { id: "trae-ide-skills", labelKey: "trae.ide", icon: TraeIcon, scope: "workspace", dir: IDE_PROJECT_SKILLS },
    { id: "trae-ide-skills-global", labelKey: "trae.ide", icon: TraeIcon, scope: "global", dir: IDE_GLOBAL_SKILLS },
  ] })
  ctx.skills.register({ id: CLI_ID, places: [] })
  ctx.mcp.register(createTraeIdeMcp(ctx.mcp.tools))
  ctx.mcp.register(createTraeCliMcp(ctx.mcp.tools))
  ctx.prompts.register(createTraeIdePrompts(TraeIcon, ctx.prompts.tools))
  ctx.targets.register({
    id: IDE_ID, displayName: "Trae IDE (CN)", icon: TraeIcon,
    supports: ["skill", "mcp", "memory"], locations: [
      { label: "Project skills", path: `${IDE_PROJECT_SKILLS}/<name>/SKILL.md` },
      { label: "Skills", path: `~/${IDE_GLOBAL_SKILLS}/<name>/SKILL.md` },
      { label: "Project MCP", path: IDE_MCP },
      { label: "Project rules", path: `${IDE_RULES}/<name>.md` },
    ], format: "Markdown and JSONC",
  })
  ctx.targets.register({
    id: CLI_ID, displayName: "TRAE CLI 2.0", icon: TraeIcon,
    supports: ["mcp"], locations: [{ label: "MCP", path: `~/${CLI_MCP}` }], format: "TOML",
  })
  ctx.locales.register({ id: "en", label: "English", messages })
  ctx.locales.register({ id: "zh-CN", label: "简体中文", messages: zhMessages })
}
