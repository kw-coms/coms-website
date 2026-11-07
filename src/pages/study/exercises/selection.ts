import type { Problem } from './navigation'

/** Stable sorting keeps the authored list order when status and level tie. */
export function selectInlineProblems(problems: Problem[], progress: Record<string, { solved: boolean }>): Problem[] {
  return [...problems].sort((a, b) =>
    Number(!!progress[a.id]?.solved) - Number(!!progress[b.id]?.solved) || a.level - b.level,
  ).slice(0, 4)
}
