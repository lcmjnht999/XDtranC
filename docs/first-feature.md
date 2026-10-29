# 第一片：只读 C++ 目录解析预览

## 运行（PowerShell，仓库目录内）

```powershell
npx.cmd --yes pnpm@10.30.3 install --frozen-lockfile
npx.cmd --yes pnpm@10.30.3 parse samples/hello
npx.cmd --yes pnpm@10.30.3 parse samples/hello --json
```

概要预期：complete；2 文件、6 行、4 声明、2 include、0 问题。
解析自己的目录：把 samples/hello 替换成带引号的目录路径。不要输入压缩包。
JSON 包含源文件 SHA-256、行数、声明位置、依赖及 unsupported；CLI 不写任何项目文件。
退出码 0=完整，2=部分结果（必须复核问题清单），1=致命错误。

## 实际检查

```powershell
npx.cmd --yes pnpm@10.30.3 typecheck
npx.cmd --yes pnpm@10.30.3 lint
npx.cmd --yes pnpm@10.30.3 test
```

2026-10-29，Windows / Node 24.20.0 / pnpm 10.30.3：以上全部成功，8 项测试通过。
覆盖样例声明/位置/include/hash 不变、中文空格/CRLF/空文件、忽略目录、无效路径/无源码、非法 UTF-8、语法错误、未解析及越界 include、模板警告、目录联接拒绝、2000 行、CLI 0/1/2 退出码。2000 行最后一次耗时 67ms，仅本机自建样例数据，不是性能保证。

## 限制

- 仅 F1 子集：没有 ZIP、源码复制、持久化、桌面、切分、模型调用或导出。
- tree-sitter 仅语法解析，不能证明 C++ 或仓颉可编译、语义等价；complete 只表示本片未检测到问题。
- include 仅按当前文件目录查找，不读取系统头、不解析编译参数/include 搜索路径。
- 声明覆盖基础 class/struct/函数定义和函数声明，不保证复杂声明和宏语义；模板和函数宏显式提示。
- UTF-8（可带 BOM）；非法编码文件记录但不计行。空文件 0 行，末尾换行不额外计行。
- 不跟随符号链接/目录联接；路径检查不承诺抵抗其他进程并发恶意替换文件的竞态。
- Windows 已检查，Linux 未检查；无 UI，因此未执行桌面/E2E。未调用 Provider。
- 测试临时数据保留在 .deepworks/tmp，不进入提交；本次没有删除任何数据。

## 下一步与回退

请先试用样例和一个自选本地目录，反馈数量、声明和问题清单是否符合预期，再批准下一片计划。
若不保留本片，请先核对 git diff 和未跟踪文件清单，仅回退本次新增配置/packages/samples 和文档变动；原有 .opencode/、opencode.jsonc 不属于本次改动。助手不会代执行 Git 写操作或删除。