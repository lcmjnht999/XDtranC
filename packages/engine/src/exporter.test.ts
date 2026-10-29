import { it, expect } from 'vitest';
import { mkdir, mkdtemp, writeFile, readFile, access, symlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { exportProject, exportReport } from './exporter.js';
import { parseProject } from './index.js';
import { convertProject } from './converter.js';
import { MockProvider } from './provider.js';
async function temp(){const base=resolve('.deepworks/tmp');await mkdir(base,{recursive:true});return mkdtemp(join(base,'export-'));}
async function data(){return {model:await parseProject('samples/hello'),report:await convertProject('samples/hello',new MockProvider())};}
it('真实落盘、hash、数量与源码不变',async()=>{
 const out=join(await temp(),'out'),before=await readFile('samples/hello/main.cpp');
 const m=await exportProject('samples/hello',out,new MockProvider()); expect(m.status).toBe('complete');expect(m.simulated).toBe(true);expect(m.exportedFileCount).toBe(2);expect(m.exportedFileRatio).toBe(1);
 for(const f of m.files){const b=await readFile(join(out,f.path));expect(createHash('sha256').update(b).digest('hex')).toBe(f.hash);expect(b.length).toBe(f.bytes);}
 expect(JSON.parse(await readFile(join(out,'export-manifest.json'),'utf8'))).toEqual(m);expect(m.outputLines/m.inputLines).toBe(m.lineRetentionRatio);expect(await readFile('samples/hello/main.cpp')).toEqual(before);
});
it('已有目录、源码重叠与祖先联接拒绝',async()=>{
 const base=await temp();await writeFile(join(base,'keep.txt'),'unchanged'); await expect(exportProject('samples/hello',base,new MockProvider())).rejects.toThrow('已存在');expect(await readFile(join(base,'keep.txt'),'utf8')).toBe('unchanged');
 await expect(exportProject('samples/hello','samples/hello/out',new MockProvider())).rejects.toThrow('重叠');
 const outside=await temp();await symlink(outside,join(base,'link'),process.platform==='win32'?'junction':'dir');await expect(exportProject('samples/hello',join(base,'link/out'),new MockProvider())).rejects.toThrow('链接');
});
it('路径穿越、重复和文件目录冲突在写盘前拒绝',async()=>{
 for(const path of ['../evil.cj','/evil.cj','a\\b.cj']){const {model,report}=await data();report.results[0].output.outputs[0].path=path; const out=join(await temp(),'out');await expect(exportReport(model,report,out)).rejects.toThrow();await expect(access(out)).rejects.toThrow();}
 const {model,report}=await data();report.results[1].output.outputs[0].path=report.results[0].output.outputs[0].path; await expect(exportReport(model,report,join(await temp(),'out'))).rejects.toThrow('重复');
 report.results[1].output.outputs[0].path=report.results[0].output.outputs[0].path+'/x.cj';await expect(exportReport(model,report,join(await temp(),'out'))).rejects.toThrow('冲突');
});
it('部分与零输出保留问题且不宣称成功',async()=>{
 const {model,report}=await data();report.status='partial'; report.unsupported.push({sourcePath:'main.cpp',line:1,reason:'测试问题'});report.results.pop();const partial=await exportReport(model,report,join(await temp(),'out'));expect(partial.status).toBe('partial');expect(partial.exportedFileCount).toBe(1);expect(partial.unsupported).toHaveLength(1);
 const zero=await exportProject('samples/hello',join(await temp(),'out'),new MockProvider(),1);expect(zero.status).toBe('failed');expect(zero.exportedFileCount).toBe(0);expect(zero.unassigned).toHaveLength(2);
});
it('源文件变化拒绝导出',async()=>{
 const root=await temp();await writeFile(join(root,'a.cpp'),'int a;');const model=await parseProject(root),report=await convertProject(root,new MockProvider());await writeFile(join(root,'a.cpp'),'int b;');await expect(exportReport(model,report,join(await temp(),'out'))).rejects.toThrow('变化');
});
it('中途写入失败保留标记，不生成完成清单',async()=>{
 const {model,report}=await data();report.results[1].output.outputs[0].path='x'.repeat(300)+'.cj';const out=join(await temp(),'out');await expect(exportReport(model,report,out)).rejects.toThrow('未完成');await access(join(out,'EXPORT-INCOMPLETE.json'));await expect(access(join(out,'export-manifest.json'))).rejects.toThrow();await access(join(out,'src/calculator.cj'));
});
it('预取消不创建目录',async()=>{
 const {model,report}=await data(),c=new AbortController(),out=join(await temp(),'out');c.abort();await expect(exportReport(model,report,out,c.signal)).rejects.toMatchObject({name:'AbortError'});await expect(access(out)).rejects.toThrow();
});
it('CLI 0/2/1 返回码及现有目录不覆盖',async()=>{
 const base=await temp();const run=(out:string,...extra:string[])=>spawnSync(process.execPath,['--import','tsx','packages/cli/src/export.ts','samples/hello','--provider=mock','--format=dir',`--out=${out}`,...extra],{encoding:'utf8',timeout:15000});
 const ok=run(join(base,'ok'),'--json');expect(ok.status).toBe(0);expect(JSON.parse(ok.stdout).simulated).toBe(true);expect(run(join(base,'ok')).status).toBe(1);expect(run(join(base,'zero'),'--budget-tokens=1').status).toBe(2);
});
it('写入期间取消保留已有文件但不生成完成清单',async()=>{
 const {model,report}=await data(),c=new AbortController(),out=join(await temp(),'out');
 const original=c.signal.throwIfAborted.bind(c.signal);let checks=0;
 c.signal.throwIfAborted=()=>{if(++checks===4)c.abort();original();};
 await expect(exportReport(model,report,out,c.signal)).rejects.toThrow('未完成');
 await access(join(out,'src/calculator.cj'));await access(join(out,'EXPORT-INCOMPLETE.json'));await expect(access(join(out,'export-manifest.json'))).rejects.toThrow();
});