import { existsSync } from "node:fs"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { afterEach, describe, expect, it } from "vitest"
import type { McpIo, McpTools } from "../src/contracts.ts"
import { createDeepSeekHarnessMcp } from "../src/mcp.ts"

const checkout = process.env.CONTEXT_HUB_CHECKOUT
const enabled = checkout !== undefined && checkout.trim() !== ""
if (enabled && !path.isAbsolute(checkout)) throw new Error("CONTEXT_HUB_CHECKOUT must be absolute")
const trees: string[] = []
afterEach(async () => { await Promise.all(trees.splice(0).map((tree) => rm(tree, { recursive: true, force: true }))) })

const host = enabled ? describe : describe.skip
host("DeepSeek MCP with real host ports", () => {
  it("installs, reads, switches, changes transport and uninstalls without touching unrelated text", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "dsh-mcp-"))
    trees.push(root)
    const userHome = path.join(root, "user")
    const dshHome = path.join(root, "dsh")
    const filesModule = await import(pathToFileURL(path.join(checkout!, "packages/core/src/host/place-files.ts")).href)
    const toolkit = await import(pathToFileURL(path.join(checkout!, "packages/resources/mcp/src/toolkit.ts")).href)
    const files = filesModule.createFsPlaceFiles({ home: path.join(root, "hub"), folder: path.join(root, "workspace"), userHome, env: { DSH_HOME: dshHome } })
    const io = { files, log: () => undefined } as McpIo
    const provider = createDeepSeekHarnessMcp(toolkit.mcpTools as McpTools)
    const place = "deepseek-harness-home"
    const file = path.join(dshHome, "cordis.patch.yml")
    const local = { transport: "stdio" as const, command: "node", args: ["server.js", "a # b", "quoted 'value'"], env: { MODE: "test\nline" } }
    const remote = { transport: "http" as const, url: "https://example.test/mcp", headers: { Accept: "application/json" } }
    await provider.install(io, place, "example", local)
    await provider.install(io, place, "example", local)
    expect((await readFile(file, "utf8")).match(/serverName:/g)).toHaveLength(1)
    const unchanged = await readFile(file, "utf8")
    await expect(provider.install(io, place, "example", { transport: "sse", url: "https://example.test/sse", headers: {} })).rejects.toThrow()
    await expect(provider.setEnabled(io, place, "workspace", "example", false)).rejects.toThrow()
    await expect(provider.install(io, place, "bad name", local)).rejects.toThrow()
    expect(await readFile(file, "utf8")).toBe(unchanged)
    expect(await provider.read(io, place)).toEqual([{ name: "example", declaration: local, enabled: true }])
    const lines = await provider.locate(io, place, "example")
    expect(lines?.[0]).toBeGreaterThan(0)
    const located = (await readFile(file, "utf8")).split("\n").slice(lines![0] - 1, lines![1]).join("\n")
    expect(located).toContain("serverName:")
    expect(located).toContain("command:")
    await provider.setEnabled(io, place, "global", "example", false)
    const disabledText = await readFile(file, "utf8")
    await provider.setEnabled(io, place, "global", "example", false)
    expect(await readFile(file, "utf8")).toBe(disabledText)
    expect((await provider.read(io, place))[0]?.enabled).toBe(false)
    await provider.install(io, place, "example", local)
    expect((await provider.read(io, place))[0]?.enabled).toBe(false)
    await provider.setEnabled(io, place, "global", "example", true)
    expect((await provider.read(io, place))[0]?.enabled).toBe(true)
    await provider.install(io, place, "example", remote)
    expect((await provider.read(io, place))[0]?.declaration).toEqual(remote)
    const generatedId = /id: "([^"]+)"/.exec(unchanged)?.[1]
    expect(generatedId).toBeTruthy()
    await provider.uninstall(io, place, "example")
    expect(await provider.read(io, place)).toEqual([])
    expect(existsSync(file)).toBe(true)
    const occupied = `- insert:\n    - id: "${generatedId}"\n      name: unrelated-module\n`
    await writeFile(file, occupied)
    await expect(provider.install(io, place, "example", local)).rejects.toThrow()
    expect(await readFile(file, "utf8")).toBe(occupied)
  })

  it("preserves unrelated expressions, comments and unknown options while updating a server", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "dsh-mcp-preserve-"))
    trees.push(root)
    const dshHome = path.join(root, "dsh")
    await mkdir(dshHome, { recursive: true })
    const file = path.join(dshHome, "cordis.patch.yml")
    const source = "# user comment\n- insert:\n    - id: unrelated\n      name: another-module\n      config: !!js globalThis.__dshProbe++\n- insert:\n    - id: manual\n      name: '@deepseek-ai/dsh-mcp-client'\n      config:\n        serverName: example\n        transport: stdio\n        command: old # keep command comment\n        toolCallTimeoutMs: 1234\n        customOption: !!js globalThis.__dshProbe++\n        note: |-\n          keep block # literal\n- id: another-entry\n  disabled: true\n".replace(/\n/g, "\r\n")
    await writeFile(file, source)
    const filesModule = await import(pathToFileURL(path.join(checkout!, "packages/core/src/host/place-files.ts")).href)
    const toolkit = await import(pathToFileURL(path.join(checkout!, "packages/resources/mcp/src/toolkit.ts")).href)
    const io = { files: filesModule.createFsPlaceFiles({ home: path.join(root, "hub"), folder: path.join(root, "workspace"), userHome: path.join(root, "user"), env: { DSH_HOME: dshHome } }), log: () => undefined } as McpIo
    const provider = createDeepSeekHarnessMcp(toolkit.mcpTools as McpTools)
    const global = globalThis as typeof globalThis & { __dshProbe?: number }
    global.__dshProbe = 0
    await provider.install(io, "deepseek-harness-home", "example", { transport: "stdio", command: "new", args: [], env: {} })
    const written = await readFile(file, "utf8")
    expect(written.replace(/\r\n/g, "")).not.toContain("\n")
    expect(written).toContain("# user comment")
    expect(written).toContain("# keep command comment")
    expect(written).toContain("config: !!js globalThis.__dshProbe++")
    expect(written).toContain("toolCallTimeoutMs: 1234")
    expect(written).toContain("customOption: !!js globalThis.__dshProbe++")
    expect(written).toContain("note: |-\r\n          keep block # literal")
    expect(written).toContain("- id: another-entry\r\n  disabled: true")
    expect(global.__dshProbe).toBe(0)
    await provider.install(io, "deepseek-harness-home", "example", { transport: "http", url: "https://example.test/mcp", headers: {} })
    const switched = await readFile(file, "utf8")
    expect(switched).toContain("# keep command comment")
    expect(switched).toContain("toolCallTimeoutMs: 1234")
    expect(switched).toContain("config: !!js globalThis.__dshProbe++")
    expect(switched).not.toContain("command: old")
    expect((await provider.read(io, "deepseek-harness-home"))[0]?.declaration?.transport).toBe("http")
    await expect(provider.uninstall(io, "deepseek-harness-home", "example")).rejects.toThrow()
    expect(await readFile(file, "utf8")).toBe(switched)
    await writeFile(file, switched.replace("        note: |-\r\n          keep block # literal\r\n", ""))
    await provider.uninstall(io, "deepseek-harness-home", "example")
    const removed = await readFile(file, "utf8")
    expect(removed).toContain("# keep command comment")
    expect(removed).toContain("# user comment")
    expect(removed).toContain("config: !!js globalThis.__dshProbe++")
    delete global.__dshProbe
  })

  it("leaves complex or ambiguous declarations unchanged", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "dsh-mcp-refusal-"))
    trees.push(root)
    const dshHome = path.join(root, "dsh")
    await mkdir(dshHome, { recursive: true })
    const file = path.join(dshHome, "cordis.patch.yml")
    const filesModule = await import(pathToFileURL(path.join(checkout!, "packages/core/src/host/place-files.ts")).href)
    const toolkit = await import(pathToFileURL(path.join(checkout!, "packages/resources/mcp/src/toolkit.ts")).href)
    const io = { files: filesModule.createFsPlaceFiles({ home: path.join(root, "hub"), folder: path.join(root, "workspace"), userHome: path.join(root, "user"), env: { DSH_HOME: dshHome } }), log: () => undefined } as McpIo
    const provider = createDeepSeekHarnessMcp(toolkit.mcpTools as McpTools)
    const row = "    - id: mcp-test\n      name: '@deepseek-ai/dsh-mcp-client'\n      config:\n        serverName: example\n        transport: stdio\n        command: node\n"
    const cases = [
      `- insert:\n${row}${row}`,
      `- insert:\n${row}- id: mcp-test\n  disabled: !!js globalThis.__dshProbe++\n`,
      `- insert:\n${row.replace("command: node", "command: !!js globalThis.__dshProbe++")}`,
      `- insert:\n${row.replace("serverName: example", "!!js serverName: example")}`,
      `- insert:\n${row.replace("command: node", "command: node\n        args:\n          - old # preserve this comment")}`,
      `- insert:\n${row}---\n[]\n`,
      `- id: existing-group\n  insert:\n${row}`,
      "- insert:\n    - id: group\n      group: true\n      config:\n        - id: mcp-test\n          name: '@deepseek-ai/dsh-mcp-client'\n          config:\n            serverName: example\n            transport: stdio\n            command: node\n",
      "- insert:\n    - id: other\n      name: other\n      config: &shared { serverName: example, transport: stdio, command: node }\n    - id: mcp-test\n      name: '@deepseek-ai/dsh-mcp-client'\n      config: *shared\n",
      "- insert:\n    - id: other\n      name: other\n      config: &shared { command: node }\n    - id: mcp-test\n      name: '@deepseek-ai/dsh-mcp-client'\n      config:\n        <<: *shared\n        serverName: example\n        transport: stdio\n        command: node\n",
    ]
    for (const source of cases) {
      await writeFile(file, source)
      await expect(provider.install(io, "deepseek-harness-home", "example", { transport: "stdio", command: "new", args: [], env: {} })).rejects.toThrow()
      expect(await readFile(file, "utf8")).toBe(source)
    }
    await writeFile(file, cases[1]!)
    expect((await provider.read(io, "deepseek-harness-home"))[0]).toMatchObject({ name: "example", enabled: null, readOnly: true })
    await expect(provider.setEnabled(io, "deepseek-harness-home", "global", "example", true)).rejects.toThrow()
    expect(await readFile(file, "utf8")).toBe(cases[1])
  })

  it("does not overwrite a concurrent file change", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "dsh-mcp-race-"))
    trees.push(root)
    const dshHome = path.join(root, "dsh")
    await mkdir(dshHome, { recursive: true })
    const file = path.join(dshHome, "cordis.patch.yml")
    await writeFile(file, "[]\n")
    const filesModule = await import(pathToFileURL(path.join(checkout!, "packages/core/src/host/place-files.ts")).href)
    const toolkit = await import(pathToFileURL(path.join(checkout!, "packages/resources/mcp/src/toolkit.ts")).href)
    const files = filesModule.createFsPlaceFiles({ home: path.join(root, "hub"), folder: path.join(root, "workspace"), userHome: path.join(root, "user"), env: { DSH_HOME: dshHome } })
    const original = files.snapshot!.bind(files)
    let snapshots = 0
    files.snapshot = async (ref: Parameters<typeof original>[0]) => {
      snapshots += 1
      if (snapshots === 3) await writeFile(file, "# external edit\n[]\n")
      return original(ref)
    }
    const io = { files, log: () => undefined } as McpIo
    const provider = createDeepSeekHarnessMcp(toolkit.mcpTools as McpTools)
    await expect(provider.install(io, "deepseek-harness-home", "example", { transport: "stdio", command: "node", args: [], env: {} })).rejects.toThrow()
    expect(await readFile(file, "utf8")).toBe("# external edit\n[]\n")
  })

  it("rejects a changed client root after resolving locations", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "dsh-mcp-root-race-"))
    trees.push(root)
    const env = { DSH_HOME: path.join(root, "first") }
    const filesModule = await import(pathToFileURL(path.join(checkout!, "packages/core/src/host/place-files.ts")).href)
    const toolkit = await import(pathToFileURL(path.join(checkout!, "packages/resources/mcp/src/toolkit.ts")).href)
    const io = { files: filesModule.createFsPlaceFiles({ home: path.join(root, "hub"), folder: path.join(root, "workspace"), userHome: path.join(root, "user"), env }), log: () => undefined } as McpIo
    const provider = createDeepSeekHarnessMcp(toolkit.mcpTools as McpTools)
    const oldPlace = (await provider.placesFor(io))[0]!
    env.DSH_HOME = path.join(root, "second")
    await expect(provider.read(io, "deepseek-harness-home")).rejects.toThrow(/root changed/)
    await provider.placesFor(io)
    const pinnedIo = { ...io, place: oldPlace }
    await expect(provider.read(pinnedIo, oldPlace.id)).rejects.toThrow(/root changed/)
    await expect(provider.locate(pinnedIo, oldPlace.id, "example")).rejects.toThrow(/root changed/)
    await expect(provider.install(pinnedIo, oldPlace.id, "example", { transport: "stdio", command: "node", args: [], env: {} })).rejects.toThrow()
    expect(existsSync(path.join(root, "second/cordis.patch.yml"))).toBe(false)
  })

  it("rejects a profile list changed during installation", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "dsh-mcp-profile-race-"))
    trees.push(root)
    const dshHome = path.join(root, "dsh")
    const filesModule = await import(pathToFileURL(path.join(checkout!, "packages/core/src/host/place-files.ts")).href)
    const toolkit = await import(pathToFileURL(path.join(checkout!, "packages/resources/mcp/src/toolkit.ts")).href)
    const files = filesModule.createFsPlaceFiles({ home: path.join(root, "hub"), folder: path.join(root, "workspace"), userHome: path.join(root, "user"), env: { DSH_HOME: dshHome } })
    const list = files.list!.bind(files)
    let calls = 0
    files.list = async (ref: Parameters<typeof list>[0]) => {
      calls += 1
      if (calls === 2) {
        const profile = path.join(dshHome, "profiles/new")
        await mkdir(profile, { recursive: true })
        await writeFile(path.join(profile, "package.json"), JSON.stringify({ dsh: { profile: { bundles: [] } } }))
      }
      return list(ref)
    }
    const io = { files, log: () => undefined } as McpIo
    const provider = createDeepSeekHarnessMcp(toolkit.mcpTools as McpTools)
    await expect(provider.install(io, "deepseek-harness-home", "example", { transport: "stdio", command: "node", args: [], env: {} })).rejects.toThrow()
    expect(existsSync(path.join(dshHome, "cordis.patch.yml"))).toBe(false)
  })

  it("scans initialized profiles and refuses same-name installation across them", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "dsh-mcp-profiles-"))
    trees.push(root)
    const dshHome = path.join(root, "dsh")
    for (const profile of ["web", "desktop"]) {
      const dir = path.join(dshHome, "profiles", profile)
      await mkdir(dir, { recursive: true })
      await writeFile(path.join(dir, "package.json"), JSON.stringify({ dsh: { profile: { bundles: [] } } }))
      await writeFile(path.join(dir, "cordis.patch.yml"), profile === "web"
        ? "- insert:\n    - id: existing\n      name: '@deepseek-ai/dsh-mcp-client'\n      config:\n        serverName: taken\n        transport: stdio\n        command: node\n"
        : "[]\n")
    }
    const filesModule = await import(pathToFileURL(path.join(checkout!, "packages/core/src/host/place-files.ts")).href)
    const toolkit = await import(pathToFileURL(path.join(checkout!, "packages/resources/mcp/src/toolkit.ts")).href)
    const io = { files: filesModule.createFsPlaceFiles({ home: path.join(root, "hub"), folder: path.join(root, "workspace"), userHome: path.join(root, "user"), env: { DSH_HOME: dshHome } }), log: () => undefined } as McpIo
    const provider = createDeepSeekHarnessMcp(toolkit.mcpTools as McpTools)
    const list = io.files.list!.bind(io.files)
    let enumerations = 0
    io.files.list = async (ref) => { enumerations += 1; return list(ref) }
    const places = await provider.placesFor(io)
    await Promise.all(places.map((place) => provider.read(io, place.id)))
    expect(enumerations).toBe(1)
    expect(places.filter((place) => place.installable !== false)).toHaveLength(1)
    expect(places).toHaveLength(3)
    await expect(provider.install(io, "deepseek-harness-home", "taken", { transport: "stdio", command: "node", args: [], env: {} })).rejects.toMatchObject({ params: { file: "profiles/web/cordis.patch.yml" } })
    expect(existsSync(path.join(dshHome, "cordis.patch.yml"))).toBe(false)
    const web = places.find((place) => place.file.includes("/web/"))!
    const manifest = path.join(dshHome, "profiles/web/package.json")
    await rm(manifest)
    await expect(provider.read(io, web.id)).rejects.toThrow()
    await expect(provider.locate({ ...io, place: web }, web.id, "taken")).rejects.toThrow()
    await writeFile(manifest, JSON.stringify({ dsh: { profile: { bundles: [] } } }))
    expect(await provider.read(io, web.id)).toHaveLength(1)
    await expect(provider.install(io, web.id, "new-server", { transport: "stdio", command: "node", args: [], env: {} })).rejects.toThrow()
    await provider.setEnabled(io, web.id, "global", "taken", false)
    expect((await provider.read(io, web.id))[0]?.enabled).toBe(false)
    await provider.setEnabled(io, web.id, "global", "taken", true)
    expect((await provider.read(io, web.id))[0]?.enabled).toBe(true)
    expect((await readFile(path.join(dshHome, "profiles/web/cordis.patch.yml"), "utf8"))).toContain("serverName: taken")
    await provider.uninstall(io, web.id, "taken")
    expect(await provider.read(io, web.id)).toEqual([])
  })
})
