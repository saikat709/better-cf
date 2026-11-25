import type { Language } from '../src/shared/settings';
import { runPiston } from './piston';
import { runWandbox } from './wandbox';

export type ExecutionStatus = 'ok' | 'compile_error' | 'runtime_error';

export type ExecutionResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  compile?: {
    stdout: string;
    stderr: string;
    exitCode: number | null;
  };
  signal?: string;
  durationMs: number;
  runner: 'wandbox' | 'piston';
  status: ExecutionStatus;
};

const DEFAULT_TIMEOUT_MS = 15_000;

const classifyStatus = (result: {
  exitCode: number | null;
  compile?: { stdout: string; stderr: string; exitCode: number | null };
  stdout: string;
  stderr: string;
}): ExecutionStatus => {
  if (result.compile) {
    if (result.compile.exitCode && result.compile.exitCode !== 0) return 'compile_error';
    if (!result.stdout && !result.stderr && result.exitCode !== 0 && (result.compile.stderr || result.compile.stdout)) {
      return 'compile_error';
    }
  }
  if (result.exitCode !== null && result.exitCode !== 0) return 'runtime_error';
  return 'ok';
};

export const formatExecutionOutput = (result: ExecutionResult): string => {
  const chunks: string[] = [];

  if (result.compile) {
    const compileText = [result.compile.stdout, result.compile.stderr].filter(Boolean).join('\n').trim();
    if (compileText) chunks.push(`Compile:\n${compileText}`);
    if (result.compile.exitCode && result.compile.exitCode !== 0) {
      chunks.push(`Compile exit code: ${result.compile.exitCode}`);
    }
  }

  const runText = [result.stdout, result.stderr].filter(Boolean).join('\n').trimEnd();
  if (runText) {
    chunks.push(runText);
  } else if (result.status === 'ok') {
    chunks.push('(no output)');
  }

  if (result.exitCode && result.exitCode !== 0) {
    chunks.push(`Exit code: ${result.exitCode}`);
  }
  if (result.signal) {
    chunks.push(`Signal: ${result.signal}`);
  }

  return chunks.join('\n\n');
};

export const executeCode = async (
  language: Language,
  code: string,
  stdin: string,
  options?: { signal?: AbortSignal; timeoutMs?: number },
): Promise<ExecutionResult> => {
  const controller = new AbortController();
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let timedOut = false;

  const onExternalAbort = () => controller.abort();
  if (options?.signal) {
    if (options.signal.aborted) {
      controller.abort();
    } else {
      options.signal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  const timer = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const startedAt = performance.now();

  try {
    try {
      const wandbox = await runWandbox(language, code, stdin, controller.signal);
      return {
        ...wandbox,
        durationMs: Math.round(performance.now() - startedAt),
        runner: 'wandbox',
        status: classifyStatus(wandbox),
      };
    } catch (wandboxError) {
      if (controller.signal.aborted) {
        throw timedOut ? new Error(`Execution timed out after ${Math.round(timeoutMs / 1000)}s`) : new Error('Execution cancelled');
      }
      // Fall back to Piston if Wandbox is unavailable or failed
      try {
        const piston = await runPiston(language, code, stdin, controller.signal);
        return {
          ...piston,
          durationMs: Math.round(performance.now() - startedAt),
          runner: 'piston',
          status: classifyStatus(piston),
        };
      } catch (pistonError) {
        if (controller.signal.aborted) {
          throw timedOut ? new Error(`Execution timed out after ${Math.round(timeoutMs / 1000)}s`) : new Error('Execution cancelled');
        }
        const primaryMsg = wandboxError instanceof Error ? wandboxError.message : String(wandboxError);
        const fallbackMsg = pistonError instanceof Error ? pistonError.message : String(pistonError);
        throw new Error(`${primaryMsg} (fallback failed: ${fallbackMsg})`);
      }
    }
  } finally {
    globalThis.clearTimeout(timer);
    options?.signal?.removeEventListener('abort', onExternalAbort);
  }
};
