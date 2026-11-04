export interface InstalledRecord extends Record<string, unknown> {
  id: string
  root: string
  enabled: boolean
}
export interface InstalledDocument extends Record<string, unknown> {
  version: 1
  plugins: InstalledRecord[]
}

export function readInstalled(text: string | null): InstalledDocument {
  if (text === null) return { version: 1, plugins: [] }
  let value: unknown
  try { value = JSON.parse(text) } catch { throw new Error("Invalid Kimi installed.json; file was not changed") }
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Invalid Kimi installed.json")
  const doc = value as Record<string, unknown>
  if (doc.version !== 1 || !Array.isArray(doc.plugins)) throw new Error("Unsupported Kimi installed.json version or plugins list")
  const ids = new Set<string>()
  for (const record of doc.plugins) {
    if (typeof record !== "object" || record === null || Array.isArray(record) ||
      typeof record.id !== "string" || record.id === "" || typeof record.root !== "string" || record.root === "" ||
      typeof record.enabled !== "boolean" || ids.has(record.id)) throw new Error("Invalid or duplicate Kimi plugin record")
    ids.add(record.id)
  }
  return doc as InstalledDocument
}
