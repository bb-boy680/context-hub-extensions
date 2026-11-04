# Qwen Code

This extension is under development against the local Context Hub 0.2.0 API; the required host changes have not necessarily been released.

The icon is the unmodified [Qwen Code documentation icon](https://qwenlm.github.io/qwen-code-docs/favicon.png), SHA-256 `ad7aaf529ec001319a5fdd5481a147d1293355a8c6619e65036eb459c8291521`. Qwen is its respective owner's brand; this integration is not endorsed by Qwen. The upstream source license does not itself grant trademark rights.

Skills use the default `~/.qwen/skills` and project `.qwen/skills` directories. The hub already provides project `.agents/skills`; global `~/.agents/skills`, custom skill directories and the `QWEN_HOME` override for ordinary assets are not managed by this extension.

MCP declarations use `.qwen/settings.json` in each scope. Entries have no Hub-managed on/off switch; the declaration view does not prove that a server is allowed, connected, or wins the client's configuration precedence.

Prompts can be delivered as Markdown commands, skills, agents and marked sections of `QWEN.md` (project root or `~/.qwen/QWEN.md`). The extension preserves other instruction text and rejects unmanaged files or broken markers. It does not manage `.qwen/QWEN.local.md` or write `AGENTS.md`.

The native `qwen-extension.json` format is registered for intake and local file installation. The artifact is stored once under `QWEN_HOME/extensions/<name>`; the global switch controls default activation, and the workspace switch controls its own override. Removing a workspace override restores inheritance without removing the artifact. The install menu offers global or workspace activation for a new artifact; after installation, workspace activation is managed through the status menu.

The installer uses the Qwen Code 0.26.6 V2 state, compatible file lock and transaction journal. Existing pending transactions, invalid state or a projection that disagrees with the state hash are left for client recovery or reconciliation. Unknown, external, changed or credential-dependent packages remain read-only; packages containing competing plugin manifests, `.git`, `.env`, `.env.*` or installation metadata are refused. Windows directory locks that prevent rename cause the operation to fail safely; the client's copy fallback is not implemented. An interruption between creating a staging directory and recording its journal can leave an unjournaled staging directory requiring inspection. Client preference and secret cleanup is not performed.

For plugin files, an explicit `QWEN_HOME` must be absolute. Qwen also accepts `~` and relative values, but the current host rejects those values because it cannot determine the client's actual working directory or expand them through this declaration. Ordinary skills, MCP and prompt locations do not use `QWEN_HOME`.

Real Qwen Code client behavior has not been tested. For host integration tests,
set `CONTEXT_HUB_CHECKOUT` to the absolute path of a local Hub checkout and run
`pnpm --filter qwen-code test`. Process interruption fixtures require Node 22 or
newer and exercise isolated temporary roots; they simulate the documented client
recovery outcome without running Qwen.
