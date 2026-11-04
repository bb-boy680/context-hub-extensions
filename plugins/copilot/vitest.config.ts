import { defineProject } from "vitest/config"

/**
 * The installer and providers translate between Copilot's files and the hub's
 * contracts; unit tests need no browser, network or real user directory.
 */
export default defineProject({
  test: {
    name: "copilot",
    include: ["__test__/**/*.test.ts"],
  },
})
