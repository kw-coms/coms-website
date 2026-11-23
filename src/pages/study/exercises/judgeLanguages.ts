import { JUDGE_LANGUAGES, type Exercise } from './types'

/** Language-specific lessons and function harnesses retain their authored languages. */
export function numberedLanguages(problem: Exercise) {
  return problem.mode === 'stdio' && problem.langs.length === 3
    ? [...problem.langs, ...JUDGE_LANGUAGES.filter((lang) => !problem.langs.includes(lang))]
    : problem.langs
}

export const dailyCodingNumber = (sourceId: number) => 10_000 + sourceId

export function dailyCodingVariant(sourceId?: number): number | undefined {
  if (sourceId === undefined || sourceId < 8001 || sourceId > 8320) return undefined
  return (sourceId - 8001) % 10 + 1
}
