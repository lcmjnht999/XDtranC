# 批次 A 交接：持久化与恢复

日期：2026-11-03

## 目标

把只在内存里的任务状态落到 `<项目根>/.xdtranc/`，做到进程中断后重新运行可以续跑，而不是从头再来。

## 改动

| 文件 | 内容 |
|---|---|
| `packages/engine/src/workspace.ts`（新增） | `Workspace` 类：打开/校验、路径边界、原子写、JSONL 追加、checkpoint、恢复扫描、conversion 读写 |
| `packages/engine/src/workspace.test.ts`（新增） | 10 项用例，覆盖越界、链接、原子写、恢复、续跑、落盘失败 |
| `packages/engine/src/converter.ts` | 新增 `ConversionHooks`、`PersistenceError`、`resume` 参数；每个 chunk 成功/失败后回调 |
| `packages/main/src/main.ts` | 解析后建立工作区；逐块写 checkpoint 与事件；重启时按输入指纹寻找未完成任务并续跑；导出成功后标记 `exported` |

未改 UI、未加依赖、未改 `outputSchema` 契约。

## 目录结构

```
<项目根>/.xdtranc/
├── model/project.json
├── model/chunks.json
├── model/unsupported.json
├── state/<taskId>/task.json
├── state/<taskId>/conversions/chunk-0001.json ...
├── state/<taskId>/events.log.jsonl
└── reports/<taskId>/report.json
```

- 目标是容器目录，导出产物仍落在 `<目标>/draft/`。
- `.xdtranc/` 已在 `.gitignore` 中，不进版本库。
- 解析阶段 `ignored` 包含 `.xdtranc`，不会把自己扫进输入。

## 恢复语义

1. 输入指纹 = 所有源文件 `[path, sha256]` 排序后的 SHA-256（`fingerprint`）。
2. 只有指纹相同、且 `budgetTokens == 4096` 的未完成任务才会被续跑。
3. 已完成的 chunk 从 `conversions/*.json` 重新校验 schema 后复用；损坏或校验失败视为未完成，重新调用 Provider。
4. 状态机：`imported → chunked → converting → converted → exported`；异常路径为 `failed` / `cancelled`。
5. 落盘失败抛 `PersistenceError`，直接中断转换，不会被当成“某个 chunk 转换失败”后重试。

## 边界与降级

- 所有写入路径 `resolve` 后必须位于工作区内，越界立即拒绝。
- 工作区路径上出现符号链接一律拒绝（含 `link/escape.json` 这类祖先链接）。
- `.xdtranc` 已存在但不是目录、或其本身是链接时拒绝打开。
- 输入目录不可写时降级到 `app.getPath('userData')/workspaces/<hash>`，并在状态栏提示实际位置。
- 单个损坏的 `task.json` 不阻塞其他任务扫描，现场保留不删除。

## 验证

自动：

```powershell
pnpm.cmd typecheck
pnpm.cmd lint
pnpm.cmd test
```

结果：typecheck/lint 通过，**61/61** 测试通过（原 51 + 新增 10）。

端到端（`.deepworks/tmp/resume-check.ts`，对 `samples/hello` 的临时副本）：

```json
{ "phase": 1, "action": "simulated-crash", "savedChunks": 1, "totalChunks": 2 }
{
  "totalChunks": 2,
  "resumedFromDisk": 1,
  "providerCalls": 1,
  "status": "complete",
  "results": 2,
  "checkpointStage": "converted",
  "checkpointCompleted": 2
}
```

含义：第 1 块落盘后进程直接退出；第二阶段重新打开工作区，从磁盘恢复 1 块，只对剩余 1 块调用 Provider，最终完成。

落盘结构同时确认存在：`model/project.json`、`model/chunks.json`、`model/unsupported.json`、`state/<taskId>/task.json`、`conversions/chunk-0001.json`、`chunk-0002.json`、`events.log.jsonl`。

## 已知限制

- UI 目前没有“未完成任务列表”入口，靠重选同一输入后自动续跑；可视化留给批次 C。
- ZIP 输入的工作区位于解压任务目录下，属于设计外推，已在本文记录。
- 报告写盘在转换完成后一次完成；中途崩溃时 `reports/` 可能不存在，但 checkpoint 与 conversions 足以续跑。
- 本批未跑 Electron 手工全流程（转换中手动关窗再重开），端到端用脚本等价验证；批次 C 做 UI 时补一次人工旅程。

## 回滚

- 代码回滚：还原 `converter.ts`、`main.ts`，删除 `workspace.ts` 与 `workspace.test.ts`。
- 数据：删除项目根 `.xdtranc/` 即可回到无状态行为；不会影响源文件。
