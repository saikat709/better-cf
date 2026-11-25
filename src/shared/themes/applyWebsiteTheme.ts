import codeforcesCssText from './codeforces.css?inline';
import { WEBSITE_THEMES } from './presets';
import type { WebsiteThemeId } from './types';

const STYLE_ELEMENT_ID = 'better-cf-theme-style';
const CACHE_KEY = 'bcp-cf-website-theme-cache';

type CachedTheme = {
  theme: WebsiteThemeId;
  dimImages: boolean;
};

const buildThemeCss = (themeId: WebsiteThemeId): string => {
  const preset = WEBSITE_THEMES[themeId];
  if (!preset || !preset.tokens) return '';

  const vars = Object.entries(preset.tokens)
    .map(([key, value]) => `  ${key}: ${value};`)
    .join('\n');

  return `html[data-bcp-cf-theme="${themeId}"] {\n${vars}\n}\n\n${codeforcesCssText}`;
};

export const applyWebsiteThemeToDocument = (themeId: WebsiteThemeId, dimImagesInDarkMode: boolean): void => {
  const root = document.documentElement;
  if (!root) return;

  const preset = WEBSITE_THEMES[themeId] ?? WEBSITE_THEMES.default;

  if (preset.id === 'default' || !preset.tokens) {
    root.removeAttribute('data-bcp-cf-theme');
    root.removeAttribute('data-bcp-cf-dark');
    root.removeAttribute('data-bcp-cf-dim-images');
    document.getElementById(STYLE_ELEMENT_ID)?.remove();
    return;
  }

  root.setAttribute('data-bcp-cf-theme', preset.id);
  root.setAttribute('data-bcp-cf-dark', String(preset.isDark));
  root.setAttribute('data-bcp-cf-dim-images', String(dimImagesInDarkMode));

  let styleEl = document.getElementById(STYLE_ELEMENT_ID) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = STYLE_ELEMENT_ID;
    (document.head ?? root).appendChild(styleEl);
  }
  const nextCss = buildThemeCss(preset.id);
  if (styleEl.textContent !== nextCss) {
    styleEl.textContent = nextCss;
  }
};

export const readCachedWebsiteTheme = (): CachedTheme | null => {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedTheme>;
    if (!parsed.theme || !(parsed.theme in WEBSITE_THEMES)) return null;
    return {
      theme: parsed.theme,
      dimImages: typeof parsed.dimImages === 'boolean' ? parsed.dimImages : true,
    };
  } catch {
    return null;
  }
};

export const writeCachedWebsiteTheme = (theme: WebsiteThemeId, dimImages: boolean): void => {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify({ theme, dimImages }));
  } catch {
    // Ignore storage quota or private mode restrictions
  }
};
