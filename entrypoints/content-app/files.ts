import { DEFAULT_SNIPPETS, LANGUAGE_META, type Language } from '../shared/settings';
import type { CodeFile } from './types';

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

export { ensureExtension, makeFile };
