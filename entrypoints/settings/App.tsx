import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Plus, RotateCcw, Save, Trash2, Trash2Icon, X } from 'lucide-react';
import './App.css';
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
} from '../shared/settings';

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

function App() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [activeTab, setActiveTab] = useState<'sites' | 'templates'>('sites');
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
    return;
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
    <div className="options-shell">
      <header className="header">
        <div className="eyebrow">better-cp</div>
        <h1 className="title">Settings</h1>
        <p className="subtitle">Control the default language, templates, and which sites show the editor icon.</p>
      </header>

      <section className="card">
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
      </section>

      <div className="tabs">
        <button
          type="button"
          className={`tab ${activeTab === 'sites' ? 'active' : ''}`}
          onClick={() => setActiveTab('sites')}
        >
          Active sites
        </button>
        <button
          type="button"
          className={`tab ${activeTab === 'templates' ? 'active' : ''}`}
          onClick={() => setActiveTab('templates')}
        >
          Templates
        </button>
      </div>

      {activeTab === 'sites' && (
        <section className="card">
          <div className="section-head">
            <div>
              <div className="card-title">Active sites</div>
              <p className="subtitle">Toggle the editor icon per site, or add new sites.</p>
            </div>
            <div className="section-actions">
              <div className="badge">{activeSites} enabled</div>
              <button type="button" className="action-btn flex flex-nowrap items-center gap-1" onClick={openAddModal}>
                <Plus size={14} />
                Add site
              </button>
            </div>
          </div>

          {true && (
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
                  <button type="button" className="icon-btn flex items-center justify-center hover:bg-red-700" onClick={() => removeSite(site.id)} aria-label="Delete site">
                    <Trash2Icon size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === 'templates' && (
        <section className="card">
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
                  {isOpen && (
                    <div className="template-body">
                      <div className="template-actions">
                        <button type="button" className="action-btn ghost flex gap-1 items-center" onClick={() => resetTemplate(language)}>
                          <RotateCcw size={12} />
                          Reset
                        </button>
                        {templateDirty[language] && (
                          <button
                            type="button"
                            className="action-btn flex gap-1 items-center"
                            onClick={() => saveTemplate(language)}
                            disabled={templateSaving[language]}
                          >
                            {templateSaving[language] ? 'Saving...' : 'Save'}
                            <Save size={12} />
                          </button>
                        )}
                      </div>
                      <textarea
                        value={templatesDraft[language] ?? ''}
                        onChange={(event) => updateTemplate(language, event.target.value)}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {isModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <div className='flex w-full justify-between'>
                <div className="modal-title">Add site</div>
                <button type="button" className="icon-btn flex items-center justify-center" onClick={closeAddModal} aria-label="Close modal">
                    <X size={14} />
                </button>
            </div>
            <p className="subtitle">Paste the base URL (example.com).</p>
            <input
              type="text"
              value={newSite}
              disabled={true}
              onChange={(event) => {
                setNewSite(event.target.value);
                setNewSiteError('');
              }}
              className="modal-input"
              placeholder="codeforces.com"
            />
            {newSiteError && <div className="error-text">{newSiteError}</div>}
            <div className="modal-actions">
              <button type="button" className="action-btn ghost" onClick={closeAddModal}>
                Cancel
              </button>
              <button type="button" className="action-btn" onClick={addSiteFromModal}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;