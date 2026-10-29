# 第六片：ZIP 安全导入与导出

## 运行

```powershell
npx.cmd --yes pnpm@10.30.3 export samples/hello --provider=mock --format=zip --out=outputs/hello-archive-try.zip
npx.cmd --yes pnpm@10.30.3 export <C++输入.zip> --provider=mock --format=dir --out=outputs/zip-import-try
```

目标必须不存在且父目录已存在。第二条占位符须换为实际 C++ ZIP；不要把导出的仓颉 ZIP 当作 C++ 输入。ZIP 可位于输入根或包含顶层目录；保留包内路径，不自动剥离顶层目录。Mock 仅识别固定路径和内容，额外顶层目录可能成为 unsupported，而非真实模型转换。
本片只扩展 export 命令接受 ZIP，parse/chunk/convert 独立命令仍接受目录。
实际产物 outputs/hello-archive.zip：2 个模拟 .cj 草稿及既有完整性清单/说明。不是编译通过或完整 MVP。

## 安全和资源边界

- 使用锁定 yauzl 3.2.0/yazl 3.3.1；ZIP 压缩包最多 32 MiB、条目最多 2000、单文件最多 8 MiB、总解压最多 64 MiB。
- 解压前检查路径、重复/NFC/大小写冲突、文件目录冲突、链接/特殊类型、加密、声明大小；逐块解压核实实际大小，独立校验 CRC32。先全部检查，再落盘。
- 解压与导出暂存位于 .deepworks/tmp/，拒绝目录联接；不删除残留、不覆盖目标，输出使用 wx。
- 禁止把 ZIP 输出写到源码目录内部；导入包不修改。嵌套 ZIP 只作为普通文件，不递归解压。
- ZIP 完成写入之前中断可能保留不完整目标，必须视为失败并换新路径重试；没有原子事务或断点恢复。临时数据累积需用户后续自行清理。
- 有界缓冲解压，不是完全流式内存模型；没有保证抵御并发恶意修改路径的 TOCTOU 竞态。仅 Windows 检查，未验证全部 ZIP 工具兼容性或历史中文编码。
- 导出打包输入仍受文件/总量限制；最终 ZIP 大小可因封装开销略高于输入字节总和。

## 实际检查

pnpm typecheck/lint/test：最终 48/48 通过（原40+新增8）。新增覆盖目录/ZIP 内容与解析一致、导出清单往返、ZIP 输入导出、非法路径/链接/冲突、四类资源限额、损坏/CRC、覆盖拒绝/预取消。
实际 pnpm export samples/hello --provider=mock --format=zip --out=outputs/hello-archive.zip 成功。
实现补边界时一次 PowerShell 字符串转义导致语法错误，已修复，最终类型检查、lint 和全套回归重跑通过。
没有 ZIP 写盘中途取消、磁盘耗尽、Linux 实测；现有目录导出的写盘中途取消仍有回归覆盖。
依赖安装提示 esbuild 构建脚本被忽略，未放开脚本；CLI 和测试实际成功。

## 交接

第五片真实 Ollama 试跑仍被端点/模型名阻塞，本轮未探测或调用真实模型。新增 archive.ts/archive.test.ts，修改 export CLI、依赖与锁文件。没有 Git 写、删除、发布或源码外发。只下载获准公共依赖。
下一步先试用，再确认下一片；不要自动接入模型或宣称全部 MVP 完成。