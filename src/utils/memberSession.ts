// Local storage writes belong to the member who opened the editor in this session.
let owner: string | null = null
let epoch = 0
let loggingOut = false

export function setMemberSessionOwner(next: string | number | null | undefined) {
  const id = next == null || String(next).trim() === '' ? null : String(next)
  if (loggingOut && id !== null) return
  if (id === owner) return
  owner = id
  epoch += 1
}

export function memberSessionEpoch() { return epoch }

export function canWriteMember(candidate: string | number | null | undefined, expectedEpoch = epoch) {
  return !loggingOut && owner !== null && String(candidate) === owner && expectedEpoch === epoch
}

export function beginMemberLogout() {
  if (loggingOut) return false
  loggingOut = true
  return true
}
export function cancelMemberLogout() { loggingOut = false }
export function finishMemberLogout() {
  owner = null
  epoch += 1
  loggingOut = false
}
