import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { MessageCircle, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ASK_FAQS, type AskFaq } from '../../data/askFaq'
import { useAuth } from '../../contexts/useAuth'
import { useModalFocus } from '../../hooks/useModalFocus'
import { getPublicSiteSettings } from '../../services/siteSettingsApi'
import { sendAsk } from '../../services/askApi'
import { TOUR_SURFACE_EVENT, type TourSurface } from '../tour/tourState'

type Stage = 'faq' | 'answer' | 'question' | 'email' | 'done'

function AskDialog({ onClose, user, askEnabled, preview = false }: { onClose: () => void; user: { email?: string } | null; askEnabled: boolean; preview?: boolean }) {
  const [stage, setStage] = useState<Stage>('faq')
  const [selectedFaq, setSelectedFaq] = useState<AskFaq | null>(null)
  const [question, setQuestion] = useState('')
  const [email, setEmail] = useState('')
  const [emailEdited, setEmailEdited] = useState(false)
  const [name, setName] = useState('')
  const [honeypot, setHoneypot] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [keyboardInset, setKeyboardInset] = useState<{ bottom: number; maxHeight: number } | null>(null)
  const questionRef = useRef<HTMLTextAreaElement>(null)
  const firstFaqRef = useRef<HTMLButtonElement>(null)
  const answerRef = useRef<HTMLDivElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const errorRef = useRef<HTMLDivElement>(null)
  const dialogRef = useModalFocus(!preview, onClose, { initialFocusRef: firstFaqRef })
  const replyEmail = emailEdited ? email : (user?.email || '')

  useEffect(() => {
    if (preview) return
    if (stage === 'email') emailRef.current?.focus()
    else if (stage === 'question') questionRef.current?.focus()
    else if (stage === 'faq') firstFaqRef.current?.focus()
    else if (stage === 'answer') answerRef.current?.focus()
  }, [stage, preview])

  const backToFaq = () => {
    if (stage === 'done') {
      setQuestion('')
      setEmail('')
      setEmailEdited(false)
      setName('')
      setHoneypot('')
    }
    setSelectedFaq(null)
    setError('')
    setStage('faq')
  }

  useEffect(() => {
    if (preview) return
    const viewport = window.visualViewport
    if (!viewport) return
    const update = () => {
      const inset = window.innerHeight - viewport.height - viewport.offsetTop
      setKeyboardInset(inset > 120 ? { bottom: inset + 8, maxHeight: Math.max(120, viewport.height - 160) } : null)
    }
    viewport.addEventListener('resize', update)
    viewport.addEventListener('scroll', update)
    update()
    return () => {
      viewport.removeEventListener('resize', update)
      viewport.removeEventListener('scroll', update)
    }
  }, [preview])

  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ block: 'nearest', behavior: 'auto' })
    else if (keyboardInset) {
      const focused = document.activeElement
      if (focused instanceof HTMLElement && dialogRef.current?.contains(focused)) focused.scrollIntoView({ block: 'nearest', behavior: 'auto' })
    }
  }, [error, keyboardInset, dialogRef])

  function next(event?: React.FormEvent) {
    event?.preventDefault()
    const trimmed = question.trim()
    if (trimmed.length < 5 || trimmed.length > 2000) {
      setError('질문은 5자 이상 2000자 이하로 입력해 주세요.')
      return
    }
    setQuestion(trimmed)
    setError('')
    setStage('email')
  }

  async function send(event?: React.FormEvent) {
    event?.preventDefault()
    if (preview || sending || !askEnabled) return
    const trimmedEmail = replyEmail.trim()
    if (!/^[^\s@\r\n]+@[^\s@\r\n]+\.[^\s@\r\n]+$/.test(trimmedEmail)) {
      setError('답장받을 이메일 주소를 확인해 주세요.')
      return
    }
    setError('')
    closeRef.current?.focus()
    setSending(true)
    try {
      await sendAsk({ question, replyEmail: trimmedEmail, name: name.trim() || undefined, honeypot, pagePath: window.location.pathname })
      setStage('done')
    } catch (caught) {
      const status = (caught as { status?: number })?.status
      setError(status === 429
        ? '잠시 동안 질문을 너무 많이 보내셨어요. 조금 뒤에 다시 시도해 주세요.'
        : status === 503
          ? '지금은 질문을 받지 못하고 있어요. 잠시 뒤에 다시 시도해 주세요.'
          : status === 400
            ? '입력한 내용을 확인한 뒤 다시 시도해 주세요.'
            : '질문을 보내지 못했어요. 연결을 확인하고 다시 시도해 주세요.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="coms-ask-backdrop" data-tour-preview={preview ? 'true' : undefined} inert={preview} onPointerDown={(event) => { if (!preview && event.target === event.currentTarget) onClose() }}>
      <section id="coms-ask-panel" ref={dialogRef} className="coms-ask-panel" role={preview ? 'region' : 'dialog'} aria-modal={preview ? undefined : true} aria-labelledby="coms-ask-title" style={keyboardInset || undefined}>
        <div className="coms-ask-header">
          <div>
            <p className="coms-ask-eyebrow">COM&apos;s</p>
            <h2 id="coms-ask-title">COM&apos;s 질문하기</h2>
          </div>
          <button ref={closeRef} type="button" className="coms-ask-close" onClick={onClose} aria-label="질문 창 닫기"><X size={18} aria-hidden="true" /></button>
        </div>
        <div className="coms-ask-body">
          <div className="coms-ask-messages" aria-live="polite" aria-relevant="additions">
            <p className="coms-ask-bubble coms-ask-bubble--club">{stage === 'faq' || stage === 'answer' ? '궁금한 내용을 골라보세요. 답을 바로 확인할 수 있어요.' : '다른 궁금한 점을 남겨 주세요. 사람이 직접 읽고 메일로 답해 드려요.'}</p>
            {stage === 'answer' && selectedFaq && <>
              <p className="coms-ask-bubble coms-ask-bubble--visitor">{selectedFaq.question}</p>
              <div ref={answerRef} tabIndex={-1} className="coms-ask-bubble coms-ask-bubble--club">
                <p>{selectedFaq.answer}</p>
                <Link to={selectedFaq.href} onClick={onClose} className="coms-ask-source">{selectedFaq.linkLabel}</Link>
              </div>
            </>}
            {(stage === 'email' || stage === 'done') && <p className="coms-ask-bubble coms-ask-bubble--visitor">{question}</p>}
            {stage === 'email' && <p className="coms-ask-bubble coms-ask-bubble--club">{user ? '답장받을 이메일 주소를 확인해 주세요.' : '답장받을 이메일 주소를 알려 주세요.'}</p>}
            {stage === 'done' && <p className="coms-ask-bubble coms-ask-bubble--club">질문을 보냈어요. 답변은 이메일로 도착할 거예요.</p>}
            {error && <div ref={errorRef} className="coms-ask-bubble coms-ask-bubble--error"><p>{error}</p><button type="button" onClick={() => { if (stage === 'question') next(); else void send() }} disabled={sending}>다시 시도</button></div>}
          </div>
          {stage === 'faq' && <div className="coms-ask-choices">
            <div className="coms-ask-faq" role="group" aria-label="자주 묻는 질문">
              {ASK_FAQS.map((faq, index) => <button key={faq.id} ref={index === 0 ? firstFaqRef : undefined} type="button" onClick={() => { if (preview) return; setSelectedFaq(faq); setStage('answer') }}>{faq.question}</button>)}
            </div>
            <button type="button" className="coms-ask-other" disabled={preview || !askEnabled} onClick={() => setStage('question')}>다른 질문 보내기</button>
            {!askEnabled && <p className="coms-ask-unavailable">지금은 이메일 문의를 받지 않고 있어요. 위 답변은 계속 확인할 수 있습니다.</p>}
          </div>}
          {stage === 'answer' && <div className="coms-ask-choices">
            <button type="button" className="coms-ask-back" onClick={backToFaq}>자주 묻는 질문으로</button>
            <button type="button" className="coms-ask-other" disabled={!askEnabled} onClick={() => setStage('question')}>다른 질문 보내기</button>
            {!askEnabled && <p className="coms-ask-unavailable">지금은 이메일 문의를 받지 않고 있어요. 위 답변은 계속 확인할 수 있습니다.</p>}
          </div>}
          {stage === 'question' && (
            <form className="coms-ask-form" onSubmit={next} noValidate>
              <button type="button" className="coms-ask-back" onClick={backToFaq}>자주 묻는 질문으로</button>
              <label htmlFor="coms-ask-question">질문</label>
              <textarea id="coms-ask-question" ref={questionRef} value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={2000} rows={4} placeholder="무엇이 궁금하신가요?" />
              <button type="submit" className="coms-ask-submit">다음</button>
            </form>
          )}
          {stage === 'email' && (
            <form className="coms-ask-form" onSubmit={(event) => void send(event)} noValidate>
              <button type="button" className="coms-ask-back" onClick={() => { setError(''); setStage('question') }}>질문 수정</button>
              <label htmlFor="coms-ask-email">답장받을 이메일</label>
              <input id="coms-ask-email" ref={emailRef} type="email" autoComplete="email" value={replyEmail} onChange={(event) => { setEmailEdited(true); setEmail(event.target.value) }} maxLength={254} />
              {!user && <><label htmlFor="coms-ask-name">이름 (선택)</label><input id="coms-ask-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={60} autoComplete="name" /></>}
              <div className="coms-ask-honeypot" aria-hidden="true"><label htmlFor="coms-ask-website">웹사이트</label><input id="coms-ask-website" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(event) => setHoneypot(event.target.value)} /></div>
              {!askEnabled && <p className="coms-ask-unavailable">지금은 이메일 문의를 받지 않고 있어요.</p>}
              <button type="submit" className="coms-ask-submit" disabled={sending || !askEnabled}>{sending ? '보내는 중…' : '질문 보내기'}</button>
            </form>
          )}
          {stage === 'done' && <div className="coms-ask-choices"><button type="button" className="coms-ask-back" onClick={backToFaq}>자주 묻는 질문으로</button></div>}
        </div>
      </section>
    </div>
  )
}

export default function AskWidget() {
  const { user, loading } = useAuth()
  const [open, setOpen] = useState(false)
  const [tourPreview, setTourPreview] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const { data: settings } = useQuery({ queryKey: ['site-settings', 'public'], queryFn: getPublicSiteSettings })
  useEffect(() => {
    const onTourSurface = (event: Event) => setTourPreview((event as CustomEvent<TourSurface>).detail === 'ask')
    window.addEventListener(TOUR_SURFACE_EVENT, onTourSurface)
    return () => window.removeEventListener(TOUR_SURFACE_EVENT, onTourSurface)
  }, [])
  useEffect(() => {
    const viewport = window.visualViewport
    const measure = () => {
      const trigger = triggerRef.current
      if (!trigger) return
      trigger.style.removeProperty('bottom')
      const keyboardInset = viewport ? window.innerHeight - viewport.height - viewport.offsetTop : 0
      if (keyboardInset > 120) trigger.style.bottom = `${keyboardInset + 8}px`
      const button = trigger.getBoundingClientRect()
      const topButton = document.querySelector('.coms-to-top.is-visible')
      const keyboardOpen = keyboardInset > 120
      const stackHeight = topButton && !keyboardOpen ? topButton.getBoundingClientRect().height + 12 : 0
      const obstacles = [...document.querySelectorAll('.appearance-actions, .scene-opening__br, .scene-opening__ticker, .scene-rail, .apple-mobile-tabs, .coms-toast, .coms-perf-notice')]
        .filter((element) => {
          const style = getComputedStyle(element)
          return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0
        })
        .map((element) => element.getBoundingClientRect())
        .filter((box) => box.width > 0 && box.height > 0 && box.bottom > 0 && box.top < window.innerHeight && button.left < box.right && button.right > box.left)
        .sort((a, b) => b.bottom - a.bottom)
      let top = button.top
      for (const obstacle of obstacles) {
        if (top + button.height > obstacle.top && top - stackHeight < obstacle.bottom) top = obstacle.top - button.height - 8
      }
      const minTop = window.innerWidth < 640 ? 104 : 64
      const fits = top - stackHeight >= minTop
      trigger.style.visibility = fits ? '' : 'hidden'
      document.documentElement.style.setProperty('--coms-ask-top-visibility', fits && !keyboardOpen ? 'visible' : 'hidden')
      const bottom = `${Math.max(8, window.innerHeight - Math.max(top, minTop + stackHeight) - button.height)}px`
      trigger.style.bottom = bottom
      document.documentElement.style.setProperty('--coms-ask-bottom', bottom)
    }
    // At most one measurement per frame: this is called on every scroll and every DOM change in the page.
    let frame = 0
    const positionTrigger = () => {
      if (frame) return
      frame = requestAnimationFrame(() => { frame = 0; measure() })
    }
    const mutation = new MutationObserver(positionTrigger)
    mutation.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })
    window.addEventListener('scroll', positionTrigger, { passive: true })
    window.addEventListener('resize', positionTrigger)
    viewport?.addEventListener('resize', positionTrigger)
    viewport?.addEventListener('scroll', positionTrigger)
    measure()
    return () => {
      if (frame) cancelAnimationFrame(frame)
      mutation.disconnect()
      document.documentElement.style.removeProperty('--coms-ask-bottom')
      document.documentElement.style.removeProperty('--coms-ask-top-visibility')
      window.removeEventListener('scroll', positionTrigger)
      window.removeEventListener('resize', positionTrigger)
      viewport?.removeEventListener('resize', positionTrigger)
      viewport?.removeEventListener('scroll', positionTrigger)
    }
  }, [])
  return (
    <div className="coms-ask-root">
      <button ref={triggerRef} type="button" className="coms-ask-trigger" data-tour="ask" data-open={open} aria-hidden={open} tabIndex={open ? -1 : 0} aria-expanded={open} aria-controls="coms-ask-panel" onClick={() => { if (!loading && !document.querySelector('[role="dialog"], [role="alertdialog"], .appearance-popover, #mobile-menu, [data-coms-intro], .coms-tour')) setOpen(true) }} aria-label="질문하기"><MessageCircle size={22} aria-hidden="true" /><span>질문하기</span></button>
      {open && <AskDialog key={user ? `member:${user.studentId || user.id || 'unknown'}` : 'guest'} onClose={() => setOpen(false)} user={user} askEnabled={Boolean(settings?.askEnabled)} />}
      {!open && tourPreview && <AskDialog key="tour-preview" preview onClose={() => setTourPreview(false)} user={user} askEnabled={Boolean(settings?.askEnabled)} />}
    </div>
  )
}
