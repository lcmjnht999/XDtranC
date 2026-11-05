# XDtranC MVP 交接提示词

> 用途：把本仓库的完整状态交接给同事（及其 AI 助手），让接手方在性能更好的机器上完成最后一项验收并收尾。
> 生成时间：2026-11-05
> 交接前本地 HEAD：`e95daf8`（`main` 领先 `origin/main` 2 个提交，另有未提交改动，需先提交并推送）
> 仓库：`https://github.com/lcmjnht999/XDtranC.git`

---

## 0. 一句话现状

MVP 四项功能已全部实现并通过离线验收（typecheck / lint / 83 项单测 / 10 类 eval / 2 项 Electron E2E / 3 个桌面脚本）。**唯一剩余项是“真实 Ollama 模型验收”**：原开发机是 Intel UHD 620 核显 + 16 GB 内存，无独立显卡，3B 模型下载约 2 MB/s、推理过慢，因此移交到性能更好的机器执行。

CJPM 工程结构**不在 MVP 范围**，属 Phase 2，已有可选实现默认关闭，不要继续做。

---

## 1. 接手方的任务

必须完成：

1. 在目标机器安装 Ollama，拉取一个 coder 模型；
2. 用仓库自带脚本跑一次真实模型转换 + 导出；
3. 把真实结果写进 `docs/ollama-acceptance.md`；
4. 复跑全量检查，确认没有回归；
5. 由人执行 `git commit` / `git push`（见第 7 节）。

明确不要做：

- 不要实现或扩展 CJPM 工程结构、`cjpm.toml` 模板；
- 不要接 cjc 编译验证、编译错误自动修复、CJPM 测试验证；
- 不要做 UI 优化、富可视化流程；
- 不要为了“看起来完整”而补 Mock 数据或伪造验收结果。

---

## 2. 仓库、分支与环境

| 项 | 值 |
|---|---|
| 仓库 | `https://github.com/lcmjnht999/XDtranC.git`（私有） |
| 分支 | `main` |
| 工作区（原开发机） | `C:\Users\xuhailong\Desktop\XDtranC` |
| 包管理 | pnpm 10.x（monorepo） |
| Node | ≥ 20（原机 v26.13.0） |
| 平台 | Windows 10/11，PowerShell 5.1 |
| 桌面框架 | Electron + TypeScript |
| 解析器 | tree-sitter-cpp（WASM） |
| 目标语言 | 仓颉（`.cj`） |

安装依赖：

```powershell
cd <仓库目录>
pnpm install
```

---

## 3. MVP 范围（权威）

以 `docs/TechDesign-XDtranC-MVP.md` 为准，只做 4 项：

1. 项目导入与解析（目录 / ZIP）；
2. 代码切分（tree-sitter-cpp + 超预算按行缩块）；
3. LLM 转换（含 schema 校验 + 自核查回炉重试）；
4. 输入/输出工作台 + 导出（目录 / ZIP）。

验收口径是**出物完整性**：

- 无空壳：`emptyFileCount = 0`；
- `exportedFileRatio`：成功导出文件数 / 输入文件数；
- `lineRetentionRatio`：行保留比例，仅作参考；
- `unsupported` 清单：解析不了的结构必须显式登记，不许静默跳过。

**不在 MVP**：cjc 编译验证、编译错误自动修复、CJPM 测试验证、用户反馈修复、界面优化、富可视化。

因此：

- 任何“编译通过”“测试通过”的结论都不成立；
- 报告只能写“产物已导出，完整性清单如下”；
- 缺 cjc/CJPM/clang 不是环境故障，不要试图补装。

---

## 4. 已完成内容（批次 A–G）

| 批次 | 内容 |
|---|---|
| A/B/C | 脚手架、shared schema、engine 解析/切分/转换/导出的主体链路 |
| D | React + Vite + Monaco（动态 import）工作台重构，preload 白名单 IPC |
| E | Provider 健壮性：`ProviderError`、指数退避（maxRetries 2）、`Retry-After`、超预算按行缩块、`retries[]` / `splits[]` |
| F | `build` / `e2e` / `pkg` 脚本、Playwright Electron E2E、electron-builder `--dir` 打包 |
| G | 旧桌面脚本适配 React UI；演示与分发文档；CJPM 可选布局（**圈外预研，默认关闭**） |

关键实现位置：

- `packages/shared/src/outputSchema.ts`：结构化输出契约的唯一真源；
- `packages/engine/src/parser.ts`、`splitter.ts`、`converter.ts`、`exporter.ts`、`archive.ts`；
- `packages/main/src/main.ts`、`preload.cjs`：Electron 主进程与 IPC；
- `packages/renderer/src/App.tsx`：工作台；
- `packages/cli/src/export.ts`：CLI 导出。

---

## 5. 当前验收基线（原机实测，可用于回归对比）

| 检查 | 命令 | 结果 |
|---|---|---|
| 类型 | `pnpm typecheck` | 通过 |
| 静态检查 | `pnpm lint` | 通过 |
| 单测 | `pnpm test` | 13 个文件、83 项通过 |
| 评测 | `pnpm eval` | 10 类通过 |
| 构建 | `pnpm build` | 通过 |
| E2E | `pnpm e2e` | 2 项通过（开发构建 + 打包产物） |
| 打包 | `pnpm run pkg` | 产出 `release/win-unpacked/XDtranC.exe` |
| 桌面冒烟 | `node packages/main/smoke.mjs` | 通过 |
| ZIP 边界 | `node packages/main/export-boundary.mjs` | 通过 |
| Ollama 协议 fixture | `node packages/main/ollama-e2e.mjs` | 通过（离线，非真实模型） |

注意：

- `pnpm pkg` 会被 pnpm 内置命令抢占，必须用 `pnpm run pkg`；
- `pnpm e2e` 只 build 不打包，打包用例依赖先跑 `pnpm run pkg`，产物缺失时该用例会 skip；
- 单测收集配置在根 `vitest.config.ts`，`exclude` 必须保留 `**/node_modules/**`，否则 pnpm 符号链接会导致重复收集。

---

## 6. 剩余工作：真实 Ollama 验收

### 6.1 前置

目标机器建议：独立显卡显存 ≥ 8 GB，或内存 ≥ 16 GB。

选型：

| 条件 | 模型 | 大小 |
|---|---|---|
| 显存 8–10 GB | `qwen2.5-coder:7b` | 约 4.7 GB |
| 显存 ≥ 12 GB | `qwen2.5-coder:14b` | 约 9 GB |
| 仅 CPU / 低配 | `qwen2.5-coder:3b` | 约 1.9 GB |

### 6.2 安装与拉取

```powershell
ollama --version
ollama pull qwen2.5-coder:7b
ollama list
curl.exe -s http://127.0.0.1:11434/api/tags
```

判定：`ollama list` 里出现模型名，`/api/tags` 返回的 JSON 含同名条目。

### 6.3 跑验收

```powershell
cd <仓库目录>
pnpm build
node packages/main/ollama-real.mjs --model=qwen2.5-coder:7b --timeout=600000
```

参数：

- `--model`：必填，必须与 `ollama list` 完全一致；
- `--endpoint`：默认 `http://127.0.0.1:11434`，只允许回环/本机地址；
- `--timeout`：毫秒，最大可用 600000（与 UI 上限一致），CPU 推理建议拉满。

脚本会：探测服务与模型 → 启动 Electron → 走真实 UI 链路选择 `samples/hello` → 用 Ollama 转换 → 导出 → 打印 JSON 报告。

### 6.4 判定

| 退出码 | 含义 | 处理 |
|---|---|---|
| 0 | 转换 + 导出完成，`status=complete` | 通过 |
| 2 | 服务/模型不可用，或未导出/未 complete | 按报错回到 6.2 |
| 1 | 转换失败或断言不成立 | 看 `error`、`issues`、`manifest.failedChunks` |

必须确认报告里：

- `providerId = "ollama"`；
- `simulated = false`；
- `model` 与 `--model` 一致；
- `manifest.status` 为 `complete` 或 `partial`（partial 必须有明确失败原因）；
- `failedChunks` / `unsupported` 数量可解释。

### 6.5 记录

把以下内容写进 `docs/ollama-acceptance.md` 的验收记录表：

- 日期、模型名、Ollama 版本；
- 耗时（`elapsedSeconds`）；
- `status`、`exportedFileCount`；
- `failedChunks` / `unsupported` 数量与原因；
- 结论：只写“真实模型已完成一次转换与导出”，**不写编译通过**。

同时更新 `MEMORY.md` 的 `Current State` 与 `Blocked by`。

### 6.6 全量复验

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm eval
pnpm build
pnpm e2e
```

任何一项失败先修，不要带着红跑下一项。

---

## 7. Git 收尾（由人执行）

项目硬约束：**AI 助手不代跑 git 写操作**。接手方的人执行：

```powershell
cd <仓库目录>
git status --short
git add -A
git commit -m "test: 完成真实 Ollama 验收并记录结果"
git push origin main
git status -sb
```

预期：

- `git status -sb` 显示 `## main...origin/main`，没有 `ahead`；
- GitHub 上能看到本次新增/修改的文档；
- `git log --oneline -3` 与 `git log origin/main --oneline -3` 一致。

---

## 8. 硬约束（不可违反）

1. **`packages/engine` 不得 import Electron 或渲染层代码**，CLI 复用同一批服务函数。
2. **所有写盘必须过路径边界校验**：工作区写限定在项目根 `.xdtranc/` 内；导出路径 `resolve` 归一化后做前缀校验。
3. **结构化输出契约只有一个真源**：`packages/shared/src/outputSchema.ts`。
4. **不得开 `nodeIntegration`**：`contextIsolation: true` / `nodeIntegration: false` / `sandbox: true`，渲染进程只经 preload 白名单 IPC。
5. **不允许用删业务逻辑换取自核查通过**：失败要走带问题回炉重试（默认 2 次），最终失败进 `failedChunks` / `unsupported` 并显式呈现。
6. **不得宣称编译/测试通过**：本 MVP 没有 cjc 验证。
7. **默认不落云**：外部付费 API 不在 MVP；新增 Provider 前必须确认“不用于训练 / ZDR”承诺。
8. **密钥只存本机**（Windows Credential Manager / keyring），不写日志、不写报告、不随导出物带走。
9. **`.xdtranc/` 与导出包不入库**；`samples/` 只放公开或自建样例。
10. **Monaco 必须动态 import**。

---

## 9. 已知坑

| 坑 | 说明 |
|---|---|
| PowerShell 5.1 不支持 `&&` | 用 `;` 或 `if ($?) { ... }` |
| `pnpm pkg` 被内置命令抢占 | 必须 `pnpm run pkg` |
| 中文路径/输出乱码 | 读写文件显式 `-Encoding UTF8`；必要时设 `[Console]::OutputEncoding` |
| 导出目录布局 | 用户选定目录下再套 `draft/`，即 `<选择目录>/draft/export-manifest.json` |
| `.xdtranc/` 位置 | 写入**输入项目根**，ZIP 边界快照必须排除它 |
| 原生对话框阻塞脚本 | 桌面脚本必须替换 `dialog.showOpenDialog/showSaveDialog/showMessageBox` |
| Vitest 重复收集 | 根 `vitest.config.ts` 的 `exclude` 必须含 `**/node_modules/**` |
| E2E 打包用例 skip | 先 `pnpm run pkg` 生成 `release/win-unpacked/` |
| Ollama 非回环地址 | `ollama-real.mjs` 会直接拒绝，安全设计，不要改 |

---

## 10. 交付物

| 路径 | 内容 |
|---|---|
| `release/win-unpacked/XDtranC.exe` | 可运行桌面产物（不签名） |
| `docs/demo-guide.md` | 15 分钟演示脚本与话术 |
| `docs/distribution.md` | 内网分发说明 |
| `docs/ollama-acceptance.md` | Ollama 验收 runbook + 记录表（真实结果待填） |
| `docs/feature-g-cjpm.md` | CJPM 圈外预研记录（非 MVP） |
| `docs/images/*.png` | 工作台截图 |
| `export-manifest.json` | 每次导出的完整性清单（运行时生成） |

---

## 11. 接手检查清单

- [ ] `pnpm install` 成功，`pnpm typecheck` / `pnpm lint` 通过；
- [ ] `pnpm test` 83 项、`pnpm eval` 10 类、`pnpm e2e` 2 项通过；
- [ ] `pnpm run pkg` 产出 `XDtranC.exe` 且能启动；
- [ ] Ollama 服务可达，模型已拉取；
- [ ] `ollama-real.mjs` 退出码 0，报告 `simulated=false`、`providerId=ollama`；
- [ ] 结果已写入 `docs/ollama-acceptance.md`；
- [ ] `MEMORY.md` 状态已更新；
- [ ] 由人完成 commit + push，`git status -sb` 无 ahead；
- [ ] 交付说明里没有“编译通过”字样。

---

## 12. 给接手 AI 的启动指令（可直接复制）

```text
你在 XDtranC 仓库工作，这是一个把 C++ 项目转换成仓颉（.cj）草稿的 Electron + TypeScript 工具。
MVP 范围只有四项：导入解析、代码切分、LLM 转换（含自核查）、工作台与导出。
CJPM、cjc 编译验证、自动修复、UI 优化都不在 MVP，不要做。

当前唯一剩余工作是真实 Ollama 验收：
1. 确认 ollama list 有 qwen2.5-coder 模型；
2. 跑 pnpm build；
3. 跑 node packages/main/ollama-real.mjs --model=<模型名> --timeout=600000；
4. 退出码 0 且 manifest.simulated=false、providerId=ollama 才算通过；
5. 把结果写进 docs/ollama-acceptance.md，再跑全量检查。

硬约束：不得宣称编译通过；不得删逻辑换自核查通过；不得代跑 git 写操作；
引擎不得依赖 Electron；写盘必须过路径边界校验。
先读 AGENTS.md、MEMORY.md、docs/handoff-prompt-2026-11-05.md。
```
