# Codex 插件文件协议调研

- 日期：2026-11-03。
- 本机验证版本：`codex-cli 0.166.0`，Windows。
- 目标：确定 Codex 读写一个已安装插件时到底动了哪些文件，判断 `plugins/codex` 现在这套「调用 `codex plugin` 子命令」的做法错在哪。
- 实验全部在临时 `CODEX_HOME` 里做（`$TEMP/codex-probe-1`），没有改动真实的 `~/.codex`；真实目录只用只读命令（`plugin list`、`marketplace list`、`find`）核对。

## 1. 结论

Codex 的插件状态只有两处落盘，没有索引文件，也没有项目作用域：

1. `$CODEX_HOME/config.toml`
   - `[marketplaces.<name>]`：`source_type = "local"`，`source = "<绝对路径>"`。
   - `[plugins."<pack>@<name>"]`：`enabled = true | false`。
2. `$CODEX_HOME/plugins/cache/<marketplace>/<pack>/<version>/`：插件包的一份完整副本。

**「已安装」＝ `[plugins]` 表里有这个键，且缓存目录存在。** 两者缺一，`plugin list` 就当它没装。

实测对照：

| 状态 | config 有 `[plugins."demo@probe"]` | 缓存目录 `cache/probe/demo/1.0.0/` | `plugin list` 结果 |
| --- | --- | --- | --- |
| 手工写两份 | 有 | 有 | `installed: true` |
| 删缓存、留 config | 有 | 无 | 消失 |
| 留缓存、删 config | 无 | 有 | 消失 |

所以 `codex plugin add` 做的事完全可以手工复现：写一段 TOML、拷一份目录。不需要 CLI，也不需要猜私有格式。

## 2. 路径

记 `CODEX_HOME` 默认为 `HOME/.codex`：

| 对象 | 位置 |
| --- | --- |
| 用户配置 | `$CODEX_HOME/config.toml` |
| 插件状态根 | `$CODEX_HOME/plugins` |
| 缓存副本 | `<插件状态根>/cache/<marketplace>/<pack>/<version>/` |
| 本地 marketplace 索引 | `<marketplace 根>/.agents/plugins/marketplace.json` |
| 远端/仓库 marketplace 快照 | `$CODEX_HOME/.tmp/marketplaces/<name>/` |
| 安装 staging | `<插件状态根>/.remote-plugin-install-staging`、`.marketplace-plugin-source-staging` |

本地目录型 marketplace **不复制快照**，直接读原地；只有 git/远端 marketplace 才在 `.tmp/marketplaces/` 留快照。

**项目级作用域存在，但要项目被信任。** 在工作区放 `.codex/config.toml` 注册 marketplace，只有在 `$CODEX_HOME/config.toml` 里有

```toml
[projects."<项目绝对路径>"]
trust_level = "trusted"
```

时才会被读。实测：项目未信任时 `codex plugin marketplace list` 看不到项目里的 marketplace；补上 `trust_level` 后立刻出现。项目未信任时 app-server 会直接报：

> Project-local config, hooks, and exec policies are disabled in the following folders until the project is trusted, but skills still load.

也就是说 Codex 的作用域是 `user` + `project`（受 trust 门控），没有 Claude 的 `local` 那一层。

## 3. 写入

### 3.1 注册 marketplace

`codex plugin marketplace add <dir>` 的结果是往 `config.toml` 追加：

```toml
[marketplaces.context-hub]
source_type = "local"
source = '\\?\C:\Users\hl131\.context-hub\plugins'
```

实测：

- `\\?\` 前缀是 CLI 自己加的 verbatim 形式，**不是必需的**。手写 `source = "C:/Users/hl131/.context-hub/plugins"` 一样能读出插件。
- marketplace 名取自索引文件里的 `name` 字段，不是目录名。
- 同样的效果可以纯手写 `config.toml` 达成，已用临时 home 验证。

### 3.2 安装插件

`codex plugin add demo@probe` 只做两件事：

1. 往 `config.toml` 追加 `[plugins."demo@probe"]` + `enabled = true`（已有则保留）。
2. 把 `<marketplace 根>/<pack>/` 整份拷到 `$CODEX_HOME/plugins/cache/probe/demo/<version>/`，并删除同一插件的其他版本目录。

返回的 `installedPath` 就是那个缓存目录。

版本号的优先级：包内 `.codex-plugin/plugin.json` 的 `version` → marketplace 条目里的 `version` → 都没有时目录名是 `local`。目录名是权威：把缓存目录改名成 `9.9.9`，`plugin list` 就报 `9.9.9`，不管 manifest 里写的是什么。

### 3.3 启停

`codex plugin add/list/remove/marketplace` **没有** enable/disable 子命令，但状态是有的：

```toml
[plugins."demo@probe"]
enabled = false
```

`plugin list --json` 会如实报 `"installed": true, "enabled": false`。也就是说：启停只能写文件，CLI 做不到。

### 3.4 卸载

`codex plugin remove demo@probe` 删掉 `[plugins]` 里的那个键，并删掉对应的版本目录；`[marketplaces.*]` 保留。

## 4. 读取

`codex plugin list --json` 的字段含义（实测）：

| 字段 | 来源 |
| --- | --- |
| `installed` | config 有键 + 缓存目录存在 |
| `version` | 缓存目录名 |
| `enabled` | config 里的值 |
| `source.path` | marketplace 里那份包的路径，**不是**缓存路径 |
| `marketplaceSource.source` | `[marketplaces.<name>].source` 的 verbatim 形式 |
| `installPolicy` / `authPolicy` | marketplace 条目的 `policy`，缺省 `AVAILABLE` / `ON_INSTALL` |

不加 `--available` 时只列已安装的；加 `--available` 才带未安装的条目，此时 `installed: false`。

### 4.1 app-server 的 `plugin/list`

app 不读 `config.toml`，它走 app-server 的 `plugin/list`。用一份只含 `[marketplaces.*]` / `[plugins.*]` 的临时 home 起了一个 app-server 直接问过：

```json
{"jsonrpc":"2.0","id":2,"method":"plugin/list","params":{}}
```

返回 `marketplaceLoadErrors: []`，`marketplaces` 里 `context-hub` 带着全部 5 个包（ponytail、remotion、impeccable、vercel、product-design），每个都是 `availability: "AVAILABLE"`、`installPolicy: "AVAILABLE"`。**服务端数据是全的，没有把自建 marketplace 过滤掉。**

`plugin/list` 的可选参数决定了「可见范围」：

- `marketplaceKinds`：`local` / `vertical` / `workspace-directory` / `shared-with-me` / `created-by-me-remote`。省略时只查 local + 功能开关打开的远端口径。
- `cwds`：用于发现「仓库型 marketplace」的工作目录；省略时只考虑 home 作用域和官方 curated。

### 4.2 `interface` 只来自 `.codex-plugin/plugin.json`

app 卡片上的标题、描述、logo、skills 列表，全部来自 `plugin/list` 里每个包的 `interface` 字段；而 Codex 只从包内的 `.codex-plugin/plugin.json` 取它，**不会回退到 `.claude-plugin/plugin.json`**。

本机实测差异：

| 包 | `.codex-plugin/plugin.json` | `plugin/list` 里的 `interface` |
| --- | --- | --- |
| ponytail | 有 | displayName / shortDescription / logo / capabilities / keywords 全有 |
| product-design | 有 | 同上 |
| remotion、impeccable、vercel | 没有，只有 `.claude-plugin/plugin.json` | 除 `category: "Other"` 外**全是 null** |

所以 Hub 里一个只有 Claude manifest 的包，在 Codex 这张表里是「有 id、没名字、没图标、没描述、没 skills」。这不影响安装和 CLI 列表，但 app 的市场卡片没有内容可渲染。

Hub 生成的 `.agents/plugins/marketplace.json` 只能带 `name` / `source` / `policy` / `category` / `description` / `version`，**带不了 `interface`**，所以补不出这一层——只能靠包自己带 `.codex-plugin/plugin.json`。

## 5. marketplace 索引

Codex 认两种文件，**`.agents/plugins/marketplace.json` 优先**：

| 文件 | `source` 形态 | 说明 |
| --- | --- | --- |
| `.agents/plugins/marketplace.json` | 对象 `{source:"local", path:"./x"}` | Codex 原生，带 `policy`、`category` |
| `.claude-plugin/marketplace.json` | 字符串 `"./x"` | Claude 形态，Codex 也能读 |

实测：两个文件都放、且各列不同条目时，只有 `.agents` 里的条目生效。

所以 Context Hub 现有的 `writeMarketplaceIndex`（同时写两份）对 Codex 是正确的，Codex 走的正是 `.agents` 那份。

## 6. 现在这套实现错在哪

`plugins/codex/src/installer.ts` 是「全部交给 CLI」。它本身能跑通（本机 ponytail / remotion / product-design 就是这么装上的），但有四个实质问题：

1. **声称 Codex 没有开关，是错的。** `installer.ts:144` 和 README 都写「Codex has no per-plugin switch」，因此没有 `setEnabled`、没有 `switches`。实际上 `[plugins."x@y"] enabled` 就是开关，`plugin list` 也报。结果：Plugins 页对 Codex 插件只能装/卸，不能停用。
2. **`available()` 依赖 `codex` 在 PATH 上。** 没有 CLI 整个 Codex 插件区就消失，和刚改完的 claude.code「不依赖 CLI、直接读写文件」不一致。
3. **读路径靠子进程。** `held()` 每次渲染都 spawn 一次 `codex plugin list --json`；CLI 不存在、退出非零、或 `config.toml` 里别处有坏 marketplace，都会让整张列表失败——和 Claude 那边刚修掉的「一处读失败拖垮全部」是同一类问题。
4. **写路径不可控。** 装一个包要起两个进程（`marketplace add`、`plugin add`），中间失败留下半截状态，Hub 无法判断。

## 7. 改成文件读写要动哪里

Codex 这一侧需要的东西很少：读 `config.toml`、按 `[plugins]` + `cache/` 推安装状态、写两个 TOML 表、把包拷进缓存。

阻碍在 Hub 一侧，不在 Codex 一侧：

- `packages/resources/plugins/src/host/installer-files.ts:48` 的 `declarationOf` 写死了 `.claude` / `plugins` / `CLAUDE_CONFIG_DIR` / `CLAUDE_CODE_PLUGIN_CACHE_DIR`。
- 同文件 `allowedRef` 写死了 Claude 的文件白名单（`installed_plugins.json`、`known_marketplaces.json`、`.claude/settings*.json`、`skills/*/.claude-plugin/plugin.json`）。
- `commit` 的 `copy` 校验是 `cache/<marketplace>/<pack>/<version>` 四段——**恰好也是 Codex 的缓存布局**，这部分可以直接复用。
- 插件安装器拿不到 TOML 编辑能力：`PluginTools` 只有 `disk`、`run`、`files`、`describe`，TOML 工具在 MCP 服务的 `McpTools` 里。

两条路：

- **A（小）**：Codex 侧继续用 `codex plugin add` 拷包，但读状态、启停改走 `PluginTools.files`（`PlaceFiles` 已经能读写 `HOME` 下任意文件，MCP provider 就是用它写 `~/.codex/config.toml` 的）。改动只在扩展内，Hub 不动。
- **B（完整）**：把 `PluginDisk` 的声明从「Claude 专属」变成「安装器自报根与白名单」，Codex 也用同一套 `run/commit`。要改 Hub 的 `installer-files.ts`、`declarationOf`、`allowedRef`，以及 `PluginTools` 暴露 TOML 编辑。改动跨两个仓。

A 的代价是仍需要 CLI 才能装（拷包），B 才能让 Codex 和 Claude 一样完全不依赖 CLI。

## 8. 尚未验证

- 运行时到底读缓存副本还是 marketplace 原地那份。`plugin add` 会拷副本、`remove` 会删副本、`plugin list` 的版本取自目录名，三条都指向缓存；但没有一次真实会话加载来确认。影响：包在库里更新而版本号没变时，缓存副本不会自动刷新。
- app 插件页对 local marketplace 的展示口径。服务端 `plugin/list` 返回是全的，app 里只看到官方那几张卡；是 app 按 `interface` 过滤、按 `marketplaceKinds` 过滤，还是需要 `forceRefetch`，没有定论。可验证的最小实验：给 impeccable / vercel 补一个带 `interface` 的 `.codex-plugin/plugin.json`，看 app 市场页是否出现。
- `codex plugin marketplace remove` 对已装插件的影响。
- Linux / macOS 上的路径与 verbatim 前缀行为，只在 Windows 上验证过。
