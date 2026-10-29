import type { DeclarationSummary } from '@xdtranc/shared';
export interface ConversionRequest {
  prompt: string;
  sources: { path: string; code: string }[];
  contextBundle: DeclarationSummary[];
  retryIssues: string[];
}
export interface LlmProvider {
  readonly id: string;
  readonly model: string;
  readonly simulated: boolean;
  generate(request: ConversionRequest, signal?: AbortSignal): Promise<unknown>;
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