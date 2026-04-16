import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Plus, RotateCcw, Save, Trash2, X } from 'lucide-react';
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
  const [sitesExpanded, setSitesExpanded] = useState(false);
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
    <div className="min-h-screen bg-slate-50/40 text-slate-900">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-5 py-10">
        <header className="flex flex-col gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.3em] text-teal-700">better-cp</span>
          <h1 className="text-3xl font-semibold text-slate-900">Settings</h1>
          <p className="text-sm text-slate-600">
            Control the default language, templates, and which sites show the editor icon.
          </p>
        </header>

        <section className="rounded-2xl border border-teal-200/60 bg-white/90 p-5 shadow-[0_14px_30px_rgba(15,23,42,0.08)]">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-base font-semibold text-slate-900">Default language</div>
              <p className="text-sm text-slate-600">Used when you create a new file in the sidebar.</p>
            </div>
            <select
              className="min-w-[160px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
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

        <div className="inline-flex w-fit items-center rounded-full border border-teal-200/70 bg-teal-900/10 p-1">
          {(['sites', 'templates'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                activeTab === tab ? 'bg-teal-700 text-white shadow-[0_8px_16px_rgba(15,118,110,0.25)]' : 'text-slate-700'
              }`}
            >
              {tab === 'sites' ? 'Active sites' : 'Templates'}
            </button>
          ))}
        </div>

        {activeTab === 'sites' && (
          <section className="rounded-2xl border border-teal-200/60 bg-white/90 p-5 shadow-[0_14px_30px_rgba(15,23,42,0.08)]">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-base font-semibold text-slate-900">Active sites</div>
                <p className="text-sm text-slate-600">Toggle the editor icon per site, or add new sites.</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-teal-700 px-3 py-1 text-xs font-semibold text-white">
                  {activeSites} enabled
                </span>
                <button
                  type="button"
                  onClick={openAddModal}
                  className="inline-flex items-center gap-2 rounded-full bg-teal-700 px-4 py-2 text-xs font-semibold text-white"
                >
                  <Plus size={14} />
                  Add site
                </button>
                <button
                  type="button"
                  onClick={() => setSitesExpanded((prev) => !prev)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-teal-200/70 text-slate-700"
                  aria-label={sitesExpanded ? 'Collapse sites' : 'Expand sites'}
                >
                  <ChevronRight className={`transition ${sitesExpanded ? 'rotate-90' : ''}`} size={16} />
                </button>
              </div>
            </div>

            {sitesExpanded && (
              <div className="mt-4 grid gap-3">
                {settings.sites.map((site) => (
                  <div
                    key={site.id}
                    className="grid items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 md:grid-cols-[1fr_auto_auto]"
                  >
                    <input
                      type="text"
                      value={site.host}
                      onChange={(event) => updateSite(site.id, (value) => ({ ...value, host: event.target.value }))}
                      className="w-full bg-transparent text-sm text-slate-800 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => updateSite(site.id, (value) => ({ ...value, enabled: !value.enabled }))}
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        site.enabled
                          ? 'bg-teal-700 text-white'
                          : 'border border-teal-700 text-teal-700'
                      }`}
                    >
                      {site.enabled ? 'Enabled' : 'Disabled'}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeSite(site.id)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-red-200 text-red-600"
                      aria-label="Delete site"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {activeTab === 'templates' && (
          <section className="rounded-2xl border border-teal-200/60 bg-white/90 p-5 shadow-[0_14px_30px_rgba(15,23,42,0.08)]">
            <div>
              <div className="text-base font-semibold text-slate-900">Templates</div>
              <p className="text-sm text-slate-600">Click a language to edit its template.</p>
            </div>

            <div className="mt-4 grid gap-3">
              {LANGUAGES.map((language) => {
                const isOpen = expandedTemplate === language;
                return (
                  <div key={language} className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-slate-900"
                      onClick={() => setExpandedTemplate(isOpen ? null : language)}
                    >
                      <span>{LANGUAGE_META[language].label}</span>
                      <ChevronRight className={`transition ${isOpen ? 'rotate-90' : ''}`} size={16} />
                    </button>
                    {isOpen && (
                      <div className="grid gap-3 border-t border-slate-200 bg-white/80 px-4 py-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            className="inline-flex items-center gap-2 rounded-full border border-teal-700 px-3 py-1 text-xs font-semibold text-teal-700"
                            onClick={() => resetTemplate(language)}
                          >
                            <RotateCcw size={12} />
                            Reset
                          </button>
                          {templateDirty[language] && (
                            <button
                              type="button"
                              className="inline-flex items-center gap-2 rounded-full bg-teal-700 px-3 py-1 text-xs font-semibold text-white"
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
                          className="min-h-[160px] w-full rounded-2xl border border-slate-200 bg-slate-950 p-3 font-mono text-xs text-slate-100"
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
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
            <div className="w-full max-w-md rounded-2xl border border-teal-200/60 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.2)]">
              <div className="flex items-center justify-between">
                <div className="text-base font-semibold text-slate-900">Add site</div>
                <button
                  type="button"
                  onClick={closeAddModal}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500"
                  aria-label="Close"
                >
                  <X size={16} />
                </button>
              </div>
              <p className="mt-2 text-sm text-slate-600">Paste the base URL (example.com).</p>
              <input
                type="text"
                value={newSite}
                onChange={(event) => {
                  setNewSite(event.target.value);
                  setNewSiteError('');
                }}
                className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                placeholder="codeforces.com"
              />
              {newSiteError && <div className="mt-2 text-xs font-semibold text-red-600">{newSiteError}</div>}
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeAddModal}
                  className="rounded-full border border-teal-700 px-4 py-2 text-xs font-semibold text-teal-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={addSiteFromModal}
                  className="rounded-full bg-teal-700 px-4 py-2 text-xs font-semibold text-white"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
