// The draw page ("뽑기"): splitting names into teams, putting them in an order, picking some.
// Pure functions that take their randomness as an argument, so tests/draw.test.mjs can pin
// the results; the page passes one backed by the browser's crypto.

/** A number in [0, 1), like Math.random. */
export type Random = () => number

export const MAX_DRAW_NAMES = 200

/** Uniform in [0, 1) from the browser's cryptographic generator. */
export function cryptoRandom(): number {
  const buffer = new Uint32Array(1)
  crypto.getRandomValues(buffer)
  return buffer[0] / 2 ** 32
}

/**
 * The names in a block of text: one per line, or separated by commas, semicolons or tabs.
 * Blanks go. A name written twice stays twice (two members can share a name); `duplicates`
 * lists such names so the page can point them out. At most MAX_DRAW_NAMES are kept.
 */
export function parseNames(text: string): { names: string[]; duplicates: string[]; dropped: number } {
  const all = String(text ?? '')
    .split(/[\n\r,;\t]+/)
    .map((name) => name.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  const names = all.slice(0, MAX_DRAW_NAMES)
  const seen = new Set<string>()
  const duplicates: string[] = []
  for (const name of names) {
    if (seen.has(name) && !duplicates.includes(name)) duplicates.push(name)
    seen.add(name)
  }
  return { names, duplicates, dropped: all.length - names.length }
}

/** A shuffled copy (Fisher-Yates): every order is equally likely for a uniform `random`. */
export function shuffled<T>(items: readonly T[], random: Random): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

/** How many teams the page lets a list be split into: at least 2, at most one name each. */
export function clampTeamCount(wanted: number, nameCount: number): number {
  const max = Math.max(2, nameCount)
  if (!Number.isFinite(wanted)) return 2
  return Math.min(max, Math.max(2, Math.round(wanted)))
}

/**
 * The names dealt at random into `teamCount` teams whose sizes differ by one at most (the
 * first teams take the extra names). Fewer names than teams leaves the last teams empty.
 */
export function splitIntoTeams(names: readonly string[], teamCount: number, random: Random): string[][] {
  const count = Math.max(1, Math.floor(teamCount))
  const teams: string[][] = Array.from({ length: count }, () => [])
  shuffled(names, random).forEach((name, index) => teams[index % count].push(name))
  return teams
}

/** `count` of the items at random, in the order they were drawn; all of them when there are fewer. */
export function pickSome<T>(items: readonly T[], count: number, random: Random): T[] {
  return shuffled(items, random).slice(0, Math.max(0, Math.floor(count)))
}

/** "1조: 홍길동, 김철수" per line, for the clipboard. */
export function teamsToText(teams: readonly string[][]): string {
  return teams.map((team, index) => `${index + 1}조: ${team.join(', ')}`).join('\n')
}

/** "1. 홍길동" per line, for the clipboard. */
export function orderToText(order: readonly string[]): string {
  return order.map((name, index) => `${index + 1}. ${name}`).join('\n')
}
