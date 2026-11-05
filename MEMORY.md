# Memory

Update this after major decisions, completed phases, or bugs that future agents need to know about. Keep it short. This shared project handoff is separate from a coding tool's private automatic memory.

## Current State

- Current task: 批次 E、F、G 已完成，等待提交。
- Current phase: 2026-11-03 完成 Provider 健壮性（E）、交付收尾（F）；CJPM 可选布局作为**圈外预研**实现（默认关闭，不在 MVP 范围，属 Phase 2）；同时修复旧桌面脚本、补演示与分发文档（G）。`build`/`e2e`/`pkg` 脚本、Playwright Electron 主旅程、`electron-builder --dir` 打包均已验证。
- Next step: 跑最终全量验收（typecheck/lint/test/eval/e2e + 三个离线桌面脚本），由用户确认后提交 `bc028d3` 之后的改动；真实 Ollama 验收等环境就绪后再跑 `packages/main/ollama-real.mjs`。
- Blocked by: 真实 Ollama 验收未执行（本机未安装 Ollama，见 docs/ollama-acceptance.md）；外部 Provider 合规确认未完成。不影响 E/F/G。
- 交接文档：`docs/handoff-prompt-2026-11-05.md`（**优先读**，含完整提示词、现状、剩余工作、硬约束）；`docs/handoff-2026-11-03.md`（环境、命令、批次状态）。
- 交接原因：原机为 Intel UHD 620 核显，无独立显卡，3B 模型下载约 2 MB/s、推理过慢；真实 Ollama 验收移交性能更好的机器。

## 仓库与目录

- 唯一真源：`C:\Users\xuhailong\Desktop\XDtranC`（git 仓库，remote `origin` = `https://github.com/lcmjnht999/XDtranC.git`，私有，分支 `main`）。
- `docs/` 放 PRD / Tech Design / research；文档正文自己引用的就是 `docs/...`，不要把文档挪回根目录。
- `C:\Users\xuhailong\Desktop\许铭真2026\Projects\Deepworks\项目10` 是 DeepWorks 的会话工作区，只保留 setup 那次生成的副本，**不再作为开发目录**；两边内容若不一致，以本仓库为准。

## Decisions

- 2026-10-29 **范围以 Tech Design（2026-10-22 修订版）为准**：本 MVP 只做 4 项（导入解析、切分、LLM 转换 + 自核查、工作台 + 导出）；编译验证/自动修复/测试/用户反馈修复不在本 MVP，<15% 与 <20% 指标作废，验收改为出物完整性。原因：用户在本轮确认；Tech Design 已把该修订写进正文与 Open Questions 第 9 条。
- 2026-10-29 PRD 原文保持不动，作为历史版本保留；不一致记录在 AGENTS.md「范围权威」，不擅自改写 PRD。
- 2026-10-29 适配器选择：以 `AGENTS.md` 为主入口（DeepWorks/Codex 读取），另加两份极薄适配器 `.cursor/rules/00-project.mdc`、`.github/copilot-instructions.md`。原因：用户未指定编码助手，Tech Design 把 Cursor / VS Code + Copilot 列为备选；薄适配器不含重复内容，随时可删。
- 2026-10-29 **操作边界（长期）**：git 写操作（init / add / commit / push / pull / merge / tag / branch / remote）与 GitHub 上传一律由用户本人执行，助手只给可复制命令、预期输出和校验点；只读查询（status / log / diff / ls-tree）可以做。原因：用户明确要求，上传是不可撤回的外部外发。
- 2026-10-29 目录合并方式：把 setup 产物复制进仓库根，三份文档 `git mv` 进 `docs/`；**不是**把 `项目10` 整目录搬进来。原因：整目录搬会多一层目录、且带入 `.opencode/`、`cache/`、`uploads/`、`outputs/` 等运行时目录；PRD/TechDesign 正文与 AGENTS.md 都按 `docs/...` 引用。

## AI / Tooling Decisions

- 2026-10-29 产品内 LLM：候选池（OpenAI 兼容抽象，默认 DeepSeek-V4-Flash）+ 本地 Ollama 兜底 + Mock Provider（离线测试）。外部付费 API 不入 MVP。依据 Tech Design §1.3 / §4。
- 2026-10-29 开发辅助：DeepWorks 为首选编码助手；产品运行时 LLM 与开发助手费用分开核算。

## Open Decisions

- 候选池各模型的 model id / base URL / 额度 / 「不用于训练 + ZDR」承诺清单未确认 —— 接入前逐项核实并记录，不可确认的不得静默外发。
- 验收样例库数量与清单（最少 1 个起步，N 待课题确认）；验收库不进仓库。
- 仓颉 SDK 固定版本与目标语法子集；导出仓颉项目的目录/包结构约定。
- 课题结项时间线与里程碑。
- Node >=22；已测 Node 24.20.0 / pnpm 10.30.3，版本锁在 package.json。
- PRD 是否按新边界同步修订（当前不改）。

## Known Issues

- 当前含桌面、ZIP、Mock与Ollama适配、`.xdtranc` 持久化与断点续跑、符号级覆盖与空壳判定、粘贴临时项目/输入文件树/导出前摘要确认、React+Vite+动态 Monaco（首屏约 1.0–1.2s）；尚缺 Monaco 只带 C++ 的精简、打包分发与自动化 E2E。桌面ZIP源目录边界已修复并回归，详见 docs/export-boundary-fix.md。
- 本机 Node 26.13.0：electron install.js 的 extract-zip 会解压不完整（只留 locales），需用 Expand-Archive 解压缓存 zip 并写 path.txt；tsx 有 module.register 弃用警告，不影响运行。详见 docs/stage0-runbook.md。
- 没有 cjc / CJPM / clang / g++ 也能正常工作，这是设计预期，不是环境故障。

## Completed

- [x] 读取 PRD / Tech Design / research 底稿，确认范围冲突并取得用户裁决
- [x] 生成 AGENTS.md、MEMORY.md、REVIEW-CHECKLIST.md、agent_docs/*（6 份核心 + 2 份可选）
- [x] 生成 Cursor / Copilot 薄适配器
- [x] 文档移入 `docs/`、补 `.gitignore`、修正 AGENTS.md 仓库状态描述，提交并推送
- [x] Initial scaffold（pnpm monorepo + 五个 package 骨架）
- [x] Core data model（`packages/shared/src/contracts.ts` / `outputSchema.ts` / `errors.ts`）
- [x] Core MVP flow（import → parse → chunk → convert → export）
- [x] 评测集与主旅程 E2E（Mock Provider 离线；Playwright Electron，含打包产物用例）
- [x] Launch checks（打包 `--dir` 产物并验证启动；演示指南与内网分发步骤已写；内网实发未做）
- 说明：Auth 不在本产品范围内，已从模板移除。

## 第一片交接（2026-10-29）

- 用户已批准 CLI 目录解析计划及公共依赖下载；本片完成后等用户试用再规划下一片。
- 使用 web-tree-sitter 0.20.8 + tree-sitter-wasms 0.1.13 的 C++ WASM，避免原生编译工具链；输入只读，不写 .xdtranc。
- 已检查：typecheck、lint、Vitest 8/8、CLI 样例（2 文件/6 行/4 声明/2 include/0 问题），2000 行样例最后一次 67ms。仅 Windows 本机验证，未测 Linux。
- 已修复：Parser 必须在 init 完成后构造。pnpm 不在 PATH，通过 npx.cmd --yes pnpm@10.30.3 使用；PowerShell 禁止 npm.ps1，改用 .cmd，不修改执行策略。
- 退出码：0 完整、2 部分结果、1 致命错误。include 只按当前文件目录解析；无完整语义分析；统计行数仅含有效 UTF-8。
- 临时测试数据保存在 .deepworks/tmp（已忽略，不删除）；未执行 Git 写操作、发布或 Provider 调用。原有 .opencode/ 与 opencode.jsonc 未改。

## 第二片交接（2026-10-29）

- 用户明确批准文件级切分计划：超预算单文件/SCC 不强拆，列 unassigned；后续依赖方也显式未分配。
- 完成 include SCC/依赖排序/同目录聚合、传递 include 声明摘要（不带函数体）、源码与上下文共同预算、源 hash 复核、AbortSignal、CLI chunk。
- 默认 4096，估算器 UTF-8 字节保守计数，非模型 tokenizer；不含未来 prompt/响应。不接模型、不新增依赖、不写输入目录。
- 实际检查：tsc、eslint、Vitest 17/17、pnpm chunk JSON 样例、offline frozen-lockfile、diff --check。2000 行解析加切分最后一次 128ms（本机数据）。
- 使用说明与局限见 docs/second-feature.md；同步单文件解析不可即时取消；Windows 已测，Linux 未测。
- 下一步：等待用户试用第二片反馈，再提第三片计划并取得批准；不要自动接 Provider。未执行 Git 写操作。
## 第三片交接（2026-10-29）

- 已获用户批准并完成：唯一 outputSchema 运行时校验、Provider 接口及固定 hello Mock、逐块模拟转换、问题回炉最多 2 次、failedChunks/unsupported、路径冲突/空输出校验、源 hash 与取消、CLI convert。
- Mock 只接受固定样例内容，未知源码明确 unsupported；simulated=true。没有网络/真实模型、写盘产物、导出或编译承诺。
- 实际检查：pnpm typecheck、lint、test（26/26）、convert 样例 JSON（2 块各 1 次、零失败）、git diff --check。
- 首次并行 CLI 子进程异常/超时，独立 CLI 正常；将 test 固定为串行文件 + 30 秒测试超时，最终再次全过。底层系统异常未确证，记录于 docs/third-feature.md。
- 本片无新依赖，无 Git 写/删除/发布。说明见 docs/third-feature.md；下一步等用户试用再计划第四片，不自动接模型。
## 第四片交接（2026-10-29）

- 用户批准后完成目录草稿导出：src/*.cj + 完整性清单/说明，拒绝覆盖、路径越界/链接、源变化和冲突。中断保留残留及开始标记，不删除；有效最终清单才代表完成。
- simulated=true；文件数比不是覆盖率，行数比不是语义保留率，业务空壳未验证；无真实模型/CJPM/编译承诺。
- pnpm typecheck/lint/test 35/35，实际演示 outputs/hello-export（2 文件、6→9 行、比值 1/1.5、空文件 0），清单已核对；git diff --check 通过。
- 中途取消通过检查点注入测试，未人工 Ctrl+C；Windows 已测，Linux/磁盘耗尽/真实 ACL 拒绝未测。不承诺并发恶意改路径竞态或原子导出事务。
- 使用说明 docs/fourth-feature.md。演示产物已忽略，不入 Git；未执行 Git 写/删除/发布/网络调用。
- 下一步等用户试用，再提第五片计划并批准；不自动接真实 Provider。
## 第五片交接（2026-10-29）

- 用户选择本机 Ollama；实现 ollama.ts、5 项协议测试，convert CLI 支持 --provider=ollama --model=... --endpoint=... --timeout-ms=...。
- 只允许 HTTP 回环 IP，拒绝重定向；有限超时、取消、4MiB 响应限制，不自动换 Provider。export 仍仅 Mock。
- 实际 typecheck/lint/test 40/40 通过。测试为本机 HTTP 模拟服务器，不是真实模型验收。
- 两次探测默认 127.0.0.1:11434/api/tags 均连接失败。用户选择“服务已启动，提供模型名”，但没有附模型名；不得猜测或拉取模型。
- 下一步优先取得实际回环端点与已安装模型名，只对已授权自建 samples/hello 真实试跑，再判断第五片完成；详见 docs/fifth-feature.md。
- 无新增依赖、模型下载、Git 写、删除、发布、外部网络调用。源码尚未发送到真实模型。
## 第六片交接（2026-10-29）

- 用户批准暂缓真实模型，先做 ZIP 安全导入导出。export 支持目录/ZIP 输入、dir/zip 输出，Mock 不变。
- 新增 yauzl/yazl 和类型依赖；限额 32MiB 压缩包/2000条目/8MiB单文件/64MiB总解压，路径/链接/冲突/CRC/实际解压大小检查；临时文件仅 .deepworks/tmp，保留不删除。
- 实际 typecheck/lint/test 48/48；CLI 演示 outputs/hello-archive.zip 成功。说明 docs/sixth-feature.md。
- 补边界时发生脚本转义语法错误，修复后完整回归通过。未测 Linux、ZIP 中途写取消或磁盘耗尽，不宣称原子导出。
- 第五片仍待真实服务及模型名；本轮没有模型调用、Git 写、发布、删除或源码外发。
## 第七片交接

- 最小 Electron 工作台已实现：主进程原生选路径、Mock启动/取消、阶段状态、文本预览、目录/ZIP导出。隔离preload与白名单IPC，未让引擎依赖Electron。
- 实际typecheck/lint/48项回归通过；Playwright启动真实Electron完成按钮操作、预览、导出、覆盖拒绝、参数拒绝、取消及失败状态。原生对话框返回值为测试替换，未人工系统对话框验收。
- pnpm dev 启动；详见 docs/seventh-feature.md。当前视图为无框架HTML原型，不是React迁移完成；未打包、未测Linux、未接UI真实模型。
- 启动顶层await自动化超时和取消竞态已调整并重测；第三方启动器DEP0190警告保留记录。临时数据保留在.deepworks/tmp。
- 第五片真实Ollama验收继续待办，下一步先试用桌面，不自动新增Provider。
## 第八片交接：桌面 Ollama 配置入口

- 用户选择先做桌面接入，真实服务验收保留待办。新增 Mock/Ollama、模型名、回环地址、超时配置和结果来源标记；主进程校验，失败不回退Mock，配置不落盘。
- 实际 typecheck/lint、50/50测试及 Electron smoke 通过。桌面使用本机临时503模拟服务验证失败清单和非回环地址拒绝，不是实际模型转换。
- 本轮默认端点不可连且PATH找不到ollama；未安装Ollama、下载模型或接入云。第五片真实验收仍未完成。
- 使用说明 docs/eighth-feature.md。下一步待可用本机服务和模型名，只用自建samples/hello试跑；不自动扩展功能。
## 第九片交接：桌面 Ollama 离线端到端验收

- 用户批准新增离线成功/重试/取消/导出一致性验证。新增 packages/main/ollama-e2e.mjs，无业务代码修改。
- 真实 Electron + 回环协议模拟服务：成功预览、目录清单/文件内容/hash一致、自核查问题回炉重试、等待响应时取消及后续恢复全部通过。
- typecheck/lint、Vitest 50/50及原Electron smoke重跑通过；独立新E2E不计入50项。详见 docs/ninth-feature.md。
- 模拟响应不是实际模型；simulated=false仅适配器标记，不是模型真实性证据。真实服务验收继续待办，无模型安装/下载、云调用或Git写操作。

## MVP 收口核对

- 用户批准只读核对并形成报告。docs/mvp-closeout-review.md列出验收矩阵、静态风险和优先级。未修改业务实现或擅自缩减设计。
- 纠正此前只差真实模型的印象；同步修正顶部过时阶段。桌面ZIP边界风险未执行写入复现，待单独批准修复。


## 桌面ZIP源码边界修复交接

- 用户批准修复；统一校验CLI及桌面目标，桌面同时检查原始输入和模型根，先拒绝再生成暂存数据。
- 51项测试和三个Electron脚本通过，临时自建样例拒绝源码内ZIP且输入不变，目录/ZIP输入外部导出成功。详见docs/export-boundary-fix.md。
- 未新增依赖、调用真实模型、Git写、删除或发布。其他收口缺口仍待批准。


## 离线完整性评测交接

- 获批实现pnpm eval，复用现有契约及引擎，六类离线评测通过；51项Vitest回归及typecheck/lint通过。
- 正式报告outputs/integrity-eval-jseubj/report.md和report.json；中间数据仅.deepworks/tmp。使用说明docs/integrity-eval.md。
- 仅结构验收，业务语义、真实模型、编译仍未验证；没有UI改动、新依赖、Git写、删除或外部服务调用。


## 阶段 0 交接（2026-11-03）

- 环境：Windows 10 22H2 / Node 26.13.0 / npm 11.20.0 / pnpm 10.30.3 / Electron 39.2.7；依赖 234 包，锁文件与 package.json 未变。
- 实际检查：typecheck、lint、Vitest 51/51（8 文件）、eval 6/6、build.mjs、Electron 启动（窗口标题 XDtranC 工作台）、samples/hello Mock 导出（status=complete，2/2 文件，0 空文件）。
- 踩坑：pnpm 10 拦截 electron/esbuild 构建脚本；Node 26 下 electron install.js 的 extract-zip 解压不完整，改用 Expand-Archive 解压缓存 zip 并写 path.txt 解决；tsx 的 module.register 弃用警告可忽略。
- 导出行为：目标是容器目录，产物落在 `<target>/draft/`；重复使用同一目标会报“目标已存在”。
- 本轮未改源码；新增 docs/mvp-delivery-workflow.md、docs/stage0-runbook.md 未提交，由用户决定。未执行 Git 写、删除或外部服务调用。


## 批次 A 交接（2026-11-03）

- 实现 `.xdtranc` 工作区：`engine/workspace.ts` 新增；`converter.ts` 增加落盘回调与 resume；`main.ts` 接入 checkpoint、重启续跑与导出台账。
- 验证：typecheck/lint 通过，61/61 Vitest 通过；端到端脚本验证“保存 1/2 块后强杀 → 重开只补剩余 1 块 → complete”，工作区结构完整。
- 恢复条件：输入指纹一致且 budget=4096；损坏的 conversion 视为未完成重跑；落盘失败抛 PersistenceError 直接中断。
- 已知限制：UI 无未完成任务入口（批次 C 补）；ZIP 工作区在解压目录；未做 Electron 手工中断旅程。
- 详见 docs/feature-a-persistence.md。未新增依赖、未调用真实模型、未执行 Git 写、删除或发布。


## 批次 B 交接（2026-11-03）

- 实现符号级覆盖：`engine/coverage.ts` 新增；`exporter.ts` 输出 `businessStubCheck` / `coverage` / `lineRetentionTooLow`；`eval.ts` 扩到 10 类。
- 口径：源业务符号必须 mapped，或在 unsupported 中按文件/行号/名称登记；空文件、纯注释、无声明、行保留率 <10%、任何 chunk 失败均判 failed。
- 验证：typecheck/lint 通过，68/68 Vitest，eval 10 类全部符合预期；`samples/hello` 真实导出 3/3 符号映射、businessStubCheck=passed。
- 已知限制：输出侧为正则识别，非仓颉语法解析；operator 符号差异可能误配；语义保留未验证。
- 详见 docs/feature-b-coverage.md。未新增依赖、未调用真实模型、未执行 Git 写、删除或发布。


## 批次 C 交接（2026-11-03）

- 实现工作台三项能力：`project:paste` IPC（单文件、≤512 KB、扩展名白名单、临时目录 `paste-*`）、输入文件树（chunk 归属/失败/不支持/输出路径）、导出前完整性摘要（原生确认框）。
- 空壳终判抽成 `coverage.ts` 的 `businessStubStatus`，导出清单与界面摘要共用，避免口径分叉。
- 修复一处顺序问题：确认框原先在保存对话框之后，取消保存会跳过确认；现改为先确认后选目标，且摘要用 `lastSummary ?? buildSummary(...)` 实时兜底。
- 验证：typecheck/lint 通过，68/68 Vitest，eval 10 类全部符合预期；用户手工完成「粘贴 → 转换 → 文件树 → 导出确认 → 目录导出」旅程。
- 已知限制：粘贴一次只支持一个文件；文件树不表达 include 依赖边；符号识别仍为正则。
- 详见 docs/feature-c-workbench.md。未新增依赖、未调用真实模型、未执行 Git 写、删除或发布。


## 批次 D 交接（2026-11-03）

- 把单文件 HTML 迁到 `packages/renderer` 的 Vite + React 工程：`App` 管状态，`FileTree`/`SummaryBar`/`CodeView`/`MonacoPanel` 分包，IPC 契约不变。
- 主进程改用自定义 `app://` 协议提供 `dist/renderer/`，CSP 收紧到 `script-src 'self'`；`contextIsolation`/`sandbox` 未回退。
- Monaco 用 `React.lazy` 动态 import，加载前显示 `<pre>`，ErrorBoundary 失败后降级；空 worker 规避 Vite 8 对 `?worker` 子路径的解析失败。
- 构建改为 Vite → esbuild；typecheck 同时检查根与 renderer。
- 验证：typecheck/lint 通过，12 文件 74 项测试，eval 10 类通过；首屏 1230/1074/1049 ms；用户手工确认界面无问题。
- 已知限制：renderer 产物约 13.5 MB（Monaco 全量语言包）、空 worker 无语言服务、未做打包。
- 详见 docs/feature-d-react.md。未执行 Git 写、删除或发布。

## 批次 E 交接（2026-11-03）

- 统一 Provider 契约：`ProviderError(kind/retryable/retryAfterMs)`；Mock 与 Ollama 共用 `LlmProvider`，普通 Error 仍一次性失败。
- 429/408/504/5xx/网络错误指数退避：默认 2 次重试、500ms 起、上限 8s，尊重 Retry-After（≤30s），等待期间可取消；404 等 4xx 与响应结构错误不重试。
- 单文件（含上下文）超预算不再 unassigned，改为 `overBudget` chunk，由 converter 按行缩块；依赖环仍整体不拆，超预算继续 unassigned。
- 报告新增 `retries[]`、`splits[]`，results/failedChunks 新增 `providerRetries`；失败原因带“已重试 N 次”。
- 验证：typecheck/lint、13 文件 80 项测试、eval 10 类全过；新增 `provider-robustness.test.ts` 6 项（429×2、429 耗尽、504/404、缩块成功、单行无法缩块、退避取消）。
- 详见 `docs/feature-e-provider.md`。未执行 Git 写、删除或发布。

## 批次 F 交接（2026-11-03）

- 新增脚本：`pnpm build`（Vite + esbuild + preload）、`pnpm e2e`（build 后跑 Playwright）、`pnpm run pkg`（electron-builder `--dir`）。注意 `pnpm pkg` 会被 pnpm 内置命令抢占，必须用 `pnpm run pkg`。
- `e2e/mvp.spec.ts` 两个用例：开发构建主旅程、`release/win-unpacked/XDtranC.exe` 打包产物主旅程；通过主进程替换 `dialog` 方法驱动原生对话框，仍走真实 IPC、转换与导出。
- 打包配置 `electron-builder.yml`：`win.target=dir`、`signAndEditExecutable=false`、`asarUnpack: **/*.wasm`；主进程外部依赖（web-tree-sitter / tree-sitter-wasms / yauzl / yazl）已提升为根 dependencies，否则 asar 缺包。
- 打包产物 `release/win-unpacked/XDtranC.exe` 已实际启动并完成一次 Mock 旅程（2 文件，manifest `status=complete`、`simulated=true`）。
- CJPM 目录结构**不在 MVP**（TechDesign 明确列为 Phase 2）；批次 G 的可选实现默认关闭，仅作圈外预研，不进入验收。
- 验证：typecheck/lint、80 项 Vitest、eval 10 类、Playwright 2 项全过。未执行 Git 写、删除或发布。
- 详见 `docs/feature-f-delivery.md`。

## 批次 G 交接（2026-11-03）

- CJPM（**圈外预研，非 MVP 验收项**）：`ExportOptions{cjpm, packageName}` 贯穿 `exportProject`/`exportReport`/`exportArchive`/CLI/桌面 IPC；默认 flat 完全不变，`manifest.layout` 与 `manifest.cjpm` 可观测，包名非法在写盘前拒绝。MVP 只做 C++ → 仓颉 `.cj` 草稿，不需要可构建工程。
- 桌面 UI 增加“生成 cjpm.toml（实验）”复选框与包名输入；preload 的 `export` 改为 `(format, options)`。
- 旧脚本修复：`smoke.mjs`、`export-boundary.mjs`、`ollama-e2e.mjs` 已从批次 D 前的 DOM id 改为 React 选择器，并适配“导出目录下再套 draft”的布局与 `.xdtranc/` 工作区。
- Ollama：离线 fixture 在新 UI 下通过；真实模型未验收（本机未安装 Ollama），runbook 见 `docs/ollama-acceptance.md`。
- 交付文档：`docs/feature-g-cjpm.md`、`docs/ollama-acceptance.md`、`docs/demo-guide.md`、`docs/distribution.md`、`docs/images/*.png`。
- 验证：typecheck/lint、全部 Vitest、eval、Playwright 2 项、三个桌面脚本全过。未执行 Git 写、删除或发布。
