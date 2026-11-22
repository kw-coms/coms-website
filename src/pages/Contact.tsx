import { useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { HeartHandshake } from 'lucide-react'
import PageHeading from '../components/PageHeading'
import { useAuth } from '../contexts/useAuth'
import { sendAsk } from '../services/askApi'
import { getPublicSiteSettings } from '../services/siteSettingsApi'
import '../styles/site-pages.css'

const field = 'mt-2 w-full rounded-lg border border-[var(--app-hairline-strong)] bg-[var(--app-bg)] px-3 py-2.5 text-[var(--app-text)]'

export default function Contact() {
  const { user } = useAuth()
  const settings = useQuery({ queryKey: ['site-settings', 'public'], queryFn: getPublicSiteSettings })
  const [pending, setPending] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const enabled = Boolean(settings.data?.askEnabled)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!enabled || pending) return
    const data = new FormData(event.currentTarget)
    const value = (name: string) => String(data.get(name) ?? '').trim()
    const detail = value('detail')
    if (detail.length < 5) { setError('제안 내용을 다섯 글자 이상 입력해 주세요.'); return }
    const question = value('title') + '\n\n' + '소속·팀: ' + (value('organization') || '개인') + '\n\n' + detail
    setPending(true)
    setError('')
    try {
      await sendAsk({ question, replyEmail: value('reply'), name: value('name'), honeypot: value('website'), pagePath: '/contact', topic: 'COLLABORATION' })
      setDone(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '제안을 보내지 못했습니다.')
    } finally {
      setPending(false)
    }
  }

  return <div className="site-page"><main className="site-page-inner max-w-3xl">
    <HeartHandshake size={30} aria-hidden="true" className="mb-3 text-[var(--app-accent-text)]" />
    <PageHeading>협업 제안</PageHeading>
    <p className="mt-4 max-w-xl text-base leading-7 text-[var(--app-muted)]">세미나, 공동 행사, 팀 프로젝트를 함께하고 싶다면 COM’s에 제안해 주세요. 운영진이 확인하고 남겨 주신 이메일로 답변합니다.</p>
    {settings.isPending && <p role="status" className="mt-5 text-sm">제안 접수 상태를 확인하는 중…</p>}
    {settings.isError && <p role="alert" className="mt-5 text-sm">접수 상태를 확인하지 못했습니다. <button type="button" className="underline" onClick={() => void settings.refetch()}>다시 확인</button></p>}
    {settings.isSuccess && !enabled && <p role="status" className="mt-5 rounded-lg bg-[var(--app-surface-soft)] p-4 text-sm">지금은 협업 제안을 받지 않고 있습니다.</p>}
    {done ? <div role="status" className="mt-6 rounded-lg bg-[var(--app-accent-soft)] p-5">협업 제안을 보냈습니다. 남겨 주신 이메일로 답변을 드릴게요.</div>
      : <form onSubmit={submit} aria-label="협업 제안 보내기" className="mt-7 rounded-xl border border-[var(--app-hairline)] bg-[var(--app-surface)] p-5 sm:p-7">
        <fieldset disabled={!enabled || pending} className="grid min-w-0 gap-4">
          <legend className="sr-only">제안 내용과 연락처</legend>
          <label className="text-sm font-semibold">제안 제목<input name="title" className={field} required maxLength={100} placeholder="예: 연합 해커톤 공동 기획" /></label>
          <div className="grid gap-4 sm:grid-cols-2">
            {!user && <label className="text-sm font-semibold">이름<input name="name" className={field} required maxLength={60} autoComplete="name" /></label>}
            <label className="text-sm font-semibold">소속·팀 (선택)<input name="organization" className={field} maxLength={100} autoComplete="organization" /></label>
          </div>
          <label className="text-sm font-semibold">답장받을 이메일<input key={user?.email ?? 'guest'} name="reply" className={field} type="email" required maxLength={254} autoComplete="email" defaultValue={user?.email} /></label>
          <label className="text-sm font-semibold">제안 내용<textarea name="detail" className={field} rows={7} required minLength={5} maxLength={1700} placeholder="함께 하고 싶은 일, 제안하는 일정, COM’s에 바라는 역할을 알려 주세요." /></label>
          <div aria-hidden="true" className="absolute left-[-10000px] h-px w-px overflow-hidden"><label>웹사이트<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
          <p className="text-sm text-[var(--app-muted)]">제안과 연락처는 운영진의 확인과 회신에 사용됩니다.</p>
          <button type="submit" className="apple-action-primary min-h-11 justify-self-start px-5 text-sm disabled:opacity-50" disabled={!enabled || pending}>{pending ? '보내는 중…' : '협업 제안 보내기'}</button>
        </fieldset>
        {error && <p role="alert" className="mt-3 text-sm text-[var(--app-danger)]">{error}</p>}
      </form>}
  </main></div>
}
