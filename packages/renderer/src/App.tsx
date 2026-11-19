import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { CodeView } from './components/CodeView';
import { FileTree } from './components/FileTree';
import { SummaryBar } from './components/SummaryBar';
import { validateApiConnection } from '../../shared/src/apiConfig';

type ProviderChoice = 'mock' | 'ollama' | 'openai';
interface ProviderDraft { model: string; endpoint: string; timeoutText: string }

export function App() {
  const [provider, setProvider] = useState<ProviderChoice>('mock');
  const [drafts, setDrafts] = useState<Record<ProviderChoice, ProviderDraft>>({
    mock: { model: '', endpoint: 'http://127.0.0.1:11434', timeoutText: '120000' },
    ollama: { model: '', endpoint: 'http://127.0.0.1:11434', timeoutText: '120000' },
    openai: { model: '', endpoint: '', timeoutText: '120000' },
  });
  const { model, endpoint, timeoutText } = drafts[provider];
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
  const keyInput = useRef<HTMLInputElement>(null);
  const [keyState, setKeyState] = useState<{ endpoint: string; configured: boolean } | null>(null);
  const keyRevision = useRef(0);
  const [keyBusy, setKeyBusy] = useState(false);

  useEffect(() => api.status(setStatus), []);
  useEffect(() => {
    const revision = ++keyRevision.current;
    setKeyState(null);
    if (provider === 'openai') {
      void api.sessionKeyStatus(endpoint).then(state => {
        if (revision === keyRevision.current) setKeyState({ endpoint, configured: state.configured });
      }).catch(() => {
        if (revision === keyRevision.current) setKeyState({ endpoint, configured: false });
      });
    }
    return () => { keyRevision.current++; };
  }, [provider, endpoint]);

  const keyConfigured = keyState?.endpoint === endpoint && keyState.configured;
  const apiValidation = validateApiConnection({ model, endpoint, timeoutMs: Number(timeoutText) });
  const apiIssues = apiValidation.ok ? [] : apiValidation.issues;
  const validApiEndpoint = !apiIssues.some(issue => issue.field === 'endpoint');
  const busy = running || keyBusy;
  const ready = result !== null;

  function changeProvider(next: ProviderChoice) {
    if (next === provider) return;
    if (keyInput.current) keyInput.current.value = '';
    keyRevision.current++;
    setKeyState(null);
    setError(null);
    setProvider(next);
  }

  function updateDraft(patch: Partial<ProviderDraft>) {
    if (patch.endpoint !== undefined && patch.endpoint !== endpoint) {
      if (keyInput.current) keyInput.current.value = '';
      keyRevision.current++;
      setKeyState(null);
    }
    setDrafts(current => ({ ...current, [provider]: { ...current[provider], ...patch } }));
  }

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

  async function submitKey() {
    await guard(async () => {
      const revision = ++keyRevision.current;
      setKeyBusy(true);
      try {
        const pending = api.setSessionKey({ endpoint, apiKey: keyInput.current?.value ?? '' });
        if (keyInput.current) keyInput.current.value = '';
        const state = await pending;
        if (revision === keyRevision.current) setKeyState({ endpoint, configured: state.configured });
      } catch (error) {
        // A rejected replacement leaves any existing main-process key intact.
        try {
          const state = await api.sessionKeyStatus(endpoint);
          if (revision === keyRevision.current) setKeyState({ endpoint, configured: state.configured });
        } catch {
          if (revision === keyRevision.current) setKeyState(null);
        }
        throw error;
      } finally {
        if (keyInput.current) keyInput.current.value = '';
        setKeyBusy(false);
      }
    });
  }

  async function clearKey() {
    await guard(async () => {
      const revision = ++keyRevision.current;
      setKeyBusy(true);
      if (keyInput.current) keyInput.current.value = '';
      try {
        const state = await api.clearSessionKey();
        if (revision === keyRevision.current) setKeyState({ endpoint, configured: state.configured });
      } finally { setKeyBusy(false); }
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
      if (provider === 'openai' && !apiValidation.ok) {
        throw new Error(apiValidation.issues.map(issue => issue.message).join('；'));
      }
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
          <select value={provider} onChange={event => changeProvider(event.target.value === 'openai' ? 'openai' : event.target.value === 'ollama' ? 'ollama' : 'mock')} disabled={busy}>
            <option value="mock">Mock（模拟）</option>
            <option value="ollama">Ollama（本机）</option>
            <option value="openai">OpenAI 兼容 API（自带服务）</option>
          </select>
        </label>
        <label>模型名称 <input value={model} onChange={event => updateDraft({ model: event.target.value })} placeholder={provider === 'openai' ? '填写服务提供方的准确模型 ID' : '准确模型名，不会自动下载'} aria-describedby={provider === 'openai' ? 'api-config-hint' : undefined} aria-invalid={provider === 'openai' && apiIssues.some(issue => issue.field === 'model')} disabled={busy} /></label>
        <label>地址 <input value={endpoint} onChange={event => updateDraft({ endpoint: event.target.value })} aria-describedby={provider === 'openai' ? 'api-config-hint' : undefined} aria-invalid={provider === 'openai' && !validApiEndpoint} disabled={busy} /></label>
        <label>超时毫秒 <input type="number" min={1} max={600000} value={timeoutText} onChange={event => updateDraft({ timeoutText: event.target.value })} aria-describedby={provider === 'openai' ? 'api-config-hint' : undefined} aria-invalid={provider === 'openai' && apiIssues.some(issue => issue.field === 'timeoutMs')} disabled={busy} /></label>
      </div>

      {provider === 'openai' && <>
        <div className="toolbar">
          <label>API Key <input ref={keyInput} type="password" autoComplete="off" spellCheck={false} placeholder="输入后提交，仅本次运行有效" disabled={busy} /></label>
          <button type="button" onClick={submitKey} disabled={busy || !validApiEndpoint}>提交会话密钥</button>
          <button type="button" onClick={clearKey} disabled={busy}>清除会话密钥</button>
          <span data-testid="key-state" aria-live="polite">{keyConfigured ? '当前地址已配置会话密钥' : '当前地址未配置会话密钥'}</span>
        </div>
        <p id="api-config-hint" className="hint" data-testid="api-config-hint" aria-live="polite">{apiIssues.length ? `开始前请检查：${apiIssues.map(issue => issue.message).join('；')}` : '地址、模型 ID 和超时格式有效；开始转换仍需已提交密钥及源码外发确认。'}</p>
        <p className="hint">地址填写 OpenAI 兼容 base URL（例如 https://服务地址/v1），模型填写准确 ID。切换转换方式会保留本页填写的地址、模型和超时。密钥仅本次运行有效：提交后清空输入，仅主进程内存保管，绑定完整服务地址，不落盘，退出失效。修改地址会清空未提交的密钥输入。源码外发仍需确认，暂不支持续跑。</p>
      </>}
      <p className="hint">Ollama 仅发送到指定本机服务；云端需显式选择与确认，不自动切换 Provider 或回退 Mock。</p>

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
        <button type="button" className="primary" onClick={convert} disabled={busy || !selected || (provider === 'openai' && (!keyConfigured || !apiValidation.ok))}>开始转换</button>
        <button type="button" onClick={cancel} disabled={!running}>取消</button>
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
          本次结果：{result.report.simulated ? 'Mock 模拟' : `${result.report.providerId} / ${result.report.model}`} · 未验证编译
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
