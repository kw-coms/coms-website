// An invite token is 32 random bytes encoded as unpadded base64url (43 characters).
export function companionReturnTo(search: string, hash: string): string | null {
  if (search.length > 80) return null
  const params = new URLSearchParams(search)
  if ([...params.keys()].length !== 1) return null
  const target = params.get('returnTo')
  return target === '/companion/respond' && /^#[A-Za-z0-9_-]{43}$/.test(hash) ? target + hash : null
}
