# ZCode

此扩展位于 `plugins/zcode`，依赖本轮工作树中尚未发布的 Hub API，包括目录 snapshot 与原子删除契约。`plugin.yaml` 中的 `>=0.2.0 <0.7.0` 仅以当前宿主工作树版本作为本地开发基线；已发布的同号版本不保证支持，市场可能误判其兼容。发布前必须根据实际包含这些 API 的宿主发布版本修正范围。

本扩展只支持本计划选定的当前原生格式，不做历史配置迁移、第二清单回退、自动依赖下载或 CLI 后端。运行时只 import `react/jsx-runtime`；其余工具由 Hub 服务注入。

| 资产 | 用户级 | 工作区级 |
| --- | --- | --- |
| Skills | `~/.zcode/skills` | `.zcode/skills` |
| MCP | `~/.zcode/cli/config.json#mcp.servers` | `.zcode/config.json#mcp.servers` |
| Commands | `~/.zcode/commands/<slug>.md` | `.zcode/commands/<slug>.md` |
| Agents | `~/.zcode/agents/<slug>.md` | `.zcode/agents/<slug>.md` |
| Instructions | `~/.zcode/AGENTS.md` 的 Hub 标记段 | 使用 Hub shared 的 `AGENTS.md`，本扩展不重复注册 |
| 插件包 | `~/.zcode/cli/plugins/cache/context-hub/<name>/<version>` | 本版不注册 project 安装或启停位置 |

ZCode 也读取 `.agents/skills`、`.agents/commands` 等共享来源，workspace 已由 Hub shared provider 管理，global 共享目录不归为 ZCode 专属安装位置。位置数量表示磁盘持有数量，同名优先级由客户端决定。官方 runtime 源码实际加载用户、项目与已启用插件的 agents；本轮只验证生成文件，没有运行真实 profile。Settings 只提供用户级编辑入口不能说明项目 runtime 不支持。

MCP 使用严格 JSON 和显式 `type: stdio|http|sse`、`env`、`headers`、`enabled`。目标条目含 `environment`、`http_headers`、`enable`、`remote` 或混用旧字段时读取显示不支持，所有修改拒绝且字节不变。重装保留 false、oauth、timeoutMs 等非管理字段；开启删除 `enabled`，关闭写 false。这里只报告指定物理文件的状态，user 同名 MCP 覆盖 project 的最终连接状态由 ZCode 判断。

Desktop 在同 scope 的 native server 列表为空时才读取 `.agents/mcp.json#mcpServers`。首次添加 native server 前检查这一 fallback；非空则拒写并要求在 ZCode 设置迁移，防止整组共享配置被遮蔽。该文件没有注册可写 place，也不复制其秘密。CLI 不覆盖这个 Desktop fallback。删除最后一条 native server 保留空 object，允许 Desktop fallback 重现。

提示词生成平铺 Markdown，要求宿主 slug 结果符合 `^[a-z0-9][a-z0-9_:-]{0,63}$`，不截断、音译或添加授权字段。Agent 拒绝保留名 `general-purpose`/`Explore`；description 依次取原描述、正文首句和名称。手写同名文件拒绝覆盖/删除，Hub 文件幂等更新；指令只删除自己完整的标记段，坏标记拒写。自动 Memory 位于用户 storage 的 `cli/memories/projects/<project>/memory`，本版不生成项目 id、不写运行时记忆或开关。

插件输入只接受 `.zcode-plugin/plugin.json`，并通过 `registerManifests` 让宿主收录；库名、manifest.name 和记录 name 必须一致。缺版本使用当前协议 `0.0.0`。完整包原样复制，隐藏文件、空目录与执行位保留，无复制后清单 overlay。`installed_plugins.json` 只接受 `{version:1,plugins:[...]}` 且记录只为 user，`known_marketplaces.json` 只接受 `{version:1,marketplaces:[...]}`。旧 map、workspace record、未来版本或错误类型拒写；未知字段保留。

安装前拒绝非空 dependencies、缺 required userConfig 或类型不符；已有 user/project options 和每项 `default` 可以满足 required，不记录敏感值。首次安装补 user true，重装保留显式 false；项目相反 override 或 `plugins.enabled=false` 阻止声称生效的写操作。held 解释当前项目覆盖和总门；规范 Hub cache 没显式开关按当前 installed cache 默认 false，第三方/缺清单无法证明时为未知。switches 仅列 user 文件的显式布尔。

本安装器只管理自己安装并具有持久 `contextHubSnapshot` 的规范 `context-hub` cache；第三方行保持真实 id 并只读。源 snapshot、目的地历史 snapshot、registry/config 快照在宿主事务中校验。重装同版本不同内容、复制前源变化、缓存用户修改、配置/工作区变化均拒绝；卸载把目录与记录/开关放入同一补偿事务。没有历史 snapshot 的包不强行覆盖或删除，请用 ZCode 原生管理。关闭/卸载前检查 reverse dependencies；其它包清单缺失或 inline dirs 无法验证时拒绝。data、options、其它项目覆盖、市场登记和旧版本缓存保留，不做垃圾回收。多文件补偿不等于跨进程锁，宿主无法恢复时会报告并保留恢复材料。

离线验证命令在任意 cwd 可运行，脚本把扩展复制到全新临时目录，链接该包已安装的依赖，所有客户端文件端口显式使用临时 `home`、`folder/workspace`、`userHome`、受控 `env:{}`。不运行客户端，不下载依赖，finally 清理临时副本。

```sh
node D:/work-space/context-hub-extensions/plugins/zcode/scripts/verify.mjs test typecheck build lint marketplace
CONTEXT_HUB_CHECKOUT=D:/work-space/dsh-context-hub node D:/work-space/context-hub-extensions/plugins/zcode/scripts/verify.mjs test typecheck build lint marketplace
```

2026-11-03：正式目录的后一个命令在临时副本中通过 5 个测试文件、59 条测试（含 8 条真实宿主端口回归），typecheck/build/lint 和单包市场检查通过；bundle 约 38.2 KiB，仅 React runtime 外部 import。未提供 `CONTEXT_HUB_CHECKOUT` 时真实宿主 8 条会明确 skipped。真实 adapter 验证 native-only 收录、复制字节与执行位、MCP/plugins 邻接字段、locate、两个 registry 原子写失败补偿、卸载补偿、源/cache/config/workspace 冲突和中间 junction 拒绝。

`marketplace` 检查使用正式 manifest，在独占临时副本运行既有市场生成器，检查单包 id/version/icon/source.path。它不能代表真实全仓根构建；全仓检查由集成流程负责。

尚未运行 ZCode Desktop/CLI、doctor、skills/commands/plugins list、runtime agents/MCP/Hook，亦未验证 GUI 位置计数与菜单。真实客户端验收由用户后续进行。没有读取或改动真实 `.zcode`/`.agents`/`.claude`，未停止既有进程，未登录/联网 MCP/模型调用。

协议证据来自 Context7 `/zai-org/zcode` 与官方当前 main：`apps/zcode-cli/packages/adapters/src/plugins/{index,marketplace}.ts`、`packages/bootstrap/src/{plugins,subagents}.ts`、`packages/contracts/src/plugins/index.ts`、https://zcode.z.ai/en/docs/plugin 、https://zcode.z.ai/en/docs/subagents 。此证据不证明 3.16.3 或 README 所述 3.17.1 发布构建均已加载，发布版必须另测。

图标是官网 https://zcode.z.ai/en 的原始 SVG，598 bytes，SHA-256 `2b9d3871496471ced5a758b9ea3b6051819a108d68cb6bed503fe55a28ba8c0c`；path/颜色机械保留。品牌权利归 ZCode 及其关联方；https://zcode.z.ai/en/terms 第 VI.1 节没有授予独立品牌许可，源码许可证不等于商标授权。此图只标识 ZCode 集成，不表示官方背书，公开发布前仍须确认使用依据。

AOCI 本轮仅读取宿主相关切片；扩展仓库没有本任务受管索引。宿主源码和其它扩展由并行 Agent 持续修改，本轮未对其做仓库级 maintain，避免将他人的中间状态作者化。计划仍未归档，等待独立验收及用户确认。
