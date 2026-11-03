import { describe, expect, it } from "vitest"
import { createZCodeInstaller } from "../src/installer.ts"
import { fixture } from "./installer-fixture.ts"
import { tools as json } from "./helpers.ts"

const installer = () => createZCodeInstaller(json)
const indexKey = "plugins:installed_plugins.json"
const knownKey = "plugins:known_marketplaces.json"
const configKey = "config:cli/config.json"
const projectKey = "workspace:.zcode/config.json"

describe("ZCode 原生 user 文件安装器", () => {
  it("完成安装重装启停卸载，记录只有一份且完整 id 保留", async () => {
    const { tools, files, removed, commits } = fixture()
    const provider = installer()
    expect(provider.places.map((place) => place.id)).toEqual(["zcode-user"])
    await provider.install("demo", "user", tools)
    expect(commits[0]!.copy).toEqual({ name: "demo", destination: "cache/context-hub/demo/1.0.0", manifests: [".zcode-plugin/plugin.json"], sourceSnapshot: "a".repeat(64), before: null })
    expect((await provider.held(tools))[0]).toMatchObject({ id: "demo@context-hub", scope: "user", enabled: true, readOnly: false })
    await provider.setEnabled("demo@context-hub", "user", false, tools)
    await provider.install("demo", "user", tools)
    expect(JSON.parse(files.get(indexKey)!).plugins).toHaveLength(1)
    expect((await provider.held(tools))[0]!.enabled).toBe(false)
    await provider.setEnabled("demo@context-hub", "user", true, tools)
    files.set(configKey, json.editJson(files.get(configKey)!, ["plugins", "options", "demo@context-hub"], { secret: "keep" }))
    files.set(projectKey, '{"plugins":{"enabledPlugins":{"demo@context-hub":false}}}')
    await provider.remove("demo@context-hub", "user", tools)
    expect(JSON.parse(files.get(indexKey)!).plugins).toEqual([])
    expect(JSON.parse(files.get(configKey)!).plugins.options).toEqual({ "demo@context-hub": { secret: "keep" } })
    expect(JSON.parse(files.get(configKey)!).plugins.enabledPlugins).toEqual({})
    expect(JSON.parse(files.get(projectKey)!).plugins.enabledPlugins["demo@context-hub"]).toBe(false)
    expect(removed).toEqual(["cache/context-hub/demo/1.0.0"])
    expect(files.has(knownKey)).toBe(true)
  })

  it.each(["project", "workspace", "local"])("所有写操作在 %s scope 拒绝且零写", async (scope) => {
    const { tools, commits, files } = fixture()
    const before = [...files]
    const provider = installer()
    await expect(provider.install("demo", scope, tools)).rejects.toThrow(/仅支持 user/)
    await expect(provider.remove("demo@context-hub", scope, tools)).rejects.toThrow(/仅支持 user/)
    await expect(provider.setEnabled("demo@context-hub", scope, true, tools)).rejects.toThrow(/仅支持 user/)
    expect(commits).toEqual([])
    expect([...files]).toEqual(before)
  })

  it.each([
    [indexKey, '{"version":1,"plugins":{}}'],
    [indexKey, '{"version":2,"plugins":[]}'],
    [indexKey, '{"version":1,"plugins":[{"id":"demo@context-hub","name":"demo","marketplace":"context-hub","version":"1","installPath":"/x","installedAt":"now","scope":"workspace"}]}'],
    [knownKey, '{"version":1,"marketplaces":{}}'],
    [knownKey, '{"version":2,"marketplaces":[]}'],
    [configKey, '{"plugins":{"enabledPlugins":[]}}'],
    [configKey, ""],
  ])("旧 registry 或坏 schema 零写 %s", async (key, value) => {
    const { tools, files, commits } = fixture()
    files.set(key, value)
    const before = [...files]
    await expect(installer().install("demo", "user", tools)).rejects.toThrow()
    expect(commits).toEqual([])
    expect([...files]).toEqual(before)
  })

  it("两个注册表未知字段和 record 字段保留", async () => {
    const { tools, files } = fixture()
    await installer().install("demo", "user", tools)
    const installed = JSON.parse(files.get(indexKey)!)
    installed.future = { preserve: true }
    installed.plugins[0].cacheTransactionId = "opaque"
    installed.plugins[0].unknown = [1, 2]
    const known = JSON.parse(files.get(knownKey)!)
    known.future = { preserve: true }
    known.marketplaces[0].cacheTransactionId = "opaque"
    known.marketplaces[0].unknown = [3, 4]
    files.set(indexKey, JSON.stringify(installed))
    files.set(knownKey, JSON.stringify(known))
    await installer().install("demo", "user", tools)
    expect(JSON.parse(files.get(indexKey)!)).toMatchObject({ future: { preserve: true }, plugins: [{ cacheTransactionId: "opaque", unknown: [1, 2] }] })
    expect(JSON.parse(files.get(knownKey)!)).toMatchObject({ future: { preserve: true }, marketplaces: [{ cacheTransactionId: "opaque", unknown: [3, 4] }] })
  })

  it("只接受原生单清单，依赖和 required options 在写入前校验", async () => {
    const { tools, files, commits } = fixture()
    files.delete("library:demo/.zcode-plugin/plugin.json")
    files.set("library:demo/.claude-plugin/plugin.json", '{"name":"demo"}')
    await expect(installer().install("demo", "user", tools)).rejects.toThrow(/缺少原生/)
    for (const pack of [
      { name: "wrong" },
      { name: "demo", dependencies: ["other"] },
      { name: "demo", userConfig: { token: { required: true, sensitive: true, type: "string" } } },
    ]) {
      files.set("library:demo/.zcode-plugin/plugin.json", JSON.stringify(pack))
      await expect(installer().install("demo", "user", tools)).rejects.toThrow()
    }
    expect(commits).toEqual([])
    files.set("library:demo/.zcode-plugin/plugin.json", JSON.stringify({ name: "demo", userConfig: { retries: { required: true, type: "number", default: 0 } } }))
    await installer().install("demo", "user", tools)
    expect(JSON.parse(files.get(indexKey)!).plugins[0].version).toBe("0.0.0")
  })

  it("总门和项目 override 不被 user 操作偷偷打开", async () => {
    const { tools, files, commits } = fixture()
    const provider = installer()
    files.set(configKey, '{"plugins":{"enabled":false}}')
    await expect(provider.install("demo", "user", tools)).rejects.toThrow(/总门/)
    files.delete(configKey)
    files.set(projectKey, '{"plugins":{"enabledPlugins":{"demo@context-hub":false}}}')
    await expect(provider.install("demo", "user", tools)).rejects.toThrow(/当前项目/)
    expect(commits).toEqual([])
    files.set(configKey, '{"plugins":{"enabled":false,"enabledPlugins":{"demo@context-hub":false}}}')
    await expect(provider.install("demo", "user", tools)).rejects.toThrow(/总门/)
    files.delete(configKey)
    files.delete(projectKey)
    await provider.install("demo", "user", tools)
    files.set(projectKey, '{"plugins":{"enabledPlugins":{"demo@context-hub":false}}}')
    expect((await provider.held(tools))[0]!.enabled).toBe(false)
    expect(await provider.switches(tools)).toEqual({ user: { "demo@context-hub": true } })
    await expect(provider.setEnabled("demo@context-hub", "user", true, tools)).rejects.toThrow(/当前项目/)
  })

  it("第三方保持真实 id 且只读，未明示开关为未知", async () => {
    const { tools, files, roots } = fixture()
    const record = { id: "demo@other", name: "demo", marketplace: "other", version: "1", installPath: "/third/demo", installedAt: "now", scope: "user" }
    files.set(indexKey, JSON.stringify({ version: 1, plugins: [record] }))
    files.set("external:/third/demo/.zcode-plugin/plugin.json", '{"name":"demo"}')
    expect((await installer().held(tools))[0]).toMatchObject({ id: "demo@other", readOnly: true, enabled: undefined })
    expect(roots.plugins).toContain("cli/plugins")
    await expect(installer().remove("demo@other", "user", tools)).rejects.toThrow(/只读/)
  })

  it("关闭和卸载前检查反向依赖，未知依赖也拒绝", async () => {
    const { tools, files } = fixture()
    const provider = installer()
    await provider.install("demo", "user", tools)
    const index = JSON.parse(files.get(indexKey)!)
    index.plugins.push({ id: "dependent@other", name: "dependent", marketplace: "other", version: "1", installPath: "/third/dependent", installedAt: "now", scope: "user" })
    files.set(indexKey, JSON.stringify(index))
    files.set("external:/third/dependent/.zcode-plugin/plugin.json", '{"name":"dependent","dependencies":["demo@context-hub"]}')
    await expect(provider.setEnabled("demo@context-hub", "user", false, tools)).rejects.toThrow(/依赖/)
    await expect(provider.remove("demo@context-hub", "user", tools)).rejects.toThrow(/依赖/)
    files.set("external:/third/dependent/.zcode-plugin/plugin.json", '{"name":"dependent","dependencies":["demo@context-hub@^1"]}')
    await expect(provider.remove("demo@context-hub", "user", tools)).rejects.toThrow(/无效插件身份/)
    files.delete("external:/third/dependent/.zcode-plugin/plugin.json")
    await expect(provider.remove("demo@context-hub", "user", tools)).rejects.toThrow(/缺少原生/)
  })

  it("市场同名不同源拒绝，缓存变化时卸载保持注册表", async () => {
    const { tools, files, snapshots } = fixture()
    files.set(knownKey, '{"version":1,"marketplaces":[{"id":"context-hub","name":"context-hub","source":{"source":"directory","path":"/different"},"addedAt":"now","pluginCount":1}]}')
    await expect(installer().install("demo", "user", tools)).rejects.toThrow(/其它来源/)
    files.delete(knownKey)
    await installer().install("demo", "user", tools)
    const before = files.get(indexKey)
    snapshots.set("plugins:cache/context-hub/demo/1.0.0", "b".repeat(64))
    await expect(installer().remove("demo@context-hub", "user", tools)).rejects.toThrow(/snapshot conflict/)
    expect(files.get(indexKey)).toBe(before)
  })
})
