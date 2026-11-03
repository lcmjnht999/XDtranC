# 批次 C：工作台能力

日期：2026-11-03

## 目标

在现有无框架 HTML 工作台上补齐三项能力，不引入 React/Monaco：

1. 输入文件树（文件 → chunk 归属 → 失败/不支持标记 → 输出文件）
2. 粘贴临时项目（无需先在磁盘准备目录）
3. 导出前完整性摘要与确认

## 改动

### `packages/main/src/main.ts`

- 新增 `buildSummary(model, report)`：把覆盖分析、输出文件数、输出行数、行保留率、空壳终判汇总为一个结构。
  - 转换结束时存一份到 `lastSummary` 供界面即时展示。
  - 导出时用 `lastSummary ?? buildSummary(...)` 实时兜底，避免内存状态丢失后跳过确认。
- 新增 IPC `project:paste`：
  - 入参 `{ path, code }`，只接受单文件；文件名必须匹配 `^[A-Za-z0-9][A-Za-z0-9._-]*\.(h|hpp|cpp|cc|cxx)$` 且不含 `..`。
  - 内容非空、UTF-8 字节数 ≤ 512 KB。
  - 在 `scratchRoot()` 下 `mkdtemp('paste-')`，写入 `source/<name>`，把该目录设为当前输入。
- `project:run` 返回值新增：
  - `files`：每个输入文件的 `path` / `lines` / `chunkId` / `failed` / `unsupported` / `outputs`
  - `summary`：与导出确认同一份结构
- `project:export` 顺序调整：**先**弹「完整性摘要」确认框，用户点“继续导出”后才弹保存对话框并校验目标。原来确认在保存对话框之后，用户取消保存就看不到确认。

### `packages/engine/src/coverage.ts` / `exporter.ts`

- 新增 `businessStubStatus({ coverage, exportedFiles, failedChunks, lineRetention })`，把空壳终判抽成单一函数。
- `exporter.ts` 改用该函数，判定口径不变：无产物、覆盖不完整、行保留率 <10%、存在失败 chunk，任一命中即 `failed`。

### `packages/main/src/preload.cjs`

- 白名单新增 `paste(payload)`，仍然只暴露 `invoke`，不放开 `nodeIntegration`。

### `packages/renderer/index.html`

- 工具栏新增「粘贴临时项目」按钮与面板（文件名 + textarea + 使用）。
- 新增输入文件树：每个条目显示 `path [chunkId] · 失败 · 不支持 → 输出路径`，点击显示源码。
- 新增摘要条：文件数、行保留率、符号覆盖、空壳判定、失败块/不支持/未分配。
- 所有动态文本使用 `textContent`，不拼 `innerHTML`，CSP 保持不变。

## 行为

- 粘贴项目与选择目录等价，后续流程完全复用；临时目录位于 `.deepworks/tmp/paste-*`，不写入用户目录。
- 导出前摘要与导出清单使用同一个判定函数，不会出现“界面显示通过、清单写 failed”。
- 取消导出（摘要确认或保存对话框）不写任何文件。

## 验证

```
typecheck  exit=0
lint       exit=0
Test Files 10 passed
eval       10 类全部 passed（normal / empty / comments / partial /
           self-check-exhausted / unsupported / todo / header-only /
           drop-file / low-retention）
```

手工验收（2026-11-03，用户执行）：

1. 粘贴 `pasted.cpp` → 转换（Mock）→ 摘要区出现数字
2. 左侧文件树显示 chunk 归属，点击可看源码
3. 点「导出目录」→ 立刻弹出「完整性摘要」→ 继续导出 → 选择目标 → 产物写入 `<目标>\draft\`

## 已知限制

- `project:paste` 一次只接受一个文件；多文件仍需走目录/ZIP。
- 输入预览仍受原有上限约束（最多 20 个文件、每个 20,000 字符），超出部分不显示但参与转换。
- 文件树只表达 chunk 归属，不表达 include 依赖边。
- 摘要中的符号覆盖仍是输出侧正则识别，不是仓颉语法解析。
- 未新增依赖、未调用真实模型、未执行 Git 写操作。
