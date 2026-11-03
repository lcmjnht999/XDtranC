# 批次 G：CJPM 可选布局

## 背景

MVP 之前的导出只有 `src/*.cj` + 清单 + README，`export-manifest.json` 的 warnings 里明确写着“无 CJPM 配置”。`docs/mvp-delivery-workflow.md` 把 CJPM 结构列为“待消费方确认，未确认前不生成”。

本轮由用户确认：**生成可选 `cjpm.toml`，`src/` 保持现有平铺结构，默认不改变导出**。

## 行为

- 默认（不勾选 / 不传 `--cjpm`）：导出结构与之前完全一致，`manifest.layout = "flat"`，不产生 `cjpm.toml`。
- 开启后：
  - 导出根新增 `cjpm.toml`；
  - `manifest.layout = "cjpm"`；
  - `manifest.cjpm` 记录 `{ path, hash, packageName, version, cjcVersion, layoutVersion, verified: false }`；
  - `cjpm.toml` 首行注释声明“目录结构未经消费方确认，也未用 cjc / CJPM 验证”，并带 `# layout: xdtranc-cjpm-1`。
- `exportedFileCount` 只统计 `src/*.cj`，不把 `cjpm.toml` 算进源码完整性指标。

## 包名

- 显式传入时校验 `^[a-z][a-z0-9_]{0,63}$`，非法包名在**任何写盘前**抛错，不留半成品目录。
- 未传入时由输入名派生：转小写、非字母数字替换为 `_`、首字符不是字母则加 `pkg_` 前缀。中文/纯符号目录名会得到 `pkg_project` 这类占位名，需要显式传包名。

## 入口

| 入口 | 用法 |
|---|---|
| 桌面 UI | 导出按钮下方勾选“生成 cjpm.toml（实验）”，可选填包名 |
| IPC | `window.workbench.export('dir' \| 'zip', { cjpm: true, packageName: 'hello' })` |
| CLI | `pnpm export <目录或ZIP> --provider=mock --format=dir --out=<目标> --cjpm [--package=hello]` |

`--package` 必须与 `--cjpm` 同时出现，否则按用法错误退出 1。

## 测试

- `exporter.test.ts`：默认 flat 不生成文件；`cjpm: true` 生成并记录 hash；非法包名写盘前拒绝；CLI 生成成功与非法组合退出码。
- `e2e/mvp.spec.ts`：打包产物旅程勾选 CJPM，断言 `manifest.layout === 'cjpm'` 与 `cjpm.toml` 内容。

## 边界与未验证

- **没有用 cjc / CJPM 实际构建**，`cjc-version` / `version` 是占位值，消费方需要按目标 SDK 调整。
- 目录结构只做到“根有 `cjpm.toml`、源码在 `src/`”，没有模块拆分、依赖声明、测试目录。
- 若消费方给出正式模板，应替换 `buildCjpmToml` 而不是在导出后手改。
