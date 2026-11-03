// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { SummaryBar } from './SummaryBar';
import type { Summary } from '../types';

afterEach(cleanup);

const base: Summary = {
  inputFiles: 2,
  inputLines: 20,
  outputFiles: 3,
  outputLines: 30,
  lineRetention: 1.5,
  coverage: { status: 'complete', checkedSymbols: 4, mappedSymbols: 4, declaredUnsupported: 0, gaps: [], emptyFiles: [], stubFiles: [] },
  stubCheck: 'passed',
  failedChunks: 0,
  unsupported: 0,
  unassigned: 0,
  simulated: true,
};

describe('SummaryBar', () => {
  it('通过时展示文件数、行保留与判定', () => {
    render(<SummaryBar summary={base} />);
    const text = screen.getByTestId('summary').textContent ?? '';
    expect(text).toContain('文件 3/2');
    expect(text).toContain('行保留 150.0%');
    expect(text).toContain('符号覆盖 4/4');
    expect(text).toContain('空壳判定 通过');
  });

  it('不通过时展示警告与不可用指标', () => {
    render(<SummaryBar summary={{ ...base, stubCheck: 'failed', lineRetention: null, failedChunks: 1 }} />);
    const text = screen.getByTestId('summary').textContent ?? '';
    expect(text).toContain('空壳判定 不通过');
    expect(text).toContain('行保留 不可用');
    expect(text).toContain('失败块 1');
  });

  it('无结果时显示提示', () => {
    render(<SummaryBar summary={null} />);
    expect(screen.getByText('尚未转换')).toBeTruthy();
  });
});
