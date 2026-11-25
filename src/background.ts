export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: unknown) => {
    if (message && typeof message === 'object' && (message as { type?: string }).type === 'better-cp:open-settings') {
      void browser.tabs.create({ url: browser.runtime.getURL('/settings.html') });
      return Promise.resolve({ ok: true });
    }
    return undefined;
  });
});
