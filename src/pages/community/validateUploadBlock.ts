import {
  ALLOWED_IMAGE_TYPES, ALLOWED_VIDEO_TYPES,
  MAX_EXTRA_IMAGES, MAX_FILE_BYTES, MAX_FILES, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, MAX_VIDEOS,
} from './postEditorUtils'

type Block = { type?: string }

/** Resolve one kind before enforcing that kind's count and byte limit. */
export function validateUploadBlock(file: File, blocks: Block[], isAllowedFile: (file: File) => boolean): { type?: 'image' | 'video' | 'file'; error?: string } {
  const type = ALLOWED_IMAGE_TYPES.includes(file.type) ? 'image'
    : ALLOWED_VIDEO_TYPES.includes(file.type) ? 'video'
      : isAllowedFile(file) ? 'file' : undefined
  if (!type) return { error: '지원하지 않는 파일 형식입니다.' }
  const limits = {
    image: { count: MAX_EXTRA_IMAGES, bytes: MAX_IMAGE_BYTES, countError: '이미지는 최대 5개까지 추가할 수 있습니다.', sizeError: '이미지는 5MB 이하만 업로드할 수 있습니다.' },
    video: { count: MAX_VIDEOS, bytes: MAX_VIDEO_BYTES, countError: '영상은 최대 3개까지 추가할 수 있습니다.', sizeError: '영상은 100MB 이하만 업로드할 수 있습니다.' },
    file: { count: MAX_FILES, bytes: MAX_FILE_BYTES, countError: '첨부파일은 최대 5개까지 추가할 수 있습니다.', sizeError: '첨부파일은 50MB 이하만 업로드할 수 있습니다.' },
  }[type]
  if (blocks.filter((block) => block.type === type).length >= limits.count) return { error: limits.countError }
  if (file.size > limits.bytes) return { error: limits.sizeError }
  return { type }
}
