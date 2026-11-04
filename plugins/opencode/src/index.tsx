/**
 * OpenCode as a Context Hub extension, installed from the market.
 *
 * It registers the places OpenCode reads skills from, the JSONC files it reads
 * and writes MCP servers in, its prompt provider, its target descriptor, and
 * the strings its rows use. The shell does the rest: the agent menu, the skills
 * page's places, the MCP page's places, and the extension catalog all read
 * these registrations.
 *
 * Nothing here imports a hub package. React is external and mapped by the
 * page's import map; the services arrive through the context.
 */
import type { ExtensionIcon, OpenCodeScope, SkillPlace } from "./contracts.ts"
import {
  GLOBAL_LOCATIONS,
  OPENCODE_GLOBAL_SKILL_DIR,
  OPENCODE_ID,
  OPENCODE_SKILL_DIR,
  PROJECT_LOCATIONS,
  SUPPORTS,
} from "./locations.ts"
import { openCodeMessages, openCodeZhMessages } from "./messages.ts"
import { createOpenCodeMcp } from "./provider.ts"
import { createOpenCodePrompts } from "./prompts.ts"

/**
 * The official brand mark. The image is served from this extension's own
 * `assets/` directory, so the mark is not redrawn here; the shell sizes every
 * icon with a class.
 */
const OpenCodeIcon: ExtensionIcon = ({ className, "aria-hidden": ariaHidden }) => (
  <img
    src="/hub/extensions/opencode/assets/icon.svg"
    className={className}
    aria-hidden={ariaHidden}
    alt={ariaHidden === true ? "" : "OpenCode"}
  />
)

/**
 * The places OpenCode reads skills from: a project's `.opencode/skills`, and
 * the machine-wide `~/.config/opencode/skills`.
 *
 * Both are OpenCode's own directories. `.agents/skills` is the hub's shared
 * workspace place and `.claude/skills` belongs to the Claude Code extension;
 * registering either here would list one physical directory twice.
 */
function skillPlaces(icon: ExtensionIcon): SkillPlace[] {
  return [
    {
      id: "opencode",
      labelKey: "opencode.tab",
      icon,
      scope: "workspace",
      dir: OPENCODE_SKILL_DIR,
    },
    {
      id: "opencode-global",
      labelKey: "opencode.tab",
      icon,
      scope: "global",
      dir: OPENCODE_GLOBAL_SKILL_DIR,
    },
  ]
}

/**
 * Register everything this integration contributes.
 *
 * `inject` in `plugin.yaml` names every service read below, so Cordis waits
 * until all of them are present instead of letting the extension
 * half-register.
 */
export function apply(ctx: OpenCodeScope): void {
  const icon = OpenCodeIcon

  ctx.skills.register({ id: OPENCODE_ID, places: skillPlaces(icon) })
  ctx.mcp.register(createOpenCodeMcp(ctx.mcp.tools))
  ctx.prompts.register(createOpenCodePrompts(icon, ctx.prompts.tools))

  ctx.targets.register({
    id: OPENCODE_ID,
    displayName: "OpenCode",
    icon,
    supports: [...SUPPORTS],
    locations: [...GLOBAL_LOCATIONS, ...PROJECT_LOCATIONS],
    format:
      "Markdown skills, commands and agents; JSONC or JSON configuration and MCP servers; AGENTS.md instructions",
  })

  ctx.locales.register({
    id: "en",
    label: "English",
    messages: openCodeMessages,
  })

  ctx.locales.register({
    id: "zh-CN",
    label: "简体中文",
    messages: openCodeZhMessages,
  })
}
