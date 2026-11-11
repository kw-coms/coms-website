// Korean phone numbers as people type them: hyphens, spaces, dots, (02), +82. The backend only checks the length.

// Digits only, with a leading 0: mobile, Seoul, regional, internet phone (070) and 050x.
const NUMBER_PATTERNS = [
  /^01[016789]\d{7,8}$/,
  /^02\d{7,8}$/,
  /^0(?:3[1-3]|4[1-4]|5[1-5]|6[1-4])\d{7,8}$/,
  /^070\d{7,8}$/,
  /^050\d{8,9}$/,
]

// The backend caps the field at 30 characters.
const MAX_LENGTH = 30

// Each check below is a single pass over the text: no nested repetition, so a long pasted value cannot stall the page.
function hasPhoneShape(text: string): boolean {
  if (text.length === 0 || text.length > MAX_LENGTH) return false
  if (!/^\+?[\d\s.()-]+$/.test(text)) return false
  // At most one hyphen, space or dot between groups, and none at either end.
  if (/[\s.-]{2}/.test(text) || /^\+?[\s.-]/.test(text) || /[\s.-]$/.test(text)) return false
  // Parentheses only as a whole (group) of digits.
  return !/[()]/.test(text.replace(/\(\d+\)/g, ''))
}

export function isValidKoreanPhone(value: string): boolean {
  const text = value.trim()
  if (!hasPhoneShape(text)) return false
  let digits = text.replace(/\D/g, '')
  if (text.startsWith('+')) {
    if (!digits.startsWith('82')) return false
    digits = `0${digits.slice(2).replace(/^0/, '')}`
  }
  return NUMBER_PATTERNS.some((pattern) => pattern.test(digits))
}
