import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { editor } from 'monaco-editor';
import { Code, FilePlus2, Maximize2, Minimize2, Play, Redo2, Undo2, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { runPiston } from '../../lib/piston';
import MonacoPane from './MonacoPane';
import { makeFile, ensureExtension } from './files';
import { loadState, saveState } from './storage';
import type { CodeFile, EditorToggleDetail } from './types';
import { TOGGLE_EVENT } from './constants';
import { setLatestAllowedState, setLatestOpenState } from './runtimeState';
import {
  DEFAULT_SETTINGS,
  DEFAULT_SNIPPETS,
  LANGUAGE_META,
  getStorageApi,
  loadSettings,
  isSiteAllowed,
  type Language,
  type Settings,
} from '../shared/settings';

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

    const storage = getStorageApi();
    const onChanged = storage?.onChanged;
    if (!onChanged) return;
    onChanged.addListener(handleSettingsChange);
    return () => onChanged.removeListener(handleSettingsChange);
  }, []);

  useEffect(() => {
    if (!isAllowed) setIsOpen(false);
  }, [isAllowed]);

  useEffect(() => {
    setLatestOpenState(isOpen);
  }, [isOpen]);

  useEffect(() => {
    setLatestAllowedState(isAllowed);
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

  const runCode = async () => {
    if (!activeFile) return;
    setOutput('Running...');
    if (activeFile.language === 'javascript' || activeFile.language === 'typescript') {
      try {
        const runner = new Function('input', activeFile.content);
        const result = runner(input);
        setOutput(result === undefined ? 'Executed successfully' : String(result));
      } catch (error) {
        setOutput(`Error: ${error instanceof Error ? error.message : String(error)}`);
      }
      return;
    }

    try {
      const result = await runPiston(activeFile.language, activeFile.content, input);
      const outputChunks: string[] = [];
      if (result.compile) {
        const compileOutput = [result.compile.stdout, result.compile.stderr].filter(Boolean).join('\n');
        if (compileOutput) outputChunks.push(`Compile:\n${compileOutput}`);
        if (result.compile.exitCode && result.compile.exitCode !== 0) {
          outputChunks.push(`Compile exit code: ${result.compile.exitCode}`);
        }
      }

      const runOutput = [result.stdout, result.stderr].filter(Boolean).join('\n');
      if (runOutput) {
        outputChunks.push(`Run:\n${runOutput}`);
      } else {
        outputChunks.push('Executed successfully');
      }
      if (result.exitCode && result.exitCode !== 0) {
        outputChunks.push(`Run exit code: ${result.exitCode}`);
      }
      setOutput(outputChunks.join('\n'));
    } catch (error) {
      setOutput(`Runner error: ${error instanceof Error ? error.message : String(error)}`);
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
      <motion.div
        role="button"
        tabIndex={0}
        style={launcherStyle}
        onClick={() => setIsOpen((value) => !value)}
        onKeyDown={(event: ReactKeyboardEvent<HTMLDivElement>) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setIsOpen((value) => !value);
          }
        }}
        aria-label="Toggle better-cp editor"
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.98 }}
      >
        <Code size={22} />
      </motion.div>

      <AnimatePresence>
        {isOpen && (
          <motion.aside
            key="better-cp-sidebar"
            style={sidebarStyle}
            className="relative flex h-screen flex-col border-l border-slate-700 bg-linear-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100 shadow-2xl"
            initial={{ x: 24, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 24, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 28 }}
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
              <div className="bcp-title text-sm font-semibold tracking-wide">BetterCF Editor</div>
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
                className="rounded-md bg-emerald-600 p-3 text-white hover:bg-emerald-500"
                style={{ backgroundColor: '#16a34a', color: '#ffffff' }}
                onClick={runCode}
                aria-label="Run code"
                title="Run"
              >
                <Play size={18} />
              </button>
              <button
                type="button"
                className="rounded-md bg-slate-800 p-3 text-slate-100 hover:bg-slate-700"
                style={{ backgroundColor: '#1e293b', color: '#f8fafc' }}
                onClick={undo}
                aria-label="Undo"
                title="Undo"
              >
                <Undo2 size={18} />
              </button>
              <button
                type="button"
                className="rounded-md bg-slate-800 p-3 text-slate-100 hover:bg-slate-700"
                style={{ backgroundColor: '#1e293b', color: '#f8fafc' }}
                onClick={redo}
                aria-label="Redo"
                title="Redo"
              >
                <Redo2 size={18} />
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
                      x
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
              <div
                className="rounded-md border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-200"
                style={{ fontSize: '14px' }}
              >
                <span className="text-slate-400">Output: </span>
                {output}
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}

export default ContentApp;
