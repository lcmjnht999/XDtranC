# 批次 B 交接：完整性口径

日期：2026-11-03

## 目标

把“产物完整”从文件数/行数比值升级为可判定的符号级覆盖，并让 `businessStubCheck` 不再固定为 `not-verified`。

用户确认的口径：**严格符号级覆盖**。

## 改动

| 文件 | 内容 |
|---|---|
| `packages/engine/src/coverage.ts`（新增） | `analyzeCoverage`、`extractCangjieSymbols`、`normalizeSymbol` |
| `packages/engine/src/coverage.test.ts`（新增） | 7 项用例：归一化、缺口、登记、空壳、提取 |
| `packages/engine/src/exporter.ts` | manifest 增加 `businessStubCheck`、`coverage`、`lineRetentionTooLow` |
| `packages/engine/eval.ts` | 评测扩到 10 类：新增 `todo`、`header-only`、`drop-file`、`low-retention`，并断言空壳判定 |

未改 `outputSchema` 契约，未加依赖。

## 判定规则

### 符号提取

- 源侧：`model.symbols` 中 `function_definition` / `class_specifier` / `struct_specifier`。
- 输出侧：正则识别 `func` / `class` / `struct` / `interface` / `enum` / `extend` / `type` 声明，以及顶层可调用 `name(...) {`。
- 归一化：去参数、去作用域 `::`、去模板、去 `_`、统一小写。例如 `Calculator::get_value(int x)` 与 `func getValue` 都归一为 `getvalue`。

### 判定

1. 每个源业务符号必须在输出中找到同名符号（mapped）。
2. 找不到时，允许通过 `unsupported` 显式登记：同文件且（`line` 为 null 或行号相同或 reason 含符号名）。
3. 两者都没有 → `coverage.gaps`，`coverage.status = partial`。
4. 输出文件为空、去注释后为空、或没有任何可识别声明 → 进入 `emptyFiles` / `stubFiles`。
5. `lineRetentionTooLow = outputLines / inputLines < 0.1`（仅在有输入输出行时判定）。

### businessStubCheck

```
records.length === 0                                            → failed
coverage.status !== complete                                    → failed
lineRetentionTooLow                                             → failed
report.failedChunks.length > 0                                  → failed
否则                                                             → passed
```

即：**没有产出一律失败；有 chunk 失败也不通过**，避免“丢弃一个源文件”被误判为完整。

## manifest 新增字段

```json
{
  "businessStubCheck": "passed | failed",
  "lineRetentionTooLow": false,
  "coverage": {
    "status": "complete | partial",
    "checkedSymbols": 3,
    "mappedSymbols": 3,
    "declaredUnsupported": 0,
    "gaps": [],
    "emptyFiles": [],
    "stubFiles": []
  }
}
```

原有 `exportedFileRatio`、`lineRetentionRatio`、`emptyFileCount` 保留，仅作参考。

## 评测结果

`pnpm eval` 共 10 类，全部符合预期：

| 用例 | 导出文件 | 转换状态 | 导出状态 | 空壳判定 |
|---|---|---|---|---|
| normal | 2 | complete | complete | passed |
| empty | 0 | partial | failed | failed |
| comments | 0 | partial | failed | failed |
| partial | 1 | partial | partial | failed |
| self-check-exhausted | 0 | partial | failed | failed |
| unsupported | 0 | partial | failed | failed |
| todo | 0 | partial | failed | failed |
| header-only | 1 | partial | partial | failed |
| drop-file | 1 | partial | partial | failed |
| low-retention | 1 | complete | complete | failed |

真实样例 `samples/hello`（Mock）：

```json
{ "status": "complete", "businessStubCheck": "passed", "checkedSymbols": 3, "mappedSymbols": 3, "gaps": 0, "stubFiles": 0, "lineRetentionRatio": 1.5 }
```

自动检查：typecheck / lint 通过，**68/68** Vitest 通过（原 61 + 新增 7）。

## 已知限制

- 输出侧是正则识别，不是仓颉语法解析；复杂泛型、宏或生成代码可能漏识别。
- `normalizeSymbol` 会丢失 `operator+` / `operator-` 的符号差异，极端情况下可能误配。
- `unsupported` 的文件级登记（line=null）视为已声明，无法区分“认真评估过”与“整文件偷懒”。
- 语义保留、业务正确性仍为未验证；本批次只回答“有没有空壳”。

## 回滚

还原 `exporter.ts`、`eval.ts`，删除 `coverage.ts` 与 `coverage.test.ts`；manifest 回到 `businessStubCheck: not-verified`。
