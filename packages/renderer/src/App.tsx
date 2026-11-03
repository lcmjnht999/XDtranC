import { useEffect, useState } from 'react';
import { api } from './api';
import { CodeView } from './components/CodeView';
import { FileTree } from './components/FileTree';
import { SummaryBar } from './components/SummaryBar';

export function App() {
  const [provider, setProvider] = useState<'mock' | 'ollama'>('mock');
  const [model, setModel] = useState('');
  const [endpoint, setEndpoint] = useState('http://127.0.0.1:11434');
  const [timeoutText, setTimeoutText] = useState('120000');
  const [selected, setSelected] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState('就绪');
  const [error, setError] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteName, setPasteName] = useState('pasted.cpp');
  const [pasteCode, setPasteCode] = useState('');
  const [result, setResult] = useState<Awaited<ReturnType<typeof api.run>> | null>(null);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [output, setOutput] = useState('');
  const [issues, setIssues] = useState('');
  const [cjpm, setCjpm] = useState(false);
  const [packageName, setPackageName] = useState('');

  useEffect(() => api.status(setStatus), []);

  const busy = running;
  const ready = result !== null;

  async function guard(task: () => Promise<void>) {
    setError(null);
    try {
      await task();
    } catch (err) {
      setError(String(err));
    }
  }

  function clearResult() {
    setResult(null);
    setActivePath(null);
    setOutput('');
    setIssues('');
  }

  async function choose(kind: 'dir' | 'zip') {
    await guard(async () => {
      const picked = await api.choose(kind);
      if (!picked) return;
      setSelected(picked);
      clearResult();
    });
  }

  async function usePaste() {
    await guard(async () => {
      const picked = await api.paste({ path: pasteName, code: pasteCode });
      setSelected(picked);
      setPasteOpen(false);
      clearResult();
    });
  }

  async function convert() {
    await guard(async () => {
      setRunning(true);
      clearResult();
      try {
        const data = await api.run({ provider, model, endpoint, timeoutMs: Number(timeoutText) });
        setResult(data);
        setOutput(data.report.results.flatMap(item => item.output.outputs.map(file => `${file.path}\n${file.code}`)).join('\n\n'));
        setIssues(JSON.stringify({ unsupported: data.report.unsupported, failedChunks: data.report.failedChunks, unassigned: data.report.unassigned }, null, 2));
      } finally {
        setRunning(false);
      }
    });
  }

  async function cancel() {
    await guard(async () => {
      await api.cancel();
    });
  }

  async function exportAs(format: 'dir' | 'zip') {
    await guard(async () => {
      const done = await api.export(format, { cjpm, packageName: packageName.trim() || undefined });
      if (done) setStatus(`导出结束：${done.status}（${done.layout === 'cjpm' ? 'CJPM 草稿' : 'flat'}）→ ${done.path}`);
    });
  }

  const activeCode = activePath ? result?.previews.find(item => item.path === activePath)?.code : undefined;

  return (
    <main>
      <h1>XDtranC 工作台</h1>
      <p className="muted">默认离线 Mock · Ollama 仅限本机回环地址 · 所有输出均未验证仓颉编译</p>

      <div className="toolbar">
        <label>
          转换方式
          <select value={provider} onChange={event => setProvider(event.target.value === 'ollama' ? 'ollama' : 'mock')} disabled={busy}>
            <option value="mock">Mock（模拟）</option>
            <option value="ollama">Ollama（本机）</option>
          </select>
        </label>
        <label>已安装模型 <input value={model} onChange={event => setModel(event.target.value)} placeholder="准确模型名，不会自动下载" disabled={busy} /></label>
        <label>地址 <input value={endpoint} onChange={event => setEndpoint(event.target.value)} disabled={busy} /></label>
        <label>超时毫秒 <input type="number" min={1} max={600000} value={timeoutText} onChange={event => setTimeoutText(event.target.value)} disabled={busy} /></label>
      </div>

      <p className="hint">选择 Ollama 后会将当前 chunk 源码及声明上下文发送到指定本机服务；不切云端，不自动回退 Mock。</p>

      <div className="toolbar">
        <button type="button" onClick={() => choose('dir')} disabled={busy}>选择目录</button>
        <button type="button" onClick={() => choose('zip')} disabled={busy}>选择 ZIP</button>
        <button type="button" onClick={() => setPasteOpen(open => !open)} disabled={busy}>粘贴临时项目</button>
        <span className="muted">{selected ?? '未选择输入'}</span>
      </div>

      {pasteOpen && (
        <div className="toolbar" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <label>文件名 <input value={pasteName} onChange={event => setPasteName(event.target.value)} /></label>
          <span className="hint">仅单文件，支持 .h/.hpp/.cpp/.cc/.cxx，最大 512 KB</span>
          <textarea rows={8} value={pasteCode} onChange={event => setPasteCode(event.target.value)} placeholder="在这里粘贴 C++ 源码" />
          <div><button type="button" onClick={usePaste} disabled={busy}>使用粘贴内容</button></div>
        </div>
      )}

      <div className="toolbar">
        <button type="button" className="primary" onClick={convert} disabled={busy || !selected}>开始转换</button>
        <button type="button" onClick={cancel} disabled={!busy}>取消</button>
        <button type="button" onClick={() => exportAs('dir')} disabled={busy || !ready}>导出目录</button>
        <button type="button" onClick={() => exportAs('zip')} disabled={busy || !ready}>导出 ZIP</button>
      </div>

      <p role="status"><strong>{status}</strong></p>
      <div className="toolbar">
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={cjpm} onChange={event => setCjpm(event.target.checked)} disabled={busy} />
          生成 cjpm.toml（实验）
        </label>
        {cjpm && <label>包名 <input value={packageName} onChange={event => setPackageName(event.target.value)} placeholder="留空则按输入名派生" disabled={busy} /></label>}
      </div>
      <p className="hint">cjpm.toml 只是占位配置，目录结构未经消费方确认，也未用 cjc / CJPM 验证；不勾选时导出保持 flat 布局。</p>
      {error && <pre className="error">{error}</pre>}

      {result && (
        <p className="muted">
          本次结果：{result.report.simulated ? 'Mock 模拟' : `Ollama / ${result.report.model}`} · 未验证编译
        </p>
      )}
      <SummaryBar summary={result?.summary ?? null} />

      <section className="panes">
        <div>
          <h2>输入文件</h2>
          <FileTree files={result?.files ?? []} active={activePath} onSelect={setActivePath} />
          {activePath ? (
            activeCode === undefined
              ? <pre className="code empty">该文件未包含在预览中</pre>
              : <div style={{ marginTop: 10 }}><CodeView text={activeCode} path={activePath} /></div>
          ) : <p className="muted">点击文件名查看源码</p>}
        </div>
        <div>
          <h2>输出草稿</h2>
          <CodeView text={output} />
        </div>
      </section>

      <h2>问题与失败清单</h2>
      <pre className="code issues">{issues}</pre>
      <p className="hint">输入预览最多 20 个文件，每个最多 20,000 字符。导出前会显示完整性摘要并要求确认。</p>
    </main>
  );
}
