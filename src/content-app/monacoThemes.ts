import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api.js';

let registered = false;

export const registerCustomMonacoThemes = (monaco: typeof Monaco): void => {
  if (registered) return;
  registered = true;

  monaco.editor.defineTheme('bcp-midnight', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '64748b', fontStyle: 'italic' },
      { token: 'keyword', foreground: '60a5fa' },
      { token: 'string', foreground: '34d399' },
      { token: 'number', foreground: 'fbbf24' },
    ],
    colors: {
      'editor.background': '#090d16',
      'editor.foreground': '#e2e8f0',
      'editorLineNumber.foreground': '#475569',
      'editor.selectionBackground': '#1e3a8a66',
      'editor.lineHighlightBackground': '#11182780',
    },
  });

  monaco.editor.defineTheme('bcp-dracula', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '6272a4', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'ff79c6' },
      { token: 'string', foreground: 'f1fa8c' },
      { token: 'number', foreground: 'bd93f9' },
      { token: 'type', foreground: '8be9fd' },
    ],
    colors: {
      'editor.background': '#21222c',
      'editor.foreground': '#f8f8f2',
      'editorLineNumber.foreground': '#6272a4',
      'editor.selectionBackground': '#44475a',
      'editor.lineHighlightBackground': '#282a36',
    },
  });

  monaco.editor.defineTheme('bcp-nord', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '616e88', fontStyle: 'italic' },
      { token: 'keyword', foreground: '81a1c1' },
      { token: 'string', foreground: 'a3be8c' },
      { token: 'number', foreground: 'b48ead' },
      { token: 'type', foreground: '8fbcbb' },
    ],
    colors: {
      'editor.background': '#242933',
      'editor.foreground': '#eceff4',
      'editorLineNumber.foreground': '#4c566a',
      'editor.selectionBackground': '#434c5e88',
      'editor.lineHighlightBackground': '#2e3440',
    },
  });

  monaco.editor.defineTheme('bcp-catppuccin-mocha', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '6c7086', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'cba6f7' },
      { token: 'string', foreground: 'a6e3a1' },
      { token: 'number', foreground: 'fab387' },
      { token: 'type', foreground: '89b4fa' },
    ],
    colors: {
      'editor.background': '#11111b',
      'editor.foreground': '#cdd6f4',
      'editorLineNumber.foreground': '#585b70',
      'editor.selectionBackground': '#313244',
      'editor.lineHighlightBackground': '#1e1e2e',
    },
  });
};
