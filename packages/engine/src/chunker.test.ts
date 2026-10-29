import { it, expect } from 'vitest';
import { mkdir, mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { chunkProject, chunkModel } from './chunker.js';
import { parseProject } from './index.js';
async function fixture(files: Record<string,string | Buffer>) {
  const base = resolve('.deepworks/tmp'); await mkdir(base,{recursive:true}); const root = await mkdtemp(join(base,'chunk-'));
  for(const [p,t] of Object.entries(files)) { await mkdir(resolve(root,p,'..'),{recursive:true}); await writeFile(join(root,p),t); } return root;
}
it('确定性、预算、完整性及源文件不变', async()=>{
  const root = resolve('samples/hello'); const before = await readFile(join(root,'main.cpp'));
  const a = await chunkProject(root), b = await chunkProject(root); expect(a).toEqual(b); expect(a.status).toBe('complete');
  expect(a.chunks.flatMap(c=>c.files).sort()).toEqual(['include/math.hpp','main.cpp']); expect(a.chunks.every(c=>c.estTokens<=4096)).toBe(true); expect(await readFile(join(root,'main.cpp'))).toEqual(before);
});
it('传递依赖先于调用方，跨块摘要不含函数体',async()=>{
  const root = await fixture({'a/a.h':'int answer() { return 42; }\n','b/b.h':'#include "../a/a.h"\nint b();\n','c/c.cpp':'#include "../b/b.h"\nint main() { return answer(); }\n'});
  const r = await chunkProject(root); expect(r.chunks.map(c=>c.files[0])).toEqual(['a/a.h','b/b.h','c/c.cpp']);
  expect(r.chunks[2].contextBundle.some(s=>s.signature==='int answer();')).toBe(true); expect(JSON.stringify(r.chunks[2].contextBundle)).not.toContain('return 42'); expect(r.chunks[2].deps).toEqual(['chunk-0002']);
});
it('环整体入块，预算不足则整体未分配并阻断依赖方',async()=>{
  const root = await fixture({'a.h':'#include "b.h"\nint a();','b.h':'#include "a.h"\nint b();','main.cpp':'#include "a.h"\nint main() {}'});
  const ok = await chunkProject(root); expect(ok.chunks[0].files).toContain('a.h'); expect(ok.chunks[0].files).toContain('b.h');
  const bad = await chunkProject(root,10); expect(bad.chunks).toHaveLength(0); expect(bad.unassigned.map(i=>i.sourcePath).sort()).toEqual(['a.h','b.h','main.cpp']);
});
it('上下文纳入硬预算，孤立文件独立',async()=>{
  const root = await fixture({'h/a.h':'int a();','s/m.cpp':'#include "../h/a.h"\nint main() {}','orphan.cpp':'int orphan;'});
  const r = await chunkProject(root,60); expect(r.unassigned.some(i=>i.sourcePath==='s/m.cpp')).toBe(true); expect(r.chunks).toHaveLength(2);
  expect(r.chunks.every(c=>c.estTokens<=60)).toBe(true);
});
it('编码与语法失败不静默丢失，未知 include 保留提示',async()=>{
  const root = await fixture({'bad.cpp':'int main() { return +; }','bad.h':Buffer.from([255]),'ok.cpp':'#include "missing.h"\nint a;'});
  const r = await chunkProject(root); expect(r.status).toBe('partial'); expect(r.unassigned).toHaveLength(2); expect(r.chunks.flatMap(c=>c.files)).toEqual(['ok.cpp']); expect(r.unsupported.some(i=>i.reason.includes('missing.h'))).toBe(true);
});
it('源文件变化拒绝复用旧模型',async()=>{
  const root=await fixture({'a.cpp':'int a;'}), m=await parseProject(root); await writeFile(join(root,'a.cpp'),'int b;'); const r=await chunkModel(m,4096); expect(r.unassigned[0].reason).toContain('变化');
});
it('非法预算与预先/处理中取消',async()=>{
  for(const b of [0,-1,1.2,NaN,Infinity]) await expect(chunkProject('samples/hello',b)).rejects.toMatchObject({code:'INVALID_BUDGET'});
  const c=new AbortController(); c.abort(); await expect(chunkProject('samples/hello',4096,c.signal)).rejects.toMatchObject({name:'AbortError'});
  const m=await parseProject('samples/hello'), d=new AbortController(); const promise=chunkModel(m,4096,d.signal); d.abort(); await expect(promise).rejects.toMatchObject({name:'AbortError'});
});
it('2000 行项目全部分配',async()=>{
  const root=await fixture(Object.fromEntries(Array.from({length:20},(_,i)=>[`${i}.cpp`,Array.from({length:100},(_,j)=>`int f${i}_${j}() { return ${j}; }`).join('\n')+'\n'])));
  const start=performance.now(), r=await chunkProject(root); console.log(`2000 行解析加切分：${Math.round(performance.now()-start)}ms`); expect(r.status).toBe('complete'); expect(r.chunks.flatMap(c=>c.files)).toHaveLength(20); expect(r.chunks.every(c=>c.estTokens<=4096)).toBe(true);
});
it('CLI JSON 和 0/2/1 退出码',()=>{
  const run=(...args:string[])=>spawnSync(process.execPath,['--import','tsx','packages/cli/src/chunk.ts','samples/hello',...args],{encoding:'utf8',timeout:15000});
  const ok=run('--json'); expect(ok.status).toBe(0); expect(JSON.parse(ok.stdout).chunks.length).toBeGreaterThan(0); expect(run('--budget-tokens=1').status).toBe(2); expect(run('--budget-tokens=0').status).toBe(1); expect(run('--wat').status).toBe(1);
});