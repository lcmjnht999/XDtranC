# 批次 E：Provider 健壮性

范围：只做本地可验证部分，不接外部云 Provider，不做真实 Ollama 验收。

## 1. 统一契约

`packages/engine/src/provider.ts`

- `LlmProvider` 仍是唯一接口，Mock 与 Ollama 共用；新增可选 `ConversionRequest.fragment`，仅在超长文件缩块时出现。
- `ProviderError(kind, message, retryable, retryAfterMs)` 是唯一可重试判据：
  - `rate-limit`（429）、`timeout`（408/504/自身超时）、`server`（5xx）、`network`：可重试。
  - `http`（404 等 4xx）、`invalid-response`（JSON/结构/超限）：不重试，重试没有意义。
- 普通 `Error` 不重试，保持既有一次性失败语义。

## 2. 退避重试

`packages/engine/src/converter.ts`

- 默认 `maxRetries=2`（最多 3 次调用）、`baseDelayMs=500`、`maxDelayMs=8000`，指数退避。
- 429 的 `Retry-After` 会参与延迟（下限取指数退避，上限 30s），不会无限等待。
- `sleepWithSignal` 在等待期间响应 `AbortSignal`，取消立即以 `AbortError` 结束。
- Provider 重试与既有“schema/自核查问题回炉（最多 3 次）”是两条独立路径，互不消耗次数。
- 测试可注入 `sleep`，避免真实等待。

## 3. 超长 chunk 缩块

- `chunker.ts`：单文件（含上下文）超预算不再直接 `unassigned`，改为 `overBudget: true` 的 chunk，`ChunkResult.status='partial'`。
- 依赖环仍整体不拆；环超预算继续 `unassigned`，符合 TechDesign“不强拆环”。
- `converter.ts`：对 `overBudget` 或 `estTokens > budgetTokens` 的 chunk：
  - 单文件按行切分，单片字节数 ≤ `budget - context - 256`；
  - 每片独立走完整回炉 + 重试流程，输出合并；
  - 单行超预算、预算装不下上下文、多文件块 → 不拆，直接进 `failedChunks`。
- 分片失败会回滚已加入的跨块输出路径，避免污染后续 chunk。

## 4. 可观测

`ConversionReport` 新增：

- `retries[]`：`chunkId / attempt / delayMs / kind / reason`。
- `splits[]`：`chunkId / parts / reason`。
- `results[]` 与 `failedChunks[]` 新增 `providerRetries`；失败原因追加“（已重试 N 次）”。

CLI `--json` 与 `export-manifest.json` 会自然带出这些字段。

## 5. 验证

- `pnpm typecheck`、`pnpm lint` 通过。
- `pnpm test`：13 文件 80 项通过（新增 `provider-robustness.test.ts` 6 项）。
- `pnpm eval`：10 类全部通过。
- 新增模拟用例：429 两次后成功、429 耗尽进失败清单、504 可重试 / 404 不重试、超长 chunk 缩块成功、单行超预算无法缩块、退避等待中取消。

## 6. 已知限制

- 分片按 UTF-8 字节与行边界切，不保证语义边界；跨片符号/类型可能需要模型结合 contextBundle 自行处理。
- 缩块后同一源文件的多个分片若输出同名 `.cj`，按跨块路径冲突失败，不会自动改名。
- 仍无真实模型验收；`simulated=false` 只表示走 Ollama 协议，不代表转换质量。
