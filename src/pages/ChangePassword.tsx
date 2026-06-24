import { useEffect, useState } from 'react'
import {
  changePassword,
  confirmEmailVerification,
  requestEmailVerification,
  updateProfile,
} from '../services/authApi'
import { listFonts } from '../services/fontApi'
import { BUILT_IN_FONTS, fontFamilyValue } from '../services/fontPreferences'
import { listProfileMiniAppDocuments } from '../services/miniAppsApi'
import { useAuth } from '../contexts/useAuth'
import { getLogoAsset } from '../utils/logoAssets'
import { showToast } from '../components/common/Toast'
import { PASSWORD_PATTERN, PASSWORD_MESSAGE } from '../utils/passwordPolicy'
const OTHER_INTEREST = '기타'
const INTEREST_OPTIONS = ['보안', '웹', '앱']

function choiceButtonClass(active) {
  return `min-h-11 rounded-lg px-4 py-2 text-sm font-semibold transition ${
    active
      ? 'bg-[#0071e3] text-white'
      : 'border border-black/10 bg-[#f5f5f7] text-[#1d1d1f] hover:bg-white'
  }`
}

function parseInterests(value) {
  const selected = []
  const custom = []

  String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((item) => {
      if (INTEREST_OPTIONS.includes(item)) {
        if (!selected.includes(item)) selected.push(item)
        return
      }

      const otherValue = item.startsWith(`${OTHER_INTEREST}:`)
        ? item.slice(`${OTHER_INTEREST}:`.length).trim()
        : item
      if (otherValue) custom.push(otherValue)
    })

  if (custom.length > 0) selected.push(OTHER_INTEREST)
  return { selected, other: custom.join(' / ') }
}

function InterestsSelector({ selected, onChange, otherText, onOtherChange, inputClass, frameClass }: any) {
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
            aria-pressed={selected.includes(option)}
            className={choiceButtonClass(selected.includes(option))}
          >
            {option}
          </button>
        ))}
      </div>
      {hasOther && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-[var(--theme-body-muted)]/80">기타 관심 분야</p>
          <div className={frameClass}>
            <input
              value={otherText}
              onChange={(event) => onOtherChange(event.target.value)}
              placeholder="기타 관심 분야를 입력하세요"
              maxLength={100}
              className={inputClass}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default function ChangePassword({ onBack }: any) {
  const { user, refreshUser, setUser } = useAuth()
  const [profileDraft, setProfileDraft] = useState<any>({})
  const [verificationCode, setVerificationCode] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [profileMessage, setProfileMessage] = useState('')
  const [emailMessage, setEmailMessage] = useState('')
  const [passwordMessage, setPasswordMessage] = useState('')
  const [interestDraft, setInterestDraft] = useState(null)
  const [otherInterestDraft, setOtherInterestDraft] = useState(null)
  const [error, setError] = useState('')
  const [loadingAction, setLoadingAction] = useState('')
  const [fonts, setFonts] = useState([])
  const [miniAppDocuments, setMiniAppDocuments] = useState({ worldcup: [], tier: [] })

  useEffect(() => {
    let mounted = true
    listFonts()
      .then((data) => { if (mounted) setFonts(data) })
      .catch(() => { if (mounted) setFonts([]) })
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    if (!user?.studentId) {
      return undefined
    }

    let mounted = true
    Promise.allSettled([
      listProfileMiniAppDocuments('worldcup'),
      listProfileMiniAppDocuments('tier'),
    ])
      .then(([worldcup, tier]) => {
        if (!mounted) return
        setMiniAppDocuments({
          worldcup: worldcup.status === 'fulfilled' && Array.isArray(worldcup.value) ? worldcup.value : [],
          tier: tier.status === 'fulfilled' && Array.isArray(tier.value) ? tier.value : [],
        })
      })

    return () => { mounted = false }
  }, [user?.studentId])

  const parsedInterests = parseInterests(user?.interests)
  const selectedInterests = interestDraft ?? parsedInterests.selected
  const otherInterest = otherInterestDraft ?? parsedInterests.other
  const profileForm = {
    phone: profileDraft.phone ?? user?.phone ?? '',
    aspiration: profileDraft.aspiration ?? user?.aspiration ?? '',
    selectedFontValue: profileDraft.selectedFontValue ?? user?.selectedBuiltinFontKey ?? user?.selectedFontId ?? '',
  }
  const selectableFonts = [...BUILT_IN_FONTS, ...fonts]
  const selectedFont = selectableFonts.find((font) => String(font.id) === String(profileForm.selectedFontValue))
  const passwordChecks = [
    { label: '8자 이상', ok: newPassword.length >= 8 },
    { label: '영문 포함', ok: /[A-Za-z]/.test(newPassword) },
    { label: '숫자 포함', ok: /\d/.test(newPassword) },
    { label: '특수문자 포함', ok: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(newPassword) },
    { label: '공백 없음', ok: newPassword.length > 0 && !/\s/.test(newPassword) },
  ]

  const panelClass = 'rounded-lg border border-black/10 bg-white/88 p-5 text-[#1d1d1f] shadow-[0_24px_70px_rgba(0,0,0,0.1)] backdrop-blur-xl sm:p-8'
  const frameClass = 'rounded-lg bg-black/10 p-px'
  const inputClass = 'w-full rounded-lg bg-white px-4 py-3 text-[#1d1d1f] outline-none placeholder:text-[var(--app-subtle)] transition focus:ring-2 focus:ring-[#0071e3]/24'
  const textareaClass = `${inputClass} min-h-28 resize-y leading-6`
  const btnClass = 'rounded-lg border border-black/10 bg-white px-4 py-2.5 font-semibold text-[#1d1d1f] shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition hover:bg-[#f5f5f7] disabled:cursor-wait disabled:opacity-60'
  const primaryBtnClass = 'rounded-lg bg-[#0071e3] px-4 py-2.5 font-semibold text-white shadow-[0_10px_28px_rgba(0,113,227,0.22)] transition hover:bg-[#0077ed] disabled:cursor-wait disabled:opacity-60'
  const cardClass = 'rounded-lg border border-black/10 bg-[#f5f5f7] p-4 shadow-[0_1px_2px_rgba(0,0,0,0.05)] sm:p-5'
  const fieldCardClass = 'rounded-lg border border-black/8 bg-white/70 p-3'
  const helperTextClass = 'text-xs leading-5 text-[var(--app-subtle)]'
  const miniAppProfiles = [
    {
      key: 'worldcup',
      label: 'COMS 월드컵',
      description: '내가 만든 월드컵과 플레이 결과',
      href: 'https://coms.kw.ac.kr/worldcup/',
      documents: miniAppDocuments.worldcup,
    },
    {
      key: 'tier',
      label: 'COMS 티어표',
      description: '내가 만든 티어표와 저장한 결과',
      href: 'https://coms.kw.ac.kr/tier/',
      documents: miniAppDocuments.tier,
    },
  ]

  const resetMessages = () => {
    setError('')
    setProfileMessage('')
    setEmailMessage('')
    setPasswordMessage('')
  }

  const handleProfileSubmit = async (e) => {
    e.preventDefault()
    resetMessages()
    setLoadingAction('profile')

    const interestList = selectedInterests
      .map((interest) => (interest === OTHER_INTEREST ? `${OTHER_INTEREST}: ${otherInterest.trim()}` : interest))
      .filter((interest) => interest.trim() && interest !== `${OTHER_INTEREST}:`)

    try {
      const updated = await updateProfile({
        phone: profileForm.phone.trim() || null,
        aspiration: profileForm.aspiration.trim() || null,
        interests: interestList.length > 0 ? interestList.join(', ') : null,
        selectedFontId: profileForm.selectedFontValue && !String(profileForm.selectedFontValue).startsWith('b:')
          ? Number(profileForm.selectedFontValue)
          : null,
        selectedBuiltinFontKey: String(profileForm.selectedFontValue).startsWith('b:')
          ? profileForm.selectedFontValue
          : null,
      })
      setUser(updated)
      setProfileDraft({})
      setInterestDraft(null)
      setOtherInterestDraft(null)
      setProfileMessage('회원 정보가 저장되었습니다.')
      showToast({ message: '회원 정보가 저장되었습니다.', tone: 'success' })
    } catch (err) {
      setError(err.message || '회원 정보 저장 중 오류가 발생했습니다.')
    } finally {
      setLoadingAction('')
    }
  }

  const handleRequestEmailCode = async () => {
    resetMessages()
    setLoadingAction('emailRequest')

    try {
      const result = await requestEmailVerification()
      setEmailMessage(result.message || '인증코드를 이메일로 보냈습니다.')
      await refreshUser()
    } catch (err) {
      setError(err.message || '이메일 인증코드 요청 중 오류가 발생했습니다.')
    } finally {
      setLoadingAction('')
    }
  }

  const handleConfirmEmailCode = async (e) => {
    e.preventDefault()
    resetMessages()

    if (!/^\d{6}$/.test(verificationCode.trim())) {
      setError('인증코드는 숫자 6자리로 입력해주세요.')
      return
    }

    setLoadingAction('emailConfirm')
    try {
      const result = await confirmEmailVerification(verificationCode.trim())
      setEmailMessage(result.message || '이메일 인증이 완료되었습니다.')
      setVerificationCode('')
      await refreshUser()
    } catch (err) {
      setError(err.message || '이메일 인증 중 오류가 발생했습니다.')
    } finally {
      setLoadingAction('')
    }
  }

  const handlePasswordSubmit = async (e) => {
    e.preventDefault()
    resetMessages()

    if (!PASSWORD_PATTERN.test(newPassword)) {
      setError(PASSWORD_MESSAGE)
      return
    }
    if (newPassword !== confirmPassword) {
      setError('새 비밀번호가 일치하지 않습니다.')
      return
    }

    setLoadingAction('password')
    try {
      await changePassword(currentPassword, newPassword)
      setPasswordMessage('비밀번호가 변경되었습니다.')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      setError(err.message || '비밀번호 변경 중 오류가 발생했습니다.')
    } finally {
      setLoadingAction('')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-center sm:justify-start">
        <button
          type="button"
          onClick={onBack}
          className="rounded-full border border-black/10 bg-white/80 px-4 py-2 text-sm font-semibold text-[#1d1d1f] shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition hover:bg-white"
        >
          돌아가기
        </button>
      </div>

      <div className="rounded-lg bg-white/70 p-px shadow-[0_24px_70px_rgba(0,0,0,0.1)]">
        <section className={panelClass}>
          <div className="mb-5 flex flex-col items-center gap-3 text-center sm:mb-6 sm:flex-row sm:items-center sm:gap-4 sm:text-left">
            <img src={getLogoAsset('COMs_logo_vec')} alt="KW COM's" className="h-10 w-10 flex-shrink-0 object-contain sm:h-12 sm:w-12" />
            <div className="min-w-0">
              <h2 className="text-lg font-bold leading-snug sm:text-xl">계정 설정</h2>
              <p className="text-sm leading-5 text-[var(--theme-body-muted)]/85">회원 정보, 이메일 인증, 비밀번호를 관리합니다.</p>
            </div>
          </div>

          {error && <div className="mb-4 text-sm text-red-500">{error}</div>}

          <form onSubmit={handleProfileSubmit} className={`${cardClass} space-y-4`}>
            <div>
              <h3 className="text-base font-bold">회원 정보</h3>
              <p className={helperTextClass}>연락처, 관심 분야, 사이트 표시 설정을 따로 관리합니다.</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className={fieldCardClass}>
                <label className="mb-2 block text-sm text-[var(--theme-body-muted)]/90">이름</label>
                <div className={frameClass}>
                  <input value={user?.name || ''} className={inputClass} disabled />
                </div>
              </div>
              <div className={fieldCardClass}>
                <label className="mb-2 block text-sm text-[var(--theme-body-muted)]/90">학번</label>
                <div className={frameClass}>
                  <input value={user?.studentId || ''} className={inputClass} disabled />
                </div>
              </div>
            </div>

            <div className={fieldCardClass}>
              <label className="mb-2 block text-sm text-[var(--theme-body-muted)]/90">전화번호</label>
              <div className={frameClass}>
                <input
                  value={profileForm.phone}
                  onChange={(e) => setProfileDraft((prev) => ({ ...prev, phone: e.target.value }))}
                  placeholder="01012345678"
                  autoComplete="tel"
                  maxLength={20}
                  className={inputClass}
                />
              </div>
            </div>

            <div className={fieldCardClass}>
              <label className="mb-2 block text-sm text-[var(--theme-body-muted)]/90">
                관심 분야 <span className="font-normal text-[var(--theme-body-muted)]">(복수 선택 가능)</span>
              </label>
              <InterestsSelector
                selected={selectedInterests}
                onChange={setInterestDraft}
                otherText={otherInterest}
                onOtherChange={setOtherInterestDraft}
                inputClass={inputClass}
                frameClass={frameClass}
              />
            </div>

            <div className={fieldCardClass}>
              <label htmlFor="account-font-select" className="mb-2 block text-sm text-[var(--theme-body-muted)]/90">사이트 폰트</label>
              <div className={frameClass}>
                <select
                  id="account-font-select"
                  value={profileForm.selectedFontValue}
                  onChange={(e) => setProfileDraft((prev) => ({ ...prev, selectedFontValue: e.target.value }))}
                  className={inputClass}
                >
                  <option value="">기본 고딕체</option>
                  {selectableFonts.map((font) => (
                    <option key={font.id} value={font.id}>{font.name}</option>
                  ))}
                </select>
              </div>
              <p
                data-testid="account-font-preview"
                className="mt-3 rounded-lg border border-black/10 bg-white px-4 py-3 text-base text-[#1d1d1f]"
                style={{ fontFamily: fontFamilyValue(selectedFont) }}
              >
                한글 English 123 · 선택한 폰트 미리보기
              </p>
            </div>

            <div className={fieldCardClass}>
              <label className="mb-2 block text-sm text-[var(--theme-body-muted)]/90">포부</label>
              <div className={frameClass}>
                <textarea
                  value={profileForm.aspiration}
                  onChange={(e) => setProfileDraft((prev) => ({ ...prev, aspiration: e.target.value }))}
                  placeholder="COM's에서 해보고 싶은 활동이나 목표를 적어주세요"
                  maxLength={2000}
                  className={textareaClass}
                />
              </div>
            </div>

            {profileMessage && <div className="text-sm text-[#0066cc]">{profileMessage}</div>}

            <button type="submit" className={primaryBtnClass} disabled={loadingAction === 'profile'}>
              {loadingAction === 'profile' ? '저장 중...' : '회원 정보 저장'}
            </button>
          </form>

          <div className={`${cardClass} mt-4`}>
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h3 className="text-base font-bold">미니앱 저장함</h3>
                <p className={helperTextClass}>월드컵과 티어표에서 저장한 템플릿·결과를 COMS 계정 기준으로 모아봅니다.</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {miniAppProfiles.map((profile) => {
                const sharedCount = profile.documents.filter((document) => document.shared).length
                return (
                  <a
                    key={profile.key}
                    href={profile.href}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border border-black/10 bg-white/72 p-4 text-left shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition hover:-translate-y-0.5 hover:bg-white"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-[#0066cc]">{profile.label}</p>
                        <p className="mt-1 text-xs font-semibold leading-5 text-[var(--app-subtle)]">{profile.description}</p>
                      </div>
                      <span className="rounded-full bg-[#e8f3ff] px-2.5 py-1 text-xs font-bold text-[#0066cc]">
                        {profile.documents.length}개
                      </span>
                    </div>
                    <p className="mt-3 text-xs font-semibold text-[#6e6e73]">공유 중 {sharedCount}개</p>
                    <div className="mt-3 space-y-1">
                      {profile.documents.slice(0, 2).map((document) => (
                        <p key={`${document.contentType}-${document.contentId}`} className="truncate text-sm font-semibold text-[#1d1d1f]">
                          {document.contentType === 'result' ? '결과' : '템플릿'} · {document.title}
                        </p>
                      ))}
                      {profile.documents.length === 0 && (
                        <p className="text-sm font-semibold text-[var(--app-subtle)]">아직 저장한 항목이 없습니다.</p>
                      )}
                    </div>
                  </a>
                )
              })}
            </div>
          </div>

          <div className={`${cardClass} mt-4`}>
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-semibold">이메일 인증</h3>
                <p className="text-sm text-[var(--theme-body-muted)]/85">{user?.email || '-'}</p>
                <p className={helperTextClass}>인증이 필요한 기능을 쓰기 전에 이메일 상태를 확인합니다.</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${user?.emailVerified ? 'bg-[#e8f3ff] text-[#0066cc]' : 'bg-amber-100 text-amber-800'}`}>
                {user?.emailVerified ? '인증 완료' : '미인증'}
              </span>
            </div>

            {!user?.emailVerified && (
              <form onSubmit={handleConfirmEmailCode} className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
                <div className={frameClass}>
                  <input
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value)}
                    placeholder="6자리 인증코드"
                    inputMode="numeric"
                    maxLength={6}
                    className={inputClass}
                  />
                </div>
                <button type="button" onClick={handleRequestEmailCode} className={btnClass} disabled={loadingAction === 'emailRequest'}>
                  {loadingAction === 'emailRequest' ? '발송 중...' : '코드 받기'}
                </button>
                <button type="submit" className={btnClass} disabled={loadingAction === 'emailConfirm'}>
                  {loadingAction === 'emailConfirm' ? '확인 중...' : '인증 확인'}
                </button>
              </form>
            )}

            {emailMessage && <div className="mt-3 text-sm text-[#0066cc]">{emailMessage}</div>}
          </div>

          <form onSubmit={handlePasswordSubmit} className={`${cardClass} mt-4 space-y-4`}>
            <div>
              <h3 className="font-semibold">비밀번호 변경</h3>
              <p className={helperTextClass}>현재 비밀번호와 새 비밀번호 입력 영역을 분리했습니다.</p>
            </div>
            <div className={fieldCardClass}>
              <label className="mb-2 block text-sm text-[var(--theme-body-muted)]/90">현재 비밀번호</label>
              <div className={frameClass}>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="현재 비밀번호를 입력하세요"
                  autoComplete="current-password"
                  className={inputClass}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className={fieldCardClass}>
                <label className="mb-2 block text-sm text-[var(--theme-body-muted)]/90">새 비밀번호</label>
                <div className={frameClass}>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="8자 이상, 영문·숫자·특수문자 포함"
                    autoComplete="new-password"
                    className={inputClass}
                  />
                </div>
              </div>
              <div className={fieldCardClass}>
                <label className="mb-2 block text-sm text-[var(--theme-body-muted)]/90">새 비밀번호 확인</label>
                <div className={frameClass}>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="새 비밀번호를 다시 입력하세요"
                    autoComplete="new-password"
                    className={inputClass}
                  />
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-black/8 bg-white/70 p-3">
              <p className="mb-2 text-xs font-bold text-[var(--theme-body-muted)]/85">비밀번호 조건</p>
              <div className="flex flex-wrap gap-2">
                {passwordChecks.map((check) => (
                  <span
                    key={check.label}
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      check.ok ? 'bg-[#e8f3ff] text-[#0066cc]' : 'bg-white/64 text-[var(--theme-body-muted)]'
                    }`}
                  >
                    {check.ok ? '✓ ' : ''}{check.label}
                  </span>
                ))}
              </div>
            </div>

            {passwordMessage && <div className="text-sm text-[#0066cc]">{passwordMessage}</div>}

            <button type="submit" className={btnClass} disabled={loadingAction === 'password'}>
              {loadingAction === 'password' ? '변경 중...' : '비밀번호 변경'}
            </button>

            <p className={helperTextClass}>
              비밀번호는 8자 이상, 영문·숫자·특수문자를 모두 포함해야 하며 공백은 사용할 수 없습니다.
            </p>
          </form>
        </section>
      </div>
    </div>
  )
}
