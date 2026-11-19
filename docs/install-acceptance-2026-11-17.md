# 当前版本 Windows 安装验收操作单

## 状态与权限

2026-11-17 只读核查：默认 setup 文件不存在，release/win-unpacked/XDtranC.exe 存在，但不能证明包含本轮未提交代码。不得用旧包证明当前版本通过。

下述构建、打包和安装由用户手动执行。助手未执行打包、安装、卸载、发布或联网取依赖。命令在 C:\Users\34381\XDtranC 的 PowerShell 中逐条执行，每步失败立即停止。不复制密钥、日志或私有源码到验收记录。

## 1. 离线检查与构建

本机 pnpm.cmd 不在 PATH，以下使用已存在的本地工具，不使用 npx，不自动下载。

~~~powershell
node node_modules/typescript/bin/tsc --noEmit
node node_modules/typescript/bin/tsc --noEmit -p packages/renderer/tsconfig.json
node node_modules/eslint/bin/eslint.js packages
node node_modules/vitest/vitest.mjs run --no-file-parallelism --testTimeout=30000
node packages/main/build.mjs
~~~

预期：每步退出码 0；当前测试基线为 15 文件、100 项。构建的 chunk 大小警告不是测试失败。此基线只证明应用代码检查，不是仓颉编译通过。

## 2. 生成独立目录的安装包

为避免覆盖旧 release/win-unpacked，生成唯一输出目录。第一次打包可能缺 electron-builder/NSIS 缓存；遇到下载需求先停止并决定网络授权，不能宣称完全离线可打包。

~~~powershell
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$packageDir = "outputs/install-acceptance-$stamp"
if (Test-Path -LiteralPath $packageDir) { throw '目标已存在，请换一个新时间戳' }
node node_modules/electron-builder/cli.js --win nsis --config.directories.output=$packageDir
if ($LASTEXITCODE -ne 0) { throw '打包失败，停止验收' }
$setup = Join-Path $packageDir 'XDtranC-0.1.0-setup.exe'
if (-not (Test-Path -LiteralPath $setup)) { throw '未找到安装包' }
Get-FileHash -LiteralPath $setup -Algorithm SHA256
Get-AuthenticodeSignature -LiteralPath $setup
~~~

预期：新目录有安装包，SHA256 可记录。当前没有配置签名，NotSigned 不得被写成已签名；若其他签名错误，先调查。不要关闭系统安全保护；SmartScreen 阻止时按组织审批流程处理。

注意：现有 e2e/mvp.spec.ts 固定读取 release/win-unpacked/XDtranC.exe，不会测试上述新目录，并会清理固定测试临时目录。因此不要直接用它宣称此安装包验收通过；本操作单使用以下人工安装旅程。

## 3. 实机安装与离线 Mock 主旅程

优先在独立测试 Windows 用户/测试机操作。若已有 XDtranC，先确认保留数据与升级策略，不直接覆盖。检查本次 setup 哈希与第 2 步一致后，由用户双击执行。

| 检查项 | 预期 / 记录 |
|---|---|
| 安装向导 | 中文、可选路径；配置为用户级安装 |
| 桌面与开始菜单 | 均出现 XDtranC 快捷方式 |
| 启动 | 从两个快捷方式分别启动，显示工作台，无白屏；不要同时运行两份 |
| 当前功能 | 可见 OpenAI 兼容选项；切回 Mock，不配置真实密钥或发起云请求 |
| 样例 | 将公开 samples/hello 复制到测试用新目录再导入，不使用私有验收库 |
| 转换 | 选择 Mock；显示模拟完成，输入与输出文件可查看 |
| 导出 | 选择源码目录外且不存在的新目标；CJPM 默认关闭 |
| 清单 | 导出目标 draft/export-manifest.json：simulated=true、providerId=mock、status=complete；src 下存在非空 .cj 文件 |
| 安全失败 | 再向已存在目标导出应拒绝；原导出文件不得被覆盖 |
| 重启 | 关闭后重新启动不白屏；如验证恢复，记录源是否变化与具体提示 |
| 卸载 | 仅在专用测试机由用户确认后执行；快捷方式清理，手动导出文件不应被删除 |

配置 deleteAppDataOnUninstall=false，不能把“用户数据仍在”算卸载失败；不手工删除用户数据。版本仍是 0.1.0，不能仅凭版本号识别本轮构建，必须记录安装包 SHA256。

## 4. 记录模板

- 安装包路径 / SHA256：待填
- 当前源码 git diff 摘要或经批准的补丁标识：待填（HEAD 不包含未提交改动）
- Windows 版本 / 架构 / 测试用户：待填
- 安装向导 / 桌面 / 开始菜单 / 启动：未验收
- Mock 导入 / 转换 / 导出 / 拒绝覆盖：未验收
- 卸载及数据保留：未验收
- 实际错误与截图（脱敏）：待填
- 结论：未验收，不得预填通过

## 不在本验收内

真实模型质量、源码外发合规、仓颉编译、CJPM 测试、自动更新与生产部署。离线 Mock 成功不代表真实转换正确。
