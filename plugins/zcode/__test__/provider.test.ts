import { describe, expect, it } from "vitest"
import { createZCodeMcp } from "../src/provider.ts"
import { local, memoryIo, tools } from "./helpers.ts"

const globalFile = "global:.zcode/cli/config.json"
const workspaceFile = "workspace:.zcode/config.json"

describe("ZCode 当前 MCP", () => {
  it("只提供两个原生 place，各 transport 显式写 type，两个作用域独立", async () => {
    const provider = createZCodeMcp(tools)
    expect(provider.places.map(({ id, file }) => [id, file])).toEqual([
      ["zcode-global", ".zcode/cli/config.json"], ["zcode", ".zcode/config.json"],
    ])
    const { io, files } = memoryIo()
    await provider.install(io, "zcode-global", "local", local)
    await provider.install(io, "zcode", "http", { transport: "http", url: "https://example.test/mcp", headers: { X: "one" } })
    await provider.install(io, "zcode", "sse", { transport: "sse", url: "https://example.test/sse", headers: {} })
    expect((await provider.read(io, "zcode-global"))[0]!.declaration).toEqual(local)
    expect((await provider.read(io, "zcode")).map((entry) => entry.declaration?.transport)).toEqual(["http", "sse"])
    expect(JSON.parse(files.get(globalFile)!).mcp.servers.local.type).toBe("stdio")
    expect(JSON.parse(files.get(workspaceFile)!).mcp.servers.local).toBeUndefined()
  })

  it("重装保留 false 和非管理字段，开关只修改 canonical enabled", async () => {
    const state = { mcp: { servers: { local: { type: "stdio", command: "old", enabled: false, oauth: { keep: true }, timeoutMs: 30 } } }, plugins: { options: { demo: 1 } }, hooks: { enabled: true } }
    const { io, files } = memoryIo({ [globalFile]: JSON.stringify(state) })
    const provider = createZCodeMcp(tools)
    await provider.install(io, "zcode-global", "local", local)
    const after = JSON.parse(files.get(globalFile)!)
    expect(after.mcp.servers.local.enabled).toBe(false)
    expect(after.mcp.servers.local.oauth).toEqual({ keep: true })
    expect(after.mcp.servers.local.timeoutMs).toBe(30)
    expect(after.plugins).toEqual(state.plugins)
    expect(after.hooks).toEqual(state.hooks)
    await provider.setEnabled(io, "zcode-global", "global", "local", true)
    expect(JSON.parse(files.get(globalFile)!).mcp.servers.local.enabled).toBeUndefined()
    await provider.setEnabled(io, "zcode-global", "global", "local", false)
    expect((await provider.read(io, "zcode-global"))[0]!.enabled).toBe(false)
    await expect(provider.setEnabled(io, "zcode-global", "workspace", "local", true)).rejects.toMatchObject({ key: "zcode.error.scope" })
    expect(await provider.locate(io, "zcode-global", "local")).toEqual([2, 4])
  })

  it.each(["", "{", "[]", "null", '{"mcp":null}', '{"mcp":{"servers":[]}}', '{/* comment */}', '{"mcp":{},}'])("严格拒绝坏 JSON 或错误中间节点且零写入 %s", async (text) => {
    const { io, files, writes } = memoryIo({ [globalFile]: text })
    const provider = createZCodeMcp(tools)
    await expect(provider.read(io, "zcode-global")).rejects.toMatchObject({ key: "zcode.error.json" })
    await expect(provider.install(io, "zcode-global", "local", local)).rejects.toMatchObject({ key: "zcode.error.json" })
    await expect(provider.uninstall(io, "zcode-global", "local")).rejects.toMatchObject({ key: "zcode.error.json" })
    expect(writes).toEqual([])
    expect(files.get(globalFile)).toBe(text)
  })

  it.each([
    { type: "stdio", command: "node", environment: {} },
    { type: "http", url: "https://example.test", http_headers: {} },
    { type: "stdio", command: "node", enable: false, enabled: true },
    { type: "remote", url: "https://example.test" },
    { command: "node" },
    { type: "stdio", command: "node", args: [1] },
  ])("旧字段和新旧并存只读为不支持，所有修改零写入 %j", async (entry) => {
    const original = JSON.stringify({ mcp: { servers: { local: entry } } })
    const { io, files, writes } = memoryIo({ [globalFile]: original })
    const provider = createZCodeMcp(tools)
    expect((await provider.read(io, "zcode-global"))[0]!.declaration).toBeNull()
    await expect(provider.install(io, "zcode-global", "local", local)).rejects.toMatchObject({ key: "zcode.error.unsupported" })
    await expect(provider.setEnabled(io, "zcode-global", "global", "local", true)).rejects.toMatchObject({ key: "zcode.error.unsupported" })
    await expect(provider.uninstall(io, "zcode-global", "local")).rejects.toMatchObject({ key: "zcode.error.unsupported" })
    expect(writes).toEqual([])
    expect(files.get(globalFile)).toBe(original)
  })

  it.each(["global", "workspace"] as const)("首次原生写入先保护 %s Desktop fallback，删除最后一个允许其重现", async (scope) => {
    const place = scope === "global" ? "zcode-global" : "zcode"
    const native = scope === "global" ? globalFile : workspaceFile
    const fallback = `${scope}:.agents/mcp.json`
    const raw = '{ "mcpServers": { "shared": { "command": "private-command" } } }'
    const { io, files, writes } = memoryIo({ [fallback]: raw })
    const provider = createZCodeMcp(tools)
    await expect(provider.install(io, place, "local", local)).rejects.toMatchObject({ key: "zcode.error.fallback", params: { file: ".agents/mcp.json" } })
    expect(writes).toEqual([])
    files.set(native, '{ "mcp": { "servers": { "local": { "type": "stdio", "command": "node" } } } }')
    await provider.uninstall(io, place, "local")
    expect(JSON.parse(files.get(native)!).mcp.servers).toEqual({})
    expect(files.get(fallback)).toBe(raw)
    await expect(provider.install(io, place, "local", local)).rejects.toMatchObject({ key: "zcode.error.fallback" })
    expect(writes.every((ref) => ref.file !== ".agents/mcp.json")).toBe(true)
  })

  it("文件读取失败不写，未知 place 在读取前失败", async () => {
    const { io, writes } = memoryIo()
    io.files.read = async () => { throw new Error("EACCES") }
    const provider = createZCodeMcp(tools)
    await expect(provider.install(io, "zcode-global", "local", local)).rejects.toMatchObject({ key: "zcode.error.refused" })
    await expect(provider.install(io, "unknown", "local", local)).rejects.toMatchObject({ key: "zcode.error.unknownPlace" })
    expect(writes).toEqual([])
  })
})
