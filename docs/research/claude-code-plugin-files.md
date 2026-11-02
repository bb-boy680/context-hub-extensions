# Claude Code 插件文件协议调研

- 日期：2026-11-02。
- 本机验证版本：Claude Code `2.1.296`，Windows。
- 目标：为 Claude Code 适配器的纯文件读取、安装、启停、卸载提供依据。
- 配套计划：[Claude Code 插件改用文件读写](../plans/claude-code-plugin-file-io.md)。
- 本次只新增调研和计划文档；实验使用新建的临时配置根、插件根和工作区，没有修改真实用户配置。

## 1. 结论

可以完全通过文件操作完成本地 marketplace 插件的安装和管理。运行时不必执行 `claude plugin list/install/uninstall/enable/disable`，也不必通过 `where/which claude` 判断能否管理。

但必须区分三个事实：

1. **声明**：settings 中的 `enabledPlugins`、`extraKnownMarketplaces`。
2. **安装**：`installed_plugins.json`、`known_marketplaces.json` 和插件文件。
3. **加载**：Claude Code 当前会话已经加载的组件。文件修改在新会话或 `/reload-plugins` 后才进入这一层。

`plugin list` 能列出一条记录不能证明组件已加载；反过来，本地 marketplace 的相对路径插件可以只靠声明加载，列表中却没有安装记录。本轮已分别用 `plugin list --json` 与 `plugin details` 验证这两个事实。

官方文档解释了上述文件的职责，但没有提供完整、带稳定性承诺的第三方写入 schema。下面标为“实测”的内容是 `2.1.296` 的兼容性依据，不是所有版本的保证。

## 2. 路径

记用户目录为 `HOME`，Hub 当前工作区为 `WORKSPACE`：

| 对象 | 默认位置 | 覆盖规则 |
| --- | --- | --- |
| Claude 用户配置根 | `HOME/.claude` | `CLAUDE_CONFIG_DIR` |
| 插件状态根 | `<Claude 配置根>/plugins` | `CLAUDE_CODE_PLUGIN_CACHE_DIR` |
| 用户设置 | `<Claude 配置根>/settings.json` | 随配置根 |
| 项目设置 | `WORKSPACE/.claude/settings.json` | 随当前工作区，不随用户配置根 |
| 项目私有设置 | `WORKSPACE/.claude/settings.local.json` | 随当前工作区 |
| 安装记录 | `<插件状态根>/installed_plugins.json` | 随插件状态根 |
| 已知市场 | `<插件状态根>/known_marketplaces.json` | 随插件状态根 |
| 缓存副本 | `<插件状态根>/cache/<marketplace>/<entry-name>/<version>/` | 多个安装作用域可以共用一个目录 |
| 持久数据 | `<插件状态根>/data/<plugin-id>/` | 独立于缓存；删除涉及用户数据 |

`CLAUDE_CODE_PLUGIN_CACHE_DIR` 名称容易误导：它覆盖的是包含 `cache/`、marketplace 和安装记录的整个插件状态根，不是 `cache/` 自身。

已实测 `CLAUDE_CONFIG_DIR` 单独设置时默认插件根跟随它；同时设置两个变量时可以把 settings 与插件状态分开存放。Hub 必须按自己宿主进程可见的配置解析路径，不能声称知道另一个终端进程使用的环境变量或会话参数。

## 3. 文件内容

### 3.1 安装记录 v2（实测）

```json
{
  "version": 2,
  "plugins": {
    "demo@context-hub": [
      {
        "scope": "user",
        "installPath": "/home/example/.claude/plugins/cache/context-hub/demo/1.0.0",
        "version": "1.0.0",
        "installedAt": "2026-11-02T00:00:00.000Z",
        "lastUpdated": "2026-11-02T00:00:00.000Z"
      },
      {
        "scope": "project",
        "projectPath": "/work/example",
        "installPath": "/home/example/.claude/plugins/cache/context-hub/demo/1.0.0",
        "version": "1.0.0",
        "installedAt": "2026-11-02T00:00:00.000Z",
        "lastUpdated": "2026-11-02T00:00:00.000Z"
      }
    ]
  }
}
```

- 外层 key 是完整 `entry-name@marketplace`，不能只保留包名。
- 记录身份是 `(完整 id, scope, projectPath)`。项目和 local 记录只属于各自工作区。
- `gitCommitSha` 等可选字段可能存在；修改自己的记录时要保留未知字段及其他记录。
- v1 的 `plugins[id]` 是单个对象而非数组。本轮构造的 v1 记录仍可被 `2.1.296` 读取，读取后文件没有自动改成 v2。不能遇到 v1 就当成空库。
- 未知顶层版本、损坏 JSON、字段形状错误必须报读取/兼容错误，不能用空对象覆盖。

### 3.2 已知本地市场（实测）

```json
{
  "context-hub": {
    "source": {
      "source": "directory",
      "path": "/home/example/.context-hub/plugins"
    },
    "installLocation": "/home/example/.context-hub/plugins",
    "lastUpdated": "2026-11-02T00:00:00.000Z"
  }
}
```

同时在用户 settings 中保留声明：

```json
{
  "extraKnownMarketplaces": {
    "context-hub": {
      "source": {
        "source": "directory",
        "path": "/home/example/.context-hub/plugins"
      }
    }
  },
  "enabledPlugins": {
    "demo@context-hub": true
  }
}
```

`known_marketplaces.json` 是已取得的状态，`extraKnownMarketplaces` 是期望存在的声明；两者并非可互换的两个缓存。首次接入按当前 CLI 生成的形态同时维护。已有同名市场指向另一个目录时应报冲突，不能覆盖。

### 3.3 Hub 市场索引

宿主已有 `writeMarketplaceIndex()`：

```json
{
  "name": "context-hub",
  "owner": { "name": "Context Hub" },
  "plugins": [
    { "name": "demo", "source": "./demo", "version": "1.0.0" }
  ]
}
```

文件位于 `<Hub 插件库>/.claude-plugin/marketplace.json`。索引应在注册、安装前由真实库状态生成。包的完整目录树必须保持，不应把 skills、hooks、agents 等组件拆散投递。

## 4. 加载与状态解析

### 4.1 本地市场直接读源目录

官方明确：从本地路径添加的 marketplace 中，相对路径 source 指向的插件直接从市场目录加载。`CLAUDE_PLUGIN_ROOT` 指向源目录。其他常见远端来源通常从版本缓存加载。

本轮实测：

- 文件写入缓存、v2 安装记录、市场记录和 settings 后，`plugin details demo@context-hub` 可以发现测试技能。
- 删除实验缓存副本但保留本地市场源目录，仍能发现技能。
- 保留缓存副本但移走本地市场源目录，`plugin details` 返回未找到。

所以“有缓存就一定能回退”不成立。Hub 删除本地插件库目录会影响直接从该目录加载的 Claude 插件，现有“Agent 副本不受影响”的删除文案不准确。

### 4.2 启用优先级

本地持久设置按 key 合并：`user < project < local`。缺键是继承，不是 `false`；本轮中没有任何设置启用一个有安装记录的插件时，CLI 报 `enabled: false`。

实际会话还可能包含 `--add-dir`、`--settings` 和 managed policy。Managed 优先级最高。文件适配器可以计算自己读到的配置状态，不能把它描述成其他进程当前会话的最终加载状态。

UI 每个位置的开关必须展示该文件自己的值；文件没声明时才显示继承值。`local` 的覆盖必须参与计算，即使本轮只开放 user/project 的安装入口。

### 4.3 不止安装记录一种来源

| 来源 | 可从持久文件发现 | 本轮管理原则 |
| --- | --- | --- |
| marketplace 安装记录 | 是，v1/v2 索引 | 保持完整 id，按工作区过滤，user/project 可写 |
| 仅设置声明的本地相对路径插件 | 是，settings + 市场索引 + 源目录 | 标识为声明，不能伪称有安装记录；安装可补齐记录 |
| `@skills-dir` | 是，用户/项目 skills 下带 `.claude-plugin/plugin.json` 的目录 | 与 marketplace 安装区分；发现后只读，不误删普通技能目录 |
| `local` 安装 | 是 | 读取并保留，参与覆盖；本轮不新增 local 安装入口 |
| `managed`、`@synced`、seed | 部分，取决于可读文件与实际策略来源 | 只读或明确报兼容范围，不猜测组织策略 |
| `@inline` / `session` | 依赖启动参数或进程环境 | 不作为持久安装，更不能传给 user/project 卸载动作 |

把 `readHeld()` 简单过滤为两个 scope 会丢失真实状态，不能作为完整文件适配方案。

## 5. 安装与卸载的必要语义

### 安装

- 保持 `name@context-hub` 身份，避免改成 `name@skills-dir` 后丢失启用配置或重复安装。
- 对 Hub 已收录的本地包，完整目录复制到版本缓存，再写安装记录，最后启用目标 settings；同时维护本地市场记录与声明。
- 对本地 source，缓存不是实际加载来源，但保留规范缓存布局便于与现有安装记录和 Claude 工具互操作。
- 版本优先来自 Claude 清单，然后市场条目；两者均没有且 Hub 包及市场都不是 git 仓库时使用 `unknown`。Hub 收录流程已移除 `.git`。不要把用于画卡片的其他客户端 manifest 当成 Claude 清单。
- 已存在同版本、同内容时不重复复制、不增记录；同版本目录内容冲突时不能直接覆盖可能被会话使用的目录。
- 依赖、组织策略、包管理器安装是 CLI 可能附带执行的工作；纯文件实现不能默默假装也做了。

### 启停

- 只修改指定 settings 的 `enabledPlugins[id]`，保留其他 key、注释、格式和其他插件。
- 启停不增删安装记录，也不改缓存。
- 依赖不满足、被更高优先级策略阻止时不能报“已加载”。

### 卸载

对新建 fixture 调官方 `uninstall --keep-data --json` 作为参照，实测得到：

1. 删除目标 scope 的 `enabledPlugins[id]` key，保留其他 scope。
2. 删除对应安装记录。多个 scope 指向同一缓存时，移除其中一个不标记缓存。
3. 最后一条引用消失后，缓存保留，目录内增加 `.orphaned_at`，内容为 Unix 毫秒时间戳的十进制文本。

官方文档说明缓存通常在 14 天后后台清理，避免破坏已经启动的会话。Hub 应在核实所有记录引用后只标记，不自行递归删除缓存。

CLI 默认最后一次卸载还会删除插件数据、选项和 secrets。本计划建议 Hub 文件卸载保留这些数据，并在文档和确认文案说明这一差异；不在此任务接管凭证或做数据清理。

## 6. 验证记录与边界

本次主实验 8 项断言全部通过：纯文件安装并发现技能；无缓存而本地源存在时发现技能；无启用配置时 disabled；project 覆盖 user；local 覆盖 project；两个 scope 共用一个缓存；移除 user 后 project 仍加载；移除最后声明及记录后不加载。

另已观察并记录：

- 只有 project 声明、没有安装记录时，列表为空但组件可发现。
- 自定义配置根与独立插件根生效。
- 切到另一工作区，CLI 仍列出其他项目的记录，但插件不加载；Hub 必须自己筛选。
- v1 仍能读，读取不改写版本。
- 本地源丢失时不从现有缓存回退。
- 官方卸载保留共享缓存，最后引用移除后写毫秒时间戳标记。

所有 fixture 仅含清单和被动 Markdown 技能，没有 hooks、MCP、mod 或可执行安装脚本；没有调用模型 API。CLI 在本次只作为独立验证器，另有一次 fixture 卸载参照实验，不代表计划保留运行时 CLI 依赖。

未实测：macOS/Linux 文件系统、旧版 Claude、企业远程策略、会话热重载、hooks/MCP/LSP 的实际执行、依赖自动安装、长时间运行会话的缓存回收。实现验收必须区分“文件状态正确”“组件被发现”和“组件执行成功”。

## 7. 一手资料

通过 Context7 `/websites/code_claude` 检索，再读取官方完整页面，访问日期均为 2026-11-02：

- [Plugin loading reference](https://code.claude.com/docs/en/plugins/loading)：三阶段、原位加载、settings 优先级、文件布局、版本与清理。
- [Plugin commands reference](https://code.claude.com/docs/en/plugins/cli-reference)：list/details 输出、启停及卸载副作用。
- [Environment variables](https://code.claude.com/docs/en/env-vars)：配置根、插件根、session 插件目录与 seed。
- [Settings reference](https://code.claude.com/docs/en/settings-reference#enabledplugins)：插件开关与组织策略。
- [Plugin dependencies](https://code.claude.com/docs/en/plugins/dependencies)：依赖身份、约束、跨市场限制和自动安装行为。
