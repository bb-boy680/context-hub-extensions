import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { editSwitch, effectiveSwitch, isOwned, nativeManifest, readOwnership, readRegistry, readSwitches, recordAt, replaceOwnership, replaceRecord } from "../src/plugin-state.ts"
import { tools } from "./helpers.ts"

const fixture = readFileSync(new URL("./fixtures/registry-v2.json", import.meta.url), "utf8")

describe("Qoder 本地插件", () => {
  it("使用官方缺省版本与缓存路径编码", () => {
    expect(nativeManifest('{"name":"sample"}', "sample")).toEqual({ name: "sample", version: "local", cacheVersion: "local", description: "", dependencies: [] })
    expect(nativeManifest('{"name":"sample","version":"1.0.0+build"}', "sample").cacheVersion).toBe("1.0.0-build")
    expect(nativeManifest('{"name":"sample","dependencies":["one@^1.0.0",{"name":"two","marketplace":"catalog"}]}', "sample").dependencies).toEqual(["one", "two@catalog"])
  })

  it.each([
    [null, "sample"], ['{"name":"other"}', "sample"], ['{"name":"../outside"}', "../outside"],
    ['{"name":"sample","version":"../outside"}', "sample"],
    ['{"name":"sample","dependencies":[42]}', "sample"],
  ])("在写入前拒绝不安全清单 %#", (text, name) => {
    expect(() => nativeManifest(text, name!)).toThrow()
  })

  it("读取文件内的显式开关并区分三层覆盖", () => {
    const parse = (text: string | null) => text === null ? null : JSON.parse(text)
    const user = readSwitches('{"enabledPlugins":{"sample@local":true},"hooks":{}}', parse)
    const project = readSwitches('{"enabledPlugins":{"sample@local":false}}', parse)
    const local = readSwitches('{"enabledPlugins":{"sample@local":true}}', parse)
    expect(effectiveSwitch({ user, project, local }, "sample@local")).toBe(true)
    expect(effectiveSwitch({ user, project, local: {} }, "sample@local")).toBe(false)
    expect(effectiveSwitch({ user, project: {}, local: {} }, "sample@local")).toBe(true)
    expect(effectiveSwitch({ user: {}, project: {}, local: {} }, "sample@local")).toBeUndefined()
    expect(() => readSwitches('{"enabledPlugins":{"sample@local":"false"}}', parse)).toThrow()
    expect(() => readSwitches('', parse)).toThrow()
  })

  it("开关只修改目标键并保留其他配置", () => {
    const source = '{"hooks":{"preserve":true},"enabledPlugins":{"other@local":false}}'
    const installed = editSwitch(source, "sample@local", true, tools)!
    const parsed = JSON.parse(installed)
    expect(parsed.hooks.preserve).toBe(true)
    expect(parsed.enabledPlugins).toEqual({ "other@local": false, "sample@local": true })
    const removed = JSON.parse(editSwitch(installed, "sample@local", undefined, tools)!)
    expect(removed.enabledPlugins).toEqual({ "other@local": false })
    expect(editSwitch(null, "sample@local", undefined, tools)).toBeNull()
  })

  it("更改单个范围身份时保留其他项目和客户端记录", () => {
    const registry = readRegistry(fixture)
    registry.plugins["other@market"] = [{ scope: "user", installPath: "/elsewhere" }]
    const next = replaceRecord(registry, "sample@local", "project", "/fixture/projects/one")
    expect(next.plugins["sample@local"]!.map((row) => row.scope)).toEqual(["user", "local"])
    expect(next.plugins["other@market"]).toEqual(registry.plugins["other@market"])
    expect(registry.plugins["sample@local"]).toHaveLength(3)
    expect(() => replaceRecord(registry, "sample@local", "project", "/fixture/projects/one", {
      scope: "project", projectPath: "/fixture/projects/two", installPath: "/unsafe",
    })).toThrow(/作用域/)
    expect(() => replaceRecord(registry, "__proto__", "user", null)).toThrow(/身份/)
  })

  it("按作用域与项目路径精确查找安装记录", () => {
    const registry = readRegistry(fixture)
    expect(recordAt(registry, "sample@local", "user", null)?.scope).toBe("user")
    expect(recordAt(registry, "sample@local", "project", "/fixture/projects/one")?.scope).toBe("project")
    expect(recordAt(registry, "sample@local", "project", "/fixture/projects/two")).toBeUndefined()
    expect(recordAt(registry, "sample@local", "local", "/fixture/projects/two")?.scope).toBe("local")
    expect(() => recordAt(registry, "sample@local", "local", null)).toThrow(/工作区/)
    expect(() => recordAt(registry, "sample@local", "other" as never, "/work")).toThrow(/作用域/)
    registry.plugins["sample@local"]!.push({ ...registry.plugins["sample@local"]![1]! })
    expect(() => recordAt(registry, "sample@local", "project", "/fixture/projects/one")).toThrow(/重复/)
  })
})

describe("Hub 插件归属", () => {
  const snapshot = "a".repeat(64)
  const native = { scope: "project" as const, projectPath: "/work/one", installPath: "/config/plugins/cache/local/sample/1.0.0", version: "1.0.0", installedAt: "2026-11-03T00:00:00.000Z" }
  const owned = { ...native, configRoot: "/config", pluginsRoot: "/config/plugins", snapshot }
  const roots = { config: "/config", plugins: "/config/plugins", platform: "posix" as const }

  it("只有持久记录、配置根、作用域和载荷快照全部吻合才认领", () => {
    const state = readOwnership(JSON.stringify({ version: 1, plugins: { "sample@local": [owned] } }))
    expect(isOwned(state, "sample@local", native, roots, snapshot)).toBe(true)
    expect(isOwned(state, "sample@local", native, roots, "b".repeat(64))).toBe(false)
    expect(isOwned(state, "sample@local", native, { ...roots, config: "/other" }, snapshot)).toBe(false)
    expect(isOwned(state, "sample@local", { ...native, projectPath: "/work/two" }, roots, snapshot)).toBe(false)
    expect(isOwned(state, "sample@local", { ...native, installedAt: "different" }, roots, snapshot)).toBe(false)
    expect(isOwned(state, "sample@local", native, roots, null)).toBe(false)
    expect(isOwned(readOwnership(null), "sample@local", native, roots, snapshot)).toBe(false)
    expect(isOwned(state, "sample@local", { ...native, scope: "managed" }, roots, snapshot)).toBe(false)
    expect(isOwned(state, "sample@local", { ...native, installPath: "\\config\\plugins\\cache\\local\\sample\\1.0.0" }, roots, snapshot)).toBe(false)
  })

  it("更新归属只影响当前客户端根和项目", () => {
    const other = { ...owned, projectPath: "/work/two" }
    const differentRoot = { ...owned, configRoot: "/other", pluginsRoot: "/other/plugins" }
    const state = readOwnership(JSON.stringify({ version: 1, plugins: { "sample@local": [owned, other, differentRoot] } }))
    const next = replaceOwnership(state, "sample@local", "project", "/work/one", roots)
    expect(next.plugins["sample@local"]).toEqual([other, differentRoot])
    expect(state.plugins["sample@local"]).toHaveLength(3)
    expect(() => replaceOwnership(state, "sample@local", "project", "/work/one", roots, other)).toThrow(/作用域/)
    expect(() => replaceOwnership(state, "__proto__", "user", null, roots)).toThrow(/身份/)
  })

  it("仅在 Windows 上按盘符大小写和路径分隔符比较", () => {
    const nativeWindows = { ...native, installPath: "C:\\Qoder\\plugins\\cache\\local\\sample\\1.0.0" }
    const ownedWindows = { ...owned, ...nativeWindows, configRoot: "C:\\Qoder", pluginsRoot: "C:\\Qoder\\plugins" }
    const state = readOwnership(JSON.stringify({ version: 1, plugins: { "sample@local": [ownedWindows] } }))
    expect(isOwned(state, "sample@local", { ...nativeWindows, installPath: "c:/qoder/plugins/cache/local/sample/1.0.0" }, { config: "c:/qoder", plugins: "c:/qoder/plugins", platform: "win32" }, snapshot)).toBe(true)
  })

  it("未完成事务或损坏的归属记录不能被当作已拥有", () => {
    expect(() => readOwnership('{"version":1,"plugins":{},"pending":{}}')).toThrow(/未完成/)
    expect(() => readOwnership('{"version":1,"plugins":{"sample@local":[{"scope":"user"}]}}')).toThrow()
    expect(() => readOwnership('{"version":2,"plugins":{}}')).toThrow()
    expect(() => readOwnership("broken")).toThrow()
  })
})

describe("Qoder CLI 1.1.81 插件注册表", () => {
  it("读取不同作用域和项目的原生记录，并保留未知字段", () => {
    const doc = JSON.parse(fixture)
    doc.plugins["sample@local"][0].nativeExtra = { keep: true }
    const state = readRegistry(JSON.stringify(doc))
    expect(state.plugins["sample@local"]!.map((row) => [row.scope, row.projectPath])).toEqual([
      ["user", undefined], ["project", "/fixture/projects/one"], ["local", "/fixture/projects/two"],
    ])
    expect(state.plugins["sample@local"]![0]!.nativeExtra).toEqual({ keep: true })
    expect(readRegistry(null)).toEqual({ version: 2, plugins: {} })
  })

  it.each([
    "", "{}", '{"version":1,"plugins":{}}', '{"version":2,"plugins":[]}',
    '{"version":2,"plugins":{"bad":[]}}', '{"version":2,"plugins":{"name@local":{}}}',
    '{"version":2,"plugins":{"name@local":[{"scope":"user"}]}}',
    '{"version":2,"plugins":{"name@local":[{"scope":"elsewhere","installPath":"/tmp"}]}}',
    '{"version":2,"plugins":{"name@local":[{"scope":"user","installPath":"/tmp","version":2}]}}',
  ])("拒绝无法安全解释的输入 %#", (text) => {
    expect(() => readRegistry(text)).toThrow()
  })
})
