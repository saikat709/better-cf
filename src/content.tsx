import '@/assets/content.css';
import contentCssText from '@/assets/content.css?inline';

import 'monaco-editor/esm/vs/language/json/monaco.contribution';
import 'monaco-editor/esm/vs/language/css/monaco.contribution';
import 'monaco-editor/esm/vs/language/html/monaco.contribution';
import 'monaco-editor/esm/vs/language/typescript/monaco.contribution';
import 'monaco-editor/esm/vs/basic-languages/python/python.contribution';
import 'monaco-editor/esm/vs/basic-languages/cpp/cpp.contribution';
import 'monaco-editor/esm/vs/basic-languages/java/java.contribution';
import 'monaco-editor/esm/vs/basic-languages/rust/rust.contribution';
import 'monaco-editor/esm/vs/basic-languages/go/go.contribution';
import 'monaco-editor/esm/vs/basic-languages/kotlin/kotlin.contribution';
import 'monaco-editor/esm/vs/basic-languages/csharp/csharp.contribution';
import 'monaco-editor/esm/vs/basic-languages/ruby/ruby.contribution';
import 'monaco-editor/esm/vs/basic-languages/php/php.contribution';
import 'monaco-editor/esm/vs/basic-languages/swift/swift.contribution';
import 'monaco-editor/esm/vs/basic-languages/scala/scala.contribution';
import 'monaco-editor/esm/vs/basic-languages/lua/lua.contribution';

import monacoCssText from 'monaco-editor/min/vs/editor/editor.main.css?inline';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

import ReactDOM from 'react-dom/client';
import ContentApp from './content-app/ContentApp';
import { STATUS_MESSAGE, TOGGLE_EVENT } from './content-app/constants';
import { getLatestAllowedState, getLatestOpenState, setLatestOpenState } from './content-app/runtimeState';
import type { EditorToggleDetail } from './content-app/types';

self.MonacoEnvironment = {
  getWorker(_, label) {
    if (label === 'json') return new jsonWorker();
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker();
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker();
    if (label === 'typescript' || label === 'javascript') return new tsWorker();
    return new editorWorker();
  },
};

export default defineContentScript({
  matches: ['<all_urls>'],
  cssInjectionMode: 'manual',
  async main(ctx) {
    const host = document.createElement('div');
    host.id = 'better-cp-root';
    host.style.all = 'initial';
    document.documentElement.append(host);

    const shadow = host.attachShadow({
      mode: 'open',
    });

    const baseStyle = document.createElement('style');
    baseStyle.textContent = `
      :host { all: initial; }
      #better-cp-ui-root, #better-cp-ui-root * {
        box-sizing: border-box;
      }
      #better-cp-ui-root {
        font-size: 15px !important;
        line-height: 1.4 !important;
        font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif !important;
      }
      #better-cp-ui-root button,
      #better-cp-ui-root input,
      #better-cp-ui-root select,
      #better-cp-ui-root textarea,
      #better-cp-ui-root label {
        font-size: 14px !important;
        font-family: inherit !important;
        color: inherit !important;
      }
      #better-cp-ui-root .bcp-title { font-size: 16px !important; }
    `;
    const contentStylesheet = document.createElement('style');
    contentStylesheet.textContent = contentCssText;
    const monacoStylesheet = document.createElement('style');
    monacoStylesheet.textContent = monacoCssText;
    const container = document.createElement('div');
    shadow.append(baseStyle, contentStylesheet, monacoStylesheet, container);

    const root = ReactDOM.createRoot(container);
    root.render(<ContentApp />);

    const onRuntimeMessage = async (message: unknown) => {
      if (!message || typeof message !== 'object') return;
      const payload = message as { type?: string; open?: boolean };

      if (payload.type === STATUS_MESSAGE) {
        return { ok: true, isOpen: getLatestOpenState(), allowed: getLatestAllowedState() };
      }

      if (payload.type !== TOGGLE_EVENT) return;

      if (!getLatestAllowedState()) {
        return { ok: false, isOpen: false, message: 'Editor is disabled for this site.' };
      }

      const nextOpen = typeof payload.open === 'boolean' ? payload.open : !getLatestOpenState();
      setLatestOpenState(nextOpen);

      window.dispatchEvent(
        new CustomEvent<EditorToggleDetail>(TOGGLE_EVENT, {
          detail: { open: nextOpen },
        }),
      );
      return { ok: true, isOpen: nextOpen };
    };

    browser.runtime.onMessage.addListener(onRuntimeMessage);

    ctx.onInvalidated(() => {
      browser.runtime.onMessage.removeListener(onRuntimeMessage);
      root.unmount();
      host.remove();
    });
  },
});
