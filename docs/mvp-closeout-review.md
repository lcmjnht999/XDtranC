> 后续评测更新：已增加 pnpm eval 和六类离线结构评测，见 [integrity-eval.md](integrity-eval.md)。下文缺少eval入口的描述为历史快照，语义评测缺口仍有效。

 > 后续修复更新：桌面ZIP原始源码边界问题已修复并通过新增Electron回归，见 [export-boundary-fix.md](export-boundary-fix.md)。下文为修复前收口快照，其他缺口仍有效。

# MVP 收口核对（2026-10-29）

## 结论

当前是可运行的离线验证原型，不是已验收的完整 MVP。第1～9片各自完成不等于覆盖全部设计。真实模型只是缺口之一。依据为 TechDesign-XDtranC-MVP.md（2026-10-22范围修订）、当前源代码与前序测试记录；本轮仅静态核对和文档更新，没有重新运行测试或修改业务实现。

编译验证、编译修复、CJPM行为测试、用户反馈修复、界面美化、富可视化仍为圈外，不因本次核对加入范围。以下优先级是建议，不是新增实施授权。

## 验收矩阵

| 设计项 | 当前证据与实现 | 状态 / 缺口 |
|---|---|---|
| F1 目录/ZIP导入、只读基线 | engine/index.ts、archive.ts；hash、UTF-8错误、语法错误、ZIP路径/CRC/限额检查 | 核心已实现，已有离线测试；ZIP仅export CLI及桌面入口支持 |
| F1 依赖/符号 | index.ts:68-90，声明摘要、相对include | 部分；没有完整符号引用边、include搜索路径配置，不能声称跨文件语义完备 |
| F2 SCC依赖排序、上下文、预算 | chunker.ts:17-91 | 文件级切分已实现；UTF-8字节估算，不是模型tokenizer；超限登记unassigned，不自动回拆；桌面预算固定4096 |
| F3 schema/自核查重试/失败清单 | converter.ts:35-58、shared/outputSchema.ts | 已实现；默认最多3次调用；只校验结构、非空和自报结果，不证明业务保留 |
| F3 本地Provider | Ollama适配与桌面参数入口；第8/9片记录 | 协议离线验证完成，真实模型转换未验收 |
| F3 候选池、兜底、上下文收缩 | 当前仅Mock/Ollama；Provider异常直接失败 | 未实现候选OpenAI兼容接入、HTTP退避、超限自动缩块；候选合规/地址未确认，不得擅自外发或自动切换 |
| F3 仓颉提示规约 | converter.ts:38 单段通用提示 | 尚无设计所述语言规约/映射表节选，需确认目标子集 |
| F4 目录/ZIP导出 | exporter.ts、archive.ts、main.ts | 已有离线输出；仅src/*.cj与清单/README，没有CJPM配置，项目结构待消费方确认；不要求编译验证 |
| F4 完整性 | exporter.ts:65-69 | 有文件数比、行数比、空文件数、unsupported；业务空壳标记not-verified，不能以空字节数=0证明无业务空壳 |
| F4 工作台 | main.ts、renderer/index.html | 可选路径/运行/取消/文本预览/导出；缺粘贴临时项目、文件树、完整性报告摘要；原生对话框未人工验收 |
| 技术栈 | HTML内联脚本/样式、esbuild | 与React/TS/Vite、动态Monaco设计不同；前序批准最小原型不等于正式变更整个设计 |
| 状态机/持久化 | main.ts:14 内存状态，archive.ts:14-17工作目录临时文件 | 无checkpoint、启动恢复、JSONL事件、持久化设置/任务报告；临时数据在cwd/.deepworks/tmp，与产品.xdtranc工作区设计不一致 |
| 测试/交付 | 根package.json、独立Electron脚本 | 前序50项Vitest及两套桌面脚本通过；无根e2e/eval/build/pkg脚本、正式eval集/覆盖率证据、Linux验收或安装包验证 |

## 优先风险（静态发现，未执行破坏性复现）

### 1. 桌面 ZIP 最终目标缺原始源码边界校验——建议先修

[main.ts](../packages/main/src/main.ts#L30-L35) 将结果导出到临时draft，再直接writeZip(draft, 用户目标)。[writeZip](../packages/engine/src/archive.ts#L60-L67)只比较draft与目标，不知道原始model.root。CLI的[exportArchive](../packages/engine/src/archive.ts#L69-L75)另有原始源码目录检查，桌面未调用。

因此桌面选择原始源码目录下一个不存在的新ZIP路径，从该调用链看不会被同等拒绝，可向只读输入树新增文件。已有目标仍有wx拒绝覆盖；这不是已证明的任意覆盖漏洞。本轮未往用户源码写入测试ZIP。

建议统一最终导出目标校验并补桌面拒绝用例，覆盖目录输入、ZIP输入及正常外部目标；修复需另行批准。

### 2. 非空/自核查不等于业务完整——阻止“无空壳”验收结论

[outputSchema.ts](../packages/shared/src/outputSchema.ts#L19-L25)拒绝空白/仅注释；[converter.ts](../packages/engine/src/converter.ts#L44-L50)仅在输出完全为空时要求所有源文件登记unsupported。有一个非空输出并不建立每个源文件的覆盖映射。多输入合并输出可以合法，不能简单要求一一同名；但目前没有证据证明未遗漏业务。

[exporter.ts](../packages/engine/src/exporter.ts#L65-L69)已诚实标明 businessStubCheck=not-verified。建议先定义覆盖关系/负面样例及人工复核标准，不通过“行数比高”伪造语义验收。

## 建议顺序

1. 先批准修复桌面ZIP原始源码边界及回归，避免继续演示时写入输入树。
2. 明确完整性验收口径、仓颉输出结构和样例集；补独立eval入口及负面例子。
3. 按设计补持久化/恢复、最小报告和输入输出能力，或由用户明确批准范围/技术栈变更，不能静默删项。
4. 服务就绪后只用已授权samples/hello真实试跑；后续验收库与外发另行授权。
5. Linux/打包分发按独立审批流程推进；助手不代跑Git写或发布。

## 可复现检查命令

以下是已有入口，本轮未重跑；最近通过记录见 ninth-feature.md（50项Vitest + 两个独立桌面脚本，不应相加为50项桌面测试）。

```powershell
npx.cmd --yes pnpm@10.30.3 typecheck
npx.cmd --yes pnpm@10.30.3 lint
npx.cmd --yes pnpm@10.30.3 test
node packages/main/build.mjs
node packages/main/smoke.mjs
node packages/main/ollama-e2e.mjs
```

PowerShell逐条执行，遇失败先停止。本轮仅git diff --check检查文档空白；未测真实模型、未安装依赖、未访问网络、未改PRD或技术设计、未执行Git写操作。当前存在多项未提交/未跟踪文件，报告依据工作区，不宣称对应已提交发布版本。