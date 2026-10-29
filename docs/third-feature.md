# 第三片：离线转换流程与自核查重试

## 试用

```powershell
npx.cmd --yes pnpm@10.30.3 convert samples/hello --provider=mock --json
npx.cmd --yes pnpm@10.30.3 convert samples/hello --provider=mock --budget-tokens=1
```

第一条预期 simulated=true、complete、2 个已处理块、每块 attempts=1，failedChunks/unassigned/unsupported 均为空。JSON 的 .cj 代码只是固定模拟数据，没有写盘，也没有编译验证。
第二条预期 partial、退出码 2，预算不足文件保留在 unassigned 和 unsupported。
未知源码仅报告不支持，不伪造转换。CLI 必须显式指定 --provider=mock，其他 Provider 拒绝。纯 JSON 可使用 pnpm --silent convert。

## 范围

- 唯一运行时输出契约在 packages/shared/src/outputSchema.ts；输出路径拒绝绝对路径、上级穿越、反斜杠、Windows 特殊/保留名，重复路径按 NFC + 不区分大小写检测。
- 校验空代码/仅注释、自核查字段、confidence、unsupported。只做结构与基础内容检查，不证明业务逻辑完整或语义正确。
- schema/自核查/候选输出冲突失败最多重试 2 次（总调用最多 3），携带具体问题；最终写入 failedChunks 和逐文件 unsupported。
- Provider 异常直接报失败，本片不做网络退避/切换；依赖块失败阻断下游。成功处理但含 unsupported 仍是 partial。
- Provider 仅接收当前块源码、声明上下文、提示、重试问题。每次调用创建独立副本。读源码前重新验证路径和 hash；没有设置/日志/凭据载荷。
- 取消在阶段和调用边界检查。实际 CLI 仅用立即返回的 Mock；未来远程 Provider 必须主动响应 AbortSignal，本片不保证抢占不响应取消的 Provider。
- 没有真实模型、外发、持久化、导出、UI、编译或行为测试。Windows 已测，Linux 未测。当前字段无法证明多对多源码到输出覆盖率，不能宣称完整性验收完成。
- 不承诺抵御其他进程并发恶意修改路径的竞态；源码一致性以本次读取快照为准。

## 实际检查

2026-10-29：pnpm typecheck / lint / test 全部通过；26/26（前两片 17 项 + 第三片 9 项）。
新增覆盖固定/未知样例、schema 与自核查带问题重试、超限次数、非法/重复路径、空代码、跨块冲突、依赖失败、源变化、未分配保留、取消、Provider 异常、无关文件 unsupported 拒绝、CLI JSON 与 0/2/1。
实际执行文首正常预算 CLI，得到 2 个模拟结果，零失败。git diff --check 通过，仅既有换行提示。
首次并行测试出现 Windows CLI 子进程退出码 2147483651 和 5 秒超时；独立 CLI 正常，串行测试通过。测试脚本已设 --no-file-parallelism --testTimeout=30000，最终使用该脚本再次 26/26 通过。并行异常的底层原因未确证，不声称已修复 Node/系统问题。

## 交接与回退

新增 outputSchema.ts、provider.ts、converter.ts、converter.test.ts、CLI convert.ts；修改 package.json 的 convert/test 命令和交接文档，无新依赖。
只回退本片文件/差异即可撤销该功能，保留前两片与原有用户配置。没有执行 Git 写、删除、发布或真实 Provider 调用。
请先试用；下一片必须重新提计划和批准，不自动接入真实 Provider。