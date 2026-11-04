# Trae

This extension targets the current Trae IDE (CN) and TRAE CLI 2.0 documentation.
The Context Hub 0.2.0 engine minimum is a development baseline, not a published
API guarantee. Verify the minimum version before release. Real clients have not
been tested.

Trae IDE (CN) uses `.trae/skills` in the workspace and `~/.trae-cn/skills` globally. Project MCP declarations are written to `.trae/mcp.json`; project rules are written to `.trae/rules/<slug>.md` as intelligent rules. Enable project MCP in IDE settings before use. The shared `.agents/skills` directory and `AGENTS.md` require their respective IDE settings; they are provided by the host, not duplicated here.

TRAE CLI 2.0 stdio MCP declarations use the default `~/.trae/traecli.toml` only. The ordinary asset file port does not follow a custom `TRAE_HOME`, and this extension cannot detect whether one is set. Environment variables, HTTP MCP, CLI skills, and CLI project configuration paths are not established by the current CLI documentation and are not written here. File delivery does not establish that a service is connected.

## Plugin protocol investigation

Plugin installation is not implemented for either target. Both remain integration goals; neither is represented as an installed plugin when only individual assets are delivered.

| Protocol item | TRAE CLI 2.0 | Trae IDE (CN) |
| --- | --- | --- |
| Package | Third-party [Chorus at `f7395d6`](https://github.com/Chorus-AIDLC/Chorus/blob/f7395d6a9009340d838518cd0859dd18b2475d35/plugins/chorus/.codex-plugin/plugin.json) uses `.codex-plugin/plugin.json` with skills and hooks. [OpenViking](https://github.com/volcengine/OpenViking/blob/c486088ee7c43c46ba0e6d494e5622086a499aab/examples/memory-plugin-shared/install.sh) also uses a Codex-compatible package for this CLI. This is third-party evidence, not an official protocol guarantee. | [Official marketplace documentation](https://docs.trae.cn/ide_marketplace.md) describes agent plugins installed through the IDE UI, but no local package import or manifest format. Editor `.vsix` extensions are a separate system. |
| Marketplace | Chorus uses `.agents/plugins/marketplace.json` as a source catalog and invokes the client to register it. The exact local `[marketplaces.*]` values produced by the client are undocumented. | Local registration, source format, and state storage are unconfirmed. |
| Install record and cache | [Chorus setup](https://github.com/Chorus-AIDLC/Chorus/blob/f7395d6a9009340d838518cd0859dd18b2475d35/docs/CONNECT_TRAE.md) describes `$TRAE_HOME/plugins/cache/<market>/<plugin>/<version>/` and `[plugins."name@market"] enabled = true`; it used `traecli` to create these files. It does not document every marketplace field, version selection, references or safe removal. | Installation and per-component enable switches are described in the UI only; file records and removal rules are unconfirmed. |
| Scope, dependencies and removal | Per-`TRAE_HOME` user installation is evidenced; dependency handling, multiple cached version selection, external references, and the complete removal transaction remain unconfirmed. | Scope, dependencies, external references, and removal transaction remain unconfirmed. |

Next, obtain a versioned TRAE CLI schema or client-produced before/after fixtures for marketplace registration, installation, multiple versions and removal in an explicitly isolated root. Then implement `src/installer.ts` and transaction tests against the host disk port. For the IDE, seek an official local Agent plugin import/discovery specification before defining a separate adapter. None of these steps require or authorize access to the user's existing client configuration.

The icon is the unchanged [official website favicon](https://lf-cdn.trae.com.cn/obj/trae-com-cn/trae_website_prod_cn/favicon.png).
Its redistribution permission has not been confirmed; verify brand terms before release.
