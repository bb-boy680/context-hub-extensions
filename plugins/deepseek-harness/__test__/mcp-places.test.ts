import { describe, expect, it } from "vitest"
import type { McpIo, McpTools } from "../src/contracts.ts"
import { mcpPlaces } from "../src/mcp-places.ts"

class ErrorKey extends Error {
  constructor(public key: string) { super(key) }
}
const tools = { McpError: ErrorKey } as unknown as McpTools

describe("DeepSeek profile places", () => {
  it("offers one home install target and scans only initialized profiles", async () => {
    const reads: string[] = []
    const io: McpIo = { files: {
      list: async () => ["web", "desktop", "uninitialized"],
      snapshot: async () => ({ text: null, root: "a".repeat(64) }),
      read: async (ref) => {
        reads.push(ref.file)
        return ref.file.includes("uninitialized") ? null : JSON.stringify({ dsh: { profile: { bundles: [] } } })
      },
    }, log: () => undefined }
    const places = await mcpPlaces(io, tools)
    expect(places.map((place) => [place.file, place.installable])).toEqual([
      ["cordis.patch.yml", true], ["profiles/web/cordis.patch.yml", false], ["profiles/desktop/cordis.patch.yml", false],
    ])
    expect(new Set(places.map((place) => place.id)).size).toBe(3)
    expect(reads).toEqual(["profiles/web/package.json", "profiles/desktop/package.json", "profiles/uninitialized/package.json"])
  })

  it("refuses unsupported listing and does not invent a location", async () => {
    const io: McpIo = { files: { read: async () => null }, log: () => undefined }
    await expect(mcpPlaces(io, tools)).rejects.toMatchObject({ key: "deepseekHarness.error.unsupported" })
  })
})
