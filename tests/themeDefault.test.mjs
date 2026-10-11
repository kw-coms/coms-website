import './setupDom.mjs'

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { THEME_MODE_KEY, getStoredThemeMode } from '../src/utils/themeColors.ts'

// ─── dark is the default look ────────────────────────────────────────────────
window.localStorage.clear()
assert.equal(getStoredThemeMode(), 'dark', 'a visitor with no stored choice gets the dark theme')

// The first storage key was written on every first visit with whatever the OS preferred, so
// it cannot tell a deliberate choice from that default. It must not bring light back.
window.localStorage.setItem('kwcoms-theme-mode', 'light')
assert.notEqual(THEME_MODE_KEY, 'kwcoms-theme-mode')
assert.equal(getStoredThemeMode(), 'dark')

// ─── an explicit choice is kept ──────────────────────────────────────────────
window.localStorage.setItem(THEME_MODE_KEY, 'light')
assert.equal(getStoredThemeMode(), 'light')
window.localStorage.setItem(THEME_MODE_KEY, 'dark')
assert.equal(getStoredThemeMode(), 'dark')
window.localStorage.setItem(THEME_MODE_KEY, 'sepia')
assert.equal(getStoredThemeMode(), 'dark', 'an unknown value falls back to the default')

// ─── the page ships in the same state, so the first paint is not a white flash ─
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
assert.match(html, /<html lang="ko" data-theme-mode="dark">/)
assert.match(html, /<meta name="theme-color" content="#0f1115" \/>/)
const manifest = JSON.parse(readFileSync(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'))
assert.equal(manifest.background_color, '#0f1115')
assert.equal(manifest.theme_color, '#0f1115')

console.log('theme default contract passed')
