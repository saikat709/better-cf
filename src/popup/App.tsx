import { useEffect, useState } from 'react';
import { Check, Code2, Settings as SettingsIcon } from 'lucide-react';
import './App.css';
import { DEFAULT_SETTINGS, LANGUAGE_META, loadSettings, saveSettings, type Settings } from '../shared/settings';
import { SIDEBAR_THEME_LIST, WEBSITE_THEME_LIST } from '../shared/themes/presets';
import type { SidebarThemeId, WebsiteThemeId } from '../shared/themes/types';

const TOGGLE_MESSAGE = 'better-cp:toggle-editor';
const STATUS_MESSAGE = 'better-cp:get-editor-status';

type ActionResult = {
  ok: boolean;
  message: string;
  isOpen?: boolean;
};

const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

const sendEditorMessage = async (open?: boolean): Promise<ActionResult> => {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return { ok: false, message: 'No active tab found in this window.' };

    const response = (await browser.tabs.sendMessage(tab.id, { type: TOGGLE_MESSAGE, open })) as
      | { ok?: boolean; isOpen?: boolean; message?: string }
      | undefined;

    const responseOpen = typeof response?.isOpen === 'boolean' ? response.isOpen : undefined;

    if (typeof open === 'boolean') {
      return {
        ok: true,
        isOpen: responseOpen ?? open,
        message: open ? 'Editor opened on current tab.' : 'Editor closed on current tab.',
      };
    }

    return { ok: true, isOpen: responseOpen, message: 'Editor toggled on current tab.' };
  } catch (error) {
    return {
      ok: false,
      message: `Page script unreachable (${getErrorMessage(error)})`,
    };
  }
};

const fetchEditorStatus = async (): Promise<ActionResult> => {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return { ok: false, message: 'No active tab found.' };

    const response = (await browser.tabs.sendMessage(tab.id, { type: STATUS_MESSAGE })) as
      | { ok?: boolean; isOpen?: boolean; message?: string }
      | undefined;

    if (typeof response?.isOpen === 'boolean') {
      return {
        ok: true,
        isOpen: response.isOpen,
        message: response.isOpen ? 'Editor is open on this tab.' : 'Editor is ready on this tab.',
      };
    }

    return { ok: false, message: response?.message ?? 'Open a supported site to use the editor.' };
  } catch {
    return {
      ok: false,
      message: 'Themes apply automatically on Codeforces & all mirrors.',
    };
  }
};

function App() {
  const [status, setStatus] = useState('Themes apply live across Codeforces & all mirrors.');
  const [statusTone, setStatusTone] = useState<'ok' | 'error'>('ok');
  const [busyAction, setBusyAction] = useState<'toggle' | 'status' | null>(null);
  const [editorOpen, setEditorOpen] = useState<boolean | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  useEffect(() => {
    void loadSettings().then(setSettings);
  }, []);

  useEffect(() => {
    const refresh = async () => {
      setBusyAction('status');
      const result = await fetchEditorStatus();
      setStatus(result.message);
      setStatusTone(result.ok ? 'ok' : 'ok');
      if (typeof result.isOpen === 'boolean') setEditorOpen(result.isOpen);
      setBusyAction(null);
    };

    void refresh();
  }, []);

  const toggleEditor = async () => {
    setBusyAction('toggle');
    const shouldOpen = editorOpen === null ? undefined : !editorOpen;
    const result = await sendEditorMessage(shouldOpen);
    setStatus(result.message);
    setStatusTone(result.ok ? 'ok' : 'error');
    if (typeof result.isOpen === 'boolean') setEditorOpen(result.isOpen);
    setBusyAction(null);
  };

  const openSettings = () => {
    void browser.tabs.create({ url: browser.runtime.getURL('/settings.html') });
  };

  const updateWebsiteTheme = (websiteTheme: WebsiteThemeId) => {
    const next = { ...settings, websiteTheme };
    setSettings(next);
    void saveSettings(next);
  };

  const updateSidebarTheme = (sidebarTheme: SidebarThemeId) => {
    const next = { ...settings, sidebarTheme };
    setSettings(next);
    void saveSettings(next);
  };

  const toggleDimImages = (dimImagesInDarkMode: boolean) => {
    const next = { ...settings, dimImagesInDarkMode };
    setSettings(next);
    void saveSettings(next);
  };

  const activeSiteCount = settings.sites.filter((site) => site.enabled).length;
  const defaultLanguageLabel = LANGUAGE_META[settings.defaultLanguage]?.label ?? settings.defaultLanguage;

  return (
    <div className="popup-shell">
      <div className="popup-header">
        <div>
          <p className="eyebrow">BetterCF</p>
          <h1 className="title">Theme Studio</h1>
          <p className="subtitle">Switch Codeforces &amp; sidebar themes live.</p>
        </div>
        <button
          type="button"
          className="icon-action-btn"
          onClick={openSettings}
          title="Open full settings"
          aria-label="Open full settings"
        >
          <SettingsIcon size={17} />
        </button>
      </div>

      {/* Codeforces Website Theme Chooser */}
      <div className="section">
        <div className="section-head">
          <div className="section-title">Codeforces Website</div>
          <div className="section-meta">All mirrors</div>
        </div>

        <div className="theme-grid-popup">
          {WEBSITE_THEME_LIST.map((preset) => {
            const selected = settings.websiteTheme === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                className={`theme-chip ${selected ? 'selected' : ''}`}
                onClick={() => updateWebsiteTheme(preset.id)}
              >
                <div className="theme-chip-swatches">
                  {preset.swatches.map((hex, idx) => (
                    <span key={idx} className="theme-chip-swatch" style={{ backgroundColor: hex }} />
                  ))}
                </div>
                <div className="theme-chip-row">
                  <span className="theme-chip-name">{preset.name}</span>
                  {selected && <Check size={13} className="theme-chip-check" />}
                </div>
              </button>
            );
          })}
        </div>

        <label className="toggle-pill">
          <span>Dim bright images in dark themes</span>
          <input
            type="checkbox"
            checked={settings.dimImagesInDarkMode}
            onChange={(event) => toggleDimImages(event.target.checked)}
          />
        </label>
      </div>

      {/* Independent Sidebar & Monaco Theme Chooser */}
      <div className="section">
        <div className="section-head">
          <div className="section-title">Sidebar &amp; Monaco Editor</div>
          <div className="section-meta">Independent</div>
        </div>

        <div className="theme-grid-popup">
          {SIDEBAR_THEME_LIST.map((preset) => {
            const selected = settings.sidebarTheme === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                className={`theme-chip ${selected ? 'selected' : ''}`}
                onClick={() => updateSidebarTheme(preset.id)}
              >
                <div className="theme-chip-swatches">
                  {preset.swatches.map((hex, idx) => (
                    <span key={idx} className="theme-chip-swatch" style={{ backgroundColor: hex }} />
                  ))}
                </div>
                <div className="theme-chip-row">
                  <span className="theme-chip-name">{preset.name}</span>
                  {selected && <Check size={13} className="theme-chip-check" />}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Compact Editor Quick Bar */}
      <div className="section">
        <div className="editor-bar">
          <button
            type="button"
            className="action-btn"
            onClick={toggleEditor}
            disabled={busyAction === 'toggle'}
          >
            <Code2 size={15} />
            {busyAction === 'toggle'
              ? editorOpen
                ? 'Closing...'
                : 'Opening...'
              : editorOpen
                ? 'Close Editor'
                : 'Open Editor'}
          </button>

          <div className="meta-inline">
            <span>{defaultLanguageLabel}</span>
            <span>•</span>
            <span>{activeSiteCount} sites</span>
            <button type="button" className="link" onClick={openSettings}>
              Manage
            </button>
          </div>
        </div>

        <div className={`status-line ${statusTone === 'error' ? 'error' : ''}`} aria-live="polite">
          {status}
        </div>
      </div>
    </div>
  );
}

export default App;
