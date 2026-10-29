# 离线完整性评测入口

运行 `npx.cmd --yes pnpm@10.30.3 eval`。新增 packages/engine/eval.ts，直接复用解析、切分、转换、导出与共享schema，没有另建生产契约或改变业务实现。

六类用例：正常、空输出、纯注释、部分chunk失败、自核查耗尽、全部登记unsupported。输入为本机临时创建的两个独立自建C++函数，Provider为人工响应，不调用模型。断言状态、三次重试上限及问题传递、失败/unsupported数量和导出清单；核对输出文件集合、内容、字节数、SHA-256、行数及比率，复核输入hash不变。

每次生成新的 outputs/integrity-eval-随机后缀/report.md 和 report.json，不覆盖历史报告。测试输入/中间导出放在.deepworks/tmp/integrity-eval-*。评测断言失败写入JSON并以退出码1结束；全部符合预期退出0。环境初始化失败可能直接退出且无报告。报告中的failed导出状态是负面用例预期，不代表评测本身失败。

本轮实际：6/6用例符合预期；typecheck/lint通过；Vitest 51/51通过。6类评测独立运行，不计入51项。产物 outputs/integrity-eval-jseubj/report.md 和 report.json。

边界：仅结构完整性，不证明无业务空壳、语义保留、真实模型生成或仓颉编译成功。文件数比不是源文件覆盖率；行数比不是语义保留率。业务覆盖关系和语义评测仍待定义。本轮不涉及UI改动，因此未重跑Electron；未增加依赖、访问外部服务、执行Git写或删除。