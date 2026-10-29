import { readFile, realpath } from 'node:fs/promises';
import { resolve, relative, isAbsolute, sep } from 'node:path';
import { createHash } from 'node:crypto';
import type { ChunkResult, Issue, ProjectModel } from '@xdtranc/shared';
import { parseConversionOutput, type ConversionOutput } from '../../shared/src/outputSchema.js';
import { parseProject } from './index.js';
import { chunkModel } from './chunker.js';
import type { LlmProvider } from './provider.js';
export interface ConversionReport {
  simulated: boolean; providerId: string; model: string; status: 'complete' | 'partial';
  results: { chunkId: string; attempts: number; output: ConversionOutput }[];
  failedChunks: { chunkId: string; attempts: number; issues: string[] }[];
  unassigned: Issue[]; unsupported: Issue[];
}
export async function convertProject(input: string, provider: LlmProvider, budget = 4096, signal?: AbortSignal) {
  const model = await parseProject(input, signal);
  return convertChunks(model, await chunkModel(model, budget, signal), provider, signal);
}
export async function convertChunks(model: ProjectModel, plan: ChunkResult, provider: LlmProvider, signal?: AbortSignal): Promise<ConversionReport> {
  signal?.throwIfAborted();
  const report: ConversionReport = { simulated: provider.simulated, providerId: provider.id, model: provider.model, status: 'complete', results: [], failedChunks: [], unassigned: plan.unassigned, unsupported: [...plan.unsupported, ...plan.unassigned] };
  const accepted = new Set<string>(); const failed = new Set<string>();
  for (const chunk of plan.chunks) {
    signal?.throwIfAborted(); let attempts = 0; let issues: string[] = [];
    try {
      if (chunk.deps.some(d => failed.has(d))) throw new Error('依赖 chunk 转换失败');
      const sources = [];
      for (const path of chunk.files) {
        const full = resolve(model.root,path), rel = relative(model.root,full);
        if (isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`) || await realpath(full) !== full) throw new Error('源码路径越界或链接变化');
        const bytes = await readFile(full), baseline = model.files.find(f=>f.path===path);
        if (!baseline || baseline.hash !== createHash('sha256').update(bytes).digest('hex')) throw new Error('源文件已变化，请重新解析');
        sources.push({ path, code: new TextDecoder('utf-8',{fatal:true}).decode(bytes) });
      }
      for (let attempt = 0; attempt < 3; attempt++) {
        signal?.throwIfAborted(); attempts++;
        // Copy on every attempt: providers cannot mutate canonical sources/context.
        const request = structuredClone({ prompt: '将当前 C++ chunk 转为仓颉草稿。只返回 conversion JSON，包含 outputs(path/code)、unsupported(sourcePath/line/reason)、selfCheck(passed/issues)、explanation、confidence。不支持项必须报告；不得删除业务逻辑换通过。不得声称编译验证。', sources, contextBundle: chunk.contextBundle, retryIssues: issues });
        let raw: unknown;
        try { raw = await provider.generate(request, signal); }
        catch (e) { signal?.throwIfAborted(); throw new Error(`Provider 调用失败：${e instanceof Error ? e.message : '未知错误'}`); }
        signal?.throwIfAborted();
        try {
          const output = parseConversionOutput(raw);
          if (output.unsupported.some(u=>!chunk.files.includes(u.sourcePath))) throw new Error('unsupported 引用当前块之外的文件');
          if (!output.outputs.length && chunk.files.some(f=>!output.unsupported.some(u=>u.sourcePath===f))) throw new Error('无输出文件未全部登记 unsupported');
          if (!output.selfCheck.passed) throw new Error(`自核查失败：${output.selfCheck.issues.join('; ') || '未给出原因'}`);
          if (output.outputs.some(o=>accepted.has(o.path.normalize('NFC').toLowerCase()))) throw new Error('跨 chunk 输出路径冲突');
          output.outputs.forEach(o=>accepted.add(o.path.normalize('NFC').toLowerCase()));
          report.results.push({ chunkId: chunk.id, attempts, output }); report.unsupported.push(...output.unsupported);
          issues = []; break;
        } catch (e) { issues = [e instanceof Error ? e.message : '输出无效']; }
      }
      if (issues.length) throw new Error(issues.join('; '));
    } catch (e) {
      signal?.throwIfAborted(); issues = [e instanceof Error ? e.message : '转换失败']; failed.add(chunk.id);
      report.failedChunks.push({ chunkId: chunk.id, attempts, issues });
      report.unsupported.push(...chunk.files.map(sourcePath=>({sourcePath,line:null,reason:issues.join('; ')})));
    }
  }
  if (report.failedChunks.length || report.unsupported.length) report.status = 'partial';
  return report;
}