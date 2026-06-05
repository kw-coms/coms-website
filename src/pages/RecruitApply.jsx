import { useMemo, useState } from 'react'
import { CheckCircle2, Mail, Send, UserRound } from 'lucide-react'
import { submitRecruitApplication } from '../services/recruitApi.js'

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
  'w-full shape-cut-sm border border-black/10 bg-white/70 px-4 py-3 text-[15px] text-[var(--theme-body-dark)] outline-none placeholder:text-[var(--theme-body-muted)]/60 transition focus:bg-white focus:ring-2 focus:ring-emerald-300/60'
const labelClass = 'mb-2 block text-sm font-semibold text-[var(--theme-body-dark)]'

export default function RecruitApply({ onBack }) {
  const [form, setForm] = useState(initialForm)
  const [interests, setInterests] = useState([])
  const [otherInterest, setOtherInterest] = useState('')
  const [otherGrade, setOtherGrade] = useState('')
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)

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
  }

  const toggleInterest = (option) => {
    setInterests((prev) => (
      prev.includes(option)
        ? prev.filter((item) => item !== option)
        : [...prev, option]
    ))
  }

  const validateForm = () => {
    if (!form.name.trim()) return '이름을 입력해주세요.'
    if (!form.studentId.trim()) return '학번을 입력해주세요.'
    if (!/^\d{10}$/.test(form.studentId.trim())) return '학번은 숫자 10자리로 입력해주세요.'
    if (!form.department.trim()) return '학과를 입력해주세요.'
    if (form.grade === '기타' && !otherGrade.trim()) return '기타 학년 정보를 입력해주세요.'
    if (!form.phone.trim()) return '전화번호를 입력해주세요.'
    if (!form.email.trim()) return '이메일을 입력해주세요.'
    if (!form.email.includes('@')) return '올바른 이메일 형식이 아닙니다.'
    if (interests.includes('기타') && !otherInterest.trim()) return '기타 관심 분야를 입력해주세요.'
    if (!form.motive.trim()) return '지원 동기를 입력해주세요.'
    if (!form.expectation.trim()) return '기대하는 활동을 입력해주세요.'
    return ''
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setSubmitted(false)

    const validationMessage = validateForm()
    if (validationMessage) {
      setError(validationMessage)
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
      setSubmitted(true)
    } catch (err) {
      setError(err.message || '지원서 제출 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="shape-cut-sm border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-[var(--theme-text)] transition hover:bg-white/15"
      >
        메인으로 돌아가기
      </button>

      <section className="shape-cut overflow-hidden border border-white/10 bg-white/5 text-[var(--theme-text)] shadow-[0_22px_70px_rgba(255,255,255,0.12)] backdrop-blur-md">
        <div className="border-b border-white/10 bg-emerald-300/8 px-6 py-6 sm:px-8">
          <p className="text-sm font-semibold uppercase tracking-[0.35em] text-emerald-200">Recruit</p>
          <h1 className="mt-4 text-3xl font-semibold leading-tight sm:text-5xl">COM&apos;s 지원하기</h1>
          <p className="mt-4 max-w-3xl leading-7 text-white/72">
            로그인 없이 지원서를 작성할 수 있습니다. 작성한 내용은 웹페이지에서 바로 COM&apos;s 공식 메일로 제출됩니다.
          </p>
        </div>

        <div className="grid gap-0 lg:grid-cols-[1fr_320px]">
          <form onSubmit={handleSubmit} className="grid gap-5 bg-[var(--theme-surface-96)] p-6 text-[var(--theme-body-dark)] sm:p-8">
            <div className="flex items-center gap-3">
              <div className="shape-cut-sm flex size-11 items-center justify-center bg-emerald-100 text-emerald-700">
                <UserRound size={20} />
              </div>
              <div>
                <h2 className="text-xl font-bold">지원서 양식</h2>
                <p className="text-sm text-[var(--theme-body-muted)]">기본 정보와 지원 동기를 작성해주세요.</p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="name">이름</label>
                <input id="name" name="name" value={form.name} onChange={handleChange} className={inputClass} placeholder="이름을 입력하세요" autoComplete="name" />
              </div>
              <div>
                <label className={labelClass} htmlFor="studentId">학번</label>
                <input id="studentId" name="studentId" value={form.studentId} onChange={handleChange} className={inputClass} placeholder="10자리 학번" inputMode="numeric" autoComplete="username" />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="department">학과</label>
                <input id="department" name="department" value={form.department} onChange={handleChange} className={inputClass} placeholder="학과를 입력하세요" />
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
                    value={otherGrade}
                    onChange={(event) => setOtherGrade(event.target.value)}
                    maxLength={50}
                    placeholder="학년 정보를 입력하세요"
                    className={`${inputClass} mt-3`}
                  />
                )}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="phone">전화번호</label>
                <input id="phone" name="phone" value={form.phone} onChange={handleChange} className={inputClass} placeholder="01012345678" inputMode="tel" autoComplete="tel" />
              </div>
              <div>
                <label className={labelClass} htmlFor="email">이메일</label>
                <input id="email" name="email" type="email" value={form.email} onChange={handleChange} className={inputClass} placeholder="이메일을 입력하세요" autoComplete="email" />
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
                    className={`shape-cut-sm px-4 py-2 text-sm font-semibold transition ${
                      interests.includes(option)
                        ? 'bg-[var(--theme-body-dark)] text-white'
                        : 'border border-black/10 bg-white/60 text-[var(--theme-body-dark)] hover:bg-white/90'
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
              {interests.includes('기타') && (
                <input
                  value={otherInterest}
                  onChange={(event) => setOtherInterest(event.target.value)}
                  maxLength={100}
                  placeholder="기타 관심 분야를 입력하세요"
                  className={`${inputClass} mt-3`}
                />
              )}
            </div>

            <div>
              <label className={labelClass} htmlFor="motive">지원 동기</label>
              <textarea id="motive" name="motive" value={form.motive} onChange={handleChange} rows={4} maxLength={700} placeholder="COM's에 지원하게 된 이유를 적어주세요." className={`${inputClass} resize-none`} />
            </div>

            <div>
              <label className={labelClass} htmlFor="experience">
                관련 경험 <span className="font-normal text-[var(--theme-body-muted)]">(선택사항)</span>
              </label>
              <textarea id="experience" name="experience" value={form.experience} onChange={handleChange} rows={3} maxLength={700} placeholder="프로그래밍 경험, 프로젝트, 스터디 경험 등이 있다면 적어주세요." className={`${inputClass} resize-none`} />
            </div>

            <div>
              <label className={labelClass} htmlFor="expectation">기대하는 활동</label>
              <textarea id="expectation" name="expectation" value={form.expectation} onChange={handleChange} rows={3} maxLength={700} placeholder="동아리에서 배우고 싶은 것, 해보고 싶은 활동을 적어주세요." className={`${inputClass} resize-none`} />
            </div>

            {error && (
              <p className="shape-cut-sm bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>
            )}

            {submitted && (
              <p className="shape-cut-sm flex items-center gap-2 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-700">
                <CheckCircle2 size={16} />
                지원서가 제출되었습니다. 확인 후 개별 연락드리겠습니다.
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="shape-cut-sm inline-flex w-full items-center justify-center gap-2 bg-[var(--theme-body-dark)] px-4 py-3 text-base font-semibold text-white transition hover:bg-[var(--theme-body-soft)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Send size={17} />
              {loading ? '제출 중...' : '지원서 제출하기'}
            </button>
          </form>

          <aside className="flex flex-col justify-between gap-8 bg-emerald-950/22 p-6 sm:p-8">
            <div className="space-y-6">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.28em] text-emerald-200">Process</p>
                <div className="mt-4 space-y-3 text-sm leading-6 text-white/78">
                  <p>1. 지원서 작성</p>
                  <p>2. 웹페이지에서 바로 제출</p>
                  <p>3. 내부 검토 후 개별 연락</p>
                </div>
              </div>

              <div className="shape-cut-sm border border-white/10 bg-white/8 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-emerald-100">
                  <Mail size={16} />
                  문의
                </div>
                <a href="mailto:kwcoms69@gmail.com" className="mt-2 block break-all text-sm text-white/75 hover:text-white">
                  kwcoms69@gmail.com
                </a>
              </div>
            </div>

            <p className="text-xs leading-5 text-white/52">
              제출 전 연락처와 이메일을 다시 확인해주세요. 제출 내용에 대한 연락은 작성한 연락처로 진행됩니다.
            </p>
          </aside>
        </div>
      </section>
    </div>
  )
}
