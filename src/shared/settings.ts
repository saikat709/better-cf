export type Language =
  | 'c'
  | 'cpp'
  | 'java'
  | 'kotlin'
  | 'python'
  | 'pypy'
  | 'javascript'
  | 'typescript'
  | 'rust'
  | 'go'
  | 'csharp'
  | 'ruby'
  | 'php'
  | 'swift'
  | 'scala'
  | 'haskell'
  | 'ocaml'
  | 'd'
  | 'lua';

export type SiteEntry = {
  id: string;
  host: string;
  enabled: boolean;
};

export type Settings = {
  version: 1;
  defaultLanguage: Language;
  templates: Record<Language, string>;
  sites: SiteEntry[];
};

export const LANGUAGE_META: Record<Language, { label: string; ext: string }> = {
  c: { label: 'C', ext: 'c' },
  cpp: { label: 'C++', ext: 'cpp' },
  java: { label: 'Java', ext: 'java' },
  kotlin: { label: 'Kotlin', ext: 'kt' },
  javascript: { label: 'JavaScript', ext: 'js' },
  typescript: { label: 'TypeScript', ext: 'ts' },
  python: { label: 'Python', ext: 'py' },
  pypy: { label: 'PyPy', ext: 'py' },
  rust: { label: 'Rust', ext: 'rs' },
  go: { label: 'Go', ext: 'go' },
  csharp: { label: 'C#', ext: 'cs' },
  ruby: { label: 'Ruby', ext: 'rb' },
  php: { label: 'PHP', ext: 'php' },
  swift: { label: 'Swift', ext: 'swift' },
  scala: { label: 'Scala', ext: 'scala' },
  haskell: { label: 'Haskell', ext: 'hs' },
  ocaml: { label: 'OCaml', ext: 'ml' },
  d: { label: 'D', ext: 'd' },
  lua: { label: 'Lua', ext: 'lua' },
};

export const DEFAULT_SNIPPETS: Record<Language, string> = {
  c: `#include <stdio.h>\n\nint main() {\n    printf("Hello, better-cp!\\n");\n    return 0;\n}\n`,
  cpp: `#include <iostream>\n\nint main() {\n    std::cout << "Hello, better-cp!" << std::endl;\n    return 0;\n}\n`,
  java: `public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, better-cp!");\n    }\n}\n`,
  kotlin: `fun main() {\n    println("Hello, better-cp!")\n}\n`,
  python: `def main(user_input):\n    print("Input:", user_input)\n    return "Python template"\n`,
  pypy: `def main(user_input):\n    print("Input:", user_input)\n    return "PyPy template"\n`,
  javascript: `function main(input) {\n  console.log('Input:', input);\n  return 'JS executed';\n}\n\nmain(input);`,
  typescript: `type UserInput = string;\n\nfunction main(input: UserInput): string {\n  return \`TS says: \${input}\`;\n}\n\nmain(input as UserInput);`,
  rust: `fn main() {\n    println!("Hello, better-cp!");\n}\n`,
  go: `package main\n\nimport "fmt"\n\nfunc main() {\n    fmt.Println("Hello, better-cp!")\n}\n`,
  csharp: `using System;\n\nclass Program {\n    static void Main() {\n        Console.WriteLine("Hello, better-cp!");\n    }\n}\n`,
  ruby: `puts "Hello, better-cp!"\n`,
  php: `<?php\n\necho "Hello, better-cp!\\n";\n`,
  swift: `import Foundation\n\nprint("Hello, better-cp!")\n`,
  scala: `object Main extends App {\n    println("Hello, better-cp!")\n}\n`,
  haskell: `main :: IO ()\nmain = putStrLn "Hello, better-cp!"\n`,
  ocaml: `print_endline "Hello, better-cp!";;\n`,
  d: `import std.stdio;\n\nvoid main() {\n    writeln("Hello, better-cp!");\n}\n`,
  lua: `print("Hello, better-cp!")\n`,
};

export const DEFAULT_SITES: SiteEntry[] = [
  { id: 'cf', host: 'codeforces.com', enabled: true },
  { id: 'vjudge', host: 'vjudge.net', enabled: true },
  { id: 'atcoder', host: 'atcoder.jp', enabled: true },
  { id: 'codechef', host: 'codechef.com', enabled: true },
  { id: 'cses', host: 'cses.fi', enabled: true },
  { id: 'leetcode', host: 'leetcode.com', enabled: true },
  { id: 'hackerrank', host: 'hackerrank.com', enabled: false },
  { id: 'hackerearth', host: 'hackerearth.com', enabled: false },
];

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  defaultLanguage: 'cpp',
  templates: { ...DEFAULT_SNIPPETS },
  sites: DEFAULT_SITES,
};

const SETTINGS_KEY = 'better-cp:settings';

type ExtensionApi = typeof globalThis & { browser?: unknown; chrome?: unknown };

const getExtensionApi = () => {
  const root = globalThis as ExtensionApi;
  const api = root.browser ?? root.chrome;
  return api ?? null;
};

type StorageApi = {
  local?: {
    get: (key: string) => Promise<Record<string, unknown>>;
    set: (items: Record<string, unknown>) => Promise<void>;
  };
  onChanged?: {
    addListener: (handler: () => void) => void;
    removeListener: (handler: () => void) => void;
  };
};

export const getStorageApi = (): StorageApi | null => {
  const api = getExtensionApi();
  if (!api || typeof api !== 'object') return null;
  const storage = (api as { storage?: StorageApi }).storage;
  return storage ?? null;
};

export const normalizeSiteInput = (value: string): string => {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return '';
  try {
    const withScheme = trimmed.includes('://') ? trimmed : `https://${trimmed}`;
    const parsed = new URL(withScheme);
    return parsed.host.replace(/^www\./, '');
  } catch {
    return trimmed.replace(/^www\./, '').split('/')[0];
  }
};

export const isSiteAllowed = (host: string, sites: SiteEntry[]): boolean => {
  const normalizedHost = host.toLowerCase();
  return sites.some((site) => {
    if (!site.enabled) return false;
    const normalizedSite = normalizeSiteInput(site.host);
    if (!normalizedSite) return false;
    if (normalizedSite.startsWith('*.')) {
      const suffix = normalizedSite.slice(1);
      return normalizedHost.endsWith(suffix);
    }
    return normalizedHost === normalizedSite || normalizedHost.endsWith(`.${normalizedSite}`);
  });
};

export const loadSettings = async (): Promise<Settings> => {
  const storage = getStorageApi()?.local;
  if (!storage) return DEFAULT_SETTINGS;
  const stored = (await storage.get(SETTINGS_KEY))[SETTINGS_KEY] as Settings | undefined;
  if (!stored) return DEFAULT_SETTINGS;
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    templates: { ...DEFAULT_SETTINGS.templates, ...stored.templates },
    sites: stored.sites?.length ? stored.sites : DEFAULT_SETTINGS.sites,
  };
};

export const saveSettings = async (next: Settings): Promise<void> => {
  const storage = getStorageApi()?.local;
  if (!storage) return;
  await storage.set({ [SETTINGS_KEY]: next });
};
