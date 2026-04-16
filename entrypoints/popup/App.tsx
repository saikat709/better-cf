import { useEffect, useState } from 'react';
import './App.css';
import { DEFAULT_SETTINGS, LANGUAGE_META, loadSettings, type Settings } from '../shared/settings';

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
        message: open ? 'Editor opened on the current tab.' : 'Editor closed on the current tab.',
      };
    }

    return { ok: true, isOpen: responseOpen, message: 'Editor toggled on the current tab.' };
  } catch (error) {
    return {
      ok: false,
      message:
        'Could not reach the page script. Open a normal website tab and try again. ' +
        `(${getErrorMessage(error)})`,
    };
  }
};

const fetchEditorStatus = async (): Promise<ActionResult> => {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return { ok: false, message: 'No active tab found in this window.' };

    const response = (await browser.tabs.sendMessage(tab.id, { type: STATUS_MESSAGE })) as
      | { ok?: boolean; isOpen?: boolean; message?: string }
      | undefined;

    if (typeof response?.isOpen === 'boolean') {
      return {
        ok: true,
        isOpen: response.isOpen,
        message: response.isOpen ? 'Editor is open on the current tab.' : 'Editor is closed on the current tab.',
      };
    }

    return { ok: false, message: response?.message ?? 'Unable to read editor status.' };
  } catch (error) {
    return {
      ok: false,
      message:
        'Could not reach the page script. Open a normal website tab and try again. ' +
        `(${getErrorMessage(error)})`,
    };
  }
};

function App() {
  const [status, setStatus] = useState('Ready. Use the actions below for the current tab.');
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
      setStatusTone(result.ok ? 'ok' : 'error');
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

  const activeSiteCount = settings.sites.filter((site) => site.enabled).length;
  const defaultLanguageLabel = LANGUAGE_META[settings.defaultLanguage]?.label ?? settings.defaultLanguage;

  return (
    <div className="popup-shell">
      <div className="popup-head">
        <p className="eyebrow">better-cp</p>
        <h1 className="title">Editor Controls</h1>
        <p className="subtitle">Toggle the Monaco sidebar and manage your default setup.</p>
      </div>

      <div className="action-grid">
        <button
          type="button"
          className="action-btn primary"
          onClick={toggleEditor}
          disabled={busyAction !== null}
        >
          {busyAction === 'toggle'
            ? editorOpen
              ? 'Closing...'
              : 'Opening...'
            : editorOpen
              ? 'Close Editor'
              : 'Open Editor'}
        </button>
      </div>

      <div className={`status ${statusTone}`} aria-live="polite">
        {status}
      </div>

      <div className="section">
        <div className="section-head">
          <div>
            <div className="section-title">Active Sites</div>
            <div className="section-meta">{activeSiteCount} Active Sites</div>
          </div>
          <div className="section-actions">
            <button type="button" className="mini-btn" onClick={openSettings}>
              + Add
            </button>
            <button type="button" className="mini-btn ghost" onClick={openSettings}>
              Manage
            </button>
          </div>
        </div>

        <div className="row">
          <span className="label">Default language</span>
          <span className="value">{defaultLanguageLabel}</span>
          <button type="button" className="link" onClick={openSettings}>
            Edit
          </button>
        </div>
      </div>

      <p className="hint">Tip: the editor can only run on sites where the toggle is enabled.</p>
    </div>
  );
}

export default App;
