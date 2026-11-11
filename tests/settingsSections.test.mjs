import assert from 'node:assert/strict'
import { SETTINGS_OPEN_KEY, initialSettingsOpen, readSettingsOpen, writeSettingsOpen } from '../src/utils/settingsSections.ts'

const mem = new Map()
const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) }

assert.deepEqual(readSettingsOpen(storage), {})
writeSettingsOpen('settings-email', false, storage)
writeSettingsOpen('settings-profile', true, storage)
assert.deepEqual(readSettingsOpen(storage), { 'settings-email': false, 'settings-profile': true })
assert.equal(initialSettingsOpen('settings-email', true, readSettingsOpen(storage)), false, 'a remembered choice beats the desktop default')
assert.equal(initialSettingsOpen('settings-password', true, {}), true, 'desktop opens by default')
assert.equal(initialSettingsOpen('settings-password', false, {}), false, 'phones start collapsed')

mem.set(SETTINGS_OPEN_KEY, '[1,2]')
assert.deepEqual(readSettingsOpen(storage), {})
mem.set(SETTINGS_OPEN_KEY, '{"a":"yes","b":true}')
assert.deepEqual(readSettingsOpen(storage), { b: true }, 'non-boolean values are dropped')
assert.doesNotThrow(() => writeSettingsOpen('a', true, { getItem() { throw new Error('x') }, setItem() { throw new Error('x') } }))
console.log('settingsSections ok')
