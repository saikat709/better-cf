import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'better-cp',
    description: 'Floating Monaco sidebar for in-page coding',
  },
  webExt: { disabled: true },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
