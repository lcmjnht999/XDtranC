# 云端 Provider（OpenAI 兼容）

> 状态（2026-11-19）：**桌面自带 API 配置与离线验证已完成，真实请求未验收**。
> 本轮用户明确授权页面输入密钥，并指定仅主进程会话内存保管；覆盖旧设计中凭据文件/keyring 的桌面密钥方案。保留 Electron、默认 Mock 和每次运行的源码外发确认。
> 2026-11-05 决定：MVP 交付不依赖云端模型，云端接入作为可配置项保留，待拿到独立 API Key 与可达网络后再验收。

## 1. 为什么需要

MVP 的 Provider 只有 Mock 与本地 Ollama。内网/云端模型网关如果提供 OpenAI 兼容接口，可以不改转换逻辑，只增加一个 Provider。

## 2. 已实现

| 文件 | 内容 |
|---|---|
| `packages/engine/src/openai.ts` | `OpenAiCompatibleProvider`：`POST {baseUrl}/chat/completions`，Bearer 鉴权 |
| `packages/engine/src/openai.test.ts` | 9 项单测：成功、失败、URL 校验、双斜杠路径保持主机、重定向不转发密钥 |
| `packages/engine/cloud-check.ts` | 一次性验收脚本，只读 `XDTRAN_API_KEY`，不读任何凭据文件 |
| `packages/shared/src/apiConfig.ts` | 页面与主进程共用的配置校验、地址归一化；只返回固定错误文案 |
| `packages/main/src/session-key.ts` | 主进程内存密钥，与规范化的完整 base URL 绑定；只返回是否配置 |
| `packages/main/src/preload.cjs` | 密钥提交、状态、清除的最小 IPC 白名单，无读取密钥接口 |
| `packages/renderer/src/App.tsx` | base URL、模型 ID、密码输入框、提交与清除按钮 |
| `packages/main/cloud-e2e.mjs` | 开发版 Electron + 本机协议模拟的离线页面与导出验证 |

行为：

- 超时 1–600000 ms，支持 `AbortSignal`；
- 响应上限 4 MiB；
- `redirect: 'error'`，拒绝跳转；
- 429 / 408 / 504 / 5xx → 可重试；401 / 403 / 404 → 不可重试；
- 解析 `choices[0].message.content`，缺失或空串直接报 `invalid-response`；
- 非回环地址必须显式 `allowExternal: true`，否则拒绝构造。

## 3. 配置

桌面操作：

1. 选择「OpenAI 兼容 API（自带服务）」。
2. 填写服务提供方的 base URL（例如 `https://服务地址/v1`，不要附加 `/chat/completions`）、准确模型 ID 和超时。
3. 输入 API Key，点击「提交会话密钥」。输入框提交后立即清空；成功仅显示「当前地址已配置会话密钥」。提交不探测服务、不产生模型请求。
4. 选择目录/ZIP 或粘贴源码，开始转换。主进程确认框列出目标地址、模型、输入和发送范围；取消不发请求。确认前由用户核实服务授权、不训练及留存条款。
5. 不再使用时点击「清除会话密钥」。任务执行中先取消并等待结束，再清除。退出应用后密钥失效；重开需重新提交。

页面会提示待修正字段：base URL 最多 256 字符，必须 HTTPS（本机回环可 HTTP），不允许凭据、查询参数、片段、控制字符或末尾的 `/chat/completions`；模型 ID 最多 200 字符且不能有空白/控制字符；超时为 1～600000 毫秒的整数。地址无效时禁用密钥提交；连接字段无效时禁用开始转换。格式有效不代表已探测网络或验证模型可用性，主进程仍独立校验全部输入。

密钥绑定协议、主机、端口及完整 base 路径；主机大小写、默认端口与尾随斜杠按 URL 规范归一。改成其他服务或路径时旧密钥不可用；重新提交会替换唯一的会话密钥。页面不保存密钥到 React 状态、浏览器存储或文件，不可读回；桌面不回退读取 `XDTRAN_API_KEY`。API 连接配置本身也不新增持久化。

切换 Mock / Ollama / OpenAI 兼容 API 时，各自的地址、模型和超时在当前页面内保留，返回 API 可继续使用已提交且地址匹配的主进程密钥。切换转换方式或修改地址会清空未提交的密码输入，不自动提交给其他服务。刷新页面会重置页面参数；退出应用后主进程密钥失效，重开默认 Mock，API 参数与密码框为空。

以下环境变量/命令行配置仅属于 CLI 和独立验收脚本，桌面无需设置：

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

- 一次真实模型验收记录；
- 独立 API Key 的申请与轮换策略。

CLI 已支持 `--provider=openai`，具体命令与外发门禁见 `progress-2026-11-17.md`。桌面 OpenAI 兼容转换仍禁用续跑，不自动换服务或降级 Mock。

## 6. 真实验收的前置条件

1. 目标地址在当前网络可解析（`Resolve-DnsName` 能出结果）；
2. 有一个可轮换的独立 API Key；
3. 只用 `samples/hello` 这类自建样例；
4. 结果写入 `docs/cloud-acceptance.md`（待创建），记录 `providerId / model / simulated / status / failedChunks`。

在此之前，MVP 验收仍以 Mock + 离线 fixture 为准，**不得声称云端模型已验证**。

## 7. 2026-11-19 实际验证

使用现有本地依赖执行：

```powershell
node node_modules/typescript/bin/tsc --noEmit
node node_modules/typescript/bin/tsc --noEmit -p packages/renderer/tsconfig.json
node node_modules/eslint/bin/eslint.js packages
node node_modules/vitest/vitest.mjs run --no-file-parallelism --testTimeout=30000
node --import tsx packages/engine/eval.ts
node packages/main/build.mjs
node packages/main/cloud-e2e.mjs
```

- 两套 TypeScript、ESLint、17 文件 108 项 Vitest 均通过；新增会话/页面测试及适配器路径与重定向回归。
- 10 类离线结构完整性评测通过，报告 `outputs/integrity-eval-aJV2AJ/`；不是业务语义或编译验收。
- 开发构建及真实开发版 Electron 按钮旅程通过：页面提交/清空、地址不匹配拒绝、主动清除、环境密钥不回退、退出失效、外发拒绝零请求、成功/自核查重试/取消恢复、401 错误体不回显、目录与 ZIP 导出。新增工作区状态/事件/报告及导出文件、ZIP 解压内容均扫描确认无测试密钥。只用假密钥和本机回环模拟，未调用真实 API。
- 界面截图：`.deepworks/tmp/cloud-e2e-PfpnIZ/success.png`，已查看；固定协议产物只是测试夹具，界面空壳判定不通过不代表真实模型质量结论。
- 普通沙箱中的 esbuild 子进程遇目录读取拒绝；批准后在沙箱外检查。`pnpm` 入口尝试自动检查/重装依赖但因无 TTY 中止，改用上述本地工具；未安装依赖。一次桌面复测遇 Windows 工作区原子 rename 的 `EPERM`，独立重跑通过，未隐藏或跳过该失败；同时修正测试读取旧运行状态的等待竞态。
- 保留构建的 >500 kB 分块警告及 Playwright 启动的 DEP0190 警告。未做安装版验证、打包、发布或 Git 写操作。

回退时仅撤销本轮会话密钥、页面和 URL 构造补丁；`main.ts`、`App.tsx` 等在本轮前已有未提交改动，不能按文件整体覆盖或 reset。

## 8. 2026-11-19 续作：页面参数与本次运行密钥

- 页面按转换方式分别保留非敏感参数，避免临时切回 Mock 后丢失 API 地址、模型 ID 和超时；不写磁盘或浏览器存储。
- 修改地址会清空未提交的密钥输入，切换转换方式也不保留密码输入。主进程已提交密钥仍与完整地址绑定，可主动清除、退出失效。
- 修复迟到的状态查询覆盖提交/清除结果的竞态；密钥替换被拒绝时，重新查询主进程的配置状态，保留原先有效密钥的可用提示，不读回密钥。
- 新增 6 项页面回归测试，App 共 9 项。按第 7 节同一路径执行两套 TypeScript、ESLint、全量 Vitest（18 文件、132 项）、开发构建、`node packages/main/cloud-e2e.mjs`、脚本语法检查及 `git diff --check`，均通过；本轮未重跑 eval。
- 开发版 Electron 实际切换与点击验证通过：各方式参数隔离、切换恢复 API 参数、未提交输入清空、地址绑定、提交/清除、环境密钥不回退、退出后默认配置与密钥失效；原有外发拒绝零请求、离线转换/重试/取消、401 错误体不回显、目录/ZIP 与工作区不含密钥也通过。
- 最新截图 `.deepworks/tmp/cloud-e2e-frCJ7T/success.png` 已查看。仅使用自建样例、假密钥与本机协议模拟，未调用真实 API，不代表模型质量或编译验收；构建分块和 DEP0190 警告仍保留。

原有未提交改动保留，未执行 Git 写、上传 GitHub、打包或发布。回退本次续作时只回退页面参数保留/状态竞态补丁及对应新增测试，不整体还原 `App.tsx`。

## 9. 2026-11-19 续作：输入校验与提示

- 新增纯共享模块 `apiConfig.ts`，页面与主进程使用同一套字段校验，适配器继续复用原有 URL 归一化算法（从共享模块导入，原引擎导出位置保留兼容）。密钥地址绑定也调用同一入口，不改变密钥仅主进程内存保管的策略。
- 页面实时展示具体问题、关联输入的无效状态；修正前禁用对应提交/转换按钮，禁用的主按钮显示灰色。错误提示不拼接原始输入，不回显 URL 中的凭据。密钥提交只要求地址有效，模型与超时可随后补全。
- 新增 5 项共享校验测试、10 项页面输入校验测试、1 项主进程绕过检查；App 共 19 项。两套 TypeScript、ESLint、全量 Vitest（19 文件、148 项）、开发构建、脚本语法及 `git diff --check` 均通过。相关检查命令与第 7 节相同，本轮未重跑 eval。
- 真实开发版 Electron 离线旅程通过：空模型/非整数超时/误填完整 completions 地址被阻止且零请求；绕过页面直接调用 IPC 时主进程仍拒绝；错误密钥替换后输入清空且旧密钥可继续使用。既有切换参数保留、地址绑定、清除、退出失效、外发确认、目录/ZIP 与工作区无密钥、401 不回显、重试/取消/恢复也通过。
- 最新截图 `.deepworks/tmp/cloud-e2e-Nbxaov/invalid-config.png` 与 `success.png` 均已查看，禁用按钮状态样式已复核。全部使用自建样例、假密钥和本机协议模拟，未调用真实 API、Git 写、打包或发布；构建大分块与 DEP0190 警告仍保留。

回退本次校验续作时，仅回退共享校验、导入调整、页面提示/按钮状态及相应测试补丁，保留前面已完成的运行期配置与工作区保存改动。
