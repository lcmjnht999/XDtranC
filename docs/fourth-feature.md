# 第四片：安全目录导出与完整性清单

## 试用

本次已生成 outputs/hello-export，可直接查看 export-manifest.json 和 src/*.cj。
重新运行必须选择不存在的目标（已有目录一律拒绝）：

```powershell
npx.cmd --yes pnpm@10.30.3 export samples/hello --provider=mock --format=dir --out=outputs/hello-export-try
```

目标父目录必须已存在且不含符号链接/目录联接。参数 --json 返回清单；--budget-tokens=1 可演练零有效输出（仍需新的目标）。退出码 0=完整模拟导出，2=部分或零有效输出，1=错误，130=取消。

## 内容和指标

- src/ 保存通过校验的 .cj 草稿；export-manifest.json 是最终清单，README.md 解释用途。
- EXPORT-INCOMPLETE.json 是保留的开始标记，不删除；只有有效最终清单存在才表示结束。清单 status 仍可能为 partial 或 failed，不能仅以文件存在判定代码成功。
- 模拟样例：2 输入文件/6 行 → 2 输出文件/9 行，文件数比 1、行数比 1.5、空文件 0，simulated=true。
- 文件数比不是源码覆盖率，行数比不是语义保留率；businessStubCheck=not-verified，不能以空文件 0 声称没有业务空壳。
- unsupported/failedChunks/unassigned 随清单保留，零有效代码 status=failed，只输出报告，不声称成功。

## 写盘边界

不覆盖、不删除；目标不得与输入目录重叠。再次校验结构化输出、规范化路径、跨块重复/文件目录冲突、源 hash 和真实路径；创建目标使用排他 mkdir，文件使用 wx。
导出中断保留部分文件，缺少有效清单时视为未完成；请换新目录重试。失败目录不自动清理。
权限故障等错误会明确返回。不能承诺抵抗其他进程并发恶意替换路径的 TOCTOU 竞态；最终清单不是原子事务，崩溃留下截断 JSON 时必须当未完成。
本片无 ZIP、UI、真实 Provider、CJPM 配置、编译验证或发布；输出只是固定 Mock 源码草稿。

## 实际检查（2026-10-29）

- pnpm typecheck / lint / test：通过；35/35（前 26 项 + 导出 9 项）。
- 覆盖：实际写入与 hash/行数/数量、输入不变、已有目录/源重叠/联接拒绝、非法路径/重复/目录冲突、部分/零输出、源变化、长文件名导致中途写入失败、预取消及写入期间取消、CLI 0/2/1。
- 中途取消测试在 AbortSignal 检查点注入取消，未人工验证终端 Ctrl+C。
- 实际 CLI 导出到 outputs/hello-export 成功；清单已读回核对。git diff --check 通过，仅既有换行提示。
- 仅 Windows 本机检查；没有 Linux、磁盘耗尽或真实 ACL 拒绝实测。不把长文件名写失败测试说成覆盖全部 I/O 故障。
- 没有新增依赖、网络外发、Git 写操作、删除或发布。

## 交接和回退

新增 exporter.ts / exporter.test.ts / CLI export.ts；package.json 增加 export；更新交接文档和忽略演示产物目录。撤销时只回退本片差异，保留前三片与原有配置，助手不代执行 Git 写或删除。
下一步先试用，再批准下一片，不能把此 Mock 闭环当成完整 MVP。