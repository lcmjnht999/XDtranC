import { readFile, realpath } from 'node:fs/promises';
import { resolve, relative, isAbsolute, sep } from 'node:path';
import { createHash } from 'node:crypto';
import type { Chunk, ChunkResult, Issue, ProjectModel } from '@xdtranc/shared';
import { parseConversionOutput, type ConversionOutput } from '../../shared/src/outputSchema.js';
import { parseProject } from './index.js';
import { chunkModel } from './chunker.js';
import {
  DEFAULT_RETRY_POLICY, ProviderError, retryDelayMs, sleepWithSignal,
  type LlmProvider, type RetryPolicy,
} from './provider.js';
export interface RetryRecord { chunkId: string; attempt: number; delayMs: number; kind: string; reason: string }
export interface SplitRecord { chunkId: string; parts: number; reason: string }
export interface ConversionReport {
  simulated: boolean; providerId: string; model: string; status: 'complete' | 'partial';
  results: { chunkId: string; attempts: number; providerRetries?: number; output: ConversionOutput }[];
  failedChunks: { chunkId: string; attempts: number; providerRetries?: number; issues: string[] }[];
  unassigned: Issue[]; unsupported: Issue[];
  /** 每次退避重试的明细；最终失败原因仍写在 failedChunks.issues 里。 */
  retries: RetryRecord[];
  /** 超长 chunk 缩块记录。 */
  splits: SplitRecord[];
}
export interface ConversionHooks {
  onChunkComplete?(chunkId: string, attempts: number, output: ConversionOutput): void | Promise<void>;
  onChunkFailed?(chunkId: string, attempts: number, issues: string[]): void | Promise<void>;
}
export interface ConversionOptions {
  retryPolicy?: Partial<RetryPolicy>;
  /** 测试注入用；生产默认按真实时间退避。 */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}
/** 落盘失败必须显式中断，不能被当成“某个 chunk 转换失败”后重试或静默吞掉。 */
export class PersistenceError extends Error {
  constructor(message: string) { super(message); this.name = 'PersistenceError'; }
}
class ProviderFailure extends Error {
  constructor(message: string, readonly providerRetries: number) { super(message); this.name = 'ProviderFailure'; }
}
class ConversionFailure extends Error {
  constructor(message: string, readonly attempts: number, readonly providerRetries: number) { super(message); this.name = 'ConversionFailure'; }
}
interface RetrySettings extends RetryPolicy { sleep: (ms: number, signal?: AbortSignal) => Promise<void> }
const BASE_PROMPT = '将当前 C++ chunk 转为仓颉草稿。只返回 conversion JSON，包含 outputs(path/code)、unsupported(sourcePath/line/reason)、selfCheck(passed/issues)、explanation、confidence。不支持项必须报告；不得删除业务逻辑换通过。不得声称编译验证。';
function retrySettings(options?: ConversionOptions): RetrySettings {
  const merged = { ...DEFAULT_RETRY_POLICY, ...(options?.retryPolicy ?? {}) };
  for (const [key, value] of Object.entries(merged)) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`重试策略 ${key} 必须是非负安全整数`);
  }
  if (merged.maxRetries > 10) throw new Error('重试策略 maxRetries 不能超过 10');
  if (merged.maxDelayMs < merged.baseDelayMs) throw new Error('重试策略 maxDelayMs 不能小于 baseDelayMs');
  return { ...merged, sleep: options?.sleep ?? sleepWithSignal };
}
async function callComplete(hook: ConversionHooks['onChunkComplete'], chunkId: string, attempts: number, output: ConversionOutput): Promise<void> {
  if (!hook) return;
  try { await hook(chunkId, attempts, output); }
  catch (error) { throw new PersistenceError(`状态保存失败：${error instanceof Error ? error.message : String(error)}`); }
}
async function callFailed(hook: ConversionHooks['onChunkFailed'], chunkId: string, attempts: number, issues: string[]): Promise<void> {
  if (!hook) return;
  try { await hook(chunkId, attempts, issues); }
  catch (error) { throw new PersistenceError(`状态保存失败：${error instanceof Error ? error.message : String(error)}`); }
}
async function generateWithRetry(
  provider: LlmProvider, request: Parameters<LlmProvider['generate']>[0], signal: AbortSignal | undefined,
  policy: RetrySettings, chunkId: string, retries: RetryRecord[],
): Promise<{ raw: unknown; retries: number }> {
  for (let used = 0; ; used++) {
    try { return { raw: await provider.generate(request, signal), retries: used }; }
    catch (e) {
      signal?.throwIfAborted();
      // 只有显式标记 retryable 的 ProviderError 才退避；普通 Error 保持一次性失败。
      if (!(e instanceof ProviderError) || !e.retryable || used >= policy.maxRetries) {
        throw new ProviderFailure(e instanceof Error ? e.message : String(e), used);
      }
      const delayMs = retryDelayMs(policy, used, e.retryAfterMs);
      retries.push({ chunkId, attempt: used + 1, delayMs, kind: e.kind, reason: e.message });
      await policy.sleep(delayMs, signal);
      signal?.throwIfAborted();
    }
  }
}
async function convertOne(
  chunk: Chunk, sources: { path: string; code: string }[], promptSuffix: string, provider: LlmProvider,
  policy: RetrySettings, signal: AbortSignal | undefined, retries: RetryRecord[], accepted: Set<string>,
  fragment?: { index: number; total: number; startLine: number; endLine: number },
): Promise<{ attempts: number; providerRetries: number; output: ConversionOutput }> {
  let attempts = 0, providerRetries = 0, issues: string[] = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    signal?.throwIfAborted(); attempts++;
    // Copy on every attempt: providers cannot mutate canonical sources/context.
    const request = structuredClone({ prompt: BASE_PROMPT + promptSuffix, sources, contextBundle: chunk.contextBundle, retryIssues: issues, ...(fragment ? { fragment } : {}) });
    let raw: unknown;
    try {
      const result = await generateWithRetry(provider, request, signal, policy, chunk.id, retries);
      raw = result.raw; providerRetries += result.retries;
    } catch (e) {
      signal?.throwIfAborted();
      const used = e instanceof ProviderFailure ? e.providerRetries : 0;
      const detail = e instanceof Error ? e.message : '未知错误';
      throw new ConversionFailure(`Provider 调用失败：${detail}${used ? `（已重试 ${used} 次）` : ''}`, attempts, providerRetries + used);
    }
    signal?.throwIfAborted();
    try {
      const output = parseConversionOutput(raw);
      if (output.unsupported.some(u => !chunk.files.includes(u.sourcePath))) throw new Error('unsupported 引用当前块之外的文件');
      if (!output.outputs.length && chunk.files.some(f => !output.unsupported.some(u => u.sourcePath === f))) throw new Error('无输出文件未全部登记 unsupported');
      if (!output.selfCheck.passed) throw new Error(`自核查失败：${output.selfCheck.issues.join('; ') || '未给出原因'}`);
      if (output.outputs.some(o => accepted.has(o.path.normalize('NFC').toLowerCase()))) throw new Error('跨 chunk 输出路径冲突');
      output.outputs.forEach(o => accepted.add(o.path.normalize('NFC').toLowerCase()));
      return { attempts, providerRetries, output };
    } catch (e) {
      if (e instanceof PersistenceError) throw e;
      issues = [e instanceof Error ? e.message : '输出无效'];
    }
  }
  throw new ConversionFailure(issues.join('; '), attempts, providerRetries);
}
interface Piece { code: string; startLine: number; endLine: number }
function splitOversized(chunk: Chunk, sources: { path: string; code: string }[], budget: number): Piece[] | string {
  if (chunk.files.length !== 1) return '依赖环或跨文件块超过预算，不允许拆分，已进入失败清单';
  const source = sources[0];
  if (!source) return '源文件缺失，无法缩块';
  // 给 prompt 与 JSON 包装留固定余量；上下文同样计入预算。
  const contextBytes = Buffer.byteLength(JSON.stringify(chunk.contextBundle), 'utf8');
  const maxBytes = budget - contextBytes - 256;
  if (maxBytes <= 0) return '预算不足以容纳上下文，无法缩块';
  const lines = source.code.split('\n');
  const pieces: Piece[] = [];
  let buffer: string[] = [], bytes = 0, startLine = 1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] + (i < lines.length - 1 ? '\n' : '');
    const size = Buffer.byteLength(line, 'utf8');
    if (size > maxBytes) return `第 ${i + 1} 行单行超过预算，无法按行缩块`;
    if (buffer.length && bytes + size > maxBytes) {
      pieces.push({ code: buffer.join(''), startLine, endLine: i });
      buffer = []; bytes = 0; startLine = i + 1;
    }
    buffer.push(line); bytes += size;
  }
  if (buffer.length && buffer.some(line => line.trim())) pieces.push({ code: buffer.join(''), startLine, endLine: lines.length });
  return pieces.length ? pieces : '源文件为空，无法缩块';
}
export async function convertProject(input: string, provider: LlmProvider, budget = 4096, signal?: AbortSignal, options?: ConversionOptions) {
  const model = await parseProject(input, signal);
  return convertChunks(model, await chunkModel(model, budget, signal), provider, signal, undefined, undefined, options);
}
export async function convertChunks(
  model: ProjectModel,
  plan: ChunkResult,
  provider: LlmProvider,
  signal?: AbortSignal,
  hooks?: ConversionHooks,
  resume?: Map<string, ConversionOutput>,
  options?: ConversionOptions,
): Promise<ConversionReport> {
  signal?.throwIfAborted();
  const policy = retrySettings(options);
  const report: ConversionReport = {
    simulated: provider.simulated, providerId: provider.id, model: provider.model, status: 'complete',
    results: [], failedChunks: [], unassigned: plan.unassigned,
    unsupported: [...plan.unsupported, ...plan.unassigned], retries: [], splits: [],
  };
  const accepted = new Set<string>(); const failed = new Set<string>();
  for (const chunk of plan.chunks) {
    signal?.throwIfAborted(); let attempts = 0; let providerRetries = 0; let issues: string[] = [];
    try {
      const cached = resume?.get(chunk.id);
      if (cached) {
        if (cached.unsupported.some(u=>!chunk.files.includes(u.sourcePath))) throw new Error('已保存结果引用当前块之外的文件');
        if (cached.outputs.some(o=>accepted.has(o.path.normalize('NFC').toLowerCase()))) throw new Error('跨 chunk 输出路径冲突');
        cached.outputs.forEach(o=>accepted.add(o.path.normalize('NFC').toLowerCase()));
        report.results.push({ chunkId: chunk.id, attempts: 0, output: cached });
        report.unsupported.push(...cached.unsupported);
        await callComplete(hooks?.onChunkComplete, chunk.id, 0, cached);
        continue;
      }
      if (chunk.deps.some(d => failed.has(d))) throw new Error('依赖 chunk 转换失败');
      const sources = [];
      for (const path of chunk.files) {
        const full = resolve(model.root,path), rel = relative(model.root,full);
        if (isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`) || await realpath(full) !== full) throw new Error('源码路径越界或链接变化');
        const bytes = await readFile(full), baseline = model.files.find(f=>f.path===path);
        if (!baseline || baseline.hash !== createHash('sha256').update(bytes).digest('hex')) throw new Error('源文件已变化，请重新解析');
        sources.push({ path, code: new TextDecoder('utf-8',{fatal:true}).decode(bytes) });
      }
      const oversized = chunk.overBudget === true || chunk.estTokens > plan.budgetTokens;
      if (oversized) {
        const pieces = splitOversized(chunk, sources, plan.budgetTokens);
        if (typeof pieces === 'string') throw new Error(pieces);
        report.splits.push({ chunkId: chunk.id, parts: pieces.length, reason: '超出预算，按行缩块' });
        const snapshot = new Set(accepted);
        const merged: ConversionOutput = { kind: 'conversion', outputs: [], unsupported: [], selfCheck: { passed: true, issues: [] }, explanation: '', confidence: 1 };
        try {
          for (let i = 0; i < pieces.length; i++) {
            const piece = pieces[i];
            const suffix = `\n\n这是超长源文件的分片 ${i + 1}/${pieces.length}（原始行 ${piece.startLine}-${piece.endLine}）；只处理本片内容，不要补写其他分片。`;
            const part = await convertOne(chunk, [{ path: chunk.files[0], code: piece.code }], suffix, provider, policy, signal, report.retries, accepted, { index: i + 1, total: pieces.length, startLine: piece.startLine, endLine: piece.endLine });
            attempts += part.attempts; providerRetries += part.providerRetries;
            merged.outputs.push(...part.output.outputs);
            merged.unsupported.push(...part.output.unsupported);
            merged.confidence = Math.min(merged.confidence, part.output.confidence);
            if (!merged.explanation) merged.explanation = part.output.explanation;
          }
        } catch (e) {
          accepted.clear(); snapshot.forEach(p => accepted.add(p));
          throw new ConversionFailure(
            e instanceof Error ? e.message : '分片转换失败',
            attempts + (e instanceof ConversionFailure ? e.attempts : 0),
            providerRetries + (e instanceof ConversionFailure ? e.providerRetries : 0),
          );
        }
        merged.explanation = `超长文件按行缩块为 ${pieces.length} 片。${merged.explanation}`;
        report.results.push({ chunkId: chunk.id, attempts, providerRetries, output: merged });
        report.unsupported.push(...merged.unsupported);
        await callComplete(hooks?.onChunkComplete, chunk.id, attempts, merged);
        continue;
      }
      const converted = await convertOne(chunk, sources, '', provider, policy, signal, report.retries, accepted);
      attempts = converted.attempts; providerRetries = converted.providerRetries;
      report.results.push({ chunkId: chunk.id, attempts, providerRetries, output: converted.output });
      report.unsupported.push(...converted.output.unsupported);
      await callComplete(hooks?.onChunkComplete, chunk.id, attempts, converted.output);
    } catch (e) {
      if (e instanceof PersistenceError) throw e;
      signal?.throwIfAborted();
      if (e instanceof ConversionFailure) { attempts = e.attempts; providerRetries = e.providerRetries; }
      issues = [e instanceof Error ? e.message : '转换失败']; failed.add(chunk.id);
      report.failedChunks.push({ chunkId: chunk.id, attempts, providerRetries, issues });
      report.unsupported.push(...chunk.files.map(sourcePath=>({sourcePath,line:null,reason:issues.join('; ')})));
      await callFailed(hooks?.onChunkFailed, chunk.id, attempts, issues);
    }
  }
  if (report.failedChunks.length || report.unsupported.length) report.status = 'partial';
  return report;
}
