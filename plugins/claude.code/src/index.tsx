/* eslint-disable @typescript-eslint/no-explicit-any -- the plugin scope is a service bag, typed by the kernel */
/**
 * Claude Code as a Context Hub extension, installed from the market.
 *
 * It registers the places Claude Code reads skills and prompts from, the MCP
 * files it reads and writes, its plugin installer, its target descriptor, and
 * the English strings its rows use. The shell does the rest: the agent menu,
 * the skills page's places, the MCP page's places, and the extension catalog
 * all read these registrations.
 *
 * Nothing here imports a hub package. React is external and mapped by the
 * page's import map; the services arrive through the context.
 */
import type { ExtensionIcon, PromptPlace, SkillPlace } from "./contracts.ts"
import { claudeCodeInstaller } from "./installer.ts"
import {
  CLAUDE_CODE_AGENT_DIR,
  CLAUDE_CODE_COMMAND_DIR,
  CLAUDE_CODE_GLOBAL_INSTRUCTION_FILE,
  CLAUDE_CODE_ID,
  CLAUDE_CODE_RULE_DIR,
  CLAUDE_CODE_SKILL_DIR,
  GLOBAL_LOCATIONS,
  PROJECT_LOCATIONS,
  SUPPORTS,
} from "./locations.ts"
import { claudeCodeMessages } from "./messages.ts"
import { createClaudeCodeMcp } from "./provider.ts"

/**
 * The brand mark in its own colours. The shell sizes every icon with a class,
 * so the svg takes no width or height of its own; one mark fits a 14px tab, a
 * 15px menu row and a 20px catalog tile.
 */
const ClaudeCodeIcon: ExtensionIcon = ({ className, "aria-hidden": ariaHidden }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden={ariaHidden}>
    <path
      clipRule="evenodd"
      fillRule="evenodd"
      fill="#D97757"
      d="M20.998 10.949H24v3.102h-3v3.028h-1.487V20H18v-2.921h-1.487V20H15v-2.921H9V20H7.488v-2.921H6V20H4.487v-2.921H3V14.05H0V10.95h3V5h17.998v5.949zM6 10.949h1.488V8.102H6v2.847zm10.51 0H18V8.102h-1.49v2.847z"
    />
  </svg>
)

/** The places this agent reads skills from: a project's directory, and home. */
function skillPlaces(icon: ExtensionIcon): SkillPlace[] {
  return [
    {
      id: "claude-code",
      labelKey: "claudeCode.tab",
      icon,
      scope: "workspace",
      dir: CLAUDE_CODE_SKILL_DIR,
      order: 20,
    },
    {
      id: "claude-code-global",
      labelKey: "claudeCode.tab",
      icon,
      scope: "global",
      dir: CLAUDE_CODE_SKILL_DIR,
      order: 20,
    },
  ]
}

/**
 * Where this agent takes a prompt, under both roots it reads: commands as one
 * file each, rules as one file each.
 *
 * Only the machine-wide memory file is offered as something a prompt can be
 * added to; the project's `CLAUDE.md` is a shared file, and an action that
 * silently edits it under the same words as a private file would hide the
 * difference.
 */
function promptPlaces(icon: ExtensionIcon): PromptPlace[] {
  return [
    {
      id: "claude-code",
      agent: CLAUDE_CODE_ID,
      labelKey: "claudeCode.tab",
      icon,
      scope: "workspace",
      commandDir: CLAUDE_CODE_COMMAND_DIR,
      ruleDir: CLAUDE_CODE_RULE_DIR,
      agentDir: CLAUDE_CODE_AGENT_DIR,
      order: 20,
    },
    {
      id: "claude-code-global",
      agent: CLAUDE_CODE_ID,
      labelKey: "claudeCode.tab",
      icon,
      scope: "global",
      commandDir: CLAUDE_CODE_COMMAND_DIR,
      ruleDir: CLAUDE_CODE_RULE_DIR,
      agentDir: CLAUDE_CODE_AGENT_DIR,
      documents: [
        {
          id: "claude",
          labelKey: "claudeCode.menu.instructions",
          removeLabelKey: "claudeCode.menu.instructions.remove",
          file: CLAUDE_CODE_GLOBAL_INSTRUCTION_FILE,
        },
      ],
      order: 20,
    },
  ]
}

/**
 * Register everything this integration contributes.
 *
 * `inject` in `plugin.yaml` names every service read below, so Cordis waits
 * until all of them are present instead of letting the extension half-register.
 */
export function apply(ctx: any): void {
  const icon = ClaudeCodeIcon
  const skillPlacesHere = skillPlaces(icon)
  const promptPlacesHere = promptPlaces(icon)

  ctx.skills.register({ id: CLAUDE_CODE_ID, places: skillPlacesHere })
  ctx.prompts.register({ id: CLAUDE_CODE_ID, places: promptPlacesHere })

  /* The toolkit comes off the same service, which is how it reaches a plugin
     installed as a folder: such a directory imports nothing. */
  ctx.mcp.register(createClaudeCodeMcp(ctx.mcp.tools))

  ctx.plugins.register(claudeCodeInstaller)

  ctx.targets.register({
    id: CLAUDE_CODE_ID,
    displayName: "Claude Code",
    icon,
    supports: [...SUPPORTS],
    locations: [...GLOBAL_LOCATIONS, ...PROJECT_LOCATIONS].map((location) => ({
      label: location.label,
      path: location.path,
    })),
    format: "Markdown with YAML frontmatter; JSON for MCP servers and hooks",
  })

  ctx.locales.register({
    id: "en",
    label: "English",
    messages: claudeCodeMessages,
  })
}
