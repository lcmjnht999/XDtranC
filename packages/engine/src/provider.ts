import type { DeclarationSummary } from '@xdtranc/shared';
export interface ConversionRequest {
  prompt: string;
  sources: { path: string; code: string }[];
  contextBundle: DeclarationSummary[];
  retryIssues: string[];
  /** 仅在超长 chunk 缩块后出现：当前分片在同一源文件中的位置。 */
  fragment?: { index: number; total: number; startLine: number; endLine: number };
}
export interface LlmProvider {
  readonly id: string;
  readonly model: string;
  readonly simulated: boolean;
  generate(request: ConversionRequest, signal?: AbortSignal): Promise<unknown>;
}
/** 统一错误类型：只有 retryable=true 的错误才允许退避重试。 */
export type ProviderErrorKind = 'rate-limit' | 'timeout' | 'network' | 'server' | 'http' | 'invalid-response';
export class ProviderError extends Error {
  constructor(
    readonly kind: ProviderErrorKind,
    message: string,
    readonly retryable = false,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}
export interface RetryPolicy { maxRetries: number; baseDelayMs: number; maxDelayMs: number }
export const DEFAULT_RETRY_POLICY: RetryPolicy = { maxRetries: 2, baseDelayMs: 500, maxDelayMs: 8000 };
/** 可取消的等待：abort 时立即以 AbortError 结束，不吞掉信号。 */
export function sleepWithSignal(ms: number, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
    const onAbort = () => { clearTimeout(timer); reject(signal!.reason ?? new DOMException('已取消', 'AbortError')); };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
export function retryDelayMs(policy: RetryPolicy, retryIndex: number, retryAfterMs?: number): number {
  const backoff = policy.baseDelayMs * 2 ** retryIndex;
  const wanted = retryAfterMs !== undefined && Number.isFinite(retryAfterMs) ? Math.max(backoff, retryAfterMs) : backoff;
  return Math.min(policy.maxDelayMs, Math.max(0, Math.floor(wanted)));
}
export class MockProvider implements LlmProvider {
  readonly id = 'mock'; readonly model = 'hello-fixture-v1'; readonly simulated = true;
  async generate(request: ConversionRequest, signal?: AbortSignal): Promise<unknown> {
    signal?.throwIfAborted();
    const fixtures: Record<string, { source: string; path: string; code: string }> = {
      'include/math.hpp': { source: '#pragma once\nstruct Calculator { int add(int a, int b); };\n', path: 'calculator.cj', code: '// 模拟固定样例，未经仓颉编译验证\nstruct Calculator {\n  public func add(a: Int32, b: Int32): Int32 { return a + b }\n}\n' },
      'main.cpp': { source: '#include "include/math.hpp"\n#include <iostream>\nint Calculator::add(int a, int b) { return a + b; }\nint main() { Calculator c; return c.add(1, 2); }\n', path: 'main.cj', code: '// 模拟固定样例，未经仓颉编译验证\nmain(): Int64 {\n  let c = Calculator()\n  return Int64(c.add(1, 2))\n}\n' }
    };
    const outputs = [], unsupported = [];
    for (const source of request.sources) {
      const fixture = fixtures[source.path];
      if (fixture && source.code.replace(/\r\n/g,'\n') === fixture.source) outputs.push({ path: fixture.path, code: fixture.code });
      else unsupported.push({ sourcePath: source.path, line: null, reason: 'Mock 只识别固定 hello 样例，不进行真实转换' });
    }
    return { kind: 'conversion', outputs, unsupported, selfCheck: { passed: true, issues: [] }, explanation: '离线模拟测试数据，不是模型转换或编译验证结果', confidence: 0 };
  }
}
