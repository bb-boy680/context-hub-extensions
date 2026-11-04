import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { promises as fs } from "node:fs"
import path from "node:path"
import { createKiroPrompts } from "../src/prompts.ts"
import { fixture, hostAvailable, promptTools } from "./fixtures.ts"

let f: Awaited<ReturnType<typeof fixture>>
let provider: ReturnType<typeof createKiroPrompts>
const prompt = { name: "代码 Review", description: '中文 "说明"\n第二行', prompt: "﻿第一行\r\n第二行\r\n" }

describe.skipIf(!hostAvailable)("Kiro prompts", () => {
  beforeEach(async () => { f = await fixture(); provider = createKiroPrompts(promptTools, () => null) })
  afterEach(async () => { await f.cleanup() })

  it("installs, detects, updates and removes owned rule and agent files in both scopes", async () => {
    const slug = promptTools.slugOf(prompt.name)
    for (const [place, root] of [["kiro", f.workspace], ["kiro-global", f.userHome]] as const) {
      for (const form of ["rule", "agent"] as const) {
        const file = path.join(root, ".kiro", form === "rule" ? "steering" : "agents", `context-hub-${slug}.md`)
        await provider.install(f.io, place, prompt, form)
        const text = await fs.readFile(file, "utf8")
        expect(text).toContain(`name: ${JSON.stringify(`context-hub-${slug}`)}`)
        expect(text).toContain(`description: ${JSON.stringify(prompt.description)}`)
        expect(text).toContain(`<!-- context-hub:${slug} -->\n第一行\n第二行\n`)
        expect(text.includes("inclusion: auto")).toBe(form === "rule")
        expect((await provider.held(f.io, place, prompt))[form]).toBe(true)
        await provider.install(f.io, place, prompt, form)
        expect(await fs.readFile(file, "utf8")).toBe(text)
        expect(await provider.remove(f.io, place, prompt, form)).toBe(true)
        expect(await provider.remove(f.io, place, prompt, form)).toBe(false)
      }
    }
  })

  it("protects manual files and leaves the shared workspace AGENTS.md untouched", async () => {
    const slug = promptTools.slugOf(prompt.name)
    const file = path.join(f.workspace, ".kiro", "steering", `context-hub-${slug}.md`)
    const shared = path.join(f.workspace, "AGENTS.md")
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, "manual\n")
    await fs.writeFile(shared, "workspace instructions\n")
    await expect(provider.install(f.io, "kiro", prompt, "rule")).rejects.toThrow()
    await expect(provider.remove(f.io, "kiro", prompt, "rule")).rejects.toThrow()
    await expect(provider.install(f.io, "kiro", prompt, "instructions", "agents")).rejects.toThrow()
    expect(await fs.readFile(file, "utf8")).toBe("manual\n")
    expect(await fs.readFile(shared, "utf8")).toBe("workspace instructions\n")
  })

  it("preserves adjacent instructions, and refuses broken or duplicate section markers", async () => {
    const file = path.join(f.userHome, ".kiro", "steering", "AGENTS.md")
    const slug = promptTools.slugOf(prompt.name), open = `<!-- context-hub:${slug} -->`, close = `<!-- /context-hub:${slug} -->`
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, "before\n\nafter\n")
    await provider.install(f.io, "kiro-global", prompt, "instructions", "agents")
    const installed = await fs.readFile(file, "utf8")
    expect(installed).toContain("before\n\nafter")
    expect((await provider.held(f.io, "kiro-global", prompt))["instructions:agents"]).toBe(true)
    await provider.install(f.io, "kiro-global", prompt, "instructions", "agents")
    expect(await fs.readFile(file, "utf8")).toBe(installed)
    expect(await provider.remove(f.io, "kiro-global", prompt, "instructions", "agents")).toBe(true)
    expect(await fs.readFile(file, "utf8")).toBe("before\n\nafter\n")
    expect(await provider.remove(f.io, "kiro-global", prompt, "instructions", "agents")).toBe(false)
    for (const text of [open, close, `${close}\n${open}`, `${open}\n${open}\n${close}`, `${open}\n${close}\n${close}`]) {
      await fs.writeFile(file, text)
      await expect(provider.install(f.io, "kiro-global", prompt, "instructions", "agents")).rejects.toThrow()
      await expect(provider.remove(f.io, "kiro-global", prompt, "instructions", "agents")).rejects.toThrow()
      expect(await fs.readFile(file, "utf8")).toBe(text)
    }
  })

  it("rejects dangerous slugs and unknown places, forms and options before writing", async () => {
    for (const slug of ["", "..", "../a", "a\\b", "con", "NUL", "a\u0000b"]) {
      const unsafe = createKiroPrompts({ ...promptTools, slugOf: () => slug }, () => null)
      await expect(unsafe.install(f.io, "kiro", prompt, "rule")).rejects.toThrow()
    }
    await expect(provider.install(f.io, "unknown", prompt, "rule")).rejects.toThrow()
    await expect(provider.install(f.io, "kiro", prompt, "unknown")).rejects.toThrow()
    await expect(provider.install(f.io, "kiro-global", prompt, "instructions", "unknown")).rejects.toThrow()
    expect(await fs.readdir(f.workspace)).toEqual([])
    expect(await fs.readdir(f.userHome)).toEqual([])
  })
})
