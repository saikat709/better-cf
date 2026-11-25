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
  Play,
  Redo2,
  RotateCcw,
  Settings as SettingsIcon,
  Square,
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
  idle: { label: 'Ready', bg: 'rgba(148, 163, 184, 0.16)', color: 'var(--bcp-sb-text-muted)' },
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
  const [isRunning, setIsRunning] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(560);
  const [ioHeight, setIoHeight] = useState(210);
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
        const nextHeight = Math.min(440, Math.max(130, startHeight + delta));
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
    right: '16px',
    top: '50%',
    transform: 'translateY(-50%)',
    zIndex: 2147483646,
    background: 'var(--bcp-sb-launcher-bg)',
    color: 'var(--bcp-sb-launcher-text)',
    border: '1px solid var(--bcp-sb-border)',
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
    backgroundColor: 'var(--bcp-sb-bg)',
    color: 'var(--bcp-sb-text)',
    borderLeft: '1px solid var(--bcp-sb-border)',
  };

  if (!isAllowed || !activeFile) {
    return null;
  }

  const badge = STATUS_BADGE_STYLES[execStatus];

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
        aria-label="Toggle better-cp editor (Alt+E)"
        title="Toggle BetterCF Editor (Alt+E)"
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
            className="relative flex h-screen flex-col shadow-2xl"
            initial={{ x: 24, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 24, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 28 }}
          >
            {/* Left width resize handle */}
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize editor width"
              className="absolute bottom-0 left-0 top-0 z-20 w-3 cursor-ew-resize bg-transparent"
              onPointerDown={(event) => {
                widthDragState.current = {
                  startX: event.clientX,
                  startWidth: isExpanded ? window.innerWidth : sidebarWidth,
                };
                setIsExpanded(false);
              }}
            >
              <div
                className="pointer-events-none absolute left-1/2 top-1/2 h-16 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-60"
                style={{ backgroundColor: 'var(--bcp-sb-text-muted)' }}
              />
            </div>

            {/* Header */}
            <div
              className="flex items-center justify-between border-b px-4 py-2.5"
              style={{ borderColor: 'var(--bcp-sb-border)', backgroundColor: 'var(--bcp-sb-surface)' }}
            >
              <div className="bcp-title font-semibold tracking-wide">BetterCF Editor</div>
              <div className="flex items-center gap-1.5">
                <select
                  value={settings.sidebarTheme}
                  onChange={(event) => changeSidebarTheme(event.target.value as SidebarThemeId)}
                  aria-label="Sidebar theme"
                  title="Sidebar & Monaco Theme"
                  className="rounded-md border px-2 py-1 text-xs outline-none"
                  style={{
                    backgroundColor: 'var(--bcp-sb-surface-alt)',
                    borderColor: 'var(--bcp-sb-border)',
                    color: 'var(--bcp-sb-text)',
                    fontSize: '12px',
                  }}
                >
                  {SIDEBAR_THEME_LIST.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="rounded-md p-1.5 transition-opacity hover:opacity-80"
                  style={{ color: 'var(--bcp-sb-text-muted)' }}
                  onClick={openSettingsPage}
                  aria-label="Open BetterCF settings"
                  title="Settings"
                >
                  <SettingsIcon size={16} />
                </button>
                <button
                  type="button"
                  className="rounded-md p-1.5 transition-opacity hover:opacity-80"
                  style={{ color: 'var(--bcp-sb-text-muted)' }}
                  onClick={() => setIsExpanded((value) => !value)}
                  aria-label={isExpanded ? 'Restore sidebar width' : 'Expand sidebar'}
                  title={isExpanded ? 'Restore width' : 'Expand'}
                >
                  {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                </button>
                <button
                  type="button"
                  className="rounded-md p-1.5 transition-opacity hover:opacity-80"
                  style={{ color: 'var(--bcp-sb-text-muted)' }}
                  onClick={() => setIsOpen(false)}
                  aria-label="Close sidebar"
                  title="Close (Alt+E)"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Toolbar */}
            <div
              className="flex flex-wrap items-center gap-1.5 border-b px-4 py-2"
              style={{ borderColor: 'var(--bcp-sb-border)', backgroundColor: 'var(--bcp-sb-bg)' }}
            >
              {isRunning ? (
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
                  style={{ backgroundColor: '#dc2626', color: '#ffffff' }}
                  onClick={cancelExecution}
                  aria-label="Cancel execution"
                  title="Cancel"
                >
                  <Square size={14} />
                  Cancel
                </button>
              ) : (
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
                  style={{ backgroundColor: 'var(--bcp-sb-run-bg)', color: '#0b1120' }}
                  onClick={() => void runCode()}
                  aria-label="Run code (Ctrl+Enter)"
                  title="Run (Ctrl+Enter)"
                >
                  <Play size={14} />
                  Run
                </button>
              )}

              {samples.length > 0 && (
                <button
                  type="button"
                  disabled={isRunning}
                  className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{
                    backgroundColor: 'var(--bcp-sb-surface-alt)',
                    borderColor: 'var(--bcp-sb-border)',
                    color: 'var(--bcp-sb-text)',
                  }}
                  onClick={() => void runAllSamples()}
                  title={`Run all ${samples.length} Codeforces samples`}
                >
                  {runningSamples ? <Loader2 size={14} className="animate-spin" /> : <FlaskConical size={14} />}
                  Samples ({samples.length})
                </button>
              )}

              <div className="mx-0.5 h-5 w-px" style={{ backgroundColor: 'var(--bcp-sb-border)' }} />

              <button
                type="button"
                className="rounded-md p-2 transition-opacity hover:opacity-80"
                style={{ backgroundColor: 'var(--bcp-sb-surface-alt)', color: 'var(--bcp-sb-text)' }}
                onClick={undo}
                aria-label="Undo"
                title="Undo"
              >
                <Undo2 size={15} />
              </button>
              <button
                type="button"
                className="rounded-md p-2 transition-opacity hover:opacity-80"
                style={{ backgroundColor: 'var(--bcp-sb-surface-alt)', color: 'var(--bcp-sb-text)' }}
                onClick={redo}
                aria-label="Redo"
                title="Redo"
              >
                <Redo2 size={15} />
              </button>
              <button
                type="button"
                className="rounded-md p-2 transition-opacity hover:opacity-80"
                style={{ backgroundColor: 'var(--bcp-sb-surface-alt)', color: 'var(--bcp-sb-text)' }}
                onClick={() => void copyCode()}
                aria-label="Copy code"
                title="Copy code"
              >
                {copiedCode ? <Check size={15} /> : <Copy size={15} />}
              </button>
              <button
                type="button"
                className="rounded-md p-2 transition-opacity hover:opacity-80"
                style={{ backgroundColor: 'var(--bcp-sb-surface-alt)', color: 'var(--bcp-sb-text)' }}
                onClick={resetToTemplate}
                aria-label="Reset file to template"
                title="Reset to template"
              >
                <RotateCcw size={15} />
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
                className="ml-auto rounded-md border px-2 py-1 text-xs outline-none"
                style={{
                  backgroundColor: 'var(--bcp-sb-surface)',
                  borderColor: 'var(--bcp-sb-border)',
                  color: 'var(--bcp-sb-text)',
                  fontSize: '13px',
                }}
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
                className="rounded-md p-2 transition-opacity hover:opacity-80"
                style={{ backgroundColor: 'var(--bcp-sb-surface-alt)', color: 'var(--bcp-sb-text)' }}
                onClick={addFile}
                aria-label="Add file"
                title="Add file"
              >
                <FilePlus2 size={15} />
              </button>
            </div>

            {/* File Tabs */}
            <div
              className="flex items-center gap-1.5 overflow-x-auto border-b px-3 py-1.5"
              style={{ borderColor: 'var(--bcp-sb-border)', backgroundColor: 'var(--bcp-sb-surface)' }}
            >
              {files.map((file) => {
                const isActive = file.id === activeFile.id;
                const isEditing = editingFileId === file.id;
                return (
                  <div
                    key={file.id}
                    className="flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs"
                    style={{
                      fontSize: '13px',
                      borderColor: isActive ? 'var(--bcp-sb-accent)' : 'var(--bcp-sb-border)',
                      backgroundColor: isActive ? 'var(--bcp-sb-accent-soft)' : 'var(--bcp-sb-surface-alt)',
                      color: isActive ? 'var(--bcp-sb-accent-text)' : 'var(--bcp-sb-text-muted)',
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
                        className="w-28 rounded border px-1 py-0.5 text-xs outline-none"
                        style={{
                          backgroundColor: 'var(--bcp-sb-bg)',
                          borderColor: 'var(--bcp-sb-accent)',
                          color: 'var(--bcp-sb-text)',
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        className="whitespace-nowrap"
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
                        className="rounded p-0.5 opacity-70 hover:opacity-100"
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
            <div className="min-h-0 flex-1 overflow-hidden p-2">
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
              className="flex h-2.5 cursor-ns-resize items-center justify-center border-t"
              style={{ borderColor: 'var(--bcp-sb-border)', backgroundColor: 'var(--bcp-sb-surface)' }}
              onPointerDown={(event) => {
                ioDragState.current = { startY: event.clientY, startHeight: ioHeight };
              }}
            >
              <div className="h-1 w-12 rounded-full opacity-50" style={{ backgroundColor: 'var(--bcp-sb-text-muted)' }} />
            </div>

            {/* Input / Output & Samples Panel */}
            <div
              className="flex flex-col overflow-hidden px-4 pb-3 pt-2"
              style={{ height: `${ioHeight}px`, backgroundColor: 'var(--bcp-sb-surface)' }}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setIoTab('custom')}
                    className="rounded-md px-2.5 py-1 text-xs font-medium"
                    style={{
                      backgroundColor: ioTab === 'custom' ? 'var(--bcp-sb-accent-soft)' : 'transparent',
                      color: ioTab === 'custom' ? 'var(--bcp-sb-accent-text)' : 'var(--bcp-sb-text-muted)',
                    }}
                  >
                    Input / Output
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      refreshSamples();
                      setIoTab('samples');
                    }}
                    className="rounded-md px-2.5 py-1 text-xs font-medium"
                    style={{
                      backgroundColor: ioTab === 'samples' ? 'var(--bcp-sb-accent-soft)' : 'transparent',
                      color: ioTab === 'samples' ? 'var(--bcp-sb-accent-text)' : 'var(--bcp-sb-text-muted)',
                    }}
                  >
                    Samples ({samples.length})
                  </button>
                </div>

                {ioTab === 'custom' && (
                  <div className="flex items-center gap-2">
                    <span
                      className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                      style={{ backgroundColor: badge.bg, color: badge.color }}
                    >
                      {badge.label}
                      {execDurationMs !== null ? ` • ${execDurationMs}ms` : ''}
                    </span>
                    <button
                      type="button"
                      onClick={() => void copyOutput()}
                      className="rounded p-1 opacity-75 hover:opacity-100"
                      style={{ color: 'var(--bcp-sb-text-muted)' }}
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
                      className="rounded p-1 opacity-75 hover:opacity-100"
                      style={{ color: 'var(--bcp-sb-text-muted)' }}
                      title="Clear output"
                      aria-label="Clear output"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}
              </div>

              {ioTab === 'custom' ? (
                <div className="grid min-h-0 flex-1 grid-cols-2 gap-3">
                  <div className="flex min-h-0 flex-col">
                    <label
                      htmlFor="better-cp-input"
                      className="mb-1 text-xs font-medium"
                      style={{ color: 'var(--bcp-sb-text-muted)' }}
                    >
                      Stdin
                    </label>
                    <textarea
                      id="better-cp-input"
                      value={input}
                      onChange={(event) => setInput(event.target.value)}
                      className="min-h-0 flex-1 resize-none rounded-md border p-2 font-mono text-xs outline-none"
                      style={{
                        backgroundColor: 'var(--bcp-sb-bg)',
                        borderColor: 'var(--bcp-sb-border)',
                        color: 'var(--bcp-sb-text)',
                      }}
                      placeholder="Program stdin..."
                    />
                  </div>
                  <div className="flex min-h-0 flex-col">
                    <span className="mb-1 text-xs font-medium" style={{ color: 'var(--bcp-sb-text-muted)' }}>
                      Output
                    </span>
                    <pre
                      className="m-0 min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words rounded-md border p-2 font-mono text-xs"
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
                    <div className="py-4 text-center text-xs" style={{ color: 'var(--bcp-sb-text-muted)' }}>
                      No Codeforces sample tests detected on this page.
                    </div>
                  ) : (
                    samples.map((sample) => {
                      const outcome = sampleOutcomes.find((item) => item.index === sample.index);
                      return (
                        <div
                          key={sample.index}
                          className="rounded-md border p-2 text-xs"
                          style={{
                            borderColor: 'var(--bcp-sb-border)',
                            backgroundColor: 'var(--bcp-sb-bg)',
                          }}
                        >
                          <div className="mb-1.5 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 font-semibold">
                              <span>Sample #{sample.index}</span>
                              {outcome && (
                                <span
                                  className="rounded-full px-2 py-0.5 text-[11px]"
                                  style={{
                                    backgroundColor: outcome.passed ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
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
                              className="rounded border px-2 py-0.5 text-[11px] hover:opacity-85"
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
                              <div className="mb-0.5 opacity-70">Expected</div>
                              <pre
                                className="m-0 max-h-20 overflow-auto whitespace-pre-wrap rounded border p-1.5"
                                style={{ borderColor: 'var(--bcp-sb-border)' }}
                              >
                                {sample.expectedOutput}
                              </pre>
                            </div>
                            <div>
                              <div className="mb-0.5 opacity-70">Actual</div>
                              <pre
                                className="m-0 max-h-20 overflow-auto whitespace-pre-wrap rounded border p-1.5"
                                style={{ borderColor: 'var(--bcp-sb-border)' }}
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
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}

export default ContentApp;
