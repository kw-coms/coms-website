// Fired on `window` by the home boot intro at the moment it uncovers the page, so the hero
// underneath can answer it. `detail.y` is the viewport y the screen opens from.
export const SCREEN_ON_EVENT = 'coms:screen-on'

export type ScreenOnDetail = { y: number }
