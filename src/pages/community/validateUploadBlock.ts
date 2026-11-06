import {
  ALLOWED_IMAGE_TYPES, ALLOWED_VIDEO_TYPES,
  MAX_EXTRA_IMAGES, MAX_FILE_BYTES, MAX_FILES, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, MAX_VIDEOS,
} from './postEditorUtils'

type Block = { type?: string }
export type UploadLimits = { image: number; video: number; file: number }
const COMMUNITY_LIMITS: UploadLimits = { image: MAX_EXTRA_IMAGES, video: MAX_VIDEOS, file: MAX_FILES }
export const RICH_BODY_LIMITS: UploadLimits = { image: 20, video: 3, file: 10 }

/** Resolve one kind before enforcing that kind's count and byte limit. */
export function validateUploadBlock(file: File, blocks: Block[], isAllowedFile: (file: File) => boolean, uploadLimits: UploadLimits = COMMUNITY_LIMITS): { type?: 'image' | 'video' | 'file'; error?: string } {
  const type = ALLOWED_IMAGE_TYPES.includes(file.type) ? 'image'
    : ALLOWED_VIDEO_TYPES.includes(file.type) ? 'video'
      : isAllowedFile(file) ? 'file' : undefined
  if (!type) return { error: '지원하지 않는 파일 형식입니다.' }
  const limits = {
    image: { count: uploadLimits.image, bytes: MAX_IMAGE_BYTES, sizeError: '이미지는 5MB 이하만 업로드할 수 있습니다.' },
    video: { count: uploadLimits.video, bytes: MAX_VIDEO_BYTES, sizeError: '영상은 100MB 이하만 업로드할 수 있습니다.' },
    file: { count: uploadLimits.file, bytes: MAX_FILE_BYTES, sizeError: '첨부파일은 50MB 이하만 업로드할 수 있습니다.' },
  }[type]
  if (blocks.filter((block) => block.type === type).length >= limits.count) return { error: `${type === 'image' ? '이미지는' : type === 'video' ? '영상은' : '첨부파일은'} 최대 ${limits.count}개까지 추가할 수 있습니다.` }
  if (file.size > limits.bytes) return { error: limits.sizeError }
  return { type }
}
