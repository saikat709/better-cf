# BetterCF (`better-cf`)

BetterCF is a browser extension built with [WXT](https://wxt.dev/), React, TypeScript, Tailwind CSS, and Monaco Editor that enhances the Codeforces (and other competitive programming sites) experience with an in-page coding sidebar, remote code execution, sample test runner, and customizable themes.

## Features

- **In-Page Monaco Editor Sidebar**: Toggle with the floating button or `Alt+E`. Includes multi-file tabs (double-click to rename), template reset, copy code, resizable width (persisted), and support for 19 languages (`C`, `C++`, `Java`, `Kotlin`, `Python`, `PyPy`, `JavaScript`, `TypeScript`, `Rust`, `Go`, `C#`, `Ruby`, `PHP`, `Swift`, `Scala`, `Haskell`, `OCaml`, `D`, `Lua`).
- **Code Execution & Sample Test Runner**:
  - Run code with `Ctrl+Enter` / `Cmd+Enter` using Wandbox with automatic Piston fallback, 15s timeout, and cancellation support.
  - Automatically detects Codeforces `.sample-test` cases on problem pages and lets you run all samples or load any sample into Stdin.
  - Resizable Input/Output panel with status badges, execution timing, and multi-line `<pre>` output.
- **Codeforces Website Themes (All Mirrors)**:
  - Apply curated themes (`Default`, `Midnight Slate`, `Dracula`, `Nord`, `Catppuccin Mocha`, `Monokai`, `Solarized Light`) across `codeforces.com`, `codeforc.es`, `codeforces.ml`, `codeforces.ru`, and subdomains.
  - Uses `document_start` injection with a `localStorage` cache to prevent white-screen flash on page load, while preserving user rating and verdict colors.
- **Independent Sidebar & Monaco Themes**:
  - Customize the BetterCF sidebar and Monaco editor (`Dark Slate`, `Midnight`, `Dracula`, `Nord`, `Catppuccin Mocha`, `Clean Light`) independently from the Codeforces website theme.
- **Popup & Settings Page**:
  - Quick-switch themes and toggle the editor from the extension popup.
  - Manage active sites, per-language starter templates, and themes in the Settings page.

## Tech Stack

- **Framework**: WXT (`wxt`)
- **UI**: React 19, Tailwind CSS v4, Framer Motion, Lucide React
- **Editor**: Monaco Editor (`monaco-editor`)
- **Language**: TypeScript

## Getting Started

```bash
npm install
```

### Available Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Start WXT dev server for Chrome (MV3) |
| `npm run dev:firefox` | Start WXT dev server for Firefox (MV2) |
| `npm run build` | Build production Chrome (MV3) extension in `.output/chrome-mv3` |
| `npm run build:firefox` | Build production Firefox (MV2) extension in `.output/firefox-mv2` |
| `npm run zip` | Package Chrome extension zip |
| `npm run zip:firefox` | Package Firefox extension zip |
| `npm run compile` | Run TypeScript type-checking (`tsc --noEmit`) |

---

## Loading the Extension in Dev Mode

> Note: `wxt.config.ts` sets `webExt: { disabled: true }`, so you load the generated output directory manually in your browser.

### Chrome (MV3)

1. Start the dev server (or create a production build):
   ```bash
   npm run dev
   ```
   *(Or `npm run build` for a production build.)*
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked**.
5. Select the output folder:
   - `.output/chrome-mv3-dev` (when using `npm run dev`)
   - `.output/chrome-mv3` (when using `npm run build`)

### Firefox (MV2)

1. Start the Firefox dev server (or create a production build):
   ```bash
   npm run dev:firefox
   ```
   *(Or `npm run build:firefox` for a production build.)*
2. Open `about:debugging#/runtime/this-firefox` in Firefox.
3. Click **Load Temporary Add-on...**.
4. Select the `manifest.json` file inside the output folder:
   - `.output/firefox-mv2-dev/manifest.json` (when using `npm run dev:firefox`)
   - `.output/firefox-mv2/manifest.json` (when using `npm run build:firefox`)
