## 深度研究报告：XDtranC（跨语言项目级源码转换工具）

**Research status: Partial research** —— 基于 2026-10-15 三要点定向事实核查（仓颉生态 / 大模型 API 型号与定价 / 最新论文与开源工具）。已核实要点均附来源 URL 与访问日期；未覆盖或无法核实项见文末「待核实清单」。价格、版本、功能以官方页面为准，易变信息建议发布前复核。

> 本报告由「定向事实核查提示词」在带联网搜索的 AI 工具中运行产生（核查日期 2026-10-15），并整理为本课题 findings 底稿。可靠性标注沿用核查结果：官方 / 官方+百科 / 社区确认 / 未获取。

---

## 执行摘要

1. **仓颉生态已就绪，且有直接竞品/借鉴对象**：仓颉 1.0.0 LTS 已于 2025 年 7 月正式发布并开源（Apache 2.0），官方工具链（cjc 编译器、CJPM 包管理、VSCode/DevEco 插件）完备。**J2CJ（Java→仓颉）**已商用，案例转化率 85%–97.5%——证明「Java 系→仓颉」项目级转换在商业上可行，同时是本课题最重要的对标对象。
2. **模型选择跨度极大，成本差两个数量级**：云端从 DeepSeek flash（输入 $0.15/M）到 OpenAI GPT-6 Astra（$10/M）、Anthropic Opus 5.5（$4/M）；本地可用 Qwen2.5-Coder-14B/32B（12–25GB 显存）。对"高精度转译+多轮纠错"场景，选型需在精度、成本、数据合规间权衡。
3. **学术与开源方法齐全，可直接映射到 MVP 流水线**：切分（Context as a Tool、Prometheus 知识图谱）、转换（ExeCoder、BabelCoder）、修复（TSAPR、SemAgent、llvm-autofix）、迁移工具（Crane、block/ai-migrate、Konveyor Kai）分别对应 MVP 的解析/切分/生成/编译验证/修复/测试环节。
4. **数据合规是硬约束**：OpenAI/Anthropic/Google 均有零保留（ZDR）或企业不训练保证；DeepSeek 与国内厂商的 API 训练策略未在公开页明确承诺——企业代码不得用于训练时，需商务确认或走本地部署。

---

## 核查点一：仓颉（Cangjie）生态现状（已核实）

| 核查项 | 查证结果 | 来源 URL | 访问日期 | 可靠性 |
|---|---|---|---|---|
| 官网 | https://cangjie-lang.cn | 官网 | 2026-10-15 | 官方 |
| 官方文档 | 开发指南、API、工具指南、版本说明书、语言规约 | https://cangjie-lang.cn/docs | 2026-10-15 | 官方 |
| 当前版本 | LTS: 1.0.5；STS: 1.2.0（2026/09/22 发布）；另有 1.1.3 STS、1.1.0-beta.23 | https://cangjie-lang.cn/download/1.1.0-beta.23 | 2026-10-15 | 官方 |
| 发布状态 | 已正式发布：1.0.0 LTS 于 2025 年 7 月发布，达生产部署标准；2025-07-30 开源（编译器、运行时、标准库） | https://cangjie-lang.cn/download/1.1.0-beta.23；百度百科 | 2026-10-15 | 官方+百科 |
| 许可证 | Apache 2.0（允许商业用途、修改与再分发） | https://post.smzdm.com（社区确认） | 2026-10-15 | 社区确认（官方文档页未直接展示） |
| **跨语言转换工具** | **J2CJ：Java→仓颉源码转换工具，基于编译技术**；安卓逻辑代码转化率 >85%，迁移效率提升 4–5 倍；商用案例：工行 Calendar 1200 行/85%、美团 DSL Engine 2859 行/97.5%、宝兰德 Business Logic 4000 行/89.9% | https://gitcode.com/Cangjie-SIG/j2cj/releases | 2026-10-15 | 官方 GitCode 仓库+Workshop 材料 |
| IDE/语言服务 | VSCode 插件（cangjie-vscode）、DevEco Studio 插件（官方提供） | https://cangjie-lang.cn/download/1.1.0-beta.23；https://docs.cangjie-lang.cn | 2026-10-15 | 官方 |
| 包管理 | CJPM（Cangjie Package Manager）：模块系统、依赖解析、构建与测试 | https://docs.cangjie-lang.cn | 2026-10-15 | 官方 |
| 工具链 | cjc（编译器）、cjfmt（格式化）、语言服务、调试、性能分析、Mock、测试框架、覆盖率、Fuzz | https://cangjie-lang.cn/docs | 2026-10-15 | 官方 |
| 类型系统/语言特性 | 多范式（函数式+命令式+OOP）、值类型、类/接口、泛型、代数数据类型、模式匹配、高阶函数、类型推断、宏 | 百度百科；https://cangjie-lang.cn/docs | 2026-10-15 | 官方+百科 |
| 并发模型 | 轻量线程模型 + 全并发 GC；支持 spawn 表达式 | 百度百科（官方白皮书更详细） | 2026-10-15 | 百科 |
| 与 Java/C++ 差异权威资料 | **未找到专门对比文档**；建议参考官方白皮书 + 语言规约自行对比 | https://cangjie-lang.cn/docs | 2026-10-15 | 官方（差异对比文档缺失） |
| 新手学习资源 | 官方：在线体验、开发指南、学习资源、示例代码、中心仓；VSCode 插件；社区：GitCode 社区、CLA 社区看板、Cangjie-TPC、Cangjie-SIG | https://cangjie-lang.cn/docs | 2026-10-15 | 官方 |

### 对课题启示
- **J2CJ 是核心对标**：其「基于编译技术 + 高转化率（85%+）」说明 Java→仓颉转换的商业路线已被验证；本课题 MVP 做 Java→C++，后续推广 ArkTS→仓颉，需回答差异化：C++ 目标语言 + **LLM 驱动迭代纠错闭环**（J2CJ 未披露是否用 LLM）。
- 仓颉工具链完整（cjc/CJPM/插件），转换产物的**编译验证环节**可直接用官方工具链落地。
- Apache 2.0 开源意味着可基于官方编译器/标准库做深度适配与检索增强素材。

---

## 核查点二：大模型 API 当前型号与定价（2026 年现状，已核实）

### 云端 API

| 模型 | 主力型号 | 输入价 | 输出价 | 上下文 | 数据训练策略 | 来源 URL | 访问日期 |
|---|---|---|---|---|---|---|---|
| DeepSeek | deepseek-flash（V4.1-Flash） | 缓存未命中 $0.15/M（空闲）$0.3/M（高峰）；命中 $0.003–0.006/M | $0.6/M（空闲）$1.2/M（高峰） | 1M | 条款允许去标识化后优化服务；2026-04 版协议未明确承诺 API 数据不用于训练，需关注最新条款 | https://api-docs.deepseek.com/quick_start/pricing/ | 2026-10-15 |
| DeepSeek | deepseek-v4-pro | 未命中 $0.66/M（空闲）$1.32/M（高峰）；命中 $0.022–0.044/M | $1.98/M（空闲）$3.96/M（高峰） | 1M | 同上 | https://api-docs.deepseek.com/quick_start/pricing/ | 2026-10-15 |
| OpenAI | GPT-6 Astra（旗舰） | $10.00/M | $50.00/M | 短上下文（<272K） | 企业默认不用于训练（除非明确 opt-in）；提供 ZDR（零数据保留）+ Private Safety Processing | https://developers.openai.com/api/docs/pricing | 2026-10-15 |
| OpenAI | GPT-6 Sol（平衡） | $2.00/M | $10.00/M | 短上下文 | 同上 | 同上 | 2026-10-15 |
| OpenAI | GPT-6 Luna（低成本） | $0.10/M | $0.50/M | 短上下文 | 同上 | 同上 | 2026-10-15 |
| Anthropic | Claude Opus 5.5 | $4/M | $20/M | 1M（最大输出 12.8 万） | 默认不在商业产品中用于训练；ZDR 仅 API；未经许可保留数据不用于训练 | https://platform.claude.com/docs/en/models/opus-5-5/overview | 2026-10-15 |
| Anthropic | Claude Sonnet 5.5 | $2/M | $10/M | 1M（同上） | 同上 | https://platform.claude.com/docs/en/models/opus-5-5/overview | 2026-10-15 |
| Anthropic | Claude Haiku 5.5 | $0.10/M 起 | $0.50/M 起 | 1M（同上） | 同上 | https://platform.claude.com/docs/en/models/haiku-5-5/overview | 2026-10-15 |
| Google | Gemini 4 Argon（旗舰） | $2.00/M（2026-11-30 前限时价，之后 $4.00） | $10.00/M（限时价，之后 $20.00） | 1M | 付费层级内容不用于改进产品；企业版合约级不训练保证 + ZDR；免费层数据用于改进 | https://ai.google.dev/gemini-api/docs/pricing | 2026-10-15 |
| 通义千问 | Qwen3.8-Max | ¥12/M | ¥36/M | 百万级 | 未查到明确 API 训练策略页 | https://www.alibabacloud.com/help/zh/model-studio/model-pricing | 2026-10-15 |
| 通义千问 | Qwen3.8-Flash | ¥0.8/M | ¥2.7/M | 1M | 同上 | https://platform.qianwenai.com | 2026-10-15 |
| 豆包 | Doubao-Seed-2.1-Pro | ¥6/M | ¥30/M | 256K | 未查到明确 API 训练策略页 | https://docs.volcengine.com/docs/ark/model-pricing | 2026-10-15 |
| 豆包 | Doubao-Seed-2.1-Turbo | ¥3/M | ¥15/M | 256K | 同上 | 同上 | 2026-10-15 |
| 智谱 GLM | — | 未找到 2026 年最新定价页 | — | — | — | — | — |
| Kimi | — | 未找到 2026 年最新定价页 | — | — | — | — | — |

### 本地开源模型

| 模型 | 版本 | 显存需求 | 来源 | 访问日期 |
|---|---|---|---|---|
| Qwen2.5-Coder-3B/7B | Qwen2.5-Coder | 16GB+（T4/P100/V100 及以上） | https://www.alibabacloud.com | 2026-10-15 |
| Qwen2.5-Coder-14B | Qwen2.5-Coder | Q4_K_M 约 8.5–9GB（12GB 卡可跑）；24GB 显存（A10 及以上） | https://evezone.evetech.co.za；https://www.alibabacloud.com | 2026-10-15 |
| Qwen2.5-Coder-32B | Qwen2.5-Coder | Q4_K_M 约 20–22GB，建议 20–25GB 显存 | https://evezone.evetech.co.za | 2026-10-15 |
| DeepSeek-Coder-6.7B | DeepSeek-Coder | 量化 8–12GB；全精度 16GB+ | https://github.com/deepseek-ai/DeepSeek-Coder/issues/664 | 2026-10-15 |
| DeepSeek-Coder-33B | DeepSeek-Coder | 4-bit 量化 24–32GB；FP16 约 66GB | 同上；https://news.qiniu.com | 2026-10-15 |
| DeepSeek-Coder-V2-Lite (16B) | V2 Lite | Q4 约 9.5GB | https://dev.to | 2026-10-15 |

### 数据合规要点（企业代码不得用于训练）
- OpenAI：企业数据默认不训练（除非明确选择加入）+ ZDR 服务 + Private Safety Processing（预览）。
- Anthropic：ZDR 协议（仅 API）；部分模型要求 30 天数据保留。
- Google：付费层级不用于改进产品；企业版合约级不训练保证 + ZDR。
- **DeepSeek 与国内厂商：公开定价页未明确披露 API 数据训练策略——需联系商务获取合规承诺，或选择本地部署。**
- 具体配置参数（API 参数/Header/合同条款）需查阅各厂商企业版接入文档。

### 对课题启示
- **成本量级对比**：假设一个 2k 行项目转换 + 3 轮纠错迭代，输入≈输出≈百万 token 级；用 deepseek-flash 成本约 $0.3–1.2，用 GPT-6 Astra 约 $10–50，Opus 5.5 约 $4–20——**量级差一个数量级以上**。新手团队 MVP 阶段优先低成本模型验证流程，精度不足再升级。
- **数据合规**：华为课题若用云端 API，首选带 ZDR/不训练承诺的厂商（OpenAI/Anthropic/Google 企业版）或本地部署（Qwen2.5-Coder-14B/32B 显存门槛 12–25GB，可行）。
- **本地模型可行性**：Q4 量化 14B 约 9GB、32B 约 20–22GB——单卡可跑，适合"代码不落云"的场景；代价是转换精度与速度低于云端旗舰。

---

## 核查点三：最新论文与开源工具（2024–2026，已核实清单）

### 学术论文

| 类别 | 名称 | 一句话说明 | 链接 | 引用量 | 访问日期 |
|---|---|---|---|---|---|
| 代码翻译 | BabelCoder: Agentic Code Translation with Specification Alignment | 多智能体代码翻译框架，翻译任务分解为翻译、测试等专门 Agent | arXiv:2512.06902 | 未获取 | 2026-10-15 |
| 代码翻译 | EffiReasonTrans: RL-Optimized Reasoning for Code Translation | 推理增强数据集 + 强化学习提升翻译准确性、降低推理延迟 | arXiv:2510.18863 | 未获取 | 2026-10-15 |
| 代码翻译 | ExeCoder: Empowering LLMs with Executability Representation | 可执行性表示增强 LLM 代码翻译能力 | arXiv（v1: 2025-01-30, v3: 2025-09-27） | 未获取 | 2026-10-15 |
| 大代码库上下文 | Context as a Tool: Context Management for Long-Horizon SWE-Agents | 上下文维护提升为可调用工具，解决仓库级长程交互 | arXiv:2512.22087 | 未获取 | 2026-10-15 |
| 大代码库上下文 | Prometheus: Unified Knowledge Graphs for Issue Resolution in Multilingual Codebases | 统一知识图谱解决多语言代码库问题 | arXiv:2507.19942 | 未获取 | 2026-10-15 |
| 大代码库上下文 | FEA-Bench | 仓库级代码生成基准，评估 LLM 特征实现能力 | arXiv | 未获取 | 2026-10-15 |
| 自动程序修复 | RelRepair: Enhancing APR by Retrieving Relevant Code | 检索相关代码增强自动程序修复 | arXiv | 未获取 | 2026-10-15 |
| 自动程序修复 | TSAPR: A Tree Search Framework For Automated Program Repair | 树搜索框架驱动的自动程序修复 | arXiv:2507.01827 | 未获取 | 2026-10-15 |
| 自动程序修复 | SemAgent: A Semantics Aware Program Repair Agent | 语义感知的程序修复 Agent | arXiv:2506.16650 | 未获取 | 2026-10-15 |
| 自动程序修复 | T³: Multi-level Tree-based APR with LLMs | 多级树结构自动程序修复 | arXiv:2506.21211 | 未获取 | 2026-10-15 |
| 编译错误修复 | Agentic Harness for Real-World Compilers (llvm-autofix) | 面向 LLM Agent 的编译器 Bug 修复辅助框架 | arXiv | 未获取 | 2026-10-15 |
| 编译错误修复 | CompileAgent | 工具集成 LLM Agent 系统，仓库级编译 | 2025 年发表 | 未获取 | 2026-10-15 |
| 编译错误修复 | Byam | 修复依赖更新导致的编译错误 | arXiv:2505.07522 | 未获取 | 2026-10-15 |

### 开源项目

| 类别 | 名称 | 一句话说明 | 链接 | Star | 访问日期 |
|---|---|---|---|---|---|
| Java→C++ 转译器 | j2cc | Java 字节码→C++ 转译器与混淆器（JNI） | https://github.com/0x3C50/j2cc | ~81 | 2026-10-15 |
| Java→C++ 转译器 | clearwing-vm | 基于 CodenameOne Parpar VM 的 Java→C++ 转译器 | https://github.com/SwitchGDX/clearwing-vm | ~39 | 2026-10-15 |
| Java→C++ 转译器 | java-to-cpp-translator | 学生项目级 Java 子集→C++ 源码转译器 | https://github.com/guillaumebogaertGIT/java-to-cpp-translator | 未获取 | 2026-10-15 |
| LLM 代码迁移 | block/ai-migrate | LLM 驱动大规模代码迁移，两阶段（Setup+Migration） | https://github.com/block/ai-migrate | 未获取 | 2026-10-15 |
| LLM 代码迁移 | Konveyor AI (Kai) | 静态代码分析驱动的 LLM 迁移工具 | https://github.com/konveyor/kai | 未获取 | 2026-10-15 |
| LLM 代码迁移 | janus-llm | LLM 遗留系统现代化，支持文件级语言翻译 | https://github.com/janus-llm/janus-llm | 未获取 | 2026-10-15 |
| LLM 代码迁移 | Crane (GitHub Next) | 小步 Agent 式代码迁移助手：规划→执行→验证 | https://github.com/githubnext/crane | 未获取 | 2026-10-15 |
| C/C++→Rust | Auto-RS | 基于 Claude Code SDK 的 C/C++→Rust 自动迁移 Agent | https://openatom.tech | 未获取 | 2026-10-15 |
| 仓颉迁移 | **J2CJ** | **Java→仓颉源码转换工具（编译技术，转化率 >85%）** | https://gitcode.com/Cangjie-SIG/j2cj/releases | 未获取 | 2026-10-15 |
| 仓颉迁移 | AtCH-explorer | Claude Code + 鸿蒙仓颉生态的 Android→仓颉智能迁移框架 | https://gitcode.com | 未获取 | 2026-10-15 |

### 对课题启示
- **MVP 流水线可直接映射**：
  - 切分/上下文 → Context as a Tool、Prometheus（知识图谱）
  - 转换 → ExeCoder（可执行性表示）、BabelCoder（多智能体拆分）
  - 编译验证/修复 → llvm-autofix（编译器修复 harness）、CompileAgent（仓库级编译）、TSAPR/SemAgent（树搜索/语义修复）
  - 工程骨架 → Crane（规划→执行→验证小步迁移）、block/ai-migrate（Setup+Migration 两阶段）、Konveyor Kai（静态分析+LLM）
- **J2CJ 是本课题直接竞品与学习对象**：其商用转化率数据（85%–97.5%）可作对标基准；本课题差异点是 LLM 驱动 + 迭代纠错闭环 + 目标语言 C++（先）与 ArkTS（后）。
- **可借鉴的工程模式**：LLM 迁移工具普遍采用「规划→执行→验证」多阶段 + 工具集成（编译/测试为可调用工具），与课题的「切分→转换→编译验证→修复→测试」闭环一致，无需从零发明。

---

## 待核实清单（Partial research 边界）

| 项目 | 说明 | 影响 |
|---|---|---|
| 仓颉与 Java/C++ 差异对比的官方文档 | 未找到专门对比文档，需基于白皮书+语言规约自行整理 | 影响后续 ArkTS→仓颉迁移方案（中） |
| 智谱 GLM / Kimi 2026 年最新 API 定价页 | 未找到 | 影响国内模型选型完整性（低） |
| 通义/豆包/智谱/Kimi 的 API 数据训练策略 | 未查到官方明确承诺页 | 影响数据合规决策（高，建议联系商务或本地部署） |
| 各厂商 ZDR/不训练的具体配置参数 | 未找到技术配置文档 | 影响企业接入落地（中） |
| 部分论文引用量/GitHub Star | 较新论文数据不充分 | 影响优先级排序（低） |
| 仓颉反向迁移工具（仓颉→其他语言） | 仅找到 Java→仓颉/Android→仓颉方向 | 不影响本课题（低） |
| 部分来源可靠性 | smzdm 社区确认许可证、百度百科条目，建议以官方仓库 LICENSE 为准 | 影响证据强度（低） |

---

## 关键结论与下一步建议

1. **MVP（Java→C++）路线可行**：现成组件齐备——Java→C++ 转译器（j2cc/clearwing-vm，可作规则层借鉴）、LLM 迁移骨架（Crane/ai-migrate）、编译修复方法（llvm-autofix/TSAPR）。建议 MVP 走「规则/编译技术 + LLM 生成 + 编译验证纠错闭环」混合路线。
2. **模型选型初步建议**：MVP 阶段用低成本模型（deepseek-flash 级别）验证流程；精度优化阶段对比 deepseek-v4-pro / Qwen 本地 14B/32B；若企业数据不落云，走本地部署。
3. **对标 J2CJ 设定验收目标**：参考其商用案例转化率（85%+）与课题指标（编译错误 <15%、测试失败率 <20%），MVP 验收以课题指标为准。
4. **下一步**：进入 Part 2（PRD）——基于本底稿 + Handoff Context 起草产品需求文档；或先补查「待核实清单」中的高风险项（国内厂商训练策略、ZDR 配置）。

---

## Handoff Context
<!-- Machine-readable summary for the next workflow step. Do not delete; the next prompt in the workflow reads this block. -->
- Stage: research
- App name: XDtranC
- User level: B（developer，新手团队）
- Target platform: 开发工具（桌面/命令行/IDE 插件形态，MVP 含输入输出界面）
- Budget: 华为企业课题标准（未指定上限，成本研究给出量级估算）
- Timeline: 以华为课题结项要求为准
- AI in product scope: yes（大模型驱动的代码转换与自动修复）
- Research status: Partial research（2026-10-15 三要点定向核查底稿；缺口见「待核实清单」）
- Constraints: MVP 仅 Java→C++；最终至少 3 种源语言（Java、ArkTS 必须）→ 仓颉；验证 5 个 ≥2k 行代码库；编译错误行占比 <15%；人工修复后测试失败率 <20%；华为企业数据合规；新手团队
- Decisions: MVP 目标语言 C++（先验证流程，后推广到仓颉）；文件名主干 XDtranC；模型选型初步倾向低成本 API + 本地部署兜底（研究建议，待 PRD 确认）
- Open questions: 国内厂商 API 训练策略与 ZDR 配置；仓颉 vs Java/C++ 官方对比文档；智谱/Kimi 定价；第 3 种源语言选择；Provider 是否限定本地部署
- Source files: research-request-xdtranscoder.md → docs/research-xdtranc.md
