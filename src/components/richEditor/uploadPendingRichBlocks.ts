import { optimizeImageFile } from '../../pages/community/postEditorUtils'
import { uploadRichMedia, type RichMediaScope, type RichMediaKind } from '../../services/richMediaApi'

type Block = { type?: string; status?: string; id?: string; file?: File; name?: string; mediaId?: number; fileId?: number; [key: string]: unknown }

/** Updates the editor as each upload succeeds, so a later failure can resume. */
export async function uploadPendingRichBlocks(blocks: Block[], scope: RichMediaScope, updateFigureMeta?: (id: string, patch: Record<string, unknown>) => void): Promise<Block[]> {
  const result: Block[] = []
  for (const block of blocks) {
    const kind = block.type as RichMediaKind
    if (!['image', 'video', 'file'].includes(kind) || block.status !== 'pending') { result.push(block); continue }
    const key = kind === 'file' ? 'fileId' : 'mediaId'
    if (Number.isSafeInteger(block[key]) && Number(block[key]) > 0) { result.push({ ...block, status: 'saved' }); continue }
    if (!(block.file instanceof File)) throw new Error(`${block.name || '첨부파일'}을(를) 다시 선택해주세요.`)
    try {
      const file = kind === 'image' ? await optimizeImageFile(block.file) : block.file
      const uploaded = await uploadRichMedia(scope, kind, file)
      if (!Number.isSafeInteger(uploaded?.id) || uploaded.id <= 0) throw new Error('업로드 응답이 올바르지 않습니다.')
      const patch = { status: 'saved', [key]: uploaded.id }
      if (block.id) updateFigureMeta?.(block.id, patch)
      result.push({ ...block, ...patch, name: file.name })
    } catch (error) {
      throw new Error(`${block.name || '첨부파일'} 업로드에 실패했습니다: ${error instanceof Error ? error.message : '다시 시도해주세요.'}`, { cause: error })
    }
  }
  return result
}
