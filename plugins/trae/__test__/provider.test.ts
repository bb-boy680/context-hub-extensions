import { describe, expect, it } from "vitest"
import type { McpIo, McpTools } from "../src/contracts.ts"
import { createTraeIdeMcp } from "../src/provider.ts"

class TestError extends Error {
  constructor(public key: string, _params?: Record<string, string>, detail?: string) { super(detail ?? key) }
}
const key = ["mcp", "Servers"].join("")
const tools = {
  McpError: TestError,
  readJsonObject: (text: string | null) => {
    if (!text?.trim()) return null
    const value = JSON.parse(text)
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("root")
    return value
  },
  editJson: (text: string | null, path: string[], value: unknown) => {
    const root = text?.trim() ? JSON.parse(text) : {}
    let node = root
    for (const segment of path.slice(0, -1)) node = node[segment] ??= {}
    if (value === undefined) delete node[path.at(-1)!]
    else node[path.at(-1)!] = value
    return JSON.stringify(root)
  },
  jsonValueLines: () => [2, 3],
} as unknown as McpTools

function memory(initial: string | null = null) {
  let text = initial
  let writes = 0
  const io: McpIo = {
    files: {
      read: async () => text,
      write: async (_ref, next) => { text = next; writes++ },
    },
    log: () => undefined,
  }
  return { io, text: () => text, writes: () => writes }
}
const place = "trae-ide-mcp"
const local = { transport: "stdio" as const, command: "node", args: ["a b", "${workspaceFolder}"], env: { A: "x y" } }
const remote = { transport: "http" as const, url: "https://example.test/mcp", headers: { Authorization: "Bearer test" } }

describe("Trae IDE MCP", () => {
  it("installs, reads, updates and removes only the selected entry", async () => {
    const storage = memory(JSON.stringify({ theme: "dark", [key]: { existing: { command: "old", custom: 1 } } }))
    const provider = createTraeIdeMcp(tools)
    await provider.install(storage.io, place, "demo", local)
    expect((await provider.read(storage.io, place)).find((entry) => entry.name === "demo")?.declaration).toEqual(local)
    await provider.install(storage.io, place, "demo", remote)
    await provider.install(storage.io, place, "demo", remote)
    const document = JSON.parse(storage.text()!)
    expect(document.theme).toBe("dark")
    expect(document[key].existing).toEqual({ command: "old", custom: 1 })
    expect(document[key].demo).toEqual({ url: remote.url, headers: remote.headers })
    expect(await provider.locate(storage.io, place, "demo")).toEqual([2, 3])
    await provider.uninstall(storage.io, place, "demo")
    expect(JSON.parse(storage.text()!)[key]).toEqual({ existing: { command: "old", custom: 1 } })
  })
  it("retains unrelated fields of an existing entry", async () => {
    const storage = memory(JSON.stringify({ [key]: { demo: { command: "old", custom: 1 } } }))
    await createTraeIdeMcp(tools).install(storage.io, place, "demo", local)
    expect(JSON.parse(storage.text()!)[key].demo.custom).toBe(1)
  })
  it.each([
    ["bad root", "[]"], ["bad container", JSON.stringify({ [key]: [] })],
    ["bad entry", JSON.stringify({ [key]: { demo: 1 } })],
    ["ambiguous entry", JSON.stringify({ [key]: { demo: { command: "node", url: "x" } } })],
    ["unknown transport", JSON.stringify({ [key]: { demo: { command: "node", transport: "other" } } })],
    ["unknown switch", JSON.stringify({ [key]: { demo: { command: "node", disabled: true } } })],
    ["broken document", "{"],
  ])("refuses %s without writes", async (_label, initial) => {
    const storage = memory(initial)
    await expect(createTraeIdeMcp(tools).install(storage.io, place, "demo", local)).rejects.toThrow()
    expect(storage.writes()).toBe(0)
    expect(storage.text()).toBe(initial)
  })
  it("rejects SSE and commands containing whitespace before writing", async () => {
    const storage = memory()
    const provider = createTraeIdeMcp(tools)
    await expect(provider.install(storage.io, place, "demo", { ...remote, transport: "sse" })).rejects.toThrow()
    await expect(provider.install(storage.io, place, "demo", { ...local, command: "node server" })).rejects.toThrow()
    expect(storage.writes()).toBe(0)
  })
})
