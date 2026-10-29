export interface ConversionOutput {
  kind: 'conversion';
  outputs: { path: string; code: string }[];
  unsupported: { sourcePath: string; line: number | null; reason: string }[];
  selfCheck: { passed: boolean; issues: string[] };
  explanation: string;
  confidence: number;
}
const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
export function validOutputPath(path: string): boolean {
  return path.endsWith('.cj') && !/[\\:<>"|?*\x00-\x1f]/.test(path) && path.split('/').every(p => p !== '' && p !== '.' && p !== '..' && !/[. ]$/.test(p) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p));
}
// Single authoritative runtime validator for all Provider results.
export function parseConversionOutput(raw: unknown): ConversionOutput {
  const value: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!object(value) || value.kind !== 'conversion' || !Array.isArray(value.outputs) || !Array.isArray(value.unsupported) || !object(value.selfCheck) || typeof value.selfCheck.passed !== 'boolean' || !Array.isArray(value.selfCheck.issues) || !value.selfCheck.issues.every(text) || !text(value.explanation) || typeof value.confidence !== 'number' || !Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1) throw new Error('输出结构无效');
  const paths = new Set<string>();
  for (const o of value.outputs) {
    if (!object(o) || !text(o.path) || !validOutputPath(o.path) || !text(o.code) || !o.code.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '').trim()) throw new Error('输出路径非法或代码为空/仅注释');
    const key = o.path.normalize('NFC').toLowerCase(); if (paths.has(key)) throw new Error('重复输出路径'); paths.add(key);
  }
  for (const u of value.unsupported) if (!object(u) || !text(u.sourcePath) || !text(u.reason) || !(u.line === null || (Number.isSafeInteger(u.line) && (u.line as number) > 0))) throw new Error('unsupported 结构无效');
  if (!value.outputs.length && !value.unsupported.length) throw new Error('空输出且未说明不支持项');
  if (value.selfCheck.passed && value.selfCheck.issues.length) throw new Error('自核查状态与问题清单矛盾');
  return value as unknown as ConversionOutput;
}