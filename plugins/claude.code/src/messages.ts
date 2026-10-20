/**
 * English defaults for the `claudeCode.*` namespace. A language pack translates
 * these keys; the kernel falls back to this table for any it does not carry.
 */
export const claudeCodeMessages: Record<string, string> = {
  "claudeCode.tab": "Claude Code",
  "claudeCode.menu.documents": "Add to a memory file",
  "claudeCode.menu.instructions": "Add to CLAUDE.md",
  "claudeCode.menu.instructions.remove": "Remove from CLAUDE.md",
  "claudeCode.error.refused": "The hub could not read or write Claude Code's config files.",
  "claudeCode.error.unknownPlace": "Claude Code has no client file called {place}.",
  "claudeCode.error.unknownForm": "Claude Code has no prompt action called {form}.",
  "claudeCode.error.noProject":
    "Claude Code has no record for this folder in {file}, so it has nowhere to keep the switch.",
  "claudeCode.error.noWorkspace": "No workspace is open, so there is no project to switch.",
  "claudeCode.error.machineScope":
    "Claude Code keeps the switch in a project's record, so a machine-wide place has none.",
}

/**
 * The same namespace in Chinese. A language pack is the hub's, but the words
 * for one agent belong to the agent: this extension registers them itself, so
 * translating it never means editing Context Hub.
 */
export const claudeCodeZhMessages: Record<string, string> = {
  "claudeCode.tab": "Claude Code",
  "claudeCode.menu.documents": "添加到记忆文件",
  "claudeCode.menu.instructions": "添加到 CLAUDE.md",
  "claudeCode.menu.instructions.remove": "从 CLAUDE.md 移除",
  "claudeCode.error.refused": "读写 Claude Code 的配置文件失败。",
  "claudeCode.error.unknownPlace": "Claude Code 没有名为 {place} 的客户端文件。",
  "claudeCode.error.unknownForm": "Claude Code 没有名为 {form} 的提示词操作。",
  "claudeCode.error.noProject":
    "Claude Code 在 {file} 里没有这个文件夹的记录，没有地方放这个开关。",
  "claudeCode.error.noWorkspace": "当前没有工作区，没有可切换的项目。",
  "claudeCode.error.machineScope": "Claude Code 把开关记在项目的记录里，整机位置没有可写的地方。",
}
