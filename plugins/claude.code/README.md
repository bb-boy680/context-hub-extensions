# claude.code

Claude Code as a Context Hub extension. Installing it registers the places
Claude Code reads skills from, its prompt provider, its MCP files, the plugin
installer the Plugins page drives, and the target descriptor the shell uses.

```text
package.json    package metadata; version and main (lib/index.js)
plugin.yaml     kernel manifest; no version or entry
build.mjs       esbuild build into lib/index.js
tsconfig.json   type checking for src/ and __test__/
vitest.config.ts  the provider tests
src/index.tsx   brand mark and the apply(scope) registrations
src/locations.ts  where Claude Code keeps its files
src/prompts.ts    Claude Code's prompt provider
src/provider.ts   Claude Code's MCP file reader/writer
src/installer.ts  Claude Code's plugin installer
src/messages.ts   English strings for the rows
__test__/prompts.test.ts  the provider's landing tests
assets/icon.svg   the image the market index inlines
lib/index.js    built by CI on the pull request; ignored on source branches
README.md       this file
```

## Prompt delivery

The provider writes one file per prompt name:

| Form | Workspace | Global |
| --- | --- | --- |
| `commands` | `.claude/commands/<slug>.md` | `~/.claude/commands/<slug>.md` |
| `rule` | `.claude/rules/<slug>.md` | `~/.claude/rules/<slug>.md` |
| `agent` | `.claude/agents/<slug>.md` | `~/.claude/agents/<slug>.md` |
| `instructions` | — | `~/.claude/CLAUDE.md` (marked section) |

The project's own `CLAUDE.md` is not offered: it is a shared file, and an
action that edits it under the same words as a private file would hide the
difference.

## Build

```sh
pnpm install
pnpm test
pnpm build
```

From this directory `pnpm test` runs the provider tests and `pnpm build` builds
only this plugin. Run `pnpm build` at the repository root to build every plugin
and regenerate `marketplace.json`.

`lib/index.js` is built by CI on the pull request and is not committed on a
source branch. Raise the version in `package.json` only — never in
`plugin.yaml`.

The plugin imports nothing but `react`; the hub maps that name to its own
instance through the page's import map. Everything else arrives through the
services named in `plugin.yaml`'s `inject`.
