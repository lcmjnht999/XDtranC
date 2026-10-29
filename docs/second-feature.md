# 第二片：文件级预算切分 CLI

## 试用

在仓库目录的 PowerShell 中执行：

```powershell
npx.cmd --yes pnpm@10.30.3 chunk samples/hello --budget-tokens=4096
npx.cmd --yes pnpm@10.30.3 chunk samples/hello --budget-tokens=4096 --json
npx.cmd --yes pnpm@10.30.3 chunk samples/hello --budget-tokens=1
```

前两条预期 complete：2 个 chunk，include/math.hpp 先于 main.cpp；后者依赖前者并携带类型/成员声明摘要，未分配为 0。
第三条预期 partial、退出码 2：两个文件均有未分配原因，不会强拆或静默丢弃。参数非法/路径错误退出码 1；完整结果退出码 0。Ctrl+C 请求取消，CLI 取消返回 130。
可将 samples/hello 换成带引号的本地目录。不写入输入目录，不调用模型。
若要重定向纯 JSON，可用 pnpm --silent chunk，避免 pnpm 的脚本启动提示混入标准输出。

## 实现与边界

- include 图强连通分量整体处理，依赖优先、同目录贪婪聚合；结果顺序稳定。
- 每个已发现源码文件恰好分配一次或进入 unassigned；编码/语法错误、源 hash 改变、不可读取和超预算均明确呈现。依赖未分配的文件也不伪装成功。
- contextBundle 包含传递 include 文件的基础声明摘要及位置；成员带作用域提示，不包含函数体。不代表完整类型/调用语义或可直接编译的声明文本。宏、模板沿用解析问题清单。
- 估算器 utf8-bytes-v1：源码 UTF-8 字节数 + JSON 上下文 UTF-8 字节数，每字节计一个估算单位，注释不打折；默认预算 4096。只保证该估算值不超过预算，不代表真实模型 token 数，不包含未来系统提示或响应预算。
- 单文件/SCC 超预算不强拆，列入未分配。无 ZIP、持久化、桌面、真实模型或导出。
- AbortSignal 在扫描、文件读取之间和分量处理之间检查；同步解析单文件不能即时抢占。
- 文件读取前校验路径和基线 hash；不保证抵抗并发恶意替换竞态。仅 Windows 本机检查，Linux 未检查。

## 实际检查（2026-10-29）

- 本地 tsc --noEmit、eslint packages：通过。
- vitest run：17/17（第一片 8 项 + 第二片 9 项）。
- 新增覆盖：确定性/文件覆盖/hash 不变、传递依赖及无函数体摘要、SCC 和超预算、上下文预算、孤立文件、编码/语法/未知 include、源文件变化、非法预算、提前和处理中取消、CLI JSON 与 0/2/1。
- 20 文件共 2000 行自建样例：全部分配，最后一次解析加切分 128ms；不是性能承诺。
- pnpm chunk 样例命令实际成功；pnpm install --offline --frozen-lockfile 成功。pnpm 提示 esbuild 构建脚本被忽略，但当前 CLI 和测试已实际成功，未擅自放开脚本。
- git diff --check 通过（只有既有换行转换提示）。没有 Git 写操作、发布、Provider 调用、删除数据或新增依赖。

## 交接与回退

先试用小预算与正常预算，确认 chunk/未分配清单符合预期；反馈后再批准第三片。
本片新增 chunker.ts、chunker.test.ts、CLI chunk.ts，并修改共享契约、解析摘要、package scripts/exports 及交接文档。若回退，只回退本片变动；不要覆盖第一片和原有未跟踪配置。助手不代执行 Git 写或删除。