import { it, expect } from 'vitest';
import type { ProjectModel } from '@xdtranc/shared';
import type { ConversionReport } from './converter.js';
import type { ConversionOutput } from '../../shared/src/outputSchema.js';
import { analyzeCoverage, extractCangjieSymbols, normalizeSymbol } from './coverage.js';

function model(symbols: { sourcePath: string; line: number; kind: string; name: string }[]): ProjectModel {
  return { root: 'C:/project', files: [{ path: 'a.cpp', hash: 'h', lines: 1 }], symbols, deps: [], unsupported: [], stats: { files: 1, lines: 1 }, status: 'complete' };
}

function output(path: string, code: string): ConversionOutput {
  return { kind: 'conversion', outputs: [{ path, code }], unsupported: [], selfCheck: { passed: true, issues: [] }, explanation: 'test', confidence: 0 };
}

function report(outputs: ConversionOutput[], unsupported: { sourcePath: string; line: number | null; reason: string }[] = []): ConversionReport {
  return {
    simulated: true, providerId: 'mock', model: 'test', status: 'complete',
    results: outputs.map((item, index) => ({ chunkId: `chunk-000${index + 1}`, attempts: 1, output: item })),
    failedChunks: [], unassigned: [], unsupported, retries: [], splits: [],
  };
}

it('归一化作用域、参数和下划线后匹配', () => {
  const m = model([
    { sourcePath: 'a.cpp', line: 1, kind: 'function_definition', name: 'Calculator::get_value(int x)' },
    { sourcePath: 'a.cpp', line: 2, kind: 'class_specifier', name: 'Calculator' },
  ]);
  const c = analyzeCoverage(m, report([output('a.cj', 'class Calculator {\n  public func getValue(x: Int32): Int32 { return x }\n}\n')]));
  expect(c.status).toBe('complete');
  expect(c.checkedSymbols).toBe(2);
  expect(c.mappedSymbols).toBe(2);
  expect(c.gaps).toEqual([]);
});

it('未映射且未登记的符号进入 gaps', () => {
  const m = model([
    { sourcePath: 'a.cpp', line: 3, kind: 'function_definition', name: 'a(int)' },
    { sourcePath: 'a.cpp', line: 9, kind: 'struct_specifier', name: 'Widget' },
  ]);
  const c = analyzeCoverage(m, report([output('a.cj', 'main() { return 0 }\n')]));
  expect(c.status).toBe('partial');
  expect(c.gaps.map(g => g.symbol)).toEqual(['a(int)', 'Widget']);
  expect(c.gaps[0]!.line).toBe(3);
});

it('unsupported 按文件或行号登记后不算空壳', () => {
  const m = model([
    { sourcePath: 'a.cpp', line: 1, kind: 'function_definition', name: 'a' },
    { sourcePath: 'a.cpp', line: 2, kind: 'function_definition', name: 'b' },
  ]);
  const c = analyzeCoverage(m, report([output('a.cj', 'func other(): Int64 { return 0 }\n')], [
    { sourcePath: 'a.cpp', line: null, reason: '模板语义未支持' },
  ]));
  expect(c.status).toBe('complete');
  expect(c.declaredUnsupported).toBe(2);
  expect(c.gaps).toEqual([]);
});

it('空文件与纯注释输出被判为空壳', () => {
  const empty = analyzeCoverage(model([]), report([output('a.cj', '   ')]));
  expect(empty.emptyFiles).toEqual(['a.cj']);
  expect(empty.status).toBe('partial');

  const comment = analyzeCoverage(model([]), report([output('a.cj', '// 只有注释\n/* TODO */\n')]));
  expect(comment.stubFiles).toEqual(['a.cj']);
  expect(comment.status).toBe('partial');
});

it('有声明但没有任何业务符号的输出被判为空壳', () => {
  const c = analyzeCoverage(model([]), report([output('a.cj', '// 说明\n')]));
  expect(c.stubFiles).toContain('a.cj');
});

it('提取仓颉声明与顶层可调用名', () => {
  const names = extractCangjieSymbols('public func add(a: Int32) { }\nstruct S { }\nmain(): Int64 { return 0 }\n');
  expect(names).toContain('add');
  expect(names).toContain('S');
  expect(names).toContain('main');
  expect(names).not.toContain('if');
});

it('normalizeSymbol 处理析构、模板与命名空间', () => {
  expect(normalizeSymbol('ns::Widget::~Widget()')).toBe('widget');
  expect(normalizeSymbol('std::vector<int>::push_back')).toBe('pushback');
  expect(normalizeSymbol('add(int a, int b)')).toBe('add');
});
