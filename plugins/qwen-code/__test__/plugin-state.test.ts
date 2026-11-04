import { createHash } from "node:crypto"
import { describe, expect, it } from "vitest"
import { parseQwenSnapshot, qwenActivation, qwenClearWorkspaceActivation, qwenLocalIdentity, qwenProjection, qwenProjectionHash, qwenSetActivation, qwenStoredIdentity } from "../src/plugin-state.ts"

// https://github.com/QwenLM/qwen-code/blob/042c023b7beb4ad2a9ef95b2906b3564e3f23089/packages/core/src/extension/extension-store.ts
const id = createHash("sha256").update("demo").digest("hex")
const valid = () => ({ version: 2, generation: 7, legacyProjectionHash: "0".repeat(64), custom: "preserved", extensions: { [id]: { name: "demo", defaultActivation: "disabled", workspaceOverrides: { "/a": "enabled", "/b": "inherit" }, legacyPathRules: ["!/*"], extra: { keep: true } } } })

describe("Qwen 0.26.6 extension store", () => {
  it("derives local and stored identities using the upstream branches", async () => {
    expect(await qwenLocalIdentity("demo")).toBe(id)
    expect(qwenStoredIdentity({ type: "snapshot", installId: id })).toBe(id)
    expect(qwenStoredIdentity({ type: "local", installId: id })).toBeNull()
    expect(() => qwenStoredIdentity({ type: "snapshot", installId: "invalid" })).toThrow()
    await expect(qwenLocalIdentity("../demo")).rejects.toThrow()
  })
  it("accepts current snapshots and retains unknown fields", () => {
    const value = valid()
    expect(parseQwenSnapshot(JSON.stringify(value))).toEqual(value)
  })
  it("matches activation precedence and projection byte order", async () => {
    const snapshot = parseQwenSnapshot(JSON.stringify({ ...valid(), legacyProjectionRemainder: { Other: { overrides: ["/other/"] }, DEMO: { overrides: ["ignored"] } } }))
    const policy = snapshot.extensions[id]
    expect(qwenActivation(policy, "/a", "/a")).toBe("enabled")
    expect(qwenActivation(policy, "/b", "/b")).toBe("disabled")
    expect(qwenActivation(policy, "/c", "/c")).toBe("disabled")
    const rules = { ...policy, workspaceOverrides: {}, legacyPathRules: ["!/*", "/foo/*", "!/foo/private/*"] }
    expect(qwenActivation(rules, "/foo/child", "/foo/child")).toBe("enabled")
    expect(qwenActivation(rules, "/foo/private/child", "/foo/private/child")).toBe("disabled")
    expect(qwenActivation({ ...rules, workspaceOverrides: { "/foo/child": "inherit" as const } }, "/foo/child", "/foo/child")).toBe("disabled")
    const projection = qwenProjection(snapshot)
    const text = '{"Other":{"overrides":["/other/"]},"demo":{"overrides":["!/*","!/*","/a/","!/b/"]}}'
    expect(JSON.stringify(projection)).toBe(text)
    expect(await qwenProjectionHash(projection)).toBe(createHash("sha256").update(text).digest("hex"))
  })
  it("updates one policy without mutating other workspaces or the source", async () => {
    const original = valid()
    const snapshot = parseQwenSnapshot(JSON.stringify(original))
    const updated = await qwenSetActivation(snapshot, id, "demo", "/a", false)
    expect(updated.generation).toBe(8)
    expect(updated.extensions[id].workspaceOverrides).toEqual({ "/a": "disabled", "/b": "inherit" })
    expect(updated.extensions[id].extra).toEqual({ keep: true })
    expect(snapshot).toEqual(original)
    expect(updated.legacyProjectionHash).toBe(await qwenProjectionHash(qwenProjection(updated)))
    const global = await qwenSetActivation(updated, id, "demo", null, true)
    expect(global.extensions[id].defaultActivation).toBe("enabled")
    expect(global.extensions[id].workspaceOverrides).toEqual(updated.extensions[id].workspaceOverrides)
    await expect(qwenSetActivation(snapshot, id, "other", null, true)).rejects.toThrow()
  })
  it("clears a workspace override while masking matching path rules", async () => {
    const snapshot = parseQwenSnapshot(JSON.stringify(valid()))
    const masked = await qwenClearWorkspaceActivation(snapshot, id, "demo", "/a", "/a")
    expect(masked.extensions[id].workspaceOverrides["/a"]).toBe("inherit")
    expect(masked.extensions[id].workspaceOverrides["/b"]).toBe("inherit")
    expect(qwenActivation(masked.extensions[id], "/a", "/a")).toBe("disabled")
    const noRules = structuredClone(snapshot)
    noRules.extensions[id].legacyPathRules = []
    const cleared = await qwenClearWorkspaceActivation(noRules, id, "demo", "/a", "/a")
    expect(Object.hasOwn(cleared.extensions[id].workspaceOverrides, "/a")).toBe(false)
  })
  it("rejects old or malformed states and policies", () => {
    for (const invalid of [
      { ...valid(), version: 1 },
      { ...valid(), generation: -1 },
      { ...valid(), legacyProjectionHash: "bad" },
      { ...valid(), extensions: { bad: { name: "demo", defaultActivation: "enabled", workspaceOverrides: {} } } },
      { ...valid(), extensions: { [id]: { name: "demo", defaultActivation: "enabled", workspaceOverrides: { x: "other" } } } },
      { ...valid(), legacyProjectionRemainder: { A: { overrides: [] }, a: { overrides: [] } } },
    ]) expect(() => parseQwenSnapshot(JSON.stringify(invalid))).toThrow()
  })
})
