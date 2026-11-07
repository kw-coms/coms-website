// "Circuit Lab에서 열기": builds a Lab share link (/lab/#s=<token>) holding the default UNO and the block's sketch.
// Mirrors encodeShare() of the Circuit Lab (lab/src/core/share.ts): scene JSON -> deflate-raw -> base64url, <= 32 KB / 50k chars.

const MAX_DECODED_BYTES = 32 * 1024
const MAX_ENCODED_CHARS = 50_000
export const LAB_URL = '/lab/'

export interface LabScene {
  version: 1
  title: string
  parts: Array<{ id: string; kind: 'arduino-uno'; pos: [number, number, number]; rotY: 0; props: Record<string, never> }>
  wires: never[]
  code: string
}

export function buildLabScene(code: string, title = '스터디 예제'): LabScene {
  return { version: 1, title, parts: [{ id: 'uno', kind: 'arduino-uno', pos: [-80, 0, 0], rotY: 0, props: {} }], wires: [], code }
}

function toBase64Url(bytes: Uint8Array) {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** The share token, or null when this browser cannot compress or the sketch is too large (caller falls back to copy + open). */
export async function encodeLabShare(code: string): Promise<string | null> {
  if (typeof CompressionStream === 'undefined') return null
  const bytes = new TextEncoder().encode(JSON.stringify(buildLabScene(code)))
  if (bytes.length > MAX_DECODED_BYTES) return null
  try {
    const buffer = await new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer()
    const token = toBase64Url(new Uint8Array(buffer))
    return token.length > MAX_ENCODED_CHARS ? null : token
  } catch { return null }
}

export const labLink = (token: string) => `${LAB_URL}#s=${token}`
