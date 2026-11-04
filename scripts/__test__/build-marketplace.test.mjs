import assert from "node:assert/strict"
import test from "node:test"

import { collectEntries } from "../build-marketplace.mjs"

test("marketplace entries retain directory discovery order", async () => {
  const entries = [
    { name: "z", isDirectory: () => true },
    { name: "ignored", isDirectory: () => false },
    { name: "a", isDirectory: () => true },
    { name: "m", isDirectory: () => true },
  ]
  const seen = []
  const result = await collectEntries(entries, async (id) => {
    seen.push(id)
    return { id }
  })
  assert.deepEqual(seen, ["z", "a", "m"])
  assert.deepEqual(result.map((entry) => entry.id), ["z", "a", "m"])
})
