import '@/assets/content.css';
import contentCssText from '@/assets/content.css?inline';

import 'monaco-editor/esm/vs/language/json/monaco.contribution';
import 'monaco-editor/esm/vs/language/css/monaco.contribution';
import 'monaco-editor/esm/vs/language/html/monaco.contribution';
import 'monaco-editor/esm/vs/language/typescript/monaco.contribution';
import 'monaco-editor/esm/vs/basic-languages/python/python.contribution';
import 'monaco-editor/esm/vs/basic-languages/cpp/cpp.contribution';
import 'monaco-editor/esm/vs/basic-languages/java/java.contribution';

import monacoCssText  from 'monaco-editor/min/vs/editor/editor.main.css?inline';
import editorWorker   from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker     from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import cssWorker      from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker     from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import tsWorker       from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import ReactDOM from 'react-dom/client';
import type { editor } from 'monaco-editor';
import { Code, FilePlus2, Maximize2, Minimize2, Play, Redo2, Undo2, X } from 'lucide-react';

import {
  DEFAULT_SETTINGS,
  DEFAULT_SNIPPETS,
  LANGUAGE_META,
  loadSettings,
  isSiteAllowed,
  type Language,
  type Settings,
} from './shared/settings';

type CodeFile = {
  id: string;
  name: string;
  language: Language;
  content: string;
  updatedAt: number;
};

type PersistedState = {
  key: 'session';
  activeFileId: string;
  input: string;
};

type EditorToggleDetail = {
  open?: boolean;
};

const DB_NAME = 'better-cp-editor';
const DB_VERSION = 1;
const FILE_STORE = 'files';
const META_STORE = 'meta';
const TOGGLE_EVENT = 'better-cp:toggle-editor';
const STATUS_MESSAGE = 'better-cp:get-editor-status';

let latestOpenState = false;
let latestAllowedState = true;

self.MonacoEnvironment = {
  getWorker(_, label) {
    if (label === 'json') return new jsonWorker();
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker();
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker();
    if (label === 'typescript' || label === 'javascript') return new tsWorker();
    return new editorWorker();
  },
};

const idbRequest = <T,>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });

const idbTransactionDone = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
  });

const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(FILE_STORE)) db.createObjectStore(FILE_STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
  });

const loadState = async (): Promise<{ files: CodeFile[]; meta?: PersistedState }> => {
  const db = await openDb();
  const tx = db.transaction([FILE_STORE, META_STORE], 'readonly');
  const filesRequest = tx.objectStore(FILE_STORE).getAll();
  const metaRequest = tx.objectStore(META_STORE).get('session');
  const [files, meta] = await Promise.all([
    idbRequest(filesRequest) as Promise<CodeFile[]>,
    idbRequest(metaRequest) as Promise<PersistedState | undefined>,
  ]);
  await idbTransactionDone(tx);
  db.close();
  return { files, meta };
};

const saveState = async (files: CodeFile[], activeFileId: string, input: string): Promise<void> => {
  const db = await openDb();
  const tx = db.transaction([FILE_STORE, META_STORE], 'readwrite');
  const filesStore = tx.objectStore(FILE_STORE);
  const metaStore = tx.objectStore(META_STORE);

  const existingFiles = (await idbRequest(filesStore.getAllKeys())) as string[];
  const nextIds = new Set(files.map((file) => file.id));

  for (const file of files) filesStore.put(file);
  for (const key of existingFiles) {
    if (!nextIds.has(key)) filesStore.delete(key);
  }

  metaStore.put({ key: 'session', activeFileId, input });
  await idbTransactionDone(tx);
  db.close();
};

const makeFile = (language: Language, index: number, templates: Record<Language, string>): CodeFile => ({
  id: crypto.randomUUID(),
  name: `file-${index}.${LANGUAGE_META[language].ext}`,
  language,
  content: templates[language] ?? DEFAULT_SNIPPETS[language],
  updatedAt: Date.now(),
});

const ensureExtension = (name: string, language: Language) => {
  const trimmed = name.trim() || `file.${LANGUAGE_META[language].ext}`;
  const base = trimmed.includes('.') ? trimmed.slice(0, trimmed.lastIndexOf('.')) : trimmed;
  return `${base}.${LANGUAGE_META[language].ext}`;
};

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

function ContentApp() {
  const [isOpen, setIsOpen] = useState(false);
  const [files, setFiles] = useState<CodeFile[]>([]);
  const [activeFileId, setActiveFileId] = useState('');
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('No output yet');
  const [hydrated, setHydrated] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(560);
  const [isExpanded, setIsExpanded] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [isAllowed, setIsAllowed] = useState(() => isSiteAllowed(window.location.hostname, DEFAULT_SETTINGS.sites));
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const dragState = useRef<{ startX: number; startWidth: number } | null>(null);

  const activeFile = useMemo(() => files.find((file) => file.id === activeFileId) ?? files[0], [files, activeFileId]);

  useEffect(() => {
    const handleToggle = (event: Event) => {
      const { detail } = event as CustomEvent<EditorToggleDetail>;
      setIsOpen((prev) => (typeof detail?.open === 'boolean' ? detail.open : !prev));
    };

    window.addEventListener(TOGGLE_EVENT, handleToggle as EventListener);
    return () => window.removeEventListener(TOGGLE_EVENT, handleToggle as EventListener);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const hydrate = async () => {
      try {
        const nextSettings = await loadSettings();
        if (cancelled) return;
        setSettings(nextSettings);
        setIsAllowed(isSiteAllowed(window.location.hostname, nextSettings.sites));

        const { files: storedFiles, meta } = await loadState();
        if (cancelled) return;
        if (storedFiles.length > 0) {
          setFiles(storedFiles);
          setActiveFileId(
            meta?.activeFileId && storedFiles.some((file) => file.id === meta.activeFileId)
              ? meta.activeFileId
              : storedFiles[0].id,
          );
          setInput(meta?.input ?? '');
          setOutput('Loaded saved workspace');
        } else {
          const starter = makeFile(nextSettings.defaultLanguage, 1, nextSettings.templates);
          setFiles([starter]);
          setActiveFileId(starter.id);
        }
      } catch (error) {
        if (cancelled) return;
        const fallback = DEFAULT_SETTINGS;
        setSettings(fallback);
        setIsAllowed(isSiteAllowed(window.location.hostname, fallback.sites));
        if (files.length === 0) {
          const starter = makeFile(fallback.defaultLanguage, 1, fallback.templates);
          setFiles([starter]);
          setActiveFileId(starter.id);
        }
        setOutput(`Storage error: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        if (!cancelled) setHydrated(true);
      }
    };

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handleSettingsChange = () => {
      void loadSettings()
        .then((next) => {
          setSettings(next);
          setIsAllowed(isSiteAllowed(window.location.hostname, next.sites));
        })
        .catch(() => {
          setSettings(DEFAULT_SETTINGS);
          setIsAllowed(isSiteAllowed(window.location.hostname, DEFAULT_SETTINGS.sites));
        });
    };

    browser.storage.onChanged.addListener(handleSettingsChange);
    return () => browser.storage.onChanged.removeListener(handleSettingsChange);
  }, []);

  useEffect(() => {
    if (!isAllowed) setIsOpen(false);
  }, [isAllowed]);

  useEffect(() => {
    latestOpenState = isOpen;
  }, [isOpen]);

  useEffect(() => {
    latestAllowedState = isAllowed;
  }, [isAllowed]);

  useEffect(() => {
    if (!hydrated || files.length === 0 || !activeFile) return;
    const timeout = window.setTimeout(() => {
      void saveState(files, activeFile.id, input).catch((error) => {
        setOutput(`Storage error: ${error instanceof Error ? error.message : String(error)}`);
      });
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [files, activeFile, hydrated, input]);

  const updateActiveFile = (updater: (file: CodeFile) => CodeFile) => {
    if (!activeFile) return;
    setFiles((prev) => prev.map((file) => (file.id === activeFile.id ? updater(file) : file)));
  };

  const runCode = () => {
    if (!activeFile) return;
    if (activeFile.language !== 'javascript' && activeFile.language !== 'typescript') {
      setOutput(`Run supports JavaScript/TypeScript. Current: ${LANGUAGE_META[activeFile.language].label}`);
      return;
    }
    try {
      const runner = new Function('input', activeFile.content);
      const result = runner(input);
      setOutput(result === undefined ? 'Executed successfully' : String(result));
    } catch (error) {
      setOutput(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const undo = () => editorRef.current?.trigger('better-cp', 'undo', null);
  const redo = () => editorRef.current?.trigger('better-cp', 'redo', null);

  const addFile = () => {
    const next = makeFile(settings.defaultLanguage, files.length + 1, settings.templates);
    setFiles((prev) => [...prev, next]);
    setActiveFileId(next.id);
  };

  const removeFile = (id: string) => {
    if (files.length === 1) return;
    const nextFiles = files.filter((file) => file.id !== id);
    setFiles(nextFiles);
    if (activeFileId === id) setActiveFileId(nextFiles[0].id);
  };

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const state = dragState.current;
      if (!state) return;
      const delta = state.startX - event.clientX;
      const minWidth = 460;
      const maxWidth = Math.max(minWidth, window.innerWidth - 24);
      const nextWidth = Math.min(maxWidth, Math.max(minWidth, state.startWidth + delta));
      setSidebarWidth(nextWidth);
    };

    const onPointerUp = () => {
      dragState.current = null;
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, []);

  const launcherStyle: CSSProperties = {
    position: 'fixed',
    right: '16px',
    top: '50%',
    transform: 'translateY(-50%)',
    zIndex: 2147483646,
    background: '#0f172a',
    color: '#ffffff',
    border: 'none',
    fontSize: '16px',
    lineHeight: 1,
    borderRadius: '9999px',
    padding: '12px',
    boxShadow: '0 10px 24px rgba(15, 23, 42, 0.35)',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  const sidebarStyle: CSSProperties = {
    position: 'fixed',
    top: 0,
    right: 0,
    width: isExpanded ? '100vw' : `${sidebarWidth}px`,
    maxWidth: '100vw',
    height: '100vh',
    zIndex: 2147483645,
    fontSize: '15px',
    lineHeight: 1.4,
    fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
  };

  if (!isAllowed || !activeFile) {
    return null;
  }

  return (
    <div id="better-cp-ui-root">
      <div
        role="button"
        tabIndex={0}
        style={launcherStyle}
        onClick={() => setIsOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setIsOpen((value) => !value);
          }
        }}
        aria-label="Toggle better-cp editor"
      >
        <Code size={22} />
      </div>

      {isOpen && (
        <aside
          style={sidebarStyle}
          className="relative flex h-screen flex-col border-l border-slate-700 bg-linear-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100 shadow-2xl"
        >
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize editor width"
            className="absolute bottom-0 left-0 top-0 z-20 w-3 cursor-ew-resize bg-transparent hover:bg-indigo-500/15"
            onPointerDown={(event) => {
              dragState.current = {
                startX: event.clientX,
                startWidth: isExpanded ? window.innerWidth : sidebarWidth,
              };
              setIsExpanded(false);
            }}
          >
            <div className="pointer-events-none absolute left-1/2 top-1/2 h-16 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-500/70" />
          </div>
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
            <div className="bcp-title text-sm font-semibold tracking-wide">better-cp editor</div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="rounded-md p-1 text-slate-300 hover:bg-slate-800 hover:text-white"
                onClick={() => setIsExpanded((value) => !value)}
                aria-label={isExpanded ? 'Restore sidebar width' : 'Expand sidebar'}
                title={isExpanded ? 'Restore width' : 'Expand'}
              >
                {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>
              <button
                type="button"
                className="rounded-md p-1 text-slate-300 hover:bg-slate-800 hover:text-white"
                onClick={() => setIsOpen(false)}
                aria-label="Close sidebar"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-3">
            <button
              type="button"
              className="rounded-md bg-emerald-600 p-2 text-white hover:bg-emerald-500"
              style={{ backgroundColor: '#16a34a', color: '#ffffff' }}
              onClick={runCode}
              aria-label="Run code"
              title="Run"
            >
              <Play size={15} />
            </button>
            <button
              type="button"
              className="rounded-md bg-slate-800 p-2 text-slate-100 hover:bg-slate-700"
              style={{ backgroundColor: '#1e293b', color: '#f8fafc' }}
              onClick={undo}
              aria-label="Undo"
              title="Undo"
            >
              <Undo2 size={15} />
            </button>
            <button
              type="button"
              className="rounded-md bg-slate-800 p-2 text-slate-100 hover:bg-slate-700"
              style={{ backgroundColor: '#1e293b', color: '#f8fafc' }}
              onClick={redo}
              aria-label="Redo"
              title="Redo"
            >
              <Redo2 size={15} />
            </button>
            <select
              value={activeFile.language}
              onChange={(event) => {
                const language = event.target.value as Language;
                const previousTemplate = settings.templates[activeFile.language] ?? DEFAULT_SNIPPETS[activeFile.language];
                const nextTemplate = settings.templates[language] ?? DEFAULT_SNIPPETS[language];
                updateActiveFile((file) => ({
                  ...file,
                  language,
                  name: ensureExtension(file.name, language),
                  content:
                    file.content.trim().length === 0 || file.content === previousTemplate ? nextTemplate : file.content,
                  updatedAt: Date.now(),
                }));
              }}
              className="ml-auto rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200 outline-none focus:border-indigo-400"
              style={{ fontSize: '14px' }}
              aria-label="Language selector"
            >
              {(Object.keys(LANGUAGE_META) as Language[]).map((language) => (
                <option key={language} value={language}>
                  {LANGUAGE_META[language].label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="rounded-md bg-slate-800 p-2 text-slate-100 hover:bg-slate-700"
              style={{ backgroundColor: '#1e293b', color: '#f8fafc' }}
              onClick={addFile}
              aria-label="Add file"
              title="Add file"
            >
              <FilePlus2 size={15} />
            </button>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto border-b border-slate-800 px-3 py-2">
            {files.map((file) => (
              <div
                key={file.id}
                className={`flex items-center gap-2 rounded-md border px-2 py-1 text-xs ${
                  file.id === activeFile.id
                    ? 'border-indigo-400 bg-indigo-500/20 text-indigo-200'
                    : 'border-slate-700 bg-slate-900 text-slate-300'
                }`}
                style={{ fontSize: '13px' }}
              >
                <button
                  type="button"
                  className="whitespace-nowrap"
                  onClick={() => setActiveFileId(file.id)}
                  title={file.name}
                >
                  {file.name}
                </button>
                {files.length > 1 && (
                  <button
                    type="button"
                    className="text-slate-400 hover:text-red-300"
                    onClick={() => removeFile(file.id)}
                    aria-label={`Close ${file.name}`}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="flex-1 overflow-hidden p-0">
            <MonacoPane
              value={activeFile.content}
              language={activeFile.language}
              onMount={(instance) => {
                editorRef.current = instance;
              }}
              onChange={(content) => {
                updateActiveFile((file) => ({ ...file, content, updatedAt: Date.now() }));
              }}
            />
          </div>

          <div className="space-y-3 border-t border-slate-800 px-4 py-3">
            <div>
              <label htmlFor="better-cp-input" className="mb-1 block text-xs font-medium text-slate-300">
                Input
              </label>
              <textarea
                id="better-cp-input"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                className="h-20 w-full resize-none rounded-md border border-slate-700 bg-slate-900 p-2 text-sm text-slate-100 outline-none focus:border-indigo-400"
                placeholder="Passed as input variable when running JS/TS"
              />
            </div>
            <div className="rounded-md border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-200" style={{ fontSize: '14px' }}>
              <span className="text-slate-400">Output: </span>
              {output}
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}

export default defineContentScript({
  matches: ['<all_urls>'],
  cssInjectionMode: 'manifest',
  async main(ctx) {
    const host = document.createElement('div');
    host.id = 'better-cp-root';
    host.style.all = 'initial';
    document.documentElement.append(host);

    const shadow = host.attachShadow({
      mode: 'open' 
    });
    
    const baseStyle = document.createElement('style');
    baseStyle.textContent = `
      :host { all: initial; }
      #better-cp-ui-root, #better-cp-ui-root * {
        box-sizing: border-box;
      }
      #better-cp-ui-root {
        font-size: 15px !important;
        line-height: 1.4 !important;
        font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif !important;
      }
      #better-cp-ui-root button,
      #better-cp-ui-root input,
      #better-cp-ui-root select,
      #better-cp-ui-root textarea,
      #better-cp-ui-root label {
        font-size: 14px !important;
        font-family: inherit !important;
        color: inherit !important;
      }
      #better-cp-ui-root .bcp-title { font-size: 16px !important; }
    `;
    const stylesheet = document.createElement('style');
    stylesheet.textContent = contentCssText;
    const monacoStylesheet = document.createElement('style');
    monacoStylesheet.textContent = monacoCssText;
    const container = document.createElement('div');
    shadow.append(baseStyle, stylesheet, monacoStylesheet, container);

    const root = ReactDOM.createRoot(container);
    root.render(<ContentApp />);

    const onRuntimeMessage = async (message: unknown) => {
      if (!message || typeof message !== 'object') return;
      const payload = message as { type?: string; open?: boolean };

      if (payload.type === STATUS_MESSAGE) {
        return { ok: true, isOpen: latestOpenState, allowed: latestAllowedState };
      }

      if (payload.type !== TOGGLE_EVENT) return;

      if (!latestAllowedState) {
        return { ok: false, isOpen: false, message: 'Editor is disabled for this site.' };
      }

      const nextOpen = typeof payload.open === 'boolean' ? payload.open : !latestOpenState;
      latestOpenState = nextOpen;

      window.dispatchEvent(
        new CustomEvent<EditorToggleDetail>(TOGGLE_EVENT, {
          detail: { open: nextOpen },
        }),
      );
      return { ok: true, isOpen: nextOpen };
    };

    browser.runtime.onMessage.addListener(onRuntimeMessage);

    ctx.onInvalidated(() => {
      browser.runtime.onMessage.removeListener(onRuntimeMessage);
      root.unmount();
      host.remove();
    });
  },
});
