// Fired on `window` by the home boot intro at the moment it uncovers the page, so the hero
// underneath can answer it. `detail.y` is the viewport y the screen opens from.
export const SCREEN_ON_EVENT = 'coms:screen-on'

export type ScreenOnDetail = { y: number }

// sessionStorage flag the boot intro sets once it has played (read by perfMode to know whether it will).
export const INTRO_SESSION_KEY = 'coms.intro.played:v1'
