// Korean phone numbers as people type them: hyphens, spaces, dots, (02), +82. The backend only checks the length.

// Digits only, with a leading 0: mobile, Seoul, regional, internet phone (070) and 050x.
const NUMBER_PATTERNS = [
  /^01[016789]\d{7,8}$/,
  /^02\d{7,8}$/,
  /^0(?:3[1-3]|4[1-4]|5[1-5]|6[1-4])\d{7,8}$/,
  /^070\d{7,8}$/,
  /^050\d{8,9}$/,
]

// Digit groups (or a (group)) joined by at most one hyphen, space or dot; an optional leading +.
const SHAPE = /^\+?(?:\(\d+\)|\d+)(?:[\s.-]?(?:\(\d+\)|\d+))*$/

export function isValidKoreanPhone(value: string): boolean {
  const text = value.trim()
  if (!SHAPE.test(text)) return false
  let digits = text.replace(/\D/g, '')
  if (text.startsWith('+')) {
    if (!digits.startsWith('82')) return false
    digits = `0${digits.slice(2).replace(/^0/, '')}`
  }
  return NUMBER_PATTERNS.some((pattern) => pattern.test(digits))
}
