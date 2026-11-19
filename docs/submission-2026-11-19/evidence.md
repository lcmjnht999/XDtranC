# 验证证据索引

关联[需求追踪表](README.md)。所有“通过”均有下述限定范围；本文是会话验证记录索引，不伪装成自动生成的原始控制台日志。本次结项整理只改文档，复用代码未变化时的已有验证，不重新声称跑过整套应用检查。

## 已有检查记录

| 编号 | 实际结果与阶段 | 可审阅证据 | 适用限制 |
|---|---|---|---|
| E01 | 2026-11-19最新API校验阶段：两套TypeScript、ESLint、19文件148项Vitest、开发构建、cloud-e2e脚本语法均通过 | [API说明§9](../cloud-provider.md)、[MEMORY](../../MEMORY.md)；下方复现命令 | 对应当前应用代码；不是仓颉编译、真实模型或安装包验收。未保存独立完整控制台日志 |
| E02 | 上述148项中的解析、切分、转换、导出、覆盖、Provider、工作区、CLI、配置与组件回归通过 | 下方测试源码索引 | 测试替身与自建样例；不以测试数量代替需求覆盖或真实效果 |
| E03 | 最新全量测试包含Windows保存18项回归 | [workspace-save.test.ts](../../packages/engine/src/workspace-save.test.ts)、[保存加固记录](../workspace-save-hardening.md) | 含EPERM/EACCES/EBUSY恢复、耗尽/旧文件、边界变化、临时文件冲突、日志链接/不重放；非真实OS锁 |
| E04 | 最新开发版Electron本机协议旅程通过，截图Nbxaov | [cloud-e2e.mjs](../../packages/main/cloud-e2e.mjs)、[API说明§9](../cloud-provider.md)、下方截图 | 真实Electron进程与DOM点击；假密钥、自建样例、127.0.0.1 HTTP夹具；文件/确认对话框用替身，不代表人工批准真实外发 |
| E05 | 2026-11-19较早API阶段：10类离线完整性评测全部符合预期 | [保留的report.md](evidence/integrity-eval-report.md)、[report.json](evidence/integrity-eval-report.json)、[eval.ts](../../packages/engine/eval.ts) | 原始出处outputs/integrity-eval-aJV2AJ；晚于它的保存/页面校验补丁未重跑eval，不能称最新补丁eval复测 |
| E06 | 保存加固早期开发版：两次EPERM后恢复；持续报告保存失败6次后报错/禁止导出；解除注入后恢复 | [workspace-save-e2e.mjs](../../packages/main/workspace-save-e2e.mjs)、[保存记录](../workspace-save-hardening.md)、下方Mock截图 | 对应122项阶段，早于日志链接收尾与最新UI；不宣称该桌面脚本在最新补丁后重跑。当前保存补丁由E03覆盖 |
| E07 | 当前版本安装验收未完成 | [安装操作单](../install-acceptance-2026-11-17.md) | 操作单的100项为历史基线，应以E01替代；旧release可执行文件不能证明当前源码通过；本次不执行打包/安装 |

本次材料整理另做了文档检查：48处本地链接目标存在；5份证据副本SHA-256与原件一致；JSON摘要确有10类预期通过；原PRD相对HEAD无改动；`git diff --check`退出0，仅有既存的LF/CRLF转换提示。新文档也单独检查尾随空白及冲突标记。没有为文档修改重新运行应用测试或构建。

## 测试源码与核对重点

| 需求 | 测试入口 | 有意义的断言 |
|---|---|---|
| R01 | [index.test.ts](../../packages/engine/src/index.test.ts)、[archive.test.ts](../../packages/engine/src/archive.test.ts) | 源hash不变；依赖/位置；2000行合成规模；ZIP穿越、CRC、大小/条目限额与冲突拒绝 |
| R02 | [chunker.test.ts](../../packages/engine/src/chunker.test.ts)、[provider-robustness.test.ts](../../packages/engine/src/provider-robustness.test.ts) | 传递声明不含函数体、预算/依赖环、跨目录声明实现不拆散；缩块、单行超限与取消 |
| R03、R09 | [converter.test.ts](../../packages/engine/src/converter.test.ts)、[provider-robustness.test.ts](../../packages/engine/src/provider-robustness.test.ts) | schema/selfCheck问题进入下一次请求；最多3次；失败/依赖失败不复用假成功；429退避/耗尽、504/404区别 |
| R07、R10、R11 | [App.test.tsx](../../packages/renderer/src/App.test.tsx)、[apiConfig.test.ts](../../packages/shared/src/apiConfig.test.ts)、[provider-config.test.ts](../../packages/main/src/provider-config.test.ts) | App19项、共享5项、主配置4项；立即清空输入、拒绝原始输入回显、迟到响应隔离、参数切换、错误字段与IPC绕过拒绝 |
| R08、R18 | [coverage.test.ts](../../packages/engine/src/coverage.test.ts)、[exporter.test.ts](../../packages/engine/src/exporter.test.ts)、[export-target.test.ts](../../packages/engine/src/export-target.test.ts) | 类型不能由同名函数冒充；注释/字符串不计符号；目录边界、拒绝覆盖、内容hash、源变化与中断标记 |
| R11、R12 | [session-key.test.ts](../../packages/main/src/session-key.test.ts)、[openai.test.ts](../../packages/engine/src/openai.test.ts)、[cloud-cli.test.ts](../../packages/engine/src/cloud-cli.test.ts) | 会话3项/API9项；完整地址绑定、不读回/序列化、替换/清除；双斜杠不改主机、重定向拒绝、环境变量CLI路径不泄露 |
| R13 | [workspace.test.ts](../../packages/engine/src/workspace.test.ts)、[workspace-save.test.ts](../../packages/engine/src/workspace-save.test.ts) | 指纹恢复、损坏状态拒绝、保存失败中断；独占临时文件、有限重试、保留旧字节、边界变化中止、日志追加不重放 |

其他测试包括Ollama协议及FileTree/SummaryBar组件；148为整套总数，不能与表内部分模块数量再次相加。

## 开发版旅程具体覆盖

E04逐项检查了：无效地址/模型/超时和IPC绕过拒绝且零请求；提交后密码清空、无效替换保留旧密钥；按Provider保留非敏感页面参数；修改地址/切换时清除未提交输入；地址绑定、主动清除、忽略桌面环境密钥、退出后失效；外发确认拒绝零请求；协议成功、自核查重试、取消后新运行恢复；401正文不回显；目录/ZIP内容及新工作区状态/事件/报告不含测试密钥。

本机协议响应是手工构造的固定内容，不是模型。测试将非夹具fetch拒绝，并替换原生对话框返回值。`simulated=false`只说明使用了实际适配器，不能据此声称调用过真实模型。扫描仅证明指定测试产物中没有指定假密钥，不等于独立安全审计。

## 保留的演示截图

下列图片是已查看的原截图副本，密码框为空，仅包含回环服务和自建样例；图中本机路径用于说明来源。没有复制真实密钥、私有项目或运行日志。截图只能证明该时刻的界面，完整行为应看脚本断言与检查记录。

| 图片 | 来源 / 版本阶段 | 应观察的结果 |
|---|---|---|
| [API无效配置](evidence/api-invalid-config.png) | `.deepworks/tmp/cloud-e2e-Nbxaov/invalid-config.png`，最新UI | 超时1.5提示必须整数；开始转换灰显；密码框为空 |
| [API协议完成](evidence/api-protocol-complete.png) | 同一Nbxaov目录的`success.png`，最新UI | 模型offline-fixture、密码为空；文件2/2但符号1/3、空壳不通过。图名“完成”只表示协议转换结束 |
| [Mock保存恢复](evidence/mock-save-recovered.png) | `.deepworks/tmp/workspace-save-e2e-hGHrpZ/success.png`，早期保存补丁 | 模拟完成、符号3/3，仍明确未验证仓颉编译；不作为最新页面截图 |

## 本机复现入口（尚非本次整理的新跑结果）

在仓库根目录PowerShell中逐条执行，依赖已存在时无需下载。任何一步非零即停止，记录实际错误，不预填通过。

```powershell
node node_modules/typescript/bin/tsc --noEmit
node node_modules/typescript/bin/tsc --noEmit -p packages/renderer/tsconfig.json
node node_modules/eslint/bin/eslint.js packages
node node_modules/vitest/vitest.mjs run --no-file-parallelism --testTimeout=30000
node --import tsx packages/engine/eval.ts
node packages/main/build.mjs
node packages/main/cloud-e2e.mjs
node packages/main/workspace-save-e2e.mjs
```

以上两套E2E新建独立临时目录，使用开发构建，不执行安装打包。cloud-e2e启动仅回环的HTTP协议夹具；workspace-save-e2e阻断模型fetch。eval生成新的ignored输出报告，不覆盖历史报告。测试/构建可能需要环境批准子进程启动；本机pnpm入口曾触发依赖检查并因无TTY中止，因此这里直接调用现有本地工具，不使用会自动下载的npx入口。

不将通用`pnpm e2e`作为本材料复现命令：当前套件含固定路径旧打包exe的用例，并会清理固定临时目录；它不能证明本轮源码的安装包结果。真实API验收脚本也不在本次演示入口内。

已有警告：Vite >500kB分块、Playwright启动DEP0190。保存E2E早期调试上下文动态import失败曾修正后通过；占用错误是注入，不是定位出OS锁来源。Linux、真实服务合规、业务语义、cjc/CJPM、当前安装版均无通过证据。
