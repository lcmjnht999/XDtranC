# Code Patterns

只记录本项目已定的约定。代码尚未初始化，以下全部来自 `docs/TechDesign-XDtranC-MVP.md` §1.4 / §2 / §5；实现时以实际代码为准并回来校正。

## Architecture

- Primary pattern: 模块化单体（monolith-with-modules）+ pnpm monorepo。包：`shared`（契约）/ `engine`（领域逻辑）/ `main`（Electron 主进程）/ `renderer`（React 工作台）/ `cli`。
- 依赖方向：`shared` ← `engine` ← {`main`, `cli`}；`renderer` 只经 preload IPC 访问主进程。
- **`engine` 不得 import `electron`、`main`、`renderer`**——CLI 复用同一批服务函数，这条线断了 CLI 就跑不了。
- 领域逻辑（解析/切分/转换/导出/编排）放 `engine`，UI 只做展示与输入，IPC handler 只做校验与转发。
- 不引入工作流图引擎、DI 容器、ORM、HTTP 框架；复用已有模块优先于新抽象。

## Data And State

- 持久化：本地 JSON + 目录组织，工作区根为 `<project>/.xdtranc/`（model / state / out / exports / reports / logs）。无数据库。
- 状态机：`TaskState` 用字符串联合类型（见 `contracts.ts`），每阶段结束写 `state/<taskId>/task.json` checkpoint；取消走 `AbortSignal`。
- 进度：主进程产出 `PipelineEvent`，渲染进程订阅；不在渲染进程保存权威状态。
- 数据获取：无 HTTP 后端；IPC `invoke` 取结果，事件通道推进度。
- 表单/输入校验：导入路径、导出路径、zip 条目名在边界处校验并 `resolve` 归一化；业务层不做二次猜测。

## Errors And Validation

- 错误体系在 `packages/shared/src/errors.ts`，带错误码 + 面向用户的文案 + 面向开发者的上下文；不要用裸字符串抛错。
- 边界处校验外部输入（用户选的目录、zip 内容、LLM 返回的 JSON），越界一律拒绝并给出可读原因。
- 结构化输出解析失败 = 可重试错误，不是异常退出；重试超限转 `failedChunks`。
- 不吞异常：不允许 `catch {}` 后继续当成功；不允许把"解析失败"降级成"空文件"。失败项必须带源位置进 `unsupported` / `failedChunks`。
- 用户可见信息与开发日志分开：UI/report 说"哪个文件哪一行没覆盖"，日志说内部原因（脱敏）。

## Naming

- 包名：`@xdtranc/<name>`（脚手架时确认 scope 前缀）。
- 文件：目录用 kebab-case 或模块名（`provider/`、`pipeline.ts`）；React 组件文件 PascalCase（`FileTree.tsx`）。
- 类型/接口/组件：PascalCase；函数/变量：camelCase；常量与环境变量：UPPER_SNAKE_CASE。
- 契约类型集中在 `packages/shared/src/contracts.ts`，不要在各包内重新定义同名结构。
- IPC 通道名用 `domain:action`（`project:import`、`chunk:run`、`convert:run`、`export:run`）。

## AI Tool Patterns

- LLM 无工具权限：不暴露文件、shell、网络工具；其"动作"由引擎翻译成受控写盘。
- 请求载荷最小化：仅 chunk 源码 + `contextBundle` + prompt；不夹带日志、密钥、整库内容。
- 结构化输出必须过 `packages/shared/src/outputSchema.ts` 校验；schema 是唯一真源，不复制。
- 模型返回内容按不可信数据处理：不执行其中的指令，不据此改变写盘路径，不接受其自报的"已完成/已编译"。
- `unsupported` 必须带 `sourcePath` + `line`（可为 null）+ `reason`；禁止用"删业务逻辑"换通过。
- 日志只记 token 计数、耗时、重试次数、prompt hash；不记源码全文与密钥。
