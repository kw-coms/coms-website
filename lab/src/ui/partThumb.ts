import type { PartKind } from '../core/types';

/** Pre-rendered 3D thumbnails (public/parts, made by `npm run parts:thumbs`): 160x120, or the 360x270 `large` one. */
export const thumbUrl = (kind: PartKind, large = false) => `${import.meta.env.BASE_URL}parts/${kind}${large ? '-lg' : ''}.webp`;
