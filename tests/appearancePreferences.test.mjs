import './setupDom.mjs'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as preferences from '../src/utils/themeColors.ts'

assert.equal(typeof preferences.getStoredIntroStyle, 'function', 'intro choice needs a validated stored preference')
assert.equal(typeof preferences.getStoredAccentStrength, 'function')
window.localStorage.clear()
assert.equal(preferences.getStoredIntroStyle(), 'cinematic')
assert.equal(preferences.getStoredAccentStrength(), 'standard')

for (const style of ['cinematic', 'legacy', 'off']) {
  window.localStorage.setItem(preferences.INTRO_STYLE_KEY, style)
  assert.equal(preferences.getStoredIntroStyle(), style)
}
for (const strength of ['standard', 'vivid']) {
  window.localStorage.setItem(preferences.ACCENT_STRENGTH_KEY, strength)
  assert.equal(preferences.getStoredAccentStrength(), strength)
}
window.localStorage.setItem(preferences.INTRO_STYLE_KEY, 'unknown')
window.localStorage.setItem(preferences.ACCENT_STRENGTH_KEY, 'unknown')
assert.equal(preferences.getStoredIntroStyle(), 'cinematic')
assert.equal(preferences.getStoredAccentStrength(), 'standard')

const storage = Object.getOwnPropertyDescriptor(window, 'localStorage')
Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('blocked') } })
try {
  assert.equal(preferences.getStoredIntroStyle(), 'cinematic')
  assert.equal(preferences.getStoredAccentStrength(), 'standard')
  assert.doesNotThrow(() => preferences.storeValue(preferences.INTRO_STYLE_KEY, 'legacy'))
} finally {
  Object.defineProperty(window, 'localStorage', storage)
}

const standard = preferences.getAccentTokens('#0071e3', 'dark', 'standard')
assert.deepEqual(standard, {
  '--app-accent': '#0071e3',
  '--app-accent-hover': '#2485e7',
  '--app-accent-soft': '#122b46',
  '--app-accent-text': '#4799eb',
  '--app-accent-border': 'color-mix(in srgb, #0071e3 42%, transparent)',
})
const vivid = preferences.getAccentTokens('#0071e3', 'dark', 'vivid')
assert.equal(vivid['--app-accent-soft'], '#0e3a69', 'vivid adds a stronger color tint')
assert.equal(vivid['--app-accent-border'], 'color-mix(in srgb, #0071e3 74%, transparent)')
assert.equal(preferences.getAccentTokens('invalid', 'dark', 'vivid')['--app-accent'], preferences.DEFAULT_ACCENT)

// Check the resulting foreground against the page surfaces, independently of the mixing implementation.
const luminance = (hex) => {
  const rgb = hex.slice(1).match(/../g).map((part) => parseInt(part, 16) / 255)
  const linear = rgb.map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722
}
for (const theme of ['light', 'dark']) {
  for (const accent of ['#000000', '#ffffff', '#ffff00', '#0071e3', '#ff00ff', '#808080']) {
    const text = preferences.getAccentTokens(accent, theme, 'vivid')['--app-accent-text']
    const values = [luminance(text), luminance(theme === 'dark' ? '#17191f' : '#ffffff')].sort((a, b) => b - a)
    assert.ok((values[0] + 0.05) / (values[1] + 0.05) >= 4.5, `${theme}/${accent}: vivid accent text remains readable`)
  }
}
const buildConfig = readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8')
assert.ok(buildConfig.includes('**/LegacyIntroCanvas-*.js'), 'the optional canvas must stay out of the service worker install precache')
console.log('appearance preference contracts passed')
