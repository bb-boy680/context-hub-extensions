import type { DeepSeekHarnessScope, ExtensionIcon } from "./contracts.ts"
import { DEEPSEEK_HARNESS_ID, DEEPSEEK_SKILL_DIR } from "./locations.ts"
import { deepSeekHarnessMessages, deepSeekHarnessZhMessages } from "./messages.ts"
import { createDeepSeekHarnessPrompts } from "./prompts.ts"
import { createDeepSeekHarnessMcp } from "./mcp.ts"
import { createDeepSeekHarnessInstaller } from "./installer.ts"

const DeepSeekHarnessIcon: ExtensionIcon = ({ className, "aria-hidden": ariaHidden }) => (
  <img
    src="/hub/extensions/deepseek-harness/assets/icon.svg"
    className={className}
    aria-hidden={ariaHidden}
    alt={ariaHidden === true ? "" : "DeepSeek Harness"}
  />
)

export function apply(ctx: DeepSeekHarnessScope): void {
  ctx.plugins.registerManifestRules([
    { file: "package.json", required: [{ path: ["dsh", "bundle", "patch"], kind: "nonempty-string-or-array" }] },
  ])
  ctx.plugins.register(createDeepSeekHarnessInstaller())
  ctx.skills.register({
    id: DEEPSEEK_HARNESS_ID,
    places: [
      { id: "deepseek-harness", labelKey: "deepseekHarness.tab", icon: DeepSeekHarnessIcon, scope: "workspace", dir: DEEPSEEK_SKILL_DIR, order: 20 },
      { id: "deepseek-harness-global", labelKey: "deepseekHarness.tab", icon: DeepSeekHarnessIcon, scope: "global", dir: DEEPSEEK_SKILL_DIR, order: 20 },
    ],
  })
  ctx.prompts.register(createDeepSeekHarnessPrompts(DeepSeekHarnessIcon, ctx.prompts.tools))
  ctx.mcp.register(createDeepSeekHarnessMcp(ctx.mcp.tools))
  ctx.targets.register({
    id: DEEPSEEK_HARNESS_ID,
    displayName: "DeepSeek Harness",
    icon: DeepSeekHarnessIcon,
    supports: ["skill", "memory", "mcp"],
    locations: [
      { label: "Project skills", path: ".dsh/skills/<name>/SKILL.md" },
      { label: "Shared project skills", path: ".agents/skills/<name>/SKILL.md" },
      { label: "Skills", path: "~/.dsh/skills/<name>/SKILL.md" },
      { label: "Instructions", path: "~/.dsh/AGENTS.md" },
      { label: "MCP", path: "~/.dsh/cordis.patch.yml" },
      { label: "Project instructions", path: "AGENTS.md" },
    ],
    format: "Markdown skills and instructions; YAML MCP patches",
  })
  ctx.locales.register({ id: "en", label: "English", messages: deepSeekHarnessMessages })
  ctx.locales.register({ id: "zh-CN", label: "简体中文", messages: deepSeekHarnessZhMessages })
}
