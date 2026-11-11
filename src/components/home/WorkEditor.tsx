import { useRef, useState } from 'react'
import { createClubProject, deleteClubProject, deleteClubProjectImage, updateClubProject, uploadClubProjectImages } from '../../services/clubProjectApi'
import { confirmDialog } from '../common/ConfirmDialog'

type Image = { id: number; url: string }
type Work = { id: number; category: string; title: string; description?: string; madeBy?: string; linkUrl?: string; images?: Image[] }
type Category = { key: string; name: string }

export default function WorkEditor({ work, categories, onSaved, onCancel }: {
  work?: Work | null
  categories: Category[]
  onSaved: () => Promise<void>
  onCancel: () => void
}) {
  const [category, setCategory] = useState(work?.category || categories[0]?.key || '')
  const [title, setTitle] = useState(work?.title || '')
  const [madeBy, setMadeBy] = useState(work?.madeBy || '')
  const [description, setDescription] = useState(work?.description || '')
  const [linkUrl, setLinkUrl] = useState(work?.linkUrl || '')
  const [images, setImages] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [createdId, setCreatedId] = useState<number | null>(null)
  const imageInput = useRef<HTMLInputElement>(null)

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!category || !title.trim()) return
    setBusy(true)
    setError('')
    try {
      const fields = {
        category, title: title.trim(), description: description.trim(), linkUrl: linkUrl.trim(),
        ...(work || createdId || madeBy.trim() ? { madeBy: madeBy.trim() } : {}),
      }
      const saved = work || createdId ? await updateClubProject(work?.id || createdId, fields) : await createClubProject(fields)
      if (!work) setCreatedId(saved.id)
      if (images.length) {
        await uploadClubProjectImages(saved.id, images)
        setImages([])
        if (imageInput.current) imageInput.current.value = ''
      }
      await onSaved()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '저장하지 못했습니다. 다시 시도해 주세요.')
    } finally {
      setBusy(false)
    }
  }

  const removeImage = async (imageId: number) => {
    if (!work) return
    setBusy(true)
    setError('')
    try {
      await deleteClubProjectImage(work.id, imageId)
      await onSaved()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '사진을 삭제하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  const removeWork = async () => {
    if (!work || !await confirmDialog({ title: '작품을 삭제할까요?', message: '작품과 사진·댓글·답글·추천 기록이 함께 삭제됩니다.', confirmText: '삭제', tone: 'danger' })) return
    setBusy(true)
    setError('')
    try {
      await deleteClubProject(work.id)
      await onSaved()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '작품을 삭제하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={save} className="apple-product-panel mt-6 grid gap-4 p-6" aria-label={work ? '작품 수정' : '작품 올리기'}>
      <h2 className="text-xl font-semibold">{work ? '내 작품 수정' : '작품 올리기'}</h2>
      <label className="grid gap-1 text-sm font-medium">분류
        <select required value={category} onChange={(event) => setCategory(event.target.value)} className="rounded-lg border border-[var(--app-hairline)] bg-[var(--app-bg)] p-2">
          {categories.map((item) => <option key={item.key} value={item.key}>{item.name}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-sm font-medium">작품 이름
        <input required maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} className="rounded-lg border border-[var(--app-hairline)] bg-[var(--app-bg)] p-2" />
      </label>
      <div className="grid gap-1">
        <label htmlFor="work-made-by" className="text-sm font-medium">제작자 (선택)</label>
        <input id="work-made-by" maxLength={100} value={madeBy} onChange={(event) => setMadeBy(event.target.value)} aria-describedby="work-made-by-help" placeholder={work || createdId ? '비우면 제작자 표시를 지워요' : '작품에 표시할 이름'} className="rounded-lg border border-[var(--app-hairline)] bg-[var(--app-bg)] p-2" />
        <p id="work-made-by-help" className="text-xs text-[var(--app-muted)]">{work || createdId ? '비우고 저장하면 제작자 표시가 지워집니다.' : '작품에 공개할 이름입니다. 함께 만든 사람도 적을 수 있어요.'}</p>
      </div>
      <label className="grid gap-1 text-sm font-medium">소개글
        <textarea maxLength={5000} rows={5} value={description} onChange={(event) => setDescription(event.target.value)} className="rounded-lg border border-[var(--app-hairline)] bg-[var(--app-bg)] p-2" />
      </label>
      <label className="grid gap-1 text-sm font-medium">작품 링크 (선택)
        <input type="url" maxLength={500} value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} placeholder="https://" className="rounded-lg border border-[var(--app-hairline)] bg-[var(--app-bg)] p-2" />
      </label>
      <label className="grid gap-1 text-sm font-medium">대표 사진과 스크린샷 (최대 6장, JPEG·PNG)
        <input ref={imageInput} type="file" accept="image/jpeg,image/png" multiple onChange={(event) => setImages(Array.from(event.target.files || []))} />
        <span className="text-xs text-[var(--app-muted)]">첫 사진이 대표 사진으로 표시됩니다. 기존 사진과 합쳐 최대 6장입니다.</span>
      </label>
      {work?.images?.length ? <div className="flex flex-wrap gap-3" aria-label="현재 작품 사진">{work.images.map((image) => <div key={image.id} className="grid gap-1"><img src={image.url} alt="" className="h-24 w-32 rounded-lg object-cover" /><button type="button" disabled={busy} onClick={() => removeImage(image.id)} className="text-sm underline">사진 삭제</button></div>)}</div> : null}
      {error && <p role="alert" className="text-sm text-[var(--app-danger)]">{error}</p>}
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={busy || !title.trim() || !category || images.length + (work?.images?.length || 0) > 6} className="rounded-full bg-[var(--app-accent)] px-5 py-2 font-semibold text-white disabled:opacity-50">{busy ? '저장 중…' : '저장하기'}</button>
        <button type="button" disabled={busy} onClick={onCancel} className="rounded-full border border-[var(--app-hairline)] px-5 py-2">취소</button>
        {work && <button type="button" disabled={busy} onClick={removeWork} className="ml-auto text-[var(--app-danger)] underline">작품 삭제</button>}
      </div>
    </form>
  )
}
