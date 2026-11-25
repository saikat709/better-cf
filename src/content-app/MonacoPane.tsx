import { useEffect, useRef } from 'react';
import type { editor } from 'monaco-editor';
import type { Language } from '../shared/settings';
import { registerCustomMonacoThemes } from './monacoThemes';

type MonacoPaneProps = {
  value: string;
  language: Language;
  theme: string;
  onChange: (value: string) => void;
  onMount: (instance: editor.IStandaloneCodeEditor) => void;
};

function MonacoPane({ value, language, theme, onChange, onMount }: MonacoPaneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Awaited<typeof import('monaco-editor/esm/vs/editor/editor.api.js')> | null>(null);
  const onChangeRef = useRef(onChange);
  const onMountRef = useRef(onMount);
  const themeRef = useRef(theme);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onMountRef.current = onMount;
  }, [onMount]);

  useEffect(() => {
    themeRef.current = theme;
    if (monacoRef.current) {
      monacoRef.current.editor.setTheme(theme);
    }
  }, [theme]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let subscription: { dispose: () => void } | undefined;

    const mountEditor = async () => {
      const monaco = await import('monaco-editor/esm/vs/editor/editor.api.js');
      if (disposed) return;
      monacoRef.current = monaco;
      registerCustomMonacoThemes(monaco);

      const instance = monaco.editor.create(container, {
        value,
        language,
        theme: themeRef.current,
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

  return (
    <div
      ref={containerRef}
      className="h-full w-full overflow-hidden rounded-lg border"
      style={{ borderColor: 'var(--bcp-sb-border)' }}
    />
  );
}

export default MonacoPane;
