import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { promises as fs } from "node:fs"
import path from "node:path"
import { createCursorPrompts } from "../src/prompts.ts"
import { fixture, hostAvailable, promptTools } from "./fixtures.ts"

let f: Awaited<ReturnType<typeof fixture>>
let provider: ReturnType<typeof createCursorPrompts>
beforeEach(async () => { f = await fixture(); provider = createCursorPrompts(promptTools, () => null) })
afterEach(async () => { await f.cleanup() })
const prompt = { name: "Test Name", description: '中文: "quoted"\nnext', prompt: "# Body\ncontents" }

describe.skipIf(!hostAvailable)("Cursor prompts", () => {
  it("delivers and removes marked commands, rules and agents in their own scopes", async () => {
    for (const form of ["commands", "rule", "agent"]) await provider.install(f.io, "cursor", prompt, form)
    await provider.install(f.io, "cursor-global", prompt, "agent")
    expect(await provider.held(f.io, "cursor", prompt)).toEqual({ commands: true, rule: true, agent: true })
    expect(await provider.held(f.io, "cursor-global", prompt)).toEqual({ agent: true })
    const rule = path.join(f.workspace, ".cursor", "rules", "test-name.mdc")
    const text = await fs.readFile(rule, "utf8")
    expect(text).toContain('description: "中文: \\"quoted\\"\\nnext"')
    expect(text).toContain("alwaysApply: false")
    expect(text.startsWith("---\n")).toBe(true)
    await provider.install(f.io, "cursor", prompt, "rule")
    expect(await fs.readFile(rule, "utf8")).toBe(text)
    expect(await provider.remove(f.io, "cursor", prompt, "rule")).toBe(true)
    expect(await provider.remove(f.io, "cursor", prompt, "rule")).toBe(false)
    await expect(provider.install(f.io, "cursor-global", prompt, "rule")).rejects.toThrow()
    await expect(provider.install(f.io, "cursor-global", prompt, "commands")).rejects.toThrow()
    await expect(provider.install(f.io, "cursor", prompt, "instructions", "agents")).rejects.toThrow()
  })
  it("does not overwrite or remove a hand-written file", async () => {
    const file = path.join(f.workspace, ".cursor", "commands", "test-name.md")
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, "My own command")
    await expect(provider.install(f.io, "cursor", prompt, "commands")).rejects.toThrow()
    expect(await provider.remove(f.io, "cursor", prompt, "commands")).toBe(false)
    expect(await fs.readFile(file, "utf8")).toBe("My own command")
  })
})
