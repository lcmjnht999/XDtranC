# Ollama 验收

## 现状（2026-11-03）

- 协议层离线验收：**已完成**。`packages/main/ollama-e2e.mjs` 用本地 HTTP fixture 模拟 `/api/chat`，覆盖成功、自核查重试、请求中取消、取消后恢复，并校验导出文件内容与 hash。
- 真实模型验收：**未执行**。本机未安装 Ollama（`ollama` 不在 PATH，`%LOCALAPPDATA%\Programs\Ollama` 与 `%ProgramFiles%\Ollama` 均不存在），服务未运行。

不要把离线 fixture 的结果写成“真实模型通过”。

## 一、离线 fixture（可随时复现，不需要模型）

```powershell
node packages/main/build.mjs
node packages/main/ollama-e2e.mjs
```

预期最后一行：

```text
通过：Ollama协议离线成功、导出文件/hash/来源一致、自核查重试、请求中取消、取消后恢复。没有真实模型调用。
```

覆盖点：

- 请求体只能发到 `/api/chat`，模型名必须与 UI 填写一致；
- 成功路径：导出目录可读，`manifest.providerId = "ollama"`、`simulated = false`；
- 自核查失败后带问题重试一次，请求数翻倍；
- 请求挂起时点“取消”能中止 fetch，状态变为“已取消”，导出按钮禁用；
- 取消后再次转换不受污染。

## 二、真实模型验收（需要你安装）

### 1. 安装并启动

```powershell
winget install --id Ollama.Ollama -e
ollama serve
```

（若已安装，跳过安装，只启动 `ollama serve`。）

### 2. 拉取模型

```powershell
ollama pull qwen2.5-coder:14b
ollama list
```

`ollama list` 输出的模型名必须与 UI“已安装模型”完全一致，不会自动补 tag。

### 3. 确认服务

```powershell
curl.exe -s http://127.0.0.1:11434/api/tags
```

应返回 JSON 且包含刚拉取的模型。非回环地址会被应用直接拒绝，这是设计约束。

### 4. 桌面验收

```powershell
node packages/main/build.mjs
node packages/main/dist/main.mjs  # 或 pnpm dev
```

操作：

1. 选择目录 → `samples/hello`
2. 转换方式 → `Ollama（本机）`
3. 已安装模型 → `qwen2.5-coder:14b`（按实际）
4. 地址保持 `http://127.0.0.1:11434`
5. 开始转换，等待状态变为“模型草稿完成（未验证编译）”或“部分完成，请检查问题”
6. 导出目录，检查 `draft/export-manifest.json`

验收判定：

| 项 | 通过标准 |
|---|---|
| 连通性 | 无 `回环` / `ECONNREFUSED` / 超时错误 |
| schema | 无 `schema` 解析失败；失败块应有明确原因 |
| 来源 | `manifest.providerId = "ollama"`、`simulated = false`、`model` 与所选一致 |
| 完整性 | `exportedFileCount` 与导出文件数一致，`failedChunks` 有原因 |
| 不宣称编译 | 界面与 README 均写“未验证编译” |

### 5. 记录结果

把实际模型名、耗时、`manifest.status`、`failedChunks`/`unsupported` 数量写回本文件“验收记录”，不要只写“通过”。

## 验收记录

| 日期 | 模型 | 状态 | 失败块 | 备注 |
|---|---|---|---|---|
| — | — | 未执行 | — | 本机未安装 Ollama |

## 失败时的排查顺序

1. `ECONNREFUSED` → `ollama serve` 没起，或端口不是 11434；
2. `404 model not found` → 模型名与 `ollama list` 不一致；
3. 429 / 5xx → 应用会自动退避重试 2 次（尊重 `Retry-After`），仍失败会进 `failedChunks`，原因带“已重试 N 次”；
4. 长时间无响应 → 检查“超时毫秒”，默认 120000；
5. 输出 schema 解析失败 → 属模型输出问题，会带问题回炉重试，最多 2 次，最终失败进失败清单，不会静默丢弃。
