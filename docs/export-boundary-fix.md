# 桌面 ZIP 导出源码边界修复

已获用户批准，修复收口报告中桌面直接打包临时draft导致漏检原始源码目录的问题。engine/archive.ts新增共享validateExportTarget，CLI exportArchive复用；桌面在生成导出暂存数据前对selected与model.root分别校验，目录输入和ZIP解压后的模型目录都受保护。已有目标拒绝覆盖，父路径拒绝链接，最终写ZIP仍使用wx。

实际检查：typecheck、lint、Vitest 51/51通过；重新构建后 export-boundary.mjs、smoke.mjs、ollama-e2e.mjs 三个独立Electron脚本通过，不计入51项。

新增单测覆盖源码根/嵌套/归一化路径、Windows大小写、相邻外部目标和ZIP文件覆盖拒绝。新增桌面测试用临时复制的自建hello样例：根目录及include子目录的ZIP目标均拒绝且不存在，输入文件树及全部文件字节不变；外部ZIP导出成功；ZIP输入原文件拒绝覆盖，外部导出成功且原ZIP字节不变。

复现新增界面检查：

```powershell
node packages/main/build.mjs
node packages/main/export-boundary.mjs
```

原生选择对话框返回值为测试替换，按钮操作在真实Electron执行。临时样例和导出结果保留在.deepworks/tmp/export-boundary-*，不删除。仅Windows验证；没有解决并发恶意目录替换的TOCTOU竞态，不将预检声称为原子安全保证。第三方启动器DEP0190警告仍保留。

没有新增依赖、真实模型调用、Git写操作、删除或发布。其余收口缺口不变。回退须同步撤回共享函数及调用处，不建议恢复已知缺边界实现。