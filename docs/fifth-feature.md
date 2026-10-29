# 第五片：本机 Ollama 最小接入（真实试跑待验收）

## 状态

适配器和 convert CLI 已实现；类型检查、lint、40/40 测试通过（原 35 + 新增 5）。测试使用回环 HTTP 测试服务器，不是真实模型。
两次探测 http://127.0.0.1:11434/api/tags 均无法连接。用户选择服务已启动，但未返回具体模型名；尚未真实发送样例，不能声称真实转换成功。

## 使用

先在本机确认 Ollama 已运行，并通过 ollama list 查看已安装模型。不自动安装或拉取模型。

```powershell
npx.cmd --yes pnpm@10.30.3 convert samples/hello --provider=ollama --model=<已安装的模型名> --timeout-ms=120000 --json
```

可传 --endpoint=http://127.0.0.1:11434（默认）；只允许 HTTP 127.0.0.1 或 [::1] 根地址，不允许域名、凭据、重定向或非回环端点。必须明确给出模型名。不要照抄占位符。
真实试跑授权范围仅为自建 samples/hello；其他私有项目需另行确认。确认模型为本机推理而非代理到云端，工具仅限制所连接地址，无法证明服务内部不转发。

## 实现边界

- /api/chat，stream=false，format=json，temperature=0；载荷仅当前块源码、上下文、提示及重试问题。
- 默认 120 秒超时，可设 1～600000ms；响应上限 4 MiB，支持 AbortSignal，拒绝重定向。
- 不在错误信息中输出服务响应正文；HTTP/网络异常明确失败，不自动切换 Provider。
- 返回 message.content 后复用现有 schema/自核查重试；协议层故障直接失败。simulated=false 只表示使用真实协议适配器，不证明模型实际完成或编译通过。
- CLI 本片只扩展 convert；export 仍只支持 Mock，真实产物导出暂未接入。
- 未新增依赖，未下载模型，未执行 Git 写、发布、删除或外部网络调用。

## 检查与后续

实际执行 pnpm typecheck、lint、test：40/40 通过。新增覆盖回环边界、模型/超时参数、HTTP UTF-8/载荷、404/重定向/非法 JSON/缺失字段/超大响应、超时与取消、协议到转换重试集成。
真实模型可用后，仅对 samples/hello 运行上述命令并记录模型、完成/失败块与 unsupported；不声称仓颉编译成功。
回退范围：新增 ollama.ts/ollama.test.ts 与 convert.ts 参数扩展；保留此前四片。