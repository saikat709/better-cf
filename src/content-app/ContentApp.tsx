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

type IoTab = 'custom' | 'samples';

const STATUS_BADGE_STYLES: Record<ExecutionStatus | 'running' | 'idle' | 'error', { label: string; bg: string; color: string }> = {
  idle: { label: 'Ready', bg: 'rgba(148, 163, 184, 0.14)', color: 'var(--bcp-sb-text-muted)' },
  running: { label: 'Running...', bg: 'rgba(59, 130, 246, 0.18)', color: '#60a5fa' },
  ok: { label: 'Exit 0', bg: 'rgba(34, 197, 94, 0.18)', color: '#4ade80' },
  compile_error: { label: 'Compile Error', bg: 'rgba(245, 158, 11, 0.18)', color: '#fbbf24' },
  runtime_error: { label: 'Runtime Error', bg: 'rgba(239, 68, 68, 0.18)', color: '#f87171' },
  error: { label: 'Error', bg: 'rgba(239, 68, 68, 0.18)', color: '#f87171' },
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
  const [isRunning, setIsRunning] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(560);
  const [ioHeight, setIoHeight] = useState(220);
  const [isExpanded, setIsExpanded] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [isAllowed, setIsAllowed] = useState(() => isSiteAllowed(window.location.hostname, DEFAULT_SETTINGS.sites));
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedOutput, setCopiedOutput] = useState(false);
  const [ioTab, setIoTab] = useState<IoTab>('custom');
  const [samples, setSamples] = useState<SampleCase[]>([]);
  const [sampleOutcomes, setSampleOutcomes] = useState<SampleRunOutcome[]>([]);
  const [runningSamples, setRunningSamples] = useState(false);

  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const widthDragState = useRef<{ startX: number; startWidth: number } | null>(null);
  const ioDragState = useRef<{ startY: number; startHeight: number } | null>(null);
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
    if (isOpen) {
      refreshSamples();
    }
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
    setOutput('Running...');
    setIoTab('custom');

    try {
      const result = await executeCode(activeFile.language, activeFile.content, input, {
        signal: controller.signal,
      });
      setExecStatus(result.status);
      setExecDurationMs(result.durationMs);
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
    setIoTab('samples');

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
      if (ioDragState.current) {
        const { startY, startHeight } = ioDragState.current;
        const delta = startY - event.clientY;
        const nextHeight = Math.min(460, Math.max(140, startHeight + delta));
        setIoHeight(nextHeight);
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
      ioDragState.current = null;
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
      {/* Floating Launcher */}
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
        aria-label="Toggle BetterCF editor (Alt+E)"
        title="Toggle BetterCF Editor (Alt+E)"
        initial={{ scale: 0.94, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.96 }}
      >
        <Code size={20} />
      </motion.div>

      <AnimatePresence>
        {isOpen && (
          <motion.aside
            key="better-cp-sidebar"
            style={sidebarStyle}
            className="relative flex h-screen flex-col"
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

            {/* Header Bar */}
            <header
              className="flex items-center justify-between border-b px-4 py-2.5"
              style={{ borderColor: 'var(--bcp-sb-border)', backgroundColor: 'var(--bcp-sb-surface)' }}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className="flex h-7 w-7 items-center justify-center rounded-lg border"
                  style={{
                    backgroundColor: 'var(--bcp-sb-accent-soft)',
                    borderColor: 'var(--bcp-sb-accent)',
                    color: 'var(--bcp-sb-accent-text)',
                  }}
                >
                  <Code size={15} />
                </div>
                <div>
                  <div className="bcp-title flex items-center gap-2 font-bold leading-none tracking-tight">
                    <span>BetterCF</span>
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                      style={{
                        backgroundColor: 'var(--bcp-sb-surface-alt)',
                        color: 'var(--bcp-sb-text-muted)',
                      }}
                    >
                      {window.location.hostname}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <div
                  className="flex items-center gap-1.5 rounded-lg border px-2 py-1"
                  style={{
                    backgroundColor: 'var(--bcp-sb-surface-alt)',
                    borderColor: 'var(--bcp-sb-border)',
                  }}
                >
                  <Palette size={13} style={{ color: 'var(--bcp-sb-accent-text)' }} />
                  <select
                    value={settings.sidebarTheme}
                    onChange={(event) => changeSidebarTheme(event.target.value as SidebarThemeId)}
                    aria-label="Sidebar theme"
                    title="Sidebar & Monaco Theme"
                    className="cursor-pointer bg-transparent text-xs font-medium outline-none"
                    style={{ color: 'var(--bcp-sb-text)', fontSize: '12px' }}
                  >
                    {SIDEBAR_THEME_LIST.map((preset) => (
                      <option key={preset.id} value={preset.id} style={{ backgroundColor: '#0f172a', color: '#f8fafc' }}>
                        {preset.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div
                  className="flex items-center rounded-lg border p-0.5"
                  style={{
                    backgroundColor: 'var(--bcp-sb-surface-alt)',
                    borderColor: 'var(--bcp-sb-border)',
                  }}
                >
                  <button
                    type="button"
                    className="rounded-md p-1.5 transition-opacity hover:opacity-80"
                    style={{ color: 'var(--bcp-sb-text-muted)' }}
                    onClick={openSettingsPage}
                    aria-label="Open BetterCF settings"
                    title="Settings"
                  >
                    <SettingsIcon size={15} />
                  </button>
                  <button
                    type="button"
                    className="rounded-md p-1.5 transition-opacity hover:opacity-80"
                    style={{ color: 'var(--bcp-sb-text-muted)' }}
                    onClick={() => setIsExpanded((value) => !value)}
                    aria-label={isExpanded ? 'Restore sidebar width' : 'Expand sidebar'}
                    title={isExpanded ? 'Restore width' : 'Expand'}
                  >
                    {isExpanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                  </button>
                  <button
                    type="button"
                    className="rounded-md p-1.5 transition-opacity hover:opacity-80"
                    style={{ color: 'var(--bcp-sb-text-muted)' }}
                    onClick={() => setIsOpen(false)}
                    aria-label="Close sidebar"
                    title="Close (Alt+E)"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            </header>

            {/* Action Toolbar */}
            <div
              className="flex flex-wrap items-center gap-2 border-b px-4 py-2"
              style={{ borderColor: 'var(--bcp-sb-border)', backgroundColor: 'var(--bcp-sb-bg)' }}
            >
              {isRunning ? (
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-white shadow-sm transition-opacity hover:opacity-90"
                  style={{ backgroundColor: '#dc2626', color: '#ffffff' }}
                  onClick={cancelExecution}
                  aria-label="Cancel execution"
                  title="Cancel"
                >
                  <Square size={13} />
                  <span>Cancel</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold shadow-sm transition-opacity hover:opacity-90"
                  style={{ backgroundColor: 'var(--bcp-sb-run-bg)', color: '#090d16' }}
                  onClick={() => void runCode()}
                  aria-label="Run code (Ctrl+Enter)"
                  title="Run (Ctrl+Enter)"
                >
                  <Play size={13} fill="currentColor" />
                  <span>Run</span>
                  <span className="ml-0.5 rounded px-1 py-0.2 text-[10px] opacity-75" style={{ backgroundColor: 'rgba(0,0,0,0.16)' }}>
                    ⌘↵
                  </span>
                </button>
              )}

              {samples.length > 0 && (
                <button
                  type="button"
                  disabled={isRunning}
                  className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{
                    backgroundColor: 'var(--bcp-sb-surface)',
                    borderColor: 'var(--bcp-sb-border)',
                    color: 'var(--bcp-sb-text)',
                  }}
                  onClick={() => void runAllSamples()}
                  title={`Run all ${samples.length} Codeforces samples`}
                >
                  {runningSamples ? <Loader2 size={13} className="animate-spin" /> : <FlaskConical size={13} />}
                  <span>Samples</span>
                  <span
                    className="rounded-full px-1.5 py-0.2 text-[10px] font-bold"
                    style={{
                      backgroundColor: 'var(--bcp-sb-accent-soft)',
                      color: 'var(--bcp-sb-accent-text)',
                    }}
                  >
                    {samples.length}
                  </span>
                </button>
              )}

              <div
                className="flex items-center rounded-lg border p-0.5"
                style={{
                  backgroundColor: 'var(--bcp-sb-surface)',
                  borderColor: 'var(--bcp-sb-border)',
                }}
              >
                <button
                  type="button"
                  className="rounded-md p-1.5 transition-opacity hover:opacity-80"
                  style={{ color: 'var(--bcp-sb-text)' }}
                  onClick={undo}
                  aria-label="Undo"
                  title="Undo"
                >
                  <Undo2 size={14} />
                </button>
                <button
                  type="button"
                  className="rounded-md p-1.5 transition-opacity hover:opacity-80"
                  style={{ color: 'var(--bcp-sb-text)' }}
                  onClick={redo}
                  aria-label="Redo"
                  title="Redo"
                >
                  <Redo2 size={14} />
                </button>
                <div className="mx-0.5 h-3.5 w-px" style={{ backgroundColor: 'var(--bcp-sb-border)' }} />
                <button
                  type="button"
                  className="rounded-md p-1.5 transition-opacity hover:opacity-80"
                  style={{ color: copiedCode ? '#4ade80' : 'var(--bcp-sb-text)' }}
                  onClick={() => void copyCode()}
                  aria-label="Copy code"
                  title="Copy code"
                >
                  {copiedCode ? <Check size={14} /> : <Copy size={14} />}
                </button>
                <button
                  type="button"
                  className="rounded-md p-1.5 transition-opacity hover:opacity-80"
                  style={{ color: 'var(--bcp-sb-text)' }}
                  onClick={resetToTemplate}
                  aria-label="Reset file to template"
                  title="Reset to template"
                >
                  <RotateCcw size={14} />
                </button>
              </div>

              <div className="ml-auto flex items-center gap-1.5">
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
                  className="rounded-lg border px-2.5 py-1.5 text-xs font-semibold outline-none"
                  style={{
                    backgroundColor: 'var(--bcp-sb-surface)',
                    borderColor: 'var(--bcp-sb-border)',
                    color: 'var(--bcp-sb-text)',
                    fontSize: '12.5px',
                  }}
                  aria-label="Language selector"
                >
                  {(Object.keys(LANGUAGE_META) as Language[]).map((language) => (
                    <option key={language} value={language} style={{ backgroundColor: '#0f172a', color: '#f8fafc' }}>
                      {LANGUAGE_META[language].label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="rounded-lg border p-1.5 transition-opacity hover:opacity-80"
                  style={{
                    backgroundColor: 'var(--bcp-sb-surface)',
                    borderColor: 'var(--bcp-sb-border)',
                    color: 'var(--bcp-sb-text)',
                  }}
                  onClick={addFile}
                  aria-label="Add file"
                  title="New file"
                >
                  <FilePlus2 size={15} />
                </button>
              </div>
            </div>

            {/* File Tabs */}
            <div
              className="flex items-center gap-1 overflow-x-auto border-b px-3 pt-1.5"
              style={{ borderColor: 'var(--bcp-sb-border)', backgroundColor: 'var(--bcp-sb-surface)' }}
            >
              {files.map((file) => {
                const isActive = file.id === activeFile.id;
                const isEditing = editingFileId === file.id;
                return (
                  <div
                    key={file.id}
                    className="group relative flex items-center gap-1.5 rounded-t-lg border border-b-0 px-3 py-1.5 text-xs transition-colors"
                    style={{
                      fontSize: '12.5px',
                      borderColor: isActive ? 'var(--bcp-sb-border)' : 'transparent',
                      backgroundColor: isActive ? 'var(--bcp-sb-bg)' : 'transparent',
                      color: isActive ? 'var(--bcp-sb-text)' : 'var(--bcp-sb-text-muted)',
                    }}
                  >
                    {isActive && (
                      <span
                        className="absolute left-0 right-0 top-0 h-0.5 rounded-t-lg"
                        style={{ backgroundColor: 'var(--bcp-sb-accent)' }}
                      />
                    )}
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{
                        backgroundColor: isActive ? 'var(--bcp-sb-accent)' : 'var(--bcp-sb-text-muted)',
                        opacity: isActive ? 1 : 0.45,
                      }}
                    />
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
                        className="w-28 rounded border px-1 py-0.5 text-xs outline-none"
                        style={{
                          backgroundColor: 'var(--bcp-sb-surface)',
                          borderColor: 'var(--bcp-sb-accent)',
                          color: 'var(--bcp-sb-text)',
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        className="whitespace-nowrap font-medium"
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
                        className="rounded p-0.5 opacity-55 transition-opacity hover:opacity-100"
                        onClick={() => removeFile(file.id)}
                        aria-label={`Close ${file.name}`}
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Monaco Editor */}
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

            {/* Vertical I/O Resize Handle */}
            <div
              role="separator"
              aria-orientation="horizontal"
              aria-label="Resize input and output panel"
              className="group flex h-2.5 cursor-ns-resize items-center justify-center border-t"
              style={{ borderColor: 'var(--bcp-sb-border)', backgroundColor: 'var(--bcp-sb-surface)' }}
              onPointerDown={(event) => {
                ioDragState.current = { startY: event.clientY, startHeight: ioHeight };
              }}
            >
              <div
                className="h-1 w-12 rounded-full opacity-40 transition-opacity group-hover:opacity-100"
                style={{ backgroundColor: 'var(--bcp-sb-accent)' }}
              />
            </div>

            {/* Input / Output & Samples Panel */}
            <div
              className="flex flex-col overflow-hidden px-4 pb-2.5 pt-1.5"
              style={{ height: `${ioHeight}px`, backgroundColor: 'var(--bcp-sb-surface)' }}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <div
                  className="inline-flex items-center gap-1 rounded-lg border p-0.5"
                  style={{
                    backgroundColor: 'var(--bcp-sb-bg)',
                    borderColor: 'var(--bcp-sb-border)',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setIoTab('custom')}
                    className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors"
                    style={{
                      backgroundColor: ioTab === 'custom' ? 'var(--bcp-sb-accent-soft)' : 'transparent',
                      color: ioTab === 'custom' ? 'var(--bcp-sb-accent-text)' : 'var(--bcp-sb-text-muted)',
                    }}
                  >
                    <Terminal size={12} />
                    Console I/O
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      refreshSamples();
                      setIoTab('samples');
                    }}
                    className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors"
                    style={{
                      backgroundColor: ioTab === 'samples' ? 'var(--bcp-sb-accent-soft)' : 'transparent',
                      color: ioTab === 'samples' ? 'var(--bcp-sb-accent-text)' : 'var(--bcp-sb-text-muted)',
                    }}
                  >
                    <FlaskConical size={12} />
                    Samples ({samples.length})
                  </button>
                </div>

                {ioTab === 'custom' ? (
                  <div className="flex items-center gap-1.5">
                    <span
                      className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                      style={{ backgroundColor: badge.bg, color: badge.color }}
                    >
                      {badge.label}
                      {execDurationMs !== null ? ` • ${execDurationMs}ms` : ''}
                    </span>
                    <button
                      type="button"
                      onClick={() => void copyOutput()}
                      className="rounded-md p-1 opacity-75 hover:opacity-100"
                      style={{ color: copiedOutput ? '#4ade80' : 'var(--bcp-sb-text-muted)' }}
                      title="Copy output"
                      aria-label="Copy output"
                    >
                      {copiedOutput ? <Check size={13} /> : <Copy size={13} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setOutput('No output yet');
                        setExecStatus('idle');
                        setExecDurationMs(null);
                      }}
                      className="rounded-md p-1 opacity-75 hover:opacity-100"
                      style={{ color: 'var(--bcp-sb-text-muted)' }}
                      title="Clear output"
                      aria-label="Clear output"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ) : (
                  sampleOutcomes.length > 0 && (
                    <span
                      className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                      style={{
                        backgroundColor:
                          passedCount === sampleOutcomes.length ? 'rgba(34, 197, 94, 0.18)' : 'rgba(239, 68, 68, 0.18)',
                        color: passedCount === sampleOutcomes.length ? '#4ade80' : '#f87171',
                      }}
                    >
                      {passedCount}/{sampleOutcomes.length} Passed
                    </span>
                  )
                )}
              </div>

              {ioTab === 'custom' ? (
                <div className="grid min-h-0 flex-1 grid-cols-2 gap-3">
                  <div className="flex min-h-0 flex-col">
                    <label
                      htmlFor="better-cp-input"
                      className="mb-1 text-[11px] font-semibold uppercase tracking-wider"
                      style={{ color: 'var(--bcp-sb-text-muted)' }}
                    >
                      Stdin
                    </label>
                    <textarea
                      id="better-cp-input"
                      value={input}
                      onChange={(event) => setInput(event.target.value)}
                      className="min-h-0 flex-1 resize-none rounded-lg border p-2.5 font-mono text-xs outline-none"
                      style={{
                        backgroundColor: 'var(--bcp-sb-bg)',
                        borderColor: 'var(--bcp-sb-border)',
                        color: 'var(--bcp-sb-text)',
                      }}
                      placeholder="Enter program stdin..."
                    />
                  </div>
                  <div className="flex min-h-0 flex-col">
                    <span
                      className="mb-1 text-[11px] font-semibold uppercase tracking-wider"
                      style={{ color: 'var(--bcp-sb-text-muted)' }}
                    >
                      Output
                    </span>
                    <pre
                      className="m-0 min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words rounded-lg border p-2.5 font-mono text-xs"
                      style={{
                        backgroundColor: 'var(--bcp-sb-bg)',
                        borderColor: 'var(--bcp-sb-border)',
                        color: 'var(--bcp-sb-text)',
                      }}
                    >
                      {output}
                    </pre>
                  </div>
                </div>
              ) : (
                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                  {samples.length === 0 ? (
                    <div
                      className="flex h-full items-center justify-center rounded-lg border border-dashed text-xs"
                      style={{ borderColor: 'var(--bcp-sb-border)', color: 'var(--bcp-sb-text-muted)' }}
                    >
                      No Codeforces sample tests detected on this page.
                    </div>
                  ) : (
                    samples.map((sample) => {
                      const outcome = sampleOutcomes.find((item) => item.index === sample.index);
                      const accentColor = outcome ? (outcome.passed ? '#4ade80' : '#f87171') : 'var(--bcp-sb-border)';
                      return (
                        <div
                          key={sample.index}
                          className="rounded-lg border p-2.5 text-xs"
                          style={{
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
                                  className="rounded-full px-2 py-0.5 text-[10.5px] font-bold"
                                  style={{
                                    backgroundColor: outcome.passed
                                      ? 'rgba(34, 197, 94, 0.18)'
                                      : 'rgba(239, 68, 68, 0.18)',
                                    color: outcome.passed ? '#4ade80' : '#f87171',
                                  }}
                                >
                                  {outcome.passed ? 'Passed' : outcome.status === 'error' ? 'Error' : 'Wrong Answer'}
                                  {outcome.durationMs > 0 ? ` • ${outcome.durationMs}ms` : ''}
                                </span>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setInput(sample.input);
                                setIoTab('custom');
                              }}
                              className="rounded-md border px-2 py-0.5 text-[11px] font-medium transition-opacity hover:opacity-85"
                              style={{
                                borderColor: 'var(--bcp-sb-border)',
                                backgroundColor: 'var(--bcp-sb-surface-alt)',
                                color: 'var(--bcp-sb-text)',
                              }}
                            >
                              Load to Stdin
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
                            <div>
                              <div className="mb-0.5 text-[10px] uppercase tracking-wider opacity-65">Expected</div>
                              <pre
                                className="m-0 max-h-20 overflow-auto whitespace-pre-wrap rounded-md border p-1.5"
                                style={{ borderColor: 'var(--bcp-sb-border)', backgroundColor: 'var(--bcp-sb-surface)' }}
                              >
                                {sample.expectedOutput}
                              </pre>
                            </div>
                            <div>
                              <div className="mb-0.5 text-[10px] uppercase tracking-wider opacity-65">Actual</div>
                              <pre
                                className="m-0 max-h-20 overflow-auto whitespace-pre-wrap rounded-md border p-1.5"
                                style={{ borderColor: 'var(--bcp-sb-border)', backgroundColor: 'var(--bcp-sb-surface)' }}
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

            {/* Compact Status Footer */}
            <footer
              className="flex items-center justify-between border-t px-4 py-1 text-[11px]"
              style={{
                borderColor: 'var(--bcp-sb-border)',
                backgroundColor: 'var(--bcp-sb-bg)',
                color: 'var(--bcp-sb-text-muted)',
              }}
            >
              <span>
                {LANGUAGE_META[activeFile.language]?.label ?? activeFile.language} • {activeFile.content.split('\n').length} lines
              </span>
              <span>Ctrl+Enter Run • Alt+E Toggle</span>
            </footer>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}

export default ContentApp;
