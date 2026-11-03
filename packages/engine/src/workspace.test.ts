import { it, expect } from 'vitest';
import { mkdir, mkdtemp, readdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Workspace, fingerprint, WORKSPACE_DIR } from './workspace.js';
import { parseProject } from './index.js';
import { chunkModel } from './chunker.js';
import { convertChunks } from './converter.js';
import { MockProvider } from './provider.js';

async function temp(prefix = 'workspace-') {
  const base = resolve('.deepworks/tmp');
  await mkdir(base, { recursive: true });
  return mkdtemp(join(base, prefix));
}

async function project() {
  const root = await temp('project-');
  await writeFile(join(root, 'a.cpp'), 'int a(int x) { return x; }\n');
  await writeFile(join(root, 'b.cpp'), 'int b();\n');
  const model = await parseProject(root);
  return { root, model };
}

const provider = { id: 'mock', model: 'hello-fixture-v1', simulated: true };

it('创建工作区并原子写入 checkpoint', async () => {
  const { root, model } = await project();
  const ws = await Workspace.open(root);
  expect(ws.dir).toBe(join(root, WORKSPACE_DIR));
  const task = await ws.createTask({ input: root, inputKind: 'dir', inputHash: fingerprint(model), provider, budgetTokens: 4096 });
  expect(task.stage).toBe('imported');
  const saved = JSON.parse(await readFile(join(ws.dir, 'state', task.taskId, 'task.json'), 'utf8'));
  expect(saved.taskId).toBe(task.taskId);
  expect(saved.completedChunks).toEqual([]);
  const entries = await readdir(join(ws.dir, 'state', task.taskId));
  expect(entries.filter(name => name.endsWith('.tmp'))).toEqual([]);
});

it('拒绝工作区路径越界', async () => {
  const { root } = await project();
  const ws = await Workspace.open(root);
  await expect(ws.writeJson('../escape.json', { x: 1 })).rejects.toThrow('越界');
});

it('拒绝工作区内的符号链接祖先', async () => {
  const { root } = await project();
  const ws = await Workspace.open(root);
  const outside = await temp('outside-');
  await symlink(outside, join(ws.dir, 'link'), process.platform === 'win32' ? 'junction' : 'dir');
  await expect(ws.writeJson('link/escape.json', { x: 1 })).rejects.toThrow('链接');
});

it('已有 .xdtranc 是文件时拒绝打开', async () => {
  const root = await temp('project-');
  await writeFile(join(root, WORKSPACE_DIR), 'not a directory');
  await expect(Workspace.open(root)).rejects.toThrow('非目录');
});

it('inspect 不创建目录', async () => {
  const root = await temp('project-');
  expect(await Workspace.inspect(root)).toBeUndefined();
  await expect(readdir(join(root, WORKSPACE_DIR))).rejects.toThrow();
});

it('恢复扫描只返回未完成任务并遵守指纹', async () => {
  const { root, model } = await project();
  const ws = await Workspace.open(root);
  const hash = fingerprint(model);
  const task = await ws.createTask({ input: root, inputKind: 'dir', inputHash: hash, provider, budgetTokens: 4096 });
  expect((await ws.findIncomplete(hash))?.taskId).toBe(task.taskId);
  expect(await ws.findIncomplete('other-hash')).toBeUndefined();
  task.stage = 'converted';
  await ws.saveTask(task);
  expect(await ws.findIncomplete(hash)).toBeUndefined();
});

it('事件日志追加而不是覆盖', async () => {
  const { root, model } = await project();
  const ws = await Workspace.open(root);
  const task = await ws.createTask({ input: root, inputKind: 'dir', inputHash: fingerprint(model), provider, budgetTokens: 4096 });
  await ws.appendEvent(task.taskId, { kind: 'one' });
  await ws.appendEvent(task.taskId, { kind: 'two' });
  const lines = (await readFile(join(ws.dir, 'state', task.taskId, 'events.log.jsonl'), 'utf8')).trim().split('\n');
  expect(lines).toHaveLength(3);
  expect(JSON.parse(lines[0]).kind).toBe('task_created');
  expect(JSON.parse(lines[1]).kind).toBe('one');
  expect(JSON.parse(lines[2]).kind).toBe('two');
});

it('损坏的 JSON 显式报错', async () => {
  const { root } = await project();
  const ws = await Workspace.open(root);
  await mkdir(join(ws.dir, 'model'), { recursive: true });
  await writeFile(join(ws.dir, 'model', 'bad.json'), '{');
  await expect(ws.readJson('model/bad.json')).rejects.toThrow('损坏');
});

it('恢复转换跳过已完成 chunk 且不调用 Provider', async () => {
  const model = await parseProject('samples/hello');
  const plan = await chunkModel(model, 4096);
  const first = await convertChunks(model, plan, new MockProvider());
  const resume = new Map(first.results.map(r => [r.chunkId, r.output]));
  expect(resume.size).toBe(plan.chunks.length);
  let calls = 0;
  const never = { id: 'never', model: 'never', simulated: false, generate: async () => { calls++; throw new Error('不应调用'); } };
  const second = await convertChunks(model, plan, never, undefined, undefined, resume);
  expect(calls).toBe(0);
  expect(second.results).toHaveLength(first.results.length);
  expect(second.status).toBe('complete');
});

it('落盘失败中断转换而不是当成 chunk 失败', async () => {
  const model = await parseProject('samples/hello');
  const plan = await chunkModel(model, 4096);
  await expect(convertChunks(model, plan, new MockProvider(), undefined, { onChunkComplete: async () => { throw new Error('disk full'); } })).rejects.toThrow('状态保存失败');
});
