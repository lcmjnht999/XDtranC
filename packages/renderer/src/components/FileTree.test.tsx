// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { FileTree } from './FileTree';
import type { WorkbenchFile } from '../types';

afterEach(cleanup);

const files: WorkbenchFile[] = [
  { path: 'main.cpp', lines: 10, chunkId: 'chunk-1', failed: false, unsupported: false, outputs: ['src/main.cj'] },
  { path: 'math.hpp', lines: 5, chunkId: null, failed: true, unsupported: true, outputs: [] },
];

describe('FileTree', () => {
  it('显示 chunk 归属、失败与不支持标记', () => {
    render(<FileTree files={files} active={null} onSelect={() => undefined} />);
    expect(screen.getByText('main.cpp')).toBeTruthy();
    expect(screen.getByText(/\[chunk-1\]/)).toBeTruthy();
    expect(screen.getByText(/\[未分配\]/)).toBeTruthy();
    expect(screen.getByText(/失败/)).toBeTruthy();
    expect(screen.getByText(/不支持/)).toBeTruthy();
    expect(screen.getByText(/src\/main\.cj/)).toBeTruthy();
  });

  it('点击文件回调路径', () => {
    const onSelect = vi.fn();
    render(<FileTree files={files} active={null} onSelect={onSelect} />);
    screen.getByText('main.cpp').click();
    expect(onSelect).toHaveBeenCalledWith('main.cpp');
  });

  it('空列表给出提示', () => {
    render(<FileTree files={[]} active={null} onSelect={() => undefined} />);
    expect(screen.getByText('尚无输入文件')).toBeTruthy();
  });
});
