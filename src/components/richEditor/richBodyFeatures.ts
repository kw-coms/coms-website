/**
 * Toolbar feature flags for the reusable rich-body editor.
 * Community enables everything; notices/resources expose only the subset
 * that works without community-scoped upload/poll backend endpoints.
 */
export const FULL_RICH_FEATURES = {
  format: true, // bold / italic / underline
  font: true,
  textColor: true,
  background: true,
  imageUpload: true,
  videoUpload: true,
  fileUpload: true,
  urlEmbed: true, // external image/video/YouTube URL insert
  videoSearch: true, // YouTube search
  poll: true,
}

/**
 * Features available to notices/resources without any backend change.
 * Binary uploads (image/video/file) and polls require community-scoped
 * endpoints + entities, so they are intentionally disabled here.
 */
export const URL_ONLY_RICH_FEATURES = {
  format: true,
  font: true,
  textColor: true,
  background: true,
  imageUpload: false,
  videoUpload: false,
  fileUpload: false,
  urlEmbed: true,
  videoSearch: true,
  poll: false,
}
