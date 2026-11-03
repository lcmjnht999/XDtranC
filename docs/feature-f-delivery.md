# 批次 F：交付收尾

范围：脚本、E2E、打包与文档同步。不改业务语义，不接真实模型。

## 1. 新增脚本

`package.json`

| 脚本 | 作用 |
|---|---|
| `pnpm build` | Vite 构建 renderer → esbuild 构建 `main.mjs` → 复制 preload |
| `pnpm dev` | 先 build，再启动 Electron |
| `pnpm e2e` | 先 build，再跑 Playwright Electron 主旅程 |
| `pnpm run pkg` | `electron-builder --dir`，输出 `release/win-unpacked/` |

注意：`pnpm pkg` 会被 pnpm 内置的 `pkg` 命令抢占，必须写 `pnpm run pkg`。

## 2. Playwright E2E

`playwright.config.ts` + `e2e/mvp.spec.ts`，单 worker、离线 Mock。

- 用例 1：开发构建启动 `packages/main/dist/main.mjs`。
- 用例 2：启动打包产物 `release/win-unpacked/XDtranC.exe`；产物不存在时跳过并提示先 `pnpm run pkg`。
- 原生目录/保存对话框无法由 Playwright 点击，改用 `electronApp.evaluate` 在主进程替换 `dialog.showOpenDialog` / `showSaveDialog` / `showMessageBox`。IPC、转换、导出仍走真实链路。
- 断言：状态栏出现“模拟完成”与“导出结束：complete”，`draft/export-manifest.json` 为 `complete`、`simulated=true`、`exportedFileCount=2`，且 `draft/src/main.cj`、`draft/src/calculator.cj` 存在。

## 3. 打包

`electron-builder.yml`

- `win.target: dir`：只产出免安装目录，不下载 NSIS，不做内网分发。
- `signAndEditExecutable: false`：跳过 winCodeSign 下载与签名。
- `asar: true` + `asarUnpack: "**/*.wasm"`：tree-sitter 的 wasm 必须解包。
- `extraMetadata.main: packages/main/dist/main.mjs`：应用入口。
- 根 `dependencies` 增加 `web-tree-sitter` / `tree-sitter-wasms` / `yauzl` / `yazl`：主进程 bundle 把它们保留为 external，asar 必须能解析到。

已知结果：`app.asar` 约 121 MB（含依赖与 renderer），`release/win-unpacked/XDtranC.exe` 可启动。

## 4. 验收

- `pnpm typecheck`、`pnpm lint` 通过。
- `pnpm test`：13 文件 80 项通过。
- `pnpm eval`：10 类通过。
- `pnpm e2e`：2 项通过（开发构建 6.1s、打包产物 14.1s）。
- 打包产物实际启动并完成一次 Mock 旅程。

## 5. 未做 / Open Question

- CJPM 项目结构需消费方确认，未生成任何 CJPM 文件；确认后再加。
- 未做内网分发、安装包、自动更新、代码签名、演示材料。
- PRD 原文未修订，范围仍以 Tech Design（2026-10-22 修订版）为准。
- 真实 Ollama 验收仍未执行；E2E 全部使用 Mock，不依赖网络。
