# Codex agent 扩展实施计划

- 仓库：`context-hub-extensions`
- 目标插件：`plugins/codex`，市场 id `codex`
- 目标客户端：Codex CLI（本机已验证 `codex-cli 0.144.6`）
- 状态：待用户审批。批准前不修改任何源码或配置。
- 依据：本仓库 `README.md`、`docs/publishing.md`、`plugins/claude.code`、`plugins/skills.sh`、`scripts/build-marketplace.mjs`；Hub `docs/extensions.md` 与当前 `packages/resources/*`、`packages/extensions/src/*` 契约；Hub 历史 commit `e6df43e^` 的 Codex 实现。

## 1. 背景与现状

### 1.1 本仓库

`context-hub-extensions` 是一个 pnpm workspace，`plugins/*` 每个目录是一个可独立构建的扩展包。市场索引 `marketplace.json` 和每个插件的 `lib/` 由 CI 在 PR 分支生成后提交，源分支不提交它们（`.gitignore` 已忽略 `plugins/*/lib/` 和 `marketplace.json`）。

现有两个插件：

- `plugins/claude.code`：agent 扩展，注册 skills places、prompts places、MCP provider、plugin installer、target、`en` locale，并内联 Claude Code 图标。
- `plugins/skills.sh`：source 扩展，只注册远端 skill registry，带 vitest 单测。

当前没有 Codex 插件。根目录已有 `icons/codex.svg`，但 Git 状态是未跟踪文件；本计划把它复制到插件资产目录，并建议随 PR 提交（与已跟踪的 `icons/zcode.svg` 一致），不修改原文件内容。

### 1.2 Hub 的扩展模型（当前版本）

- 下载型扩展目录包含 `plugin.yaml`、`package.json`、`lib/index.js` 和资产；`package.json` 持有 `version` 与 `main`，`plugin.yaml` 不得声明 `version`/`entry`。
- 入口模块导出 `apply(scope)`。扩展只能 import `react`、`react-dom`、`react/jsx-runtime`、`react/jsx-dev-runtime`；其他能力都从 `scope` 上的 kernel service 读取。
- `plugin.yaml` 的 `inject` 必须列出扩展读取的每个 service；服务名会被 kernel 映射到 `ctx.<service>`。
- 本扩展需要的服务名是 `skills`、`mcp`、`plugins`、`targets`、`locales`。

### 1.3 Hub 当前相关契约（真实文件）

| 能力 | Hub 文件 | 本扩展用到的符号 |
| --- | --- | --- |
| Skills places | `packages/resources/skills/src/provider.ts` | `SkillPlace`、`SkillProvider`、`SkillService.register` |
| Skills 共享 place | `packages/resources/skills/src/extension.ts` | `SHARED_PLACE`，workspace `.agents/skills`，order 10 |
| Prompts 共享 place | `packages/resources/prompts/src/index.ts` | `WORKSPACE_PLACE`，workspace `AGENTS.md`，共享，order 0 |
| MCP provider | `packages/resources/mcp/src/provider.ts` | `McpPlace`、`McpProvider`、`McpService.register`、`ctx.mcp.tools` |
| MCP toolkit | `packages/resources/mcp/src/toolkit.ts`、`toml.ts` | `parseToml`、`setTomlEntry`、`setTomlField`、`clearTomlEntry`、`tomlEntryLines` |
| MCP 失败 | `packages/resources/mcp/src/failure.ts` | `McpError(key, params?, detail?)` |
| Plugin installer | `packages/resources/plugins/src/provider.ts` | `PluginPlace`、`PluginHeld`、`PluginInstaller`、`PluginTools` |
| Plugin 常量 | `packages/resources/plugins/src/contract.ts` | `PLUGIN_MARKETPLACE_NAME = "context-hub"`、`PluginInstallScope = "user" \| "project"` |
| Codex 市场索引写入 | `packages/resources/plugins/src/host/marketplace.ts` | `writeMarketplaceIndex` 写入 `.agents/plugins/marketplace.json` |
| Target/locale 贡献点 | `packages/extensions/src/types.ts`、`contributions.ts` | `AgentTargetDescriptor`、`LocaleContribution`、`ContributionPoint.register` |

### 1.4 已核实的 Codex CLI 事实

本机 `codex-cli 0.144.6`，以下行为已实际查看帮助或输出：

- `codex plugin list --json` 输出 `{ "installed": [ ... ] }`；带 `--available` 时顶层同时有 `installed` 和 `available` 两个数组。每个条目至少包含 `pluginId`、`name`、`marketplaceName`、`version`、`installed`、`enabled`、`source.path`。
- `codex plugin add <name>@<marketplace> --json` 可用；没有 `--scope` 参数；stdout 是干净 JSON，含 `installedPath`。
- `codex plugin remove <id> --json` 可用；没有 `--scope` 参数。
- `codex plugin marketplace add <root> --json` 可用；没有 `--name` 参数，市场名来自索引里的 `name`；重复调用退出 0，输出 `alreadyAdded: true`。
- 隔离 `CODEX_HOME` 下已实测：hub 形态的 `.agents/plugins/marketplace.json`（即使 `policy.authentication` 缺省）能成功 add、list 和 install；WARNING 写 stderr，`tools.run` 读到的 stdout 是完整 JSON。
- `codex plugin marketplace list --json` 输出 `{ "marketplaces": [ { "name", "root" } ] }`。
- `codex plugin marketplace upgrade [MARKETPLACE_NAME] --json` 存在，用于刷新 Git marketplace 快照；本计划默认不调用。

### 1.5 历史 Codex 实现

旧实现位于 Hub commit `e6df43e^` 的 `packages/agents/codex/`，已被 `e6df43e` 删除。可取回：

```sh
cd <hub-repo>
git show e6df43e^:packages/agents/codex/src/index.ts
git show e6df43e^:packages/agents/codex/src/installer.ts
git show e6df43e^:packages/agents/codex/src/provider.ts
git show e6df43e^:packages/agents/codex/src/messages.ts
git show e6df43e^:packages/agents/codex/scripts/check-provider.ts
```

可复用的部分：

- MCP provider 的 TOML 读写逻辑：`[mcp_servers]`、`enabled` 字段、重装时保留 `enabled = false`、卸载时清 entry、`locate` 行号。
- Plugin installer 的 `codex plugin list/add/remove` 命令和 `readHeld` 的 `{ installed: [...] }` 解析。

不可直接复制的部分：

- 旧的 `ExtensionDefinition` / `activate(scope)` / `scope.inject` / `scope.contribute` / `apiVersion` 已被当前扩展模型取代；新入口是 `apply(ctx)` + `plugin.yaml.inject`。
- 旧的 `@context-hub/*` 运行时 import 不可用；下载型扩展不能解析这些包。类型必须本地镜像，运行时只从 `ctx` 取服务。
- 旧的 `@lobehub/icons/es/Codex` 图标依赖不可用；使用 `icons/codex.svg` 内联 React 组件。

## 2. 目标与非目标

### 2.1 目标

1. 新增 `plugins/codex`，市场 id 为 `codex`，版本从 `0.1.0` 开始。
2. 注册 Codex 的 skills places、MCP provider、plugin installer、agent target 和英文消息。
3. 提供 vitest 单测，覆盖 `readHeld`、命令构造、MCP provider 的读/装/开关/卸载行为。
4. 通过仓库现有 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`，并确认生成的 `marketplace.json` 含有效 `codex` 条目。
5. 写 `plugins/codex/README.md`，按 `docs/publishing.md` 的 PR 流程交付源文件。

### 2.2 不做

- 不实现 prompts provider：不注册 `ctx.prompts`，不写 `~/.codex/AGENTS.md`，不改 Hub prompts 模块。
- 不做 workspace MCP place：Codex 只有用户级 `~/.codex/config.toml`，不声明 `.codex/config.toml` workspace place。
- 不注册 workspace `.agents/skills`：它是 Hub skills 模块的共享 place，重复注册会产生重复 tab 和重复安装目标。
- 不注册 global `~/.agents/skills`：它是跨 agent 共享根，不应属于单个 Codex provider；如产品需要，应由 Hub skills 模块增加一个共享 global place，属于后续 Hub 改动。
- 不做 Codex plugin 的 `setEnabled` / `switches`：Codex CLI 没有 per-plugin enable/disable 子命令。
- 不调用 `codex plugin marketplace upgrade`、不列 `--available`、不做 marketplace 冲突处理。
- 不改 Hub 业务代码：`dsh-context-hub` 下任何文件都不修改。
- 不改 `packages/i18n/zh-cn/src/messages.ts`；它已有 `codex.error.*`，`codex.tab` 在中文下回退为 `Codex` 即可。
- 不修改根 `icons/codex.svg` 的内容；复制到 `plugins/codex/assets/icon.svg`，并建议随 PR 提交。
- 不手改 `marketplace.json`，不提交 `plugins/codex/lib/`，不手改 `CHANGELOG.md`。
- 不改 `plugins/claude.code`、`plugins/skills.sh`、根 `README.md`、`marketplace.yaml`、`pnpm-workspace.yaml`、`eslint.config.js`、`.github/workflows/*`。
- 不做 UI 页面、nav、header、route；扩展除图标外没有 React 表面。
- 不发布 tag、不合并 PR、不 push main。

## 3. 关键决策

### 决策 1：目录、包名与 target id

**决定**

- 目录：`plugins/codex`
- `plugin.yaml.id`：`codex`
- `package.json.name`：`codex`
- `package.json.version`：`0.1.0`
- target / provider id：`hub.target.codex`

**理由**

- 市场生成器要求 `plugin.yaml.id === 目录名`，见 `scripts/build-marketplace.mjs` 的 `pluginEntry`。
- Hub 的 sidebar 用 target id 记录用户选择的 agent，skills/MCP/plugins 三个 provider 都通过 `chosenProviders` 按同一个 id 过滤；`hub.target.codex` 与 Hub 现有 workspace 测试、旧 Codex 实现一致。
- `package.json.name` 不参与市场 id 校验，但保持一致便于检索。

### 决策 2：Skills places

**决定**

- workspace place：id `codex`，scope `workspace`，dir `.codex/skills`，labelKey `codex.tab`，order 20。
- global place：id `codex-global`，scope `global`，dir `.codex/skills`，labelKey `codex.tab`，order 20。

**理由**

- Codex 读取项目 `.codex/skills` 和用户 `~/.codex/skills`，这两个是 Codex 自己的技能目录。
- 不注册 workspace `.agents/skills`：Hub 的 `packages/resources/skills/src/extension.ts` 已用 `SHARED_PLACE` 注册 workspace `.agents/skills`，再注册会出现重复 tab/重复安装目标。
- 暂不注册 global `~/.agents/skills`：这是 Codex 新共享根，但也是其他 agent 的共享根；由一个 agent provider 注册会让它只在选择 Codex 时可见，并在多个 agent 间重复。若产品要交付这里，正确做法是 Hub skills 模块增加共享 global place。作为后续增强，不在本次范围。

### 决策 3：MCP provider

**决定**

- 一个 place：id `codex-global`，label `Codex`，scope `global`，file `.codex/config.toml`，switchable `true`。
- 表名 `mcp_servers`，开关字段 `enabled`。
- 移植旧 `provider.ts` 的完整逻辑：
  - 文件不存在 → 返回空列表。
  - TOML 解析失败 → `McpError("codex.error.parse", undefined, detail)`。
  - 读写文件失败 → `McpError("codex.error.refused", { file: ".codex/config.toml" }, detail)`。
  - 未知 place → `McpError("codex.error.unknownPlace", { place })`。
  - `install` 重装已有 entry 时，如果原 entry 是 `enabled = false`，保留该字段。
  - `uninstall` 用 `clearTomlEntry` 只删该 entry 和它的子表。
  - `setEnabled` 用 `setTomlField` 只改一个字段；entry 不存在时由 toolkit 抛错，provider 包装为 `codex.error.refused`。
  - `locate` 用 `tomlEntryLines`；文件不存在返回 `null`。
- 工具全部来自 `ctx.mcp.tools`，不 import Hub 包。

**理由**

- Codex 只有一份用户级 config，`[mcp_servers]` 是它当前的 MCP 表，`enabled` 是它自己的开关字段。
- Hub 的 `packages/resources/mcp/src/toml.ts` 已保证单 entry/单字段编辑不重写文件其余部分；插件只调用 toolkit，不自己解析/序列化 TOML。
- 旧 provider 已在 Hub 历史中验证过这些边界；本次只做契约适配。

### 决策 4：Plugin installer

**决定**

- 一个 place：id `codex-user`，label `Codex`，scope `global`，scopeWord `user`，switchable `false`。
- `available(tools)`：`tools.has("codex")`。
- `held(tools)`：运行 `codex plugin list --json`，解析 `{ installed: [...] }`，每条映射为：
  - `name`：`entry.name`
  - `id`：`entry.pluginId`，缺失时回退 `entry.name`
  - `version`：`entry.version` 或 `""`
  - `scope`：`"user"`
  - `enabled`：`entry.enabled !== false`
  - `marketplace`：`entry.marketplaceName` 字符串或 `null`
  - `source`：`entry.source.path` 非空时 `{ kind: "local", path }`
  - `pack`：空字段，随后用 `tools.describe` 填充
  - 跳过 `entry.installed === false` 和没有非空 `name` 的条目
- `install(name, _scope, tools)`：
  1. `await tools.syncMarketplace()`
  2. `const root = await tools.root()`
  3. `await tools.run("codex", ["plugin", "marketplace", "add", root, "--json"])`
  4. `const output = await tools.run("codex", ["plugin", "add", name + "@context-hub", "--json"])`
  5. `const report = reportOf(output)`；`installedPath` 是字符串时作为 `location` 一并返回，否则省略。`reportOf` 用 `JSON.parse(output.trim())` 并捕获解析失败：安装已经成功时，解析失败不能让调用被报告为失败。
  6. 返回 `{ message: name + " installed for Codex", location }`
- `remove(id, _scope, tools)`：`tools.run("codex", ["plugin", "remove", id, "--json"])`，返回 `{ message: id + " removed from Codex" }`。
- 不实现 `switches` 和 `setEnabled`。

**理由**

- Codex CLI 没有 `--scope`，插件只安装在用户级，所以只声明一个 `global`/`user` place。
- `tools.syncMarketplace()` 会写 Hub 库根下的 `.agents/plugins/marketplace.json`（见 `packages/resources/plugins/src/host/marketplace.ts`），这正是 Codex 读取的市场索引；先同步再注册，避免索引没有新 pack。
- 市场名 `context-hub` 来自 Hub 的 `PLUGIN_MARKETPLACE_NAME`，与索引里的 `name` 一致；`plugin add <name>@context-hub` 才能定位到本库。
- `remove` 用客户端自己列出的 id，而不是 `name@context-hub`：客户端可能装了来自其他市场的同名 pack，只有它自己的 id 能定位到实际副本。

### 决策 5：不注册 prompts provider，target 只做展示

**决定**

- `supports: ["skill", "mcp", "memory"]`。
- `locations` 列出：
  - `Project skills`：`.codex/skills/<name>/SKILL.md`
  - `Skills`：`~/.codex/skills/<name>/SKILL.md`
  - `Instructions`：`~/.codex/AGENTS.md`（global）和 `AGENTS.md`（project）
  - `Config`：`~/.codex/config.toml`
- `format`：`"Markdown skills and instructions; TOML for configuration and MCP servers"`。

**理由**

- Hub 的 prompts 共享 place 已覆盖项目根 `AGENTS.md`（`packages/resources/prompts/src/index.ts` 的 `WORKSPACE_PLACE`）；Codex 扩展不重复写 prompts。
- 全局 `~/.codex/AGENTS.md` 本次只作为 target 的展示路径，不提供写入动作。
- target 的 `locations` 是展示数据，不是投递实现；真正的技能目录由 skills places 注册，MCP 由 provider 注册。

### 决策 6：语言与消息

**决定**

- 扩展只注册 `en` locale：
  - `codex.tab`: `"Codex"`
  - `codex.error.parse`: `"Codex's config file is not TOML this hub can read."`
  - `codex.error.refused`: `"The hub could not write {file}."`
  - `codex.error.unknownPlace`: `"Codex has no client file called {place}."`
- `plugin.yaml` 的 `name` 和 `description` 提供 `en` 与 `zh-cn`。

**理由**

- Hub 的 `packages/i18n/zh-cn/src/messages.ts` 已有 `codex.error.*` 的中文翻译；`codex.tab` 在中文下回退到 `"Codex"`，显示无差异。
- 不需要为了 `codex.tab` 修改 Hub，也不需要在扩展里维护一份不完整的 `zh-cn` locale。
- 如果后续要求中文软件包，再单独决定由 Hub 补 `codex.tab` 还是扩展注册 `zh-cn` locale。

### 决策 7：测试

**决定**

- 使用 vitest，配置 `plugins/codex/vitest.config.ts`，`defineProject({ test: { name: "codex", include: ["__test__/**/*.test.ts"] } })`。
- 新增 `__test__/installer.test.ts`、`__test__/provider.test.ts`。
- `package.json` 加 `"test": "vitest run"` 和 `vitest` devDependency。
- `tsconfig.json` 的 `include` 为 `["src", "__test__"]`。
- 测试用 stub tools，不跑真实 `codex`、不访问网络、不写用户目录。
- Provider 测试验证 provider 对 toolkit 的调用和错误映射；TOML 编辑本身的语义由 Hub 的 `packages/resources/mcp` 测试负责。

**理由**

- 与 `plugins/skills.sh` 的测试结构一致，根 `pnpm test` 会通过 `pnpm -r --if-present test` 自动收集。
- 扩展仓库无法 import Hub 包；stub tools 可以在不复制 Hub TOML 实现的前提下验证契约。
- 真实 CLI 集成检查单独用临时 `CODEX_HOME` 做，见阶段 B/D。

### 决策 8：构建与市场索引

**决定**

- `build.mjs` 与 `plugins/claude.code/build.mjs` 一致：entry `src/index.tsx`，esbuild bundle、format ESM、platform browser、target es2022、jsx automatic、React 四个模块 external、`absWorkingDir` 固定。
- 版本 `0.1.0`；`engines.contextHub: ">=0.0.1-beta.5 <0.7.0"`。
- 只提交源文件、`pnpm-lock.yaml` 和计划文档；`lib/` 和 `marketplace.json` 由 CI 生成。
- 本地验证用 `pnpm build` 生成 `marketplace.json`，用 Node 断言 `codex` 条目和 icon data URL；不提交该文件。

**理由**

- 现有两个插件都使用同一套构建参数；CI 的 `pnpm install --frozen-lockfile` 要求 `pnpm-lock.yaml` 已更新。
- 市场生成器会检查 icon 是相对图片路径、大小 ≤ 32 KiB、`name/description` 含 `en`、`category`/`permissions` 合法；`0.1.0` 和现有 engines 范围与 `claude.code`/`skills.sh` 一致。

### 决策 9：权限

**决定**

- `permissions: [assets.read, assets.write, filesystem]`（与 `plugins/claude.code` 对齐）。

**理由**

- 插件安装器的 `tools.describe` 可能把 pack 的图标写进 Hub 资产库，因此需要 `assets.write`；它同时读取 pack 目录并写 Codex 配置文件。
- `permissions` 在 Hub 中是展示字段，不参与运行时授权。
- 如果产品坚持旧实现的 `[assets.read, filesystem]`，只需改 `plugin.yaml`、阶段 D 的断言和本节；这是展示决策，不影响代码。

## 4. 受影响文件

### 4.1 新增源文件

```text
plugins/codex/package.json
plugins/codex/plugin.yaml
plugins/codex/build.mjs
plugins/codex/tsconfig.json
plugins/codex/vitest.config.ts
plugins/codex/src/index.tsx
plugins/codex/src/contracts.ts
plugins/codex/src/locations.ts
plugins/codex/src/provider.ts
plugins/codex/src/installer.ts
plugins/codex/src/messages.ts
plugins/codex/assets/icon.svg
plugins/codex/README.md
plugins/codex/__test__/installer.test.ts
plugins/codex/__test__/provider.test.ts
```

### 4.2 修改的已有文件

```text
pnpm-lock.yaml        # pnpm install 为新的 workspace package 更新 lockfile
```

### 4.3 生成但不提交

```text
plugins/codex/lib/index.js
marketplace.json
```

两者已被 `.gitignore` 忽略；CI 在 PR 分支用 `git add -f` 提交。

### 4.4 只读输入，不修改

```text
icons/codex.svg       # 当前未跟踪；复制到 plugins/codex/assets/icon.svg，建议随 PR 提交，原文件内容不动
```

### 4.5 Hub 只读参考，不修改

```text
dsh-context-hub/docs\extensions.md
dsh-context-hub/packages\resources\skills\src\provider.ts
dsh-context-hub/packages\resources\skills\src\extension.ts
dsh-context-hub/packages\resources\prompts\src\provider.ts
dsh-context-hub/packages\resources\prompts\src\index.ts
dsh-context-hub/packages\resources\mcp\src\contract.ts
dsh-context-hub/packages\resources\mcp\src\toolkit.ts
dsh-context-hub/packages\resources\mcp\src\toml.ts
dsh-context-hub/packages\resources\mcp\src\failure.ts
dsh-context-hub/packages\resources\plugins\src\provider.ts
dsh-context-hub/packages\resources\plugins\src\contract.ts
dsh-context-hub/packages\resources\plugins\src\host\marketplace.ts
dsh-context-hub/packages\extensions\src\types.ts
dsh-context-hub/packages\extensions\src\contributions.ts
dsh-context-hub/packages\extensions\src\agents.ts
```

### 4.6 调用方与搜索范围

实施前后都要搜索，确认没有遗漏的引用或命名冲突：

```sh
cd <context-hub-extensions>
rg -n "codex" --glob '!node_modules/**' --glob '!pnpm-lock.yaml'

cd <hub-repo>
rg -n "hub\.target\.codex|codex\.error|codex\.tab|\.codex/skills|\.codex/config\.toml" \
  packages apps docs --glob '!**/node_modules/**'
```

预期：

- 扩展仓库当前只有根 `icons/codex.svg` 命中（未跟踪输入）。
- Hub 当前生产代码没有 `hub.target.codex`；只有 `packages/i18n/zh-cn/src/messages.ts` 的 `codex.error.*`、`packages/core/__test__/workspaces.test.ts` 的 id fixture，以及文档/设计文件。
- `.agents/skills` 的共享 place 只在 `packages/resources/skills/src/extension.ts`；`.agents/plugins/marketplace.json` 只在 `packages/resources/plugins/src/host/marketplace.ts`。
- 不需要改 Hub 的 `packages/i18n` 或 workspace 测试。

## 5. 阶段

阶段顺序：A → B → C → D → E。C 依赖 B；D 依赖 A/B；E 依赖 D。

### 阶段 A：建立包骨架与元数据

**执行目标**

建立可安装、可构建、可类型检查的 `plugins/codex` 骨架；此时还没有实际注册行为。

**要新增/修改的文件**

- `plugins/codex/package.json`
- `plugins/codex/plugin.yaml`
- `plugins/codex/build.mjs`
- `plugins/codex/tsconfig.json`
- `plugins/codex/src/index.tsx`（占位入口）
- `plugins/codex/assets/icon.svg`（从 `icons/codex.svg` 原样复制）
- `pnpm-lock.yaml`（由 `pnpm install` 更新）

**具体内容**

1. `package.json`：

```json
{
  "name": "codex",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "lib/index.js",
  "exports": { ".": "./lib/index.js" },
  "files": ["lib", "src", "assets", "plugin.yaml", "README.md"],
  "scripts": {
    "build": "node build.mjs",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@types/react": "^19",
    "esbuild": "^0.28.2",
    "typescript": "~6",
    "vitest": "^5.0.5"
  }
}
```

说明：阶段 A 先不加 `test` 脚本，因为还没有测试文件；`vitest run` 在无测试文件时会失败。阶段 C 加 `"test": "vitest run"`。

2. `plugin.yaml`：

```yaml
id: codex
name:
  en: Codex
  zh-cn: Codex
engines:
  contextHub: ">=0.0.1-beta.5 <0.7.0"
description:
  en: Deliver skills, memory, MCP servers and plugin packs to Codex.
  zh-cn: 将技能、记忆、MCP 服务器和插件包交付给 Codex。
icon: assets/icon.svg
category: agent
permissions: [assets.read, assets.write, filesystem]
inject: [skills, mcp, plugins, targets, locales]
author: Context Hub
```

3. `build.mjs`：复制 `plugins/claude.code/build.mjs`，只改注释里的插件名；entry 必须是 `src/index.tsx`，external 必须是 `react`、`react-dom`、`react/jsx-runtime`、`react/jsx-dev-runtime`。

4. `tsconfig.json`：复制 `plugins/claude.code/tsconfig.json`，阶段 A 的 `include` 为 `["src"]`；阶段 C 改为 `["src", "__test__"]`。

5. `src/index.tsx` 占位：

```tsx
export function apply(): void {}
```

占位入口不读取 `ctx`，这样阶段 A 的 lint/typecheck/build 都能通过；阶段 B 替换为真实实现。

6. 复制图标：

```sh
cp icons/codex.svg plugins/codex/assets/icon.svg
```

不要修改根 `icons/codex.svg`。

**验收判据**

```sh
cd <context-hub-extensions>
pnpm install
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm --filter codex build
node --check plugins/codex/lib/index.js
```

全部退出码为 0。`pnpm install` 后 `pnpm-lock.yaml` 出现 `plugins/codex` 的 importer；`plugins/codex/lib/index.js` 存在且 `node --check` 通过。

### 阶段 B：注册并实现 target/skills/MCP/plugins

**执行目标**

把占位入口替换为真实扩展：注册 Codex 的 skills places、MCP provider、plugin installer、target 和 `en` locale。

**要新增/修改的文件**

- `plugins/codex/src/contracts.ts`
- `plugins/codex/src/locations.ts`
- `plugins/codex/src/provider.ts`
- `plugins/codex/src/installer.ts`
- `plugins/codex/src/messages.ts`
- `plugins/codex/src/index.tsx`（替换占位）

**具体内容**

#### B.1 `src/contracts.ts`

本地镜像本扩展用到的 Hub 契约；只放类型和接口，运行时全部擦除。文件头沿用 `plugins/claude.code/src/contracts.ts` 的 `/* eslint-disable @typescript-eslint/no-explicit-any */`，因为部分边界类型故意保持宽松。必须包含：

- `ExtensionIcon`：`(props: { className?: string; "aria-hidden"?: boolean }) => unknown`
- `SkillPlace`：`id`、`labelKey`、`icon`、`scope: "workspace" | "global"`、`dir`、`order`
- `SkillProvider`：`id`、`shared?`、`places`
- `SkillRegistryPoint`：`register(provider): unknown`
- `McpDeclaration`、`McpEntryValues`、`TomlEntryValues`
- `McpEntry`：`name`、`declaration: McpDeclaration | null`、`enabled`
- `McpPlace`：`id`、`label`、`switchable`、`scope`、`file`
- `McpIo`：`files.read(ref)`、`files.write(ref, text)`、`log`
- `McpProvider`：`id`、`places`、`read`、`install`、`uninstall`、`setEnabled?`、`locate?`
- `McpErrorConstructor`：`new (key, params?, detail?) => Error`
- `McpTools`：`parseToml`、`setTomlEntry`、`setTomlField`、`clearTomlEntry`、`tomlEntryLines`、`readDeclaration`、`writeDeclaration`、`McpError`
- `PackDescription`：`name`、`version`、`description`、`icon?`
- `PluginPlace`、`PluginHeld`、`PluginInstallScope`、`PluginInstallReport`、`PluginSwitches`
- `PluginTools`：`root`、`syncMarketplace`、`run`、`files`、`has`、`describe`
- `PluginInstaller`：`id`、`label`、`places`、`available`、`held`、`switches?`、`install`、`remove`、`setEnabled?`
- `AgentTargetDescriptor`：`id`、`displayName`、`icon`、`supports`、`locations`、`format`
- `LocaleContribution`：`id`、`label`、`messages`
- `CodexScope`：`skills`、`mcp`（含 `tools` 和 `register`）、`plugins`、`targets`、`locales`

字段值必须与上面第 1.3 节引用的 Hub 文件一致；不要凭记忆增删字段。

#### B.2 `src/locations.ts`

```ts
export const CODEX_ID = "hub.target.codex"
export const CODEX_SKILL_DIR = ".codex/skills"
export const CODEX_CONFIG_FILE = ".codex/config.toml"
export const CODEX_GLOBAL_INSTRUCTION_FILE = ".codex/AGENTS.md"

export interface CodexLocation {
  label: string
  path: string
}

export const GLOBAL_LOCATIONS: CodexLocation[] = [
  { label: "Skills", path: `~/${CODEX_SKILL_DIR}/<name>/SKILL.md` },
  { label: "Instructions", path: `~/${CODEX_GLOBAL_INSTRUCTION_FILE}` },
  { label: "Config", path: `~/${CODEX_CONFIG_FILE}` },
]

export const PROJECT_LOCATIONS: CodexLocation[] = [
  { label: "Project skills", path: `${CODEX_SKILL_DIR}/<name>/SKILL.md` },
  { label: "Instructions", path: "AGENTS.md" },
]

export const SUPPORTS = ["skill", "mcp", "memory"] as const
```

`CODEX_CONFIG_FILE` 同时被 `provider.ts` 用作 `FILE.file`；`CODEX_GLOBAL_INSTRUCTION_FILE` 用于 `GLOBAL_LOCATIONS`，避免路径字符串分散。

#### B.3 `src/provider.ts`

以 `git show e6df43e^:packages/agents/codex/src/provider.ts` 为蓝本，做以下替换：

- 类型 import 从 `@context-hub/mcp/contract` 改为 `./contracts.ts`。
- 删除 `CODEX_ID` 本地常量，改用 `./locations.ts` 的 `CODEX_ID` 和 `CODEX_CONFIG_FILE`。
- `FILE` 使用 `{ scope: "global", file: CODEX_CONFIG_FILE } as const`。
- 其余逻辑保持不变：`TABLE = "mcp_servers"`、`ENABLED = "enabled"`、`PLACE = "codex-global"`、`assertPlace`、`readFile`、`tableOf`、`edit`、`read`、`install`、`uninstall`、`setEnabled`、`locate`、`fieldOf`、`messageOf`。
- `places` 返回一个 place：`{ id: "codex-global", label: "Codex", switchable: true, ...FILE }`。
- `id` 用 `CODEX_ID`。

#### B.4 `src/installer.ts`

以 `git show e6df43e^:packages/agents/codex/src/installer.ts` 为蓝本，做以下替换：

- 类型 import 从 `@context-hub/plugins/provider` 改为 `./contracts.ts`。
- `CODEX_ID` 从 `./locations.ts` 导入。
- 保留 `MARKETPLACE = "context-hub"`、`PROGRAM = "codex"`、`JSON_FLAG = "--json"`、`LABEL = "Codex"`。
- `readHeld` 按决策 4 实现；新增 `entry.installed === false` 跳过。
- `ensureMarketplace` 保留 `syncMarketplace()` → `root()` → `marketplace add`。
- `codexInstaller` 的 `places`、`available`、`held`、`install`、`remove` 按决策 4 实现；不写 `switches`/`setEnabled`。
- `install` 参数名用 `name`，消息用 `name + " installed for Codex"`；`remove` 参数名用 `id`，消息用 `id + " removed from Codex"`。

#### B.5 `src/messages.ts`

```ts
export const codexMessages: Record<string, string> = {
  "codex.tab": "Codex",
  "codex.error.parse": "Codex's config file is not TOML this hub can read.",
  "codex.error.refused": "The hub could not write {file}.",
  "codex.error.unknownPlace": "Codex has no client file called {place}.",
}
```

#### B.6 `src/index.tsx`

实现要点：

- `import { useId } from "react"`。
- 内联 `CodexIcon`：
  - `viewBox="0 0 24 24"`，接收 `className` 和 `aria-hidden`。
  - 保留 `<title>Codex</title>`。
  - 白色圆角底 path 用 `fill="#fff"`。
  - 渐变 Codex 图形 path 用 ``fill={`url(#${gradient})`}``，`gradient` 来自 `useId().replace(/:/g, "")`（与仓库里 `packages/shadcn-ui/src/components/chart.tsx` 的做法一致，避免 URL 片段里的冒号）；`<linearGradient>` 的三个 stop 用 `#B1A7FF`、`#7A9DFF`、`#3941FF`，`x1=12 x2=12 y1=3 y2=21`。
  - 删除源 SVG 的 `width`、`height`、`style`，由调用方 className 控制尺寸。
- `skillPlaces(icon)` 返回决策 2 的两个 place。
- `apply(ctx: CodexScope): void`：
  - `const icon = CodexIcon`
  - `ctx.skills.register({ id: CODEX_ID, places: skillPlaces(icon) })`
  - `ctx.mcp.register(createCodexMcp(ctx.mcp.tools))`
  - `ctx.plugins.register(codexInstaller)`
  - `ctx.targets.register({ id: CODEX_ID, displayName: "Codex", icon, supports: [...SUPPORTS], locations: [...GLOBAL_LOCATIONS, ...PROJECT_LOCATIONS], format: "Markdown skills and instructions; TOML for configuration and MCP servers" })`
  - `ctx.locales.register({ id: "en", label: "English", messages: codexMessages })`
- 不注册 prompts、nav、routes、header、skillRegistries。

**验收判据**

```sh
cd <context-hub-extensions>
pnpm lint
pnpm typecheck
pnpm --filter codex build
node --check plugins/codex/lib/index.js
node --input-type=module -e '
import fs from "node:fs"
const text = fs.readFileSync("plugins/codex/lib/index.js", "utf8")
const names = [...text.matchAll(/^import\s.*?from\s+"([^"]+)"/gm)].map((m) => m[1])
console.log("runtime imports:", names)
const allowed = new Set(["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"])
if (names.some((name) => !allowed.has(name))) throw new Error("unexpected runtime import")
'
```

全部退出码为 0；`runtime imports` 只出现 React 相关名字（或为空）。

**已实测的 CLI 幂等性检查（不写用户配置；实施时仍可复跑）**

```sh
TMP=$(mktemp -d)
mkdir -p "$TMP/home" "$TMP/lib/.agents/plugins"
printf '%s\n' '{"name":"context-hub","description":"test","interface":{"displayName":"Context Hub"},"plugins":[]}' \
  > "$TMP/lib/.agents/plugins/marketplace.json"
CODEX_HOME="$TMP/home" codex plugin marketplace list --json
CODEX_HOME="$TMP/home" codex plugin marketplace add "$TMP/lib" --json
CODEX_HOME="$TMP/home" codex plugin marketplace add "$TMP/lib" --json
CODEX_HOME="$TMP/home" codex plugin marketplace list --json
rm -rf "$TMP"
```

预期（本机已实测）：第一条 `marketplace list` 为空（`{"marketplaces":[]}`，证明 `CODEX_HOME` 隔离生效）；第一次 add 退出 0，输出 `alreadyAdded: false`；第二次 add 退出 0，输出 `alreadyAdded: true`；`marketplace list` 出现 `context-hub` 指向 `$TMP/lib`。因此 `ensureMarketplace` 的重复调用是安全的，不需要先 `marketplace list`。如果第一条 `marketplace list` 不是空，停止，不要继续写，先确认 `CODEX_HOME` 的隔离方式。

### 阶段 C：编写单元测试

**执行目标**

用 vitest 覆盖 install 命令构造、`readHeld` 解析和 MCP provider 的读写/开关/错误映射。

**要新增/修改的文件**

- `plugins/codex/package.json`：加 `"test": "vitest run"`。
- `plugins/codex/tsconfig.json`：`include` 改为 `["src", "__test__"]`。
- `plugins/codex/vitest.config.ts`
- `plugins/codex/__test__/installer.test.ts`
- `plugins/codex/__test__/provider.test.ts`
- `pnpm-lock.yaml`（如果阶段 A 未加 vitest，则本次 `pnpm install` 更新）

**测试矩阵**

`installer.test.ts`：

| 用例 | 断言 |
| --- | --- |
| places | 只有一个 `codex-user`；`scope global`、`scopeWord user`、`switchable false` |
| `setEnabled` | `codexInstaller.setEnabled` 为 `undefined` |
| `available` | `has("codex")` 被调用；返回 true/false |
| `readHeld` 正常 | 解析 `{ installed: [...] }`；映射 name/id/version/scope/enabled/marketplace/source |
| `readHeld` 的 `enabled` | `enabled: false` 保留；缺失或 true 读为 true |
| `readHeld` 的 id | `pluginId` 优先；缺失回退 `name` |
| `readHeld` 脏数据 | 非 JSON、`installed` 不是数组、缺 name、`installed: false` 被跳过；缺 source.path 时保留条目但不带 source |
| `held` | 调用 `codex plugin list --json`；有 source 的条目调用 `describe` 填充 `pack` |
| `held` describe 失败 | 保留空 pack，不让整个扫描失败 |
| `install` | 调用顺序 `syncMarketplace` → `root` → `marketplace add <root> --json` → `plugin add <name>@context-hub --json`；解析 stdout 的 `installedPath` 并作为 `location` 返回；返回消息 |
| `install` 输出不可解析 | 仍返回安装成功消息，`location` 省略 |
| `remove` | 调用 `plugin remove <id> --json`；返回消息 |

`provider.test.ts`：

| 用例 | 断言 |
| --- | --- |
| places | 一个 `codex-global`；`scope global`、`file .codex/config.toml`、`switchable true` |
| id | `hub.target.codex` |
| `read` 空文件 | 文件不存在或 `read` 返回 null → `[]` |
| `read` 正常 | 解析 `[mcp_servers]`；`enabled` 缺失读 true，`enabled = false` 读 false；`readDeclaration` 结果透传 |
| `read` TOML 错误 | `parseToml` 抛错 → `McpError.key === "codex.error.parse"` |
| `read` IO 错误 | `files.read` 抛错 → `McpError.key === "codex.error.refused"`，params `{ file: ".codex/config.toml" }` |
| 未知 place | `codex.error.unknownPlace`，params `{ place }` |
| `install` 新 entry | `setTomlEntry(text, "mcp_servers", name, values)` 被调用；`write` 收到返回值 |
| `install` 已有 `enabled = false` | `values.enabled === false` 被保留 |
| `install` 编辑失败 | `setTomlEntry` 抛错 → `codex.error.refused` |
| `uninstall` | `clearTomlEntry(text, "mcp_servers", name)` 被调用；`write` 收到返回值 |
| `setEnabled` | `setTomlField(text, "mcp_servers", name, "enabled", false/true)` 被调用；`write` 收到返回值 |
| `setEnabled` 失败 | `setTomlField` 抛错 → `codex.error.refused` |
| `locate` | 文件存在时返回 `tomlEntryLines` 的结果；文件不存在返回 null |

测试 stub 的 `McpError` 必须保留 `key` 和 `params`，这样断言可以检查键名；stub 的 `parseToml` 返回预设文档，`setTomlEntry`/`setTomlField`/`clearTomlEntry`/`tomlEntryLines` 记录调用并返回可识别的哨兵字符串，不复制 Hub 的 TOML 算法。

**验收判据**

```sh
cd <context-hub-extensions>
pnpm install
pnpm --filter codex test
pnpm test
pnpm typecheck
pnpm lint
```

全部退出码为 0；`pnpm --filter codex test` 输出显示两个测试文件通过；`pnpm test` 同时跑通 `claude.code`（无测试则跳过）、`skills.sh` 和 `codex`。

### 阶段 D：构建并验证市场索引

**执行目标**

确认根构建能生成 `codex` 的市场条目，且生成物不进入源码提交。

**要新增/修改的文件**

- 不新增源文件。
- 生成 `plugins/codex/lib/index.js` 和 `marketplace.json`（忽略）。

**执行**

```sh
cd <context-hub-extensions>
pnpm build
```

**验收判据**

1. `plugins/codex/lib/index.js` 存在，`node --check` 通过。
2. `marketplace.json` 含 `codex` 条目，且满足：

```sh
node --input-type=module -e '
import fs from "node:fs"
const index = JSON.parse(fs.readFileSync("marketplace.json", "utf8"))
const ids = index.plugins.map((plugin) => plugin.id)
const codex = index.plugins.find((plugin) => plugin.id === "codex")
if (codex === undefined) throw new Error("codex entry missing")
if (JSON.stringify(ids) !== JSON.stringify([...ids].sort((a, b) => a.localeCompare(b)))) {
  throw new Error(`plugins are not sorted: ${ids.join(", ")}`)
}
if (codex.title.en !== "Codex") throw new Error("codex title.en")
if (codex.description.en.length === 0 || codex.description["zh-cn"].length === 0) {
  throw new Error("codex description")
}
if (codex.category !== "agent") throw new Error("codex category")
if (JSON.stringify(codex.permissions) !== JSON.stringify(["assets.read", "assets.write", "filesystem"])) {
  throw new Error("codex permissions")
}
if (!codex.icon.startsWith("data:image/svg+xml;base64,")) throw new Error("codex icon is not a data URL")
const bytes = Buffer.from(codex.icon.slice(codex.icon.indexOf(",") + 1), "base64")
if (bytes.length > 32 * 1024) throw new Error("codex icon is too large")
const version = codex.versions[0]
if (version.version !== "0.1.0") throw new Error("codex version")
if (version.engines.contextHub !== ">=0.0.1-beta.5 <0.7.0") throw new Error("codex engines")
if (version.source.type !== "git") throw new Error("codex source type")
if (version.source.path !== "plugins/codex") throw new Error("codex source path")
if (!version.source.url.startsWith("https://")) throw new Error("codex source url")
console.log("codex market entry ok:", ids.join(", "))
'
```

3. 生成索引可重复：

```sh
cp marketplace.json /tmp/marketplace.codex.1.json
pnpm build:marketplace
cmp marketplace.json /tmp/marketplace.codex.1.json
```

`cmp` 退出码为 0。

4. 生成物被忽略：

```sh
git check-ignore -v plugins/codex/lib/index.js marketplace.json
git status --short
```

`git check-ignore` 输出命中 `.gitignore`；`git status --short` 不出现这两个路径。

### 阶段 E：补齐文档并做交付前检查

**执行目标**

补齐插件 README，跑完整检查，按 `docs/publishing.md` 的 PR 流程交付。

**要新增/修改的文件**

- `plugins/codex/README.md`

**README 必须写明**

- 这个扩展注册什么：Codex skills places（workspace/global `.codex/skills`）、`~/.codex/config.toml` 的 MCP provider、`codex plugin` installer、target、`en` 消息。
- Codex CLI 要求：需要支持 `codex plugin` 子命令的版本；本机验证为 `0.144.6`。
- 不做什么：不注册 prompts provider、不做 workspace MCP place、不做 plugin `setEnabled`、不注册 `.agents/skills` 共享 place。
- 构建/测试命令：`pnpm install`、`pnpm typecheck`、`pnpm test`、`pnpm build`。
- 布局：`package.json`、`plugin.yaml`、`build.mjs`、`vitest.config.ts`、`src/`、`assets/icon.svg`、`__test__/`、`lib/index.js`（CI 生成，源分支不提交）。
- 版本只改 `package.json`，不要写进 `plugin.yaml`。

**交付前检查**

```sh
cd <context-hub-extensions>
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
git diff --check
git status --short
```

提交前先只暂存计划内的文件，再跑：

```sh
git diff --cached --check
```

`git diff --check` 不会检查未跟踪文件，所以已暂存内容的空白检查要单独跑。

预期 `git status --short` 只出现：

```text
 M pnpm-lock.yaml
?? docs/plans/
?? plugins/codex/
```

`icons/codex.svg` 建议随 PR 提交（与 `icons/zcode.svg` 的跟踪方式一致），因此暂存后不再出现在 `git status --short` 的未跟踪列表里。`marketplace.json` 和 `plugins/codex/lib/` 不应出现。

**PR 流程（按 `docs/publishing.md`）**

1. 从最新 `main` 拉分支，例如 `feat/codex-extension`。
2. 只提交源文件、`pnpm-lock.yaml` 和必要的计划文档；不要提交 `lib/` 或 `marketplace.json`。
3. 推送分支，向 `main` 开 PR。
4. CI 跑 `pnpm install --frozen-lockfile`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`，然后把 `plugins/*/lib` 和 `marketplace.json` 提交回 PR 分支。
5. 检查通过后合并；市场立即更新。
6. 只有需要 GitHub Release 时才打 `v*` tag；不要在合并前打 tag。

**验收判据**

- 上面的完整命令全部退出码 0。
- `git diff --check` 无输出。
- `git status --short` 只有预期文件；没有生成物、没有 Hub 文件、没有无关插件改动。
- 暂存内容只包含计划内文件；没有 API key、token、私钥、连接串或本地专用绝对路径。
- `plugins/codex/README.md` 存在且覆盖上述要点。

## 6. 验证命令汇总

从干净工作区执行：

```sh
cd <context-hub-extensions>

# 1. 安装与锁文件
pnpm install
pnpm install --frozen-lockfile

# 2. 静态检查
pnpm lint
pnpm typecheck

# 3. 单测
pnpm test
pnpm --filter codex test

# 4. 构建与 bundle 检查
pnpm build
node --check plugins/codex/lib/index.js
node --input-type=module -e '
import fs from "node:fs"
const text = fs.readFileSync("plugins/codex/lib/index.js", "utf8")
const names = [...text.matchAll(/^import\s.*?from\s+"([^"]+)"/gm)].map((m) => m[1])
console.log("runtime imports:", names)
const allowed = new Set(["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"])
if (names.some((name) => !allowed.has(name))) throw new Error("unexpected runtime import")
'

# 5. 市场索引
node --input-type=module -e '
import fs from "node:fs"
const index = JSON.parse(fs.readFileSync("marketplace.json", "utf8"))
const ids = index.plugins.map((plugin) => plugin.id)
const codex = index.plugins.find((plugin) => plugin.id === "codex")
if (codex === undefined) throw new Error("codex entry missing")
if (JSON.stringify(ids) !== JSON.stringify([...ids].sort((a, b) => a.localeCompare(b)))) {
  throw new Error(`plugins are not sorted: ${ids.join(", ")}`)
}
if (codex.title.en !== "Codex") throw new Error("codex title.en")
if (codex.category !== "agent") throw new Error("codex category")
if (!codex.icon.startsWith("data:image/svg+xml;base64,")) throw new Error("codex icon is not a data URL")
const bytes = Buffer.from(codex.icon.slice(codex.icon.indexOf(",") + 1), "base64")
if (bytes.length > 32 * 1024) throw new Error("codex icon is too large")
const version = codex.versions[0]
if (version.version !== "0.1.0") throw new Error("codex version")
if (version.engines.contextHub !== ">=0.0.1-beta.5 <0.7.0") throw new Error("codex engines")
if (version.source.path !== "plugins/codex") throw new Error("codex source path")
console.log("codex market entry ok:", ids.join(", "))
'

# 6. 生成物忽略
git check-ignore -v plugins/codex/lib/index.js marketplace.json
git status --short
```

## 7. 风险与待确认

1. **global skills 根的选择**
   本计划注册 `~/.codex/skills`，不注册 `~/.agents/skills`。如果产品希望 Codex 的 tab 也读新共享根，建议在 Hub skills 模块增加共享 global place，而不是在 Codex provider 里注册。
   待确认：Codex 用户技能是否应以 `~/.agents/skills` 为主、`~/.codex/skills` 只作兼容展示？

2. **permissions 已对齐 `claude.code`**
   本计划用 `[assets.read, assets.write, filesystem]`。原因：插件安装器的 `tools.describe` 可能把 pack 图标写进 Hub 资产库；权限仍是展示字段，不影响运行。若产品坚持旧实现的 `[assets.read, filesystem]`，只需改 `plugin.yaml`、阶段 D 断言和本节。

3. **根 `icons/codex.svg` 是否提交（建议提交）**
   插件只需要 `plugins/codex/assets/icon.svg`。根 `icons/zcode.svg` 已被跟踪，说明 `icons/` 是仓库的图标源目录；建议把 `icons/codex.svg` 一并提交，同时保留插件内的复制件。原文件内容不修改。

4. **`codex plugin marketplace add` 重复调用（已实测）**
   在隔离 `CODEX_HOME` 下，第一次 add 返回 `alreadyAdded: false`，第二次返回 `alreadyAdded: true`，两次退出码均为 0。因此 `ensureMarketplace` 可以每次无条件 add，不需要先 `marketplace list`。阶段 B 的隔离检查仍建议在实施时跑一次，记录本机实际输出。

5. **Codex CLI 版本门槛**
   `available` 只检查 `codex` 是否存在，不检查版本。低于支持 `codex plugin` 的版本会在 `held`/`install` 时由 CLI 报错。
   待确认：是否需要读取 `codex --version` 并在 `available` 中做最低版本判断？本计划不做。

6. **`codex plugin list --json` 是否可能带 `installed: false`**
   帮助说明 `--available` 才包含未安装的 marketplace 插件；当前实现仍跳过 `installed === false`，属于防御性处理。
   验证：`codex plugin list --json` 与 `codex plugin list --available --json` 对比条目。

7. **`codex plugin add` 的 JSON 输出（已实测）**
   隔离环境下 stdout 是完整 JSON，字段包含 `pluginId`、`name`、`marketplaceName`、`version`、`installedPath`、`authPolicy`。安装器解析 `installedPath` 并作为 `location` 返回；WARNING 在 stderr，不影响 `tools.run` 的 stdout。

8. **`~/.codex/AGENTS.md`（已核实）**
   Codex 的全局用户指令来自 `$CODEX_HOME/AGENTS.override.md` 或 `$CODEX_HOME/AGENTS.md`；本计划只把它作为 target 展示路径，不写入。项目 `AGENTS.md` 由 Hub 的共享 prompts place 覆盖。

9. **市场名冲突**
   `context-hub` 来自 Hub 的 `PLUGIN_MARKETPLACE_NAME`。如果用户已配置同名 marketplace，`marketplace add` 的行为由 CLI 决定。本次不实现冲突处理。

10. **CI 的 frozen lockfile**
    `.github/workflows/build-market.yml` 使用 `pnpm install --frozen-lockfile`。实施时必须先跑 `pnpm install` 更新并提交 `pnpm-lock.yaml`，否则 PR CI 会失败。

11. **是否同时注册到其他客户端**
    本计划只做 Codex 扩展。`plugins/claude.code` 继续独立存在；不把 Codex 的能力合并进 Claude Code 插件，也不注册其他 agent。
    待确认：是否有“安装 Codex 扩展时同时让 Claude Code/其他客户端可见”的需求？当前没有依据，按不做处理。

12. **是否需要中文软件包**
    本计划只注册 `en` locale，`plugin.yaml` 带 `zh-cn` 名称和描述。中文界面下 `codex.tab` 回退为 `Codex`，`codex.error.*` 使用 Hub `zh-cn` 包已有的翻译。
    待确认：是否需要扩展自己注册 `zh-cn` locale（会引入一份需要维护的消息表），还是由 Hub 在 `packages/i18n/zh-cn/src/messages.ts` 补 `codex.tab`？本计划不改 Hub。

## 8. 自审记录

已按怀疑态度检查并修正：

- 阶段 A 不加 `"test": "vitest run"`，避免没有测试文件时 `pnpm test` 失败；阶段 C 再加。
- 阶段 A 的占位 `apply` 不带参数，避免 lint 的未使用参数告警；阶段 B 替换为 `apply(ctx: CodexScope)`。
- 生成索引断言使用 `node --input-type=module`，避免根 `"type": "module"` 下 `require` 的不确定性。
- 确认 Codex 市场索引路径是 `.agents/plugins/marketplace.json`（`packages/resources/plugins/src/host/marketplace.ts`），不是旧注释里的 `.codex-plugin`。
- 确认 `codex plugin add/remove` 没有 `--scope`，因此只声明一个 `global`/`user` place。
- 确认 `codex plugin list --json` 的顶层是 `{ installed: [...] }`，不能照搬 `claude.code` 的顶层数组解析。
- 确认 `McpError` 构造签名是 `(key, params?, detail?)`，params 值是 `string`。
- 确认 `ExtensionIcon` 可以使用 `useId`；Hub 的 React runtime 导出 `useId`（`packages/core/src/host/extension-runtime.ts`）。
- 图标渐变 id 用 `useId().replace(/:/g, "")`，避免 `url(#...)` 片段里的冒号；仓库里 `packages/shadcn-ui/src/components/chart.tsx` 已有同样做法。
- `locations.ts` 的展示路径用 `CODEX_SKILL_DIR`/`CODEX_CONFIG_FILE`/`CODEX_GLOBAL_INSTRUCTION_FILE` 拼出，避免同一路径写两遍。
- `git diff --check` 不检查未跟踪文件，因此交付前补了 `git diff --cached --check`。
- 确认 `permissions` 的候选值在 `scripts/build-marketplace.mjs` 的 `PERMISSIONS` 集合内。
- 确认测试不 import `src/index.tsx`，避免 vitest 解析 JSX/React runtime；测试只 import `provider.ts`/`installer.ts`。
- 确认 `pnpm-lock.yaml` 必须提交，CI 使用 `--frozen-lockfile`。
- 明确列出不做项，防止顺手改 Hub、改共享 place、加 prompts provider 或提交生成物。
- 在隔离 `CODEX_HOME` 中实测了 `marketplace add` 的幂等性（第二次 `alreadyAdded: true`，退出 0）和 `plugin add --json` 的 `installedPath`；安装器据此返回 `location`。
- 通过 Codex 源码/官方文档核实：全局指令是 `$CODEX_HOME/AGENTS.override.md` 或 `$CODEX_HOME/AGENTS.md`；项目技能目录是 `.codex/skills`；用户旧技能目录 `~/.codex/skills` 仍被读取。
