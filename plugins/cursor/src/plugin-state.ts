function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function safeName(name: string): string {
  if (!name || name.startsWith(".") || name !== name.trim() || /[\\/<>:"|?*]/.test(name) || [...name].some((char) => char.codePointAt(0)! < 32) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(name)) {
    throw new Error("Invalid Cursor plugin name")
  }
  return name
}

export function nativePath(value: string): void {
  const path = value.startsWith("./") ? value.slice(2) : value
  if (!path || path.startsWith("/") || /[\\:]/.test(path) || path.split("/").some((part, index, parts) => (part === "" && index !== parts.length - 1) || part === "." || part === ".." || [...part].some((char) => char.codePointAt(0)! < 32))) {
    throw new Error(`Invalid Cursor plugin component path: ${value}`)
  }
}

export function rejectUnsupportedVariables(value: unknown): void {
  if (typeof value === "string" && /\$\{(?:PLUGIN_ROOT|PLUGIN_DATA|CLAUDE_PLUGIN_ROOT|CLAUDE_PLUGIN_DATA)\}/.test(value)) {
    throw new Error("Unsupported plugin variable")
  }
  if (Array.isArray(value)) value.forEach(rejectUnsupportedVariables)
  else if (object(value)) Object.values(value).forEach(rejectUnsupportedVariables)
}

export function nativeManifest(text: string | null, name: string): Record<string, unknown> {
  if (text === null) throw new Error("Cursor native plugin manifest is required")
  const manifest: unknown = JSON.parse(text)
  if (!object(manifest) || manifest.name !== safeName(name)) throw new Error("Cursor plugin manifest name must match the pack")
  if (manifest.version !== undefined && typeof manifest.version !== "string") throw new Error("Invalid Cursor plugin version")
  for (const key of ["skills", "rules", "agents", "commands"]) {
    const field = manifest[key]
    if (field === undefined) continue
    const paths = Array.isArray(field) ? field : [field]
    if (paths.length === 0 || paths.some((item) => typeof item !== "string")) throw new Error(`Invalid ${key} paths`)
    for (const item of paths) nativePath(item as string)
  }
  const hooks = manifest.hooks
  if (typeof hooks === "string") nativePath(hooks)
  else if (hooks !== undefined && !object(hooks)) throw new Error("Invalid hooks configuration")
  const mcp = manifest.mcpServers
  if (mcp !== undefined) {
    for (const entry of Array.isArray(mcp) ? mcp : [mcp]) {
      if (typeof entry === "string") nativePath(entry)
      else if (!object(entry)) throw new Error("Invalid MCP configuration")
    }
  }
  for (const key of ["icon", "logo"]) {
    const value = manifest[key]
    if (value !== undefined) {
      if (typeof value !== "string") throw new Error(`Invalid ${key} path`)
      if (key !== "logo" || !/^https:\/\//i.test(value)) nativePath(value)
    }
  }
  if (manifest.variables !== undefined && !object(manifest.variables)) throw new Error("Invalid variables schema")
  rejectUnsupportedVariables(manifest)
  return manifest
}
