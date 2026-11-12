# XDtranC 交接（2026-11-05 收口）

> 本文是最新交接入口。旧的 `docs/handoff-prompt-2026-11-05.md` 与 `docs/handoff-2026-11-03.md` 保留作历史，第 6 节“真实 Ollama 验收”已取消，不再执行。

## 0. 一句话现状

MVP 四项功能、桌面安装包、离线验收全部完成并推送到 `origin/main`；**唯一未验证项是云端模型的真实调用**，代码已就绪，等“可达网络 + 独立 API Key”。

## 1. 仓库

| 项 | 值 |
|---|---|
| 本地路径 | `C:\Users\xuhailong\Desktop\XDtranC` |
| 远端 | `https://github.com/lcmjnht999/XDtranC.git` |
| 分支 | `main`（跟踪 `origin/main`） |
| HEAD | `ee97165` |
| 工作区 | 干净，无未提交改动 |

> 注意：DeepWorks 会话目录 `...\Projects\Deepworks\项目10` 只是聊天工作区，**不是**开发目录。

## 2. 已完成

- 功能四项：项目导入与解析、代码切分、LLM 转换（含 schema 校验 + 自核查重试）、输入/输出工作台 + 导出。
- 批次 A–G：脚手架、解析、切分、转换、导出、Provider 健壮性、交付收尾。
- CJPM：**圈外预研**，默认关闭，Phase 2，不作为验收项。
- 桌面形态：NSIS 安装包 `release/XDtranC-0.1.0-setup.exe`（116.4 MB），用户级安装，桌面 + 开始菜单快捷方式，中文向导，图标与版本信息已写入 exe。
- 云端 Provider：`packages/engine/src/openai.ts`（OpenAI 兼容、Bearer、超时、abort、4 MiB、拒绝重定向、错误分类），7 项单测。
- 文档：`docs/cloud-provider.md`、更新的分发说明与交接提示词。

## 3. 验收基线（2026-11-05 实跑）

| 检查 | 命令 | 结果 |
|---|---|---|
| 类型 | `pnpm typecheck` | 通过 |
| 静态检查 | `pnpm lint` | 通过 |
| 单测 | `pnpm test` | **14 文件 / 90 项通过** |
| 评测 | `pnpm eval` | 10 类通过 |
| E2E | `pnpm e2e` | 2 项通过（开发 + 打包产物） |
| 打包 | `pnpm run pkg:setup` | 生成安装包 |

**本 MVP 没有编译验证**：任何“编译通过 / 测试通过（仓颉侧）”的结论都不成立。报告只能说“产物已导出且完整性清单如下”。

## 4. 剩余工作（按优先级）

1. **安装包实测**（人工，约 8 分钟）：双击 setup.exe → 确认中文向导、桌面图标、能打开工作台、开始菜单、卸载。
2. **云端真实验收**：需要①`tokenhub.deepepexios.cn` 在当前网络可解析，②一个可轮换的独立 API Key。步骤见 `docs/cloud-provider.md` 第 6 节。当前网络 DNS 不可达，且明确不读取 DeepWorks 客户端的 `auth.json`。
3. **UI / CLI 接入云端 Provider**（未做）：桌面端 Provider 下拉 + baseUrl/model/key 输入；CLI `--provider=openai`。
4. **PRD 同步**（已知待办）：`docs/PRD-XDtranC-MVP.md` 仍是旧范围，范围权威以 `docs/TechDesign-XDtranC-MVP.md` 为准，不要擅自改写 PRD。
5. 真实 Ollama 验收：**已取消**，不要恢复。

## 5. 硬约束（不可协商）

- **git 写操作只由用户执行**：不代跑 `init/add/commit/push/pull/merge/rebase/tag/branch/remote/stash` 与 `gh`。只给命令 + 预期输出 + 校验点。只读核对允许。
- **不读取任何凭据文件**：`auth.json`、`env.json`、浏览器数据、私有日志。密钥只能由用户在自己的终端注入环境变量。
- **CJPM 一律圈外**：不得作为验收项，不得用“删业务逻辑”换取自核查通过。
- **本 MVP 无编译验证**：不得宣称 cjc / CJPM / clang 通过。
- **默认不落云**：新增 Provider 前必须确认“不用于训练 / ZDR”承诺，不确定就记 Open Question。
- **路径边界**：工作区写限定项目根 `.xdtranc/`；导出路径 `resolve` 归一化后做前缀校验。
- **结构化输出契约唯一真源**：`packages/shared/src/outputSchema.ts`。
- **Electron 安全边界**：`contextIsolation: true` / `nodeIntegration: false` / `sandbox: true`。
- **Monaco 必须动态 import**。
- **`.xdtranc/`、导出包、`release/` 不入库**。

## 6. 环境与命令

```powershell
$env:Path = "D:\Program Files (x86)\nodejs;$env:APPDATA\npm;" + $env:Path
cd C:\Users\xuhailong\Desktop\XDtranC
```

| 目的 | 命令 |
|---|---|
| 安装 | `pnpm install --frozen-lockfile` |
| 开发 | `pnpm dev` |
| 构建 | `pnpm build` |
| 类型 / 检查 / 单测 | `pnpm typecheck` / `pnpm lint` / `pnpm test` |
| 评测 | `pnpm eval` |
| E2E | `pnpm e2e`（需先有 `release/win-unpacked`） |
| 免安装打包 | `pnpm run pkg` |
| 安装包 | `pnpm run pkg:setup` |

PowerShell 5.1：不支持 `&&`，用 `;` 或 `if ($?)`；`pnpm` 用 `pnpm.cmd`。

## 7. 已知坑

| 坑 | 处理 |
|---|---|
| `pnpm pkg` 被内置命令抢占 | 用 `pnpm run pkg` / `pnpm run pkg:setup` |
| `pnpm e2e` 不打包 | 先 `pnpm run pkg` |
| 桌面脚本含 `dialog.*` | 替换为直接调用 |
| `vitest.config.ts` 的 `exclude` | 必须保留 `**/node_modules/**` |
| 桌面导出布局 | `<选择目录>/draft/` |
| `.xdtranc/` 写入输入项目根 | ZIP 快照须排除 |
| `tokenhub.deepepexios.cn` | 当前网络 DNS 不可解析，TCP 443 不通，无系统代理 |
| DeepWorks `auth.json` | 明文存储，**不读取**、不复制、不提交 |
| `signAndEditExecutable: false` | 已移除，否则图标不写入 exe |

## 8. 文件地图

| 路径 | 说明 |
|---|---|
| `packages/engine/src/openai.ts` | OpenAI 兼容 Provider |
| `packages/engine/src/openai.test.ts` | 7 项单测 |
| `packages/engine/cloud-check.ts` | 云端一次性验收脚本（只读 `XDTRAN_API_KEY`） |
| `packages/engine/src/provider.ts` | `LlmProvider` 契约 |
| `packages/engine/src/ollama.ts` | Provider 实现参考 |
| `packages/engine/src/exporter.ts` | 导出主入口 |
| `packages/engine/src/converter.ts` | schema + 自核查重试 |
| `packages/main/src/main.ts` | 主进程、IPC、`setAppUserModelId` |
| `electron-builder.yml` | NSIS + dir、图标、快捷方式、中文向导 |
| `build/icon.png` | 512×512 占位图标（已入库） |
| `docs/cloud-provider.md` | 云端接入状态、配置、安全边界 |
| `docs/distribution.md` | 分发与安装步骤 |
| `docs/TechDesign-XDtranC-MVP.md` | **范围权威** |
| `AGENTS.md` | 全局约束 |
| `MEMORY.md` | 当前状态与指针 |

## 9. 可直接粘贴的启动提示词

```text
你在 C:\Users\xuhailong\Desktop\XDtranC 接手 XDtranC（C++ → 仓颉 .cj 的桌面迁移工具，Electron + TypeScript）。
先读 docs/handoff-2026-11-05-final.md、AGENTS.md、MEMORY.md。
当前 HEAD ee97165，工作区干净，90 项单测全绿。
不要做：git 写操作、读取 auth.json/env.json、把 CJPM 当验收项、宣称编译通过。
下一步优先级：① 等用户给出可达网络 + 独立 API Key 后跑 packages/engine/cloud-check.ts 做云端验收；② 把云端 Provider 接进桌面 UI 与 CLI；③ 安装包实机安装验证。
验收口径是出物完整性（exportedFileRatio / lineRetentionRatio / unsupported）。
```
