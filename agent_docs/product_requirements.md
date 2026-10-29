# Product Requirements

这是 PRD 的简短构建版，范围已对齐 `docs/TechDesign-XDtranC-MVP.md`（2026-10-22 修订）。与 PRD 原文冲突时以 Tech Design 为准。

## Users

- Primary user: 华为内部迁移开发者/迁移工程师，熟悉 C++、不熟悉仓颉，单用户本地使用。
- Main problem: 存量 C++ 项目手工迁移到仓颉工作量大、易出错；直接整库喂给大模型会超上下文且产物不可控。

## Must-Have Features

- **项目导入与解析** — 可导入 C++ 目录/压缩包，产出文件、声明、`#include` 与符号依赖；解析失败的文件带源位置登记到 `unsupported.json`，不静默跳过。
- **代码切分** — 切分结果在 `chunkBudgetTokens` 预算内；每个 chunk 带 `contextBundle`（跨 chunk 的声明/签名摘要）；进度可见、可中断。
- **LLM 转换（含自核查）** — 输出符合 `outputSchema`（`outputs` / `unsupported` / `selfCheck` / `explanation` / `confidence`）；自核查失败或 schema 解析失败自动回炉重试（默认 2 次）；最终失败进 `failedChunks` 并显式呈现；Provider 可切换（候选池 / 本地 Ollama / Mock）。
- **输入/输出工作台 + 导出** — 单页串行「导入 → 切分 → 转换 → 导出」，基础进度条与阶段状态；产物文件树 + 只读预览；导出目录或 zip，并写 `export-manifest.json`（`exportedFiles` / `unsupported` / `emptyFileCount` / `lineRetentionRatio` / `exportedFileRatio`）。

## 验收口径（替代 PRD 的编译/测试指标）

- 空壳文件数 = 0（`emptyFileCount` 可统计且为 0）。
- `exportedFileRatio`、`lineRetentionRatio` 在报告中可量化；`lineRetentionRatio` 仅作语义保留参考，需人工复核。
- `unsupported` 清单完整，含源路径与行号。
- 不声称"编译通过""测试通过"——本 MVP 无编译验证。

## Nice-To-Have（P1/P2，不在本 MVP 交付）

- 转换报告：token 用量、轮次、失败 chunk 列表、完整性指标。
- 断点续转 / 缓存（key = chunk 内容 + 目标 SDK + prompt 版本 + provider/model）。
- 多文件并行转换、静态分析增强。

## Out Of Scope

- cjc 编译验证、编译错误自动修复、CJPM 测试验证、C++ 基线行为对比。
- 用户反馈修复（标注位置重新生成）。
- 界面优化与富可视化流程。
- Java / ArkTS 源语言、反向迁移、完整 IDE 插件 / 独立 CLI 产品化、商业化与定价。
- 账号体系、多租户、数据库、HTTP 后端、云托管。

## Success Signals

- 至少 1 个公开/自建 C++ 样例项目完成「导入 → 切分 → 转换 → 导出」全流程，产物无空壳。
- 报告能明确回答：导出了多少文件、保留了多少行、哪些源位置没覆盖。
- 主旅程能用 Mock Provider 离线复现（E2E / 评测集），结果可重复。
- 敏感代码全程不离开本地/内网边界，日志与导出物不含密钥。
