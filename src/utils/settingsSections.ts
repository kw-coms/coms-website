// Which settings sections the member left open, per browser.

export const SETTINGS_OPEN_KEY = 'kwcoms-settings-open:v1'

export type SettingsOpenMap = Record<string, boolean>

export function readSettingsOpen(storage: Pick<Storage, 'getItem'> | null = safeStorage()): SettingsOpenMap {
  try {
    const value = JSON.parse(storage?.getItem(SETTINGS_OPEN_KEY) || '{}')
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return Object.fromEntries(Object.entries(value).filter(([, open]) => typeof open === 'boolean')) as SettingsOpenMap
  } catch {
    return {}
  }
}

export function writeSettingsOpen(id: string, open: boolean, storage: Pick<Storage, 'getItem' | 'setItem'> | null = safeStorage()) {
  try {
    storage?.setItem(SETTINGS_OPEN_KEY, JSON.stringify({ ...readSettingsOpen(storage), [id]: open }))
  } catch {
    // Storage blocked or full: the section just opens at its default next time.
  }
}

/** A remembered choice wins; otherwise sections start open on desktop and closed on phones. */
export function initialSettingsOpen(id: string, desktop: boolean, remembered: SettingsOpenMap): boolean {
  return remembered[id] ?? desktop
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}
