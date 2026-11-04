import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { promises as fs } from "node:fs"
import path from "node:path"
import { createKiroInstaller } from "../src/installer.ts"
import { fixture, hostAvailable } from "./fixtures.ts"

let f: Awaited<ReturnType<typeof fixture>>
const installer = createKiroInstaller()

describe.skipIf(!hostAvailable)("Kiro Powers installation", () => {
  beforeEach(async () => { f = await fixture() })
  afterEach(async () => { await f.cleanup() })

  it("installs the native payload and records, reports unknown enabled, and removes them", async () => {
    await f.pack()
    expect(await installer.available(f.tools)).toBe(true)
    await installer.install("demo", "user", f.tools)
    const base = path.join(f.userHome, ".kiro", "powers")
    const dest = path.join(base, "installed", "demo")
    expect(await fs.readFile(path.join(dest, "skills", "hello", "SKILL.md"), "utf8")).toBe("fixture")
    const installed = JSON.parse(await fs.readFile(path.join(base, "installed.json"), "utf8"))
    const registry = JSON.parse(await fs.readFile(path.join(base, "registries", "user-added.json"), "utf8"))
    expect(installed.installedPowers).toEqual([{ name: "demo", registryId: "user-added" }])
    expect(registry.powers[0]).toMatchObject({ name: "demo", source: { type: "local", path: path.join(f.library.root, "demo") } })
    expect(await installer.held(f.tools)).toMatchObject([{ id: "demo", marketplace: null, readOnly: false, sourceAvailable: true }])
    expect((await installer.held(f.tools))[0]?.enabled).toBeUndefined()
    expect(installer.setEnabled).toBeUndefined()
    registry.powers[0].autoInstall = false
    await fs.writeFile(path.join(base, "registries", "user-added.json"), JSON.stringify(registry))
    expect((await installer.held(f.tools))[0]?.readOnly).toBe(false)
    await installer.install("demo", "user", f.tools)
    await installer.remove("demo", "user", f.tools)
    expect(await installer.held(f.tools)).toEqual([])
    await expect(fs.stat(dest)).rejects.toThrow()
    expect(JSON.parse(await fs.readFile(path.join(base, "registries", "user-added.json"), "utf8")).powers).toEqual([])
  })

  it("refuses hand-written and edited payloads without changing them", async () => {
    await f.pack()
    const dest = path.join(f.userHome, ".kiro", "powers", "installed", "demo")
    await fs.mkdir(dest, { recursive: true })
    await fs.writeFile(path.join(dest, "manual"), "keep")
    await expect(installer.install("demo", "user", f.tools)).rejects.toThrow(/conflict/)
    expect(await fs.readFile(path.join(dest, "manual"), "utf8")).toBe("keep")
    await fs.rm(dest, { recursive: true })
    await installer.install("demo", "user", f.tools)
    await fs.writeFile(path.join(dest, "manual"), "keep")
    expect((await installer.held(f.tools))[0]?.readOnly).toBe(true)
    await expect(installer.install("demo", "user", f.tools)).rejects.toThrow(/modified/)
    await expect(installer.remove("demo", "user", f.tools)).rejects.toThrow(/modified/)
    expect(await fs.readFile(path.join(dest, "manual"), "utf8")).toBe("keep")
  })

  it("preserves data on invalid manifests, records and unsupported scopes", async () => {
    await f.pack("demo", { name: "demo", version: "1.0.0" })
    await expect(installer.install("demo", "user", f.tools)).rejects.toThrow(/manifest/)
    const base = path.join(f.userHome, ".kiro", "powers")
    await expect(fs.stat(base)).rejects.toThrow()
    await expect(installer.install("demo", "project", f.tools)).rejects.toThrow()
    await expect(installer.install("../demo", "user", f.tools)).rejects.toThrow()
    await fs.writeFile(path.join(f.library.root, "demo", "plugin.json"), JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", name: "demo", version: "1", description: "demo", author: { name: "A" }, keywords: [] }))
    await fs.mkdir(base, { recursive: true })
    await fs.writeFile(path.join(base, "installed.json"), "{broken")
    await expect(installer.install("demo", "user", f.tools)).rejects.toThrow()
    expect(await fs.readFile(path.join(base, "installed.json"), "utf8")).toBe("{broken")
    const unsupported = '{"version":"2.0.0","installedPowers":[]}'
    await fs.writeFile(path.join(base, "installed.json"), unsupported)
    await expect(installer.install("demo", "user", f.tools)).rejects.toThrow(/installedPowers/)
    expect(await fs.readFile(path.join(base, "installed.json"), "utf8")).toBe(unsupported)
    await expect(fs.stat(path.join(base, "installed", "demo"))).rejects.toThrow()
  })

  it("protects missing or changed sources and keeps shared payloads", async () => {
    await f.pack()
    await installer.install("demo", "user", f.tools)
    const source = path.join(f.library.root, "demo", "skills", "hello", "SKILL.md")
    await fs.writeFile(source, "changed")
    await expect(installer.remove("demo", "user", f.tools)).rejects.toThrow(/source/)
    await fs.writeFile(source, "fixture")
    const base = path.join(f.userHome, ".kiro", "powers")
    await fs.writeFile(path.join(base, "registries", "another.json"), '{"powers":[]}')
    const result = await installer.remove("demo", "user", f.tools)
    expect(result.message).toContain("retained")
    expect(await fs.readFile(path.join(base, "installed", "demo", "skills", "hello", "SKILL.md"), "utf8")).toBe("fixture")
    expect(await installer.held(f.tools)).toEqual([])
  })

  it("retains a payload referenced by another custom power", async () => {
    await f.pack()
    await installer.install("demo", "user", f.tools)
    const base = path.join(f.userHome, ".kiro", "powers"), file = path.join(base, "registries", "user-added.json")
    const registry = JSON.parse(await fs.readFile(file, "utf8"))
    registry.powers.push({ name: "other", description: "shared", source: { type: "local", path: path.join(base, "installed", "demo") } })
    await fs.writeFile(file, JSON.stringify(registry))
    expect((await installer.remove("demo", "user", f.tools)).message).toContain("retained")
    expect(await fs.readFile(path.join(base, "installed", "demo", "skills", "hello", "SKILL.md"), "utf8")).toBe("fixture")
    expect(JSON.parse(await fs.readFile(file, "utf8")).powers).toHaveLength(1)
  })

  it("rejects source identity mismatch and a bundled .git directory", async () => {
    await f.pack()
    const source = path.join(f.library.root, "demo")
    const manifest = JSON.parse(await fs.readFile(path.join(source, "plugin.json"), "utf8"))
    await fs.writeFile(path.join(source, "plugin.json"), JSON.stringify({ ...manifest, name: "other" }))
    await expect(installer.install("demo", "user", f.tools)).rejects.toThrow(/manifest/)
    await fs.writeFile(path.join(source, "plugin.json"), JSON.stringify(manifest))
    await fs.mkdir(path.join(source, ".git"))
    await expect(installer.install("demo", "user", f.tools)).rejects.toThrow(/\.git/)
    await expect(fs.stat(path.join(f.userHome, ".kiro", "powers", "installed", "demo"))).rejects.toThrow()
  })

  it("refuses conflicting native records and preserves unrelated entries", async () => {
    await f.pack()
    const base = path.join(f.userHome, ".kiro", "powers")
    await fs.mkdir(path.join(base, "registries"), { recursive: true })
    const original = JSON.stringify({ powers: [{ name: "demo", description: "manual", source: { type: "local", path: "/elsewhere" } }, { name: "other", description: "other", source: { type: "local", path: "/elsewhere" } }] })
    await fs.writeFile(path.join(base, "registries", "user-added.json"), original)
    await expect(installer.install("demo", "user", f.tools)).rejects.toThrow(/conflicts/)
    expect(await fs.readFile(path.join(base, "registries", "user-added.json"), "utf8")).toBe(original)
    await expect(fs.stat(path.join(base, "installed", "demo"))).rejects.toThrow()
  })

  it("rolls back the copied payload and records on a transaction failure", async () => {
    await f.pack()
    const tools = { ...f.tools, disk: f.failingDisk() }
    await expect(installer.install("demo", "user", tools)).rejects.toThrow(/injected write failure/)
    const base = path.join(f.userHome, ".kiro", "powers")
    await expect(fs.stat(path.join(base, "installed", "demo"))).rejects.toThrow()
    await expect(fs.stat(path.join(base, "installed.json"))).rejects.toThrow()
    await expect(fs.stat(path.join(base, "registries", "user-added.json"))).rejects.toThrow()
  })

  it("refuses a payload changed after its removal snapshot", async () => {
    await f.pack()
    await installer.install("demo", "user", f.tools)
    const disk = f.tools.disk!, original = disk.commit.bind(disk)
    const added = path.join(f.userHome, ".kiro", "powers", "installed", "demo", "manual")
    disk.commit = async (roots, changes, copy, remove) => {
      await fs.writeFile(added, "keep")
      return original(roots, changes, copy, remove)
    }
    await expect(installer.remove("demo", "user", f.tools)).rejects.toThrow(/changed/)
    expect(await fs.readFile(added, "utf8")).toBe("keep")
    expect(JSON.parse(await fs.readFile(path.join(f.userHome, ".kiro", "powers", "installed.json"), "utf8")).installedPowers).toHaveLength(1)
  })

  it("detects concurrent payload and source edits before committing", async () => {
    await f.pack()
    const disk = f.tools.disk!, original = disk.commit.bind(disk)
    disk.commit = async (roots, changes, copy, remove) => {
      await fs.writeFile(path.join(f.library.root, "demo", "skills", "hello", "SKILL.md"), "raced")
      return original(roots, changes, copy, remove)
    }
    await expect(installer.install("demo", "user", f.tools)).rejects.toThrow(/changed/)
    await expect(fs.stat(path.join(f.userHome, ".kiro", "powers", "installed", "demo"))).rejects.toThrow()
  })
})
