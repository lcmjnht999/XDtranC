import { afterEach, expect, it, vi } from 'vitest';
import { appendFile, link, mkdir, mkdtemp, readFile, readdir, rename, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Workspace } from './workspace.js';
import { parseProject } from './index.js';
import { chunkModel } from './chunker.js';
import { convertChunks, PersistenceError } from './converter.js';
import { MockProvider } from './provider.js';

const environment = vi.hoisted(() => ({ platform: 'win32' as NodeJS.Platform }));
vi.mock('node:process', async importOriginal => ({
  ...await importOriginal<typeof import('node:process')>(),
  get platform() { return environment.platform; },
}));
vi.mock('node:fs/promises', async importOriginal => {
  const fs = await importOriginal<typeof import('node:fs/promises')>();
  return { ...fs, appendFile: vi.fn(fs.appendFile), rename: vi.fn(fs.rename), writeFile: vi.fn(fs.writeFile) };
});
vi.mock('node:timers/promises', async importOriginal => ({
  ...await importOriginal<typeof import('node:timers/promises')>(),
  setTimeout: vi.fn(async () => undefined),
}));
const realFs = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');

afterEach(() => {
  vi.mocked(rename).mockReset().mockImplementation(realFs.rename);
  vi.mocked(writeFile).mockReset().mockImplementation(realFs.writeFile);
  vi.mocked(appendFile).mockReset().mockImplementation(realFs.appendFile);
  vi.mocked(delay).mockReset().mockResolvedValue(undefined);
  environment.platform = 'win32';
});

const failure = (code: string) => Object.assign(new Error(`fixture ${code}`), { code });

async function fixture() {
  const base = resolve('.deepworks/tmp');
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(join(base, 'workspace-save-'));
  const ws = await Workspace.open(root);
  await ws.writeJson('state/current.json', { checkpoint: 'old' });
  vi.mocked(rename).mockClear();
  vi.mocked(writeFile).mockClear();
  return { root, ws, target: join(ws.dir, 'state', 'current.json') };
}

it.each(['EPERM', 'EACCES', 'EBUSY'])('Windows %s retries the same complete temporary file and preserves the old checkpoint until replacement', async code => {
  const { ws, target } = await fixture();
  vi.mocked(rename).mockImplementationOnce(async (from, to) => {
    expect(to).toBe(target);
    expect(JSON.parse(await readFile(target, 'utf8'))).toEqual({ checkpoint: 'old' });
    expect(JSON.parse(await readFile(from, 'utf8'))).toEqual({ checkpoint: 'new' });
    throw failure(code);
  }).mockRejectedValueOnce(failure(code));
  await ws.writeJson('state/current.json', { checkpoint: 'new' });
  expect(JSON.parse(await readFile(target, 'utf8'))).toEqual({ checkpoint: 'new' });
  expect(rename).toHaveBeenCalledTimes(3);
  expect(new Set(vi.mocked(rename).mock.calls.map(([from]) => from)).size).toBe(1);
  expect(writeFile).toHaveBeenCalledTimes(1);
  expect(vi.mocked(delay).mock.calls.map(([ms]) => ms)).toEqual([50, 100]);
  expect(await readdir(join(ws.dir, 'state'))).toEqual(['current.json']);
});

it('persistent Windows lock fails after five waits, preserves existing JSON and permits a subsequent save', async () => {
  const { ws, target } = await fixture();
  const oldBytes = await readFile(target);
  const originalError = failure('EPERM');
  vi.mocked(rename).mockRejectedValue(originalError);
  const error: unknown = await ws.writeJson('state/current.json', { checkpoint: 'unsaved' }).catch(error => error);
  expect(String(error)).toContain('已重试 5 次');
  expect(String(error)).toContain('检查目录权限');
  expect(error).toMatchObject({ cause: { cause: originalError } });
  expect(rename).toHaveBeenCalledTimes(6);
  expect(vi.mocked(delay).mock.calls.map(([ms]) => ms)).toEqual([50, 100, 200, 400, 800]);
  expect(await readFile(target)).toEqual(oldBytes);
  expect(await readdir(join(ws.dir, 'state'))).toEqual(['current.json']);
  vi.mocked(rename).mockImplementation(realFs.rename);
  await ws.writeJson('state/current.json', { checkpoint: 'recovered' });
  expect(JSON.parse(await readFile(target, 'utf8'))).toEqual({ checkpoint: 'recovered' });
});

it.each(['ENOSPC', 'ENOENT', 'EIO', 'EXDEV'])('%s does not retry or replace the saved checkpoint', async code => {
  const { ws, target } = await fixture();
  vi.mocked(rename).mockRejectedValue(failure(code));
  await expect(ws.writeJson('state/current.json', { checkpoint: 'unsaved' })).rejects.toThrow(code);
  expect(rename).toHaveBeenCalledTimes(1);
  expect(delay).not.toHaveBeenCalled();
  expect(JSON.parse(await readFile(target, 'utf8'))).toEqual({ checkpoint: 'old' });
});

it('non-Windows permission failures are not retried', async () => {
  const { ws } = await fixture();
  environment.platform = 'linux';
  vi.mocked(rename).mockRejectedValue(failure('EACCES'));
  await expect(ws.writeJson('state/current.json', { checkpoint: 'unsaved' })).rejects.toThrow('EACCES');
  expect(rename).toHaveBeenCalledTimes(1);
  expect(delay).not.toHaveBeenCalled();
});

it('temporary-file creation failure does not enter the rename retry loop', async () => {
  const { ws, target } = await fixture();
  vi.mocked(writeFile).mockRejectedValueOnce(failure('ENOSPC'));
  await expect(ws.writeJson('state/current.json', { checkpoint: 'unsaved' })).rejects.toThrow('ENOSPC');
  expect(rename).not.toHaveBeenCalled();
  expect(delay).not.toHaveBeenCalled();
  expect(JSON.parse(await readFile(target, 'utf8'))).toEqual({ checkpoint: 'old' });
});

it('an existing temporary filename is neither overwritten nor removed after an exclusive-create conflict', async () => {
  const { ws, target } = await fixture();
  let collision = '';
  vi.mocked(writeFile).mockImplementationOnce(async (path, data, options) => {
    collision = String(path);
    await realFs.writeFile(path, 'pre-existing temporary fixture', { flag: 'wx' });
    return realFs.writeFile(path, data, options);
  });
  await expect(ws.writeJson('state/current.json', { checkpoint: 'unsaved' })).rejects.toThrow('EEXIST');
  expect(await readFile(collision, 'utf8')).toBe('pre-existing temporary fixture');
  expect(JSON.parse(await readFile(target, 'utf8'))).toEqual({ checkpoint: 'old' });
  expect(rename).not.toHaveBeenCalled();
  expect(delay).not.toHaveBeenCalled();
});

const logTaskId = 'task-00000000-0000-0000-0000-000000000001';

it('event append rejects a hard link to a file outside the workspace', async () => {
  const { root, ws } = await fixture();
  const external = join(root, 'outside.log');
  const original = 'external file must remain unchanged\n';
  await realFs.writeFile(external, original);
  const taskDir = join(ws.dir, 'state', logTaskId);
  await mkdir(taskDir);
  const target = join(taskDir, 'events.log.jsonl');
  await link(external, target);
  await expect(ws.appendEvent(logTaskId, { kind: 'must-not-append' })).rejects.toThrow('无链接的普通文件');
  expect(await readFile(external, 'utf8')).toBe(original);
  expect(await readFile(target, 'utf8')).toBe(original);
  expect(appendFile).not.toHaveBeenCalled();
});

it('event append rejects a linked directory at the log-file path', async () => {
  const { root, ws } = await fixture();
  const outside = join(root, 'outside');
  await mkdir(outside);
  const taskDir = join(ws.dir, 'state', logTaskId);
  await mkdir(taskDir);
  await symlink(outside, join(taskDir, 'events.log.jsonl'), process.platform === 'win32' ? 'junction' : 'dir');
  await expect(ws.appendEvent(logTaskId, { kind: 'must-not-append' })).rejects.toThrow('无链接的普通文件');
  expect(await readdir(outside)).toEqual([]);
  expect(appendFile).not.toHaveBeenCalled();
});

it('event append failure is not retried and the next successful append appears only once', async () => {
  const { ws } = await fixture();
  await ws.appendEvent(logTaskId, { kind: 'before' });
  const target = join(ws.dir, 'state', logTaskId, 'events.log.jsonl');
  const original = await readFile(target);
  vi.mocked(appendFile).mockClear().mockRejectedValueOnce(failure('EPERM'));
  await expect(ws.appendEvent(logTaskId, { kind: 'failed' })).rejects.toThrow('EPERM');
  expect(appendFile).toHaveBeenCalledTimes(1);
  expect(delay).not.toHaveBeenCalled();
  expect(await readFile(target)).toEqual(original);
  await ws.appendEvent(logTaskId, { kind: 'after' });
  const events = (await readFile(target, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  expect(events.map(event => event.kind)).toEqual(['before', 'after']);
});

it('boundary change between attempts stops replacement and does not touch files outside the workspace', async () => {
  const { root, ws, target } = await fixture();
  const outside = join(root, 'outside');
  await mkdir(outside);
  await realFs.writeFile(join(outside, 'current.json'), '{"outside":true}');
  const savedState = join(ws.dir, 'saved-state');
  vi.mocked(rename).mockImplementationOnce(async () => {
    await realFs.rename(join(ws.dir, 'state'), savedState);
    await symlink(outside, join(ws.dir, 'state'), process.platform === 'win32' ? 'junction' : 'dir');
    throw failure('EBUSY');
  });
  await expect(ws.writeJson('state/current.json', { checkpoint: 'unsaved' })).rejects.toThrow('链接');
  expect(rename).toHaveBeenCalledTimes(1);
  expect(delay).toHaveBeenCalledTimes(1);
  expect(await readdir(outside)).toEqual(['current.json']);
  expect(await readFile(target, 'utf8')).toBe('{"outside":true}');
  expect(JSON.parse(await readFile(join(savedState, 'current.json'), 'utf8'))).toEqual({ checkpoint: 'old' });
  expect((await readdir(savedState)).some(name => name.endsWith('.tmp'))).toBe(true);
});

it('already replaced workspace root and linked parent are rejected before creating directories', async () => {
  const { root, ws } = await fixture();
  const outside = join(root, 'outside');
  await mkdir(outside);
  await symlink(outside, join(ws.dir, 'link'), process.platform === 'win32' ? 'junction' : 'dir');
  await expect(ws.writeJson('link/new/nested.json', {})).rejects.toThrow('链接');
  expect(await readdir(outside)).toEqual([]);
  await realFs.rename(ws.dir, join(root, 'original-workspace'));
  await symlink(outside, ws.dir, process.platform === 'win32' ? 'junction' : 'dir');
  await expect(ws.writeJson('new/nested.json', {})).rejects.toThrow('链接');
  expect(await readdir(outside)).toEqual([]);
});

it('workspace root and non-file destinations cannot be JSON write targets', async () => {
  const { root, ws } = await fixture();
  await expect(ws.writeJson('.', {})).rejects.toThrow('文件路径');
  await expect(ws.writeJson('..', {})).rejects.toThrow('越界');
  await expect(ws.writeJson('state', {})).rejects.toThrow('普通文件');
  expect((await readdir(root)).filter(name => name.endsWith('.tmp'))).toEqual([]);
});

it('exhausted checkpoint retries still interrupt conversion with PersistenceError', async () => {
  const { ws } = await fixture();
  const model = await parseProject('samples/hello');
  const plan = await chunkModel(model, 4096);
  let completed = 0;
  const error = failure('EPERM');
  vi.mocked(rename).mockRejectedValue(error);
  await expect(convertChunks(model, plan, new MockProvider(), undefined, {
    onChunkComplete: async () => { completed++; await ws.writeJson('state/current.json', { checkpoint: 'unsaved' }); },
  })).rejects.toBeInstanceOf(PersistenceError);
  expect(completed).toBe(1);
  expect(rename).toHaveBeenCalledTimes(6);
  expect(JSON.parse(await readFile(join(ws.dir, 'state', 'current.json'), 'utf8'))).toEqual({ checkpoint: 'old' });
});
