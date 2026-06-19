export const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?])(?!.*\s).{8,}$/

export const PASSWORD_MESSAGE = '비밀번호는 8자 이상, 영문·숫자·특수문자를 모두 포함하고 공백이 없어야 합니다.'

export function isValidPassword(pw) {
  return PASSWORD_PATTERN.test(String(pw || ''))
}
