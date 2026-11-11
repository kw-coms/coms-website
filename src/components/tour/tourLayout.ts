export type Box = { left: number; top: number; width: number; height: number }
export type Viewport = { left: number; top: number; width: number; height: number }
export type Layout = { spot: Box | null; left: number; top: number; maxWidth: number; maxHeight: number }

const SPOT_PAD = 6
const GAP = 14
const EDGE = 12
const MIN_SIDE_HEIGHT = 160

/** Keep the spotlight and scrollable card inside the visible (possibly keyboard-shrunk) viewport. */
export function placeTourCard(box: Box | null, cardWidth: number, cardHeight: number,
                              viewport: Viewport, preferAbove = false): Layout {
  const maxWidth = Math.max(0, Math.min(cardWidth, viewport.width - EDGE * 2))
  const fullHeight = Math.max(0, Math.min(cardHeight, viewport.height - EDGE * 2))
  const center = (): Layout => ({ spot: null,
    left: Math.round(viewport.left + (viewport.width - maxWidth) / 2),
    top: Math.round(viewport.top + (viewport.height - fullHeight) / 2),
    maxWidth, maxHeight: fullHeight })
  if (!box) return center()

  const left = Math.max(viewport.left, box.left - SPOT_PAD)
  const top = Math.max(viewport.top, box.top - SPOT_PAD)
  const right = Math.min(viewport.left + viewport.width, box.left + box.width + SPOT_PAD)
  const bottom = Math.min(viewport.top + viewport.height, box.top + box.height + SPOT_PAD)
  if (right <= left || bottom <= top) return center()
  const spot = { left, top, width: right - left, height: bottom - top }
  const roomAbove = Math.max(0, spot.top - viewport.top - GAP - EDGE)
  const roomBelow = Math.max(0, viewport.top + viewport.height - bottom - GAP - EDGE)
  let height = fullHeight
  let cardTop = viewport.top + (viewport.height - height) / 2
  let cardLeft = spot.left + spot.width / 2 - maxWidth / 2
  if (preferAbove && roomAbove >= MIN_SIDE_HEIGHT) {
    height = Math.min(height, roomAbove)
    cardTop = spot.top - GAP - height
  } else if (roomBelow >= height) {
    cardTop = bottom + GAP
  } else if (roomAbove >= height || roomAbove >= roomBelow && roomAbove >= MIN_SIDE_HEIGHT) {
    height = Math.min(height, roomAbove)
    cardTop = spot.top - GAP - height
  } else if (roomBelow >= MIN_SIDE_HEIGHT) {
    height = Math.min(height, roomBelow)
    cardTop = bottom + GAP
  }
  if (preferAbove && roomAbove < MIN_SIDE_HEIGHT && roomBelow < MIN_SIDE_HEIGHT) {
    const roomLeft = spot.left - viewport.left - GAP - EDGE
    const roomRight = viewport.left + viewport.width - left - spot.width - GAP - EDGE
    if (roomLeft >= maxWidth) cardLeft = spot.left - GAP - maxWidth
    else if (roomRight >= maxWidth) cardLeft = left + spot.width + GAP
    else if (roomAbove >= roomBelow && roomAbove > 0) {
      height = Math.min(height, roomAbove)
      cardTop = spot.top - GAP - height
    } else if (roomBelow > 0) {
      height = Math.min(height, roomBelow)
      cardTop = bottom + GAP
    }
  }
  cardLeft = Math.min(Math.max(cardLeft, viewport.left + EDGE), viewport.left + viewport.width - EDGE - maxWidth)
  cardTop = Math.min(Math.max(cardTop, viewport.top + EDGE), viewport.top + viewport.height - EDGE - height)
  return { spot, left: Math.round(cardLeft), top: Math.round(cardTop), maxWidth, maxHeight: height }
}
