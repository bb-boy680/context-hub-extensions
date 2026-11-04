import { describe, expect, it } from "vitest"
import { createQoderMcp } from "../src/provider.ts"
import { local, memoryIo, tools } from "./helpers.ts"

const key = "mcp" + "Servers"
const provider = createQoderMcp(tools)
const doc = (servers: unknown) => JSON.stringify({ [key]: servers, hooks: { keep: true } })

describe("Qoder MCP", () => {
  it("仅提供两个安装入口，扫描四个物理文件", async () => {
    expect(provider.places.filter((place) => place.installable !== false)).toHaveLength(2)
    const { io, files } = memoryIo()
    for (const place of provider.places) await provider.install(io, place.id, place.id, local)
    expect(files.size).toBe(4)
    for (const place of provider.places) {
      const entries = await provider.read(io, place.id)
      expect(entries.map((entry) => entry.name)).toEqual([place.id])
    }
  })

  it.each([
    [{ command: "node" }, "stdio"],
    [{ type: "stdio", command: "node", args: [], env: {} }, "stdio"],
    [{ type: "http", url: "https://example.test", headers: {} }, "http"],
    [{ type: "streamable-http", url: "https://example.test" }, "http"],
    [{ type: "sse", url: "https://example.test" }, "sse"],
  ])("读取有效原生格式 %#", async (entry, transport) => {
    const { io } = memoryIo({ "global:.qoder/settings.json": doc({ server: entry }) })
    expect((await provider.read(io, "qoder-global"))[0]!.declaration?.transport).toBe(transport)
  })

  it("重装保留 disabled、cwd 与其他字段，启停和移除只改对应条目", async () => {
    const { io, files } = memoryIo({ "global:.qoder/settings.json": doc({ server: { command: "old", disabled: true, cwd: "/tmp", timeout: 20 }, other: { command: "other" } }) })
    await provider.install(io, "qoder-global", "server", local)
    let state = JSON.parse(files.get("global:.qoder/settings.json")!)
    expect(state[key].server).toMatchObject({ command: "node", disabled: true, cwd: "/tmp", timeout: 20 })
    expect(state[key].other.command).toBe("other")
    expect(state.hooks.keep).toBe(true)
    expect((await provider.read(io, "qoder-global"))[0]!.enabled).toBe(false)
    await provider.setEnabled(io, "qoder-global", "global", "server", true)
    state = JSON.parse(files.get("global:.qoder/settings.json")!)
    expect(state[key].server.disabled).toBe(false)
    await provider.setEnabled(io, "qoder-global", "global", "server", false)
    expect(await provider.locate(io, "qoder-global", "server")).toEqual([2, 4])
    await provider.uninstall(io, "qoder-global", "server")
    state = JSON.parse(files.get("global:.qoder/settings.json")!)
    expect(state[key].server).toBeUndefined()
    expect(state[key].other.command).toBe("other")
  })

  it.each([
    { type: "ws", url: "wss://example.test" }, { type: "sdk", command: "node" },
    { command: "node", qoder_url: "x" }, { command: "node", url: "x" },
    { command: "node", args: [1] }, { command: "node", env: { X: 2 } },
    { command: "node", disabled: "false" }, { type: "http", url: "x", headers: { X: 2 } },
  ])("不支持的声明可见但不可改写 %#", async (entry) => {
    const text = doc({ server: entry })
    const { io, files, writes } = memoryIo({ "global:.qoder/settings.json": text })
    expect((await provider.read(io, "qoder-global"))[0]!.declaration).toBeNull()
    await expect(provider.install(io, "qoder-global", "server", local)).rejects.toMatchObject({ key: "qoder.error.unsupported" })
    await expect(provider.uninstall(io, "qoder-global", "server")).rejects.toMatchObject({ key: "qoder.error.unsupported" })
    expect(writes).toHaveLength(0)
    expect(files.get("global:.qoder/settings.json")).toBe(text)
  })

  it.each(["", "[]", "{", JSON.stringify({ [key]: [] })])("坏文件禁止写入 %#", async (text) => {
    const { io, writes } = memoryIo({ "global:.qoder/settings.json": text })
    await expect(provider.install(io, "qoder-global", "server", local)).rejects.toMatchObject({ key: "qoder.error.json" })
    expect(writes).toHaveLength(0)
  })

  it("拒绝错误作用域及隐含 cwd 的协议切换", async () => {
    const { io, writes } = memoryIo({ "global:.qoder/settings.json": doc({ server: { command: "node", cwd: "/tmp" } }) })
    await expect(provider.setEnabled(io, "qoder-global", "workspace", "server", false)).rejects.toMatchObject({ key: "qoder.error.scope" })
    await expect(provider.install(io, "qoder-global", "server", { transport: "http", url: "https://example.test", headers: {} })).rejects.toMatchObject({ key: "qoder.error.unsupported" })
    expect(writes).toHaveLength(0)
  })
})
