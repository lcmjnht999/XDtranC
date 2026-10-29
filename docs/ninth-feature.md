# 第九片：桌面 Ollama 离线端到端验收

## 复现

```powershell
node packages/main/build.mjs
node packages/main/ollama-e2e.mjs
```

脚本启动真实 Electron，并在随机本机回环端口启动协议模拟服务。仅使用自建 samples/hello；原生路径对话框由测试替换返回值，其余通过界面操作。无需安装 Ollama 或下载模型。

## 已验证

- 成功响应：界面显示 Ollama / offline-fixture，输入转换后输出预览含测试草稿。
- 目录导出：清单 Provider/模型/文件数与预期一致，每个落盘文件内容和 SHA-256 与返回草稿一致。
- 自核查重试：每个 chunk 首次返回失败，第二次收到 retryIssues 后成功；断言调用数翻倍且重试问题实际传入请求。这不是 HTTP 限流退避测试。
- 请求中取消：服务收到请求后保持响应等待，点击取消，明确显示已取消，清空输出且禁止两类导出。
- 取消后恢复：再运行成功，排除取消状态污染下一次请求。

全部通过；另外重跑 typecheck、lint、Vitest 50/50 和原有 Electron smoke，均通过。新增 E2E 是独立脚本，不包含在 50 项 Vitest 数量内。没有发现需要修改业务实现的问题。

## 限制和产物

模拟服务返回人工构造草稿，不代表真实模型生成或语义正确。simulated=false 是 OllamaProvider 元数据，不能当作真实模型验收证据。输出明确含 OFFLINE FIXTURE 注释。
仅本轮目录导出做逐字节和哈希核对；原 smoke 覆盖 ZIP 导出但不做本片草稿 ZIP 逐条一致性核对。原生对话框未人工点选，Linux和仓颉编译未验证。
临时结果/截图留在 .deepworks/tmp/ollama-e2e-*，不删除，不作为正式交付包。第三方 Playwright 启动器 DEP0190 警告仍存在。
真实 Ollama 验收仍需可连接本机服务及准确模型名；本轮未探测旧失败端点、安装模型、访问云或执行Git写操作。