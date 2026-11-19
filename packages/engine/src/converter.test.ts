import { it, expect } from 'vitest';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseConversionOutput } from '../../shared/src/outputSchema.js';
import { convertProject, convertChunks } from './converter.js';
import { MockProvider, type LlmProvider, type ConversionRequest } from './provider.js';
import { parseProject } from './index.js';
import { chunkModel } from './chunker.js';
const valid = () => ({kind:'conversion', outputs:[{path:'a.cj',code:'main() { return 0 }'}],unsupported:[],selfCheck:{passed:true,issues:[] as string[]},explanation:'测试',confidence:0});
async function fixture(code='int a;') { const base=resolve('.deepworks/tmp'); await mkdir(base,{recursive:true}); const root=await mkdtemp(join(base,'convert-')); await writeFile(join(root,'a.cpp'),code); return root; }
function provider(fn:(r:ConversionRequest)=>unknown): LlmProvider { return { id:'test',model:'test-v1',simulated:true,generate:async r=>fn(r) }; }
it('固定样例串联成功且明确模拟，未知源码显式不支持',async()=>{
  const r=await convertProject('samples/hello',new MockProvider()); expect(r.status).toBe('complete'); expect(r.simulated).toBe(true); expect(r.results).toHaveLength(2);
  const unknown=await convertProject(await fixture(),new MockProvider()); expect(unknown.status).toBe('partial'); expect(unknown.unsupported[0].reason).toContain('Mock'); expect(unknown.results[0].output.outputs).toEqual([]);
});
it('schema 和自核查问题带回重试，第三次成功',async()=>{
  const calls:ConversionRequest[]=[]; const p=provider(r=>{calls.push(r); if(calls.length===1)return '{}'; if(calls.length===2)return {...valid(),selfCheck:{passed:false,issues:['逻辑缺失']}};return valid();});
  const result=await convertProject(await fixture(),p); expect(result.results[0].attempts).toBe(3); expect(calls[1].retryIssues).toHaveLength(1); expect(calls[2].retryIssues[0]).toContain('逻辑缺失'); expect(calls[0].retryIssues).toEqual([]); expect(calls[0].prompt).toContain('kind'); expect(calls[0].prompt).toContain('"conversion"'); expect(calls[0].prompt).toContain('0 到 1'); expect(calls[0].prompt).toContain('func 关键字'); expect(calls[0].prompt).not.toContain('multiply'); expect(calls[0].prompt).toContain('不能仅改扩展名'); expect(calls[0].prompt).toContain('不要编造实现'); expect(calls[0].prompt).toContain('不要照抄标识符'); expect(calls[0].prompt).toContain('禁止写成');
  expect(Object.keys(calls[0]).sort()).toEqual(['contextBundle','prompt','retryIssues','sources']); expect(calls[0].sources).toEqual([{path:'a.cpp',code:'int a;'}]);
});
it('持续失败恰好调用三次并登记源文件',async()=>{
  let calls=0;const r=await convertProject(await fixture(),provider(()=>{calls++;return 'broken';})); expect(calls).toBe(3); expect(r.failedChunks[0].attempts).toBe(3); expect(r.unsupported[0].sourcePath).toBe('a.cpp');
});
it('路径安全、重复与空输出验证',()=>{
  for(const path of ['../a.cj','/a.cj','C:/a.cj','a\\b.cj','NUL.cj','a/../b.cj','a:ads.cj']) expect(()=>parseConversionOutput({...valid(),outputs:[{path,code:'x'}]})).toThrow();
  for(const code of ['','  ','// placeholder','/* empty */']) expect(()=>parseConversionOutput({...valid(),outputs:[{path:'a.cj',code}]})).toThrow();
  expect(()=>parseConversionOutput({...valid(),outputs:[]})).toThrow(); expect(()=>parseConversionOutput({...valid(),outputs:[{path:'a.cj',code:'x'},{path:'A.cj',code:'y'}]})).toThrow();
});
it('跨块冲突和依赖失败不能覆盖已有输出',async()=>{
  const r=await convertProject('samples/hello',provider(()=>valid())); expect(r.results).toHaveLength(1); expect(r.failedChunks[0].issues[0]).toContain('冲突');
  const fail=await convertProject('samples/hello',provider(()=>null)); expect(fail.failedChunks).toHaveLength(2); expect(fail.failedChunks[1].attempts).toBe(0);
});
it('源变化拒绝调用 Provider，切分未分配保留',async()=>{
  const root=await fixture(), model=await parseProject(root), plan=await chunkModel(model,4096); await writeFile(join(root,'a.cpp'),'int b;'); let calls=0;
  const r=await convertChunks(model,plan,provider(()=>{calls++;return valid();})); expect(calls).toBe(0); expect(r.failedChunks[0].issues[0]).toContain('变化');
  const small=await convertProject(root,new MockProvider(),1); expect(small.unassigned).toHaveLength(0); expect(small.failedChunks).toHaveLength(1); expect(small.failedChunks[0].issues[0]).toContain('无法缩块');
});
it('提前取消、调用中取消与 Provider 异常',async()=>{
  const c=new AbortController();c.abort(); await expect(convertProject('samples/hello',new MockProvider(),4096,c.signal)).rejects.toMatchObject({name:'AbortError'});
  const d=new AbortController(); await expect(convertProject(await fixture(),provider(()=>{d.abort();return valid();}),4096,d.signal)).rejects.toMatchObject({name:'AbortError'});
  const fail=await convertProject(await fixture(),provider(()=>{throw new Error('offline failure');})); expect(fail.failedChunks[0].attempts).toBe(1);
});
it('不支持清单不能指向无关文件',async()=>{
  const r=await convertProject(await fixture(),provider(()=>({...valid(),unsupported:[{sourcePath:'settings.json',line:null,reason:'bad'}]}))); expect(r.failedChunks[0].issues[0]).toContain('之外');
});
it('CLI JSON 及 0/2/1 返回码',()=>{
  const run=(...args:string[])=>spawnSync(process.execPath,['--import','tsx','packages/cli/src/convert.ts','samples/hello',...args],{encoding:'utf8',timeout:15000});
  const ok=run('--provider=mock','--json'); expect(ok.status).toBe(0);expect(JSON.parse(ok.stdout).simulated).toBe(true); expect(run('--provider=mock','--budget-tokens=1').status).toBe(2); expect(run('--provider=remote').status).toBe(1);
});
it('cloud CLI fails closed without explicit target or external consent', () => {
  const run = (...args: string[]) => spawnSync(process.execPath, ['--import', 'tsx', 'packages/cli/src/convert.ts', 'samples/hello', ...args], {
    encoding: 'utf8', timeout: 15000, env: { ...process.env, XDTRAN_API_KEY: 'test-only-secret' },
  });
  expect(run('--provider=openai').status).toBe(1);
  const denied = run('--provider=openai', '--endpoint=https://example.invalid/v1', '--model=test');
  expect(denied.status).toBe(1);
  expect(denied.stderr).not.toContain('test-only-secret');
  expect(run('--provider=mock', '--allow-external').status).toBe(1);
  expect(run('--provider=openai', '--provider=openai').status).toBe(1);
});

it('续跑不能绕过源变化或自核查，失败不调用模型', async () => {
  const root = await fixture(), model = await parseProject(root), plan = await chunkModel(model, 4096);
  let calls = 0; const p = provider(() => { calls++; return valid(); });
  const bad = parseConversionOutput({ ...valid(), selfCheck: { passed: false, issues: ['missing'] } });
  const failed = await convertChunks(model, plan, p, undefined, undefined, new Map([[plan.chunks[0].id, bad]]));
  expect(failed.results).toHaveLength(0); expect(failed.failedChunks[0].issues[0]).toContain('自核查');
  await writeFile(join(root, 'a.cpp'), 'int changed;');
  const changed = await convertChunks(model, plan, p, undefined, undefined, new Map([[plan.chunks[0].id, parseConversionOutput(valid())]]));
  expect(changed.failedChunks[0].issues[0]).toContain('变化'); expect(calls).toBe(0);
});
it('仅声明头文件显式不支持时为部分完成，缓存必须登记每个源文件', async () => {
  const root = await fixture(); await writeFile(join(root, 'a.h'), 'struct A { int method(); };');
  await writeFile(join(root, 'a.cpp'), '#include "a.h"');
  const model = await parseProject(root), plan = await chunkModel(model, 4096);
  const unsupported = (files: string[]) => parseConversionOutput({ ...valid(), outputs: [], unsupported: files.map(sourcePath => ({ sourcePath, line: 1, reason: '仅声明，无法可靠转换' })) });
  const partial = await convertChunks(model, plan, provider(r => unsupported(r.sources.map(s => s.path))));
  expect(partial.status).toBe('partial'); expect(partial.failedChunks).toHaveLength(0);
  expect(partial.unsupported.map(u => u.sourcePath).sort()).toEqual(['a.cpp', 'a.h']);
  const cached = new Map([[plan.chunks[0].id, unsupported(['a.h'])]]);
  const result = await convertChunks(model, plan, provider(() => { throw Error('不应调用'); }), undefined, undefined, cached);
  expect(result.results).toHaveLength(0); expect(result.failedChunks[0].issues[0]).toContain('未全部登记');
});
it('依赖失败时不能复用下游缓存', async () => {
  const model = await parseProject('samples/hello'), plan = await chunkModel(model, 4096);
  const dependent = plan.chunks.find(c => c.deps.length)!;
  expect(dependent).toBeDefined();
  const result = await convertChunks(model, plan, provider(() => null), undefined, undefined, new Map([[dependent.id, parseConversionOutput(valid())]]));
  expect(result.results).toHaveLength(0);
  expect(result.failedChunks.find(c => c.chunkId === dependent.id)?.issues[0]).toContain('依赖');
});
