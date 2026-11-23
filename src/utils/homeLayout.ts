import { useSyncExternalStore } from 'react'

export type HomeLayout = 'scenes' | 'compact'

const STORAGE_KEY = 'kwcoms-home-layout:v1'
const CHANGE_EVENT = 'coms:home-layout-change'
let memoryLayout: HomeLayout = 'scenes'
let storageWriteFailed = false

function getHomeLayout(): HomeLayout {
  if (storageWriteFailed) return memoryLayout
  try {
    return localStorage.getItem(STORAGE_KEY) === 'compact' ? 'compact' : 'scenes'
  } catch {
    return memoryLayout
  }
}

function subscribe(notify: () => void) {
  window.addEventListener(CHANGE_EVENT, notify)
  window.addEventListener('storage', notify)
  return () => {
    window.removeEventListener(CHANGE_EVENT, notify)
    window.removeEventListener('storage', notify)
  }
}

export function setHomeLayout(layout: HomeLayout) {
  memoryLayout = layout
  try {
    localStorage.setItem(STORAGE_KEY, layout)
    storageWriteFailed = false
  } catch {
    storageWriteFailed = true
  }
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

export const useHomeLayout = () => useSyncExternalStore(subscribe, getHomeLayout, () => 'scenes')
