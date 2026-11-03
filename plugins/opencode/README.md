# opencode

OpenCode as a Context Hub extension. Installing it registers the places
OpenCode reads skills from, its prompt provider, its JSONC MCP files, and the
target descriptor the shell uses.

The supported client is **OpenCode V2**; the acceptance baseline is **v2.2.5**.
This extension does not implement OpenCode V1 configuration, aliases, migrations
or the V1 plugin API, and it does not manage OpenCode code plugins. A real-client
acceptance run records the binary version it used; the package itself does not
download or execute OpenCode.

```text
package.json      package metadata; version and main (lib/index.js)
plugin.yaml       kernel manifest; no version or entry
build.mjs         esbuild build into lib/index.js
tsconfig.json     type checking for src/ and __test__/
vitest.config.ts  unit tests for the providers
src/index.tsx     brand mark and the apply(scope) registrations
src/locations.ts  where OpenCode keeps its files
src/messages.ts   English and Chinese strings for the rows
assets/icon.svg   the official mark, inlined by the market index
assets/LICENSE.opencode.txt  the upstream MIT licence
__test__/         registration, MCP provider and prompt provider tests
lib/index.js      build output the hub loads; CI builds it on the PR branch
README.md         this file
```

## What it registers

- Skills places, both OpenCode's own: `.opencode/skills` in the workspace and
  `~/.config/opencode/skills` for the machine. Neither is `shared`.
- MCP provider: the six `opencode.json(c)` files described below.
- Prompt provider: `commands` and `agent` in both scopes, and machine-wide
  `instructions` in `AGENTS.md`.
- Target: id `hub.target.opencode`, supporting skills, MCP, memory and agents.
- English and Chinese messages under the `opencode.*` namespace.

OpenCode also reads `.agents/skills`, `~/.agents/skills`, `.claude/skills` and
`~/.claude/skills`. The workspace `.agents/skills` place belongs to the Hub
skills module, and `.claude/skills` belongs to the Claude Code extension; this
extension does not register, write or count either one again. There is no
shared global place for `~/.agents/skills` in this hub, so that directory is
not covered here.

The skills page counts each physical place separately. Choosing only OpenCode
shows the shared workspace place plus the two native places; choosing Claude
Code as well does not add a second `.claude` copy from this extension; disabling
OpenCode removes both native places without touching the shared one.

## MCP files

Each row is one physical file, and the label names it:

| Place id | Scope | Label | File |
| --- | --- | --- | --- |
| `opencode-global-jsonc` | global | `OpenCode · opencode.jsonc` | `~/.config/opencode/opencode.jsonc` |
| `opencode-global-json` | global | `OpenCode · opencode.json` | `~/.config/opencode/opencode.json` |
| `opencode-workspace-jsonc` | workspace | `OpenCode · opencode.jsonc` | `<workspace>/opencode.jsonc` |
| `opencode-workspace-json` | workspace | `OpenCode · opencode.json` | `<workspace>/opencode.json` |
| `opencode-dotdir-jsonc` | workspace | `OpenCode · .opencode/opencode.jsonc` | `<workspace>/.opencode/opencode.jsonc` |
| `opencode-dotdir-json` | workspace | `OpenCode · .opencode/opencode.json` | `<workspace>/.opencode/opencode.json` |

Only native OpenCode V2 configuration is read or written: servers live at
`mcp.servers.<name>`, the switch is the entry's `disabled` boolean, a local
server's `command` is an array, its environment is `environment`, and a remote
server is `type: "remote"`. The hub maps its own declaration to those fields:
`transport: stdio` becomes `type: "local"` with `[program, ...args]`,
`transport: http` becomes `type: "remote"` with `url` and `headers`, and
`transport: sse` is refused because V2 has no field that selects SSE.

A file with a flat `mcp.<name>` server, an old `enabled` switch, a numeric
`timeout`, or camelCase OAuth fields is not converted. The operation fails with
`opencode.error.v2Only` and the file is left byte for byte; handle the old
format outside the hub and retry. Comments, trailing commas, unrelated keys and
unknown fields in a V2 entry are preserved: an update patches only the leaves
the delivery owns, and a switch writes only `disabled`.

The switch changes the declaration in that one file. System, global, project or
`.opencode` configuration with higher precedence can override it; the switch is
not OpenCode's final connection status, and the hub does not merge those layers
or report what OpenCode finally applies. Missing files read as zero servers and
are not created until an install names them. A failed read or write in one file
never falls through to another file.

## Prompts and instructions

| Form | Workspace | Global |
| --- | --- | --- |
| `commands` | `.opencode/commands/<slug>.md` | `~/.config/opencode/commands/<slug>.md` |
| `agent` | `.opencode/agents/<slug>.md` | `~/.config/opencode/agents/<slug>.md` |
| `instructions` | — | `~/.config/opencode/AGENTS.md` (marked section) |

A command file carries only the description OpenCode reads and the prompt body;
the command id is the file name, so no `name` field is written:

```markdown
---
description: "Review the current changes"
---

<!-- context-hub:code-review -->
Review the diff.
```

An agent file adds `mode: subagent`, so it never replaces the main agent
implicitly. This extension writes no model, permission or tool list. Descriptions
are collapsed to one line and written as a JSON-quoted YAML scalar, so Chinese
text, colons, quotes and newlines cannot become new fields. `$ARGUMENTS`, `$1`
and shell-template text in the body are stored as written; nothing is executed.

The ownership marker must be the first body line after the frontmatter. A file
without it belongs to a person: install refuses it and remove leaves it alone.
The project's `AGENTS.md` is the hub's shared workspace place and is not offered
again here; only the machine-wide `AGENTS.md` takes a marked section, and an
incomplete open/close pair is refused rather than consuming the text after it.
A generated file is updated in place on a second install and removed only when
this extension wrote it.

## Scope and roots

The default global root is `~/.config/opencode` on every platform, Windows
included (`%USERPROFILE%\.config\opencode`, not `%APPDATA%\opencode`). A project
keeps `.opencode/` and `opencode.json(c)` at its root.

Only the default global root and the workspace selected in the hub are
covered. `XDG_CONFIG_HOME`, `OPENCODE_CONFIG_DIR` and ancestor-directory
configuration are **not** managed; custom roots currently need handling outside
the hub. Hub state describes the physical files it lists, not OpenCode's final
merged configuration or policy result.

## Client version

There is no hub contract for a provider to run `opencode --version` during an
install, so this extension does not detect or block a V1 client at click time.
Check the binary before relying on the delivery:

```sh
opencode --version
```

Anything other than OpenCode V2 (baseline v2.2.5) is unsupported. This
extension refuses V1-shaped MCP configuration rather than converting it.

## Build and test

```sh
pnpm install
pnpm --filter opencode test
pnpm --filter opencode typecheck
pnpm --filter opencode build
```

The unit tests mock the hub toolkits. One integration suite runs the providers
against the real JSONC editor, prompt tools, file port and skills store from a
Context Hub checkout:

```sh
CONTEXT_HUB_CHECKOUT=D:/work-space/dsh-context-hub \
  pnpm --filter opencode test __test__/host.test.ts
```

Without `CONTEXT_HUB_CHECKOUT` that suite is reported as skipped, so ordinary
plugin CI still runs the unit tests; a skip is not a pass. A release gate must
set the variable and run the file explicitly. A value that is not an absolute
path, or a checkout missing an imported file, fails instead of skipping. The
suite creates its own temporary hub home, workspace and user home, passes all
three to the host ports, and deletes them afterwards; it never reads or writes a
real client directory.

From the repository root, `pnpm build` builds every plugin and regenerates
`marketplace.json`.

`lib/index.js` is generated by CI on the pull-request branch; source branches do
not commit it. Raise the version in `package.json` only — never in
`plugin.yaml`.

The plugin imports nothing but `react`; the hub maps that name to its own
instance through the page's import map. Everything else arrives through the
services named in `plugin.yaml`'s `inject`.
