export type WebsiteThemeId =
  | 'default'
  | 'midnight'
  | 'dracula'
  | 'nord'
  | 'catppuccin-mocha'
  | 'monokai'
  | 'solarized-light';

export type SidebarThemeId =
  | 'dark-slate'
  | 'midnight'
  | 'dracula'
  | 'nord'
  | 'catppuccin-mocha'
  | 'light';

export type WebsiteThemeTokens = {
  '--bcp-cf-bg': string;
  '--bcp-cf-surface': string;
  '--bcp-cf-surface-alt': string;
  '--bcp-cf-surface-hover': string;
  '--bcp-cf-header-bg': string;
  '--bcp-cf-text': string;
  '--bcp-cf-text-muted': string;
  '--bcp-cf-heading': string;
  '--bcp-cf-link': string;
  '--bcp-cf-link-hover': string;
  '--bcp-cf-border': string;
  '--bcp-cf-input-bg': string;
  '--bcp-cf-input-border': string;
  '--bcp-cf-code-bg': string;
  '--bcp-cf-code-text': string;
  '--bcp-cf-pre-header': string;
  '--bcp-cf-accent': string;
  '--bcp-cf-accent-text': string;
  '--bcp-cf-selection': string;
  '--bcp-cf-table-stripe': string;
  '--bcp-cf-sample-even': string;
  '--bcp-cf-sample-odd': string;
};

export type WebsiteThemePreset = {
  id: WebsiteThemeId;
  name: string;
  description: string;
  isDark: boolean;
  swatches: [string, string, string, string];
  tokens: WebsiteThemeTokens | null;
};

export type SidebarThemeTokens = {
  '--bcp-sb-bg': string;
  '--bcp-sb-surface': string;
  '--bcp-sb-surface-alt': string;
  '--bcp-sb-border': string;
  '--bcp-sb-text': string;
  '--bcp-sb-text-muted': string;
  '--bcp-sb-accent': string;
  '--bcp-sb-accent-soft': string;
  '--bcp-sb-accent-text': string;
  '--bcp-sb-run-bg': string;
  '--bcp-sb-run-hover': string;
  '--bcp-sb-launcher-bg': string;
  '--bcp-sb-launcher-text': string;
};

export type SidebarThemePreset = {
  id: SidebarThemeId;
  name: string;
  description: string;
  isDark: boolean;
  monacoTheme: string;
  swatches: [string, string, string, string];
  tokens: SidebarThemeTokens;
};
