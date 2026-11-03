# 阶段 0 执行手册：环境与基线

目标：把 `C:\Users\xuhailong\Desktop\XDtranC` 从「代码完整但跑不起来」变成「基线四条命令全绿、桌面能完成一次 Mock 旅程」。

## 0. 本机体检结论（2026-11-03 实测）

| 项目 | 实测值 | 影响 |
|---|---|---|
| 系统 | Windows 10 22H2 (19045) AMD64 | 用 x64 安装包 |
| PowerShell | 5.1 | 不支持 `&&`，命令逐条执行 |
| C 盘可用 | 143.1 GB | 充足 |
| Node / npm / pnpm | 全部缺失 | 本阶段的核心任务 |
| registry.npmjs.org:443 | 可连 | 可直连安装，无需镜像 |
| registry.npmmirror.com:443 | 可连 | 作为备用镜像 |
| github.com / objects.githubusercontent.com:443 | 可连 | Electron 二进制可直连下载 |
| 用户 .npmrc | 不存在 | 无历史配置干扰 |
| HTTP(S)_PROXY | 未设置 | 不需要代理 |
| ExecutionPolicy | 全部 Undefined（Restricted） | **必须用 `npm.cmd` / `pnpm.cmd`，`.ps1` 会被拦** |

结论：只差一个 Node.js。网络条件良好，预计 10–20 分钟完成。

## 1. 完成标准（DoD）

全部满足才算阶段 0 通过：

1. `node -v` ≥ v22，`pnpm.cmd -v` = 10.30.3
2. `node_modules\electron\dist\electron.exe` 存在
3. `pnpm.cmd typecheck` 无错误
4. `pnpm.cmd lint` 无错误
5. `pnpm.cmd test` 全部通过（历史基线 51 项）
6. `pnpm.cmd eval` 六类评测通过
7. `pnpm.cmd dev` 能打开窗口，并完成一次 `samples/hello` 的 Mock 转换与导出

任何一项失败都停下来记录原文，不跳过、不判定为“通过”。

## 2. 步骤 1：安装 Node.js

### 方式 A：官方 msi（推荐）

1. 打开 https://nodejs.org/zh-cn/download
2. 下载 **LTS / Windows / x64 的 `.msi`**（当前为 Node 24.x，满足 `>=22`）
3. 双击安装，全部默认。**不要勾选** “Tools for Native Modules”（本项目没有原生编译依赖）
4. 安装完成后**关闭所有 PowerShell 窗口，重新打开一个**（PATH 需要刷新）

验证：

```powershell
node -v
npm.cmd -v
```

预期：`v24.x.x` 与 `11.x.x`。

### 方式 B：zip 绿色版（不想改系统 PATH 时）

1. 在 https://nodejs.org/zh-cn/download 下载 **Windows Binary (.zip) x64**
2. 解压到 `C:\Tools\node`（使 `C:\Tools\node\node.exe` 存在）
3. 仅在当前窗口临时生效：

```powershell
$env:Path = "C:\Tools\node;" + $env:Path
node -v
```

关闭窗口后失效，下次需要重新设置。适合“只想试一次”的场景。

### 失败分支

| 现象 | 原因 | 处置 |
|---|---|---|
| 仍提示找不到 `node` | 没有新开窗口 | 关闭全部终端再开 |
| 版本低于 v22 | 旧版残留 | 卸载旧 Node 后重装 |
| 安装器报权限错误 | 非管理员且装到受保护目录 | 换默认目录或右键以管理员运行 |

## 3. 步骤 2：安装 pnpm

```powershell
npm.cmd install -g pnpm@10.30.3
pnpm.cmd -v
```

预期输出 `10.30.3`。

说明：

- 必须写 `npm.cmd` / `pnpm.cmd`。直接写 `npm` 会命中 `npm.ps1`，被执行策略拒绝。
- 如果 `npm.cmd` 不在 PATH，检查 `%APPDATA%\npm` 是否已加入 PATH（msi 安装通常会自动处理）。

失败分支：

| 错误 | 处置 |
|---|---|
| `EACCES` / `EPERM` | 不要用管理员强装；检查 `%APPDATA%\npm` 权限，或改用 `npm.cmd install -g pnpm@10.30.3 --prefix "%LOCALAPPDATA%\pnpm"` 后手动加 PATH |
| `ETIMEDOUT` / `ECONNRESET` | 重试一次；仍失败切镜像（见步骤 3） |

## 4. 步骤 3：安装项目依赖

```powershell
cd C:\Users\xuhailong\Desktop\XDtranC
pnpm.cmd install --frozen-lockfile
```

预期：最后出现 `Done in xx.xs`，并生成 `node_modules`。

安装后立刻确认锁文件没有被改动：

```powershell
git status --short
```

预期：无输出（工作区干净）。若 `pnpm-lock.yaml` 变了，说明依赖解析与锁不一致，停下来报告，不要提交。

### 失败分支

| 错误关键字 | 原因 | 处置 |
|---|---|---|
| `ERR_PNPM_UNSUPPORTED_ENGINE` | Node < 22 | 升级 Node |
| `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH` | package.json 与锁不一致 | 不要删锁重装；先报告差异 |
| `ETIMEDOUT` / `ECONNRESET` / `EAI_AGAIN` | registry 不通 | 切镜像后重跑（见下） |
| `Ignored build scripts: electron, esbuild` | pnpm 10 默认拦截安装脚本 | **正常**，按步骤 4 手动补 |
| `EPERM: operation not permitted` | 杀毒/索引占用 | 关闭占用后重跑，不要删目录硬来 |

切镜像（仅在直连失败时使用）：

```powershell
pnpm.cmd config set registry https://registry.npmmirror.com
pnpm.cmd install --frozen-lockfile
```

恢复官方源：

```powershell
pnpm.cmd config set registry https://registry.npmjs.org
```

## 5. 步骤 4：校验 Electron 与 esbuild

```powershell
Test-Path node_modules\electron\dist\electron.exe
```

- `True`：跳过本节。
- `False`：执行

```powershell
node node_modules\electron\install.js
Test-Path node_modules\electron\dist\electron.exe
```

下载约 100 MB。若失败：

```powershell
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
node node_modules/electron/install.js
```

### Node 26 已知问题：install.js 静默退出、只解压出 locales

现象：`node node_modules\electron\install.js` 退出码 0、无输出，`dist` 里只有 `locales`，`electron.exe` 不存在。原因是 Electron 39 自带的 `extract-zip` 与 Node 26 不兼容。

处置（不删除缓存，直接手动解压现有 zip）：

```powershell
$src = Get-ChildItem "$env:LOCALAPPDATA\electron\Cache" -Recurse -Filter "electron-v39.2.7-win32-x64.zip" | Select-Object -First 1 -ExpandProperty FullName
$pkg = "node_modules\.pnpm\electron@39.2.7\node_modules\electron"
Expand-Archive -LiteralPath $src -DestinationPath "$pkg\dist" -Force
Set-Content -LiteralPath "$pkg\path.txt" -Value "electron.exe" -NoNewline -Encoding ASCII
Test-Path "$pkg\dist\electron.exe"
```

预期最后输出 `True`。若缓存 zip 本身不完整（明显小于 100 MB），先删除缓存再执行 install.js，或从镜像下载。

esbuild 自检（只有 `pnpm.cmd dev` 报平台不匹配时才需要）：

```powershell
node node_modules\esbuild\install.js
```

## 6. 步骤 5：跑基线

逐条执行，**遇错即停**：

```powershell
pnpm.cmd typecheck
```

预期：无输出（`tsc --noEmit` 成功即静默）。

```powershell
pnpm.cmd lint
```

预期：无 error。

```powershell
pnpm.cmd test
```

预期：`Test Files  xx passed`、`Tests  xx passed`。历史基线为 51 项；数量不同不影响判定，但要记录实际值。

```powershell
pnpm.cmd eval
```

预期：六类评测通过，控制台给出报告路径。

### 失败处置

1. 复制**完整报错原文**（含文件、行号、错误码），不要只发最后一行。
2. 先判断是环境问题（找不到模块、路径、权限）还是代码问题（断言失败、类型错误）。
3. 环境问题按本文档对应分支处理；代码问题由助手修，不擅自改测试期望值。

## 7. 步骤 6：启动桌面并手工验收

```powershell
pnpm.cmd dev
```

预期：Electron 窗口打开（约 1100×780）。

手工验收清单：

- [ ] 窗口正常显示，无白屏
- [ ] 能选择目录 `samples/hello`
- [ ] 能看到输入文件列表或预览
- [ ] 点击“开始转换”，Mock 模式返回结果
- [ ] 能看到输出草稿与问题清单
- [ ] 能导出到新目录，导出后文件存在且非空
- [ ] 关闭窗口后进程退出干净（任务管理器无残留 `electron.exe`）

任一项不通过，记录现象与截图路径，不要继续后续批次。

## 8. 结果回报模板

```
node -v:
npm.cmd -v:
pnpm.cmd -v:
electron.exe 存在:
typecheck:
lint:
test:        (Test Files / Tests 汇总行)
eval:
dev:         (窗口是否打开 / 卡在哪一步)
git status:  (是否有改动)
备注:        (任何警告或异常)
```

## 9. 常见错误速查

| 报错 | 含义 | 处置 |
|---|---|---|
| `无法将“node”项识别为 cmdlet` | 未安装或 PATH 未刷新 | 重开终端 / 重装 |
| `无法加载文件 ...pnpm.ps1，因为在此系统上禁止运行脚本` | 执行策略 | 改用 `pnpm.cmd` |
| `ERR_PNPM_NO_PKG_MANIFEST` | 不在项目根目录 | `cd` 到 `XDtranC` |
| `Cannot find module 'electron'` | 依赖未装或 Electron 未下载 | 重跑 install / install.js |
| `Electron failed to install correctly` | 二进制缺失 | `node node_modules\electron\install.js` |
| `app is not defined` / 白屏 | preload 或路径问题 | 记录控制台报错，交助手定位 |
| 测试超时 | 首次运行较慢 | 重跑一次；仍超时记录用例名 |

## 10. 回滚

- 卸载 Node：设置 → 应用 → Node.js → 卸载。
- 绿色版：删除 `C:\Tools\node` 即可，无系统残留。
- 依赖：删除 `node_modules` 后重新 `pnpm.cmd install --frozen-lockfile`，不影响源码。
- 镜像配置：`pnpm.cmd config set registry https://registry.npmjs.org` 恢复。
- 本阶段不修改任何源码；`git status` 应始终保持干净。
