# 第七片：Electron 最小桌面工作台

## 启动

```powershell
npx.cmd --yes pnpm@10.30.3 dev
```

选择 samples/hello 目录，点击开始模拟转换，查看输入/输出和问题，再选择新的目标导出目录或 ZIP。取消按钮在任务执行期间可用。ZIP 输入复用安全导入，保留暂存数据。
当前采用无框架 HTML 最小视图，尚未引入 React/Monaco，不作为长期 UI 架构完成结论。界面明确为 Mock，真实 Ollama 尚未验收且未接入 UI。
输入预览最多20个文件/每文件20000字符；输出草稿和问题以纯文本呈现，不执行源码内容。

## 安全

contextIsolation=true / nodeIntegration=false / sandbox=true；preload 仅暴露五类操作，无通用 IPC 或文件读取接口。输入和输出由主进程原生对话框选择，不接受渲染层任意路径。IPC 检查主窗口/主 frame 来源和枚举参数，拒绝导航/新窗口/权限申请。
源码预览复核 hash 和真实路径。导出调用现有路径边界检查，不覆盖目标。引擎未依赖 Electron。
仅阶段状态，不是精确百分比；同步单文件解析无法立即抢占。没有打包发布、自动更新或用户配置持久化。

## 实际验证

- typecheck、lint、48项引擎/CLI回归通过。
- node packages/main/build.mjs + node packages/main/smoke.mjs：实际启动 Electron，操作网页按钮，验证隔离配置、Node不可用、输入输出预览、目录及ZIP导出、清单、覆盖拒绝、非法IPC参数、取消和无效ZIP输入错误状态。
- 原生文件对话框在测试中替换返回值，未人工点选系统对话框；并非截图或静态 HTML 冒充启动验证。
- 第一次自动化启动因顶层 await 等待 ready 而超时，改为 ready 回调后启动成功；取消点击因 Mock 太快超时，改为同一页面事件点击开始与取消后看到“已取消”。
- Playwright 启动器输出 Node DEP0190 警告；本测试参数固定，不接受用户命令拼接。未声明已消除第三方启动器警告。
- 临时产物/截图在 .deepworks/tmp/desktop-test-*，不删除。构建在 packages/main/dist，不入产物面板。
- Electron 下载只显式运行其 install.js，未全局放开依赖脚本。仅Windows验证，无真实模型、Linux或打包验证。

## 交接

新增 main 和 renderer 最小文件，dev 命令及测试脚本；eslint 忽略生成 dist，对沙箱 preload 的 CJS require 作专属例外。保留前六片，不执行 Git 写操作、发布或删除。
第五片真实模型仍待办；下一步先试用桌面，再批准后续任务。