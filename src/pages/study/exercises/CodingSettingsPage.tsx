import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ArrowLeft, Check, RotateCcw } from 'lucide-react'
import PageHeading from '../../../components/PageHeading'
import MembersGate, { AuthCheckFailed } from '../../../components/MembersGate'
import { useAuth } from '../../../contexts/useAuth'
import { createEditor, type PgEditor } from '../playground/editor'
import { JUDGE_LANGUAGES, LANG_NAMES, type ExLang } from './types'
import { type CodingSettings, exampleCodingTemplates, readCodingSettings, saveCodingSettings } from './codingSettings'
import '../study.css'
import './coding-settings.css'

const MAX_TEMPLATE_BYTES = 64 * 1024
function returnPath(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return '/study/algorithms'
  try {
    const url = new URL(value, window.location.origin)
    if (url.origin === window.location.origin &&
        /^\/study\/(?:algorithms(?:\/[1-9]\d*)?|(?:c|java|python|web)\/practice(?:\/[a-z0-9-]+)?)$/.test(url.pathname)) {
      return url.pathname + url.search + url.hash
    }
  } catch { /* A malformed return link uses the problem list. */ }
  return '/study/algorithms'
}

function CodingSettingsForm({ studentId }: { studentId: string }) {
  const location = useLocation()
  const returnTo = returnPath(location.state?.from)
  const [settings, setSettings] = useState<CodingSettings>(() => readCodingSettings(studentId))
  const [language, setLanguage] = useState<ExLang>(() => settings.preferredLanguage ?? 'cpp')
  const [status, setStatus] = useState('')
  const editorHost = useRef<HTMLDivElement>(null)
  const editor = useRef<PgEditor | null>(null)
  const latestSettings = useRef(settings)
  useEffect(() => { latestSettings.current = settings }, [settings])

  useEffect(() => {
    let disposed = false
    let instance: PgEditor | null = null
    if (editorHost.current) void createEditor({
      parent: editorHost.current,
      lang: language,
      doc: latestSettings.current.templates[language] ?? '',
      label: `${LANG_NAMES[language]} 기본 템플릿 편집기`,
      appearance: latestSettings.current.appearance,
      onChange: (value) => {
        setSettings((current) => ({ ...current, templates: { ...current.templates, [language]: value } }))
        setStatus('')
      },
      onRun: () => {},
    }).then((created) => {
      if (disposed) created.destroy()
      else { instance = created; editor.current = created }
    })
    return () => {
      disposed = true
      instance?.destroy()
      if (editor.current === instance) editor.current = null
    }
  }, [language])

  useEffect(() => { editor.current?.setAppearance(settings.appearance) }, [settings.appearance])

  const change = (next: CodingSettings) => { setSettings(next); setStatus('') }
  const showExample = () => {
    const example = exampleCodingTemplates[language]
    if (settings.templates[language]?.trim() && !window.confirm(`${LANG_NAMES[language]} 템플릿을 예시 코드로 바꿀까요?`)) return
    editor.current?.setValue(example)
    change({ ...settings, templates: { ...settings.templates, [language]: example } })
    editor.current?.focus()
  }
  const clearTemplate = () => {
    if (!settings.templates[language]?.trim()) return
    if (!window.confirm(`${LANG_NAMES[language]} 템플릿을 지울까요?`)) return
    editor.current?.setValue('')
    change({ ...settings, templates: { ...settings.templates, [language]: '' } })
  }
  const save = () => {
    if (JUDGE_LANGUAGES.some((lang) => new TextEncoder().encode(settings.templates[lang] ?? '').length > MAX_TEMPLATE_BYTES)) {
      setStatus('템플릿은 언어별로 64KB 이하로 저장해 주세요.')
      return
    }
    setStatus(saveCodingSettings(studentId, settings) ? '코딩 설정을 저장했습니다.' : '저장하지 못했습니다. 브라우저 저장 공간을 확인해 주세요.')
  }

  return <main className="study-page coding-settings-page">
    <div className="coding-settings-inner">
      <Link className="coding-settings-back" to={returnTo}><ArrowLeft size={17} aria-hidden="true" />문제로 돌아가기</Link>
      <header className="coding-settings-header">
        <PageHeading>코딩 설정</PageHeading>
        <p>문제를 열 때 사용할 언어와 내 코드 템플릿을 정하세요.</p>
      </header>
      <div className="coding-settings-grid">
        <section className="coding-settings-controls" aria-label="기본 설정">
          <div className="coding-settings-field">
            <label htmlFor="coding-default-language">기본 언어</label>
            <select id="coding-default-language" value={settings.preferredLanguage ?? ''} onChange={(event) =>
              change({ ...settings, preferredLanguage: event.target.value ? event.target.value as ExLang : null })}>
              <option value="">문제의 첫 언어</option>
              {JUDGE_LANGUAGES.map((lang) => <option value={lang} key={lang}>{LANG_NAMES[lang]}</option>)}
            </select>
          </div>
          <div className="coding-settings-divider" />
          <h2>편집기</h2>
          <div className="coding-settings-field">
            <label htmlFor="coding-palette">코드 색상</label>
            <select id="coding-palette" value={settings.appearance.palette} onChange={(event) =>
              change({ ...settings, appearance: { ...settings.appearance, palette: event.target.value as CodingSettings['appearance']['palette'] } })}>
              <option value="midnight">어두운 화면</option>
              <option value="paper">밝은 화면</option>
              <option value="contrast">선명한 화면</option>
            </select>
          </div>
          <div className="coding-settings-field">
            <label htmlFor="coding-font-size">글자 크기</label>
            <select id="coding-font-size" value={settings.appearance.fontSize} onChange={(event) =>
              change({ ...settings, appearance: { ...settings.appearance, fontSize: Number(event.target.value) as CodingSettings['appearance']['fontSize'] } })}>
              {[14, 16, 18, 20].map((size) => <option value={size} key={size}>{size}px</option>)}
            </select>
          </div>
          <label className="coding-settings-wrap">
            <input type="checkbox" checked={settings.appearance.wrap} onChange={(event) =>
              change({ ...settings, appearance: { ...settings.appearance, wrap: event.target.checked } })} />
            긴 줄 자동 줄바꿈
          </label>
        </section>

        <section className="coding-settings-template" aria-labelledby="coding-template-heading">
          <div className="coding-settings-template-head">
            <div><h2 id="coding-template-heading">내 코드 템플릿</h2>
              <p>언어마다 저장해 두고 새 문제에서 바로 시작하세요.</p></div>
            <label>템플릿 언어
              <select value={language} onChange={(event) => setLanguage(event.target.value as ExLang)}>
                {JUDGE_LANGUAGES.map((lang) => <option value={lang} key={lang}>{LANG_NAMES[lang]}</option>)}
              </select>
            </label>
          </div>
          <div ref={editorHost} className="coding-settings-editor" />
          <div className="coding-settings-template-actions">
            <button type="button" onClick={showExample}>예시 코드 불러오기</button>
            <button type="button" onClick={clearTemplate}><RotateCcw size={15} aria-hidden="true" />템플릿 비우기</button>
          </div>
          <p className="coding-settings-note">이미 작성한 코드는 유지됩니다. 함수형 문제는 문제에서 제공하는 코드 틀을 사용합니다.</p>
        </section>
      </div>
      <footer className="coding-settings-save">
        <p role="status" aria-live="polite">{status}</p>
        <button type="button" onClick={save}><Check size={18} aria-hidden="true" />설정 저장</button>
      </footer>
    </div>
  </main>
}

export default function CodingSettingsPage() {
  const { user, loading, authError } = useAuth()
  if (loading) return <main className="study-page coding-settings-page"><p className="study-loading" role="status">로그인 상태를 확인하는 중...</p></main>
  if (authError) return <main className="study-page coding-settings-page"><AuthCheckFailed /></main>
  if (!user?.studentId) return <main className="study-page coding-settings-page"><MembersGate title="코딩 설정은 동아리원만 사용할 수 있어요" /></main>
  return <CodingSettingsForm key={user.studentId} studentId={user.studentId} />
}
