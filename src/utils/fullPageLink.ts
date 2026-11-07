// /lab/ is a separate app that nginx serves next to this SPA (Dockerfile.frontend). React Router
// has no route for it, so a menu entry that points there has to leave the SPA with a real page load.
export function isFullPageLink(to: unknown): to is string {
  return typeof to === 'string' && /^\/lab(\/|$)/.test(to)
}
