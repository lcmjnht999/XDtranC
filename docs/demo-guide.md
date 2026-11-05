# 演示指南（10–15 分钟）

## 目标

让听众在 15 分钟内看到：C++ 目录/ZIP → 切分 → 转换草稿 → 完整性报告 → 导出目录/ZIP 的完整闭环，并清楚知道**哪些没有验证**。

## 演示前检查（5 分钟）

```powershell
cd C:\Users\xuhailong\Desktop\XDtranC
node packages/main/build.mjs
pnpm test
pnpm e2e
pnpm run pkg
```

- 确认 `release/win-unpacked/XDtranC.exe` 存在；
- 确认 `samples/hello` 只有 `main.cpp` 与 `include/math.hpp`；
- 关闭上一次演示留下的导出目录，导出目标必须不存在；
- 若演示 Ollama，先 `ollama serve` 并确认模型名。

## 脚本

### 1. 开场（1 分钟）

> 这是一个把 C++ 存量代码转成仓颉草稿的内网桌面工具。它不承诺编译通过，产物是**带完整性清单的草稿**，用来减少人工首轮翻译量。

明确边界：本 MVP 不做 cjc 编译验证、不做编译错误修复、不做 CJPM 行为测试。

### 2. 导入（2 分钟）

操作：点“选择目录”，选 `samples/hello`。

预期：路径显示在工具栏，文件树出现 `main.cpp`、`include/math.hpp`，每个文件标出所属 chunk。

话术：> 导入是只读的，源码 hash 会记录；导出前如果源码变了会拒绝导出旧结果。

### 3. 转换（3 分钟）

操作：转换方式保持 `Mock（模拟）`，点“开始转换”。

预期：状态从“解析中 → 切分中 → Mock 转换中 → 模拟完成”；右侧出现两份 `.cj` 草稿；摘要条显示文件 2/2、行保留率、符号覆盖、空壳判定。

话术：> Mock 是确定性离线实现，用来验证链路和结构，不代表模型能力。真实模型走本机 Ollama，不切云端。

### 4. 完整性（2 分钟）

指摘要条与“问题与失败清单”：

- `unsupported`：解析不了的结构，带文件和行号；
- `failedChunks`：schema/自核查重试后仍失败的块，带原因和重试次数；
- `unassigned`：依赖环等无法安全切分的部分。

话术：> 失败不会静默丢弃，都会进清单并随导出交付。

### 5. 导出（2 分钟）

操作：点“导出目录”，确认摘要对话框，选择新目录。

预期：状态“导出结束：complete”；目标下出现 `draft/`，内含 `src/*.cj`、`README.md`、`export-manifest.json`、`EXPORT-INCOMPLETE.json`。

强调：> 只有 `export-manifest.json` 存在且 `status=complete` 才算导出完成；`EXPORT-INCOMPLETE.json` 是开始标记。

### 6. CJPM 草稿（圈外预研，可跳过）

> 这一节**不在 MVP 范围内**（CJPM 属 Phase 2）。只有在被问到“能不能出工程结构”时才演示，不要把它讲成 MVP 能力。

操作：勾选“生成 cjpm.toml（实验）”后再导出。

预期：`manifest.layout = "cjpm"`，`draft/cjpm.toml` 首行注明“结构未经消费方确认，未用 cjc/CJPM 验证”。

话术：> 这是占位配置，等消费方给出正式模板再替换；默认导出仍是 flat，不改变既有交付。

### 7. 失败演示（2 分钟）

任选其一：

- 选一个不存在的 ZIP → 状态“失败”，错误可见，导出按钮禁用；
- 选一个已存在的导出目标 → 报“目标已存在，拒绝覆盖”，原目录不变；
- Ollama 指向不可达端口 → 失败原因可见，不自动回退 Mock。

话术：> 失败路径和成功路径一样重要，工具不会用 Mock 假装成功。

### 8. 收尾（1 分钟）

> 当前可交付的是离线可复现的转换草稿链路；真实模型需要你们提供环境后单独验收。CJPM 工程结构不在 MVP 范围，属 Phase 2。

## 截图

- `docs/images/workbench-converted.png`：转换完成后的工作台；
- `docs/images/workbench-exported.png`：导出完成后的状态（截图里勾选了圈外 CJPM 选项，仅示意扩展点，不属于 MVP 演示内容）。

## 常见提问

| 提问 | 回答 |
|---|---|
| 能保证编译通过吗？ | 不能。本 MVP 没有 cjc 验证，报告只承诺结构与完整性。 |
| 代码会发到云端吗？ | 默认不。只支持本机 Mock 与回环 Ollama；外部 Provider 未接入。 |
| 空壳怎么判断？ | `businessStubCheck` 只做结构级判断，`not-verified` 表示语义未验证，不能宣称“无空壳”。 |
| CJPM 是官方结构吗？ | 不是。是可选草稿，待消费方确认后替换模板。 |
| 中文目录名做包名怎么办？ | 派生规则会退化成 `pkg_project`，演示时显式填包名。 |

## 无 GUI 的备用演示

```powershell
pnpm export samples/hello --provider=mock --format=dir --out=.deepworks/tmp/demo-draft --cjpm --package=hello
```

输出包含 `status`、`layout`、文件数，退出码 0/2/1 分别对应完整/部分/失败。
