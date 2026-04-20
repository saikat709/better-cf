import type { Language } from '../entrypoints/shared/settings';

type PistonRuntime = {
  language: string;
  version: string;
  aliases?: string[];
};

type PistonExecuteResponse = {
  run?: {
    stdout?: string;
    stderr?: string;
    code?: number | null;
  };
  compile?: {
    stdout?: string;
    stderr?: string;
    code?: number | null;
  };
  message?: string;
};

type ResolvedRuntime = {
  language: string;
  version: string;
};

type PistonRunResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  compile?: {
    stdout: string;
    stderr: string;
    exitCode: number | null;
  };
};

const RUNTIMES_URL = 'https://emkc.org/api/v2/piston/runtimes';
const EXECUTE_URL = 'https://emkc.org/api/v2/piston/execute';

const TARGET_LANGUAGES: Record<Language, string> = {
  c: 'c',
  cpp: 'cpp',
  java: 'java',
  javascript: 'javascript',
  typescript: 'typescript',
  python: 'python',
};

let runtimesPromise: Promise<Map<Language, ResolvedRuntime>> | null = null;

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

const matchesLanguage = (runtime: PistonRuntime, target: string) => {
  if (runtime.language === target) return true;
  return runtime.aliases?.includes(target) ?? false;
};

const selectLatestRuntime = (runtimes: PistonRuntime[], target: string): ResolvedRuntime | null => {
  const candidates = runtimes.filter((runtime) => matchesLanguage(runtime, target));
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => compareVersions(a.version, b.version));
  const latest = candidates[candidates.length - 1];
  return { language: latest.language, version: latest.version };
};

const loadRuntimes = async (): Promise<Map<Language, ResolvedRuntime>> => {
  if (!runtimesPromise) {
    runtimesPromise = fetch(RUNTIMES_URL)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to load runtimes (${response.status})`);
        }
        return response.json() as Promise<PistonRuntime[]>;
      })
      .then((runtimes) => {
        const resolved = new Map<Language, ResolvedRuntime>();
        (Object.keys(TARGET_LANGUAGES) as Language[]).forEach((language) => {
          const target = TARGET_LANGUAGES[language];
          const runtime = selectLatestRuntime(runtimes, target);
          if (runtime) resolved.set(language, runtime);
        });
        return resolved;
      });
  }
  return runtimesPromise;
};

export const runPiston = async (language: Language, code: string, stdin: string): Promise<PistonRunResult> => {
  const runtimes = await loadRuntimes();
  const runtime = runtimes.get(language);
  if (!runtime) {
    throw new Error(`Piston runtime unavailable for ${language}`);
  }

  const response = await fetch(EXECUTE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      language: runtime.language,
      version: runtime.version,
      files: [{ content: code }],
      stdin,
    }),
  });

  if (!response.ok) {
    throw new Error(`Piston request failed (${response.status})`);
  }

  const result = (await response.json()) as PistonExecuteResponse;
  if (result.message) {
    throw new Error(result.message);
  }

  return {
    stdout: result.run?.stdout ?? '',
    stderr: result.run?.stderr ?? '',
    exitCode: result.run?.code ?? null,
    compile: result.compile
      ? {
          stdout: result.compile.stdout ?? '',
          stderr: result.compile.stderr ?? '',
          exitCode: result.compile.code ?? null,
        }
      : undefined,
  };
};
