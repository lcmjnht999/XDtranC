import type { Issue, ProjectModel } from '@xdtranc/shared';
import type { ConversionReport } from './converter.js';

const businessKinds = new Set(['function_definition', 'class_specifier', 'struct_specifier']);

export interface SymbolGap {
  sourcePath: string;
  line: number;
  symbol: string;
  kind: string;
}

export interface CoverageReport {
  status: 'complete' | 'partial';
  checkedSymbols: number;
  mappedSymbols: number;
  declaredUnsupported: number;
  gaps: SymbolGap[];
  emptyFiles: string[];
  stubFiles: string[];
}

const declarationPattern = /\b(?:public\s+|private\s+|protected\s+|static\s+|open\s+|override\s+|abstract\s+|sealed\s+|mut\s+)*(?:func|class|struct|interface|enum|extend|type)\s+([A-Za-z_]\w*)/g;
const callablePattern = /^\s*(?:public\s+)?([A-Za-z_]\w*)\s*\([^;]*\)\s*(?::[^{]+)?\{/gm;
const nonCallable = new Set(['if', 'for', 'while', 'switch', 'match', 'catch']);

/** 从仓颉草稿中提取可识别的声明名；只做结构识别，不保证语法正确。 */
export function extractCangjieSymbols(code: string): string[] {
  const names: string[] = [];
  for (const match of code.matchAll(declarationPattern)) names.push(match[1]!);
  for (const match of code.matchAll(callablePattern)) {
    const name = match[1]!;
    if (!nonCallable.has(name)) names.push(name);
  }
  return [...new Set(names)];
}

/** C++ 声明文本归一化为可比较的标识符：去参数、作用域、模板、下划线，统一小写。 */
export function normalizeSymbol(name: string): string {
  let value = name.trim().replace(/^~/, '');
  value = value.replace(/\([\s\S]*$/, '');
  value = value.replace(/^[\s\S]*::/, '');
  value = value.replace(/<[\s\S]*$/, '');
  return value.replace(/[^A-Za-z0-9_]/g, '').toLowerCase().replace(/_/g, '');
}

const stripped = (code: string): string => code
  .replace(/\/\/[^\n\r]*/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .trim();

/**
 * 严格符号级覆盖：源文件每个顶层业务声明必须在输出里有同名符号，
 * 或在 unsupported 中按文件/行号/名称显式登记。两者都没有就是空壳缺口。
 */
export function analyzeCoverage(model: ProjectModel, report: ConversionReport): CoverageReport {
  const outputs = report.results.flatMap(result => result.output.outputs);
  const outputNames = new Set<string>();
  const emptyFiles: string[] = [];
  const stubFiles: string[] = [];

  for (const output of outputs) {
    if (!output.code.trim()) { emptyFiles.push(output.path); continue; }
    if (!stripped(output.code)) { stubFiles.push(output.path); continue; }
    const names = extractCangjieSymbols(output.code);
    for (const name of names) outputNames.add(normalizeSymbol(name));
    if (names.length === 0) stubFiles.push(output.path);
  }

  const unsupportedByPath = new Map<string, Issue[]>();
  for (const issue of report.unsupported) {
    const list = unsupportedByPath.get(issue.sourcePath) ?? [];
    list.push(issue);
    unsupportedByPath.set(issue.sourcePath, list);
  }

  const gaps: SymbolGap[] = [];
  let checkedSymbols = 0;
  let mappedSymbols = 0;
  let declaredUnsupported = 0;

  for (const symbol of model.symbols) {
    if (!businessKinds.has(symbol.kind)) continue;
    checkedSymbols++;
    if (outputNames.has(normalizeSymbol(symbol.name))) { mappedSymbols++; continue; }
    const declarations = unsupportedByPath.get(symbol.sourcePath) ?? [];
    const declared = declarations.some(issue =>
      issue.line === null || issue.line === symbol.line || issue.reason.includes(symbol.name),
    );
    if (declared) { declaredUnsupported++; continue; }
    gaps.push({ sourcePath: symbol.sourcePath, line: symbol.line, symbol: symbol.name, kind: symbol.kind });
  }

  const uniqueStubs = [...new Set(stubFiles)];
  const status = gaps.length === 0 && emptyFiles.length === 0 && uniqueStubs.length === 0 ? 'complete' : 'partial';
  return { status, checkedSymbols, mappedSymbols, declaredUnsupported, gaps, emptyFiles, stubFiles: uniqueStubs };
}

/** 空壳终判：无产物、覆盖不完整、行保留率过低或有失败 chunk，一律不通过。 */
export function businessStubStatus(input: {
  coverage: CoverageReport;
  exportedFiles: number;
  failedChunks: number;
  lineRetention: number | null;
}): 'passed' | 'failed' {
  if (input.exportedFiles === 0) return 'failed';
  if (input.coverage.status !== 'complete') return 'failed';
  if (input.lineRetention !== null && input.lineRetention < 0.1) return 'failed';
  if (input.failedChunks > 0) return 'failed';
  return 'passed';
}
