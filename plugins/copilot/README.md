# GitHub Copilot extension

Adds one GitHub Copilot target with workspace and default-home skills, four MCP configuration locations, instructions, rules, agents, VS Code Local prompt files and declarative plugin delivery. The shared workspace `.agents/skills` place is provided by the Hub; compatibility paths such as `.claude/skills` and global `.agents/skills` are not registered again.

The package targets the current local Context Hub 0.2.0 development tree and requires this round's **unreleased** generic plugin file and unknown-enabled-state contracts. The engine range is a development baseline, not a claim that any released 0.2.0 build has those capabilities; update it to the actual release before publishing.

Skills, MCP and prompt assets use the default `~/.copilot` root, not `COPILOT_HOME`. Plugin declarations alone honor an absolute `COPILOT_HOME`. VS Code Local user profiles are not selected automatically. The Local prompt location is not a Copilot CLI command surface. The workspace `.mcp.json` may require a VS Code experimental setting; this extension does not change it. MCP enablement is managed by the client.

Plugin delivery accepts only Agent Plugins 1.1.0 `plugin.json` and its matching `mcp.json` schema. It registers the Hub library as the `context-hub` directory marketplace and writes `enabledPlugins` into the chosen user or project settings. The client is expected to load the source from the library in a later session; no copy is installed. Remove deletes only that scope's declaration, retaining the library, marketplace registration, client cache and `plugin-data`. External and direct installations are read-only. A missing source remains visible with unknown status. Local and compatibility settings can block edits; managed policy remains controlled by the client. The extension does not read or write `config.json`, run Copilot, execute package scripts or contact MCP servers.

The marketplace index and settings are written separately. If the settings commit fails, the index may already have changed; inspect both the declaration and the index before retrying.

The live-load behavior is **not yet verified in a real client**. Before release, with isolated home and workspace directories, verify all three in the installed Copilot CLI version: a declaration loads an actual skill/MCP component in a new session without an installed-plugins copy; removing the declaration prevents activation after restart; and a project false overrides user true without leaking into another project. Verify `.claude` versus Copilot settings precedence, managed policy behavior, and the VS Code Copilot and Local harnesses separately. Consult that client's `--help` before using diagnostic commands. If any live-load check fails, do not publish this installation method.

## Development checks

Run `pnpm --filter copilot test`, `pnpm --filter copilot typecheck` and `pnpm --filter copilot build` from the extension workspace. The real host integration test is optional and requires a sibling host checkout: set `COPILOT_HOST_TEST` to the absolute path of its `packages/resources` directory and run the test again. It creates and removes isolated temporary roots.

## Third-party notices

The icon is the unmodified [GitHub Primer Octicons Copilot icon](https://github.com/primer/octicons/blob/main/icons/copilot-24.svg), SHA-256 `eeafb3c2f333e04ccf7d031ae215f7adafaed4c6352556b0bf79496e048bcdd7`. GitHub and Copilot are trademarks; the icon's license does not grant trademark rights or imply endorsement.

MIT License

Copyright (c) 2026 GitHub Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
