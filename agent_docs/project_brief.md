# Project Brief

## Product

- One-line vision: 把 C++ 项目目录/压缩包转换成仓颉项目目录/压缩包，让迁移工程师不必逐文件手工重写。
- Target users: 华为内部承担存量迁移任务的开发者/迁移工程师（熟悉 C++，不熟悉仓颉）；次要角色是课题评审者。
- Primary user outcome: 选一个 C++ 项目 → 看到切分与转换进度 → 拿到一份无空壳、带完整性清单的仓颉项目产物（目录或压缩包），并知道哪些源位置没被覆盖。

## Scope

- Must ship:
  - 项目导入与解析（目录/压缩包，tree-sitter-cpp，产出 ProjectModel 与依赖边）
  - 代码切分（依赖图 + 上下文预算，带 `contextBundle`）
  - LLM 转换（C++ → 仓颉，结构化输出 + 自核查重试，失败显式上报）
  - 输入/输出工作台（最小可用单页）+ 导出（目录 / zip）+ `export-manifest.json` 完整性清单
  - 随上述交付：Provider 候选池 + 本地 Ollama 兜底 + Mock Provider，最小转换报告
- Not in v1:
  - cjc 编译验证、编译错误自动修复、CJPM 测试验证、C++ 基线行为对比
  - 用户反馈修复（用户标注位置 → 重新生成）
  - 界面打磨与富可视化流程
  - Java / ArkTS 源语言、反向迁移（仓颉 → 其他语言）、完整 IDE 插件、商业化

## Principles

- 先跑通用户故事，再做打磨；界面只需清晰可用。
- 产品不承诺"产物可编译"。本 MVP 的硬指标是出物完整性：无空壳、`exportedFileRatio`、`lineRetentionRatio`、`unsupported` 清单。
- 失败必须显式：解析不了、转换不了、自核查不过的项都要带源位置进清单，绝不静默丢弃。
- 选无聊、可维护的技术：单一语言、JSON 持久化、无数据库、无 HTTP 服务。
- 默认不落云；企业代码不进入任何训练场景。
- 文档保持短且同步；范围以 Tech Design 为准。

## AI Position

- AI is used for: 把 C++ chunk 转成仓颉代码草稿、自核查、产出不支持项说明。
- AI is not used for: 直接持有文件/网络工具权限、决定写盘路径、编造编译或测试结论（本 MVP 根本没有编译验证）。
- Human approval required for: 外部网络外发、切换到合规承诺未确认的 Provider、覆盖已存在的导出目录。
