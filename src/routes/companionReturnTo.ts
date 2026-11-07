// The login page returns to two places outside the SPA: a companion invite (with its token in the
// hash) and Circuit Lab, whose compile needs a session (lab/src/ui/compileClient.ts links here).
// An invite token is 32 random bytes encoded as unpadded base64url (43 characters).
export function companionReturnTo(search: string, hash: string): string | null {
  if (search.length > 80) return null
  const params = new URLSearchParams(search)
  if ([...params.keys()].length !== 1) return null
  const target = params.get('returnTo')
  if (target === '/lab/' && hash === '') return target
  return target === '/companion/respond' && /^#[A-Za-z0-9_-]{43}$/.test(hash) ? target + hash : null
}
