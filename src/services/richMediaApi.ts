import { request } from './apiClient'

export type RichMediaScope = 'notice' | 'archive' | 'sponsor'
export type RichMediaKind = 'image' | 'video' | 'file'

export async function uploadRichMedia(scope: RichMediaScope, kind: RichMediaKind, file: File): Promise<{ id: number; kind: string; name: string; size: number }> {
  const part = kind === 'image' ? 'image' : kind === 'video' ? 'video' : 'file'
  const path = kind === 'image' ? 'images' : kind === 'video' ? 'videos' : 'files'
  const form = new FormData()
  form.append(part, file)
  return request(`/api/rich-media/${scope}/${path}`, { method: 'POST', body: form })
}

export const richMediaUrl = (id: number) => `/api/rich-media/${id}`
export const richMediaDownloadUrl = (id: number) => `/api/rich-media/${id}/download`
