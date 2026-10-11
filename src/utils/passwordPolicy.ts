export const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?])(?!.*\s).{8,}$/

export const PASSWORD_MESSAGE = '비밀번호는 8자 이상, 영문·숫자·특수문자를 모두 포함하고 공백이 없어야 합니다.'

// BCrypt reads at most 72 bytes and the backend answers anything longer with a 400
// (BoundedBCryptPasswordEncoder). Bytes, not characters: a Hangul syllable is 3 bytes in UTF-8,
// so 25 of them are already over the limit while a character count still looks short.
export const PASSWORD_MAX_BYTES = 72

// Same wording as the backend's own 400, so both sides tell the member the same thing.
export const PASSWORD_TOO_LONG_MESSAGE = '비밀번호가 너무 깁니다. 영문·숫자 기준 72자(한글은 24자) 이내로 입력해주세요.'

export function isPasswordTooLong(pw) {
  return new TextEncoder().encode(String(pw || '')).length > PASSWORD_MAX_BYTES
}

export function isValidPassword(pw) {
  return PASSWORD_PATTERN.test(String(pw || '')) && !isPasswordTooLong(pw)
}
