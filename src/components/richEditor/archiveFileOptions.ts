export const RICH_FILE_EXTENSIONS = ['pdf', 'txt', 'md', 'csv', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'hwp', 'hwpx', 'zip', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v']
export const RICH_FILE_ACCEPT = RICH_FILE_EXTENSIONS.map((ext) => `.${ext}`).join(',')
export function isAllowedRichFile(file: File) {
  const extension = file.name.split('.').pop()?.toLowerCase()
  return Boolean(extension && RICH_FILE_EXTENSIONS.includes(extension))
}
