import { useEffect, useRef } from 'react';
import type { editor } from 'monaco-editor';
import type { Language } from '../shared/settings';

type MonacoPaneProps = {
  value: string;
  language: Language;
  onChange: (value: string) => void;
  onMount: (instance: editor.IStandaloneCodeEditor) => void;
};

function MonacoPane({ value, language, onChange, onMount }: MonacoPaneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Awaited<typeof import('monaco-editor/esm/vs/editor/editor.api.js')> | null>(null);
  const onChangeRef = useRef(onChange);
  const onMountRef = useRef(onMount);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onMountRef.current = onMount;
  }, [onMount]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let subscription: { dispose: () => void } | undefined;

    const mountEditor = async () => {
      const monaco = await import('monaco-editor/esm/vs/editor/editor.api.js');
      if (disposed) return;
      monacoRef.current = monaco;

      const instance = monaco.editor.create(container, {
        value,
        language,
        theme: 'vs-dark',
        minimap: { enabled: false },
        lineNumbers: 'on',
        fontSize: 15,
        automaticLayout: true,
        smoothScrolling: true,
      });

      editorRef.current = instance;
      onMountRef.current(instance);
      subscription = instance.onDidChangeModelContent(() => onChangeRef.current(instance.getValue()));
    };

    void mountEditor();

    return () => {
      disposed = true;
      subscription?.dispose();
      editorRef.current?.dispose();
      editorRef.current = null;
    };
  }, []);

  useEffect(() => {
    const instance = editorRef.current;
    if (!instance) return;
    if (instance.getValue() !== value) instance.setValue(value);
  }, [value]);

  useEffect(() => {
    const instance = editorRef.current;
    const monaco = monacoRef.current;
    if (!instance || !monaco) return;
    const model = instance.getModel();
    if (model) monaco.editor.setModelLanguage(model, language);
  }, [language]);

  return <div ref={containerRef} className="h-full w-full rounded-xl overflow-hidden border border-slate-700" />;
}

export default MonacoPane;
