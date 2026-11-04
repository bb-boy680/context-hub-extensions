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

## Plugin installation

The plugin installer reads and writes Claude Code's files through the Context Hub
host. It does not run or locate the `claude` executable. A compatible host must
provide the plugin file channel; an older host reports that it is unsupported.

User settings are read from `$CLAUDE_CONFIG_DIR/settings.json`, defaulting to
`~/.claude/settings.json`. Plugin state is under `$CLAUDE_CODE_PLUGIN_CACHE_DIR`,
or `<Claude config>/plugins` when that variable is absent. Project settings are
under the selected workspace's `.claude/`. The environment is the one inherited
by the Hub host, which may differ from a terminal running Claude Code.

Installations use `name@context-hub`, a local marketplace pointing at the Hub
plugin library, a versioned cache, the installation index, and the selected
scope's settings. Claude Code loads relative sources from the library itself:
deleting the library's plugin directory prevents those plugins from loading,
even when a cache exists. File changes become visible to Claude Code after a new
session or `/reload-plugins`; Hub reports configuration, not runtime load status.

User and project installations can be managed. Local, managed and skills-directory
records are shown as read-only. The file adapter does not evaluate remote managed
policies or operating-system policy stores; use Claude Code's own tooling in a
policy-managed environment. Plugin dependencies are not installed automatically:
installing or enabling a plugin with declared dependencies is refused. Disabling
or uninstalling a plugin required by another enabled plugin is also refused.
Uninstall preserves plugin data, options and secrets and marks an unreferenced
cache for Claude Code's own cleanup. File installation does not run plugin scripts
or install Node/Python dependencies.

Claude Code's on-disk installation index is not a stable published write API.
The compatibility checks use Claude Code 2.1.296 on Windows; a later client may
change its format. Hub checks file snapshots and serializes its own operations,
but cannot lock other processes writing the same files.

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
