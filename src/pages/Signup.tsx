import { useState } from 'react'
import { CheckCircle2, Mail, Send, UserRound } from 'lucide-react'
import { signupUser } from '../services/authApi'
import { EmailVerifyStep } from '../components/EmailVerifyStep'
import { PASSWORD_PATTERN } from '../utils/passwordPolicy'
import { useScrollReveal } from '../hooks/useScrollReveal'

const CURRENT_SIGNUP = 'current'
const GRADUATE_SIGNUP = 'graduate'
const OTHER_INTEREST = '기타'

const INTEREST_OPTIONS = ['웹', '앱', '보안', '알고리즘', '아두이노', '디자인']
const SIGNUP_TYPES = [
  { id: CURRENT_SIGNUP, label: '재학생' },
  { id: GRADUATE_SIGNUP, label: '졸업생' },
]

const STUDENT_ID_PATTERN = /^\d{10}$/
const NAME_PATTERN = /^[가-힣]{3}$/
const TWO_DIGIT_PATTERN = /^\d{2}$/
const GENERATION_PATTERN = /^\d{1,3}$/

const inputClass =
  'w-full min-h-12 min-w-0 rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] px-4 py-3 text-base text-[var(--app-text)] outline-none placeholder:text-[var(--app-subtle)] transition focus:ring-2 focus:ring-[var(--app-accent)]/24'
const textareaClass =
  'w-full min-w-0 rounded-lg resize-none border border-[var(--app-hairline)] bg-[var(--app-surface)] px-4 py-3 text-base text-[var(--app-text)] outline-none placeholder:text-[var(--app-subtle)] transition focus:ring-2 focus:ring-[var(--app-accent)]/24'
const labelClass = 'mb-2 block text-sm font-semibold text-[var(--app-text)]'
const fieldGridClass = 'grid min-w-0 gap-3 sm:gap-4 md:grid-cols-2'

function choiceButtonClass(active) {
  return `min-h-11 rounded-lg px-4 py-2 text-sm font-semibold transition ${
    active
      ? 'bg-[var(--app-accent)] text-white'
      : 'border border-[var(--app-hairline)] bg-[var(--app-surface-soft)] text-[var(--app-text)] hover:bg-[var(--app-surface)]'
  }`
}

function TextField({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  autoComplete,
  inputMode,
  maxLength,
}: {
  id: string
  label: string
  value: string
  onChange: React.ChangeEventHandler<HTMLInputElement>
  placeholder?: string
  type?: string
  autoComplete?: string
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode']
  maxLength?: number
}) {
  return (
    <div className="min-w-0">
      <label className={labelClass} htmlFor={id}>{label}</label>
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        onChange={onChange}
        className={inputClass}
        placeholder={placeholder}
        autoComplete={autoComplete}
        inputMode={inputMode}
        maxLength={maxLength}
      />
    </div>
  )
}

function SignupTypeSelector({ value, onChange }: {
  value: string
  onChange: (id: string) => void
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2" aria-label="가입 구분">
      {SIGNUP_TYPES.map((type) => (
        <button
          key={type.id}
          type="button"
          onClick={() => onChange(type.id)}
          aria-pressed={value === type.id}
          className={`min-h-12 rounded-lg px-4 py-3 text-sm font-semibold transition ${
            value === type.id
              ? 'bg-[var(--app-accent)] text-white'
              : 'border border-[var(--app-hairline)] bg-[var(--app-surface-soft)] text-[var(--app-text)] hover:bg-[var(--app-surface)]'
          }`}
        >
          {type.label}
        </button>
      ))}
    </div>
  )
}

function InterestsSelector({ selected, onChange, otherText, onOtherChange }: {
  selected: string[]
  onChange: (next: string[]) => void
  otherText: string
  onOtherChange: (value: string) => void
}) {
  const toggle = (option) => {
    const next = selected.includes(option)
      ? selected.filter((item) => item !== option)
      : [...selected, option]
    onChange(next)
  }

  const hasOther = selected.includes(OTHER_INTEREST)

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 min-[420px]:grid-cols-4 sm:flex sm:flex-wrap">
        {[...INTEREST_OPTIONS, OTHER_INTEREST].map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => toggle(option)}
            className={choiceButtonClass(selected.includes(option))}
          >
            {option}
          </button>
        ))}
      </div>
      {hasOther && (
        <input
          value={otherText}
          onChange={(event) => onOtherChange(event.target.value)}
          placeholder="기타 관심 분야를 입력하세요"
          maxLength={100}
          className={inputClass}
        />
      )}
    </div>
  )
}

const initialForm = {
  studentId: '',
  name: '',
  graduateVerificationType: 'YEAR',
  graduateVerificationValue: '',
  email: '',
  password: '',
  passwordConfirm: '',
  department: '',
  phone: '',
  aspiration: '',
}

function admissionYearFromStudentId(studentId) {
  const trimmed = studentId.trim()
  return /^\d{4}/.test(trimmed) ? Number(trimmed.slice(0, 4)) : null
}

function normalizeGraduateValue(value) {
  return value.trim().replace(/[^0-9]/g, '')
}

export default function Signup({ onBack }: { onBack: () => void }) {
  const [step, setStep] = useState('form')
  useScrollReveal([step])
  const [signupType, setSignupType] = useState(CURRENT_SIGNUP)
  const [signedUpStudentId, setSignedUpStudentId] = useState('')
  const [signedUpEmail, setSignedUpEmail] = useState('')
  const [form, setForm] = useState(initialForm)
  const [selectedInterests, setSelectedInterests] = useState([])
  const [otherInterest, setOtherInterest] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const admissionYear = admissionYearFromStudentId(form.studentId)
  const graduateCutoffYear = new Date().getFullYear() - 7
  const isGraduateSignup = signupType === GRADUATE_SIGNUP
  const isCurrentSignup = signupType === CURRENT_SIGNUP
  const isGraduateStudentId = admissionYear !== null && admissionYear <= graduateCutoffYear

  const handleChange = (event) => {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleSignupTypeChange = (nextType) => {
    setSignupType(nextType)
    setError('')
  }

  const buildInterestsString = () => {
    if (selectedInterests.length === 0) return ''
    return selectedInterests
      .map((item) => (item === OTHER_INTEREST ? `${OTHER_INTEREST}:${otherInterest.trim()}` : item))
      .join(',')
  }

  const validateForm = () => {
    const studentId = form.studentId.trim()
    const name = form.name.trim()
    const graduateValue = normalizeGraduateValue(form.graduateVerificationValue)

    if (isCurrentSignup && !studentId) return '학번을 입력해주세요.'
    if (isCurrentSignup && !STUDENT_ID_PATTERN.test(studentId)) return '학번은 숫자 10자리여야 합니다.'
    if (!name) return '이름을 입력해주세요.'
    if (!NAME_PATTERN.test(name)) return '이름은 한글 3자리여야 합니다.'
    if (isCurrentSignup && isGraduateStudentId) return '졸업생은 졸업생 회원가입을 선택해주세요.'

    if (isGraduateSignup) {
      if (!graduateValue) return '졸업생 인증 정보를 입력해주세요.'
      if (form.graduateVerificationType === 'YEAR') {
        if (!TWO_DIGIT_PATTERN.test(graduateValue)) return '입학연도 끝 두 자리는 숫자 2자리여야 합니다.'
      } else {
        if (!GENERATION_PATTERN.test(graduateValue)) return '기수는 숫자로 입력해주세요.'
      }
    }

    if (!form.email.trim()) return '이메일을 입력해주세요.'
    if (!form.email.includes('@')) return '올바른 이메일 형식이 아닙니다.'
    if (!form.password) return '비밀번호를 입력해주세요.'
    if (/\s/.test(form.password)) return '비밀번호에 공백을 사용할 수 없습니다.'
    if (!PASSWORD_PATTERN.test(form.password)) return '비밀번호는 8자 이상, 영문·숫자·특수문자(!@#$ 등)를 모두 포함해야 합니다.'
    if (form.password !== form.passwordConfirm) return '비밀번호 확인이 일치하지 않습니다.'

    if (isCurrentSignup && selectedInterests.length === 0) return '재학생 관심 분야를 하나 이상 선택해주세요.'
    if (isCurrentSignup && selectedInterests.includes(OTHER_INTEREST) && !otherInterest.trim()) return '기타 관심 분야를 입력해주세요.'
    if (isCurrentSignup && !form.aspiration.trim()) return '재학생 포부를 입력해주세요.'
    return ''
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')

    const validationMessage = validateForm()
    if (validationMessage) {
      setError(validationMessage)
      return
    }

    const studentId = isGraduateSignup ? '' : form.studentId.trim()
    const email = form.email.trim()

    setLoading(true)
    try {
      const result = await signupUser({
        signupType: isGraduateSignup ? 'GRADUATE' : 'CURRENT',
        studentId: isGraduateSignup ? null : studentId,
        name: form.name.trim(),
        graduateVerificationType: isGraduateSignup ? form.graduateVerificationType : null,
        graduateVerificationValue: isGraduateSignup ? form.graduateVerificationValue.trim() : null,
        email,
        password: form.password,
        department: form.department.trim(),
        phone: form.phone.trim(),
        aspiration: isCurrentSignup ? form.aspiration.trim() : null,
        interests: isCurrentSignup ? buildInterestsString() : null,
      })
      setSignedUpStudentId(result.studentId || studentId || email)
      setSignedUpEmail(email)
      setStep('verify')
    } catch (err) {
      setError(err.message || '회원가입 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const stepDesc = step === 'verify'
    ? '가입하신 이메일로 발송된 인증코드를 입력해주세요.'
    : step === 'done'
      ? '이메일 인증이 완료되었습니다. 로그인하시면 됩니다.'
      : isGraduateSignup
        ? '졸업생 명부 인증 정보와 일치해야 계정을 만들 수 있습니다.'
        : "COM's 명부 확인 후 관심 분야와 포부를 함께 등록합니다."

  return (
    <div className="w-full min-w-0 space-y-4 text-[var(--app-text)]">
      <button
        type="button"
        onClick={onBack}
        className="apple-action-secondary px-4 py-2 text-sm"
        data-reveal
        style={{ '--reveal-delay': '0ms' } as React.CSSProperties}
      >
        로그인으로 돌아가기
      </button>

      <section className="apple-board-shell">
        <div className="apple-board-hero px-6 py-8 sm:px-8 sm:py-10" data-reveal style={{ '--reveal-delay': '80ms' } as React.CSSProperties}>
          <p className="apple-eyebrow">Signup</p>
          <h1 className="apple-display mt-3 text-4xl sm:text-6xl">COM&apos;s 회원가입</h1>
          <p className="apple-copy mt-5 max-w-3xl text-base sm:text-lg">
            지원하기와 같은 흐름으로 가입 정보를 작성합니다. 재학생은 명부 확인과 관심 분야를 함께 등록하고, 졸업생은 명부 인증 정보로 계정을 만듭니다.
          </p>
        </div>

        <div className="grid gap-0 lg:grid-cols-[1fr_320px]">
          <div className="min-w-0 bg-[var(--app-surface)] p-6 sm:p-8" data-reveal style={{ '--reveal-delay': '160ms' } as React.CSSProperties}>
          {step === 'form' && (
            <form onSubmit={handleSubmit} className="grid min-w-0 gap-4 sm:gap-5">
              <div className="flex items-center gap-3">
                <div className="flex size-11 items-center justify-center rounded-lg bg-[var(--app-accent-soft)] text-[var(--app-accent-text)]">
                  <UserRound size={20} />
                </div>
                <div>
                  <h2 className="text-xl font-bold">가입 정보 양식</h2>
                  <p className="text-sm text-[var(--app-muted)]">{stepDesc}</p>
                </div>
              </div>

              <SignupTypeSelector value={signupType} onChange={handleSignupTypeChange} />

              <div className={isCurrentSignup ? fieldGridClass : 'grid min-w-0 gap-3 sm:gap-4'}>
                {isCurrentSignup && (
                  <TextField
                    id="studentId"
                    label="학번"
                    value={form.studentId}
                    onChange={handleChange}
                    placeholder="학번을 입력하세요"
                    inputMode="numeric"
                    maxLength={10}
                    autoComplete="username"
                  />
                )}
                <TextField
                  id="name"
                  label="이름"
                  value={form.name}
                  onChange={handleChange}
                  placeholder="이름을 입력하세요"
                  autoComplete="name"
                />
              </div>

              {isGraduateSignup && (
                <div className="grid min-w-0 gap-3 rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface-soft)] p-4 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
                  <div>
                    <label className={labelClass} htmlFor="graduateVerificationType">졸업생 인증 방식</label>
                    <select
                      id="graduateVerificationType"
                      name="graduateVerificationType"
                      value={form.graduateVerificationType}
                      onChange={handleChange}
                      className={inputClass}
                    >
                      <option value="YEAR">입학연도 끝 두 자리</option>
                      <option value="GENERATION">기수</option>
                    </select>
                  </div>
                  <TextField
                    id="graduateVerificationValue"
                    label={form.graduateVerificationType === 'YEAR' ? '입학연도 끝 두 자리' : '기수'}
                    value={form.graduateVerificationValue}
                    onChange={handleChange}
                    placeholder={form.graduateVerificationType === 'YEAR' ? '예: 19' : '예: 53기'}
                    inputMode="numeric"
                  />
                  <p className="text-sm leading-6 text-[var(--theme-body-muted)] sm:col-span-2">
                    졸업생은 명부의 이름과 입학연도 끝 두 자리 또는 기수로 인증합니다.
                  </p>
                </div>
              )}

              <div>
                <label className={labelClass} htmlFor="email">이메일</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={handleChange}
                  className={inputClass}
                  placeholder="이메일을 입력하세요"
                  autoComplete="email"
                />
              </div>

              <div className={fieldGridClass}>
                <TextField id="department" label="학과" value={form.department} onChange={handleChange} placeholder="학과를 입력하세요" />
                <TextField id="phone" label="전화번호" value={form.phone} onChange={handleChange} placeholder="01012345678 (하이픈 없이)" inputMode="tel" autoComplete="tel" />
              </div>

              <div className={fieldGridClass}>
                <TextField id="password" label="비밀번호" type="password" value={form.password} onChange={handleChange} placeholder="영문+숫자+특수문자 8자 이상" autoComplete="new-password" />
                <TextField id="passwordConfirm" label="비밀번호 확인" type="password" value={form.passwordConfirm} onChange={handleChange} placeholder="비밀번호를 다시 입력하세요" autoComplete="new-password" />
              </div>

              {isCurrentSignup && (
                <div className="grid min-w-0 gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
                  <div>
                    <label className={labelClass}>
                      관심 분야 <span className="font-normal text-[var(--theme-body-muted)]">(복수 선택 가능)</span>
                    </label>
                    <InterestsSelector
                      selected={selectedInterests}
                      onChange={setSelectedInterests}
                      otherText={otherInterest}
                      onOtherChange={setOtherInterest}
                    />
                  </div>

                  <div>
                    <label className={labelClass} htmlFor="aspiration">포부</label>
                    <textarea
                      id="aspiration"
                      name="aspiration"
                      value={form.aspiration}
                      onChange={handleChange}
                      rows={3}
                      maxLength={500}
                      placeholder="동아리에서 이루고 싶은 목표나 포부를 적어주세요."
                      className={textareaClass}
                    />
                  </div>
                </div>
              )}

              {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="apple-action-primary mt-1 inline-flex min-h-12 w-full items-center justify-center gap-2 px-4 py-3 text-base disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Send size={17} />
                {loading ? '가입 처리 중...' : isGraduateSignup ? '졸업생 회원가입' : '회원가입'}
              </button>
            </form>
          )}

          {step === 'verify' && (
            <EmailVerifyStep
              studentId={signedUpStudentId}
              email={signedUpEmail}
              onDone={() => setStep('done')}
            />
          )}

          {step === 'done' && (
            <div className="space-y-5 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[var(--app-accent-soft)] text-3xl text-[var(--app-accent-text)]">
                <CheckCircle2 size={30} />
              </div>
              <p className="text-base font-semibold text-[var(--app-accent-text)]">이메일 인증이 완료되었습니다!</p>
              <button
                type="button"
                onClick={onBack}
                className="apple-action-primary inline-flex w-full items-center justify-center px-4 py-3 text-base"
              >
                로그인하러 가기
              </button>
            </div>
          )}
          </div>

          <aside className="flex flex-col justify-between gap-8 bg-[var(--app-surface-soft)] p-6 sm:p-8">
            <div className="space-y-6">
              <div>
                <p className="text-sm font-semibold text-[var(--app-accent-text)]">Process</p>
                <div className="mt-4 space-y-3 text-sm leading-6 text-[var(--app-muted)]">
                  <p>1. 가입 정보 작성</p>
                  <p>2. 명부 확인 및 계정 생성</p>
                  <p>3. 이메일 인증 후 로그인</p>
                </div>
              </div>

              <div className="rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] p-4 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                <div className="flex items-center gap-2 text-sm font-semibold text-[var(--app-text)]">
                  <Mail size={16} />
                  가입 안내
                </div>
                <p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">
                  재학생은 명부의 학번과 이름이 일치해야 합니다. 졸업생은 입학연도 끝 두 자리 또는 기수로 인증합니다.
                </p>
              </div>
            </div>

            <p className="text-xs leading-5 text-[var(--app-subtle)]">
              가입 후 이메일 인증을 완료해야 로그인할 수 있습니다. 지원서와 달리 회원가입은 계정 생성과 인증 절차가 함께 진행됩니다.
            </p>
          </aside>
        </div>
      </section>
    </div>
  )
}
