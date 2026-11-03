/**
 * English defaults for the `opencode.*` namespace. A language pack translates
 * these keys; the kernel falls back to this table for any it does not carry.
 */
export const openCodeMessages: Record<string, string> = {
  "opencode.tab": "OpenCode",
  "opencode.menu.instructions": "Add to AGENTS.md",
  "opencode.menu.instructions.remove": "Remove from AGENTS.md",
  "opencode.error.parse": "OpenCode's config file is not JSON this hub can read.",
  "opencode.error.refused": "The hub could not write {file}.",
  "opencode.error.unknownPlace": "OpenCode has no client file called {place}.",
  "opencode.error.unknownForm": "OpenCode has no prompt action called {form}.",
  "opencode.error.v2Only":
    "This file is not native OpenCode V2 configuration. It was left unchanged.",
  "opencode.error.sse":
    "OpenCode V2 has no SSE transport field, so this server was not written.",
  "opencode.error.invalidEntry": "{name} is not a complete OpenCode V2 server entry.",
  "opencode.error.missingEntry":
    "This file has no server called {name}, so its switch was not written.",
  "opencode.error.scope": "{place} is not a {scope} place.",
  "opencode.error.handwritten": "{file} is not a file this hub wrote, so it was left alone.",
  "opencode.error.sectionBroken":
    "{file} has an incomplete context-hub section for {slug}, so nothing was changed.",
}

/**
 * The same namespace in Chinese. A language pack is the hub's, but the words
 * for one agent belong to the agent: this extension registers them itself, so
 * translating it never means editing Context Hub.
 */
export const openCodeZhMessages: Record<string, string> = {
  "opencode.tab": "OpenCode",
  "opencode.menu.instructions": "添加到 AGENTS.md",
  "opencode.menu.instructions.remove": "从 AGENTS.md 移除",
  "opencode.error.parse": "OpenCode 的配置文件不是可读取的 JSON。",
  "opencode.error.refused": "无法写入 {file}。",
  "opencode.error.unknownPlace": "OpenCode 没有名为 {place} 的客户端文件。",
  "opencode.error.unknownForm": "OpenCode 没有名为 {form} 的提示词操作。",
  "opencode.error.v2Only": "该文件不是原生 OpenCode V2 配置，已保持原样。",
  "opencode.error.sse": "OpenCode V2 没有 SSE 传输字段，该服务器未写入。",
  "opencode.error.invalidEntry": "{name} 不是完整的 OpenCode V2 服务器条目。",
  "opencode.error.missingEntry": "该文件中没有名为 {name} 的服务器，未写入开关。",
  "opencode.error.scope": "{place} 不是 {scope} 作用域的位置。",
  "opencode.error.handwritten": "{file} 不是这个 hub 写入的文件，已保留原样。",
  "opencode.error.sectionBroken":
    "{file} 中 {slug} 的 context-hub 区块标记不完整，未做任何修改。",
}
