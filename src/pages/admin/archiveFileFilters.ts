import { archiveAttachments, archiveFileSize } from '../../components/archive/archiveUtils'
import type { ArchiveVisibility } from '../../services/archiveApi'

export type ArchiveFileRow = {
  id: number
  title?: string
  originalName?: string
  uploaderName?: string
  uploadedBy?: string
  category?: string
  description?: string
  visibility?: ArchiveVisibility
  selectedStudentIds?: string[]
  mimeType?: string
  uploadedAt?: string
  fileSize?: number
  viewCount?: number
  attachments?: { id?: number; originalName: string; mimeType?: string; fileSize: number; contentVersion?: string }[]
}

export type ArchiveFileFilters = {
  query: string
  category: string
  visibility: string
  fileType: string
  sort: 'newest' | 'name' | 'size' | 'views'
}

function attachmentType(attachment: { originalName: string; mimeType?: string }): 'image' | 'document' | 'archive' | 'other' {
  const mime = attachment.mimeType || ''
  const name = attachment.originalName || ''
  if (mime.startsWith('image/') || /\.(png|jpe?g|gif|webp)$/i.test(name)) return 'image'
  if (mime === 'application/zip' || /\.(zip|7z|rar|tar|gz)$/i.test(name)) return 'archive'
  if (/^(application\/(pdf|msword|vnd\.|rtf)|text\/)/.test(mime) || /\.(pdf|docx?|xlsx?|pptx?|txt|csv|hwp|hwpx)$/i.test(name)) return 'document'
  return 'other'
}

export function archiveFileType(file: ArchiveFileRow): 'image' | 'document' | 'archive' | 'other' {
  return attachmentType(archiveAttachments(file)[0])
}

export function filterSortArchiveFiles(files: ArchiveFileRow[], filters: ArchiveFileFilters): ArchiveFileRow[] {
  const query = filters.query.trim().toLocaleLowerCase()
  return files.filter((file) =>
    (!query || [file.title, file.originalName, file.uploaderName, file.uploadedBy,
      ...archiveAttachments(file).map((attachment) => attachment.originalName)]
      .some((value) => String(value || '').toLocaleLowerCase().includes(query))) &&
    (filters.category === 'ALL' || (file.category || 'GENERAL') === filters.category) &&
    (filters.visibility === 'ALL' || (file.visibility || 'MEMBERS') === filters.visibility) &&
    (filters.fileType === 'ALL' || archiveAttachments(file).some((attachment) => attachmentType(attachment) === filters.fileType))
  ).sort((a, b) => {
    if (filters.sort === 'name') return (a.title || a.originalName || '').localeCompare(b.title || b.originalName || '', 'ko')
    if (filters.sort === 'size') return archiveFileSize(b) - archiveFileSize(a)
    if (filters.sort === 'views') return (b.viewCount || 0) - (a.viewCount || 0)
    return (b.uploadedAt || '').localeCompare(a.uploadedAt || '')
  })
}
