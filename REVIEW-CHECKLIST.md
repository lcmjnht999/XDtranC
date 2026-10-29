# Review Checklist

Do not mark work complete until the relevant checks pass. 标注「不适用」的项已按本项目范围裁剪，不是漏项。

## Basic Checks

- [ ] Diff 聚焦本次任务，未重写无关文件（尤其是 `docs/` 下的 PRD/Tech Design 原文）。
- [ ] 没有把 `.xdtranc/`、导出包、`samples/` 里的内部验收库带进提交。
- [ ] 未暴露密钥、token、私有日志、源码全文到日志/报告/导出物。
- [ ] 需要授权的动作（外部网络外发、切换非候选 Provider、打包分发、覆盖已有导出目录、删除数据）已确认「动作 + 目标」被授权，且记录在案。
- [ ] 相关单测/类型检查通过，或失败原因已说明；没有为了让检查变绿而弱化断言。
- [ ] UI 改动在 `pnpm dev` 里实际点过（导入 → 切分 → 转换 → 导出至少一遍）。
- [ ] 报告里没有把「未运行」写成「已通过」。

## 架构与边界

- [ ] `packages/engine` 没有 import `electron` 或渲染层代码（否则 CLI 失效）。
- [ ] 写盘全部经过 `workspace/` 服务的路径校验：工作区限定 `.xdtranc/`，导出路径 `resolve` 后做前缀校验。
- [ ] 结构化输出只引用 `packages/shared/src/outputSchema.ts`，没有第二份 schema 副本。
- [ ] `contextIsolation: true` / `nodeIntegration: false` / `sandbox: true` 未被改动；新 IPC 通道走 preload 白名单。
- [ ] 没有引入数据库、HTTP 服务、账号体系等范围外层次。

## Security

- [ ] 依赖审计（`pnpm audit` 或等价）——无未处理的高危项；内网镜像不可达时记录为限制而非跳过。
- [ ] 导入的目录/压缩包路径、导出目标路径、zip 内条目名都做了边界校验（zip-slip / 目录穿越）。
- [ ] API Key 只存本机凭据存储，未出现在日志、报告、`export-manifest.json`、导出包与 git 历史里。
- [ ] 日志脱敏：不记录源码全文、不记录完整 prompt、不记录密钥（可留 hash 与 token 计数）。
- [ ] 鉴权 / 限流 / 多租户 / 支付相关检查：**不适用**（本地单用户桌面工具，无 HTTP 服务与账号体系）。

## AI Checks

本项目产品内含 LLM 转换，以下全部适用。

- [ ] 模型可见数据有记录：仅当前 chunk 源码 + `contextBundle` + prompt。
- [ ] 未发送：API Key、日志全文、与当前 chunk 无关的文件、`settings.json`、验收库以外数据。
- [ ] chunk 源码、模型输出、`unsupported` 说明按「不可信数据」处理，未当作指令执行。
- [ ] 受影响路径覆盖：正常转换、schema 解析失败、`selfCheck.passed=false`、限流/超时、上下文超限、鉴权失败、自核查重试超限。
- [ ] 失败路径显式：进 `failedChunks` / `unsupported`，带源位置，UI 与导出清单都能看到；没有静默丢弃。
- [ ] 没有用删业务逻辑或降低自核查标准的方式换取通过。
- [ ] Provider 的「不用于训练 / ZDR」承诺在接入前已确认，未确认的模型未被静默使用。
- [ ] 日志/报告/trace 不含密钥与完整源码。

## Final Evidence

最终回复应包含：

- 改动的文件
- 实际跑过的命令
- 单测 / typecheck / build / 浏览器或应用内验证结果
- Mock Provider 或评测集结果（如适用）
- 剩余风险与未验证的部分（包括「本 MVP 不保证产物可编译」这一事实）
