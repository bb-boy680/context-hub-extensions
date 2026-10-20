/**
 * English defaults for the `codex.*` namespace. A language pack translates
 * these keys; the kernel falls back to this table for any it does not carry.
 */
export const codexMessages: Record<string, string> = {
  "codex.tab": "Codex",
  "codex.menu.instructions": "Add to AGENTS.md",
  "codex.menu.instructions.remove": "Remove from AGENTS.md",
  "codex.error.parse": "Codex's config file is not TOML this hub can read.",
  "codex.error.refused": "The hub could not write {file}.",
  "codex.error.unknownPlace": "Codex has no client file called {place}.",
  "codex.error.unknownForm": "Codex has no prompt action called {form}.",
  "codex.error.override":
    "Codex reads {file} instead of AGENTS.md, so the section was not written.",
  "codex.error.agentExists":
    "{file} is an agent file this hub did not write, so it was left alone.",
}

/**
 * The same namespace in Chinese. A language pack is the hub's, but the words
 * for one agent belong to the agent: this extension registers them itself, so
 * translating it never means editing Context Hub.
 */
export const codexZhMessages: Record<string, string> = {
  "codex.tab": "Codex",
  "codex.menu.instructions": "添加到 AGENTS.md",
  "codex.menu.instructions.remove": "从 AGENTS.md 移除",
  "codex.error.parse": "Codex 的配置文件不是可读的 TOML。",
  "codex.error.refused": "无法写入 {file}。",
  "codex.error.unknownPlace": "Codex 没有名为 {place} 的客户端文件。",
  "codex.error.unknownForm": "Codex 没有名为 {form} 的提示词操作。",
  "codex.error.override": "Codex 读取的是 {file}，而不是 AGENTS.md，所以这一段没有写入。",
  "codex.error.agentExists": "{file} 不是这个 hub 写入的 agent 文件，已保留原样。",
}
