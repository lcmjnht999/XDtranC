import { useEffect, useRef } from 'react';
import * as monaco from 'monaco-editor';

interface MonacoEnvironment {
  getWorker: () => Worker;
}

(globalThis as { MonacoEnvironment?: MonacoEnvironment }).MonacoEnvironment = {
  getWorker: () => new Worker(URL.createObjectURL(new Blob(['self.onmessage = () => undefined;'], { type: 'text/javascript' }))),
};

export default function MonacoPanel({ value, language }: { value: string; language: string }) {
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);

  useEffect(() => {
    if (!host.current) return;
    editor.current = monaco.editor.create(host.current, {
      value,
      language,
      readOnly: true,
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 13,
      scrollBeyondLastLine: false,
      theme: 'vs',
    });
    return () => {
      editor.current?.dispose();
      editor.current = null;
    };
  }, []);

  useEffect(() => {
    const instance = editor.current;
    if (instance && instance.getValue() !== value) instance.setValue(value);
  }, [value]);

  useEffect(() => {
    const model = editor.current?.getModel();
    if (model) monaco.editor.setModelLanguage(model, language);
  }, [language]);

  return <div className="code" ref={host} />;
}
