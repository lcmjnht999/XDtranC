# AGENTS.md — XDtranC（乾坤大挪移）

## Project

- **What this is:** 把 C++ 项目目录/压缩包转换为仓颉项目目录/压缩包的本地桌面工具（Electron + TypeScript 全栈，引擎可被 CLI 复用）。
- **Who it is for:** 华为内部承担存量迁移任务的开发者/迁移工程师（熟悉 C++，不熟悉仓颉）。单用户内网工具，无账号体系。

## 当前仓库状态

git 仓库 `https://github.com/lcmjnht999/XDtranC`（私有，`main` 分支）。`docs/` 下是产品与研究文档（PRD / Tech Design / research），根目录是本文件 + `MEMORY.md` + `REVIEW-CHECKLIST.md` + `agent_docs/`，已初始化 shared/engine/cli 与只读目录解析第一片。实际已验证命令和限制见 `docs/first-feature.md`；下文 renderer/e2e/eval/build/pkg 仍是后续计划命令，不代表已实现。

## Commands

工作区是 pnpm monorepo，`pnpm -r` 会遍历所有包，只改引擎时用 `--filter` 更快：

- `pnpm --filter engine test` / `test:integration` — 引擎单测；集成测试需要真实 Provider 或 Ollama，没有时跳过而非失败。
- `pnpm --filter renderer test` — 渲染进程组件测试（Vitest + RTL）。
- `pnpm e2e` — Playwright for Electron，主旅程必须用 Mock Provider 离线跑，不能依赖真实 LLM。
- `pnpm eval` — 评测集脚本（出物完整性、无空壳、lineRetention、失败路径）。
- `pnpm build && pnpm pkg` — 打包前必须先 build；`pnpm pkg` 走 electron-builder。

## Read first — when relevant

- 产品范围与验收口径：`docs/PRD-XDtranC-MVP.md`（注意：PRD 仍描述旧范围，见下方「范围权威」）。
- 架构、目录、实现方式、校验口径：`docs/TechDesign-XDtranC-MVP.md`（**当前生效版本，2026-10-22 范围修订**）。
- 研究底稿与待核实清单：`docs/research-xdtranc.md`。
- 产品范围速览：`agent_docs/project_brief.md`、`agent_docs/product_requirements.md`。
- 技术栈与命令：`agent_docs/tech_stack.md`。检查与验证方式：`agent_docs/testing.md`。代码约定：`agent_docs/code_patterns.md`。

只读当前任务需要的文档。当前进度、待办与阻塞在 `MEMORY.md`，不在本文件。

## 范围权威（重要）

两份文档范围不一致，已由用户确认：**以 `docs/TechDesign-XDtranC-MVP.md` 的新 MVP 边界为准**。

- 本 MVP 只做 4 项：项目导入与解析、代码切分、LLM 转换（含自核查）、输入/输出工作台 + 导出。
- **不在本 MVP**：cjc 编译验证、编译错误自动修复、CJPM 测试验证、用户反馈修复、界面优化、富可视化流程。
- 因此 PRD 里的「编译错误行占比 <15%」「人工修复后测试失败率 <20%」**不再是本 MVP 指标**；验收口径是出物完整性（无空壳、`exportedFileRatio`、`lineRetentionRatio`、`unsupported` 清单）。
- PRD 原文尚未同步修订，属已知待办，不要为了让文档"看起来一致"而擅自改写 PRD。

## Gotchas

- **`packages/engine` 不得 import Electron 或任何渲染层代码**。`packages/cli` 直接复用同一批服务函数，一旦引擎依赖 Electron，CLI 立刻跑不起来。
- **所有写盘必须过路径边界校验**：工作区写限定在项目根 `.xdtranc/` 内，导出路径必须 `resolve` 归一化后做前缀校验。漏一处就是目录穿越。
- **结构化输出契约只有一个真源**：`packages/shared/src/outputSchema.ts`。主进程、渲染进程、CLI 都要引用它，不要各自复制一份 schema，否则解析失败会变成"有的地方过、有的地方不过"。
- **不要在 Electron 里开 `nodeIntegration`**。设计已定 `contextIsolation: true` / `nodeIntegration: false` / `sandbox: true`，渲染进程只经 preload 白名单 IPC 访问能力。为省事放开会同时破坏安全边界和架构分层。
- **不允许用"删业务逻辑"换取自核查通过**。`selfCheck` 失败或 schema 解析失败要走带问题回炉重试（默认 2 次），最终失败进 `failedChunks` / `unsupported` 并显式呈现，不能静默丢弃。
- **本 MVP 没有编译验证**，所以任何"编译通过""测试通过"的结论都不成立。报告只能说"产物已导出且完整性清单如下"。缺 cjc/CJPM/clang 不是环境故障，不要试图补装。
- **默认不落云**：外部付费 API（OpenAI/Anthropic/Google 等）不在 MVP 接入范围。新增 Provider 前必须先确认该模型的"不用于训练 / ZDR"承诺，不确定就记 Open Question，不允许静默外发。
- **`.xdtranc/` 与导出包不入库**，`samples/` 里只放公开或自建样例，验收库走内网通道，不进仓库。
- **Monaco 必须动态 import**，静态引入会把启动时间拖到不可接受。
- **tree-sitter-cpp 只是语法级解析**，覆盖不到模板/重载等完整语义。遇到解析不了的结构，登记 `unsupported` 并报源位置，不要猜或静默跳过。
- 没有数据库、没有 HTTP 服务、没有后端。不要引入 SQLite/Express/Next 之类的层来"补全架构"；状态用 JSON + 事件日志。

## Protected areas

### Git 与发布：写操作只能由用户本人执行（2026-10-29 用户指令，永久有效）

- **禁止代跑任何 git 写操作**：`git init` / `add` / `commit` / `push` / `pull` / `merge` / `rebase` / `tag` / `branch` / `remote` / `stash` / 子模块，以及 `gh` 系列命令。
- 需要"上传/同步到 GitHub"时：助手只给出**可复制命令 + 每步预期输出 + 校验点**，由用户执行并回报结果；不代跑、不"顺手"执行。
- 允许的只读核对：`git status`、`git log`、`git diff`、`git show`、`git ls-files`、`git ls-tree`、`git remote -v`。
- 同理，任何外部网络写、发布、部署、打包分发、生产库操作，一律只给命令不代跑。

密钥、凭据、私有日志、验收库源码不进提交，也不进入未授权的传输。保留与本任务无关的工作区改动。

Provider API Key 只存本机（Windows Credential Manager / Linux keyring，退化时用受限权限配置文件），不写日志、不写报告、不随导出物带走。

在本任务已授权的范围内，继续完成本地实现、相关检查和修复，不需要每改一个文件就确认一次。以下动作必须在执行前确认"动作 + 目标"已被授权：外部网络外发、切换/新增非候选 Provider、部署与打包分发、覆盖用户已有目录、删除数据、改动内网 ACL。

## AI features

- **Model can see:** 当前 chunk 的源码 + `contextBundle`（跨 chunk 的声明/签名摘要）+ prompt。
- **Never send:** API Key、日志全文、与当前 chunk 无关的文件、验收库以外的私有数据、`settings.json` 内容。
- **AI can do:** 生成仓颉代码草稿、自核查、产出 `unsupported` 说明。LLM 不直接持工具权限，写盘由引擎在受控边界内执行。
- **Needs approval:** 外部网络外发、切换到未确认合规承诺的 Provider、覆盖已存在的导出目录。
- **How to verify behavior:** `pnpm --filter engine test`（Mock Provider 覆盖 schema 失败/自核查失败/限流重试）+ `pnpm eval`（出物完整性、负面用例、失败路径）。
- **Fallback:** 限流/超时 → 指数退避（有限次）→ 切本地 Ollama → 仍失败则明确报错交人工；自核查重试超限 → 该 chunk 进失败清单并随导出交付。

## Done means

完成请求的行为，运行与改动范围匹配的检查（引擎改动至少 typecheck + 相关单测），修复由本次改动引起的失败。UI 改动在 `pnpm dev` 里实际点一遍。已有结论仍然有效时可复用，代码变化或出现新证据时重跑。

报告结果、实际跑过的检查与限制、必要的回滚说明。被阻塞时说明具体阻塞点和剩余工作，不要把未验证的实现说成完成。

---

文件变长就是拆分信号：把任务型流程（发布步骤、验收清单）移到按需加载的技能文档，把目录专属约定放到子目录的 `AGENTS.md`。全局约束和安全禁令留在本文件，不要搬走。
