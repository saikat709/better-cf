import type { Language } from '../src/shared/settings';

type WandboxCompileResponse = {
  status: string;
  signal: string;
  compiler_output: string;
  compiler_error: string;
  compiler_message: string;
  program_output: string;
  program_error: string;
  program_message: string;
  permlink: string;
  url: string;
};

type WandboxCompiler = {
  name: string;
  version: string;
  language: string;
  'display-name': string;
};

type WandboxRunResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  compile?: {
    stdout: string;
    stderr: string;
    exitCode: number | null;
  };
  signal?: string;
};

const COMPILE_URL = 'https://wandbox.org/api/compile.json';
const LIST_URL = 'https://wandbox.org/api/list.json';

const LANGUAGE_TARGETS: Record<Language, { language: string; prefer: string[]; avoid?: string[] }> = {
  c: { language: 'C', prefer: ['gcc-'], avoid: ['head'] },
  cpp: { language: 'C++', prefer: ['gcc-'], avoid: ['head'] },
  java: { language: 'Java', prefer: ['openjdk-'] },
  kotlin: { language: 'Kotlin', prefer: ['kotlin-', 'kotlinc-'] },
  python: { language: 'Python', prefer: ['cpython-'], avoid: ['pypy-'] },
  pypy: { language: 'Python', prefer: ['pypy-'] },
  javascript: { language: 'JavaScript', prefer: ['nodejs-'] },
  typescript: { language: 'TypeScript', prefer: ['typescript-'] },
  rust: { language: 'Rust', prefer: ['rust-'] },
  go: { language: 'Go', prefer: ['go-'] },
  csharp: { language: 'C#', prefer: ['dotnetcore-', 'mono-'] },
  ruby: { language: 'Ruby', prefer: ['ruby-'], avoid: ['mruby-'] },
  php: { language: 'PHP', prefer: ['php-'] },
  swift: { language: 'Swift', prefer: ['swift-'] },
  scala: { language: 'Scala', prefer: ['scala-'] },
  haskell: { language: 'Haskell', prefer: ['ghc-'] },
  ocaml: { language: 'OCaml', prefer: ['ocaml-'] },
  d: { language: 'D', prefer: ['ldc-', 'dmd-', 'gdc-'] },
  lua: { language: 'Lua', prefer: ['lua-'], avoid: ['luajit-'] },
};

let compilerPromise: Promise<Map<Language, WandboxCompiler>> | null = null;

const toSegments = (version: string) =>
  version
    .split(/[^0-9]+/)
    .map((part) => Number(part))
    .filter((value) => Number.isFinite(value));

const compareVersions = (a: string, b: string) => {
  const aParts = toSegments(a);
  const bParts = toSegments(b);
  const max = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < max; i += 1) {
    const left = aParts[i] ?? 0;
    const right = bParts[i] ?? 0;
    if (left !== right) return left - right;
  }
  return a.localeCompare(b);
};

const filterByPreference = (
  compilers: WandboxCompiler[],
  { prefer, avoid }: { prefer: string[]; avoid?: string[] },
): WandboxCompiler[] => {
  const avoidLower = (avoid ?? []).map((value) => value.toLowerCase());
  const filtered = compilers.filter((compiler) => {
    if (avoidLower.length === 0) return true;
    const name = compiler.name.toLowerCase();
    return !avoidLower.some((needle) => name.includes(needle));
  });

  const preferred = filtered.filter((compiler) =>
    prefer.some((prefix) => compiler.name.toLowerCase().startsWith(prefix.toLowerCase())),
  );
  return preferred.length > 0 ? preferred : filtered;
};

const selectLatestCompiler = (compilers: WandboxCompiler[]): WandboxCompiler | null => {
  if (compilers.length === 0) return null;
  const sorted = [...compilers].sort((a, b) => {
    const versionCompare = compareVersions(a.version, b.version);
    if (versionCompare !== 0) return versionCompare;
    return a.name.localeCompare(b.name);
  });
  return sorted[sorted.length - 1];
};

const loadCompilers = async (): Promise<Map<Language, WandboxCompiler>> => {
  if (!compilerPromise) {
    compilerPromise = fetch(LIST_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`Failed to load Wandbox compilers (${response.status})`);
        return response.json() as Promise<WandboxCompiler[]>;
      })
      .then((compilers) => {
        const resolved = new Map<Language, WandboxCompiler>();
        (Object.keys(LANGUAGE_TARGETS) as Language[]).forEach((language) => {
          const target = LANGUAGE_TARGETS[language];
          const candidates = compilers.filter((compiler) => compiler.language === target.language);
          const preferred = filterByPreference(candidates, target);
          const selected = selectLatestCompiler(preferred);
          if (selected) resolved.set(language, selected);
        });
        return resolved;
      });
  }
  return compilerPromise;
};

const toExitCode = (value: string): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const mergeOutput = (primary: string, secondary: string): string => {
  const trimmedPrimary = primary.trim();
  const trimmedSecondary = secondary.trim();
  if (!trimmedPrimary) return secondary;
  if (!trimmedSecondary) return primary;
  if (trimmedPrimary === trimmedSecondary) return primary;
  return `${primary}\n${secondary}`;
};

export const runWandbox = async (language: Language, code: string, stdin: string): Promise<WandboxRunResult> => {
  const compilers = await loadCompilers();
  const compiler = compilers.get(language);
  if (!compiler) {
    throw new Error(`Wandbox compiler unavailable for ${language}`);
  }

  const response = await fetch(COMPILE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      compiler: compiler.name,
      stdin,
      save: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`Wandbox request failed (${response.status})`);
  }

  const result = (await response.json()) as WandboxCompileResponse;
  const compileStdout = mergeOutput(result.compiler_output ?? '', result.compiler_message ?? '');
  const runStdout = mergeOutput(result.program_output ?? '', result.program_message ?? '');
  const exitCode = toExitCode(result.status ?? '');

  return {
    stdout: runStdout,
    stderr: result.program_error ?? '',
    exitCode,
    compile:
      compileStdout || result.compiler_error
        ? {
            stdout: compileStdout,
            stderr: result.compiler_error ?? '',
            exitCode: null,
          }
        : undefined,
    signal: result.signal ?? undefined,
  };
};
