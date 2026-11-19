# Windows 工作区保存加固

日期：2026-11-19

## 问题与行为

此前开发版桌面验证曾在更新 `.xdtranc/state/<taskId>/task.json` 时遇到 Windows `rename` 的 `EPERM`。原逻辑只尝试一次，短暂占用也会中断任务。

本次修改 `packages/engine/src/workspace.ts`：

- JSON 先完整写入同目录独占创建的临时文件，再通过 `rename` 替换目标；不删除旧目标，不退化成直接覆盖写。
- 仅 Windows 的 `rename` 返回 `EPERM`、`EACCES`、`EBUSY` 时等待重试：50、100、200、400、800 ms，最多额外 5 次（合计 6 次尝试），总等待 1550 ms。文件系统操作耗时另计。
- 重试使用同一个已写好的临时文件。每次尝试重新检查工作区根、父目录、临时文件与目标文件；路径变成链接或非预期类型时停止。
- 在创建父目录前检查工作区根与已有祖先，避免沿已存在的链接创建外部目录；拒绝把工作区根本身作为 JSON 文件目标。
- 其他错误与非 Windows 平台不重试。持续权限不足也会达到上限后失败，提示关闭占用程序或检查权限，保留原始错误 cause。
- 保存失败仍通过现有 `PersistenceError` 路径中断转换，不能当成成功或继续导出。
- 失败清理仅针对本次成功创建的普通临时文件；路径边界变化或清理失败时保留现场。写入中断也可能留下临时文件，不会将其作为有效 checkpoint。

事件日志仍只执行一次追加，避免重放带来重复日志；创建目录前检查路径，追加前拒绝日志目标为符号链接、硬链接或非普通文件。JSON 的 rename 替换不跟随目标链接，日志追加则可能修改链接指向的文件，因此日志额外检查硬链接计数。没有新增依赖、UI 功能或工作区格式版本，也不修改 API 密钥会话策略。

## 验证

实际执行，全部通过：

```powershell
node node_modules/typescript/bin/tsc --noEmit
node node_modules/typescript/bin/tsc --noEmit -p packages/renderer/tsconfig.json
node node_modules/eslint/bin/eslint.js packages
node node_modules/vitest/vitest.mjs run --no-file-parallelism --testTimeout=30000
node packages/main/build.mjs
node packages/main/workspace-save-e2e.mjs
node --check packages/main/workspace-save-e2e.mjs
git diff --check
```

- 全量 Vitest：18 文件、122 项，新增 `workspace-save.test.ts` 的 14 项测试。覆盖三类占用错误后恢复、重试耗尽、旧文件字节保持、下次保存恢复、非重试错误、非 Windows 分支、临时写失败、等待期间目录被替换为链接、根/祖先链接、非法目标、保存失败中断转换。故障和等待通过测试替身控制，测试在真实临时目录读写 JSON。
- 开发版 Electron：真实点击目录选择与 Mock 转换按钮，在主进程文件系统方法中注入两次 `EPERM` 后恢复；报告文件持续占用时准确尝试 6 次，界面报错、两个导出按钮不可用、checkpoint 标记 failed 且最终报告不存在；解除注入后再次运行成功。
- 界面截图已查看：`.deepworks/tmp/workspace-save-e2e-hGHrpZ/success.png`。数据和截图留在已忽略的临时目录。
- E2E 测试首轮因 Electron 调试上下文不支持动态 import 回调而失败；测试改用内置模块加载方法后通过，产品代码不包含故障注入逻辑。
- 构建仍有 >500 kB 分块警告，Playwright 启动仍有 DEP0190 警告。

这验证的是故障响应与保存流程，未使用操作系统文件锁或真实安全软件复现原占用来源。非 Windows 分支只做注入测试，未在 Linux 运行；路径检查也不承诺抵御每个系统调用之间的恶意并发目录替换。持续占用、权限不足、磁盘满仍会明确失败。重试等待期间不新增取消接口，等待上限如上。

本轮没有调用真实 API、修改 Git、打包或发布。离线完整性 eval 在此前 API 配置阶段已通过；本轮未重跑，也未做仓颉编译或模型质量验收。

## 回退

只撤销 `workspace.ts` 本轮重试和路径检查补丁，以及对应新增测试/测试脚本，不修改已有 `.xdtranc` 数据。其他 API 配置、引擎/CLI 修复和原有工作区改动均保留，不应整体 reset。

## 文件编辑收尾（2026-11-19）

按用户要求先完成文件修改：补齐事件日志目标的符号链接、硬链接及文件类型校验；新增临时文件重名冲突不覆盖/不清理、外部文件硬链接拒绝、日志路径链接拒绝、追加失败不重放且下次追加仅出现一次，共 4 项回归测试。

文件修改完成后，已运行上述两套 TypeScript、ESLint、全量 Vitest（18 文件、126 项）及 `git diff --check`，全部通过。此前开发构建及桌面截图对应日志目标校验补丁前版本；本轮未重新构建或启动 Electron，不将旧桌面证据当作本轮复测结果。UI 文件未改动。
