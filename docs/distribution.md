# 内网分发

本文只描述步骤与校验，不代跑发布、部署或外部网络写入。

## 产物

| 路径 | 说明 |
|---|---|
| `release/XDtranC-0.1.0-setup.exe` | NSIS 安装包：用户级安装、桌面 + 开始菜单快捷方式 |
| `release/win-unpacked/XDtranC.exe` | 免安装主程序（调试/便携用） |
| `release/win-unpacked/resources/app.asar` | 应用与依赖（约 120 MB） |
| `release/win-unpacked/resources/app.asar.unpacked/` | 解包的 tree-sitter wasm |

重新生成：

```powershell
pnpm install --frozen-lockfile
pnpm build
pnpm run pkg        # 只出免安装目录
pnpm run pkg:setup  # 出安装包 + 免安装目录
```

`release/` 已在 `.gitignore` 中，不进仓库。

## 校验

打包后先在本机自检：

```powershell
Get-FileHash release\win-unpacked\XDtranC.exe -Algorithm SHA256
pnpm e2e   # 含打包产物主旅程；产物不存在会跳过该用例
```

分发前记录 `XDtranC.exe` 与 `app.asar` 的 SHA256，连同版本号（`package.json` 的 `version`）一起登记。

## 打包成压缩包（由你执行）

```powershell
Compress-Archive -Path release\win-unpacked\* -DestinationPath release\XDtranC-0.1.0-win-x64.zip -Force
Get-FileHash release\XDtranC-0.1.0-win-x64.zip -Algorithm SHA256
```

## 分发步骤

1. 走内网文件通道上传 `XDtranC-0.1.0-setup.exe` 与 SHA256；便携场景可上传 `win-unpacked` 压缩包；
2. 双击安装包，选择安装目录（默认 `%LOCALAPPDATA%\Programs\XDtranC`，用户级，不需要管理员）；
3. 安装完成会自动创建桌面与开始菜单快捷方式；首次启动允许 SmartScreen 的“仍要运行”（未签名）；
4. 用 `samples/hello` 跑一次目录转换与导出，确认 `export-manifest.json` 为 `complete`；
5. 登记目标机 Windows 版本与结果。

## 目标机要求

- Windows x64；
- 不需要安装 Node.js、pnpm 或编译工具链；
- 云端 Provider 需可解析的网关地址与独立 API Key（见 `docs/cloud-provider.md`）；本地 Ollama 可选；
- 导出目标不能位于源码目录内，且必须是不存在的新目录。

## 不要做

- 不要把 `.xdtranc/`、导出目录或 `release/` 提交进仓库；
- 不要把未签名的产物说成“已签名/可自动更新”；
- 不要在未确认合规承诺的情况下接入外部云 Provider。
