# 批次 D：UI 技术栈（React + Vite + 动态 Monaco）

日期：2026-11-03

## 目标

把无框架单文件工作台迁到 React + Vite，代码预览换成动态加载的 Monaco，**行为与 IPC 契约不变**。

## 迁移顺序

1. 搭 Vite 壳，把状态与 IPC 原样搬到 React
2. 代码预览替换为 `React.lazy` 动态 `import` 的 Monaco
3. 文件树与摘要条组件化

## 目录

```
packages/renderer/
├── index.html              Vite 入口（CSP 收紧）
├── vite.config.ts          root / base './' / 输出到 main/dist/renderer
├── tsconfig.json           DOM + Bundler + react-jsx
└── src/
    ├── main.tsx
    ├── App.tsx             状态、按钮禁用、流程编排
    ├── api.ts              window.workbench 类型
    ├── types.ts            IPC 返回结构
    ├── styles.css
    └── components/
        ├── FileTree.tsx / FileTree.test.tsx
        ├── SummaryBar.tsx / SummaryBar.test.tsx
        ├── CodeView.tsx    lazy + Suspense + ErrorBoundary 降级
        └── MonacoPanel.tsx 只读 Monaco
```

## 关键决策

- **自定义 `app://` 协议**：`protocol.registerSchemesAsPrivileged` + `protocol.handle` 提供 `dist/renderer/`。`file://` 下 CSP 的 `'self'` 不可靠，`app://` 有稳定 origin，才能用 `script-src 'self'`。
- **CSP**：`default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; worker-src 'self' blob:; font-src 'self' data:; img-src 'self' data:`。
- **Monaco 懒加载**：`CodeView` 用 `lazy` + `Suspense`，加载前先显示 `<pre>` 文本；`ErrorBoundary` 捕获失败后永久降级为 `<pre>`，不白屏。
- **空 worker**：Monaco 0.57 的 `?worker` 子路径在 Vite 8 下解析失败，改为内联空 worker（`Blob`），只读展示不需要语言服务。
- **IPC 不变**：仍只经 preload 白名单，`contextIsolation: true` / `nodeIntegration: false` / `sandbox: true` 未改。

## 构建与脚本

- `packages/main/build.mjs`：先 `vite build`（输出 `packages/main/dist/renderer/`），再 esbuild 主进程，最后复制 preload。
- `typecheck` 现在跑两个 tsconfig：根（NodeNext，排除 renderer）与 renderer（Bundler + DOM）。

## 验证

```
typecheck  通过（根 + renderer）
lint       通过
Test Files 12 passed（74 项；新增 FileTree 3、SummaryBar 3）
build      通过
eval       10 类全部符合预期（未受本批影响）
首屏耗时   三次冷启动 1230 / 1074 / 1049 ms（Monaco 不在首屏）
手工验收   粘贴 → 转换 → 文件树点击 → Monaco 显示 → 导出确认，用户确认“没有问题”
```

## 已知限制

- `dist/renderer` 约 13.5 MB，因为 `import * as monaco from 'monaco-editor'` 带上了全部语言包；后续可改为只注册 C++。
- 空 worker 意味着 Monaco 的语言服务（补全/诊断）不可用；当前只读预览不需要。
- `base: './'` 依赖 `app://xdtranc/index.html` 这个固定路径。
- 未新增打包配置，未接真实模型，未执行 Git 写操作。

## 回滚

本批之前的单文件原型已随 `9e817ef` 入库，可单独恢复到该提交的 `packages/renderer/index.html` 与 `main.ts` 的 `loadFile`。
