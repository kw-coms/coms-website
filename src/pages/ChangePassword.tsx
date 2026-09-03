import { useEffect, useState } from 'react'
import {
  changePassword,
  confirmEmailVerification,
  requestEmailVerification,
  updateProfile,
} from '../services/authApi'
import { listFonts } from '../services/fontApi'
import { BUILT_IN_FONTS, fontFamilyValue, injectBuiltinFontStylesheet } from '../services/fontPreferences'
import { listProfileMiniAppDocuments } from '../services/miniAppsApi'
import { getNotificationPreferences, updateNotificationPreferences } from '../services/notificationApi'
import {
  getPushPermission,
  isPushAvailable,
  isPushEnabledOnServer,
  subscribeToPush,
  unsubscribeFromPush,
} from '../services/webPush'
import { useAuth } from '../contexts/useAuth'
import { getLogoAsset } from '../utils/logoAssets'
import { showToast } from '../components/common/Toast'
import { PASSWORD_PATTERN, PASSWORD_MESSAGE } from '../utils/passwordPolicy'
import { getClubRoom } from '../services/siteSettingsApi'
import { canSeeClubRoom } from '../utils/roleAccess'
const OTHER_INTEREST = '기타'
const INTEREST_OPTIONS = ['보안', '웹', '앱']

function choiceButtonClass(active) {
  return `min-h-11 rounded-lg px-4 py-2 text-sm font-semibold transition ${
    active
      ? 'bg-[var(--app-accent)] text-white'
      : 'border border-black/10 bg-[var(--app-surface-soft)] text-[var(--app-text)] hover:bg-white'
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

function InterestsSelector({ selected, onChange, otherText, onOtherChange, inputClass, frameClass }: {
  selected: string[]
  onChange: (next: string[]) => void
  otherText: string
  onOtherChange: (value: string) => void
  inputClass: string
  frameClass: string
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
              aria-label="기타 관심 분야"
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

const NOTIFICATION_CATEGORIES = [
  { key: 'commentOnPost', label: '내 글의 새 댓글', description: '내가 쓴 게시글에 댓글이 달리면 알려드립니다.' },
  { key: 'replyOnComment', label: '내 댓글의 답글', description: '내가 쓴 댓글에 답글이 달리면 알려드립니다.' },
  { key: 'noticeCreated', label: '새 공지사항', description: '새로운 공지가 등록되면 알려드립니다.' },
  { key: 'externalInvite', label: '초대 알림', description: '다른 회원이 보낸 초대를 알려드립니다.' },
  { key: 'communityPostRestored', label: '글 복원 안내', description: '내 글이 삭제 보관함에서 복원되면 알려드립니다.' },
  { key: 'communityPostDeleted', label: '글 삭제 안내', description: '내 글이 관리자에 의해 삭제되면 알려드립니다.' },
  { key: 'recruitApplication', label: '새 지원서 (관리자)', description: '새 지원서가 도착하면 알려드립니다.' },
]

function NotificationToggle({ checked, onChange, label, description, disabled }: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  description: string
  disabled?: boolean
}) {
  return (
    <label className="flex items-start justify-between gap-4 rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] p-3">
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-[var(--app-text)]">{label}</span>
        <span className="mt-0.5 block text-xs leading-5 text-[var(--app-subtle)]">{description}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]/40 disabled:cursor-wait disabled:opacity-60 ${
          checked ? 'bg-[var(--app-accent)]' : 'bg-black/20'
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
            checked ? 'translate-x-5' : 'translate-x-1'
          }`}
        />
      </button>
    </label>
  )
}

const PUSH_ENABLED_STORAGE_KEY = 'coms.push.enabled'

// Device push opt-in. Renders nothing unless the browser supports push, the
// Firebase web config is present, and the server reports push enabled — so an
// unconfigured deploy shows no dead control. Permission is only requested from
// the explicit toggle click, never on load.
function PushNotificationCard({ helperTextClass }: { helperTextClass: string }) {
  const [supported] = useState(isPushAvailable)
  const [available, setAvailable] = useState(false)
  const [ready, setReady] = useState(false)
  const [permission, setPermission] = useState(getPushPermission)
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!supported) return
    let mounted = true
    isPushEnabledOnServer().then((serverEnabled) => {
      if (!mounted) return
      setAvailable(serverEnabled)
      if (serverEnabled) {
        const stored = window.localStorage.getItem(PUSH_ENABLED_STORAGE_KEY) === 'true'
        setEnabled(stored && getPushPermission() === 'granted')
      }
      setReady(true)
    })
    return () => { mounted = false }
  }, [supported])

  const persistEnabled = (next: boolean) => {
    try { window.localStorage.setItem(PUSH_ENABLED_STORAGE_KEY, String(next)) } catch { /* ignore quota */ }
    setEnabled(next)
  }

  const handleToggle = async (next: boolean) => {
    if (busy) return
    setBusy(true)
    try {
      if (next) {
        const result = await subscribeToPush()
        setPermission(getPushPermission())
        if (result.status === 'subscribed') {
          persistEnabled(true)
          showToast({ message: '이 기기에서 푸시 알림을 켰습니다.', tone: 'success' })
        } else if (result.status === 'denied') {
          showToast({ message: '브라우저에서 알림 권한이 차단되어 있습니다. 브라우저 설정에서 허용해 주세요.', tone: 'error' })
        } else if (result.status === 'error') {
          showToast({ message: result.message, tone: 'error' })
        }
      } else {
        await unsubscribeFromPush()
        persistEnabled(false)
        showToast({ message: '이 기기에서 푸시 알림을 껐습니다.', tone: 'success' })
      }
    } finally {
      setBusy(false)
    }
  }

  if (!supported || !ready || !available) return null

  const blocked = permission === 'denied'
  return (
    <div className="space-y-2">
      <NotificationToggle
        label="이 기기 푸시 알림"
        description={blocked
          ? '브라우저에서 알림이 차단되어 있습니다. 브라우저 설정에서 이 사이트의 알림을 허용해 주세요.'
          : '이 브라우저에서 푸시 알림을 받습니다. 처음 켤 때 브라우저 권한을 요청합니다.'}
        checked={enabled && !blocked}
        disabled={busy || blocked}
        onChange={handleToggle}
      />
      <p className={helperTextClass}>알림 종류별 수신 여부는 아래에서 조정할 수 있습니다.</p>
    </div>
  )
}

function ClubRoomSection({ cardClass, helperTextClass }: { cardClass: string; helperTextClass: string }) {
  const [doorCode, setDoorCode] = useState<string | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true
    getClubRoom()
      .then((data) => { if (mounted) setDoorCode(data?.doorCode || '') })
      .catch(() => { if (mounted) setError('동아리방 정보를 불러오지 못했습니다.') })
    return () => { mounted = false }
  }, [])

  return (
    <div className={`${cardClass} mt-4`}>
      <h3 className="text-base font-bold">동아리방</h3>
      <p className={helperTextClass}>동아리방 출입 비밀번호는 회원에게만 표시됩니다. 외부에 공유하지 마세요.</p>
      {error && <p className="mt-2 text-sm font-semibold text-red-500">{error}</p>}
      {!error && doorCode !== null && (
        doorCode === '' ? (
          <p className="mt-3 text-sm font-semibold text-[var(--app-subtle)]">아직 등록된 비밀번호가 없습니다.</p>
        ) : (
          <div className="mt-3 flex items-center gap-3">
            <span className="rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] px-4 py-2 font-mono text-lg font-bold tracking-[0.2em] text-[var(--app-text)]">
              {revealed ? doorCode : '•'.repeat(Math.max(doorCode.length, 4))}
            </span>
            <button
              type="button"
              onClick={() => setRevealed((value) => !value)}
              className="rounded-full border border-[var(--app-hairline)] bg-[var(--app-surface)] px-3 py-1.5 text-xs font-bold text-[var(--app-muted)] transition hover:text-[var(--app-text)]"
            >
              {revealed ? '가리기' : '보기'}
            </button>
          </div>
        )
      )}
    </div>
  )
}

function NotificationPreferencesSection({ cardClass, helperTextClass, primaryBtnClass }: {
  cardClass: string
  helperTextClass: string
  primaryBtnClass: string
}) {
  const [prefs, setPrefs] = useState<Record<string, boolean> | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    let mounted = true
    getNotificationPreferences()
      .then((data) => { if (mounted) { setPrefs(data); setLoading(false) } })
      .catch((err) => {
        if (mounted) { setLoadError(err?.message || '알림 설정을 불러오지 못했습니다.'); setLoading(false) }
      })
    return () => { mounted = false }
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!prefs) return
    setSaving(true)
    try {
      const updated = await updateNotificationPreferences(prefs)
      setPrefs(updated)
      showToast({ message: '알림 설정이 저장되었습니다.', tone: 'success' })
    } catch (err) {
      showToast({ message: err?.message || '알림 설정 저장 중 오류가 발생했습니다.', tone: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className={`${cardClass} mt-4 space-y-4`}>
      <div>
        <h3 className="text-base font-bold">알림 설정</h3>
        <p className={helperTextClass}>받고 싶은 알림 종류를 선택할 수 있습니다. 끈 항목은 더 이상 받지 않습니다.</p>
      </div>

      <PushNotificationCard helperTextClass={helperTextClass} />

      {loading && <p className={helperTextClass}>알림 설정을 불러오는 중...</p>}
      {loadError && <p className="text-sm text-red-500">{loadError}</p>}

      {!loading && !loadError && prefs && (
        <>
          <div className="space-y-2">
            {NOTIFICATION_CATEGORIES.map((category) => (
              <NotificationToggle
                key={category.key}
                label={category.label}
                description={category.description}
                checked={Boolean(prefs[category.key])}
                disabled={saving}
                onChange={(next) => setPrefs((prev) => ({ ...prev, [category.key]: next }))}
              />
            ))}
          </div>

          <button type="submit" className={primaryBtnClass} disabled={saving}>
            {saving ? '저장 중...' : '알림 설정 저장'}
          </button>
        </>
      )}
    </form>
  )
}

export default function ChangePassword({ onBack }: { onBack: () => void }) {
  const { user, refreshUser, setUser } = useAuth()
  const [profileDraft, setProfileDraft] = useState<Record<string, string>>({})
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
  // The picker previews a font the visitor has not applied yet, so its stylesheet
  // is not loaded site-wide — fetch just the previewed one on demand.
  useEffect(() => {
    injectBuiltinFontStylesheet(profileForm.selectedFontValue)
  }, [profileForm.selectedFontValue])
  const passwordChecks = [
    { label: '8자 이상', ok: newPassword.length >= 8 },
    { label: '영문 포함', ok: /[A-Za-z]/.test(newPassword) },
    { label: '숫자 포함', ok: /\d/.test(newPassword) },
    { label: '특수문자 포함', ok: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(newPassword) },
    { label: '공백 없음', ok: newPassword.length > 0 && !/\s/.test(newPassword) },
  ]

  const panelClass = 'rounded-lg border border-black/10 bg-white/88 p-5 text-[var(--app-text)] shadow-[0_24px_70px_rgba(0,0,0,0.1)] backdrop-blur-xl sm:p-8'
  const frameClass = 'rounded-lg bg-black/10 p-px'
  const inputClass = 'w-full rounded-lg bg-white px-4 py-3 text-[var(--app-text)] outline-none placeholder:text-[var(--app-subtle)] transition focus:ring-2 focus:ring-[var(--app-accent)]/24'
  const textareaClass = `${inputClass} min-h-28 resize-y leading-6`
  const btnClass = 'rounded-lg border border-black/10 bg-white px-4 py-2.5 font-semibold text-[var(--app-text)] shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition hover:bg-[var(--app-surface-soft)] disabled:cursor-wait disabled:opacity-60'
  const primaryBtnClass = 'rounded-lg bg-[var(--app-accent)] px-4 py-2.5 font-semibold text-white shadow-[0_10px_28px_rgba(0,113,227,0.22)] transition hover:bg-[var(--app-accent-hover)] disabled:cursor-wait disabled:opacity-60'
  const cardClass = 'rounded-lg border border-black/10 bg-[var(--app-surface-soft)] p-4 shadow-[0_1px_2px_rgba(0,0,0,0.05)] sm:p-5'
  const fieldCardClass = 'rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] p-3'
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
          className="rounded-full border border-black/10 bg-white/80 px-4 py-2 text-sm font-semibold text-[var(--app-text)] shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition hover:bg-white"
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
                className="mt-3 rounded-lg border border-black/10 bg-white px-4 py-3 text-base text-[var(--app-text)]"
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

            {profileMessage && <div className="text-sm text-[var(--app-accent-text)]">{profileMessage}</div>}

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
                        <p className="text-sm font-bold text-[var(--app-accent-text)]">{profile.label}</p>
                        <p className="mt-1 text-xs font-semibold leading-5 text-[var(--app-subtle)]">{profile.description}</p>
                      </div>
                      <span className="rounded-full bg-[var(--app-accent-soft)] px-2.5 py-1 text-xs font-bold text-[var(--app-accent-text)]">
                        {profile.documents.length}개
                      </span>
                    </div>
                    <p className="mt-3 text-xs font-semibold text-[var(--app-muted)]">공유 중 {sharedCount}개</p>
                    <div className="mt-3 space-y-1">
                      {profile.documents.slice(0, 2).map((document) => (
                        <p key={`${document.contentType}-${document.contentId}`} className="truncate text-sm font-semibold text-[var(--app-text)]">
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

          {canSeeClubRoom(user?.role) && (
            <ClubRoomSection cardClass={cardClass} helperTextClass={helperTextClass} />
          )}

          <NotificationPreferencesSection
            cardClass={cardClass}
            helperTextClass={helperTextClass}
            primaryBtnClass={primaryBtnClass}
          />

          <div className={`${cardClass} mt-4`}>
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-semibold">이메일 인증</h3>
                <p className="text-sm text-[var(--theme-body-muted)]/85">{user?.email || '-'}</p>
                <p className={helperTextClass}>인증이 필요한 기능을 쓰기 전에 이메일 상태를 확인합니다.</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${user?.emailVerified ? 'bg-[var(--app-accent-soft)] text-[var(--app-accent-text)]' : 'bg-amber-100 text-amber-800'}`}>
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

            {emailMessage && <div className="mt-3 text-sm text-[var(--app-accent-text)]">{emailMessage}</div>}
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

            <div className="rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] p-3">
              <p className="mb-2 text-xs font-bold text-[var(--theme-body-muted)]/85">비밀번호 조건</p>
              <div className="flex flex-wrap gap-2">
                {passwordChecks.map((check) => (
                  <span
                    key={check.label}
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      check.ok ? 'bg-[var(--app-accent-soft)] text-[var(--app-accent-text)]' : 'bg-white/64 text-[var(--theme-body-muted)]'
                    }`}
                  >
                    {check.ok ? '✓ ' : ''}{check.label}
                  </span>
                ))}
              </div>
            </div>

            {passwordMessage && <div className="text-sm text-[var(--app-accent-text)]">{passwordMessage}</div>}

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
