# Cursor

Registers Cursor as an agent with workspace and user skills, MCP declarations,
workspace commands and rules, and workspace/user subagents. The workspace
`AGENTS.md` and `.agents/skills` places are shared by Context Hub and are not
registered twice. Cursor also reads `~/.agents/skills`, but the hub does not yet
expose a shared global place. Nested skill roots are not scanned by this extension.

Native plugin packs require `.cursor-plugin/plugin.json`. Files are delivered to
`~/.cursor/plugins/local/<name>`; only the user scope is offered. Cursor may need
Reload Window or a restart. Hub does not expose a plugin enable switch, read
Cursor's database or account state, or manage project/team plugins. The listed
plugin state is unknown: a local directory does not prove that Cursor loaded or
enabled it, and marketplace plugins of the same name may take precedence. The
host directory listing omits symbolic links, so linked local plugins are not
listed. Known non-Cursor placeholder variables are rejected in the manifest and
files other than common binary types. Binary types are copied unchanged and not
inspected; explicitly referenced MCP and hooks files are always checked.

MCP places show declarations, not Cursor's approval or connection status. Their
switches are managed in Cursor. Variables are kept as literal strings. Rules
are `.mdc` files with a description and `alwaysApply: false`; existing unmarked
prompt files are not overwritten or removed. Shared `AGENTS.md` remains under
the shared provider.

This extension targets the current local Hub version `0.2.0` for development.
It depends on this working tree's unreleased native manifest registration,
directory templates, directory snapshot transactions and unknown plugin state
APIs; the engine range must be updated against the actual release that provides
them before publication. The Cursor application and component discovery have
not been tested in an isolated Cursor installation. No claim is made that Cursor
loaded the copied components.

Run `pnpm --filter cursor test` for the standalone manifest checks. To run the
host integration tests too, set `CURSOR_TEST_HUB_SOURCE` to an absolute path to
a Hub source checkout with dependencies installed; the tests use temporary
workspace, home, user home and library directories. Without that variable those
integration tests are explicitly skipped.

The icon is the unmodified `CUBE_2D_LIGHT.svg` from the [Cursor brand assets](https://cursor.com/brand).
Cursor and its mark belong to their owner; the brand asset is not relicensed here.
