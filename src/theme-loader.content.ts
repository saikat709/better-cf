import { getStorageApi, loadSettings } from './shared/settings';
import {
  applyWebsiteThemeToDocument,
  readCachedWebsiteTheme,
  writeCachedWebsiteTheme,
} from './shared/themes/applyWebsiteTheme';
import { CODEFORCES_URL_MATCHES, isCodeforcesHost } from './shared/themes/mirrors';

export default defineContentScript({
  matches: [...CODEFORCES_URL_MATCHES],
  runAt: 'document_start',
  main(ctx) {
    if (!isCodeforcesHost(window.location.hostname)) return;

    const cached = readCachedWebsiteTheme();
    if (cached) {
      applyWebsiteThemeToDocument(cached.theme, cached.dimImages);
    }

    const syncFromSettings = async () => {
      try {
        const settings = await loadSettings();
        applyWebsiteThemeToDocument(settings.websiteTheme, settings.dimImagesInDarkMode);
        writeCachedWebsiteTheme(settings.websiteTheme, settings.dimImagesInDarkMode);
      } catch {
        // Keep cached or default appearance if storage fails
      }
    };

    void syncFromSettings();

    const storage = getStorageApi();
    const onChanged = storage?.onChanged;
    if (onChanged) {
      const handleChange = () => {
        void syncFromSettings();
      };
      onChanged.addListener(handleChange);
      ctx.onInvalidated(() => {
        onChanged.removeListener(handleChange);
      });
    }
  },
});
