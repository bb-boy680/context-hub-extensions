import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { promises as fs } from "node:fs"
import path from "node:path"
import { createCursorInstaller } from "../src/installer.ts"
import { fixture, hostAvailable } from "./fixtures.ts"

let f: Awaited<ReturnType<typeof fixture>>
beforeEach(async () => { f = await fixture() })
afterEach(async () => { await f.cleanup() })
const installer = createCursorInstaller()

describe.skipIf(!hostAvailable)("Cursor plugin installation", () => {
  it("reports an incompatible host explicitly", async () => {
    await expect(installer.available({ ...f.tools, disk: undefined })).rejects.toThrow(/transaction API/)
  })
  it("copies and removes a complete native pack with unknown enabled status", async () => {
    await f.pack()
    expect(await installer.available(f.tools)).toBe(true)
    await installer.install("demo", "user", f.tools)
    const destination = path.join(f.userHome, ".cursor", "plugins", "local", "demo")
    expect(await fs.readFile(path.join(destination, "skills", "hello", "SKILL.md"), "utf8")).toBe("fixture")
    expect(await installer.held(f.tools)).toMatchObject([{ id: "local:demo", readOnly: false, marketplace: null }])
    expect((await installer.held(f.tools))[0]?.enabled).toBeUndefined()
    expect(installer.setEnabled).toBeUndefined()
    await installer.install("demo", "user", f.tools)
    await installer.remove("local:demo", "user", f.tools)
    expect(await installer.held(f.tools)).toEqual([])
    await expect(fs.stat(destination)).rejects.toThrow()
  })
  it("refuses modified or hand-written directories and foreign IDs", async () => {
    await f.pack()
    const destination = path.join(f.userHome, ".cursor", "plugins", "local", "demo")
    await fs.mkdir(destination, { recursive: true })
    await fs.writeFile(path.join(destination, "own.txt"), "mine")
    await expect(installer.install("demo", "user", f.tools)).rejects.toThrow(/conflict/)
    await expect(installer.remove("local:demo", "user", f.tools)).rejects.toThrow()
    expect(await fs.readFile(path.join(destination, "own.txt"), "utf8")).toBe("mine")
    await fs.rm(destination, { recursive: true })
    await installer.install("demo", "user", f.tools)
    await fs.writeFile(path.join(destination, "own.txt"), "mine")
    await expect(installer.remove("local:demo", "user", f.tools)).rejects.toThrow(/modified/)
    await expect(installer.install("demo", "user", f.tools)).rejects.toThrow(/modified/)
    expect((await installer.held(f.tools))[0]?.readOnly).toBe(true)
    await expect(installer.remove("demo@market", "user", f.tools)).rejects.toThrow()
    await expect(installer.install("demo", "project", f.tools)).rejects.toThrow()
  })
  it("keeps the directory when ownership state cannot be committed", async () => {
    await f.pack()
    await installer.install("demo", "user", f.tools)
    const disk = f.tools.disk!
    const original = disk.commit.bind(disk)
    disk.commit = async (roots, changes, copy, remove) => {
      await fs.writeFile(path.join(f.userHome, ".cursor", "plugins", "context-hub-ownership.json"), "{}")
      return original(roots, changes, copy, remove)
    }
    await expect(installer.remove("local:demo", "user", f.tools)).rejects.toThrow(/changed/)
    expect(await fs.readFile(path.join(f.userHome, ".cursor", "plugins", "local", "demo", "skills", "hello", "SKILL.md"), "utf8")).toBe("fixture")
  })
  it("refuses a target changed between snapshot and removal", async () => {
    await f.pack()
    await installer.install("demo", "user", f.tools)
    const disk = f.tools.disk!
    const original = disk.commit.bind(disk)
    disk.commit = async (roots, changes, copy, remove) => {
      await fs.writeFile(path.join(f.userHome, ".cursor", "plugins", "local", "demo", "user.txt"), "keep")
      return original(roots, changes, copy, remove)
    }
    await expect(installer.remove("local:demo", "user", f.tools)).rejects.toThrow(/changed/)
    expect(await fs.readFile(path.join(f.userHome, ".cursor", "plugins", "local", "demo", "user.txt"), "utf8")).toBe("keep")
  })
  it("binds manifest validation to the copied source snapshot", async () => {
    await f.pack()
    const disk = f.tools.disk!
    const original = disk.commit.bind(disk)
    disk.commit = async (roots, changes, copy, remove) => {
      await fs.writeFile(path.join(f.library.root, "demo", ".cursor-plugin", "plugin.json"), '{"name":"demo","rules":"../outside"}')
      return original(roots, changes, copy, remove)
    }
    await expect(installer.install("demo", "user", f.tools)).rejects.toThrow(/changed/)
    await expect(fs.stat(path.join(f.userHome, ".cursor", "plugins", "local", "demo"))).rejects.toThrow()
  })
  it("rejects unsupported variables in package text before copying", async () => {
    await f.pack()
    await fs.writeFile(path.join(f.library.root, "demo", "mcp.json"), '{"mcpServers":{"demo":{"command":"${PLUGIN_ROOT}/run"}}}')
    await expect(installer.install("demo", "user", f.tools)).rejects.toThrow(/Unsupported plugin variable/)
    await expect(fs.stat(path.join(f.userHome, ".cursor", "plugins", "local", "demo"))).rejects.toThrow()
  })
  it("checks an explicit MCP configuration even with a binary-looking suffix", async () => {
    await f.pack("demo", { name: "demo", mcpServers: "config.png" })
    await fs.writeFile(path.join(f.library.root, "demo", "config.png"), '{"mcpServers":{"demo":{"command":"${PLUGIN_DATA}"}}}')
    await expect(installer.install("demo", "user", f.tools)).rejects.toThrow(/Unsupported plugin variable/)
  })
  it("rejects a standard-only pack without copying", async () => {
    await f.pack()
    const source = path.join(f.library.root, "demo")
    await fs.rename(path.join(source, ".cursor-plugin", "plugin.json"), path.join(source, "plugin.json"))
    await expect(installer.install("demo", "user", f.tools)).rejects.toThrow(/native plugin manifest/)
    await expect(fs.stat(path.join(f.userHome, ".cursor", "plugins", "local", "demo"))).rejects.toThrow()
  })
  it("rejects unsafe manifests before writing any destination", async () => {
    await f.pack("demo", { name: "demo", rules: "../outside" })
    await expect(installer.install("demo", "user", f.tools)).rejects.toThrow(/path/)
    await expect(fs.stat(path.join(f.userHome, ".cursor", "plugins", "local", "demo"))).rejects.toThrow()
  })
})
