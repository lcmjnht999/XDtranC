import type { Summary } from '../types';

function percent(value: number | null): string {
  return value === null ? '不可用' : `${(value * 100).toFixed(1)}%`;
}

export function SummaryBar({ summary }: { summary: Summary | null }) {
  if (!summary) return <div className="summary muted">尚未转换</div>;
  const passed = summary.stubCheck === 'passed';
  return (
    <div className={`summary ${passed ? 'ok' : 'warn'}`} data-testid="summary">
      <span>文件 {summary.outputFiles}/{summary.inputFiles}</span>
      <span>行保留 {percent(summary.lineRetention)}</span>
      <span>符号覆盖 {summary.coverage.mappedSymbols}/{summary.coverage.checkedSymbols}</span>
      <span>空壳判定 {passed ? '通过' : '不通过'}</span>
      <span>失败块 {summary.failedChunks}</span>
      <span>不支持 {summary.unsupported}</span>
      <span>未分配 {summary.unassigned}</span>
    </div>
  );
}
