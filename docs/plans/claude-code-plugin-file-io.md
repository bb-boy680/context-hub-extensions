# Claude Code 插件改用文件读写

- 状态：**已实施，部分兼容性验收受环境限制；待用户确认。**
- 日期：2026-11-02。
- 范围：先完成 Claude Code 插件适配器的查询、安装、启停和卸载全部文件化。Codex 运行时迁移另行调研；本轮保留它仍在使用的公共 CLI 工具。
- 涉及仓库：`context-hub-extensions` 与相邻的 `dsh-context-hub`。只改扩展仓库无法完成目录投递与可靠写入，宿主必须补文件能力。
- 依据：[文件协议调研](../research/claude-code-plugin-files.md)、两个仓库的实际源码与测试、Hub `AGENTS.md` / `docs/memory.md`。
- 执行方式：批准后，在现有分支原地修改；按以下五个阶段建立 TaskCreate 任务并逐阶段更新。此计划不授权发布、提交、推送或修改真实用户的 Claude 配置。

## 1. 目标与最终行为

1. Claude 插件页刷新、工作区切换、搜索、市场安装、详情安装/卸载和启停不再启动 `claude` 或查找其可执行文件。
2. 安装来自 Hub 已收录的插件文件：生成本地 marketplace 索引，投递完整包目录，写安装和市场记录，写目标 settings；没有安装 CLI 也能完成配置。
3. 保持既有 `name@context-hub`、user/project 作用域和普通第三方 marketplace 插件的完整 id，不迁移成 `@skills-dir`，不要求重装现有插件。
4. 文件缺失与文件不可读分开处理；损坏/未知版本不会被当成空库覆盖。
5. 保留每个作用域自己的开关和其他工作区的记录；卸载不会删除其他作用域仍引用的缓存，也不会删除市场源目录。
6. Hub 报告的是“已安装/配置启用”；Claude 当前会话是否加载成功由新会话或 `/reload-plugins` 决定，不假称修改已热应用。

验收核心：测试把 Claude 安装器的 `tools.run` 和 `tools.has` 设为调用即失败，读取、安装、启停、卸载全流程仍然通过。真实 CLI 只可作为隔离验收的独立读取验证器，不能成为产品回退路径。

## 2. 现有实现与缺口

| 位置 | 已有能力 | 本次调整 |
| --- | --- | --- |
| 扩展 `plugins/claude.code/src/installer.ts` | CLI 安装器；settings 开关直读；只声明 user/project | 改为文件适配器，移除 Claude 命令构造和 stdout 解析 |
| 扩展 `src/index.tsx`、`src/contracts.ts` | 注册常量安装器；`PluginTools` 当前为 `any` | 注入已有 JSONC 编辑器，补齐实际使用的镜像类型 |
| Hub `packages/resources/plugins/src/provider.ts` | `PluginTools`、installer 注册、旧 CLI 通道 | 增加可选文件能力；保留老扩展和 Codex 的兼容接口 |
| Hub `src/tools.ts`、`handlers.ts` | HTTP 工具代理；描述包；生成市场索引 | 接通受限制的文件读取、完整目录投递和成批写入 |
| Hub `packages/core/src/host/atomic.ts` | 同目录暂存、rename、Windows 重试 | 直接复用，不另造原子写入工具 |
| Hub `packages/core/src/host/place-files.ts` | home/workspace 下整文件读写 | 可复用解析模式；本身不支持目录、独立 Claude 根或读改写一致性，不能假设直接够用 |
| Hub `packages/resources/mcp/src/jsonc.ts` / `ctx.mcp.tools` | 保留格式的 JSONC 逐节点编辑 | 从已注入的 mcp 服务复用，不复制解析器或增加生产依赖 |
| Hub `src/rows.ts`、`library.ts`、`install-actions.tsx`、`detail-dialog.tsx` | 持有记录折合、按名称查 id、位置操作 | 保留只读来源与精确 id；无工作区禁止写入；不把未知 scope 当成可卸载工作区安装 |
| Hub `packages/market/plugins/src/install-dialog.tsx` | 调同一 installer 的市场安装入口 | 验证新能力、只读/不可安装位置过滤，保持同一条安装链 |

当前 Claude 安装器没有专门的 installer 测试，只有 prompts 测试。宿主已有真实 socket 的 `bridge.test.ts`，可以覆盖两端字段契约。

## 3. 决策

### 3.1 保留本地 marketplace，写规范安装状态

Hub 市场仍为 `context-hub`，源仍为 Hub 插件库。安装同时维护：

- `<Hub 库>/.claude-plugin/marketplace.json`，继续复用 `syncMarketplace()`。
- `<插件根>/cache/context-hub/<name>/<version>/`，完整目录投递。
- `<插件根>/installed_plugins.json` v2 的目标记录。
- `<插件根>/known_marketplaces.json` 的 `context-hub` 条目。
- 用户 settings 的 `extraKnownMarketplaces.context-hub`。
- 目标 user/project settings 的 `enabledPlugins[完整 id] = true`。

本地相对路径插件实际从 Hub 库加载，缓存只保证规范安装布局和工具互操作，**不是源目录丢失时的加载回退**。因此需修正现有删除库文件的后果提示，明确会影响引用它的本地 Agent 插件，不改库删除动作的所有权或自动连带卸载其他 Agent。

### 3.2 Agent 协议留在扩展，宿主只给文件能力

不在 Hub handler 里增加 `if agent === claude`，不把 Claude 的 JSON schema 塞进 core。

新增可选 `PluginTools.disk`（命名可按实际接口风格微调），只支持本次所需操作：

- 按扩展声明解析配置根、插件根、当前工作区与库根。Claude 声明 `.claude` / `plugins` 和两个覆盖变量；宿主只解析目录，不返回整个环境变量表。
- 读取文本、列出指定目录的直接子项、检查目录，以及读取本地市场元数据。不得在浏览器直接调用 Node API。
- 把 **Hub 已收录的一个包** 投递到插件根下的相对缓存目录；不开放任意来源到任意目标的复制接口。
- 提交一批文件替换，附带读取时的原文/摘要、捕获的工作区和根路径；必要时移除本次重装目标的 `.orphaned_at`。不开放递归删除用户目录的接口。

实现主要落在 `packages/resources/plugins/src/host/installer-files.ts`（新）和现有桥，不扩大 `PlaceFiles` 的全局契约，也不建立通用脚本执行器或事务 DSL。

扩展通过工厂接收 `ctx.mcp.tools` 中已有的 `readJsonObject` / `editJson`，输出文件改动；宿主校验路径、比较快照、排队、暂存和写盘。旧 Hub 缺少 `disk` 时给明确“不支持此文件安装能力”的错误，不静默回退到 CLI。旧 Codex/旧扩展继续使用保留的接口。

### 3.3 写入一致性与边界

- 安装开始即固定 workspace/config/plugin 根；提交时工作区或环境根变化则拒绝，不能把前半段读 A、后半段写到 B。
- 根及子路径经绝对路径、盘符、`..`、反斜杠、realpath/symlink 检查；版本和包名都不能逃出缓存根。符号链接越界不能被复制时顺便展开。
- 对同一插件根的 Hub 写操作按队列串行，包含安装、启停、卸载；排队模式复用 `host/library.ts`，不只锁最后一次 `write`。
- 写前校验这批读取快照未变，发现外部修改报冲突并重新读取，不能盲写过期的整份 JSON。
- 所有新文本先解析/校验、文件先暂存；单文件替换复用 `writeFileAtomic`。多文件不是天然 ACID：失败时只回滚仍等于本次写入内容的文件，不覆盖之后的外部修改；明确报告未回滚部分与可恢复备份。
- 安装顺序：检查全部前提 → 准备缓存 → 市场状态/声明 → 安装记录 → 最后启用。失败不能留下虚假的启用成功。
- 卸载顺序：移除目标开关并核实 → 移除目标安装记录 → 核查所有剩余引用 → 最后标记缓存。
- 该协议不能保证与不遵循 Hub 队列的 Claude 进程完全互斥；原子替换和快照比较只缩小冲突窗口。文档明确该限制，测试不能把它宣称为跨进程锁。

### 3.4 读取与支持范围

- 读取 v2 及已验证的 v1；写入只产 v2。v1 转换前保存原文，保留未知字段；未知版本/损坏文件禁止写入。
- 每条安装按完整 id、scope、projectPath 识别；user 全局，project/local 只取当前工作区。Windows 路径比较忽略大小写，POSIX 保留大小写；不能复用当前无条件小写的比较去判断 POSIX 项目。
- settings 从 user/project/local 合并出继承值，同时单独保留每一处显式值。不可读不静默返回空开关。
- 已有普通第三方 marketplace 安装继续支持 user/project 启停和移除；源路径优先按本地市场 source 解析，否则读记录里的缓存。旧记录和非 Hub 包不强制重新收录。
- 本地市场只有 settings 声明而没有安装记录的插件单独识别；不能将其标为“没有插件”。来源标记区分“声明”“安装记录”“目录发现”。
- user/project 继续是可新增的安装目标；已有 local/managed 安装保留为只读，并参与配置解释，不把它们转换或删除。
- 发现 `@skills-dir` 时作为目录来源只读处理，不交给 marketplace 卸载器。只扫文档规定的带 `.claude-plugin/plugin.json` 的直接子目录，不把普通 SKILL.md 当插件。
- session/inline 不是持久安装，不从父进程环境导入到 Hub 列表。synced、seed、远程 managed policy 的完整运行时解析不在这一期；对遇到的这类持久来源保留可识别的信息和只读状态，不能给出可执行的卸载动作。
- 本轮不声称本地配置状态等于 managed/CLI flags 参与后的最终会话状态。可检测到的 managed 限制必须保留和遵守；无法确定策略时禁用该记录的写操作并说明范围，不读取凭证或联网补策略。

### 3.5 依赖、数据和其他兼容边界

- 这一期安装目标是 Hub 已收录的本地包，不实现 Claude 的远端 marketplace 下载器或包管理器。
- `plugin.json` 的其他插件依赖不能被忽略：安装/启用前检查；第一期对带非空依赖声明的包明确拒绝自动安装/启用并给原因，卸载/禁用前检查是否仍被其他已启用插件依赖。有无法解析的依赖关系时拒绝破坏性操作。后续独立补依赖解析，不悄悄让客户端后台完成一半安装。
- Node/Python 等运行时依赖、hooks/MCP/LSP 的实际执行由插件与 Claude 负责；文件投递不执行插件脚本，不自动运行 npm/bun。官方本地原位加载也不会向源目录安装 Node 依赖，文档说明其限制。
- 卸载移除目标配置/记录后，只在确认全局所有作用域无引用且目录确实位于缓存根内时写 `.orphaned_at`（毫秒时间戳）；不自行清理旧版本。
- **推荐本次卸载保留 `plugins/data/`、插件选项及 secrets**，并在确认文案/README 写明。与 CLI 默认删除最后 scope 数据的语义有意不同，此差异包含在本次审批中。
- 同名但不同市场的记录不能被“取第一个 id”用于写入。折合到 place 时保留完整 id；如果现有一行无法唯一选中一个安装，动作报歧义而非猜测，不趁机重做整个目录身份模型。

## 4. 阶段一：补宿主文件通道与边界测试

**目标**：扩展获得受限制的读取、目录投递和成批提交能力，无 Claude 专用逻辑。

**文件**（以下 Hub 路径均相对 `dsh-context-hub`）：

- `packages/resources/plugins/src/provider.ts`：可选 `PluginTools.disk` 与请求/结果类型。
- `packages/resources/plugins/src/tools.ts`：远端调用，捕获工作区/根快照。
- `packages/resources/plugins/handlers.ts`：动作校验与 host 接线。
- `packages/resources/plugins/src/host/installer-files.ts`（新）：根解析、读/列目录、暂存复制、串行提交与补偿。
- `packages/resources/plugins/__test__/installer-files.test.ts`（新）、`__test__/bridge.test.ts`：文件与真实 socket 两层验证。
- `src/library-store.ts` / `src/library.ts`：仅当工具组装需要时调整，保留旧工具。

**验收**：

- `CLAUDE_CONFIG_DIR` 与独立插件根案例可以用测试注入路径运行；宿主不出现 Claude 文件字段 schema。
- 空配置、没有工作区、不同盘符、中文/空格/`%` 路径、路径穿越、外链 symlink、写入中途失败、并发改同一 settings、外部修改、切工作区的案例覆盖。
- 缓存从本地库完整复制；同内容重复投递不重写；不同内容同目录冲突报错。复制源只能来自已收录库。
- 真实 HTTP 请求/响应两端字段匹配；所有写入只发生在测试根内；无子进程。

## 5. 阶段二：实现 Claude 持久文件读取

**目标**：读取实际文件生成持有记录和每处开关，替代 `plugin list` 与 CLI 可用性探测。

**文件**（以下扩展路径均相对 `context-hub-extensions`）：

- `plugins/claude.code/src/installer.ts`：改成接收现有 JSONC toolkit 的工厂，保留对外 installer 行为。
- `plugins/claude.code/src/plugin-state.ts`（新）：v1/v2 解析、合并配置、id/scope/projectPath 匹配；仅拆出纯逻辑，不建立新框架。
- `plugins/claude.code/src/locations.ts`：只新增插件相关文件/根常量，路径比较对平台敏感。
- `plugins/claude.code/src/contracts.ts`：替换本次使用的 `PluginTools = any`，镜像可选文件能力与来源/只读信息。
- `plugins/claude.code/src/index.tsx`：注册工厂产物，复用已注入的 `ctx.mcp.tools`。
- `plugins/claude.code/__test__/installer.test.ts`（新）、`__test__/plugin-state.test.ts`（新）。

**验收**：

- 固定 fixtures 覆盖第三方市场、v1/v2、多项目、user/project/local 覆盖、缺字段、缺文件、格式损坏、未知版本、仅声明本地插件、skills-dir 只读来源。
- 磁盘不可达与空安装分开报告；无 `claude` 可执行文件时仍能扫描及准备安装。
- Windows/POSIX 路径比较不会串工作区。
- `tools.run/has` 设置为 throw，读取和 `switches()` 全部通过。

## 6. 阶段三：实现纯文件安装、启停和卸载

**目标**：适配器构造受校验的文件改动，通过阶段一的宿主通道提交。

**文件**：

- 扩展 `plugins/claude.code/src/installer.ts`、`src/plugin-state.ts`。
- 扩展 `plugins/claude.code/src/messages.ts`：新增操作失败、兼容边界、需要刷新会话的必要消息。
- 扩展 `plugins/claude.code/__test__/installer.test.ts`、`__test__/plugin-state.test.ts`。
- Hub 阶段一的 host/bridge 测试，按真实操作链补用例。

**安装验收**：

- 新安装一次写完整目录、两种市场状态、v2 记录和正确 scope 开关，原有配置无关节点与格式保留。
- 重装不重复插入；保留首次 `installedAt`，真正更新时变更 `lastUpdated`；已有同名市场异路径拒绝。
- 缺 manifest 但标准 Claude 组件布局有效的包按已有支持继续处理；版本来自 Claude manifest/市场条目，无版本本地非 git 包为 `unknown`。
- 没有工作区时 project 安装在写任何文件前失败；不会落到 Hub 进程 cwd。
- 非空插件依赖、损坏清单、未知状态版本、路径冲突都在提交前明确拒绝。

**启停与卸载验收**：

- 启停只动一个 settings key，user/project 相互覆盖仍可解释，不改记录/缓存。
- 移除精确 `(id, scope, projectPath)`，其他项目/市场/作用域记录完整保留。
- 最后一处移除只写废弃标记，不删除数据和 secrets、不删除 Hub 库。
- local/managed/skills-dir/session 等来源不会误进入普通 marketplace 卸载路径。
- 失败注入后不存在“已报成功、配置未落地”；补偿未完成明确报告，不能吞错误。
- `tools.run/has` 调用为零。

## 7. 阶段四：接入页面状态与所有安装入口

**目标**：列表、详情、搜索和市场使用同一文件真相，能正确处理只读来源和精确安装身份。

**文件**（Hub）：

- `packages/resources/plugins/src/provider.ts`、`src/types.ts`、`src/rows.ts`：最少的来源/可操作性信息，折合不丢完整 id。
- `packages/resources/plugins/src/library.ts`、`src/library-store.ts`：定位精确记录，写后刷新。
- `packages/resources/plugins/src/install-actions.tsx`、`src/detail-dialog.tsx`：只读记录不出现错误卸载入口，删除源目录后果准确。
- `packages/market/plugins/src/install-dialog.tsx`：检查新安装目标能力，不能选择只读目标。
- `packages/resources/plugins/src/messages.ts`、`packages/i18n/zh-cn/src/messages.ts`：必要状态与删除后果提示，不增加教学段落。
- 对应 `rows.test.ts`、`library-store.test.ts`、`library.test.ts` 与 market 插件相关测试。

**验收**：

- 未安装 CLI 不再使 Claude 位置显示“客户端未安装”而阻断文件管理；旧 Hub 缺新能力时显示明确兼容错误。
- local/managed 只读安装仍可见；未知 scope 不再默认当可写工作区安装；两个同名市场不可误改其中一个。
- 图标、位置数量、开关和操作读取同一份派生状态。
- 详情安装与市场安装落盘一致；工作区切换后不显示别的项目安装。
- 删除仍被本地 Claude 引用的 Hub 源目录前，现有确认框清楚说明会影响加载。
- Codex 的现有测试和 CLI 适配器继续通过。

## 8. 阶段五：兼容验收、文档与交付清理

**目标**：证明文件实现和真实 Claude 读取相容，记录边界，交付可审核 diff。

**文件**：

- 扩展 `plugins/claude.code/README.md`、本调研文档：写明路径、支持 scope、独立于 CLI、刷新会话、依赖和数据保留规则。
- Hub `docs/extensions.md`：文件能力契约和兼容要求。
- 扩展 `plugins/claude.code/package.json`：执行完成后版本由 `0.2.0` 升为 `0.3.0`，反映安装后端及卸载语义变化；`plugin.yaml` 不新增版本字段。
- 新能力采用可选检测，不为此虚构 Hub 最低版本。发布前如需提高 `engines.contextHub`，按实际发布版本另行核实；旧宿主明确不支持，禁止 CLI 回退。

**检查命令**（使用两个仓库现有 pnpm 工具链）：

```sh
# context-hub-extensions
pnpm --filter claude.code test
pnpm --filter claude.code typecheck
pnpm lint
pnpm test
pnpm typecheck
pnpm build

# dsh-context-hub
pnpm --filter @context-hub/plugins test
pnpm --filter @context-hub/plugins typecheck
pnpm --filter @context-hub/plugins lint
pnpm --filter @context-hub/market-plugins test
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

以上包名和命令均已与两个仓库当前 `package.json` 核对；构建生成的 `lib/` 和 `marketplace.json` 按仓库规则不纳入源文件提交。

**独立验收**：

- 使用新建 `CONTEXT_HUB_HOME`、`CLAUDE_CONFIG_DIR`、`CLAUDE_CODE_PLUGIN_CACHE_DIR` 与工作区，由真实 Hub 文件通道安装被动 fixture。
- 然后单独用 `claude plugin list --json` 和 `claude plugin details <id>` 验证记录及技能发现；CLI 只在验收脚本出现，不在产品执行链。
- user/project、禁用/继承、卸载一个 scope、最后卸载、重装取消废弃标记、非 Hub 安装等场景均有明确断言。
- 浏览器验证用 `ego-browser`，独立启动新 server，确认插件页/详情/市场流程；不复用旧 server 的 host 代码。
- 若环境无法验证某平台或浏览器，逐项注明，不用单测替代运行结果。
- 清理本次临时 fixture/server，保留必要的脱敏验收结论；不修改真实用户安装记录，不提交构建产物，不顺手修无关代码。
- 最终稳定状态维护受管 AOCI 条目；检查两个仓库 diff。用户确认完成后再归档计划。

## 9. 实施和验收记录

- 已通过真实 Hub 文件桥向隔离 Claude 2.1.296 安装被动技能，`plugin details` 可发现该技能；产品安装器测试中的 `run/has` 设为调用即抛错。
- Windows 的隔离浏览器验证通过插件卡片安装以及详情安装/卸载；市场页打开后外部来源仍在读取，未完成市场安装的浏览器验收。未验证 Electron 窗口及 macOS/Linux。
- 主仓库全量测试 1497 项通过；两个仓库的类型检查、lint 和构建通过。末次安全边界修改后重跑相关测试与类型、lint 检查。
- AOCI 已更新，Verify、Check、Guide 均报告治理对齐。
- 企业远程及系统策略未完整解析；可识别的 managed 安装记录只读，受策略管理的环境应使用 Claude 自身工具。跨进程写入不受 Hub 租约保护。

## 10. 计划自审

- 查询和安装均已纳入纯文件实现，没有“读文件、写仍用 CLI”的折中。
- 已覆盖调用方：插件页、详情、搜索共享读取、市场安装；已列出 contracts、入口、测试、文案和文档。
- 完整 id、scope、projectPath 与目录来源不会在写入前丢失。
- 读取不等于加载；无缓存能加载、本地源丢失不能回退、声明无记录三种情况都有实测依据。
- 缓存与用户数据分开；多 scope 引用、原子单文件替换和多文件失败补偿已明确。
- 跨进程并发、依赖自动解析和组织运行时策略没有伪装成已解决；支持边界与拒绝行为已写明。
- 保留 Agent 扩展负责协议的架构，不把 Claude 特例写进宿主；复用已有 JSONC 编辑和原子写工具。
- 审批范围包含上述 Claude Code 方案及必要宿主支持，以及“卸载保留持久数据”的语义。
