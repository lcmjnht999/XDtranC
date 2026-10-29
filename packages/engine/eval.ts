import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, readFile, readdir } from 'node:fs/promises';
import { resolve, join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { parseProject } from './src/index.js';
import { chunkModel } from './src/chunker.js';
import { convertChunks } from './src/converter.js';
import { exportReport } from './src/exporter.js';
import type { LlmProvider } from './src/provider.js';

const cases = ['normal','empty','comments','partial','self-check-exhausted','unsupported'] as const;
await mkdir('.deepworks/tmp', { recursive: true });
await mkdir('outputs', { recursive: true });
const temp = await mkdtemp(resolve('.deepworks/tmp/integrity-eval-'));
const dest = await mkdtemp(resolve('outputs/integrity-eval-'));
const source = join(temp,'source'); await mkdir(source);
await writeFile(join(source,'a.cpp'),'int a() { return 1; }\n',{flag:'wx'});
await writeFile(join(source,'b.cpp'),'int b() { return 2; }\n',{flag:'wx'});
const model = await parseProject(source);
const plan = await chunkModel(model,4096);
assert.equal(plan.chunks.length,2,'评测要求两个独立chunk');
const results: Record<string,unknown>[] = [];
async function tree(root:string):Promise<string[]> {
 const files:string[]=[];
 for(const e of await readdir(root,{withFileTypes:true})) {
  if(e.isDirectory()) files.push(...(await tree(join(root,e.name))).map(p=>e.name+'/'+p));
  else files.push(e.name);
 }
 return files.sort();
}
for(const name of cases) {
 try {
  const calls = new Map<string,number>();
  const provider:LlmProvider = {id:'offline-eval',model:name,simulated:true,async generate(request) {
   const path=request.sources[0].path;calls.set(path,(calls.get(path)??0)+1);
   if((calls.get(path)??0)>1) assert.ok(request.retryIssues.length,'重试必须携带问题');
   const fail = name==='self-check-exhausted'||(name==='partial'&&path==='b.cpp');
   const outputs = name==='empty'||name==='unsupported'?[]:request.sources.map(s=>({path:s.path.replace('.cpp','.cj'),code:name==='comments'?'// only comment\n':'// 人工测试数据，不是模型转换\nmain() { println("fixture") }\n'}));
   return {kind:'conversion',outputs,unsupported:name==='unsupported'?request.sources.map(s=>({sourcePath:s.path,line:null,reason:'人工构造不支持项'})):[],selfCheck:{passed:!fail,issues:fail?['人工构造自核查失败']:[]},explanation:'离线结构评测',confidence:0};
  }};
  const report=await convertChunks(model,plan,provider);
  const expectedFailed=name==='normal'||name==='unsupported'?0:name==='partial'?1:2;
  assert.equal(report.failedChunks.length,expectedFailed);
  assert.equal(report.results.length,2-expectedFailed);
  assert.equal(report.status,name==='normal'?'complete':'partial');
  for(const f of report.failedChunks){assert.equal(f.attempts,3);assert.ok(f.issues.length);}
  assert.equal([...calls.values()].reduce((a,b)=>a+b,0),expectedFailed*3+(2-expectedFailed));
  assert.equal(report.unsupported.length,name==='unsupported'?2:expectedFailed);
  const target=join(temp,name);
  const manifest=await exportReport(model,report,target);
  const count=name==='normal'?2:name==='partial'?1:0;
  assert.equal(manifest.exportedFileCount,count);
  assert.equal(manifest.status,count===0?'failed':name==='normal'?'complete':'partial');
  assert.equal(manifest.businessStubCheck,'not-verified');
  assert.equal(manifest.emptyFileCount,0);
  assert.equal(manifest.exportedFileRatio,count/2);
  assert.deepEqual(manifest.failedChunks,report.failedChunks);
  assert.deepEqual(manifest.unsupported,report.unsupported);
  assert.deepEqual(JSON.parse(await readFile(join(target,'export-manifest.json'),'utf8')),manifest);
  const expectedOutputs=new Map(report.results.flatMap(r=>r.output.outputs.map(o=>['src/'+o.path,o.code] as const)));
  assert.deepEqual((await tree(target)).filter(p=>p.startsWith('src/')),manifest.files.map(f=>f.path).sort());
  let outputLines=0;
  for(const f of manifest.files){const bytes=await readFile(join(target,f.path));assert.equal(bytes.toString('utf8'),expectedOutputs.get(f.path));assert.equal(bytes.length,f.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),f.hash);const text=bytes.toString('utf8');const lines=text.split(/\r\n|\n|\r/).length-(/\r?\n$|\r$/.test(text)?1:0);assert.equal(lines,f.lines);outputLines+=lines;}
  assert.equal(manifest.outputLines,outputLines);assert.equal(manifest.lineRetentionRatio,outputLines/model.stats.lines);
  for(const f of model.files) assert.equal(createHash('sha256').update(await readFile(join(source,f.path))).digest('hex'),f.hash);
  results.push({case:name,passed:true,conversionStatus:report.status,exportStatus:manifest.status,exportedFiles:count,failedChunks:expectedFailed,providerCalls:[...calls.values()].reduce((a,b)=>a+b,0)});
 } catch(e) {results.push({case:name,passed:false,error:e instanceof Error?e.message:String(e)});}
}
const passed=results.every(r=>r.passed);
const summary={version:1,passed,scope:'仅离线结构完整性，不是模型或业务语义验收',businessSemantics:'not-verified',compilation:'not-verified',results};
await writeFile(join(dest,'report.json'),JSON.stringify(summary,null,2),{flag:'wx'});
await writeFile(join(dest,'report.md'),'# 离线完整性评测\n\n结果：'+(passed?'全部符合预期':'存在失败')+'\n\n仅结构检查；业务语义保留、真实模型与仓颉编译均未验证。负面用例通过表示错误被正确记录，不表示转换成功。\n\n| 用例 | 符合预期 | 转换状态 | 导出状态 |\n|---|---|---|---|\n'+results.map(r=>`| ${r.case} | ${r.passed} | ${r.conversionStatus??'异常'} | ${r.exportStatus??'异常'} |`).join('\n')+'\n\n详细断言失败见 report.json。测试数据和中间导出仅保留在 .deepworks/tmp，不自动删除。\n',{flag:'wx'});
console.log('评测报告：'+relative(process.cwd(),dest));
console.log(JSON.stringify(summary,null,2));
if(!passed)process.exitCode=1;