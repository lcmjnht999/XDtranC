# Memory

Update this after major decisions, completed phases, or bugs that future agents need to know about. Keep it short. This shared project handoff is separate from a coding tool's private automatic memory.

## Current State

- Current task: Part 4 setup 已完成并提交进仓库；尚未开始写代码。
- Current phase: Setup 完成 → 待 Part 5（第一片计划）。
- Next step: 让编码助手读 AGENTS.md + 本文件 + `docs/` 下 PRD/Tech Design，提出「最小可用第一片」计划（建议：pnpm monorepo 脚手架 + `packages/engine` 的 import/parse 垂直切片）并等待用户批准。
- Blocked by: 无硬阻塞。未决项见下方 Open Decisions。

## 仓库与目录

- 唯一真源：`C:\Users\xuhailong\Desktop\XDtranC`（git 仓库，remote `origin` = `https://github.com/lcmjnht999/XDtranC.git`，私有，分支 `main`）。
- `docs/` 放 PRD / Tech Design / research；文档正文自己引用的就是 `docs/...`，不要把文档挪回根目录。
- `C:\Users\xuhailong\Desktop\许铭真2026\Projects\Deepworks\项目10` 是 DeepWorks 的会话工作区，只保留 setup 那次生成的副本，**不再作为开发目录**；两边内容若不一致，以本仓库为准。

## Decisions

- 2026-10-29 **范围以 Tech Design（2026-10-22 修订版）为准**：本 MVP 只做 4 项（导入解析、切分、LLM 转换 + 自核查、工作台 + 导出）；编译验证/自动修复/测试/用户反馈修复不在本 MVP，<15% 与 <20% 指标作废，验收改为出物完整性。原因：用户在本轮确认；Tech Design 已把该修订写进正文与 Open Questions 第 9 条。
- 2026-10-29 PRD 原文保持不动，作为历史版本保留；不一致记录在 AGENTS.md「范围权威」，不擅自改写 PRD。
- 2026-10-29 适配器选择：以 `AGENTS.md` 为主入口（DeepWorks/Codex 读取），另加两份极薄适配器 `.cursor/rules/00-project.mdc`、`.github/copilot-instructions.md`。原因：用户未指定编码助手，Tech Design 把 Cursor / VS Code + Copilot 列为备选；薄适配器不含重复内容，随时可删。
- 2026-10-29 目录合并方式：把 setup 产物复制进仓库根，三份文档 `git mv` 进 `docs/`；**不是**把 `项目10` 整目录搬进来。原因：整目录搬会多一层目录、且带入 `.opencode/`、`cache/`、`uploads/`、`outputs/` 等运行时目录；PRD/TechDesign 正文与 AGENTS.md 都按 `docs/...` 引用。

## AI / Tooling Decisions

- 2026-10-29 产品内 LLM：候选池（OpenAI 兼容抽象，默认 DeepSeek-V4-Flash）+ 本地 Ollama 兜底 + Mock Provider（离线测试）。外部付费 API 不入 MVP。依据 Tech Design §1.3 / §4。
- 2026-10-29 开发辅助：DeepWorks 为首选编码助手；产品运行时 LLM 与开发助手费用分开核算。

## Open Decisions

- 候选池各模型的 model id / base URL / 额度 / 「不用于训练 + ZDR」承诺清单未确认 —— 接入前逐项核实并记录，不可确认的不得静默外发。
- 验收样例库数量与清单（最少 1 个起步，N 待课题确认）；验收库不进仓库。
- 仓颉 SDK 固定版本与目标语法子集；导出仓颉项目的目录/包结构约定。
- 课题结项时间线与里程碑。
- Node / pnpm 版本要求未定（脚手架时确定并写入 `agent_docs/tech_stack.md`）。
- PRD 是否按新边界同步修订（当前不改）。

## Known Issues

- 代码尚未初始化：无 `package.json`、`pnpm-workspace.yaml`、`packages/`。AGENTS.md 与 `agent_docs/` 中的命令全部是计划命令，未验证。
- 没有 cjc / CJPM / clang / g++ 也能正常工作，这是设计预期，不是环境故障。

## Completed

- [x] 读取 PRD / Tech Design / research 底稿，确认范围冲突并取得用户裁决
- [x] 生成 AGENTS.md、MEMORY.md、REVIEW-CHECKLIST.md、agent_docs/*（6 份核心 + 2 份可选）
- [x] 生成 Cursor / Copilot 薄适配器
- [x] 文档移入 `docs/`、补 `.gitignore`、修正 AGENTS.md 仓库状态描述，提交并推送
- [ ] Initial scaffold（pnpm monorepo + 五个 package 骨架）
- [ ] Core data model（`packages/shared/src/contracts.ts` / `outputSchema.ts` / `errors.ts`）
- [ ] Core MVP flow（import → parse → chunk → convert → export）
- [ ] 评测集与主旅程 E2E（Mock Provider 离线）
- [ ] Launch checks（打包、内网分发、演示材料）
- 说明：Auth 不在本产品范围内，已从模板移除。
