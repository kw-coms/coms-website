// Local storage writes belong to the member who opened the editor in this session.
let owner: string | null = null
let epoch = 0
let loggingOut = false
let invalidated = false
let trackingAvailable = true
let logoutGeneration: string | null = null
let ownerGeneration: string | null = null
const OWNER_KEY = 'kwcoms-member-owner:v1'
const TAB_KEY = 'kwcoms-member-tab:v1'
const logoutKey = (id: string) => `kwcoms-member-logout:v1:${id}`
const listeners = new Set<() => void>()
type TabSession = { owner: string; logoutGeneration: string; ownerGeneration: string; ended: boolean }
let tabSession: TabSession | null = null
try {
  if (typeof sessionStorage !== 'undefined') {
    const value = JSON.parse(sessionStorage.getItem(TAB_KEY) || 'null')
    if (typeof value?.owner === 'string' && typeof value.logoutGeneration === 'string' && typeof value.ownerGeneration === 'string') tabSession = value
    invalidated = tabSession?.ended === true
  }
} catch { /* Session storage may be blocked along with local storage. */ }

function storage() {
  return typeof localStorage === 'undefined' ? null : localStorage
}

function rememberTab() {
  if (!owner || !logoutGeneration || !ownerGeneration) return
  tabSession = { owner, logoutGeneration, ownerGeneration, ended: invalidated }
  try {
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(TAB_KEY, JSON.stringify(tabSession))
  } catch { /* The in-memory fence still protects this mounted tab. */ }
}

function invalidate() {
  if (invalidated) return
  invalidated = true
  epoch += 1
  rememberTab()
  listeners.forEach((listener) => listener())
}

function checkGeneration() {
  if (!owner || invalidated || !trackingAvailable) return
  try {
    const shared = storage()
    if (shared && (shared.getItem(logoutKey(owner)) !== logoutGeneration || shared.getItem(OWNER_KEY) !== ownerGeneration)) invalidate()
  } catch {
    trackingAvailable = false
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === null || event.key === OWNER_KEY || (owner && event.key === logoutKey(owner))) checkGeneration()
  })
}

export function subscribeMemberSession(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function setMemberSessionOwner(next: string | number | null | undefined, freshLogin = false) {
  const id = next == null || String(next).trim() === '' ? null : String(next)
  if (loggingOut && id !== null) return
  checkGeneration()
  // A refresh of /me must not revive a tab ended elsewhere; only its own login may do so.
  if (invalidated && id !== null && !freshLogin) return
  if (id === owner && !freshLogin) return
  owner = id
  epoch += 1
  if (freshLogin) invalidated = false
  trackingAvailable = true
  try {
    const shared = storage()
    if (!id || !shared) return
    if (tabSession && !freshLogin) {
      logoutGeneration = tabSession.logoutGeneration
      ownerGeneration = tabSession.ownerGeneration
      if (tabSession.owner !== id) invalidate()
      checkGeneration()
      return
    }
    logoutGeneration = shared.getItem(logoutKey(id)) || crypto.randomUUID()
    // Reserve a fixed-size slot so logout need not allocate space after a draft fills storage.
    if (!shared.getItem(logoutKey(id))) shared.setItem(logoutKey(id), logoutGeneration)
    const previous = shared.getItem(OWNER_KEY)
    ownerGeneration = previous
    if (freshLogin || !previous || JSON.parse(previous).owner !== id) {
      ownerGeneration = JSON.stringify({ owner: id, generation: crypto.randomUUID() })
      shared.setItem(OWNER_KEY, ownerGeneration)
    }
    checkGeneration()
    rememberTab()
  } catch {
    trackingAvailable = false
  }
}

export function memberSessionEpoch() { return epoch }

export function isMemberSessionCurrent(candidate: string | number | null | undefined, expectedEpoch = epoch) {
  checkGeneration()
  return !invalidated && !loggingOut && owner !== null && String(candidate) === owner && expectedEpoch === epoch
}

export function canWriteMember(candidate: string | number | null | undefined, expectedEpoch = epoch) {
  return isMemberSessionCurrent(candidate, expectedEpoch) && trackingAvailable
}

export function beginMemberLogout() {
  if (loggingOut || !isMemberSessionCurrent(owner)) return false
  loggingOut = true
  try {
    if (owner) {
      const generation = crypto.randomUUID()
      storage()?.setItem(logoutKey(owner), generation)
      logoutGeneration = generation
      rememberTab()
    }
  } catch {
    loggingOut = false
    return false
  }
  return true
}
export function cancelMemberLogout() { loggingOut = false }
export function finishMemberLogout() {
  owner = null
  epoch += 1
  loggingOut = false
}
