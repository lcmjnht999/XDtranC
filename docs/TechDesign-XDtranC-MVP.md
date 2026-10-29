# Technical Design Document: XDtranC（乾坤大挪移）MVP

## Executive Summary

**System:** XDtranC（乾坤大挪移）——跨语言项目级源码转换工具
**Version:** MVP 1.0（范围修订版）
**Architecture Pattern:** Electron 桌面应用 + 本地转换流水线引擎（模块化单体，Monolith-with-Modules）
**Estimated Effort:** 约 4–6 人·周（新手团队 + AI 辅助构建的**估算**，随 C++ 子集范围与界面打磨量浮动，待课题排期确认）
**Migration Loop:** 项目导入 → 解析 → 代码切分 → LLM 转换（自核查）→ 导出仓颉项目（目录/压缩包）

本设计承接 `PRD-XDtranC-MVP.md`（Stage: prd，用户等级 B——developer，新手团队）与 `research-xdtranc.md`（Partial research）的既定决策，并按 2026-10-22 确认的**新 MVP 边界**修订：

> **成功标准（新）：输入 C++ 项目目录/压缩包，输出仓颉项目目录/压缩包。**

### 新 MVP 范围（圈内 / 圈外，边界二元明确）

| 圈内（本 MVP 必须交付） | 圈外（一律留日后，本 MVP 不实现） |
|---|---|
| ① 项目导入与解析 | 编译验证（cjc 编译） |
| ② 代码切分 | 自动修复（编译诊断→LLM 修复→复编译） |
| ③ LLM 转换（C++ → 仓颉，含自核查） | 测试验证（CJPM / 行为对比） |
| ④ 输入/输出工作台界面（最小可用版） | 用户反馈修复 |
| （随 ③/④ 交付：候选池 + 本地兜底 Provider、最小报告） | 界面优化、可视化流程 |

> 原 PRD 的「编译错误行占比 <15% / 人工修复后测试失败率 <20%」指标依赖编译修复、测试两环节，已随这些功能移出，**不再作为本 MVP 指标**；本 MVP 的验收口径改为出物完整性（见 F4「完整性口径」与 §8 评测集），成功标准见上文。

- **产品内 LLM 用户自选**，默认 DeepSeek-V4-Flash（免费有限额）起步，可切换候选 / 本地兜底。

### 已确认的关键技术决策（Part 3 访谈 + 范围修订）

| 决策点 | 结论 |
|---|---|
| 桌面形态与引擎语言 | **Electron + TypeScript 全栈**（React/TS 渲染进程 + Node/TS 主进程引擎），CLI 复用同一套引擎代码 |
| C++ 解析器 | **tree-sitter-cpp**（WebAssembly/Node 原生绑定），辅以少量正则兜底，覆盖「文件/类型/依赖识别 + 切分」粒度 |
| LLM Provider 接入范围 | 仅接**候选池（OpenAI 兼容接口抽象）+ 预留本地兜底（Ollama / OpenAI-compatible）**；外部付费 API 不纳入 MVP，避免未确认的 ZDR/不训练条款风险 |
| 编译/测试环境 | **本 MVP 不依赖 cjc/CJPM 与 clang/g++**；产物以「目录 + 压缩包」形态交付，环境门槛降到仅需 Node 运行时 + LLM 连通性；真实编译验证随自动修复/测试功能留日后 |
| 交付形态 | 导出仓颉项目**目录和/或压缩包**（无空壳、可量化完整性口径），供后续环节消费 |

---

## 1. Architecture Overview

### 1.1 High-Level Architecture

```mermaid
graph TB
    subgraph "Electron 桌面应用（内网）"
        R["渲染进程 React/TS 工作台"]
        P["preload 白名单 IPC 桥"]
        M["主进程（Node/TS）: IPC + 任务调度 + 文件访问"]
        E["引擎子模块（在主进程中复用/CLI 直接调用）"]
    end

    subgraph "引擎（engine/）"
        PS["parser: tree-sitter-cpp 解析"]
        CH["chunker: 依赖图 + 上下文切分"]
        CV["converter: LLM 转换 + 结构化输出 + 自核查重试"]
        EX["exporter: 仓颉产物组装 + 目录/压缩包导出 + 完整性清单"]
        OR["orchestration: 状态机编排，可中断/可恢复"]
        PR["provider: ProviderAdapter（候选池/本地/Mock）"]
    end

    subgraph "外部（内网）"
        LLM["候选 LLM API / 本地 Ollama"]
    end

    R <--> P <--> M
    M --> E
    E --> PS --> CH --> CV --> EX
    OR --> PS & CH & CV & EX
    CV --> PR --> LLM

    subgraph "持久化（本地工作区）"
        FS["<root>/.xdtranc/: 项目模型 / 切分快照 / 状态 / 转换产物 / 导出清单 / 日志 / 报告"]
    end
    OR <--> FS
    EX --> FO["导出仓颉项目（目录 / .zip）"]
```

### 1.2 进程边界与数据流

- **渲染进程**：仅做视图与输入；不直接访问文件系统与 Node API（`nodeIntegration: false`、`contextIsolation: true`）。
- **preload**：以最小白名单暴露 IPC（`invoke/onProgress` 等），所有文件读写、子进程/HTTP 调用、密钥读取都在主进程完成。
- **主进程**：持有引擎实例与任务调度器，向渲染进程推送流水线状态事件（切分/转换/导出阶段、进度、报告）。
- **CLI**：`packages/cli` 直接复用 `packages/engine` 的同一批服务函数，不含 Electron 依赖，保证「桌面工作台形态 + 命令行能力」一致性。

### 1.3 Tech Stack Decision

| 层 | 选择 | 备选对比 | 选择理由 | 权衡 / 诚实说明 |
|---|---|---|---|---|
| 桌面壳 | **Electron** | Tauri（Rust 内核，更轻更省内存）；原生（Qt/WinUI，开发慢） | 生态成熟、Node 侧天然适合调用子进程与本地工具链；TypeScript 全栈单一语言，AI 辅助生成质量高，新手团队最易上手 | 包体大（~100MB+）、内存占用高；内网工具 + 单用户可接受；未来若在意资源可评估 Tauri |
| UI 框架 | **React 18 + TypeScript + Vite** | Vue 3；Svelte | 团队/AI 语料最丰富、组件生态成熟；Vite 冷启动快利于迭代 | 需要维护依赖心智；本项目仅一个工作台页面，React 足够 |
| 样式 | **Tailwind CSS**（自定义工程风主题） | CSS Modules；Ant Design/MUI 组件库 | 快速实现「专业、工程感、克制配色」；非重点、以功能为主 | 「优化界面」已划圈外，本 MVP 只保证清晰可用 |
| 桌面 UI 基础组件 | 自建轻量组件 + `monaco-editor`（源码/产物查看） | 重组件库 | 工作台对编辑器与文件树有基础定制需求；Monaco 满足源码/产物只读查看 | Monaco 体积大，需动态导入（lazy load）控制启动时间 |
| 引擎核心语言 | **TypeScript（Node.js）** | Python（脚本/解析生态强）；Go/Rust（性能强） | 与前端同语言、契约（schema）共享；异步编排、流水线事件天然契合；新手团队单一语言心智负担低 | Node 单线程，大项目解析/切分可能偏慢；MVP 规模（2k 行）内可接受，后续并行化用 worker_threads 或抽 Python 服务 |
| C++ 解析 | **tree-sitter-cpp**（`web-tree-sitter` 或原生绑定） | Clang LibTooling（AST 精确但集成重） | 轻量、TS 绑定成熟、增量/容错解析，够支撑「识别文件/声明/依赖 + 切分」；研究底稿亦列其为候选 | 语法级，不覆盖完整语义（重载/模板全语义需运行时确认）；复杂语义结构列入「不支持项显式报告」 |
| LLM 接入 | **OpenAI-compatible 抽象 + Ollama 本地兜底** | 直接接各家原生 SDK；接外部付费 API | 候选池（DeepSeek-V4-Flash 等）多为 OpenAI 兼容形态；一套客户端覆盖候选 + 本地；默认不落云满足合规 | 各家特殊能力（如结构化输出的严格模式差异）以 Reduce 处理；Mock Provider 保证离线可测 |
| 持久化 | **本地 JSON 文件 + 工作区目录组织**（无数据库） | SQLite（better-sqlite3，检索强） | 单一用户本地工具、数据量小（项目模型/状态/报告）；JSON 直观、易排障、无迁移负担 | 报告检索/历史聚合能力弱；达上百次转换后可评估 SQLite（P2） |
| 导出 | **Node 原生流式打包（zip：`yazl`；目录：递归复制）** | 调用系统 zip 命令（`archiver`） | 零系统依赖、内网隔离环境可运行；可控路径校验防目录穿越 | 大文件量时需注意流式写避免内存峰值；MVP 规模可接受 |
| 测试 | **Vitest + React Testing Library + Playwright（Electron E2E）** | Jest；Cypress | Vite 生态配套；Playwright 对 Electron 有官方支持 | E2E 需 LLM 连通性（可用 Mock Provider 离线跑主流程） |
| 打包分发 | **electron-builder**：Windows NSIS / Linux AppImage+deb | 手动脚本；Electron Forge | electron-builder 覆盖内网目标平台、配置简单 | 需内网镜像依赖；签名/更新按课题要求后置（P2） |

### 1.4 目录结构（Monorepo，pnpm workspaces）

```
xdtranc/
├── package.json                # workspace 根：脚本编排（dev/build/test/pkg）
├── pnpm-workspace.yaml
├── tsconfig.base.json          # strict 基础配置
├── .editorconfig / .prettierrc / eslint.config.mjs
├── docs/                       # PRD、本设计、后续 Part4 产物
├── e2e/                        # Playwright for Electron（主用户旅程）
├── samples/                    # 公开/自建 C++ 样例库（流程验证用）
└── packages/
    ├── shared/                 # 类型契约、结构化输出 JSON Schema、错误码、常量
    │   └── src/
    │       ├── contracts.ts    # ProjectModel/Chunk/ExportManifest/Report
    │       ├── outputSchema.ts # 转换的结构化输出 schema
    │       └── errors.ts       # 显式错误体系（见 §8）
    ├── engine/                 # 核心引擎（跨桌面/CLI 复用，无 Electron 依赖）
    │   └── src/
    │       ├── parser/         # tree-sitter-cpp：文件/声明/依赖
    │       ├── chunker/        # 依赖图 → 上下文切分
    │       ├── converter/      # LLM 转换 + 自核查重试
    │       ├── exporter/       # 仓颉产物组装、目录/zip 导出、完整性清单
    │       ├── provider/       # ProviderAdapter（openai-compat/ollama/mock）
    │       ├── orchestration/  # 流水线状态机（可中断/可恢复）
    │       ├── workspace/      # .xdtranc 工作区读写、报告生成
    │       └── index.ts        # 对外服务函数（CLI 与主进程共用）
    ├── main/                   # Electron 主进程
    │   └── src/
    │       ├── ipc/            # IPC 通道定义与 handler
    │       ├── tasks/          # 任务调度、进度事件
    │       ├── settings/       # Provider 配置、模型、预算、密钥（本机存取）
    │       └── index.ts
    ├── renderer/               # React 工作台
    │   └── src/
    │       ├── pages/          # 导入/切分/转换/导出 视图
    │       ├── components/     # 文件树、产物预览、进度条（基础版）
    │       ├── hooks/          # 流水线事件订阅
    │       └── app.tsx
    └── cli/                    # CLI 入口（bin: xdtranc）
```

---

## 2. Component Design

### 2.1 引擎模块职责与关键接口（TypeScript 伪代码，均为内部服务层契约，非 HTTP）

```ts
// packages/shared/src/contracts.ts
type TaskState =
  | "imported" | "parsed" | "chunked"
  | "converting" | "converted"
  | "exporting" | "exported"
  | "reporting" | "done" | "failed" | "cancelled";

interface ProjectModel { root: string; files: SourceFile[]; deps: DepEdge[]; symbols: Symbol[]; }
interface Chunk { id: string; files: string[]; contextBundle: ContextBundle; estTokens: number; deps: string[]; }
interface ContextBundle { externalDecls: string[]; /* 跨 chunk 的声明/签名摘要 */ }

interface ExportedFile { sourcePath: string; targetPath: string; lineCount: number; empty: boolean; }
interface UnsupportedItem { sourcePath: string; line: number | null; reason: string; }
interface ExportManifest {
  format: "dir" | "zip"; outputPath: string;
  exportedFiles: ExportedFile[];
  unsupported: UnsupportedItem[];                       // 「不支持项显式报告」
  emptyFileCount: number;                               // 空壳文件计数（无空壳验收口径）
  lineRetentionRatio: number | null;                    // 输出行 / 输入行 比值（完整性参考，语义变化需人工复核）
  exportedFileRatio: number;                            // 成功导出文件数 / 输入文件数 比值
}

interface PipelineEvent { taskId: string; state: TaskState; stage: string;
  progress: { done: number; total: number } | null; payload?: unknown; }
interface ConversionReport { inputStats: {files:number; lines:number}; chunkCount: number;
  convert: { rounds: number; tokenEstimate: number; failedChunks: string[] };
  export: ExportManifest;
  provider: { id: string; model: string; estimatedCost: string | null; } }
```

```ts
// packages/engine/src/provider/provider.ts —— Provider 抽象（核心合规点：默认不落云）
interface LlmProvider {
  id: string; displayName: string; isLocal: boolean;
  listModels(): Promise<string[]>;
  generate(req: { messages: ChatMessage[]; model?: string; schema?: object;
                   temperature?: number }): Promise<{ content: string; usage?: {in:number;out:number} }>;
}
// 适配器：OpenAiCompatibleProvider(baseUrl, apiKey?)   // DeepSeek-V4-Flash 等候选
//        OllamaProvider()                              // 本地兜底（openai-compatible /chat）
//        MockProvider(fixtures)                        // 离线测试与演示
```

```ts
// packages/engine/src/orchestration/pipeline.ts —— 状态机（可中断/可恢复）
interface PipelineOptions {
  providerId: string; model: string;
  chunkBudgetTokens: number;          // 切分上下文预算
  maxSelfCheckRetries: number;        // 默认 2
  abort?: AbortSignal;                // 支持 停止/断点保存
}
async function runMigration(taskId, project, opts): AsyncGenerator<PipelineEvent>
// - 每阶段结束向持久化状态写入 checkpoint（.xdtranc/state/<taskId>/task.json）
// - 启动时扫描未完成任务 → 提示「恢复」或「丢弃」
```

### 2.2 数据模型与持久化决策

**不引入数据库**（决策见 §1.3）。工作区结构：

```
<project>/.xdtranc/                     # 与源码树分离，不污染原始项目
├── settings.json                       # Provider/模型、切分预算、成本上限（敏感字段加密或外置）
├── model/                              # 解析产物
│   ├── project.json                    # ProjectModel（文件、符号、依赖边）
│   ├── chunks.json                     # 切分快照 + contextBundle
│   └── unsupported.json                # 「不支持项显式报告」清单（源位置 + 原因）
├── state/<taskId>/
│   ├── task.json                       # 状态机 checkpoint（可恢复）
│   ├── conversions/<chunkId>.json      # 转换单元（含 selfCheck、重试记录）
│   └── events.log.jsonl                # 结构化流水线事件（脱敏）
├── out/                                # 仓颉产物（按 chunk 的 package/模块 组织 + 根结构）
├── exports/<taskId>/                   # 导出交付物
│   ├── export-manifest.json            # ExportManifest（无空壳/保留率/不支持项）
│   └── xdtranc-<taskId>.zip            # 压缩包导出（目录导出时此项为空）
├── reports/<taskId>/                   # 转换报告（report.json + report.md）
└── logs/                               # 运行日志（脱敏，见 §10）
```

所有写操作都在主进程的 `workspace/` 服务内完成，并做「在项目根 `.xdtranc` 边界内」的路径校验，防止任意路径写入；导出目标路径由用户显式选择并做规范化校验（防目录穿越，见 §5）。

### 2.3 流水线编排设计

- **编排器** 用轻量状态机实现（每阶段一个可中断的异步步骤），**不引入** LangGraph / Temporal 等重量级编排框架——MVP 阶段产品内只有「转换」一个确定性流水线，durable state 用 JSON checkpoint + 事件日志即可满足「重试、进度、断点恢复」；若后续引入自动修复、测试闭环或多源语言分流，再评估工作流图引擎。
- **可中断与恢复**：每个 checkpoint 落盘；「停止」触发 AbortSignal；未完成任务列表在启动时提示恢复。
- **自核查重试**：转换单元在 `selfCheck` 未通过时自动带问题回炉重试（`maxSelfCheckRetries`，默认 2），不计入额外成本盲区，由报告记录。

---

## 3. Feature Implementation

以下按新 MVP 的 4 项圈内功能给出实现要点：服务入口（CLI 命令与 IPC 通道）、业务逻辑、失败处理。**API 层指主进程内部服务与 CLI 的命令面**（本地工具无 HTTP）。

### F1 项目导入与解析（圈内 / P0）

**CLI：** `xdtranc import <dir|zip>` → `xdtranc parse <project>`
**IPC：** `project:import`、`project:parse`、`project:parsePreview`

- 导入支持目录/压缩包；复制为工作副本（或引用只读源 + 记录基线 hash），解析 `.h/.hpp/.cpp/.cc/.cxx`（`.c` 视配置）。
- tree-sitter-cpp 产出：文件单元、顶层声明/定义（class/struct/func/var/template/enum/macro）、`#include` 边、符号引用边。
- 行列容量统计：总行数、文件数 → 作为出物完整性报告（exportedFileRatio / lineRetentionRatio）的输入口径。
- 解析失败的文件：登记到 `unsupported.json`（源路径 + 错误）并在 UI 明示，**不静默跳过**；不支持项随导出清单显式交付。
- 失败处理：无 C++ 文件 → 明确报错；编码非法文件 → 单文件跳过并登记，汇总提示。

### F2 代码切分（圈内 / P0）

**CLI：** `xdtranc chunk <project> --budget-tokens=...`
**IPC：** `chunk:run`、`chunk:preview`

- 依赖图预处理：`#include` 强连通分量压缩 → 拓扑排序。
- 切分算法：以 `chunkBudgetTokens`（默认按候选模型上下文 1/4 估算，可配置）为硬约束，结合内聚启发式（同模块/同目录优先、SCC 整体入 chunk）做贪婪聚合；每个 chunk 附带 `contextBundle`（被引用的跨 chunk 声明/签名摘要），保证「跨文件类型/调用依赖上下文完整」。
- 成本/精度权衡：过小 chunk 上下文缺失，过大则超窗；`estTokens` 用估算函数（注释加权）预检，超限自动回拆。
- 进度：基础进度文本/进度条（渲染进程订阅 `chunk:progress`），可中断（AbortSignal）。「可视化流程」属圈外，本 MVP 不投入富交互。
- 失败处理：无法归类的孤立文件单独成 chunk；依赖环无法解开的记录提示。

### F3 LLM 转换（C++ → 仓颉，圈内 / P0）

**CLI：** `xdtranc convert <project> --provider=... --model=...`
**IPC：** `convert:run`、`convert:retryChunk`

- Prompt 模板：系统提示（仓颉语言规约要点、映射表节选、结构化输出要求、**不支持项须显式报告**）+ chunk 源码 + `contextBundle`。
- 结构化输出契约（`outputSchema`）：

```jsonc
{
  "kind": "conversion",
  "outputs": [ { "path": "foo.cj", "code": "..." } ],          // 可多文件
  "unsupported": [ { "sourcePath": "foo.cpp", "line": 12, "reason": "..." } ],
  "selfCheck": { "passed": true, "issues": [] },
  "explanation": "对关键映射的说明",
  "confidence": 0.8
}
```

- **自核查**：`selfCheck.passed === false` 或 schema 解析失败 → 自动带问题回炉重试（`maxSelfCheckRetries`，默认 2）；仍失败登记 `failedChunks` 并在报告/UI 醒目提示，**不允许删除业务逻辑换取“通过”**；最终失败或未覆盖的项进入「不支持项」清单随导出交付，不静默吞掉。
- Provider 切换：设置处选候选/本地/Mock；转换单元记录 `providerId/model`，支撑对比评测。
- 失败处理：上下文超限 → 自动收缩重试；API 限流/失败 → 指数退避（有限次）→ 切本地候选 → 明确报错并人工接管。

### F4 输出与输入/输出工作台界面（圈内 / P0）

**CLI：** `xdtranc export <project> --format=dir|zip --out=<path>`
**IPC：** `export:run`、`workbench:loadSource`、`workbench:openOutput`、`workbench:saveOutput`、`workbench:browseFiles`

- **导出（输出侧核心交付）**：将 `out/` 仓颉产物组装为仓颉项目结构；`dir` 递归复制到用户选择目录，`zip` 用 Node 流式打包（`yazl`）；写入 `export-manifest.json`（导出文件数、空壳计数、lineRetentionRatio、unsupported 清单），并在 UI / 报告展示。
- **完整性口径（验收即得）**：`exportedFileRatio = 成功导出文件数 / 输入文件数`；`emptyFileCount` 必须可统计、`空壳=0` 为出物合格默认口径；`lineRetentionRatio` 作为语义保留的量化参考并提示需人工复核（本 MVP 无编译验证，不承诺编译通过）。
- **输入区**：粘贴源码（走「临时项目」管道，仍可切分/转换/导出）；导入项目目录/压缩包。
- **输出区**：产物文件树 + 只读预览（Monaco）；导出按钮（目录/压缩包二选一）。
- **界面（最小可用版）**：单页串行执行「导入 → 切分 → 转换 → 导出」；基础进度条 + 阶段状态文本 + 报告摘要；**不投入**富可视化与界面打磨（两者均在圈外）。
- 失败处理：导出目标路径不可写 → 明确报错并提示更换；打包中途失败 → 产出失败清单并支持重试；空壳文件在报告中醒目列出并给出源位置。

---

## 4. AI / LLM Integration

- **用户场景**：代码转换 Agent（流水线化，非对话式）；**编译修复/测试/反馈 Agent 均不在本 MVP**，随日后闭环纳入同一 `LlmProvider` 抽象。
- **数据边界（合规核心）**：默认使用候选模型（DeepWorks 可用候选池，默认 DeepSeek-V4-Flash，免费有限额）；企业数据默认不离开内网——候选模型无法满足时切本地 Ollama（Qwen2.5-Coder 等）。外部付费 API 不纳入 MVP。发送给模型的载荷 = chunk 源码 + `contextBundle` + prompt，**不发送**无关文件/日志/密钥。
- **保留/训练设置**：MVP 接入前逐项确认候选池各模型的「不用于训练 / ZDR」承诺与额度；不可确认的模型列入 Open Questions，不允许静默外发。
- **结构化输出**：转换绑定 JSON Schema（`outputSchema`），解析失败走自核查重试链。
- **工具权限**：LLM 本身不直接触工具；其「动作」由引擎转化为受限文件写（仅 `.xdtranc/` 边界内 `conversions/` 与 `out/`）与导出目录写入，无外部网络写；敏感数据外发走确认门。
- **延迟/成本目标**：单 chunk 转换目标分钟级以内；总流水线 2k 行项目目标分钟级闭环（估算）；成本上限（单项目 token 预算）在设置中可配，超限暂停并提示。
- **失败兜底**：API 失败/限流 → 指数退避（≥3 次）→ 切本地候选 → 明确报错人工接管；上下文超限 → 自动收缩 chunk；自核查重试超限 → 落入「不支持项/失败清单」随导出交付。
- **用户确认**：外部网络访问、敏感数据外发前必须确认（默认全部不落云）。
- **评测集（Eval Set，沉淀到 samples/evals）**：出物完整性用例（文件对齐、无空壳、lineRetentionRatio 达阈值）、跨文件依赖用例（contextBundle 完整性）、负面用例（误删业务逻辑检测）、失败路径（Provider 超限/上下文超限/鉴权失败/解析失败/导出路径非法）、全流程轨迹。
- **遥测**：事件日志、token 用量、耗时全额记录（脱敏、去标识化），不包含代码全文与密钥。

---

## 5. Security Implementation

- **身份与授权**：本地内网单用户工具，**不引入账号体系**；文件访问边界在项目根 `.xdtranc/` 内做路径校验；导出目标路径由用户显式选择并做规范化（resolve + 前缀校验）防目录穿越。
- **Electron 加固**：`contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`，渲染进程仅经 preload 白名单 IPC 访问主进程能力；不启用 `webSecurity` 放宽；外部链接用 `shell.openExternal` 且仅协议白名单。
- **密钥管理**：Provider API Key 存本机（Windows Credential Manager / Linux keyring，退化为受限权限配置文件），不写入日志、不提交仓库、不随报告与导出物带走。
- **日志脱敏**：日志不记录代码全文、不记录密钥；事件日志去标识化（见 §10）。
- **数据合规**：默认不落云；候选模型「不训练」承诺清单（Open Questions 待确认）；企业代码不用于任何训练场景。

---

## 6. Performance Optimization

- **MVP 目标（估算，非承诺）**：2k 行项目「导入 → 切分 → 转换 → 导出」分钟级闭环；以实测为准，不虚构数字。
- **异步与进度**：任务全部异步，主进程持有状态机，渲染进程订阅事件；转换按 chunk 顺序执行（受候选 Provider 并发额度约束；并行化列 P2）。
- **缓存（P2）**：转换结果缓存 key = `hash(chunk 内容 + 源语言 + 目标 SDK 版本 + prompt 版本 + provider/model)`；同项目重复转换命中缓存跳过付费与等待。
- **体验优化**：Monaco 懒加载；切分预计算一次缓存 `chunks.json`；解析增量更新（tree-sitter 增量解析潜力，MVP 先全量，P2 增量）。

---

## 7. Development Workflow

### 7.1 AI-Assisted Development Strategy（研发期）

| 阶段 | 主要工具 | 辅助 | 用途 |
|---|---|---|---|
| 架构评审 | DeepWorks（本会话） | Claude/ChatGPT（备选付费助手） | 方案复核、官方文档核对 |
| 实现 | DeepWorks / Cursor / VS Code+Copilot 视团队习惯 | — | 按本设计与 AGENTS.md 实现 |
| 调试 | DeepWorks | 官方文档 + 日志 | 流水线故障定位 |
| 测试 | DeepWorks 生成 + 团队补充 | Vitest/Playwright 自动核验 | 关键路径质量门 |
| 文档 | DeepWorks | — | PRD/设计/使用说明维护 |

> 开发助手与产品运行时 LLM 用同一候选池但**目的不同**，订阅费、API 费与第三方服务费分别核算（研究底稿明确）。

### 7.2 Git Workflow

- 单仓库 pnpm monorepo；分支模型 **Trunk-based**（内网小团队）+ 短生命周期特性分支（`feat/<name>`、`fix/<name>`）。
- Commit 约定：`type(scope): 描述`（type ∈ feat/fix/docs/chore/test/refactor）。题设新手团队不强制 Conventional 全量，**首字母类型前缀 + 中文描述**即可，保持可读。
- 评审：PR/MR 需 ≥1 人 + 引擎关键路径需过 CI 门。
- `.gitignore`：忽略 `.xdtranc/`（状态/产物/密钥/日志/导出包）、`node_modules`、`dist`、构建产物。**敏感样例库不入库**，验收库走课题内网通道。

### 7.3 Pre-Commit Hooks

- `husky + lint-staged`：提交前跑 `prettier`、`eslint` 修改文件；类型检查建议在 CI/预提交钩子中执行（引擎改动必须 `typecheck` + 相关单测通过）。

### 7.4 CI/CD Pipeline

- MVP 内网无云；若课题环境提供 GitLab CI：Linux agent 上 `pnpm install → typecheck → lint → unit test → build → (可选 e2e：用 Mock Provider 离线跑主流程)`，合并门 = typecheck + lint + unit。真实 LLM/样例库验证移至课题验收环境手动/按流程执行，不伪造「CI 即通过」。

---

## 8. Testing Strategy

### 8.1 分层与命令

| 层 | 工具 | 命令 | 覆盖 |
|---|---|---|---|
| 引擎单元 | Vitest | `pnpm --filter engine test` | 解析（快照）、切分（golden chunk）、导出 manifest/空壳检测/路径校验、Provider 适配（Mock）、状态机 |
| 前端组件 | Vitest + RTL | `pnpm --filter renderer test` | 工作台各视图、进度条、报告摘要渲染 |
| 集成（可选环境） | Vitest（integration 标记） | `pnpm --filter engine test:integration` | 真实候选/Ollama 连通性（有则跑，无则 skip 并提示） |
| CLI 冒烟 | Vitest / shell | `pnpm --filter cli test` | import/parse/chunk/convert(mock)/export 命令返回码与产物 |
| E2E | Playwright for Electron | `pnpm e2e` | 主旅程：导入→切分→转换→导出（Mock Provider）；需内网 Git 样例库 |
| 评测集 | samples/evals 脚本 | `pnpm eval` | 出物完整性、无空壳、lineRetention 阈值、负面用例、失败路径 |

### 8.2 质量门定义

- 单元 + 冒烟：PR 合并门（lint + typecheck + unit）。
- E2E + 评测集：课题验收环境手动/流程执行，输出记录版本、命令、退出码与完整性清单（可复现，研究底稿要求）。
- 类型检查：`tsc --noEmit`（strict）——新手团队 + AI 辅助下尤必要（PRD 质量标准）。
- 覆盖率目标：引擎核心（切分/exporter/Provider 适配）单测覆盖目标 ≥ 80%（估算口径），UI 以关键交互 E2E 为主。

### 8.3 Visual Verification Loop（UI 变更）

1. **Generate**：AI 生成组件；2. **Render**：`pnpm dev` 预览；3. **Inspect**：截图 + 可用性检查（功能完整、信息清晰）；4. **Refine**：回归前修正功能问题。视觉打磨不设专职环节（圈外）。

### 8.4 Self-Healing Test Pattern

Playwright（或集成）测试失败时自动归档：失败命令、退出码、诊断输出、环境版本、截图（E2E）→ 复跑至通过或人工介入。

---

## 9. Deployment & Distribution（内网）

- **形态**：electron-builder 打包 `Windows NSIS（x64）` 与 `Linux AppImage/deb`；CLI 以 `npm link` / 独立二进制发布。
- **连通性检测**：首次启动检测候选/本地 Provider 连通性，缺失或超时则明确列出选项（仍可用 Mock 演示）；**不检测 cjc/clang**（本 MVP 不含编译）。
- **配置**：`settings.json`（Provider/模型、切分预算、成本上限）可按课题环境预设为只读默认值，用户可覆盖为本地值。
- **分发**：内网制品仓库/共享盘；版本号记录于报告（可复现）。
- **无云依赖**：无需账号/托管/域名；不满足则按课题要求评估内网自托管更新通道（P2）。

---

## 10. Monitoring & Observability

- **本地日志**：结构化 JSONL（`logs/`），级别 trace/debug/info/warn/error；含**脱敏**规则：不记录源码全文、密钥、完整 Prompt（可记录 hash 与 token 计数）。
- **核心指标**：阶段耗时、token 用量、重试数、自核查失败数、Provider 调用成败（含限流/超时）、导出完整性指标（exportedFileRatio / emptyFileCount / lineRetentionRatio）。
- **遥测**：无外部遥测 SDK；如需课题统计，以「导出脱敏汇总 CSV」提供，不自动外发。
- **报告**：每次任务产出 `ConversionReport`（§2.1 契约），作为课题验收与成本控制的依据。

---

## 11. Cost Analysis

> **说明**：以下为**估算**，不是报价；一律以接入时的官方定价页/额度为准（PRD 研究底稿同样强调不编造数字）。

### 开发阶段
| 项 | 说明 | 预估 |
|---|---|---|
| AI 开发助手（DeepWorks） | 按当前账户/模型配置与额度确认 | 以实际额度为准，不虚构 |
| 桌面/工具开发环境 | Windows/Linux 内网、VS Code | 现有资源，边际 ≈ 0 |
| 方式样例库 | 公开/自建 C++ 样例库 | 自建成本，无按量费用 |

### 运行阶段（产品内 LLM）
| 场景 | 估算口径 | 预估 |
|---|---|---|
| 默认候选（DeepSeek-V4-Flash） | 免费有限额起步，单次转换 ≈ 数十万 token 级（PRD 研究量级估算） | 边际成本 ≈ 0（额度内） |
| 切其他候选模型 | 按实际用量与额度结算，设置成本上限 | 以官方定价页为准，标注估算 |
| 本地兜底（Qwen2.5-Coder 14B/32B） | 一次性硬件/算力（Q4 量化约 9–22GB 显存，研究数据，**非本课题实测**） | 无按量费用 |

### 不产生费用的项
托管、数据库、支付、第三方 SaaS、编译/测试工具链（本 MVP 不依赖）——本地工具不涉及（PRD 明确非商业产品）。

---

## 12. Risk Mitigation

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| 转换产物质量无法用编译/测试自动验证（无编译验证兜底） | 高 | 高 | 显式声明「不保证编译通过」；以出物完整性（无空壳、lineRetention、unsupported 清单）做硬指标 + 人工抽检；修复/测试闭环列日后路线图 |
| LLM 生成的仓颉带方言/语法偏差，目标 SDK 无法直接消费 | 中 | 高 | 基于官方仓颉规约的子集 prompt；出物附转换说明与部位标注；下一迭代（自动修复）即补编译验证 |
| 候选模型额度/合规承诺未确认 | 中 | 高 | 默认本地兜底可用；外部付费 API 不入 MVP；承诺清单列为 Open Questions 逐项确认 |
| 解析器对复杂 C++ 子集覆盖不足 | 中 | 中 | 限定子集 + 不支持项显式报告 + tree-sitter 增量增强；必要时按研究建议评估 Clang 兜底（P2） |
| 新手团队维护复杂 monorepo | 中 | 中 | 单一语言、契约共享、严格 lint/typecheck、AI 辅助、文档沉淀 |
| 成本超限 | 低 | 中 | 单项目 token 预算上限设置 + 报告监控 + 缓存（P2） |
| 数据合规违规（外发训练） | 低 | 高 | 默认不落云、Provider 白名单、日志脱敏、开发期评审 |

---

## 13. Migration & Scaling Path

- **Phase 1 — MVP（本设计）**：导入解析 → 切分 → LLM 转换 → 导出目录/压缩包；出物完整性验收；评测集沉淀。
- **Phase 2 — 编译/测试闭环（接圈外功能回归）**：引入 cjc 编译验证 + 自动修复（诊断→LLM 修复→HITL 确认门）、CJPM 测试验证与 C++ 基线行为对比、用户反馈修复；对应原 PRD「自动修复/测试/反馈修复」功能。
- **Phase 3 — 工程化与扩展源语言**：界面优化与可视化流程、Java/ArkTS 源语言（parser 可插拔）、多文件并行转换（worker_threads）、增量转换与缓存、SQLite 报告检索、内网分发更新通道。

---

## 14. Maintainability & Update Cadence

- 依赖稳定优先，避免无谓 churn；每月评审关键依赖（Electron、tree-sitter、monaco、React）与仓颉 SDK 版本。
- 更新本设计、`AGENTS.md`（Part 4 生成）与 CI/hook 命令随项目演进。
- 每次验收/形态变更在 Handoff Context 同步，避免后续会话丢失上下文。

---

## 15. Agent Architecture（产品内 AI 与研发 Agent）

### 15.1 产品内 Agent

- 确定性的**转换 Agent**（parse-aware，输入 chunk + `contextBundle`，输出结构化仓颉 + 自核查 + 不支持项清单）。
- **编排**：MVP 用轻量状态机（§2.3），满足一次为主、重试、进度、断点恢复；**不引入**工作流图引擎（避免过度工程）。
- **Agent 工具面**：LLM 不直接拿工具权限；全部动作经引擎受控执行（受限写 `.xdtranc/` 边界、导出目录、HTTP 到 Provider）。

### 15.2 研发阶段 Agent（Planner-Executor-Reviewer）

- **Planner**：把功能拆为任务依赖图（对齐本设计与 PRD AC）。
- **Executor**：单任务实现 + 自测（typecheck/unit）。
- **Reviewer**：对照 AC 复核编码、边界与测试。
- 与 AI 工具集成点：官方文档核对（快变 API）、本地只读 schema/route/fixture 检查（改前先看）、权限分级（读/写/销毁）、验证命令以本设计为准。

---

## 16. Documentation Requirements

- [x] 技术设计（本文档，含范围修订）
- [ ] `docs/TechDesign-XDtranC-MVP.md` 评审通过后进入 Part 4（AGENTS.md、工程脚手架）
- [ ] Part 4 产物：`AGENTS.md`、PRD/设计引用、构建/检查命令、hooks/CI 配置
- [ ] 使用说明（课题演示用）、导出报告/清单格式说明、内网部署/运行指南（PRD DoD）
- [ ] 架构决策记录（ADR）——本文档决策点落盘

---

## Open Questions（TBD，不在设计内捏造结论）

1. **MVP 技术栈已定**（Electron+TS / tree-sitter-cpp / 候选池+本地兜底）；**剩余运行时待确认**：候选池各模型的具体 model id、base URL、额度与「不训练/ZDR」承诺清单（对应 PRD 未决问题 1/6）。
2. **验收样例库数量与清单**：课题验收用几个内部公认的 C++ 样例库（本文档以「最少 1 个、出物完整性达标」起步，N 待课题确认）。
3. 仓颉 SDK 固定版本与目标仓颉语法子集（影响转换 prompt 与产物形态；具体 SDK 版本在 Phase 2 编译接入时再确认）。
4. 导出仓颉项目的结构约定（单包/多包）与压缩包内目录规范（课题按 CI 阶段需求或消费方约定）。
5. 课题结项时间线与里程碑（影响 Phase 排期；当前工期为估算）。
6. 本地兜底模型（Qwen2.5-Coder 等）在关键样例上的转换质量基线（需接入后实测）。
7. 是否需要 SQLite 升级报告检索/历史（MVP 用 JSON，P2 评估）。
8. 内网分发通道（手工拷贝 vs 自托管更新）与代码签名要求。
9. **PRD 同步**：本设计已按新 MVP 边界修订，`PRD-XDtranC-MVP.md` 原文仍描述旧范围（7 功能 + 编译/测试指标）；如需保持文档一致，PRD 需另行修订（本次未改）。

---

*Version: 1.1*
*Last Updated: 2026-10-22*
*Next Review: 技术评审后 +1 个月*
*Technical Lead: TBD，由课题负责人确认*

---

## Handoff Context
<!-- Summary for the next workflow step. Keep this block with the saved document. -->
- Stage: techdesign
- App name: XDtranC
- User level: B（developer，新手团队）
- Target platform: 桌面工作台（Electron，Windows/Linux 内网）+ 命令行（CLI 复用引擎）
- Budget: 华为企业课题标准（未指定上限；运行成本以默认候选免费有限额起步，本地兜底无按量费用；均为估算，以官方定价页为准）
- Timeline: 以课题结项要求为准（具体日期待确认；MVP 工期估算 4–6 人·周，因范围缩小修订）
- AI in product scope: yes（代码转换 Agent，流水线化，非对话式；编译修复/测试/反馈 Agent 均不在本 MVP）
- Chosen stack: Electron + React18/TS/Vite + Tailwind + monaco；Node/TS 引擎（多模块单体）；tree-sitter-cpp 解析；OpenAI-compatible Provider 抽象 + Ollama 本地兜底 + Mock；本地 JSON 持久化（无数据库）；导出用 Node 流式打包（yazl / 目录复制）；electron-builder 打包（NSIS/AppImage+deb）；Vitest + RTL + Playwright(Electron) 测试
- AI coding tool: DeepWorks（首选），备选付费编程助手视团队习惯；产品内 LLM 候选池默认 DeepSeek-V4-Flash（免费有限额）
- Constraints: MVP 仅 C++→仓颉；成功标准 = 输入 C++ 项目目录/压缩包 → 输出仓颉项目目录/压缩包；出物无空壳 + 完整性口径（exportedFileRatio / lineRetention / unsupported 清单）可量化；编译验证与测试指标（<15% / <20%）已移出；不保证产物编译通过；敏感代码不用于模型训练（默认不落云）；新手团队；桌面工作台形态；错误显式处理、不做半成品、关键路径必须测试
- Decisions: 桌面形态 Electron+TS 全栈；解析 tree-sitter-cpp；Provider 候选池+本地兜底（外部付费 API 不入 MVP）；本 MVP 不依赖 cjc/clang（编译/测试闭环移出至 Phase 2）；导出以目录+压缩包交付并出完整性清单；构建目录结构 monorepo（shared/engine/main/renderer/cli）；无数据库（JSON 工作区）；轻量状态机编排（不引入工作流图引擎）；圈外项：编译验证/自动修复/测试验证/反馈修复/界面优化/可视化流程
- Open questions: 验收样例库 N 与清单；候选模型 model id/额度/不训练承诺清单；仓颉 SDK 版本与语法子集；导出仓颉项目结构约定；课题结项时间线；本地兜底模型质量基线；SQLite 升级与否；内网分发与签名；PRD 是否需要按新边界同步修订
- Research status: Partial research（2026-10-15 定向事实核查底稿；缺口见 research-xdtranc.md「待核实清单」）
- Source files: PRD-XDtranC-MVP.md、research-xdtranc.md → docs/TechDesign-XDtranC-MVP.md（2026-10-22 范围修订版）

```json
{
  "schemaVersion": 1,
  "documentType": "techdesign",
  "appName": "XDtranC",
  "stack": {
    "frontend": "React 18 + TypeScript + Vite + Tailwind CSS + monaco-editor（Electron 渲染进程）",
    "backend": "Node.js + TypeScript（Electron 主进程 / engine / CLI，多模块单体）",
    "database": "无数据库，本地 JSON 工作区（.xdtranc/）：模型/状态/导出清单/日志/报告",
    "auth": "不涉及（本地内网单用户工具，无账号体系）",
    "styling": "Tailwind CSS（自定义工程风主题，功能优先、界面打磨圈外）",
    "deployment": "electron-builder：Windows NSIS / Linux AppImage+deb；CLI npm link；内网分发（无云托管）"
  },
  "commands": {
    "setup": "pnpm install",
    "dev": "pnpm dev",
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck",
    "lint": "pnpm -r lint",
    "build": "pnpm build && pnpm pkg"
  },
  "aiScope": "in-app AI（代码转换 Agent 流水线：导入→解析→切分→LLM 转换→导出；非对话式；默认候选池不落云，本地 Ollama 兜底）"
}
```
