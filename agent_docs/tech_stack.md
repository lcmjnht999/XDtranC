# Tech Stack

Last verified: 2026-10（仅核对 Tech Design 文档，**未安装任何依赖、未运行任何命令**）

## Stack

| Area | Choice | Notes |
|------|--------|-------|
| 桌面壳 | Electron | 生态成熟、Node 侧适合调用子进程；包体与内存较大，单用户内网可接受 |
| 前端 | React 18 + TypeScript + Vite（Electron 渲染进程） | 单一工作台页面；Vite 冷启动快 |
| 样式 | Tailwind CSS（自定义工程风主题） | 界面打磨不在本 MVP，只保证清晰可用 |
| 编辑器组件 | monaco-editor | 只读源码/产物预览；**必须动态 import** |
| 引擎/后端 | Node.js + TypeScript（`packages/engine`，多模块单体） | 与前端共享契约；不得依赖 Electron |
| 解析 | tree-sitter-cpp（`web-tree-sitter` 或原生绑定） | 语法级：文件/声明/`#include`/符号引用；不覆盖完整语义 |
| 数据库 | 无 | 本地 JSON 工作区 `.xdtranc/`（model / state / out / exports / reports / logs） |
| Auth | 不涉及 | 本地内网单用户工具，无账号体系 |
| 导出 | `yazl`（zip 流式）+ 递归复制（dir） | 零系统依赖；所有路径必须做边界校验 |
| 测试 | Vitest / React Testing Library / Playwright for Electron | E2E 用 Mock Provider 离线跑 |
| 打包 | electron-builder：Windows NSIS、Linux AppImage + deb | `pnpm build && pnpm pkg` |
| 包管理 | pnpm workspaces（monorepo） | 包：`shared` / `engine` / `main` / `renderer` / `cli` |

## Commands

> 以下全部是 Tech Design 计划命令，**尚未验证**：仓库里还没有 `package.json`。脚手架落地后按实际脚本校正本节，并把「未验证」标注去掉。

- Setup: `pnpm install`
- Dev: `pnpm dev`（Electron 主进程 + 渲染进程）
- Test（全量）: `pnpm -r test`
- Test（引擎）: `pnpm --filter engine test`
- Test（集成，可选环境）: `pnpm --filter engine test:integration` — 无真实 Provider/Ollama 时 skip
- E2E: `pnpm e2e` — Mock Provider，离线
- 评测集: `pnpm eval`
- Typecheck: `pnpm -r typecheck`（`tsc --noEmit`，strict）
- Lint/format: `pnpm -r lint`（eslint + prettier）
- Build: `pnpm build`
- 打包: `pnpm pkg`（electron-builder）
- 手工 UI 检查: `pnpm dev` 里走一遍 导入 → 切分 → 转换 → 导出

## AI Runtime

- Provider/runtime: OpenAI-compatible 抽象（候选池，默认 DeepSeek-V4-Flash）+ 本地 Ollama 兜底 + Mock Provider。外部付费 API（OpenAI/Anthropic/Google）**不入 MVP**。
- Model can see:
  - Public: 无
  - User-owned: 当前 chunk 的 C++ 源码 + `contextBundle` + prompt
  - Never send: API Key、日志全文、`settings.json`、与当前 chunk 无关的文件、验收库以外的私有数据
- Tools/actions: LLM 无工具权限。输出为结构化 JSON，写盘由引擎在 `.xdtranc/` 与用户选定导出目录内执行；无外部网络写（除向 Provider 发请求）。
- Approval gates: 外部网络外发、切换到合规承诺未确认的 Provider、覆盖已存在的导出目录。
- Retention/training setting to verify: 候选池各模型的「不用于训练 / ZDR」承诺与额度 —— **未确认前不得接入**；不可确认项记 Open Question，不静默外发。
- Fallback: 限流/超时 → 指数退避（有限次）→ 切本地 Ollama → 明确报错交人工；上下文超限 → 自动收缩 chunk；自核查重试超限 → 进 `failedChunks` / `unsupported` 随导出交付。

## Important Patterns

- 编排: 轻量状态机（每阶段可中断异步步骤）+ JSON checkpoint + `events.log.jsonl`；不引入 LangGraph/Temporal。
- 契约: `packages/shared/src/contracts.ts`（数据模型）、`outputSchema.ts`（结构化输出，唯一真源）、`errors.ts`（显式错误体系）。
- 进程边界: 渲染进程只经 preload 白名单 IPC；文件、HTTP、子进程、密钥全在主进程。
- 数据获取: 无 HTTP 服务；IPC `invoke` + `onProgress` 事件推送。
- 状态管理: 主进程持任务状态机，渲染进程订阅 `PipelineEvent`；无全局状态库。
- 错误处理: 边界处校验（导入路径、导出路径、zip 条目）；显式错误码，用户可见信息与开发日志分离；不吞异常。
- 日志/监控: 结构化 JSONL，脱敏（无源码全文、无密钥、无完整 prompt）；指标为阶段耗时、token 用量、重试数、完整性指标。
- 版本要求: Node 与 pnpm 的具体版本**未定**，脚手架时确定 `engines` 并回填本节。

## 不在技术栈内（避免被"补全架构"）

账号体系、数据库/SQLite（P2 才评估）、HTTP/Express/Next 后端、云托管与 CI 云服务、cjc/CJPM/clang 工具链（本 MVP 不依赖，缺了不是故障）。
