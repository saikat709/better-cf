import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import type { editor } from 'monaco-editor';
import {
  Check,
  ClipboardPaste,
  Code,
  Copy,
  FilePlus2,
  FlaskConical,
  Loader2,
  Maximize2,
  Minimize2,
  Palette,
  Play,
  Redo2,
  RotateCcw,
  Settings as SettingsIcon,
  Square,
  Terminal,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { executeCode, formatExecutionOutput, type ExecutionStatus } from '../../lib/runner';
import MonacoPane from './MonacoPane';
import { makeFile, ensureExtension } from './files';
import { loadState, saveState } from './storage';
import {
  normalizeOutputForCompare,
  parseCodeforcesSamples,
  type SampleCase,
  type SampleRunOutcome,
} from './samples';
import type { CodeFile, EditorToggleDetail } from './types';
import { TOGGLE_EVENT } from './constants';
import { setLatestAllowedState, setLatestOpenState } from './runtimeState';
import {
  DEFAULT_SETTINGS,
  DEFAULT_SNIPPETS,
  LANGUAGE_META,
  getStorageApi,
  loadSettings,
  saveSettings,
  isSiteAllowed,
  type Language,
  type Settings,
} from '../shared/settings';
import { SIDEBAR_THEMES, SIDEBAR_THEME_LIST } from '../shared/themes/presets';
import type { SidebarThemeId } from '../shared/themes/types';

type DrawerTab = 'input' | 'output' | 'samples';

const STATUS_BADGE_STYLES: Record<
  ExecutionStatus | 'running' | 'idle' | 'error',
  { label: string; bg: string; color: string }
> = {
  idle: { label: 'Ready', bg: 'rgba(148, 163, 184, 0.14)', color: 'var(--bcp-sb-text-muted)' },
  running: { label: 'Running...', bg: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa' },
  ok: { label: 'Exit 0', bg: 'rgba(34, 197, 94, 0.2)', color: '#4ade80' },
  compile_error: { label: 'Compile Error', bg: 'rgba(245, 158, 11, 0.2)', color: '#fbbf24' },
  runtime_error: { label: 'Runtime Error', bg: 'rgba(239, 68, 68, 0.2)', color: '#f87171' },
  error: { label: 'Error', bg: 'rgba(239, 68, 68, 0.2)', color: '#f87171' },
};

function ContentApp() {
  const [isOpen, setIsOpen] = useState(false);
  const [files, setFiles] = useState<CodeFile[]>([]);
  const [activeFileId, setActiveFileId] = useState('');
  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('No output yet');
  const [execStatus, setExecStatus] = useState<ExecutionStatus | 'running' | 'idle' | 'error'>('idle');
  const [execDurationMs, setExecDurationMs] = useState<number | null>(null);
  const [execRunner, setExecRunner] = useState<'wandbox' | 'piston' | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(560);
  const [isExpanded, setIsExpanded] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [isAllowed, setIsAllowed] = useState(() => isSiteAllowed(window.location.hostname, DEFAULT_SETTINGS.sites));
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedOutput, setCopiedOutput] = useState(false);

  // Drawer is CLOSED by default so the Monaco editor takes 100% height!
  const [activeDrawer, setActiveDrawer] = useState<DrawerTab | null>(null);
  const [drawerHeight, setDrawerHeight] = useState(250);
  const [samples, setSamples] = useState<SampleCase[]>([]);
  const [sampleOutcomes, setSampleOutcomes] = useState<SampleRunOutcome[]>([]);
  const [runningSamples, setRunningSamples] = useState(false);

  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const widthDragState = useRef<{ startX: number; startWidth: number } | null>(null);
  const drawerDragState = useRef<{ startY: number; startHeight: number } | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const activeFile = useMemo(() => files.find((file) => file.id === activeFileId) ?? files[0], [files, activeFileId]);
  const sidebarPreset = useMemo(
    () => SIDEBAR_THEMES[settings.sidebarTheme] ?? SIDEBAR_THEMES['dark-slate'],
    [settings.sidebarTheme],
  );

  const refreshSamples = useCallback(() => {
    setSamples(parseCodeforcesSamples());
  }, []);

  useEffect(() => {
    const handleToggle = (event: Event) => {
      const { detail } = event as CustomEvent<EditorToggleDetail>;
      setIsOpen((prev) => (typeof detail?.open === 'boolean' ? detail.open : !prev));
    };

    window.addEventListener(TOGGLE_EVENT, handleToggle as EventListener);
    return () => window.removeEventListener(TOGGLE_EVENT, handleToggle as EventListener);
  }, []);

  useEffect(() => {
    const onGlobalKeyDown = (event: KeyboardEvent) => {
      if (event.altKey && event.key.toLowerCase() === 'e') {
        if (!isAllowed) return;
        event.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onGlobalKeyDown);
    return () => window.removeEventListener('keydown', onGlobalKeyDown);
  }, [isAllowed]);

  useEffect(() => {
    if (isOpen) refreshSamples();
  }, [isOpen, refreshSamples]);

  useEffect(() => {
    let cancelled = false;
    const hydrate = async () => {
      try {
        const nextSettings = await loadSettings();
        if (cancelled) return;
        setSettings(nextSettings);
        setSidebarWidth(nextSettings.sidebarWidth || 560);
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
        setExecStatus('error');
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
    const root = document.documentElement;
    if (isAllowed && isOpen && !isExpanded) {
      root.style.marginRight = `${sidebarWidth}px`;
      root.style.overflowX = 'hidden';
    } else {
      root.style.marginRight = '';
      root.style.overflowX = '';
    }
    return () => {
      root.style.marginRight = '';
      root.style.overflowX = '';
    };
  }, [isAllowed, isOpen, isExpanded, sidebarWidth]);

  useEffect(() => {
    setLatestAllowedState(isAllowed);
  }, [isAllowed]);

  useEffect(() => {
    if (!hydrated || files.length === 0 || !activeFile) return;
    const timeout = window.setTimeout(() => {
      void saveState(files, activeFile.id, input).catch((error) => {
        setExecStatus('error');
        setOutput(`Storage error: ${error instanceof Error ? error.message : String(error)}`);
      });
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [files, activeFile, hydrated, input]);

  const updateActiveFile = (updater: (file: CodeFile) => CodeFile) => {
    if (!activeFile) return;
    setFiles((prev) => prev.map((file) => (file.id === activeFile.id ? updater(file) : file)));
  };

  const cancelExecution = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
  };

  const runCode = useCallback(async () => {
    if (!activeFile || isRunning) return;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsRunning(true);
    setExecStatus('running');
    setExecDurationMs(null);
    setExecRunner(null);
    setOutput('Running...');
    setActiveDrawer('output');

    try {
      const result = await executeCode(activeFile.language, activeFile.content, input, {
        signal: controller.signal,
      });
      setExecStatus(result.status);
      setExecDurationMs(result.durationMs);
      setExecRunner(result.runner);
      setOutput(formatExecutionOutput(result));
    } catch (error) {
      setExecStatus('error');
      setOutput(error instanceof Error ? error.message : String(error));
    } finally {
      abortControllerRef.current = null;
      setIsRunning(false);
    }
  }, [activeFile, input, isRunning]);

  const runAllSamples = async () => {
    if (!activeFile || isRunning || runningSamples) return;
    const latestSamples = parseCodeforcesSamples();
    setSamples(latestSamples);
    if (latestSamples.length === 0) return;

    const controller = new AbortController();
    abortControllerRef.current = controller;
    setRunningSamples(true);
    setIsRunning(true);
    setSampleOutcomes([]);
    setActiveDrawer('samples');

    const outcomes: SampleRunOutcome[] = [];
    try {
      for (const sample of latestSamples) {
        if (controller.signal.aborted) break;
        try {
          const result = await executeCode(activeFile.language, activeFile.content, sample.input, {
            signal: controller.signal,
          });
          const actual = formatExecutionOutput(result);
          const passed =
            result.status === 'ok' &&
            normalizeOutputForCompare(result.stdout) === normalizeOutputForCompare(sample.expectedOutput);
          outcomes.push({
            index: sample.index,
            input: sample.input,
            expectedOutput: sample.expectedOutput,
            actualOutput: actual,
            passed,
            status: result.status === 'ok' ? (passed ? 'passed' : 'failed') : 'error',
            durationMs: result.durationMs,
          });
        } catch (error) {
          outcomes.push({
            index: sample.index,
            input: sample.input,
            expectedOutput: sample.expectedOutput,
            actualOutput: error instanceof Error ? error.message : String(error),
            passed: false,
            status: 'error',
            durationMs: 0,
          });
        }
        setSampleOutcomes([...outcomes]);
      }
    } finally {
      abortControllerRef.current = null;
      setRunningSamples(false);
      setIsRunning(false);
    }
  };

  const undo = () => editorRef.current?.trigger('better-cp', 'undo', null);
  const redo = () => editorRef.current?.trigger('better-cp', 'redo', null);

  const copyCode = async () => {
    if (!activeFile) return;
    try {
      await navigator.clipboard.writeText(activeFile.content);
      setCopiedCode(true);
      window.setTimeout(() => setCopiedCode(false), 1500);
    } catch {
      // Clipboard blocked
    }
  };

  const copyOutput = async () => {
    try {
      await navigator.clipboard.writeText(output);
      setCopiedOutput(true);
      window.setTimeout(() => setCopiedOutput(false), 1500);
    } catch {
      // Clipboard blocked
    }
  };

  const resetToTemplate = () => {
    if (!activeFile) return;
    const template = settings.templates[activeFile.language] ?? DEFAULT_SNIPPETS[activeFile.language];
    updateActiveFile((file) => ({ ...file, content: template, updatedAt: Date.now() }));
  };

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

  const commitRename = () => {
    if (!editingFileId) return;
    const trimmed = editingName.trim();
    if (trimmed) {
      setFiles((prev) =>
        prev.map((file) => (file.id === editingFileId ? { ...file, name: trimmed, updatedAt: Date.now() } : file)),
      );
    }
    setEditingFileId(null);
  };

  const changeSidebarTheme = (nextTheme: SidebarThemeId) => {
    const nextSettings: Settings = { ...settings, sidebarTheme: nextTheme };
    setSettings(nextSettings);
    void saveSettings(nextSettings);
  };

  const openSettingsPage = () => {
    void browser.runtime.sendMessage({ type: 'better-cp:open-settings' });
  };

  const toggleDrawer = (tab: DrawerTab) => {
    if (tab === 'samples') refreshSamples();
    setActiveDrawer((prev) => (prev === tab ? null : tab));
  };

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      if (widthDragState.current) {
        const { startX, startWidth } = widthDragState.current;
        const delta = startX - event.clientX;
        const minWidth = 460;
        const maxWidth = Math.max(minWidth, window.innerWidth - 24);
        const nextWidth = Math.min(maxWidth, Math.max(minWidth, startWidth + delta));
        setSidebarWidth(nextWidth);
      }
      if (drawerDragState.current) {
        const { startY, startHeight } = drawerDragState.current;
        const delta = startY - event.clientY;
        const nextHeight = Math.min(480, Math.max(160, startHeight + delta));
        setDrawerHeight(nextHeight);
      }
    };

    const onPointerUp = () => {
      if (widthDragState.current) {
        widthDragState.current = null;
        setSidebarWidth((current) => {
          const latest = settingsRef.current;
          if (latest.sidebarWidth !== current) {
            void saveSettings({ ...latest, sidebarWidth: current });
          }
          return current;
        });
      }
      drawerDragState.current = null;
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, []);

  const rootThemeStyle = sidebarPreset.tokens as CSSProperties;

  const launcherStyle: CSSProperties = {
    position: 'fixed',
    right: '18px',
    top: '50%',
    transform: 'translateY(-50%)',
    zIndex: 2147483646,
    background: 'var(--bcp-sb-launcher-bg)',
    color: 'var(--bcp-sb-launcher-text)',
    border: '1px solid var(--bcp-sb-border)',
    borderRadius: '14px',
    padding: '11px',
    boxShadow: '0 12px 28px rgba(2, 6, 23, 0.45)',
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
    fontSize: '14px',
    lineHeight: 1.4,
    fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
    backgroundColor: 'var(--bcp-sb-bg)',
    color: 'var(--bcp-sb-text)',
    borderLeft: '1px solid var(--bcp-sb-border)',
    boxShadow: '-12px 0 40px rgba(2, 6, 23, 0.55)',
  };

  if (!isAllowed || !activeFile) {
    return null;
  }

  const badge = STATUS_BADGE_STYLES[execStatus];
  const passedCount = sampleOutcomes.filter((item) => item.passed).length;

  return (
    <div
      id="better-cp-ui-root"
      style={rootThemeStyle}
      onKeyDown={(event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
          event.preventDefault();
          void runCode();
        }
      }}
    >
      {/* Floating Launcher (hidden when sidebar is open) */}
      {!isOpen && (
        <motion.div
          role="button"
          tabIndex={0}
          style={launcherStyle}
          onClick={() => setIsOpen(true)}
          onKeyDown={(event: ReactKeyboardEvent<HTMLDivElement>) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              setIsOpen(true);
            }
          }}
          aria-label="Open BetterCF editor (Alt+E)"
          title="Open BetterCF Editor (Alt+E)"
          initial={{ scale: 0.94, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.96 }}
        >
          <Code size={20} />
        </motion.div>
      )}

      <AnimatePresence>
        {isOpen && (
          <motion.aside
            key="better-cp-sidebar"
            style={sidebarStyle}
            className="relative flex h-screen flex-col overflow-hidden"
            initial={{ x: 28, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 28, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 280, damping: 28 }}
          >
            {/* Left Width Resize Handle */}
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize editor width"
              className="group absolute bottom-0 left-0 top-0 z-20 w-2.5 cursor-ew-resize bg-transparent"
              onPointerDown={(event) => {
                widthDragState.current = {
                  startX: event.clientX,
                  startWidth: isExpanded ? window.innerWidth : sidebarWidth,
                };
                setIsExpanded(false);
              }}
            >
              <div
                className="pointer-events-none absolute left-0.5 top-1/2 h-14 w-1 -translate-y-1/2 rounded-full opacity-40 transition-opacity group-hover:opacity-100"
                style={{ backgroundColor: 'var(--bcp-sb-accent)' }}
              />
            </div>

            {/* Zone 1: Unified Top Tab Bar + Window Controls */}
            <header
              className="flex items-center gap-2 border-b px-3 py-2"
              style={{ borderColor: 'var(--bcp-sb-border)', backgroundColor: 'var(--bcp-sb-surface)', fontSize: '13px' }}
            >
              <div
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border"
                style={{
                  backgroundColor: 'var(--bcp-sb-accent-soft)',
                  borderColor: 'var(--bcp-sb-accent)',
                  color: 'var(--bcp-sb-accent-text)',
                }}
                title="BetterCF"
              >
                <Code size={15} />
              </div>

              {/* Scrollable File Tabs right in the header */}
              <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
                {files.map((file) => {
                  const isActive = file.id === activeFile.id;
                  const isEditing = editingFileId === file.id;
                  return (
                    <div
                      key={file.id}
                      className="relative flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-1.5 transition-colors"
                      style={{
                        fontSize: '14px',
                        borderColor: isActive ? 'var(--bcp-sb-accent)' : 'transparent',
                        backgroundColor: isActive ? 'var(--bcp-sb-bg)' : 'transparent',
                        color: isActive ? 'var(--bcp-sb-text)' : 'var(--bcp-sb-text-muted)',
                      }}
                    >
                      {isEditing ? (
                        <input
                          type="text"
                          value={editingName}
                          autoFocus
                          onChange={(event) => setEditingName(event.target.value)}
                          onBlur={commitRename}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') commitRename();
                            if (event.key === 'Escape') setEditingFileId(null);
                          }}
                          className="w-28 rounded border px-1.5 py-0.5 outline-none"
                          style={{
                            fontSize: '14px',
                            backgroundColor: 'var(--bcp-sb-surface)',
                            borderColor: 'var(--bcp-sb-accent)',
                            color: 'var(--bcp-sb-text)',
                          }}
                        />
                      ) : (
                        <button
                          type="button"
                          className="whitespace-nowrap font-medium"
                          style={{ fontSize: '14px' }}
                          onClick={() => setActiveFileId(file.id)}
                          onDoubleClick={() => {
                            setEditingFileId(file.id);
                            setEditingName(file.name);
                          }}
                          title={`${file.name} (double-click to rename)`}
                        >
                          {file.name}
                        </button>
                      )}
                      {files.length > 1 && (
                        <button
                          type="button"
                          className="rounded p-0.5 opacity-60 hover:opacity-100"
                          onClick={() => removeFile(file.id)}
                          aria-label={`Close ${file.name}`}
                        >
                          <X size={13} />
                        </button>
                      )}
                    </div>
                  );
                })}
                <button
                  type="button"
                  className="shrink-0 rounded-md p-1.5 opacity-75 transition-opacity hover:opacity-100"
                  style={{ color: 'var(--bcp-sb-text-muted)' }}
                  onClick={addFile}
                  aria-label="New file"
                  title="New file"
                >
                  <FilePlus2 size={16} />
                </button>
              </div>

              {/* Right Window & Theme Controls */}
              <div className="flex shrink-0 items-center gap-1.5">
                <div
                  className="flex items-center gap-1.5 rounded-md border px-2 py-1"
                  style={{
                    backgroundColor: 'var(--bcp-sb-bg)',
                    borderColor: 'var(--bcp-sb-border)',
                  }}
                >
                  <Palette size={14} style={{ color: 'var(--bcp-sb-accent-text)' }} />
                  <select
                    value={settings.sidebarTheme}
                    onChange={(event) => changeSidebarTheme(event.target.value as SidebarThemeId)}
                    aria-label="Sidebar theme"
                    title="Sidebar & Monaco Theme"
                    className="cursor-pointer truncate bg-transparent font-medium outline-none"
                    style={{ color: 'var(--bcp-sb-text)', fontSize: '13px', maxWidth: '110px' }}
                  >
                    {SIDEBAR_THEME_LIST.map((preset) => (
                      <option key={preset.id} value={preset.id} style={{ backgroundColor: '#0f172a', color: '#f8fafc' }}>
                        {preset.name}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  className="rounded-md p-1.5 opacity-75 hover:opacity-100"
                  style={{ color: 'var(--bcp-sb-text-muted)' }}
                  onClick={openSettingsPage}
                  aria-label="Open settings"
                  title="Settings"
                >
                  <SettingsIcon size={16} />
                </button>
                <button
                  type="button"
                  className="rounded-md p-1.5 opacity-75 hover:opacity-100"
                  style={{ color: 'var(--bcp-sb-text-muted)' }}
                  onClick={() => setIsExpanded((value) => !value)}
                  aria-label={isExpanded ? 'Restore width' : 'Expand'}
                  title={isExpanded ? 'Restore width' : 'Expand'}
                >
                  {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                </button>
                <button
                  type="button"
                  className="rounded-md p-1.5 opacity-75 hover:opacity-100"
                  style={{ color: 'var(--bcp-sb-text-muted)' }}
                  onClick={() => setIsOpen(false)}
                  aria-label="Close sidebar"
                  title="Close (Alt+E)"
                >
                  <X size={17} />
                </button>
              </div>
            </header>

            {/* Zone 2: Slim Action Strip */}
            <div
              className="flex flex-wrap items-center gap-2 border-b px-3 py-2"
              style={{ borderColor: 'var(--bcp-sb-border)', backgroundColor: 'var(--bcp-sb-bg)', fontSize: '13px' }}
            >
              {isRunning ? (
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 font-bold text-white transition-opacity hover:opacity-90"
                  style={{ backgroundColor: '#dc2626', color: '#ffffff', fontSize: '14px' }}
                  onClick={cancelExecution}
                >
                  <Square size={15} />
                  Cancel
                </button>
              ) : (
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 font-bold transition-opacity hover:opacity-90"
                  style={{ backgroundColor: 'var(--bcp-sb-run-bg)', color: '#090d16', fontSize: '14px' }}
                  onClick={() => void runCode()}
                  title="Run (Ctrl+Enter)"
                >
                  <Play size={15} fill="currentColor" />
                  Run
                  <span className="rounded px-1.5 py-0.5 opacity-80" style={{ backgroundColor: 'rgba(0,0,0,0.16)', fontSize: '12px' }}>
                    ⌘↵
                  </span>
                </button>
              )}

              {samples.length > 0 && (
                <button
                  type="button"
                  disabled={isRunning}
                  className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{
                    backgroundColor: 'var(--bcp-sb-surface)',
                    borderColor: 'var(--bcp-sb-border)',
                    color: 'var(--bcp-sb-text)',
                    fontSize: '14px',
                  }}
                  onClick={() => void runAllSamples()}
                  title={`Run all ${samples.length} Codeforces samples`}
                >
                  {runningSamples ? <Loader2 size={15} className="animate-spin" /> : <FlaskConical size={15} />}
                  Run Samples ({samples.length})
                </button>
              )}

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="rounded-md p-1.5 opacity-80 hover:opacity-100"
                  style={{ color: 'var(--bcp-sb-text)' }}
                  onClick={undo}
                  aria-label="Undo"
                  title="Undo"
                >
                  <Undo2 size={15} />
                </button>
                <button
                  type="button"
                  className="rounded-md p-1.5 opacity-80 hover:opacity-100"
                  style={{ color: 'var(--bcp-sb-text)' }}
                  onClick={redo}
                  aria-label="Redo"
                  title="Redo"
                >
                  <Redo2 size={15} />
                </button>
                <button
                  type="button"
                  className="rounded-md p-1.5 opacity-80 hover:opacity-100"
                  style={{ color: copiedCode ? '#4ade80' : 'var(--bcp-sb-text)' }}
                  onClick={() => void copyCode()}
                  aria-label="Copy code"
                  title="Copy code"
                >
                  {copiedCode ? <Check size={15} /> : <Copy size={15} />}
                </button>
                <button
                  type="button"
                  className="rounded-md p-1.5 opacity-80 hover:opacity-100"
                  style={{ color: 'var(--bcp-sb-text)' }}
                  onClick={resetToTemplate}
                  aria-label="Reset to template"
                  title="Reset to template"
                >
                  <RotateCcw size={15} />
                </button>
              </div>

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
                className="ml-auto rounded-md border px-2.5 py-1.5 font-semibold outline-none"
                style={{
                  backgroundColor: 'var(--bcp-sb-surface)',
                  borderColor: 'var(--bcp-sb-border)',
                  color: 'var(--bcp-sb-text)',
                  fontSize: '14px',
                }}
                aria-label="Language selector"
              >
                {(Object.keys(LANGUAGE_META) as Language[]).map((language) => (
                  <option key={language} value={language} style={{ backgroundColor: '#0f172a', color: '#f8fafc' }}>
                    {LANGUAGE_META[language].label}
                  </option>
                ))}
              </select>
            </div>

            {/* Full-Height Monaco Editor */}
            <div className="min-h-0 flex-1 overflow-hidden p-2" style={{ backgroundColor: 'var(--bcp-sb-bg)' }}>
              <MonacoPane
                value={activeFile.content}
                language={activeFile.language}
                theme={sidebarPreset.monacoTheme}
                onMount={(instance) => {
                  editorRef.current = instance;
                }}
                onChange={(content) => {
                  updateActiveFile((file) => ({ ...file, content, updatedAt: Date.now() }));
                }}
              />
            </div>

            {/* On-Demand Slide-Up Drawer (Closed by Default!) */}
            <AnimatePresence>
              {activeDrawer !== null && (
                <motion.div
                  key="bcp-console-drawer"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: drawerHeight, opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.16, ease: 'easeOut' }}
                  className="flex flex-col overflow-hidden border-t"
                  style={{
                    borderColor: 'var(--bcp-sb-border)',
                    backgroundColor: 'var(--bcp-sb-surface)',
                  }}
                >
                  {/* Drawer Resize Grip */}
                  <div
                    role="separator"
                    aria-orientation="horizontal"
                    aria-label="Resize drawer height"
                    className="group flex h-2 cursor-ns-resize items-center justify-center"
                    onPointerDown={(event) => {
                      drawerDragState.current = { startY: event.clientY, startHeight: drawerHeight };
                    }}
                  >
                    <div
                      className="h-0.5 w-10 rounded-full opacity-40 transition-opacity group-hover:opacity-100"
                      style={{ backgroundColor: 'var(--bcp-sb-accent)' }}
                    />
                  </div>

                  {/* Drawer Header */}
                  <div className="flex items-center justify-between gap-2 px-4 pb-2" style={{ fontSize: '13px' }}>
                    <div className="flex items-center gap-2 font-bold uppercase tracking-wider" style={{ fontSize: '12px' }}>
                      {activeDrawer === 'input' && <span>Program Input (Stdin)</span>}
                      {activeDrawer === 'output' && (
                        <>
                          <span>Console Output</span>
                          <span
                            className="rounded-full px-2 py-0.5 font-semibold normal-case tracking-normal"
                            style={{ backgroundColor: badge.bg, color: badge.color, fontSize: '12px' }}
                          >
                            {badge.label}
                            {execDurationMs !== null ? ` • ${execDurationMs}ms` : ''}
                            {execRunner ? ` • ${execRunner}` : ''}
                          </span>
                        </>
                      )}
                      {activeDrawer === 'samples' && (
                        <>
                          <span>Codeforces Samples ({samples.length})</span>
                          {sampleOutcomes.length > 0 && (
                            <span
                              className="rounded-full px-2 py-0.5 font-semibold normal-case tracking-normal"
                              style={{
                                fontSize: '12px',
                                backgroundColor:
                                  passedCount === sampleOutcomes.length
                                    ? 'rgba(34, 197, 94, 0.18)'
                                    : 'rgba(239, 68, 68, 0.18)',
                                color: passedCount === sampleOutcomes.length ? '#4ade80' : '#f87171',
                              }}
                            >
                              {passedCount}/{sampleOutcomes.length} Passed
                            </span>
                          )}
                        </>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      {activeDrawer === 'input' && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              void navigator.clipboard.readText().then((text) => setInput(text)).catch(() => {});
                            }}
                            className="inline-flex items-center gap-1 rounded border px-2.5 py-1 hover:opacity-85"
                            style={{
                              fontSize: '12px',
                              borderColor: 'var(--bcp-sb-border)',
                              backgroundColor: 'var(--bcp-sb-bg)',
                              color: 'var(--bcp-sb-text-muted)',
                            }}
                          >
                            <ClipboardPaste size={13} />
                            Paste
                          </button>
                          <button
                            type="button"
                            onClick={() => setInput('')}
                            className="inline-flex items-center gap-1 rounded border px-2.5 py-1 hover:opacity-85"
                            style={{
                              fontSize: '12px',
                              borderColor: 'var(--bcp-sb-border)',
                              backgroundColor: 'var(--bcp-sb-bg)',
                              color: 'var(--bcp-sb-text-muted)',
                            }}
                          >
                            <Trash2 size={13} />
                            Clear
                          </button>
                        </>
                      )}

                      {activeDrawer === 'output' && (
                        <>
                          <button
                            type="button"
                            onClick={() => void copyOutput()}
                            className="inline-flex items-center gap-1 rounded border px-2.5 py-1 hover:opacity-85"
                            style={{
                              fontSize: '12px',
                              borderColor: 'var(--bcp-sb-border)',
                              backgroundColor: 'var(--bcp-sb-bg)',
                              color: copiedOutput ? '#4ade80' : 'var(--bcp-sb-text-muted)',
                            }}
                          >
                            {copiedOutput ? <Check size={13} /> : <Copy size={13} />}
                            {copiedOutput ? 'Copied' : 'Copy'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setOutput('No output yet');
                              setExecStatus('idle');
                              setExecDurationMs(null);
                              setExecRunner(null);
                            }}
                            className="inline-flex items-center gap-1 rounded border px-2.5 py-1 hover:opacity-85"
                            style={{
                              fontSize: '12px',
                              borderColor: 'var(--bcp-sb-border)',
                              backgroundColor: 'var(--bcp-sb-bg)',
                              color: 'var(--bcp-sb-text-muted)',
                            }}
                          >
                            <Trash2 size={13} />
                            Clear
                          </button>
                        </>
                      )}

                      <button
                        type="button"
                        onClick={() => setActiveDrawer(null)}
                        className="rounded p-1 opacity-75 hover:opacity-100"
                        style={{ color: 'var(--bcp-sb-text-muted)' }}
                        title="Hide drawer"
                        aria-label="Hide drawer"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Drawer Body */}
                  <div className="min-h-0 flex-1 overflow-hidden px-4 pb-3">
                    {activeDrawer === 'input' && (
                      <div className="flex h-full flex-col gap-2">
                        {samples.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {samples.map((sample) => (
                              <button
                                key={sample.index}
                                type="button"
                                onClick={() => setInput(sample.input)}
                                className="rounded border px-2.5 py-1 font-medium hover:opacity-85"
                                style={{
                                  fontSize: '12px',
                                  borderColor: 'var(--bcp-sb-border)',
                                  backgroundColor: 'var(--bcp-sb-bg)',
                                  color: 'var(--bcp-sb-text-muted)',
                                }}
                              >
                                Use Sample #{sample.index}
                              </button>
                            ))}
                          </div>
                        )}
                        <textarea
                          id="better-cp-input"
                          value={input}
                          onChange={(event) => setInput(event.target.value)}
                          className="min-h-0 flex-1 resize-none rounded-lg border p-3 font-mono outline-none"
                          style={{
                            fontSize: '13px',
                            backgroundColor: 'var(--bcp-sb-bg)',
                            borderColor: 'var(--bcp-sb-border)',
                            color: 'var(--bcp-sb-text)',
                          }}
                          placeholder="Enter custom test input (stdin)..."
                        />
                      </div>
                    )}

                    {activeDrawer === 'output' && (
                      <pre
                        className="m-0 h-full overflow-auto whitespace-pre-wrap break-words rounded-lg border p-3 font-mono"
                        style={{
                          fontSize: '13px',
                          backgroundColor: 'var(--bcp-sb-bg)',
                          borderColor: 'var(--bcp-sb-border)',
                          color: 'var(--bcp-sb-text)',
                        }}
                      >
                        {output}
                      </pre>
                    )}

                    {activeDrawer === 'samples' && (
                      <div className="h-full space-y-2 overflow-y-auto pr-1">
                        {samples.length === 0 ? (
                          <div
                            className="flex h-full items-center justify-center rounded-lg border border-dashed"
                            style={{ fontSize: '13px', borderColor: 'var(--bcp-sb-border)', color: 'var(--bcp-sb-text-muted)' }}
                          >
                            No Codeforces sample tests detected on this page.
                          </div>
                        ) : (
                          samples.map((sample) => {
                            const outcome = sampleOutcomes.find((item) => item.index === sample.index);
                            const accentColor = outcome
                              ? outcome.passed
                                ? '#4ade80'
                                : '#f87171'
                              : 'var(--bcp-sb-border)';
                            return (
                              <div
                                key={sample.index}
                                className="rounded-lg border p-3"
                                style={{
                                  fontSize: '13px',
                                  borderColor: 'var(--bcp-sb-border)',
                                  borderLeftWidth: '3px',
                                  borderLeftColor: accentColor,
                                  backgroundColor: 'var(--bcp-sb-bg)',
                                }}
                              >
                                <div className="mb-2 flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2 font-semibold">
                                    <span>Sample #{sample.index}</span>
                                    {outcome && (
                                      <span
                                        className="rounded-full px-2 py-0.5 font-bold"
                                        style={{
                                          fontSize: '12px',
                                          backgroundColor: outcome.passed
                                            ? 'rgba(34, 197, 94, 0.18)'
                                            : 'rgba(239, 68, 68, 0.18)',
                                          color: outcome.passed ? '#4ade80' : '#f87171',
                                        }}
                                      >
                                        {outcome.passed
                                          ? 'Passed'
                                          : outcome.status === 'error'
                                            ? 'Error'
                                            : 'Wrong Answer'}
                                        {outcome.durationMs > 0 ? ` • ${outcome.durationMs}ms` : ''}
                                      </span>
                                    )}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setInput(sample.input);
                                      setActiveDrawer('input');
                                    }}
                                    className="rounded border px-2.5 py-1 hover:opacity-85"
                                    style={{
                                      fontSize: '12px',
                                      borderColor: 'var(--bcp-sb-border)',
                                      backgroundColor: 'var(--bcp-sb-surface-alt)',
                                      color: 'var(--bcp-sb-text)',
                                    }}
                                  >
                                    Load to Stdin
                                  </button>
                                </div>
                                <div className="grid grid-cols-2 gap-2 font-mono" style={{ fontSize: '12.5px' }}>
                                  <div>
                                    <div className="mb-1 uppercase tracking-wider opacity-65" style={{ fontSize: '11px' }}>Expected</div>
                                    <pre
                                      className="m-0 max-h-24 overflow-auto whitespace-pre-wrap rounded border p-2"
                                      style={{
                                        borderColor: 'var(--bcp-sb-border)',
                                        backgroundColor: 'var(--bcp-sb-surface)',
                                      }}
                                    >
                                      {sample.expectedOutput}
                                    </pre>
                                  </div>
                                  <div>
                                    <div className="mb-1 uppercase tracking-wider opacity-65" style={{ fontSize: '11px' }}>Actual</div>
                                    <pre
                                      className="m-0 max-h-24 overflow-auto whitespace-pre-wrap rounded border p-2"
                                      style={{
                                        borderColor: 'var(--bcp-sb-border)',
                                        backgroundColor: 'var(--bcp-sb-surface)',
                                      }}
                                    >
                                      {outcome ? outcome.actualOutput : 'Not run yet'}
                                    </pre>
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Zone 3: Slim Bottom Dock (Triggers On-Demand Drawers) */}
            <footer
              className="flex items-center justify-between border-t px-3 py-2"
              style={{
                fontSize: '14px',
                borderColor: 'var(--bcp-sb-border)',
                backgroundColor: 'var(--bcp-sb-surface)',
              }}
            >
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => toggleDrawer('input')}
                  className="inline-flex items-center gap-1.5 rounded-md px-3 py-1 font-semibold transition-colors"
                  style={{
                    fontSize: '14px',
                    backgroundColor: activeDrawer === 'input' ? 'var(--bcp-sb-accent-soft)' : 'transparent',
                    color: activeDrawer === 'input' ? 'var(--bcp-sb-accent-text)' : 'var(--bcp-sb-text-muted)',
                  }}
                >
                  Stdin
                  {input.trim().length > 0 && (
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: 'var(--bcp-sb-accent)' }} />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => toggleDrawer('output')}
                  className="inline-flex items-center gap-1.5 rounded-md px-3 py-1 font-semibold transition-colors"
                  style={{
                    fontSize: '14px',
                    backgroundColor: activeDrawer === 'output' ? 'var(--bcp-sb-accent-soft)' : 'transparent',
                    color: activeDrawer === 'output' ? 'var(--bcp-sb-accent-text)' : 'var(--bcp-sb-text-muted)',
                  }}
                >
                  <Terminal size={14} />
                  Output
                  {execStatus !== 'idle' && (
                    <span
                      className="rounded-full px-2 py-0.5"
                      style={{ backgroundColor: badge.bg, color: badge.color, fontSize: '12px' }}
                    >
                      {badge.label}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => toggleDrawer('samples')}
                  className="inline-flex items-center gap-1.5 rounded-md px-3 py-1 font-semibold transition-colors"
                  style={{
                    fontSize: '14px',
                    backgroundColor: activeDrawer === 'samples' ? 'var(--bcp-sb-accent-soft)' : 'transparent',
                    color: activeDrawer === 'samples' ? 'var(--bcp-sb-accent-text)' : 'var(--bcp-sb-text-muted)',
                  }}
                >
                  <FlaskConical size={14} />
                  Samples ({samples.length})
                </button>
              </div>

              <div style={{ color: 'var(--bcp-sb-text-muted)', fontSize: '13px' }}>
                {LANGUAGE_META[activeFile.language]?.label ?? activeFile.language} •{' '}
                {activeFile.content.split('\n').length}L
              </div>
            </footer>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}

export default ContentApp;
