import type { McpDeclaration } from "./contracts.ts"

export function validServerName(name: string): boolean {
  return typeof name === "string" && /^[A-Za-z0-9_-]{1,32}$/.test(name)
}

function strings(value: unknown): Record<string, string> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null
  const entries = Object.entries(value)
  return entries.every(([, item]) => typeof item === "string")
    ? Object.fromEntries(entries) as Record<string, string>
    : null
}

// 调用方必须先检查 YAML 节点标签；表达式解析后的字符串不能当作字面量。
export function readMcpConfig(config: Record<string, unknown>): McpDeclaration | null {
  if (config.transport === "stdio") {
    const args = config.args === undefined ? [] : config.args
    const env = config.env === undefined ? {} : strings(config.env)
    if (typeof config.command !== "string" || config.command.trim() === "" ||
      !Array.isArray(args) || !args.every((arg) => typeof arg === "string") || env === null) return null
    return { transport: "stdio", command: config.command, args, env }
  }
  if (config.transport === "streamable-http") {
    const headers = config.headers === undefined ? {} : strings(config.headers)
    if (typeof config.url !== "string" || config.url.trim() === "" || headers === null) return null
    return { transport: "http", url: config.url, headers }
  }
  return null
}

export function writeMcpConfig(name: string, declaration: McpDeclaration): Record<string, unknown> | null {
  if (!validServerName(name)) return null
  if (declaration.transport === "stdio") {
    if (!Array.isArray(declaration.args) || !declaration.args.every((arg) => typeof arg === "string") || strings(declaration.env) === null) return null
    const config = { serverName: name, transport: "stdio", command: declaration.command, args: declaration.args, env: declaration.env }
    return readMcpConfig(config) === null ? null : config
  }
  if (declaration.transport === "http") {
    if (strings(declaration.headers) === null) return null
    const config = { serverName: name, transport: "streamable-http", url: declaration.url, headers: declaration.headers }
    return readMcpConfig(config) === null ? null : config
  }
  return null
}
