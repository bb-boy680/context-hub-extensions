import { describe, expect, it } from "vitest"
import type { PluginDisk, PluginDiskRef, PluginDiskRoots } from "../src/contracts.ts"
import { enabledAt, installChanges, listInstalled, loadPluginState, ownedAt, prepareInstall, prepareRemove, prepareSetEnabled, OWNERSHIP, REGISTRY, SETTINGS } from "../src/installer.ts"
import { QODER_PLUGIN_ROOTS } from "../src/locations.ts"
import { tools } from "./helpers.ts"

const roots: PluginDiskRoots = {
  declaration: QODER_PLUGIN_ROOTS, config: "/user/.qoder", plugins: "/user/.qoder/plugins",
  workspace: "/work/one", library: "/hub/plugins", platform: "posix",
}
const snapshot = "a".repeat(64)
const row = { scope: "project" as const, projectPath: "/work/one", installPath: "/user/.qoder/plugins/cache/local/sample/1.0.0", version: "1.0.0", installedAt: "2026-11-03T00:00:00.000Z" }
const record = { ...row, configRoot: roots.config, pluginsRoot: roots.plugins, snapshot }
const key = (ref: PluginDiskRef) => `${ref.root}:${ref.path}`

function fixture() {
  const files = new Map<string, string>([
    [key(REGISTRY), JSON.stringify({ version: 2, plugins: { "sample@local": [row] } })],
    [key(OWNERSHIP), JSON.stringify({ version: 1, plugins: { "sample@local": [record] } })],
    [key(SETTINGS.user), JSON.stringify({ enabledPlugins: { "sample@local": true } })],
    [key(SETTINGS.project), JSON.stringify({ enabledPlugins: { "sample@local": false } })],
    [key(SETTINGS.local), JSON.stringify({ enabledPlugins: { "sample@local": true } })],
    ["library:sample/.qoder-plugin/plugin.json", JSON.stringify({ name: "sample", version: "1.0.0" })],
  ])
  const reads: string[] = []
  const snapshots = new Map([["library:sample", snapshot], ["plugins:cache/local/sample/1.0.0", snapshot]])
  const disk: PluginDisk = {
    async roots() { return roots },
    async read(_roots, ref) { reads.push(key(ref)); return files.get(key(ref)) ?? null },
    async readExternal(_roots, directory, relative) { return files.get(`external:${directory}/${relative}`) ?? null },
    async snapshotDirectory(_roots, ref) { return snapshots.get(key(ref)) ?? null },
    async commit() { throw new Error("unexpected write") },
    async run(_declaration, work) { return work(roots) },
  }
  return { disk, files, reads, snapshots }
}

describe("Qoder 安装器状态读取", () => {
  it("读取三个设置层，只有自身精确记录与快照可管理", async () => {
    const { disk } = fixture()
    const state = await loadPluginState(disk, roots, tools)
    expect(enabledAt(state, "sample@local")).toBe(true)
    expect(await ownedAt(disk, roots, state, "sample@local", row)).toBe(true)
    expect(await ownedAt(disk, roots, state, "sample@other", row)).toBe(false)
    expect(await ownedAt(disk, roots, state, "sample@local", { ...row, projectPath: "/work/two" })).toBe(false)
    expect(await ownedAt(disk, roots, state, "sample@local", { ...row, installPath: "/foreign/sample" })).toBe(false)
  })

  it("预检允许已认领缓存，并拒绝无归属或内容不同的同名缓存", async () => {
    const { disk, files, snapshots } = fixture()
    const state = await loadPluginState(disk, roots, tools)
    expect(await prepareInstall(disk, roots, state, "sample", "project")).toMatchObject({ id: "sample@local", destination: "cache/local/sample/1.0.0", before: snapshot })
    const absentOwner = { ...state, ownership: { version: 1 as const, plugins: {} } }
    await expect(prepareInstall(disk, roots, absentOwner, "sample", "project")).rejects.toThrow(/无法证明归属/)
    const noRecord = { ...state, registry: { version: 2 as const, plugins: {} } }
    await expect(prepareInstall(disk, roots, noRecord, "sample", "project")).rejects.toThrow(/缓存无法证明归属/)
    snapshots.set("library:sample", "b".repeat(64))
    await expect(prepareInstall(disk, roots, state, "sample", "project")).rejects.toThrow(/内容已变化/)
    files.set("library:sample/.qoder-plugin/plugin.json", '{"name":"sample","dependencies":["other"]}')
    await expect(prepareInstall(disk, roots, state, "sample", "project")).rejects.toThrow(/依赖/)
  })

  it("重装保留关闭状态并生成同一作用域的归属记录", async () => {
    const { disk } = fixture()
    const state = await loadPluginState(disk, roots, tools)
    const plan = await prepareInstall(disk, roots, state, "sample", "project")
    const next = installChanges(roots, state, "project", plan, "2026-11-03T01:00:00.000Z", tools)
    expect(JSON.parse(next.settings!).enabledPlugins["sample@local"]).toBe(false)
    expect(next.registry.plugins["sample@local"]).toEqual([row])
    expect(next.ownership.plugins["sample@local"]).toEqual([record])
  })

  it("允许已安装启用的依赖，拒绝缺失、关闭和循环依赖", async () => {
    const { disk, files } = fixture()
    const dep = { scope: "user", installPath: "/foreign/dep", version: "1" }
    files.set(key(REGISTRY), JSON.stringify({ version: 2, plugins: { "sample@local": [row], "dep@local": [dep] } }))
    files.set(key(SETTINGS.user), JSON.stringify({ enabledPlugins: { "sample@local": true, "dep@local": true } }))
    files.set("library:sample/.qoder-plugin/plugin.json", '{"name":"sample","version":"1.0.0","dependencies":["dep"]}')
    let state = await loadPluginState(disk, roots, tools)
    expect((await prepareInstall(disk, roots, state, "sample", "project")).manifest.dependencies).toEqual(["dep"])
    files.set(key(SETTINGS.user), JSON.stringify({ enabledPlugins: { "sample@local": true, "dep@local": false } }))
    state = await loadPluginState(disk, roots, tools)
    await expect(prepareInstall(disk, roots, state, "sample", "project")).rejects.toThrow(/依赖/)
    files.set(key(SETTINGS.user), JSON.stringify({ enabledPlugins: { "sample@local": true, "dep@local": true } }))
    files.set("external:/foreign/dep/.qoder-plugin/plugin.json", '{"name":"dep","dependencies":["sample"]}')
    state = await loadPluginState(disk, roots, tools)
    await expect(prepareInstall(disk, roots, state, "sample", "project")).rejects.toThrow(/循环/)
  })

  it("启停仅准备目标作用域开关，并拒绝扩大作用域", async () => {
    const { disk, files } = fixture()
    files.set(`external:${row.installPath}/.qoder-plugin/plugin.json`, '{"name":"sample","version":"1.0.0"}')
    const state = await loadPluginState(disk, roots, tools)
    const local = await prepareSetEnabled(disk, roots, state, "sample@local", "local", false, tools)
    expect(JSON.parse(local.settings!).enabledPlugins["sample@local"]).toBe(false)
    const project = await prepareSetEnabled(disk, roots, state, "sample@local", "project", true, tools)
    expect(JSON.parse(project.settings!).enabledPlugins["sample@local"]).toBe(true)
    await expect(prepareSetEnabled(disk, roots, state, "sample@local", "user", true, tools)).rejects.toThrow(/作用域/)
    await expect(prepareSetEnabled(disk, roots, state, "sample@local", "local", "yes" as never, tools)).rejects.toThrow(/参数/)
  })

  it("存在启用的反向依赖时拒绝卸载，只读检查不写文件", async () => {
    const { disk, files } = fixture()
    files.set(key(REGISTRY), JSON.stringify({ version: 2, plugins: {
      "sample@local": [row], "dependent@market": [{ scope: "user", installPath: "/foreign/dependent" }],
    } }))
    files.set("external:/foreign/dependent/.qoder-plugin/plugin.json", '{"name":"dependent","dependencies":[{"name":"sample","marketplace":"local"}]}')
    const state = await loadPluginState(disk, roots, tools)
    await expect(prepareRemove(disk, roots, state, "sample@local", "project", tools)).rejects.toThrow(/依赖/)
    files.set("external:/foreign/dependent/.qoder-plugin/plugin.json", '{"name":"dependent","dependencies":["unrelated"]}')
    expect((await prepareRemove(disk, roots, state, "sample@local", "project", tools)).removeDirectory).toBe(true)
  })

  it("卸载全局插件时检查其他项目的反向依赖", async () => {
    const { disk, files } = fixture()
    const global = { scope: "user", installPath: row.installPath, version: row.version, installedAt: row.installedAt }
    const globalOwner = { ...global, configRoot: roots.config, pluginsRoot: roots.plugins, snapshot }
    files.set(key(REGISTRY), JSON.stringify({ version: 2, plugins: {
      "sample@local": [global],
      "dependent@market": [{ scope: "project", projectPath: "/work/two", installPath: "/foreign/dependent" }],
    } }))
    files.set(key(OWNERSHIP), JSON.stringify({ version: 1, plugins: { "sample@local": [globalOwner] } }))
    files.set(key(SETTINGS.user), JSON.stringify({ enabledPlugins: { "dependent@market": false } }))
    files.set("external:/foreign/dependent/.qoder-plugin/plugin.json", '{"name":"dependent","dependencies":["sample@local"]}')
    const state = await loadPluginState(disk, roots, tools)
    await expect(prepareRemove(disk, roots, state, "sample@local", "user", tools)).rejects.toThrow(/依赖/)
  })

  it("卸载预检保留其他项目及共享缓存", async () => {
    const { disk, files } = fixture()
    const other = { ...row, projectPath: "/work/two" }
    files.set(key(REGISTRY), JSON.stringify({ version: 2, plugins: { "sample@local": [row, other] } }))
    const state = await loadPluginState(disk, roots, tools)
    const removal = await prepareRemove(disk, roots, state, "sample@local", "project", tools)
    expect(removal.removeDirectory).toBe(false)
    expect(removal.registry.plugins["sample@local"]).toEqual([other])
    expect(removal.ownership.plugins["sample@local"]).toBeUndefined()
    expect(JSON.parse(removal.settings!).enabledPlugins).toEqual({})
    expect(state.registry.plugins["sample@local"]).toHaveLength(2)
  })

  it("卸载预检拒绝第三方和未认领的同名记录", async () => {
    const { disk } = fixture()
    const state = await loadPluginState(disk, roots, tools)
    await expect(prepareRemove(disk, roots, state, "sample@other", "project", tools)).rejects.toThrow(/第三方/)
    await expect(prepareRemove(disk, roots, { ...state, ownership: { version: 1, plugins: {} } }, "sample@local", "project", tools)).rejects.toThrow(/归属/)
    const removal = await prepareRemove(disk, roots, state, "sample@local", "project", tools)
    expect(removal.removeDirectory).toBe(true)
  })

  it("另一个项目存在无法证明归属的同名 ID 时拒绝安装", async () => {
    const { disk, files } = fixture()
    files.set(key(REGISTRY), JSON.stringify({ version: 2, plugins: { "sample@local": [row, { ...row, projectPath: "/work/two" }] } }))
    const state = await loadPluginState(disk, roots, tools)
    await expect(prepareInstall(disk, roots, state, "sample", "user")).rejects.toThrow(/无法证明归属/)
  })

  it("库存仅认领自己，保留第三方且不包含其他项目", async () => {
    const { disk, files } = fixture()
    files.set(key(REGISTRY), JSON.stringify({ version: 2, plugins: {
      "sample@local": [row, { ...row, projectPath: "/work/two" }],
      "foreign@market": [{ scope: "user", installPath: "/foreign/pack", version: "2" }],
    } }))
    const state = await loadPluginState(disk, roots, tools)
    const held = await listInstalled(disk, roots, state)
    expect(held.map(({ id, scope, readOnly }) => ({ id, scope, readOnly }))).toEqual([
      { id: "sample@local", scope: "project", readOnly: false },
      { id: "foreign@market", scope: "user", readOnly: true },
    ])
  })

  it("重复身份不允许改写", async () => {
    const { disk, files } = fixture()
    files.set(key(REGISTRY), JSON.stringify({ version: 2, plugins: { "sample@local": [row, row] } }))
    const state = await loadPluginState(disk, roots, tools)
    expect((await listInstalled(disk, roots, state)).every((item) => item.readOnly)).toBe(true)
  })

  it("没有工作区时不读取项目或本地文件", async () => {
    const { disk, reads } = fixture()
    const state = await loadPluginState(disk, { ...roots, workspace: null }, tools)
    expect(reads).not.toContain(key(SETTINGS.project))
    expect(reads).not.toContain(key(SETTINGS.local))
    expect(enabledAt(state, "sample@local")).toBe(true)
  })

  it("未完成事务拒绝读取可管理状态", async () => {
    const { disk, files } = fixture()
    files.set(key(OWNERSHIP), JSON.stringify({ version: 1, plugins: {}, pending: {} }))
    await expect(loadPluginState(disk, roots, tools)).rejects.toThrow(/未完成/)
  })
})
