import type { Scene } from '../core/types';

export const SHARE_KEY = 's=';

/** Extract the share token from a location.hash like "#s=abc". */
export function parseShareHash(hash: string): string | null {
  const h = hash.replace(/^#/, '');
  return h.startsWith(SHARE_KEY) && h.length > SHARE_KEY.length ? h.slice(SHARE_KEY.length) : null;
}

export const shareHash = (token: string) => `#${SHARE_KEY}${token}`;

/** Resolve a scene from the URL hash; null when there is none. Throws the decoder's Korean error. */
export async function loadSharedScene(hash: string, decode: (t: string) => Promise<Scene>): Promise<Scene | null> {
  const token = parseShareHash(hash);
  return token ? decode(token) : null;
}
