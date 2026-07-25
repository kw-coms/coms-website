type Role = string | null | undefined

const CONTENT_MANAGER_ROLES = new Set(['ADMIN', 'OFFICER'])
const OFFICER_TAB_IDS = new Set(['activities', 'projects', 'site-settings'])

export function canManageContent(role: Role) {
  return CONTENT_MANAGER_ROLES.has(role || '')
}

export function canManageSensitiveAdmin(role: Role) {
  return role === 'ADMIN'
}

export function canAccessOperationsPanel(role: Role) {
  return canManageContent(role)
}

export function adminTabsForRole<T extends { id: string }>(role: Role, tabs: T[]) {
  if (canManageSensitiveAdmin(role)) return tabs
  if (role === 'OFFICER') return tabs.filter((tab) => OFFICER_TAB_IDS.has(tab.id))
  return []
}

export function defaultOperationsTab(role: Role, requested?: string | null) {
  if (canManageSensitiveAdmin(role)) return requested || 'overview'
  if (role === 'OFFICER' && requested && OFFICER_TAB_IDS.has(requested)) return requested
  return 'activities'
}
