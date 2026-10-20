import { defineProject } from "vitest/config"

/**
 * The installer and provider are translations between Codex's CLI/TOML shapes
 * and the hub's contracts; the tests stand in those boundaries and need no
 * browser, network or real user directory.
 */
export default defineProject({
  test: {
    name: "codex",
    include: ["__test__/**/*.test.ts"],
  },
})
