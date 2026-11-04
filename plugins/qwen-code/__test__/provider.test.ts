import { describe, expect, it } from "vitest"
import { createQwenCodeMcp } from "../src/provider.ts"
import { mcpTools, memoryFiles } from "./fixtures.ts"

const provider = createQwenCodeMcp(mcpTools)
const file = { scope: "workspace", file: ".qwen/settings.json" } as const
const stdio = { transport: "stdio", command: "node", args: ["${INPUT}"], env: { KEY: "${TOKEN}" } } as const

describe("Qwen MCP", () => {
  it("round trips stdio, HTTP and SSE without changing other entries", async () => {
    const { files, mcpIo } = memoryFiles()
    await files.write(file, JSON.stringify({ theme: "dark", mcpServers: { other: { command: "other" } } }))
    await provider.install(mcpIo, "qwen-code", "one", { ...stdio, args: [...stdio.args] })
    expect((await provider.read(mcpIo, "qwen-code")).find(item => item.name === "one")?.declaration).toEqual(stdio)
    await provider.install(mcpIo, "qwen-code", "one", { transport: "http", url: "https://example.test", headers: {} })
    let doc = JSON.parse((await files.read(file))!)
    expect(doc.mcpServers.one).toEqual({ httpUrl: "https://example.test" })
    await provider.install(mcpIo, "qwen-code", "one", { transport: "sse", url: "https://example.test/sse", headers: {} })
    doc = JSON.parse((await files.read(file))!)
    expect(doc.mcpServers.one).toEqual({ url: "https://example.test/sse" })
    expect((await provider.read(mcpIo, "qwen-code")).find(item => item.name === "one")?.declaration?.transport).toBe("sse")
    await provider.uninstall(mcpIo, "qwen-code", "one")
    await provider.uninstall(mcpIo, "qwen-code", "one")
    expect(JSON.parse((await files.read(file))!)).toEqual({ theme: "dark", mcpServers: { other: { command: "other" } } })
    expect(provider.places.every(place => !place.switchable)).toBe(true)
  })
  it("keeps unrecognized entries visible and refuses to change them", async () => {
    const { files, mcpIo } = memoryFiles()
    const original = JSON.stringify({ mcpServers: { mixed: { command: "x", httpUrl: "https://example.test" } } })
    await files.write(file, original)
    expect((await provider.read(mcpIo, "qwen-code"))[0].declaration).toBeNull()
    await expect(provider.uninstall(mcpIo, "qwen-code", "mixed")).rejects.toThrow()
    await expect(provider.install(mcpIo, "qwen-code", "mixed", { ...stdio, args: [...stdio.args] })).rejects.toThrow()
    expect(await files.read(file)).toBe(original)
  })
  it("rejects incompatible extras and malformed files without writing", async () => {
    const { files, mcpIo } = memoryFiles()
    for (const text of ["", "{", JSON.stringify({ mcpServers: [] }), JSON.stringify({ mcpServers: { one: { command: "x", cwd: "/keep" } } })]) {
      await files.write(file, text)
      await expect(provider.install(mcpIo, "qwen-code", "one", { transport: "http", url: "https://example.test", headers: {} })).rejects.toThrow()
      expect(await files.read(file)).toBe(text)
    }
  })
  it("preserves unrelated per-server fields and refuses malformed known fields", async () => {
    const { files, mcpIo } = memoryFiles()
    const initial = JSON.stringify({ mcpServers: { one: { command: "old", args: ["x"], env: { KEY: "${SECRET}" }, cwd: "/keep", timeout: 20 } } })
    await files.write(file, initial)
    await expect(provider.install(mcpIo, "qwen-code", "one", { transport: "stdio", command: "  ", args: [], env: {} })).rejects.toThrow()
    expect(await files.read(file)).toBe(initial)
    await provider.install(mcpIo, "qwen-code", "one", { transport: "stdio", command: "new", args: [], env: {} })
    const changed = JSON.parse((await files.read(file))!)
    expect(changed.mcpServers.one).toEqual({ command: "new", cwd: "/keep", timeout: 20 })
    for (const entry of [{ command: "x", args: [1] }, { command: "x", env: { A: 1 } }, { url: "x", headers: { A: 1 } }]) {
      const invalid = JSON.stringify({ mcpServers: { one: entry } })
      await files.write(file, invalid)
      expect((await provider.read(mcpIo, "qwen-code"))[0].declaration).toBeNull()
      await expect(provider.install(mcpIo, "qwen-code", "one", { ...stdio, args: [...stdio.args] })).rejects.toThrow()
      expect(await files.read(file)).toBe(invalid)
    }
  })
  it("supports global files independently", async () => {
    const { files, mcpIo } = memoryFiles()
    await provider.install(mcpIo, "qwen-code-global", "one", { ...stdio, args: [...stdio.args] })
    expect(await files.read(file)).toBeNull()
    expect((await provider.read(mcpIo, "qwen-code-global"))[0].declaration).toEqual(stdio)
  })
})
