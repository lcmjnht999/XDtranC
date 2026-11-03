import { Component, lazy, Suspense, useState, type ReactNode } from 'react';

const MonacoPanel = lazy(() => import('./MonacoPanel'));

class Boundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onError();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function languageOf(path?: string): string {
  if (!path) return 'plaintext';
  return /\.(c|cc|cpp|cxx|h|hh|hpp|hxx)$/i.test(path) ? 'cpp' : 'plaintext';
}

export function CodeView({ text, path }: { text: string; path?: string }) {
  const [fallback, setFallback] = useState(false);
  if (!text) return <pre className="code empty">（无内容）</pre>;
  if (fallback) return <pre className="code">{text}</pre>;
  return (
    <Boundary onError={() => setFallback(true)}>
      <Suspense fallback={<pre className="code">{text}</pre>}>
        <MonacoPanel value={text} language={languageOf(path)} />
      </Suspense>
    </Boundary>
  );
}
