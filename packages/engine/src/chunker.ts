import { readFile, realpath, lstat } from 'node:fs/promises';
import { resolve, relative, isAbsolute, sep, posix } from 'node:path';
import { createHash } from 'node:crypto';
import { setImmediate } from 'node:timers/promises';
import type { ProjectModel, ChunkResult, DeclarationSummary } from '@xdtranc/shared';
import { ProjectError } from '../../shared/src/errors.js';
import { parseProject } from './index.js';
// Deliberately conservative, model-independent estimate; comments cost the same as code.
export const estimateTokens = (text: string): number => Buffer.byteLength(text, 'utf8');
export async function chunkProject(input: string, budgetTokens = 4096, signal?: AbortSignal): Promise<ChunkResult> {
  validateBudget(budgetTokens);
  return chunkModel(await parseProject(input, signal), budgetTokens, signal);
}
function validateBudget(n: number) {
  if (!Number.isSafeInteger(n) || n <= 0) throw new ProjectError('INVALID_BUDGET', '预算必须为正安全整数');
}
export async function chunkModel(model: ProjectModel, budgetTokens: number, signal?: AbortSignal): Promise<ChunkResult> {
  validateBudget(budgetTokens); signal?.throwIfAborted();
  const result: ChunkResult = { budgetTokens, estimator: 'utf8-bytes-v1 (source + JSON context; comments included)', chunks: [], unassigned: [], unsupported: [...model.unsupported], status: 'complete' };
  const files = [...new Set(model.discoveredFiles ?? model.files.map(f => f.path))].sort();
  const graph = new Map(files.map(f => [f, model.deps.filter(d => d.sourcePath === f && d.kind === 'local' && d.targetPath && files.includes(d.targetPath)).map(d => d.targetPath!).sort()]));
  const sources = new Map<string, string>();
  const failures = new Map<string, string>();
  for (const file of files) {
    await setImmediate(); signal?.throwIfAborted();
    try {
      const full = resolve(model.root, file); const rel = relative(model.root, full);
      if (isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`)) throw new Error('路径越界');
      const actual = await realpath(full);
      if (actual !== full || (await lstat(full)).isSymbolicLink()) throw new Error('拒绝链接或路径变化');
      const bytes = await readFile(full), baseline = model.files.find(f => f.path === file);
      if (!baseline || baseline.hash !== createHash('sha256').update(bytes).digest('hex')) throw new Error('源文件已变化或没有可验证基线，请重新解析');
      if (baseline.lines === null) throw new Error('非法编码或解析未完成');
      if (model.unsupported.some(i => i.sourcePath === file && /语法错误|文件处理失败/.test(i.reason))) throw new Error('解析失败，不参与切分');
      sources.set(file, new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    } catch (e) { failures.set(file, e instanceof Error ? e.message : '读取失败'); }
  }
  // Iterative DFS finishing order, then reverse graph: SCCs without recursion limits.
  const seen = new Set<string>(), order: string[] = [];
  for (const start of files) {
    const stack: [string, boolean][] = [[start, false]];
    while (stack.length) {
      const [f, done] = stack.pop()!;
      if (done) { order.push(f); continue; }
      if (seen.has(f)) continue;
      seen.add(f); stack.push([f, true]);
      for (const d of graph.get(f)!) if (!seen.has(d)) stack.push([d, false]);
    }
  }
  const reverse = new Map(files.map(f => [f, [] as string[]]));
  for (const [f, deps] of graph) for (const d of deps) reverse.get(d)!.push(f);
  seen.clear(); const components: string[][] = [];
  for (const start of order.reverse()) {
    if (seen.has(start)) continue;
    const group: string[] = [], stack = [start]; seen.add(start);
    while (stack.length) { const f = stack.pop()!; group.push(f); for (const d of reverse.get(f)!) if (!seen.has(d)) { seen.add(d); stack.push(d); } }
    components.push(group.sort());
  }
  const owner = new Map<string, number>(); components.forEach((g,i) => g.forEach(f => owner.set(f,i)));
  const remaining = new Set(components.map((_,i) => i)), processed = new Set<number>();
  const assigned = new Map<string, string>();
  function context(group: string[]): DeclarationSummary[] {
    const reachable = new Set<string>(), stack = [...group];
    while (stack.length) { const f = stack.pop()!; for (const d of graph.get(f) ?? []) if (!reachable.has(d)) { reachable.add(d); stack.push(d); } }
    return (model.summaries ?? []).filter(s => reachable.has(s.sourcePath) && !group.includes(s.sourcePath));
  }
  function cost(group: string[]) { return group.reduce((n,f) => n + estimateTokens(sources.get(f)!), 0) + estimateTokens(JSON.stringify(context(group))); }
  while (remaining.size) {
    await setImmediate(); signal?.throwIfAborted();
    const ready = [...remaining].filter(i => components[i].every(f => graph.get(f)!.every(d => owner.get(d) === i || processed.has(owner.get(d)!))));
    ready.sort((a,b) => components[a][0] < components[b][0] ? -1 : 1);
    const i = ready[0], group = components[i]; remaining.delete(i); processed.add(i);
    const broken = group.find(f => failures.has(f));
    const missing = group.flatMap(f => graph.get(f)!).find(d => !group.includes(d) && !assigned.has(d));
    let reason = broken ? `依赖分量不可切分：${broken}：${failures.get(broken)}` : missing ? `依赖文件未分配：${missing}` : '';
    if (!reason && cost(group) > budgetTokens) reason = '单文件或依赖环（含上下文）超过预算，不强拆';
    if (reason) { for (const f of group) result.unassigned.push({ sourcePath: f, line: null, reason }); continue; }
    const previous = result.chunks.at(-1);
    const connected = group.some(f => graph.get(f)!.length || reverse.get(f)!.length);
    const union = previous ? [...previous.files, ...group] : group;
    if (previous && connected && previous.files.some(f => posix.dirname(f) === posix.dirname(group[0])) && cost(union) <= budgetTokens) {
      previous.files = union; previous.contextBundle = context(union); previous.estTokens = cost(union);
      group.forEach(f => assigned.set(f,previous.id));
    } else {
      const id = `chunk-${String(result.chunks.length + 1).padStart(4,'0')}`;
      result.chunks.push({ id, files: group, contextBundle: context(group), estTokens: cost(group), deps: [] }); group.forEach(f => assigned.set(f,id));
    }
  }
  for (const chunk of result.chunks) chunk.deps = [...new Set(chunk.files.flatMap(f => graph.get(f)!).map(f => assigned.get(f)!).filter(id => id && id !== chunk.id))].sort();
  if (result.unassigned.length || result.unsupported.length) result.status = 'partial';
  return result;
}