# Kimi Code CLI

Integrates [Kimi Code CLI 2.4.1](https://github.com/MoonshotAI/kimi-code/tree/%40moonshot-ai%2Fkimi-code%402.4.1) with Context Hub. This extension depends on plugin file APIs in the current Context Hub development checkout; the minimum released version providing them is not yet verified.

- Skills: `~/.kimi-code/skills/` and project `.kimi-code/skills/`.
- MCP: `~/.kimi-code/mcp.json` and project `.kimi-code/mcp.json`, with per-file enable and disable. Project entries override user entries in Kimi.
- Instructions: marked sections in `~/.kimi-code/AGENTS.md` and project `.kimi-code/AGENTS.md`.
- Agents: Markdown files in `~/.kimi-code/agents/` and project `.kimi-code/agents/`. Kimi requires kebab-case ASCII names. Existing agent files without the Hub marker are not overwritten or removed.
- Plugins: user-level installs from packs with `kimi.plugin.json` or `.kimi-plugin/plugin.json`, using `plugins/installed.json` and `plugins/managed/`. Project-level plugins are not supported by Kimi. Removing an installation retains the managed copy, as Kimi does; an unrecorded or modified existing copy is never overwritten. Reinstallation is refused when the managed copy differs from the library, including when the library pack was updated. Run `/reload` or start a new session after changes.

`KIMI_CODE_HOME` is respected for plugin installations. Skills, MCP, instructions and agents currently use the default root; the shared workspace `.agents/skills`, `.agents/agents`, and root `AGENTS.md` are handled by the Hub's shared providers. Global `.agents` locations are not managed by this extension. `SYSTEM.md` is not managed. Other agents' manifests are not used to determine a Kimi plugin's identity.

No real Kimi client was used to validate loading or component execution. The brand icon is the unmodified [official Kimi logo](https://statics.kimi.ai/kimi-web-seo/assets/kimi-logo-CegIMkbU.png), linked from the [Kimi brand page](https://www.kimi.com/resources/kimi-brand). Kimi's [brand guidelines](https://moonshotai.github.io/Branding-Guide/) reserve rights; confirm permission before redistribution.
