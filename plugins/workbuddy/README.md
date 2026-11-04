# WorkBuddy

The extension registers WorkBuddy skill locations (`~/.workbuddy/skills` and
`.workbuddy/skills`), MCP files (`~/.workbuddy/mcp.json` and
`.workbuddy/mcp.json`), Coding commands under `.codebuddy/commands` in both
scopes, and marked sections in `~/.codebuddy/CODEBUDDY.md`. The `.codebuddy`
locations are shared with CodeBuddy and affect its Coding sessions too. The
project `AGENTS.md` is already provided by the Hub's shared place.

MCP delivery supports the documented stdio `mcpServers` shape. Remote transports
and MCP switches are not implemented because their file format was not established.
Existing unsupported entries are not overwritten; other entries and unrelated
fields are preserved. Coding command files without the Hub marker are never
replaced or removed.

Native plugin packs use `.codebuddy-plugin/plugin.json` only. The installer copies
packs into `~/.workbuddy/plugins/cache/context-hub/<name>/<version>`, writes
`installed_plugins.json`, marketplace registration and user/project settings with
the Hub file transaction API, and never invokes a CLI. It preserves existing
explicit enablement, refuses unsafe paths, dependencies and interactive plugin
configuration, protects non-Hub marketplace entries, and leaves cached files and
persistent data on removal. Local and managed records are read-only. A conflicting
scope produces an unknown effective state; the exact precedence and project
settings path still require a WorkBuddy client check. A transaction error that
contains `operation committed` means the change succeeded but backup cleanup
failed; re-read the disk state before retrying.

The registry version 2 record shape, cache path, and user `enabledPlugins` map
are based on published WorkBuddy disk observations, not a sample taken in this
development session: [registry sample](https://cloud.tencent.cn/developer/article/2768686)
shows a `name@marketplace` array with `scope`, `installPath`, `version`,
`installedAt` and `lastUpdated`; [local state discussion](http://mp.weixin.qq.com/s?__biz=MzkzMzE3OTU3Nw==&mid=2247484628&idx=1&sn=211360f32d622550dabe25690777b314)
shows the version 2 `plugins` map, cache paths, and the boolean `enabledPlugins`
map. Both were consulted on 2026-11-03; their exact observation dates and client
versions are unknown. Test data is synthetic and is not a client capture.
The `known_marketplaces.json` directory-source shape and project settings location
are assumptions drawn from the common CodeBuddy protocol and require testing in
the user's WorkBuddy version. The [official plugin reference](https://www.workbuddy.cn/docs/cli/plugins-reference)
does not specify the full registry schema. Verify installation, enable/disable,
workspace precedence and component discovery in an isolated client before relying
on them; filesystem tests do not prove that the client loaded a component.

`engines.contextHub: >=0.2.0 <0.7.0` is a **local development baseline**, not a
claim that the released 0.2.0 contains the required APIs. This extension requires
the current unreleased Hub changes for native manifest registration and unknown
plugin status. Set the engine floor to the eventual release containing those APIs
before publishing.

Official references: [MCP guide](https://www.workbuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/MCP-Guide),
[project Coding configuration](https://www.workbuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Project),
[plugin marketplace](https://www.workbuddy.cn/docs/cli/plugin-marketplaces).

The icon is the unchanged [official WorkBuddy mark](https://assets.workbuddy.cn/web/workbuddy/873deebfa9e3b25b5cfe6abc7bb5a77678dbf3e5/assets/logo.svg).
WorkBuddy and its mark belong to their respective owner; no separate
redistribution license was identified. Confirm permission before release. See the
[developer agreement](https://open.workbuddy.cn/docs/developer-agreement) and
[service agreement](https://rule.tencent.com/rule/202603180001).
