# XDtranC MVP 收口工作流

本文是把当前原型推进到「可交付 MVP」的执行手册。范围权威仍是 `docs/TechDesign-XDtranC-MVP.md`（2026-10-22 修订版），本文件只描述执行顺序与验收方式，不改变范围。

## 0. 前提与边界

- 仓库：`C:\Users\xuhailong\Desktop\XDtranC`，分支 `main`。
- 不在本 MVP：cjc 编译验证、编译错误自动修复、CJPM 行为测试、用户反馈修复、界面美化、富可视化。
- 不接外部付费 Provider；真实模型只用本机 Ollama。
- Git 写操作（add/commit/push/tag）只能由用户本人执行，助手只给命令。
- 每批开始前工作区必须干净；不干净先停下来问，不覆盖未提交改动。

## 1. 每批固定五步

| 步骤 | 谁做 | 产出 | 不通过的处置 |
|---|---|---|---|
| 1. 基线 | 助手 | `typecheck` / `lint` / `test` / `eval` 结果 | 先修基线，不进入本批 |
| 2. 提计划 | 助手 | 一屏以内的改动清单 + 验收方式 | 用户不批准就不动代码 |
| 3. 实现 | 助手 | 只改本批声明过的文件 | 发现要扩范围，停下重新报计划 |
| 4. 验证 | 助手 | 命令输出 + 手工步骤结果 | 失败必须修到绿或明确降级 |
| 5. 交接 | 助手 | 更新 `MEMORY.md` 与一份 `docs/*.md` 交接 | 未更新不算完成 |

规则：**一批只做一件事**。功能和架构不同时改；不顺手重构无关代码；不删测试换取通过。

## 2. 批次总览

| 批次 | 目标 | 依赖 | 主要改动 | 验收 |
|---|---|---|---|---|
| 0 | 环境与基线 | 无 | 无代码 | 基线四条命令全绿，桌面能启动 |
| A | 持久化与恢复 | 0 | `engine/workspace.ts` 新增；`index.ts`、`converter.ts`、`main.ts` 接入 | 新增单测全绿 + 杀进程后能恢复 |
| B | 完整性口径 | A | `exporter.ts`、`eval.ts`、新增覆盖映射 | 负面样例必须判失败 |
| C | 工作台能力 | A | `main.ts`、`preload.cjs`、`renderer/index.html` | Electron 脚本 + 人工点一遍 |
| D | UI 技术栈 | C | 新增 `renderer/` React 工程 | 组件测试 + 启动时间不明显退化 |
| E | Provider 健壮性 | A | `provider.ts`、`ollama-provider.ts`、`converter.ts` | 模拟 429/超时/超长 chunk |
| F | 交付收尾 | A–E | `package.json` 脚本、打包配置、文档 | 打包产物能启动；文档与代码一致 |
| 可选 | 真实模型验收 | F | 无代码 | 真实 Ollama 跑通 `samples/hello` |

## 3. 阶段 0：环境与基线

用户执行（PowerShell，必须用 `.cmd`）：

```powershell
node -v                                   # 期望 >= 22
npm.cmd install -g pnpm@10.30.3
cd C:\Users\xuhailong\Desktop\XDtranC
pnpm.cmd install --frozen-lockfile
Test-Path node_modules\electron\dist\electron.exe
node node_modules\electron\install.js     # 上一条为 False 时执行
pnpm.cmd typecheck
pnpm.cmd lint
pnpm.cmd test
pnpm.cmd eval
pnpm.cmd dev
```

通过标准：

- `test` 汇总为 51 项通过（若数量变化，以实际输出为准并记录差异）。
- `eval` 六类全部通过。
- `dev` 能打开窗口，选择 `samples/hello` 后能完成一次 Mock 转换。

失败时把原始报错贴回，不做“跳过某项也算通过”的判定。

## 4. 批次 A：持久化与恢复

目标：状态落盘，重启可续。

目录（按 TechDesign §2.2）：

```
<项目根>/.xdtranc/
├── model/project.json
├── model/chunks.json
├── model/unsupported.json
├── state/<taskId>/task.json
├── state/<taskId>/conversions/*.json
├── state/<taskId>/events.log.jsonl
├── reports/<taskId>/report.json
└── logs/
```

实现要点：

1. `workspace.ts` 提供：打开/校验工作区、原子写（临时文件 + rename）、JSONL 追加、checkpoint 读写、恢复扫描。
2. 所有写入路径 `resolve` 后必须落在 `.xdtranc/` 前缀内；符号链接一律拒绝。
3. 输入目录不可写时降级到应用数据目录，并在状态里标明实际工作区位置。
4. 已有 `.xdtranc` 不覆盖，按 `taskId` 追加。
5. ZIP 输入的工作区放在解压任务目录下，作为设计外推记录。
6. `main.ts` 在阶段切换时写 checkpoint，启动时扫描未完成任务，退出前 flush。

必须新增的测试：

- 路径越界与符号链接被拒绝；
- 原子写中断不留下半截 JSON；
- `task.json` 可恢复，`stage`/`completed`/`failed` 一致；
- 输入 hash 变化时拒绝恢复并给出明确错误；
- 事件日志追加不重写历史。

手工验收：转换到一半关闭窗口 → 重开 → 能看到未完成任务与已完成 chunk 数。

## 5. 批次 B：完整性口径

目标：让“产物完整”可判定，而不是只比行数。

1. 建立源码→输出覆盖映射：每个源文件的顶层声明（函数/类/结构体）必须在输出中有对应符号或进入 `unsupported`。
2. `businessStubCheck` 从 `not-verified` 改为可判定：
   - 输出非空、非纯注释；
   - 不含整文件级 TODO/占位；
   - 至少一个业务符号被映射；
   - 未映射项必须带源位置。
3. 负面样例集：空输出、纯 TODO、只翻译头文件、丢弃一个源文件、行保留率过低。每类必须判为失败。
4. `eval.ts` 扩展为语义层检查，报告里给出失败原因而不是只给数字。

验收：负面样例全部被拦下；正面样例全部通过；失败项都带文件与行号。

## 6. 批次 C：工作台能力

在现有 HTML 上补齐，不重构：

- 文件树：显示输入文件、chunk 归属、失败/不支持标记。
- 粘贴临时项目：用户粘贴代码生成临时目录，流程与目录输入一致。
- 完整性报告摘要：导出前展示文件数、行保留率、`unsupported` 数量，并要求确认。
- 原生对话框：目录选择、ZIP 选择、导出位置，全部走主进程对话框。

验收：Electron 脚本覆盖“选择 → 转换 → 报告 → 导出”；人工在 `pnpm dev` 里点一遍；`contextIsolation`/`sandbox` 不回退。

## 7. 批次 D：UI 技术栈

目标：回到 TechDesign 的 React + Vite + 动态 Monaco。

迁移策略：

1. 先搭 Vite 壳，把现有状态与 IPC 原样搬过去，行为不变。
2. 再替换代码预览为 Monaco，必须动态 `import`，不进入首屏包。
3. 最后补文件树与报告组件。

验收：组件测试 + 手工主旅程；记录启动耗时，不能比原型明显变慢；所有 IPC 仍走 preload 白名单。

## 8. 批次 E：Provider 健壮性

只做本地可验证的部分：

- `Provider` 接口抽象，Mock 与 Ollama 实现同一契约。
- 限流/超时：指数退避、有限重试、可取消。
- 超预算 chunk 自动缩块，仍失败则进失败清单。
- 候选池只保留接口与配置结构，不接外部云。

验收：模拟 429、超时、超长 chunk 三类用例；重试次数与最终失败原因可观测。

## 9. 批次 F：交付收尾

- 补 `e2e`（Playwright for Electron，Mock Provider 离线跑）、`build`、`pkg` 脚本。
- CJPM 项目结构需消费方确认；未确认前不生成，只记录为 Open Question。
- 同步文档：PRD 修订需用户点头；`MEMORY.md` 的 Completed 勾选与实际一致。
- 打包产物能启动并完成一次 Mock 旅程。

## 10. 可选：真实模型验收

需要用户提供：本机 Ollama 已运行、模型名（如 `qwen2.5-coder:14b`）。

验收：`samples/hello` 走真实模型完成转换，schema 校验通过，失败项带原因。不通过不影响前面批次的完成判定。

## 11. 需要用户点头的决策

1. React + Monaco 重构是否按批次 D 执行（当前已定：先补功能，最后重构）。
2. 是否接受向输入项目根写入 `.xdtranc/`（TechDesign 已如此设计）。
3. CJPM 目录结构是否现在就定。
4. 真实 Ollama 是否在收尾后验收。
5. PRD 是否同步修订。

## 12. 完成定义

- 基线四条命令全绿；桌面主旅程可复现。
- 批次 A–C 全部通过，D–F 按批准范围完成或明确降级。
- 完整性报告能对每个失败项给出文件、行号、原因。
- `MEMORY.md` 与实际状态一致，没有“已完成但没勾选”或“未完成却标绿”。
- 报告里区分“已验证”“未验证”“范围外”，不把未跑的检查写成通过。

## 13. 禁止事项

- 不代跑 Git 写操作、不发布、不部署。
- 不接未确认合规的外部 Provider，不上传源码。
- 不用删除业务逻辑换取自核查通过。
- 不把编译/测试通过作为本 MVP 的结论。
- 不在未备份的情况下覆盖已有 `.xdtranc` 或导出目录。
