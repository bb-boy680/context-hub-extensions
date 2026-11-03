import { describe, expect, it } from "vitest"
import { nativeManifest, safeName } from "../src/plugin-state.ts"

describe("Cursor native manifests", () => {
  it("accepts native component paths and variables", () => {
    const value = { name: "demo", skills: ["./skills/"], mcpServers: { demo: { command: "${CURSOR_PLUGIN_ROOT}/serve" } }, variables: { type: "object" } }
    expect(nativeManifest(JSON.stringify(value), "demo")).toEqual(value)
  })
  it("rejects missing or mismatched manifests, unsafe paths and unsupported variables", () => {
    expect(() => nativeManifest(null, "demo")).toThrow()
    for (const value of [
      { name: "other" }, { name: "demo", skills: "../outside" },
      { name: "demo", rules: "C:/outside" }, { name: "demo", agents: "x\\y" },
      { name: "demo", mcpServers: { server: { command: "${PLUGIN_ROOT}/run" } } },
    ]) expect(() => nativeManifest(JSON.stringify(value), "demo")).toThrow()
    for (const name of ["../bad", "con", "a\\b", ".hidden"]) expect(() => safeName(name)).toThrow()
  })
})
