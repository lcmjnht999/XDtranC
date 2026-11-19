# Ollama 验收

## 现状（2026-11-05 本机准备检查）

- 协议层离线验收：**已完成**。`packages/main/ollama-e2e.mjs` 用本地 HTTP fixture 模拟 `/api/chat`，覆盖成功、自核查重试、请求中取消、取消后恢复，并校验导出文件内容与 hash。
- 真实模型实验：**已执行，转换质量未通过**。本机已调用 qwen2.5-coder 1.5b / 3b / 7b。三轮 prompt 加固后，单函数能稳定产出合法仓颉声明；跨文件的“仅声明头文件”块仍被三个模型压平成普通函数。详见下方“2026-11-05 真实模型实验结果”。

不要把离线 fixture 的结果写成“真实模型通过”。

## 一、离线 fixture（可随时复现，不需要模型）

```powershell
node packages/main/build.mjs
node packages/main/ollama-e2e.mjs
```

预期最后一行：

```text
通过：Ollama协议离线成功、导出文件/hash/来源一致、自核查重试、请求中取消、取消后恢复。没有真实模型调用。
```

覆盖点：

- 请求体只能发到 `/api/chat`，模型名必须与 UI 填写一致；
- 成功路径：导出目录可读，`manifest.providerId = "ollama"`、`simulated = false`；
- 自核查失败后带问题重试一次，请求数翻倍；
- 请求挂起时点“取消”能中止 fetch，状态变为“已取消”，导出按钮禁用；
- 取消后再次转换不受污染。

## 二、真实模型验收（模型选择及下载须另行确认）

### 1. 检查安装与服务

```powershell
ollama --version
ollama list
```

本机目前无需重复安装或启动。其他机器仅在未安装时安装 Ollama；已安装但服务未运行时才执行 `ollama serve`，不要重复启动。

### 2. 确认模型后再下载

```powershell
# 仅在明确批准模型及下载后执行；替换为确认的实际模型名
ollama pull <已确认的模型名>
ollama list
```

本机约 16 GB 内存，准备检查时可用约 5.2 GB，仅检测到 Intel 核显。不默认推荐或下载 14B 模型；先确认资源需求、许可及项目要求，再选择模型。可用内存会随运行程序变化。

`ollama list` 输出的模型名必须与 UI“已安装模型”完全一致，不会自动补 tag。

### 3. 确认服务

```powershell
curl.exe -s http://127.0.0.1:11434/api/tags
```

应返回 JSON 且包含刚拉取的模型。非回环地址会被应用直接拒绝，这是设计约束。

### 4. 桌面验收

```powershell
corepack.cmd pnpm dev
```

操作：

1. 选择目录 → `samples/hello`
2. 转换方式 → `Ollama（本机）`
3. 已安装模型 → 填写 `ollama list` 中已确认使用的实际模型名
4. 地址保持 `http://127.0.0.1:11434`
5. 开始转换，等待状态变为“模型草稿完成（未验证编译）”或“部分完成，请检查问题”
6. 导出目录，检查 `draft/export-manifest.json`

验收判定：

| 项 | 通过标准 |
|---|---|
| 连通性 | 无 `回环` / `ECONNREFUSED` / 超时错误 |
| schema | 无 `schema` 解析失败；失败块应有明确原因 |
| 来源 | `manifest.providerId = "ollama"`、`simulated = false`、`model` 与所选一致 |
| 完整性 | `exportedFileCount` 与导出文件数一致，`failedChunks` 有原因 |
| 不宣称编译 | 界面与 README 均写“未验证编译” |

### 5. 自动验收脚本（仅在模型调用已获批准后执行）

先执行 `corepack.cmd pnpm build`，再运行：

```powershell
node packages/main/ollama-real.mjs --model=<已安装且获准使用的模型名> --timeout=600000
# 指定其他输入目录（默认 samples/hello）
node packages/main/ollama-real.mjs --model=<模型名> --input=.deepworks/tmp/<样例目录> --timeout=600000
```

`--input` 只接受已存在的目录或 ZIP；报告里的 `input` 会回显实际路径。同一目录若存在未完成任务会续跑，已完成任务不会阻止再次调用模型。

`--timeout` 同时填入界面的请求超时；脚本等待转换终态的上限为该值加 60000 毫秒。已修正 `waitForFunction` 的选项参数位置，避免这里误用默认 30 秒等待。该上限不是所有代码块及重试的总耗时保证，超时不等于模型质量不合格。其他界面操作仍使用默认等待时间。脚本结果只表示草稿导出情况，不代表编译或业务语义通过。

退出码 0 的条件已收紧：`manifest.status=complete` 且 `businessStubCheck=passed` 且 `coverage.status=complete` 且 `lineRetentionTooLow=false` 且 `exportedFileCount>0`。因此“导出成功但覆盖不全”会返回 2，而不是 0。

### 6. 记录结果

把实际模型名、耗时、`manifest.status`、`failedChunks`/`unsupported` 数量写回本文件“验收记录”，不要只写“通过”。

## 验收记录

| 日期 | 模型 | 状态 | 失败块 | 备注 |
|---|---|---|---|---|
| 2026-11-05 | qwen2.5-coder:1.5b | 未通过 | 2 | 跨文件样例 `samples/hello` 的声明块连续 3 次输出非法路径/残留 C++ 语法；见下方实验记录 |
| 2026-11-05 | qwen2.5-coder:3b | 未通过 | 0 | 语法规范但结构语义错：丢掉 `struct Calculator`、方法改名 `Calculator_add`；coverage 判 partial |
| 2026-11-05 | qwen2.5-coder:7b | 未通过 | 1 | 声明块仍丢 struct；`main.cpp` 连续 3 次自核查失败“存在不支持的引用”，未编造 |
| 2026-11-05 | — | 未执行 | — | Ollama 已安装且服务运行，无已安装模型；未调用模型（准备阶段历史） |

## 2026-11-05 真实模型实验结果（qwen2.5-coder 1.5b / 3b / 7b）

环境：Windows 10 22H2、16 GB 内存、Intel 核显；Ollama 0.40.14。全部请求只发往 `http://127.0.0.1:11434/api/chat`，`temperature=0`。1.5b（986 MB）先已安装；3b（1.9 GB）经批准后下载；7b（4.7 GB）在本机已存在，未额外下载。

三次 prompt 迭代（每次都实际调用模型）：

| 版本 | 变更 | 结果 |
|---|---|---|
| v2 | 明确 JSON 顶层结构与字段类型、先声明后使用的语法规则、`int32_t → Int32`、禁止保留 `#include/#pragma/std::`、禁止编造实现 | 简单单函数能从 `int`/`int32_t` 改成 `Int32`，但声明仍是 `(Int32 a, ...) -> Int32`；跨文件块产出伪声明，`businessStubCheck=failed` |
| v3 | 增加“禁止写成 (类型 参数名) 或 -> 返回类型”与一行语法模板 `func 示例名(a: Int32, b: Int32): Int32 { ... }` | 单函数 `int32_t add` 首次产出合法声明 `func add(a: Int32, b: Int32): Int32`；但 `samples/hello` 的声明块仍不稳定 |

实际运行：

| 模型 | 输入 | 退出码 | 耗时 | 完整性 | 人工审查 |
|---|---|---|---|---|---|
| 1.5b | `int32_t add`（v3） | 0 | 6 秒 | complete / coverage complete / stub passed | 声明语法正确，未编译验证 |
| 1.5b | 普通 `int add`（v2） | 0 | 5 秒 | complete | 类型改为 `Int32`，声明仍是 `->` 箭头，不合格 |
| 1.5b | `samples/hello`（v2） | 2 | 16 秒 | complete 但 stub failed / coverage partial | `main.cj` 伪声明、`math.hpp.cj` 残留 `#pragma once` 与 C++ struct |
| 1.5b | `samples/hello`（v3） | 2 | 16 秒 | failed，2 个失败块 | 声明块 3 次输出非法路径或残留 C++，依赖块随之失败 |
| 3b | `int32_t add`（v3） | 0 | 10 秒 | complete / coverage complete / stub passed | `func add(a: Int32, b: Int32): Int32`，未编译验证 |
| 3b | `samples/hello`（v3） | 2 | 30 秒 | complete 导出但 stub failed / coverage partial | 语法规范，但把 `struct Calculator` 压平成 `func Calculator_add`，`main.cj` 引用未声明的 `Calculator` |
| 7b | `samples/hello`（v3） | 2 | 98 秒 | partial，1 个失败块 | 声明块仍把 struct 压平成单独函数；`main.cpp` 连续 3 次自核查失败“存在不支持的引用”，未编造实现 |

补充观测：1.5b 对同一 `include/math.hpp` 请求重放 3 次，输出路径在 `include/math.hpp.cj` 与 `include/math.hpp` 之间漂移，且多次保留 `#pragma once`；3b/7b 稳定输出 `.cj` 路径，但都会把“仅声明”的头文件压平成普通函数。

结论：

- 真实 Ollama 链路、协议、导出与完整性门槛均已实际跑通，报告均为 `providerId=ollama`、`simulated=false`，模型名与命令行一致；
- 三个模型都**未通过**严格验收（`status=complete` + coverage complete + stub passed）：单函数可以合格，跨文件样例不行；
- 7b 的行为最符合设计意图：无法可靠转换时自核查失败并显式登记 `unsupported`，而不是产出看似合法的错误代码；1.5b/3b 则会给出“语法像仓颉但结构错误”的产物，必须靠 coverage 兜底；
- 根因假设：`samples/hello` 的 `include/math.hpp` 只有声明、没有实现，被切成独立 chunk；模型需要保留 `struct` 声明或登记 unsupported，但三者都选择压平成函数。这是“仅声明 chunk”的结构性问题，不是继续加 prompt 措辞能稳定解决的；
- 产品层面可选的处理（需要另行决策）：把仅声明的头文件块并入依赖方 chunk，或在切分阶段直接登记 `unsupported` 而不调用模型；
- 没有执行编译验证，不能推断语法正确的样例可编译；完整性门槛拦不住所有语言错误（见负面案例）。

## 失败时的排查顺序

1. `ECONNREFUSED` → `ollama serve` 没起，或端口不是 11434；
2. `404 model not found` → 模型名与 `ollama list` 不一致；
3. 429 / 5xx → 应用会自动退避重试 2 次（尊重 `Retry-After`），仍失败会进 `failedChunks`，原因带“已重试 N 次”；
4. 长时间无响应 → 检查“超时毫秒”，默认 120000；
5. 输出 schema 解析失败 → 属模型输出问题，会带问题回炉重试，最多 2 次，最终失败进失败清单，不会静默丢弃。


## 完整性与语言正确性的边界

自动脚本退出码 0 仅表示流程及当前完整性门槛通过，不能解释为仓颉语法、编译或业务语义通过。报告 assessment 显式标记这三项为 not-verified；没有新增编译验证。manifest 摘要展示 businessStubCheck、coverageStatus、lineRetentionTooLow。

已核对并保存八份真实输出到 [负面案例](ollama-negative-cases.json)。这些是人工审查案例，不是已实现的语法检测器，也不是期望生成的正确答案。它们证明完整性门槛可能接受语言错误，也可能拦下模型输出。

2026-11-05 对照：单文件普通 int（10 秒）、定宽 int32_t（5 秒）、补充类型映射（5 秒）均曾返回完整性退出码 0，但人工审查分别发现类型名和函数声明格式错误。加入语法模板后，`int32_t add` 的声明格式已正确，但 `samples/hello` 的跨文件块仍失败。没有执行编译验证。
