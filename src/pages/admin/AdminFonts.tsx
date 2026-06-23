import { useEffect, useState } from 'react'
import { listAdminFonts, setFontActive, uploadFont } from '../../services/fontApi'
import { buildFontFaceCss, fontFamilyValue } from '../../services/fontPreferences'

export default function AdminFonts() {
  const [fonts, setFonts] = useState([])
  const [name, setName] = useState('')
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true
    listAdminFonts()
      .then((data) => { if (mounted) setFonts(data) })
      .catch((err) => { if (mounted) setError(err.message || '폰트 목록을 불러오지 못했습니다.') })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    const styleId = 'admin-font-faces'
    let styleEl = document.getElementById(styleId)
    if (!styleEl) {
      styleEl = document.createElement('style')
      styleEl.id = styleId
      document.head.appendChild(styleEl)
    }
    styleEl.textContent = buildFontFaceCss(fonts)
  }, [fonts])

  const submit = async (event) => {
    event.preventDefault()
    if (!name.trim() || !file) return
    setSaving(true)
    setError('')
    try {
      const uploaded = await uploadFont(name.trim(), file)
      setFonts((prev) => [uploaded, ...prev])
      setName('')
      setFile(null)
      event.currentTarget.reset()
    } catch (err) {
      setError(err.message || '폰트 업로드에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const toggle = async (font) => {
    try {
      const updated = await setFontActive(font.id, !font.active)
      setFonts((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
    } catch (err) {
      alert(err.message || '폰트 상태를 변경하지 못했습니다.')
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="rounded-lg border border-[var(--app-hairline)] bg-black/5 p-4">
        <p className="text-sm font-semibold text-[var(--theme-body-dark)]">폰트 업로드</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="폰트 이름"
            maxLength={100}
            className="shape-cut-sm border border-[var(--app-hairline)] bg-white/70 px-3 py-2 text-sm text-[var(--theme-body-dark)] outline-none"
          />
          <input
            type="file"
            accept=".woff,.woff2,.ttf,.otf,font/woff,font/woff2,font/ttf,font/otf"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="text-sm text-[var(--theme-body-dark)]"
          />
          <button
            type="submit"
            disabled={saving || !name.trim() || !file}
            className="shape-cut-sm bg-[var(--theme-text)] px-4 py-2 text-sm font-semibold text-[var(--theme-bg)] disabled:opacity-50"
          >
            {saving ? '업로드 중...' : '업로드'}
          </button>
        </div>
        <p className="mt-2 text-xs text-[var(--theme-body-muted)]">woff, woff2 우선 지원. ttf, otf도 허용하며 최대 2MB입니다.</p>
        {error && <p className="mt-2 text-sm font-semibold text-red-600">{error}</p>}
      </form>

      <p className="rounded-lg border border-[var(--app-hairline)] bg-black/5 px-4 py-3 text-xs leading-5 text-[var(--theme-body-muted)]">
        활성 폰트만 사이트 폰트 선택 목록에 표시됩니다. 비활성화해도 폰트 파일과 기존 회원의 저장값은 삭제되지 않습니다.
      </p>

      {loading ? (
        <p className="text-sm text-[var(--theme-body-muted)]">폰트를 불러오는 중...</p>
      ) : fonts.length === 0 ? (
        <p className="text-sm text-[var(--theme-body-muted)]">등록된 폰트가 없습니다.</p>
      ) : (
        <div className="space-y-2">
          {fonts.map((font) => (
            <div key={font.id} className="shape-cut-sm flex flex-wrap items-center justify-between gap-3 border border-[var(--app-hairline)] bg-black/5 px-4 py-3">
              <div>
                <p className="font-semibold text-[var(--theme-body-dark)]">{font.name}</p>
                <p className="text-xs text-[var(--theme-body-muted)]">{new Date(font.createdAt).toLocaleString('ko-KR')}</p>
                <p
                  data-testid={`admin-font-preview-${font.id}`}
                  className="mt-2 text-base text-[var(--theme-body-dark)]"
                  style={{ fontFamily: fontFamilyValue(font) }}
                >
                  한글 English 123 · 폰트 미리보기
                </p>
              </div>
              <button
                type="button"
                onClick={() => toggle(font)}
                aria-label={`${font.name} ${font.active ? '비활성화' : '활성화'}`}
                className={`shape-cut-sm px-3 py-1.5 text-xs font-bold ${font.active ? 'bg-[var(--app-accent-soft)] text-[var(--app-accent-text)]' : 'bg-black/10 text-[var(--theme-body-muted)]'}`}
              >
                {font.active ? '비활성화' : '활성화'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
