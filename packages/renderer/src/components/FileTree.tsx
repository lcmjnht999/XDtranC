import type { WorkbenchFile } from '../types';

export function FileTree({
  files,
  active,
  onSelect,
}: {
  files: WorkbenchFile[];
  active: string | null;
  onSelect: (path: string) => void;
}) {
  if (files.length === 0) return <p className="muted">尚无输入文件</p>;
  return (
    <ul className="file-tree" data-testid="file-tree">
      {files.map(file => {
        const marks = [
          file.chunkId ? `[${file.chunkId}]` : '[未分配]',
          file.failed ? '失败' : '',
          file.unsupported ? '不支持' : '',
        ].filter(Boolean).join(' · ');
        const outputs = file.outputs.length > 0 ? ` → ${file.outputs.join(', ')}` : '';
        return (
          <li key={file.path}>
            <button
              type="button"
              className={file.path === active ? 'active' : ''}
              onClick={() => onSelect(file.path)}
            >
              <span className="name">{file.path}</span>
              <span className="marks">{marks}{outputs}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
