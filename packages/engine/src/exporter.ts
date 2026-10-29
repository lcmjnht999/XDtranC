import { lstat, realpath, mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve, relative, isAbsolute, sep, dirname, parse } from 'node:path';
import { createHash } from 'node:crypto';
import type { ProjectModel } from '@xdtranc/shared';
import { parseConversionOutput } from '../../shared/src/outputSchema.js';
import { parseProject } from './index.js';
import { chunkModel } from './chunker.js';
import { convertChunks, type ConversionReport } from './converter.js';
import type { LlmProvider } from './provider.js';
const inside = (root: string, path: string) => { const r=relative(root,path); return !isAbsolute(r) && r!=='..' && !r.startsWith(`..${sep}`); };
const hash = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
const lines = (s:string) => s ? s.split(/\r\n|\n|\r/).length - (/\r?\n$|\r$/.test(s)?1:0) : 0;
async function checkParents(path:string) {
  const root=parse(path).root; let current=root;
  for(const part of relative(root,path).split(sep).filter(Boolean)) {
    current=resolve(current,part);
    const stat=await lstat(current);
    if(stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('目标祖先不是普通目录或包含链接');
  }
}
async function validateDestination(source:string, target:string) {
  if(inside(source,target) || inside(target,source)) throw new Error('导出目录不得与源码目录重叠');
  await checkParents(dirname(target));
  try { await lstat(target); } catch(e) { if((e as NodeJS.ErrnoException).code==='ENOENT') return; throw e; }
  throw new Error('目标已存在，拒绝覆盖');
}
export async function exportProject(input:string, out:string, provider:LlmProvider, budget=4096, signal?:AbortSignal) {
  const root=await realpath(resolve(input)); await validateDestination(root,resolve(out));
  const model=await parseProject(input,signal);
  const report=await convertChunks(model,await chunkModel(model,budget,signal),provider,signal);
  return exportReport(model,report,out,signal);
}
export async function exportReport(model:ProjectModel, report:ConversionReport, out:string, signal?:AbortSignal) {
  signal?.throwIfAborted(); const target=resolve(out);
  await validateDestination(await realpath(model.root),target);
  const outputs=report.results.flatMap(r=>{
    const output=parseConversionOutput(r.output);
    if(!output.selfCheck.passed) throw new Error('拒绝导出自核查失败结果');
    return output.outputs;
  });
  const keys=new Set<string>();
  for(const o of outputs) {
    const key=o.path.normalize('NFC').toLowerCase();
    if(keys.has(key) || [...keys].some(p=>p.startsWith(key+'/') || key.startsWith(p+'/'))) throw new Error('重复输出路径或文件目录冲突');
    keys.add(key);
  }
  for(const f of model.files) {
    const full=resolve(model.root,f.path);
    if(!inside(model.root,full) || await realpath(full)!==full || hash(await readFile(full))!==f.hash) throw new Error('源码路径或内容已变化，拒绝导出旧结果');
  }
  signal?.throwIfAborted(); await mkdir(target); // Exclusive reservation, never recursive.
  const marker=resolve(target,'EXPORT-INCOMPLETE.json');
  await writeFile(marker,JSON.stringify({status:'incomplete',note:'开始写入标记；只有有效 export-manifest.json 存在时导出才完成。失败/取消后保留文件，不自动删除。'},null,2),{flag:'wx'});
  const records: {path:string; hash:string; lines:number; bytes:number}[]=[];
  try {
    for(const o of outputs) {
      signal?.throwIfAborted(); const full=resolve(target,'src',o.path);
      if(!inside(resolve(target,'src'),full)) throw new Error('输出路径越界');
      await checkParents(target); await mkdir(dirname(full),{recursive:true}); await checkParents(dirname(full));
      await writeFile(full,o.code,{flag:'wx'});
      const bytes=await readFile(full); if(hash(bytes)!==hash(o.code)) throw new Error('写入内容校验失败');
      records.push({path:`src/${o.path}`,hash:hash(bytes),lines:lines(o.code),bytes:bytes.length});
    }
    signal?.throwIfAborted();
    const status=records.length===0?'failed':report.status==='partial'||report.failedChunks.length||report.unassigned.length||report.unsupported.length?'partial':'complete';
    const inputFiles=model.stats.files, inputLines=model.stats.lines, outputLines=records.reduce((n,f)=>n+f.lines,0);
    const manifest={version:1,status,simulated:report.simulated,providerId:report.providerId,model:report.model,files:records,inputFileCount:inputFiles,exportedFileCount:records.length,inputLines,outputLines,exportedFileRatio:inputFiles?records.length/inputFiles:null,lineRetentionRatio:inputLines?outputLines/inputLines:null,emptyFileCount:records.filter(f=>f.bytes===0).length,businessStubCheck:'not-verified',warnings:['文件数比不是源码覆盖率；行数比不是语义保留率。','仅源码草稿，未验证编译或业务逻辑；无 CJPM 配置。'],unsupported:report.unsupported,failedChunks:report.failedChunks,unassigned:report.unassigned};
    await checkParents(target);
    await writeFile(resolve(target,'README.md'),`# 导出源码草稿\n\n模拟结果：${report.simulated}\n状态：${status}\n\n不是已验证可构建的仓颉项目。以 export-manifest.json 为完成依据；EXPORT-INCOMPLETE.json 是保留的开始标记，不单独代表最终状态。\n`,{flag:'wx'});
    signal?.throwIfAborted();
    await writeFile(resolve(target,'export-manifest.json'),JSON.stringify(manifest,null,2),{flag:'wx'});
    return manifest;
  } catch(e) { throw new Error(`导出未完成，残留目录保留于 ${target}；无有效完成清单时不得视为成功：${e instanceof Error?e.message:String(e)}`); }
}