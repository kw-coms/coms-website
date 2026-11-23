import { readFileSync } from 'node:fs';

const supported = new Set(['c', 'cpp', 'java', 'python', 'javascript']);
const inputBytes = value => Buffer.byteLength(value, 'utf8');

// Match the existing study grader's tokens, lines and finite-float comparison rules.
function matchesOutput(actual, expected, mode = 'tokens') {
  if (mode === 'lines') {
    const lines = text => text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n');
    return JSON.stringify(lines(actual)) === JSON.stringify(lines(expected));
  }
  const tokens = text => text.trim().split(/\s+/u).filter(Boolean);
  const left = tokens(actual), right = tokens(expected);
  if (left.length !== right.length) return false;
  const decimal = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
  return left.every((token, index) => {
    if (typeof mode !== 'object' || !decimal.test(token) || !decimal.test(right[index])) return token === right[index];
    const value = Number(token), target = Number(right[index]);
    return Number.isFinite(value) && Number.isFinite(target)
      && Math.abs(value - target) <= mode.float * Math.max(1, Math.abs(target));
  });
}

export function loadNumberedProblems(file) {
  const bank = JSON.parse(readFileSync(file, 'utf8'));
  if (!bank || typeof bank !== 'object' || Array.isArray(bank)) throw new Error('Invalid numbered problem bank');
  for (const [number, problem] of Object.entries(bank)) {
    if (!/^[1-9]\d*$/.test(number) || !Number.isSafeInteger(Number(number)) ||
        !problem || typeof problem !== 'object' || Array.isArray(problem) ||
        !Array.isArray(problem.langs) || !problem.langs.length ||
        problem.langs.some(lang => !supported.has(lang)) || new Set(problem.langs).size !== problem.langs.length ||
        (problem.compare !== undefined && problem.compare !== 'tokens' && problem.compare !== 'lines' &&
          (!problem.compare || typeof problem.compare !== 'object' || !Number.isFinite(problem.compare.float) || problem.compare.float < 0)) ||
        (problem.harness !== undefined &&
          (!problem.harness || typeof problem.harness !== 'object' || Array.isArray(problem.harness) ||
            Object.entries(problem.harness).some(([lang, code]) => {
              const marker = lang === 'python' ? '#@USER@' : '/*@USER@*/';
              return !problem.langs.includes(lang) || typeof code !== 'string' || code.split(marker).length !== 2;
            }))) ||
        !Array.isArray(problem.cases) || problem.cases.length < 1 || problem.cases.length > 10 ||
        problem.cases.some(entry => typeof entry.stdin !== 'string' || typeof entry.expected !== 'string' ||
          inputBytes(entry.stdin) > 16 * 1024) ||
        problem.cases.reduce((sum, entry) => sum + inputBytes(entry.stdin), 0) > 32 * 1024) {
      throw new Error(`Invalid numbered problem ${number}`);
    }
  }
  return bank;
}

export function buildNumberedCode(problem, lang, code) {
  const harness = problem.harness?.[lang];
  if (!harness) return code;
  const marker = lang === 'python' ? '#@USER@' : '/*@USER@*/';
  if (harness.split(marker).length !== 2) throw new Error('Invalid numbered problem harness');
  return harness.replace(marker, () => code);
}

export function gradeNumberedOutput(problem, output) {
  const compileError = output.stage === 'compile';
  if (!compileError && (!Array.isArray(output.results) || output.results.length !== problem.cases.length)) {
    throw new Error('Incomplete numbered judge result');
  }
  const verdicts = compileError ? [] : problem.cases.map((entry, index) => {
    const run = output.results[index];
    if (!run || run.skipped) return 'skipped';
    if (run.timedOut) return 'timeout';
    if (run.truncated) return 'truncated';
    if (run.exitCode !== 0 || run.signal) return 'runtime';
    return matchesOutput(run.stdout ?? '', entry.expected, problem.compare) ? 'correct' : 'wrong';
  });
  const passed = verdicts.filter(verdict => verdict === 'correct').length;
  return {
    passed,
    total: problem.cases.length,
    solved: !compileError && passed === problem.cases.length,
    verdicts,
    diagnostics: compileError ? output.diagnostics ?? [] : [],
    compileError,
    stderr: compileError ? output.stderr ?? '' : '',
    timeMs: output.timeMs ?? 0,
  };
}
