export const cursorMessages: Record<string, string> = {
  "cursor.tab": "Cursor",
  "cursor.menu.rule": "Rule",
  "cursor.menu.rule.remove": "Remove rule",
  "cursor.error.unknownPlace": "Unknown Cursor place: {place}",
  "cursor.error.unknownForm": "Unknown Cursor form: {form}",
  "cursor.error.refused": "Cursor could not update {file}",
  "cursor.error.exists": "A file already exists at {file} and was not created by Context Hub.",
  "cursor.error.invalidMcp": "Cursor MCP configuration must contain an object at mcpServers.",
  "cursor.error.mcpConflict": "This MCP entry contains fields incompatible with the requested transport.",
}

export const cursorZhMessages: Record<string, string> = {
  "cursor.tab": "Cursor",
  "cursor.menu.rule": "规则",
  "cursor.menu.rule.remove": "移除规则",
  "cursor.error.unknownPlace": "未知的 Cursor 位置：{place}",
  "cursor.error.unknownForm": "未知的 Cursor 形式：{form}",
  "cursor.error.refused": "Cursor 无法更新 {file}",
  "cursor.error.exists": "{file} 已存在且不是由 Context Hub 创建。",
  "cursor.error.invalidMcp": "Cursor MCP 配置中的 mcpServers 必须是对象。",
  "cursor.error.mcpConflict": "此 MCP 条目包含与目标传输方式不兼容的字段。",
}
