import type { Language } from '../shared/settings';

type CodeFile = {
  id: string;
  name: string;
  language: Language;
  content: string;
  updatedAt: number;
};

type PersistedState = {
  key: 'session';
  activeFileId: string;
  input: string;
};

type EditorToggleDetail = {
  open?: boolean;
};

export type { CodeFile, PersistedState, EditorToggleDetail };
