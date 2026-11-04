# Antigravity

接入 Antigravity 的全局技能、MCP、规则、代理、全局指令和插件包。工作区技能、代理与 `AGENTS.md` 使用 Context Hub 的共享位置；工作区规则写入 `.agents/rules/context-hub-<name>.md`。

MCP 使用 `~/.gemini/config/mcp_config.json` 和 `.agents/mcp_config.json`。远程配置使用 `serverUrl`；旧 `url`、`httpUrl` 条目会被拒绝，不会自动迁移。Antigravity 没有单独记录 SSE 类型的已验证字段，因此 SSE 投递被拒绝。

插件包仅支持根 `plugin.json` 或 `.antigravity-plugin/plugin.json`。个人安装将文件复制到 `~/.gemini/context-hub/cache/context-hub/<name>/<version>`，并写入 `~/.gemini/config/plugins.json` 的 `entries.path`。读取顶层 entries，不跟随 `inherits`；外部路径只读。当前扩展没有持久所有权记录，且不能确认其他发现来源是否引用缓存，因此卸载只移除自身发现项并保留缓存，升级也不删除旧版本。请在确认没有引用且不再需要后自行处理残留缓存。

插件启用状态未知，启停由 Antigravity 客户端管理。个人和项目发现目录及 entries 的具体加载行为、cache 直连后的 skill/rule/agent 实际加载、以及启用状态协议均未在隔离客户端验证；文件测试不能证明客户端加载成功。项目级专属技能位置不另行注册。宿主多文件事务在备份清理失败时可能报告 `operation committed`，此时应重读发现清单确认结果；扩展保留宿主原错误，不把它解释成操作未执行。

本地开发基线是 Context Hub `0.2.0` 工作树，依赖本轮尚未发布的原生清单、文件安装和未知启用状态 API；不能据此认为已发布的 `0.2.0` 包含这些 API，发布前应设置实际提供这些 API 的最低版本。

协议参考：[Plugins](https://antigravity.google/docs/plugins.md)、[Discovery](https://antigravity.google/docs/customization-discovery?tab=cli)、[MCP](https://antigravity.google/docs/mcp.md)、[Rules](https://antigravity.google/docs/rules.md)。图标来自 [Google Antigravity](https://antigravity.google/assets/image/brand/antigravity-icon__full-color.svg)，Google 产品商标，使用该图标不代表官方背书；公开分发前请确认品牌使用依据。
