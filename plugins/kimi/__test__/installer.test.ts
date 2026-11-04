import { describe, expect, it } from "vitest"
import { readInstalled } from "../src/plugin-state.ts"
import { createKimiInstaller } from "../src/installer.ts"

describe("Kimi plugin records", () => {
  it("accepts an absent file and preserves unknown fields", () => {
    expect(readInstalled(null)).toEqual({ version: 1, plugins: [] })
    expect(readInstalled('{"version":1,"extra":42,"plugins":[{"id":"demo","root":"/demo","enabled":false,"custom":true}]}'))
      .toMatchObject({ extra: 42, plugins: [{ custom: true }] })
  })
  it("rejects broken, future, malformed and duplicate records", () => {
    for (const text of ["", "{", '{"version":2,"plugins":[]}', '{"version":1,"plugins":{}}',
      '{"version":1,"plugins":[{"id":"x","root":"/x","enabled":"no"}]}',
      '{"version":1,"plugins":[{"id":"x","root":"/x","enabled":true},{"id":"x","root":"/y","enabled":false}]}']) {
      expect(() => readInstalled(text)).toThrow()
    }
  })
  it("checks for the Kimi program", async () => {
    const installer = createKimiInstaller()
    expect(await installer.available({ has: async () => false } as never)).toBe(false)
    expect(await installer.available({ has: async (name: string) => name === "kimi" } as never)).toBe(true)
  })
})
