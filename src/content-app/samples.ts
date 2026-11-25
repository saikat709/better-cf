export type SampleCase = {
  index: number;
  input: string;
  expectedOutput: string;
};

export type SampleRunOutcome = {
  index: number;
  input: string;
  expectedOutput: string;
  actualOutput: string;
  passed: boolean;
  status: 'passed' | 'failed' | 'error';
  durationMs: number;
};

const extractPreText = (pre: Element): string => {
  const lines = pre.querySelectorAll('.test-example-line');
  if (lines.length > 0) {
    return Array.from(lines)
      .map((line) => (line.textContent ?? '').replace(/\u00a0/g, ' '))
      .join('\n')
      .trimEnd();
  }
  return (pre.textContent ?? '').replace(/\r\n/g, '\n').replace(/\u00a0/g, ' ').trim();
};

export const normalizeOutputForCompare = (value: string): string =>
  value
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();

export const parseCodeforcesSamples = (): SampleCase[] => {
  const sampleContainer = document.querySelector('.problem-statement .sample-test');
  if (!sampleContainer) return [];

  const inputs = Array.from(sampleContainer.querySelectorAll('.input pre'));
  const outputs = Array.from(sampleContainer.querySelectorAll('.output pre'));
  const count = Math.min(inputs.length, outputs.length);

  const cases: SampleCase[] = [];
  for (let i = 0; i < count; i += 1) {
    cases.push({
      index: i + 1,
      input: extractPreText(inputs[i]),
      expectedOutput: extractPreText(outputs[i]),
    });
  }
  return cases;
};
