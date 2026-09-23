# oh-my-zcode

[English](README.md) · [简体中文](README_CN.md)

> **写代码的 agent 不负责给自己的工作判分；没有打开过的来源不算来源。**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE) [![ZCode Plugin](https://img.shields.io/badge/ZCode-plugin-8A2BE2.svg)](.zcode-plugin/plugin.json) [![GLM](https://img.shields.io/badge/models-GLM-5.3-blueviolet.svg)](docs/routing.md)

## 这是什么

oh-my-zcode 是一个带证据门控的 ZCode 插件。它把写入、评审和验证分给不同角色，并把结论绑定到真实执行结果：

- **17 个角色**：写作者产出文件，评论者评审，验证者执行检查；写作者不评判自己的工作。
- **4 个原生门控**：没有匹配执行证据的 `VERDICT: PASS`、没有抓取过的来源、没有复现的安全发现、没有授权范围的攻击命令都会被阻止。
- **项目内证据**：计划、报告、证明日志和安全记录写入磁盘，便于事后核查。

流水线原则保持不变：

```text
想法
  ↓
/ohmy-council   五个盲评角色：继续、调整或放弃
  ↓
/ohmy-plan      读取真实代码 → scaffold → plan → 校验
  ↓
/ohmy-swarm     构建 → 评审 → 验证，直到签名齐全
  ↓
完成：代码交付，PASS 只引用已执行的证据
```

`/ohmy-research`、`/ohmy-security` 和 `/ohmy-redteam` 也可以单独使用。`SessionStart` hook 会把原则注入每个会话，即使没有运行命令也会生效。

## 安装和更新

当前公开归档是 **3.0.0**：每个平台一个原生包，hooks 和 scope server 不需要 Node.js。在 **Settings → Plugins → Create → Add marketplace** 中，粘贴运行 ZCode 的那台机器对应的 JSON URL（只选一个）：

```text
Windows x64          https://unknoownu.github.io/oh-my-zcode/3.0.0/x86_64-pc-windows-msvc/marketplace.json
macOS Apple Silicon  https://unknoownu.github.io/oh-my-zcode/3.0.0/aarch64-apple-darwin/marketplace.json
macOS Intel          https://unknoownu.github.io/oh-my-zcode/3.0.0/x86_64-apple-darwin/marketplace.json
Linux x64            https://unknoownu.github.io/oh-my-zcode/3.0.0/x86_64-unknown-linux-musl/marketplace.json
Linux ARM64          https://unknoownu.github.io/oh-my-zcode/3.0.0/aarch64-unknown-linux-musl/marketplace.json
```

在 Mac 上，**苹果菜单 → 关于本机** 可以判断芯片：Apple M1–M4 是 Apple Silicon；标有 Intel 处理器的是 Intel。通用包（一个小型 Node 启动器加五个原生二进制，全平台一个 URL）将随**下一个版本**发布；详见[分发与安装](docs/distribution.md)。

### 安装 3.0.0

1. 如果旧 marketplace 或本地文件夹中安装了 BetterZcode 或另一个 `oh-my-zcode`，先在 **Settings → Plugins** 中卸载旧副本。重复的插件身份会阻止通用包安装。
2. 打开 **Settings → Plugins → Create → Add marketplace**，粘贴上表中你这台机器的精确 JSON URL。
3. 打开刚添加的 marketplace，只安装一次 `oh-my-zcode`。
4. 完全退出并重新启动 ZCode，然后开始一个**新会话**。Windows 如果进程仍在运行，请从托盘退出；macOS 使用 **ZCode → Quit ZCode** 或 **⌘Q**。

手动添加本地 marketplace 时，**Add marketplace** 接受的是包含 `marketplace.json` 的文件夹，不是解压后的插件根目录。ZIP 下载 URL 和 HTML 下载页面都不是 marketplace 源。[分发指南](docs/distribution.md)说明本地 wrapper、包布局和可选服务。请始终只保留一个已安装副本。

### 更新

将来发布新版本时，在 ZCode 的 Plugins 设置中刷新 `unknoownu` marketplace，然后在主机提供新版本时选择插件更新。更新后完全退出并重新启动 ZCode，再开始新会话。会话开始时的提示只会通知有新版本，不会自动下载或安装更新。同一版本的修正（包括在通用包和原生 3.0.0 包之间切换）需要先卸载现有副本，再从目标 marketplace 完整安装一次。发布页面 endpoint 和本地包细节见[分发与安装](docs/distribution.md)。

### 让 agent 协助安装

可以把下面的内容粘贴到新的 ZCode 会话中：

```text
请完整引导我安装 oh-my-zcode 插件。
1. 先问我 ZCode 运行在哪台机器上，然后打开 Settings → Plugins → Create → Add marketplace，添加该机器对应的精确 JSON URL — Windows x64: https://unknoownu.github.io/oh-my-zcode/3.0.0/x86_64-pc-windows-msvc/marketplace.json · macOS Apple Silicon: https://unknoownu.github.io/oh-my-zcode/3.0.0/aarch64-apple-darwin/marketplace.json · macOS Intel: https://unknoownu.github.io/oh-my-zcode/3.0.0/x86_64-apple-darwin/marketplace.json · Linux x64: https://unknoownu.github.io/oh-my-zcode/3.0.0/x86_64-unknown-linux-musl/marketplace.json · Linux ARM64: https://unknoownu.github.io/oh-my-zcode/3.0.0/aarch64-unknown-linux-musl/marketplace.json — 停下来等确认再继续。
2. 如果存在来自旧 marketplace 或本地文件夹的 BetterZcode 或 oh-my-zcode，请先让我卸载；重复身份可能阻止安装。然后从刚添加的 marketplace 只安装一次 oh-my-zcode。
3. 使用主机实际的 installed_plugins.json 验证安装，读取 oh-my-zcode 条目的 installPath，并检查该路径包含 .zcode-plugin/plugin.json、agents/、commands/ 和 skills/。不要假设操作系统、owner 或缓存路径。
4. 要求我使用当前操作系统的完整退出方式完全退出并重新启动 ZCode，然后开始新会话。
5. 在新会话中确认 /ohmy-plan、/ohmy-swarm 和 /ohmy-research 可用，并确认会话收到流水线原则。报告所有缺失项。
```

安装或更新后必须重启 ZCode 才能重新读取 MCP 声明，并开始新会话才能重新加载 hooks。

## 依赖和网络

必需运行环境是支持插件的 ZCode 主机，以及 **PATH 中的 Node.js 22+**。agent frontmatter 将角色路由到 ZAI Coding Plan 模型 `account:zai-individual-coding-plan/GLM-5.3` 和 `account:zai-individual-coding-plan/GLM-5.3-Flash`，并使用各自声明的 effort。模型可用性、账户限制和服务商流量遵循 ZAI Coding Plan 与 ZCode 主机策略。Rust、Cargo 和编译器只用于开发；通用归档不需要它们。

下面的集成只有在使用对应 MCP server 或命令时才会运行：

- `grep` 连接 `https://mcp.grep.app`，搜索公开代码。
- `semgrep` 要求 `semgrep` 可执行文件在 `PATH` 中，并启动 `semgrep mcp`。
- `osv-scanner` 要求 `osv-scanner` 可执行文件在 `PATH` 中，并启动 `osv-scanner experimental-mcp`。
- `codegraph` 要求 Node 和 npm。可以在已安装的插件目录中选择执行 `npm --prefix vendor/codegraph ci --omit=dev --no-audit --no-fund`；这会从 npm 下载锁定的包及其平台依赖。锁文件记录 `@colbymchenry/codegraph` 1.5.0 的许可证为 MIT。本归档没有可核验的源代码仓库，因此不猜测 GitHub 地址，使用 [npm registry 记录](https://registry.npmjs.org/@colbymchenry%2Fcodegraph)作为包来源链接。

更新提示每 24 小时最多执行一次匿名 `curl` GET，超时上限为 2 秒，目标是发布 Pages 的 marketplace endpoint（`https://unknoownu.github.io/oh-my-zcode/marketplace.json`；该 endpoint 随下一个版本发布启用，在此之前检查会静默放行）。请求不携带 payload 或标识符；请求失败或 manifest 无法解析时静默失败。它只通知新版本，不会自动安装。状态按用户写入 `~/.zcode/cli/plugins/data/oh-my-zcode@unknoownu/update-check.json`；将 `disabled` 设为 `true` 可以关闭检查。`OH_MY_ZCODE_UPDATE_URL` 和 `OH_MY_ZCODE_UPDATE_STATE` 是配置/测试覆盖项。准确行为以[分发指南](docs/distribution.md)为准。

命令要求研究时还可能使用 ZCode 提供的 WebFetch/WebSearch。这些请求、ZAI 模型调用、可选的 grep.app、可选的 npm 安装，以及配置后的 Semgrep/OSV 请求都属于外部网络活动。通用启动器本身不会在运行时下载二进制。

## 文件和副作用

安装后的插件包含以下公开文件：

| 路径 | 用途 |
|---|---|
| `.zcode-plugin/plugin.json` | 插件元数据和 MCP 声明 |
| `agents/` | 17 个角色定义及其 ZAI Coding Plan frontmatter |
| `commands/` | 6 个斜杠命令定义 |
| `skills/` | 6 个流水线与评审 skill 定义 |
| `hooks/hooks.json` | 主机 hook 匹配器和启动器调用 |
| `bin/` | Node 启动器及 3.0.0 归档中的 5 个平台二进制 |
| `vendor/codegraph/` | 可选 npm 包的 manifest 和锁文件 |

命令和 hooks 会在项目中写入 `.oh-my-zcode/` 状态。根据命令不同，可能生成 `evidence/`、`plans/`、`research/`、`council/` 和 `security/` 记录；安全命令还可能生成 scope 和 loot 文件。更新提示会在上述每用户 ZCode 插件数据目录中写入限流和禁用状态。

agent 工作可以通过 ZCode 的委派 scope 执行 shell 命令。主机会把命令显示在会话中，evidence/proof hooks 会记录结果。`/ohmy-security` 和 `/ohmy-redteam` 对识别出的攻击命令要求已授权的 test/dev scope；scope gate 会阻止不支持或超出范围的请求。授予目标前请阅读[范围执行说明](docs/scoped-execution.md)。

## Hooks

主机在 ZCode 启动时读取 hook 声明。安装或更新后必须完全退出并重新启动 ZCode，然后开始新会话，才能同时重新加载 MCP 声明和 hooks。

| 事件和匹配器 | 作用 |
|---|---|
| `SessionStart`（`startup`、`clear`、`compact`） | 注入流水线原则 |
| `PostToolUse`（`Bash`） | 记录已执行的证据 |
| `PostToolUse`（web fetch/search 匹配器） | 记录已抓取的来源 |
| `PreToolUse`（`Bash`） | 检查 scope 并开始 proof 捕获 |
| `PreToolUse`（`Agent`、`Task`） | 记录委派 dispatch |
| `Stop` | 在结论前应用 evidence、citation 和 finding 门控 |
| `PostToolUseFailure`（`Bash`） | 记录失败命令证据 |

如果官方打包器丢失执行位，启动器会对选中的 POSIX 二进制执行 `chmod +x`。它只改变本地文件权限，不会下载替代二进制。

## 六个命令

### `/ohmy-council`

并行提交一个想法给五个盲评角色：可行性、风险、价值三个评审，以及创新和未探索领域两个创意角色。评审在阅读 briefing 前先写标准，聚合按三个评审中至少两个的多数票计算；少数意见保持原文。结果写入 `.oh-my-zcode/council/<run>/`。

```text
/ohmy-council  让玩家导出最佳对局的混剪
```

机制说明见[council 文档](docs/council.md)。

### `/ohmy-plan`

explorer 只读侦察真实代码，scaffold-writer 写入 `scaffold.md`，scaffold-critic 校验，plan-writer 写入 `plan.md`，plan-critic 再根据代码和原则检查。编排器不写入计划文件。计划执行前使用此命令；结果位于 `.oh-my-zcode/plans/<run>/`，可能标记为 `PLAN READY` 或带具体问题的阻塞状态。

### `/ohmy-swarm`

builder 实现，reviewer 在新上下文中评审，verifier 执行决定性命令；循环直到评审和验证签名齐全。结果是基于执行证据的 `VERDICT: PASS`。

### `/ohmy-research`

把问题拆成最多三个方向，并要求研究角色实际抓取页面；搜索摘要不算来源。draft-writer 写 `report.md`，source-verifier 逐条对照来源，最后在 `.oh-my-zcode/research/<run>/` 产生带 `SOURCES: VERIFIED` 的报告。

### `/ohmy-security`

先把范围写入 `scope.json`，再生成 `surface.md` 并按类别派发检查。scope gate 会阻止未授权的攻击命令；finding-verifier 会盲测复现每个候选发现。只有复现的发现进入报告，并以 `FINDINGS: VERIFIED` 标记。

### `/ohmy-redteam`

根据调用参数锁定目标和环境，写入有效期 60 分钟的 `active_scope.json`；`prod` 会被拒绝。流程围绕读取全部用户数据、管理员权限和代码执行等 prize 展开，每个 prize 都要证明影响并重新验证，最后复核清理。

四个门控的详细证明契约见[proof contract](docs/proof.md)，支持的命令和来源身份见[范围执行](docs/scoped-execution.md)。

## 四个门控：它们会阻止，不会询问

| 门控 | 事件 | 会拒绝 |
|---|---|---|
| **Evidence** | `Stop` | 没有本轮成功匹配检查和新鲜 artifact 指纹的 `VERDICT: PASS` |
| **Citation** | `Stop` | 引用本会话未抓取 URL 的 `SOURCES: VERIFIED` |
| **Findings** | `Stop` | 没有匹配预期结果和新鲜 artifact 指纹的 `FINDINGS: VERIFIED` |
| **Scope** | `PreToolUse` | 没有有效范围、不支持目标或执行形式、超出声明范围、没有显式授权 URL 的攻击调用 |

## MCP servers

插件声明五个 MCP server，位于[`.zcode-plugin/plugin.json`](.zcode-plugin/plugin.json)。主机只在应用启动时读取 MCP 声明，所以安装或更新后必须重启 ZCode。

| Server | 传输 | 用途 |
|---|---|---|
| `scope` | stdio（`node ${ZCODE_PLUGIN_ROOT}/bin/launch.mjs scope-mcp`） | 授权范围：`get_scope` 只读查询，`revoke` 立即撤销 |
| `semgrep` | stdio（`semgrep mcp`） | 静态分析，需要 `semgrep` 二进制 |
| `osv-scanner` | stdio（`osv-scanner experimental-mcp`） | 依赖 CVE 扫描，需要 `osv-scanner` 二进制 |
| `grep` | HTTP（`https://mcp.grep.app`） | 公开仓库代码搜索 |
| `codegraph` | stdio（外部 Node 包） | 本地代码索引，依赖安装见[分发指南](docs/distribution.md) |

可选 server 不可用时不会阻止内置 scope server 和四个门控运行。Codegraph 需要 Node；第一方 hooks 和 scope 运行时不依赖它。

## 角色和模型

17 个角色分成写入、评审、验证和 council：

`builder`、`scaffold-writer`、`plan-writer`、`draft-writer` 负责产出；`explorer`、`council-explorer`、`vision` 只读；`scaffold-critic`、`plan-critic`、`reviewer`、`council-analyst`、`council-skeptic`、`council-strategist` 负责评审；`verifier`、`source-verifier`、`finding-verifier` 负责验证；`council-innovator` 负责创意扩展。

每个角色的模型和思考级别都写在 `agents/*.md` frontmatter 中，例如：

```yaml
model: account:zai-individual-coding-plan/GLM-5.3
thoughtLevel: max
```

完整路由依据见[路由文档](docs/routing.md)。禁止把 Coding Plan 中的别名当作模型多样性；模型选择以实际 frontmatter 为准。

## 磁盘数据和开发

```text
.oh-my-zcode/
├── evidence/<session id>.jsonl     hooks 写入的执行证明
├── plans/<run>/                    scaffold.md、plan.md、report.md、evidence.jsonl
├── research/<run>/                 report.md、evidence.jsonl
├── council/<run>/                  briefing.md、report.md
└── security/
    ├── active_scope.json           /ohmy-redteam 调用时写入，有效期 60 分钟
    ├── loot.md                     攻击链记录
    └── <run>/                      scope.json、surface.md、report.md、evidence.jsonl
```

开发环境可在仓库根目录运行：

```bash
cargo build --locked
cargo test --workspace --locked
cargo run --locked -- validate plugin
node test_gate.mjs
```

这些命令需要 Rust；过程契约测试需要 Node。终端用户使用预编译归档。当前 3.0.0 版本以通用 marketplace 为主，并提供 5 个活跃的按平台原生包作为无 Node 替代方案。同一版本的修正需要完整重装且只保留一个副本。版本策略见[versioning](docs/versioning.md)。

## 卸载

在 **Settings → Plugins → oh-my-zcode → uninstall** 卸载。项目中的 `.oh-my-zcode/` 运行数据会保留；重新安装或切换 marketplace 前先移除已有副本。

## License

插件采用 [MIT License](LICENSE)。可选的 `@colbymchenry/codegraph` 1.5.0 的 MIT 元数据记录在锁文件中；其源代码仓库未在此归档中核验，参见上面的 npm registry 链接。Semgrep、OSV Scanner、grep.app、Node/npm 和 ZAI Coding Plan 遵循各自的条款。
