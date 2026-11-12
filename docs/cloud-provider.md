# 云端 Provider（OpenAI 兼容）

> 状态：**代码已完成、单测通过、真实请求未验收**。
> 2026-11-05 决定：MVP 交付不依赖云端模型，云端接入作为可配置项保留，待拿到独立 API Key 与可达网络后再验收。

## 1. 为什么需要

MVP 的 Provider 只有 Mock 与本地 Ollama。内网/云端模型网关如果提供 OpenAI 兼容接口，可以不改转换逻辑，只增加一个 Provider。

## 2. 已实现

| 文件 | 内容 |
|---|---|
| `packages/engine/src/openai.ts` | `OpenAiCompatibleProvider`：`POST {baseUrl}/chat/completions`，Bearer 鉴权 |
| `packages/engine/src/openai.test.ts` | 7 项单测：200 / 429 / 401 / 500 / 缺 content / 非回环拒绝 / URL 校验 |
| `packages/engine/cloud-check.ts` | 一次性验收脚本，只读 `XDTRAN_API_KEY`，不读任何凭据文件 |

行为：

- 超时 1–600000 ms，支持 `AbortSignal`；
- 响应上限 4 MiB；
- `redirect: 'error'`，拒绝跳转；
- 429 / 408 / 504 / 5xx → 可重试；401 / 403 / 404 → 不可重试；
- 解析 `choices[0].message.content`，缺失或空串直接报 `invalid-response`；
- 非回环地址必须显式 `allowExternal: true`，否则拒绝构造。

## 3. 配置

| 项 | 来源 |
|---|---|
| `baseUrl` | `--base-url=` 或 `XDTRAN_BASE_URL` |
| `model` | `--model=` 或 `XDTRAN_MODEL` |
| API Key | **只读** `XDTRAN_API_KEY` 环境变量 |

示例：

```powershell
$env:XDTRAN_API_KEY = "<由你自己注入，不要写进文件>"
pnpm exec tsx packages/engine/cloud-check.ts --base-url=https://<网关>/v1 --model=<模型名> --input=samples/hello
```

## 4. 安全边界

- 脚本与 Provider **不读取** `auth.json`、配置目录或浏览器数据；
- 密钥只存在进程内存，不写日志、不写报告、不随导出物带走；
- 请求体只包含当前 chunk 源码 + `contextBundle` + prompt，不含无关文件、日志或设置；
- 错误信息不包含密钥；
- 外发前必须确认目标地址与数据范围；真实客户代码外发还需确认网关的“不训练 / 不留存 / ZDR”承诺。

## 5. 未完成

- 桌面 UI 的 Provider 下拉与 baseUrl/model/key 输入；
- CLI 的 `--provider=openai`；
- 一次真实模型验收记录；
- 独立 API Key 的申请与轮换策略。

## 6. 真实验收的前置条件

1. 目标地址在当前网络可解析（`Resolve-DnsName` 能出结果）；
2. 有一个可轮换的独立 API Key；
3. 只用 `samples/hello` 这类自建样例；
4. 结果写入 `docs/cloud-acceptance.md`（待创建），记录 `providerId / model / simulated / status / failedChunks`。

在此之前，MVP 验收仍以 Mock + 离线 fixture 为准，**不得声称云端模型已验证**。
