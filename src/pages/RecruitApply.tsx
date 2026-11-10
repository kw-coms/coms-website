import PageHeading from '../components/PageHeading'
import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, Mail, Search, Send, UserRound } from 'lucide-react'
import { lookupRecruitStatus, submitRecruitApplication } from '../services/recruitApi'
import { showToast } from '../components/common/Toast'
import { isValidKoreanPhone } from '../utils/koreanPhone'
import RecruitFacts from '../components/RecruitFacts'
import { useQuery } from '@tanstack/react-query'
import { defaultSiteSettings, getPublicSiteSettings } from '../services/siteSettingsApi'

const INTEREST_OPTIONS = ['웹', '앱', '보안', '알고리즘', '아두이노', '디자인', '기타']

const initialForm = {
  name: '',
  studentId: '',
  department: '',
  grade: '',
  phone: '',
  email: '',
  motive: '',
  experience: '',
  expectation: '',
}

const inputClass =
  'w-full rounded-lg border border-black/10 bg-[var(--app-surface)] px-4 py-3 text-[15px] text-[var(--app-text)] outline-none placeholder:text-[var(--app-subtle)] transition focus:ring-2 focus:ring-[var(--app-accent)]/24'
const labelClass = 'mb-2 block text-sm font-semibold text-[var(--app-text)]'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

// Each line is backed by the backend: RecruitApplicationService (save, promote, reject, mails), PersonalDataRetentionJob (periods).
const PRIVACY_NOTICE: [string, string][] = [
  ['수집 항목', '이름, 학번, 학과, 학년, 전화번호, 이메일, 관심 분야, 지원 동기, 관련 경험, 기대하는 활동, 접속 IP(제출 횟수 제한용, 30일 뒤 삭제).'],
  ['이용 목적', '지원서 접수와 연락, 합격 여부 판단. 합격하면 이름·학번·학과·전화번호를 동아리 명부에 등록합니다.'],
  ['열람', '관리자 권한을 가진 운영진만 볼 수 있으며, 접수 내용은 동아리 공식 메일로도 전달될 수 있습니다.'],
  ['보관', '지원서는 합격·불합격이 정해지면 삭제하고, 정해지지 않으면 접수 1년 뒤 삭제합니다. 결정 기록에는 이름·학번·학과가 남고, 합격 기록의 전화번호와 이메일은 1년 뒤 지웁니다. 불합격 기록에는 연락처를 남기지 않습니다.'],
]

type FieldName = 'name' | 'studentId' | 'department' | 'otherGrade' | 'phone' | 'email' | 'otherInterest' | 'motive' | 'expectation' | 'consent'
type FieldErrors = Partial<Record<FieldName, string>>

function FieldError({ name, errors }: { name: FieldName; errors: FieldErrors }) {
  if (!errors[name]) return null
  return <p id={`${name}-error`} className="mt-2 text-sm font-semibold text-red-700">{errors[name]}</p>
}

// Ordered review pipeline. ACCEPTED / REJECTED are terminal outcomes shown after 면접.
const STATUS_STAGES = [
  { value: 'RECEIVED', label: '지원 완료' },
  { value: 'REVIEWING', label: '검토 중' },
  { value: 'HOLD', label: '면접' },
]

function stageIndexFor(status: string) {
  if (status === 'ACCEPTED' || status === 'REJECTED') return STATUS_STAGES.length
  const index = STATUS_STAGES.findIndex((stage) => stage.value === status)
  return index < 0 ? 0 : index
}

function RecruitStatusCheck() {
  const [studentId, setStudentId] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ status?: string; statusLabel?: string; submittedAt?: string } | null>(null)
  const [notFound, setNotFound] = useState(false)

  const activeIndex = result ? stageIndexFor(result.status) : -1
  const isAccepted = result?.status === 'ACCEPTED'
  const isRejected = result?.status === 'REJECTED'

  const handleLookup = async (event) => {
    event.preventDefault()
    setResult(null)
    setNotFound(false)

    const trimmedId = studentId.trim()
    const trimmedName = name.trim()
    if (!trimmedName) {
      showToast({ message: '이름을 입력해주세요.', tone: 'error' })
      return
    }
    if (!/^\d{10}$/.test(trimmedId)) {
      showToast({ message: '학번은 숫자 10자리로 입력해주세요.', tone: 'error' })
      return
    }

    setLoading(true)
    try {
      const status = await lookupRecruitStatus({ name: trimmedName, studentId: trimmedId })
      setResult(status)
    } catch (err) {
      // 404 is the generic "no match" path — show a gentle, non-confirming message
      // rather than an error toast that would act as an existence oracle.
      if (err?.status === 404) {
        setNotFound(true)
      } else {
        showToast({ message: err?.message || '지원 현황을 불러오지 못했습니다.', tone: 'error' })
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="apple-board-shell">
      <div className="grid gap-0 lg:grid-cols-[1fr_320px]">
        <div className="bg-[var(--app-surface)] p-6 text-[var(--app-text)] sm:p-8">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-lg bg-[var(--app-accent-soft)] text-[var(--app-accent-text)]">
              <Search size={20} />
            </div>
            <div>
              <h2 className="text-xl font-bold">지원 현황 확인</h2>
              <p className="text-sm text-[var(--app-muted)]">제출한 학번과 이름으로 현재 진행 상태를 확인하세요.</p>
            </div>
          </div>

          <form onSubmit={handleLookup} className="mt-5 grid gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="lookup-name">이름</label>
                <input
                  id="lookup-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className={inputClass}
                  placeholder="지원 시 입력한 이름"
                  autoComplete="name"
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="lookup-studentId">학번</label>
                <input
                  id="lookup-studentId"
                  value={studentId}
                  onChange={(event) => setStudentId(event.target.value)}
                  className={inputClass}
                  placeholder="10자리 학번"
                  inputMode="numeric"
                  autoComplete="username"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="apple-action-primary inline-flex w-full items-center justify-center gap-2 px-4 py-3 text-base disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Search size={17} />
              {loading ? '조회 중...' : '현황 조회하기'}
            </button>
          </form>

          {notFound && (
            <p className="mt-5 rounded-lg bg-[var(--app-surface-soft)] px-4 py-3 text-sm text-[var(--app-muted)]">
              입력하신 정보와 일치하는 지원 내역을 찾을 수 없습니다. 학번과 이름을 다시 확인해주세요.
            </p>
          )}

          {result && (
            <div className="mt-6 rounded-xl border border-black/10 bg-[var(--app-surface-soft)] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span
                  className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${
                    isRejected
                      ? 'bg-red-50 text-red-700'
                      : isAccepted
                        ? 'bg-[#e6f7ed] text-[#1a7f43]'
                        : 'bg-[var(--app-accent-soft)] text-[var(--app-accent-text)]'
                  }`}
                >
                  {result.statusLabel}
                </span>
                <span className="text-xs text-[var(--app-subtle)]">
                  {result.submittedAt ? `${new Date(result.submittedAt).toLocaleDateString('ko-KR')} 접수` : ''}
                </span>
              </div>

              <ol className="mt-5 flex items-center">
                {STATUS_STAGES.map((stage, index) => {
                  const reached = index <= activeIndex
                  const isFinalReached = index < STATUS_STAGES.length - 1
                  return (
                    <li key={stage.value} className="flex flex-1 items-center last:flex-none">
                      <div className="flex flex-col items-center gap-1">
                        <span
                          className={`flex size-7 items-center justify-center rounded-full text-xs font-bold transition ${
                            reached ? 'bg-[var(--app-accent)] text-white' : 'bg-black/10 text-[var(--app-muted)]'
                          }`}
                        >
                          {reached ? <CheckCircle2 size={16} /> : index + 1}
                        </span>
                        <span className={`text-[11px] ${reached ? 'font-semibold text-[var(--app-text)]' : 'text-[var(--app-muted)]'}`}>
                          {stage.label}
                        </span>
                      </div>
                      {isFinalReached && (
                        <span className={`mx-1 h-0.5 flex-1 ${index < activeIndex ? 'bg-[var(--app-accent)]' : 'bg-black/10'}`} />
                      )}
                    </li>
                  )
                })}
              </ol>

              {(isAccepted || isRejected) && (
                <p
                  className={`mt-4 rounded-lg px-4 py-3 text-sm font-semibold ${
                    isRejected ? 'bg-red-50 text-red-700' : 'bg-[#e6f7ed] text-[#1a7f43]'
                  }`}
                >
                  {isAccepted ? '최종 합격하셨습니다. 축하드립니다!' : '이번 모집에서는 함께하지 못하게 되었습니다.'}
                </p>
              )}
            </div>
          )}
        </div>

        <aside className="flex flex-col gap-6 bg-[var(--app-surface-soft)] p-6 sm:p-8">
          <div>
            <p className="text-sm font-semibold text-[var(--app-accent-text)]">안내</p>
            <div className="mt-4 space-y-3 text-sm leading-6 text-[var(--app-muted)]">
              <p>지원서에 입력한 이름과 학번을 그대로 입력해주세요.</p>
              <p>상태는 검토 진행에 따라 업데이트됩니다.</p>
              <p>문의는 아래 메일로 부탁드립니다.</p>
            </div>
          </div>
          <a href="mailto:kwcoms69@gmail.com" className="break-all text-sm text-[var(--app-accent-text)] hover:text-[var(--app-accent-hover)]">
            kwcoms69@gmail.com
          </a>
        </aside>
      </div>
    </section>
  )
}

export default function RecruitApply({ onBack }: { onBack: () => void }) {
  const [form, setForm] = useState(initialForm)
  const [interests, setInterests] = useState([])
  const [otherInterest, setOtherInterest] = useState('')
  const [otherGrade, setOtherGrade] = useState('')
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [consent, setConsent] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [sentTo, setSentTo] = useState('')
  const doneRef = useRef<HTMLHeadingElement>(null)
  const [loading, setLoading] = useState(false)
  const settings = useQuery({ queryKey: ['site-settings', 'public'], queryFn: getPublicSiteSettings }).data
  const settingRows = [
    { label: '현황', value: settings?.recruitmentStatus, skip: defaultSiteSettings.recruitmentStatus },
    { label: '일정', value: settings?.recruitmentPeriod, skip: defaultSiteSettings.recruitmentPeriod },
  ].filter((row) => row.value && row.value !== row.skip) as { label: string; value: string }[]

  const gradeText = useMemo(() => {
    if (form.grade === '기타') return `기타: ${otherGrade.trim()}`
    return form.grade.trim() || '선택 안 함'
  }, [form.grade, otherGrade])

  const interestList = useMemo(() => {
    return interests
      .map((interest) => (interest === '기타' ? `기타: ${otherInterest.trim()}` : interest))
      .filter((interest) => interest.trim())
  }, [interests, otherInterest])

  const handleChange = (event) => {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
    setFieldErrors((prev) => (prev[name] ? { ...prev, [name]: undefined } : prev))
  }

  const toggleInterest = (option) => {
    setInterests((prev) => (
      prev.includes(option)
        ? prev.filter((item) => item !== option)
        : [...prev, option]
    ))
  }

  const validateForm = (): FieldErrors => {
    const errors: FieldErrors = {}
    if (!form.name.trim()) errors.name = '이름을 입력해주세요.'
    if (!form.studentId.trim()) errors.studentId = '학번을 입력해주세요.'
    else if (!/^\d{10}$/.test(form.studentId.trim())) errors.studentId = '학번은 숫자 10자리로 입력해주세요.'
    if (!form.department.trim()) errors.department = '학과를 입력해주세요.'
    if (form.grade === '기타' && !otherGrade.trim()) errors.otherGrade = '기타 학년 정보를 입력해주세요.'
    if (!form.phone.trim()) errors.phone = '전화번호를 입력해주세요.'
    else if (!isValidKoreanPhone(form.phone)) errors.phone = '전화번호 형식이 올바르지 않아요. 예: 010-1234-5678, 02-123-4567, +82-10-1234-5678'
    if (!form.email.trim()) errors.email = '이메일을 입력해주세요.'
    else if (!EMAIL_PATTERN.test(form.email.trim())) errors.email = '이메일 형식이 올바르지 않아요. 예: name@example.com'
    if (interests.includes('기타') && !otherInterest.trim()) errors.otherInterest = '기타 관심 분야를 입력해주세요.'
    if (!form.motive.trim()) errors.motive = '지원 동기를 입력해주세요.'
    if (!form.expectation.trim()) errors.expectation = '기대하는 활동을 입력해주세요.'
    if (!consent) errors.consent = '개인정보 수집·이용에 동의해야 제출할 수 있어요.'
    return errors
  }

  const resetForm = () => {
    setForm(initialForm)
    setInterests([])
    setOtherInterest('')
    setOtherGrade('')
    setConsent(false)
    setFieldErrors({})
    setError('')
    setSubmitted(false)
    setSentTo('')
  }

  useEffect(() => {
    if (submitted) doneRef.current?.focus()
  }, [submitted])

  // Props that tie an input to its message.
  const fieldProps = (name: FieldName) => ({
    'aria-invalid': fieldErrors[name] ? true : undefined,
    'aria-describedby': fieldErrors[name] ? `${name}-error` : undefined,
  })

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setSubmitted(false)

    const errors = validateForm()
    setFieldErrors(errors)
    const firstInvalid = (Object.keys(errors) as FieldName[])[0]
    if (firstInvalid) {
      document.getElementById(firstInvalid)?.focus()
      return
    }

    setLoading(true)
    try {
      await submitRecruitApplication({
        name: form.name.trim(),
        studentId: form.studentId.trim(),
        department: form.department.trim(),
        grade: gradeText === '선택 안 함' ? '' : gradeText,
        phone: form.phone.trim(),
        email: form.email.trim(),
        interests: interestList,
        motive: form.motive.trim(),
        experience: form.experience.trim(),
        expectation: form.expectation.trim(),
      })
      setSentTo(form.email.trim())
      setSubmitted(true)
    } catch (err) {
      setError(err.message || '지원서 제출 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full min-w-0 space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="apple-action-secondary px-4 py-2 text-sm"
      >
        메인으로 돌아가기
      </button>

      <section className="apple-board-shell">
        <div className="apple-board-hero px-6 py-8 sm:px-8 sm:py-10">
          <PageHeading className="apple-display mt-3 text-4xl sm:text-6xl">COM&apos;s 지원하기</PageHeading>
          <p className="apple-copy mt-5 max-w-3xl text-base sm:text-lg">
            로그인 없이 지원서를 작성할 수 있습니다. 작성한 내용은 웹페이지에서 바로 COM&apos;s 공식 메일로 제출됩니다.
          </p>
        </div>

        <div className="bg-[var(--app-surface)] px-6 pt-6 sm:px-8">
          <RecruitFacts extra={settingRows} />
        </div>

        <div className="grid gap-0 lg:grid-cols-[1fr_320px]">
          {submitted ? (
            <div role="status" className="grid content-start gap-4 bg-[var(--app-surface)] p-6 text-[var(--app-text)] sm:p-8">
              <div className="flex size-11 items-center justify-center rounded-lg bg-[var(--app-accent-soft)] text-[var(--app-accent-text)]">
                <CheckCircle2 size={22} />
              </div>
              <h2 ref={doneRef} tabIndex={-1} className="text-xl font-bold outline-none">지원서를 접수했어요</h2>
              <p className="break-all text-sm leading-6 text-[var(--app-muted)]">
                입력하신 <strong className="text-[var(--app-text)]">{sentTo}</strong> 주소로 확인 메일이 갈 수 있어요. 메일이 오지 않아도 접수는 정상적으로 끝났어요.
              </p>
              <p className="text-sm leading-6 text-[var(--app-muted)]">
                운영진이 내용을 확인한 뒤 지원서에 적은 연락처로 연락드려요. 진행 상황은 아래 &lsquo;지원 현황 확인&rsquo;에서 학번과 이름으로 볼 수 있어요.
              </p>
              <button type="button" onClick={resetForm} className="apple-action-secondary w-fit px-4 py-2 text-sm">다른 지원서 작성</button>
            </div>
          ) : (
          <form onSubmit={handleSubmit} noValidate className="grid gap-5 bg-[var(--app-surface)] p-6 text-[var(--app-text)] sm:p-8">
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-lg bg-[var(--app-accent-soft)] text-[var(--app-accent-text)]">
                <UserRound size={20} />
              </div>
              <div>
                <h2 className="text-xl font-bold">지원서 양식</h2>
                <p className="text-sm text-[var(--app-muted)]">기본 정보와 지원 동기를 작성해주세요.</p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="name">이름</label>
                <input id="name" name="name" value={form.name} onChange={handleChange} className={inputClass} placeholder="이름을 입력하세요" autoComplete="name" {...fieldProps('name')} />
                <FieldError name="name" errors={fieldErrors} />
              </div>
              <div>
                <label className={labelClass} htmlFor="studentId">학번</label>
                <input id="studentId" name="studentId" value={form.studentId} onChange={handleChange} className={inputClass} placeholder="10자리 학번" inputMode="numeric" autoComplete="username" {...fieldProps('studentId')} />
                <FieldError name="studentId" errors={fieldErrors} />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="department">학과</label>
                <input id="department" name="department" value={form.department} onChange={handleChange} className={inputClass} placeholder="학과를 입력하세요" {...fieldProps('department')} />
                <FieldError name="department" errors={fieldErrors} />
              </div>
              <div>
                <label className={labelClass} htmlFor="grade">학년</label>
                <select id="grade" name="grade" value={form.grade} onChange={handleChange} className={inputClass}>
                  <option value="">선택 안 함</option>
                  <option value="1학년">1학년</option>
                  <option value="2학년">2학년</option>
                  <option value="3학년">3학년</option>
                  <option value="4학년">4학년</option>
                  <option value="기타">기타</option>
                </select>
                {form.grade === '기타' && (
                  <input
                    id="otherGrade"
                    aria-label="기타 학년 정보"
                    {...fieldProps('otherGrade')}
                    value={otherGrade}
                    onChange={(event) => { setOtherGrade(event.target.value); setFieldErrors((prev) => ({ ...prev, otherGrade: undefined })) }}
                    maxLength={50}
                    placeholder="학년 정보를 입력하세요"
                    className={`${inputClass} mt-3`}
                  />
                )}
                <FieldError name="otherGrade" errors={fieldErrors} />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="phone">전화번호</label>
                <input id="phone" name="phone" value={form.phone} onChange={handleChange} className={inputClass} placeholder="010-1234-5678" inputMode="tel" autoComplete="tel" {...fieldProps('phone')} />
                <FieldError name="phone" errors={fieldErrors} />
              </div>
              <div>
                <label className={labelClass} htmlFor="email">이메일</label>
                <input id="email" name="email" type="email" value={form.email} onChange={handleChange} className={inputClass} placeholder="이메일을 입력하세요" autoComplete="email" {...fieldProps('email')} />
                <FieldError name="email" errors={fieldErrors} />
              </div>
            </div>

            <div>
              <label className={labelClass}>관심 분야</label>
              <div className="flex flex-wrap gap-2">
                {INTEREST_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => toggleInterest(option)}
                    className={`apple-chip px-4 py-2 text-sm ${
                      interests.includes(option)
                        ? 'apple-chip-active'
                        : ''
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
              {interests.includes('기타') && (
                <input
                  id="otherInterest"
                  aria-label="기타 관심 분야"
                  {...fieldProps('otherInterest')}
                  value={otherInterest}
                  onChange={(event) => { setOtherInterest(event.target.value); setFieldErrors((prev) => ({ ...prev, otherInterest: undefined })) }}
                  maxLength={100}
                  placeholder="기타 관심 분야를 입력하세요"
                  className={`${inputClass} mt-3`}
                />
              )}
              <FieldError name="otherInterest" errors={fieldErrors} />
            </div>

            <div>
              <label className={labelClass} htmlFor="motive">지원 동기</label>
              <textarea id="motive" name="motive" value={form.motive} onChange={handleChange} rows={4} maxLength={700} placeholder="COM's에 지원하게 된 이유를 적어주세요." className={`${inputClass} resize-none`} {...fieldProps('motive')} />
              <FieldError name="motive" errors={fieldErrors} />
            </div>

            <div>
              <label className={labelClass} htmlFor="experience">
                관련 경험 <span className="font-normal text-[var(--theme-body-muted)]">(선택사항)</span>
              </label>
              <textarea id="experience" name="experience" value={form.experience} onChange={handleChange} rows={3} maxLength={700} placeholder="프로그래밍 경험, 프로젝트, 스터디 경험 등이 있다면 적어주세요." className={`${inputClass} resize-none`} />
            </div>

            <div>
              <label className={labelClass} htmlFor="expectation">기대하는 활동</label>
              <textarea id="expectation" name="expectation" value={form.expectation} onChange={handleChange} rows={3} maxLength={700} placeholder="동아리에서 배우고 싶은 것, 해보고 싶은 활동을 적어주세요." className={`${inputClass} resize-none`} {...fieldProps('expectation')} />
              <FieldError name="expectation" errors={fieldErrors} />
            </div>

            <div className="rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface-soft)] p-4 text-sm leading-6 text-[var(--app-muted)]">
              <p className="font-semibold text-[var(--app-text)]">개인정보 수집·이용 안내</p>
              <dl className="mt-2 grid gap-2">
                {PRIVACY_NOTICE.map(([term, text]) => (
                  <div key={term} className="grid gap-0.5 sm:grid-cols-[4.5rem_1fr] sm:gap-3">
                    <dt className="font-semibold text-[var(--app-text)]">{term}</dt>
                    <dd>{text}</dd>
                  </div>
                ))}
              </dl>
              <label className="mt-3 flex items-start gap-2 font-semibold text-[var(--app-text)]" htmlFor="consent">
                <input
                  id="consent"
                  type="checkbox"
                  checked={consent}
                  onChange={(event) => { setConsent(event.target.checked); setFieldErrors((prev) => ({ ...prev, consent: undefined })) }}
                  {...fieldProps('consent')}
                  className="mt-1 size-4 shrink-0"
                />
                <span>개인정보 수집·이용에 동의합니다 (필수)</span>
              </label>
              <FieldError name="consent" errors={fieldErrors} />
            </div>

            {error && (
              <p className="rounded-lg bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="apple-action-primary inline-flex w-full items-center justify-center gap-2 px-4 py-3 text-base disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Send size={17} />
              {loading ? '제출 중...' : '지원서 제출하기'}
            </button>
          </form>
          )}

          <aside className="flex flex-col justify-between gap-8 bg-[var(--app-surface-soft)] p-6 sm:p-8">
            <div className="space-y-6">
              <div>
                <p className="text-sm font-semibold text-[var(--app-accent-text)]">Process</p>
                <div className="mt-4 space-y-3 text-sm leading-6 text-[var(--app-muted)]">
                  <p>1. 지원서 작성</p>
                  <p>2. 웹페이지에서 바로 제출</p>
                  <p>3. 내부 검토 후 개별 연락</p>
                </div>
              </div>

              <div className="rounded-lg border border-black/10 bg-[var(--app-surface)] p-4 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                <div className="flex items-center gap-2 text-sm font-semibold text-[var(--app-text)]">
                  <Mail size={16} />
                  문의
                </div>
                <a href="mailto:kwcoms69@gmail.com" className="mt-2 block break-all text-sm text-[var(--app-accent-text)] hover:text-[var(--app-accent-hover)]">
                  메일로 문의 (kwcoms69@gmail.com)
                </a>
              </div>
            </div>

            <p className="text-xs leading-5 text-[var(--app-subtle)]">
              제출 전 연락처와 이메일을 다시 확인해주세요. 제출 내용에 대한 연락은 작성한 연락처로 진행됩니다.
            </p>
          </aside>
        </div>
      </section>

      <RecruitStatusCheck />
    </div>
  )
}
