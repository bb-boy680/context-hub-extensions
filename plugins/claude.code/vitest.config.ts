import { defineProject } from "vitest/config"

/**
 * The prompt provider is a translation between the hub's provider contract and
 * Claude Code's files; the tests stand in those boundaries and need no browser,
 * network or real user directory.
 */
export default defineProject({
  test: {
    name: "claude.code",
    include: ["__test__/**/*.test.ts"],
  },
})
