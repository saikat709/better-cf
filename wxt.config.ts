import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  entrypointsDir: 'src',
  manifest: {
    name: 'BetterCF',
    description: 'Make codeforces better again.',
    host_permissions: ['https://emkc.org/*', "https://wandbox.org/*"],
    browser_specific_settings: {
      gecko: {
        data_collection_permissions: {
          required: ['none'],
        },
      },
    },
  },
  webExt: { disabled: true },
  vite: () => ({
    plugins: [tailwindcss()],
    build: {
      rolldownOptions: {
        checks: {
          pluginTimings: false,
        },
      },
    },
  }),
});
