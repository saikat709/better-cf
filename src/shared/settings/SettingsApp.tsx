import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import './SettingsApp.css';
import {
  DEFAULT_SETTINGS,
  DEFAULT_SNIPPETS,
  LANGUAGE_META,
  loadSettings,
  normalizeSiteInput,
  saveSettings,
  type Language,
  type Settings,
  type SiteEntry,
} from '../settings';
import { Collapse, SettingsCard, SettingsHeader, SettingsModal, SettingsShell, SettingsTabs } from './SettingsComponents';

const getId = () => (crypto.randomUUID ? crypto.randomUUID() : `site-${Date.now()}`);
const LANGUAGES = Object.keys(LANGUAGE_META) as Language[];

const initTemplateDirty = (): Record<Language, boolean> =>
  LANGUAGES.reduce(
    (acc, language) => {
      acc[language] = false;
      return acc;
    },
    {} as Record<Language, boolean>,
  );

const tabs = [
  { value: 'sites', label: 'Active sites' },
  { value: 'templates', label: 'Templates' },
] as const;

type ActiveTab = (typeof tabs)[number]['value'];

function SettingsApp() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [activeTab, setActiveTab] = useState<ActiveTab>('sites');
  const [expandedTemplate, setExpandedTemplate] = useState<Language | null>(null);
  const [templatesDraft, setTemplatesDraft] = useState<Settings['templates']>(DEFAULT_SETTINGS.templates);
  const [templateDirty, setTemplateDirty] = useState<Record<Language, boolean>>(initTemplateDirty());
  const [templateSaving, setTemplateSaving] = useState<Record<Language, boolean>>(initTemplateDirty());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newSite, setNewSite] = useState('');
  const [newSiteError, setNewSiteError] = useState('');
  const hydratedRef = useRef(false);
  const skipAutosaveRef = useRef(false);

  useEffect(() => {
    void loadSettings().then((next) => {
      setSettings(next);
      setTemplatesDraft(next.templates);
      setTemplateDirty(initTemplateDirty());
      setTemplateSaving(initTemplateDirty());
      hydratedRef.current = true;
    });
  }, []);

  useEffect(() => {
    if (!hydratedRef.current) return;
    if (skipAutosaveRef.current) {
      skipAutosaveRef.current = false;
      return;
    }
    const timeout = window.setTimeout(() => {
      void saveSettings(settings);
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [settings]);

  const activeSites = useMemo(() => settings.sites.filter((site) => site.enabled).length, [settings.sites]);

  const updateSite = (id: string, updater: (site: SiteEntry) => SiteEntry) => {
    setSettings((prev) => ({
      ...prev,
      sites: prev.sites.map((site) => (site.id === id ? updater(site) : site)),
    }));
  };

  const removeSite = (id: string) => {
    setSettings((prev) => ({
      ...prev,
      sites: prev.sites.filter((site) => site.id !== id),
    }));
  };

  const updateTemplate = (language: Language, value: string) => {
    setTemplatesDraft((prev) => ({ ...prev, [language]: value }));
    setTemplateDirty((prev) => ({ ...prev, [language]: true }));
  };

  const saveTemplate = async (language: Language) => {
    if (!templateDirty[language] || templateSaving[language]) return;
    const nextSettings = { ...settings, templates: { ...templatesDraft } };
    setTemplateSaving((prev) => ({ ...prev, [language]: true }));
    setTemplateDirty((prev) => ({ ...prev, [language]: false }));
    skipAutosaveRef.current = true;
    setSettings(nextSettings);
    await saveSettings(nextSettings);
    setTemplateSaving((prev) => ({ ...prev, [language]: false }));
  };

  const resetTemplate = (language: Language) => {
    updateTemplate(language, DEFAULT_SNIPPETS[language]);
  };

  const openAddModal = () => {
    setNewSite('');
    setNewSiteError('');
    setIsModalOpen(true);
  };

  const closeAddModal = () => {
    setIsModalOpen(false);
    setNewSiteError('');
  };

  const addSiteFromModal = () => {
    const host = normalizeSiteInput(newSite);
    if (!host) {
      setNewSiteError('Enter a valid base URL.');
      return;
    }
    setSettings((prev) => ({
      ...prev,
      sites: [...prev.sites, { id: getId(), host, enabled: true }],
    }));
    closeAddModal();
  };

  return (
    <SettingsShell>
      <SettingsHeader
        eyebrow="better-cp"
        title="Settings"
        subtitle="Control the default language, templates, and which sites show the editor icon."
      />

      <SettingsCard>
        <div className="row inline">
          <div>
            <div className="card-title">Default language</div>
            <p className="subtitle">Used when you create a new file in the sidebar.</p>
          </div>
          <select
            className="select"
            value={settings.defaultLanguage}
            onChange={(event) =>
              setSettings((prev) => ({
                ...prev,
                defaultLanguage: event.target.value as Language,
              }))
            }
          >
            {(Object.keys(LANGUAGE_META) as Language[]).map((language) => (
              <option key={language} value={language}>
                {LANGUAGE_META[language].label}
              </option>
            ))}
          </select>
        </div>
      </SettingsCard>

      <SettingsTabs active={activeTab} tabs={tabs} onChange={setActiveTab} />

      {activeTab === 'sites' && (
        <SettingsCard>
          <div className="section-head">
            <div>
              <div className="card-title">Active sites</div>
              <p className="subtitle">Toggle the editor icon per site, or add new sites.</p>
            </div>
            <div className="section-actions">
              <div className="badge">{activeSites} enabled</div>
              <button type="button" className="action-btn" onClick={openAddModal}>
                <span className="flex items-center gap-1">
                  <Plus size={14} />
                  Add site
                </span>
              </button>
            </div>
          </div>

          <div className="site-list">
            {settings.sites.map((site) => (
              <div key={site.id} className="site-row">
                <input
                  type="text"
                  value={site.host}
                  onChange={(event) => updateSite(site.id, (value) => ({ ...value, host: event.target.value }))}
                />
                <button
                  type="button"
                  className={`toggle-btn ${site.enabled ? 'enabled' : 'disabled'}`}
                  onClick={() => updateSite(site.id, (value) => ({ ...value, enabled: !value.enabled }))}
                >
                  {site.enabled ? 'Enabled' : 'Disabled'}
                </button>
                <button
                  type="button"
                  className="icon-btn flex items-center justify-center"
                  onClick={() => removeSite(site.id)}
                  aria-label="Delete site"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </SettingsCard>
      )}

      {activeTab === 'templates' && (
        <SettingsCard>
          <div className="section-head">
            <div>
              <div className="card-title">Templates</div>
              <p className="subtitle">Click a language to edit its template.</p>
            </div>
          </div>

          <div className="template-list">
            {LANGUAGES.map((language) => {
              const isOpen = expandedTemplate === language;
              return (
                <div key={language} className="template-item">
                  <button
                    type="button"
                    className="template-toggle"
                    onClick={() => setExpandedTemplate(isOpen ? null : language)}
                  >
                    <span>{LANGUAGE_META[language].label}</span>
                    <ChevronRight className={isOpen ? 'chevron-icon open' : 'chevron-icon'} size={16} />
                  </button>
                  <Collapse isOpen={isOpen}>
                    <div className="template-body">
                      <div className="template-actions">
                        <button
                          type="button"
                          className="action-btn ghost"
                          onClick={() => resetTemplate(language)}
                        >
                          <span className="flex items-center gap-1">
                            <RotateCcw size={12} />
                            Reset
                          </span>
                        </button>
                        {templateDirty[language] && (
                          <button
                            type="button"
                            className="action-btn"
                            onClick={() => saveTemplate(language)}
                            disabled={templateSaving[language]}
                          >
                            <span className="flex items-center gap-1">
                              {templateSaving[language] ? 'Saving...' : 'Save'}
                              <Save size={12} />
                            </span>
                          </button>
                        )}
                      </div>
                      <textarea
                        value={templatesDraft[language] ?? ''}
                        onChange={(event) => updateTemplate(language, event.target.value)}
                      />
                    </div>
                  </Collapse>
                </div>
              );
            })}
          </div>
        </SettingsCard>
      )}

      <SettingsModal
        open={isModalOpen}
        title="Add site"
        onClose={closeAddModal}
        footer={
          <>
            <button type="button" className="action-btn ghost" onClick={closeAddModal}>
              Cancel
            </button>
            <button type="button" className="action-btn" onClick={addSiteFromModal}>
              Save
            </button>
          </>
        }
      >
        <p className="subtitle">Paste the base URL (example.com).</p>
        <input
          type="text"
          value={newSite}
          onChange={(event) => {
            setNewSite(event.target.value);
            setNewSiteError('');
          }}
          className="modal-input"
          placeholder="codeforces.com"
        />
        {newSiteError && <div className="error-text">{newSiteError}</div>}
      </SettingsModal>
    </SettingsShell>
  );
}

export default SettingsApp;
