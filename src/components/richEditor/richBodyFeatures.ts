/**
 * Toolbar feature flags for the reusable rich-body editor.
 * Community enables polls; other rich bodies use scoped media uploads.
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

/** Upload-enabled rich bodies have no community poll entity. */
export const UPLOAD_RICH_FEATURES = { ...FULL_RICH_FEATURES, poll: false }
