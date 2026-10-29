import { describe, it, expect } from 'vitest';
import { mkdir, mkdtemp, writeFile, readFile, symlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseProject } from './index.js';
const base = resolve('.deepworks/tmp');
async function fixture(files: Record<string, string | Buffer>) {
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(join(base, 'parse-'));
  for (const [name, value] of Object.entries(files)) { await mkdir(join(root, name, '..'), { recursive: true }); await writeFile(join(root, name), value); }
  return root;
}
function cli(path: string, json = false) { return spawnSync(process.execPath, ['--import', 'tsx', 'packages/cli/src/index.ts', path, ...(json ? ['--json'] : [])], { encoding: 'utf8', timeout: 15000 }); }
describe('目录解析', () => {
  it('真实样例的数量、位置、依赖与源码不变', async () => {
    const path = resolve('samples/hello'); const before = await readFile(join(path, 'main.cpp'));
    const model = await parseProject(path);
    expect(model.status).toBe('complete'); expect(model.stats).toEqual({ files: 2, lines: 6 });
    expect(model.symbols).toContainEqual({ sourcePath: 'include/math.hpp', line: 2, kind: 'struct_specifier', name: 'Calculator' });
    expect(model.symbols.some(s => s.kind === 'function_declaration' && s.name === 'add(int a, int b)')).toBe(true);
    expect(model.deps.map(d => d.kind)).toEqual(['local', 'system']);
    expect(await readFile(join(path, 'main.cpp'))).toEqual(before);
    expect((await parseProject(path)).files).toEqual(model.files);
  });
  it('中文空格路径、CRLF、空文件及忽略目录', async () => {
    const root = await fixture({ '中文 空格/a.cpp': 'int a;\r\nint b;\r\n', 'empty.h': '', '.git/no.cpp': 'bad', '.xdtranc/no.cpp': 'bad', 'build/no.cpp': 'bad' });
    const result = await parseProject(root); expect(result.stats).toEqual({ files: 2, lines: 2 }); expect(result.status).toBe('complete');
  });
  it('不存在路径、文件作为目录、无源码均显式失败', async () => {
    await expect(parseProject(join(base, 'does-not-exist'))).rejects.toMatchObject({ code: 'INVALID_DIRECTORY' });
    await expect(parseProject(resolve('samples/hello/main.cpp'))).rejects.toMatchObject({ code: 'INVALID_DIRECTORY' });
    await expect(parseProject(await fixture({ 'readme.txt': 'none' }))).rejects.toMatchObject({ code: 'NO_CPP_FILES' });
  });
  it('非法编码和损坏语法记录源路径、位置', async () => {
    const m = await parseProject(await fixture({ 'bad.cpp': 'int main( {', 'encoding.h': Buffer.from([0xff, 0xfe]) }));
    expect(m.status).toBe('partial'); expect(m.stats.files).toBe(2);
    expect(m.unsupported.some(i => i.sourcePath === 'bad.cpp' && i.line === 1)).toBe(true);
    expect(m.unsupported.some(i => i.sourcePath === 'encoding.h' && i.reason.includes('UTF-8'))).toBe(true);
  });
  it('未解析/越界 include 不读取目标，模板明确提示', async () => {
    const m = await parseProject(await fixture({ 'main.cpp': '#include "../../private.h"\n#include "missing.h"\ntemplate<class T> T id(T a) { return a; }\n' }));
    expect(m.deps.every(d => d.kind === 'unresolved')).toBe(true); expect(m.files).toHaveLength(1); expect(m.unsupported.length).toBeGreaterThanOrEqual(3);
  });
  it('目录联接不跟随，根链接拒绝', async () => {
    const outside = await fixture({ 'secret.cpp': 'int secret;' }); const root = await fixture({ 'main.cpp': 'int main() {}' });
    await symlink(outside, join(root, 'link'), process.platform === 'win32' ? 'junction' : 'dir');
    const m = await parseProject(root); expect(m.stats.files).toBe(1); expect(m.unsupported.some(i => i.sourcePath === 'link')).toBe(true);
    await expect(parseProject(join(root, 'link'))).rejects.toMatchObject({ code: 'INVALID_DIRECTORY' });
  });
  it('2000 行规模统计准确', async () => {
    const root = await fixture({ 'large.cpp': Array.from({ length: 2000 }, (_, i) => `int f${i}() { return ${i}; }`).join('\n') + '\n' });
    const start = performance.now(); const m = await parseProject(root);
    console.log(`2000 行解析耗时：${Math.round(performance.now() - start)}ms`);
    expect(m.stats.lines).toBe(2000); expect(m.symbols).toHaveLength(2000); expect(m.status).toBe('complete');
  });
  it('CLI 完整/部分/失败退出码及 JSON', async () => {
    const ok = cli(resolve('samples/hello'), true); expect(ok.status).toBe(0); expect(JSON.parse(ok.stdout).stats.files).toBe(2);
    const partial = cli(await fixture({ 'bad.cpp': 'int main( {' })); expect(partial.status).toBe(2); expect(partial.stdout).toContain('partial');
    const bad = cli(join(base, 'does-not-exist')); expect(bad.status).toBe(1); expect(bad.stderr).toContain('INVALID_DIRECTORY');
  });
});