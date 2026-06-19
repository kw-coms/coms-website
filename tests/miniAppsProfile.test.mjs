import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const profilePage = readFileSync(new URL('../src/pages/ChangePassword.jsx', import.meta.url), 'utf8')
const miniAppsApi = readFileSync(new URL('../src/services/miniAppsApi.js', import.meta.url), 'utf8')

assert.match(profilePage, /미니앱 저장함/, 'profile page should show a mini app save box')
assert.match(profilePage, /COMS 월드컵/, 'profile page should link saved worldcup documents')
assert.match(profilePage, /COMS 티어표/, 'profile page should link saved tier documents')
assert.match(profilePage, /listProfileMiniAppDocuments\('worldcup'\)/, 'profile page should request worldcup profile documents')
assert.match(profilePage, /listProfileMiniAppDocuments\('tier'\)/, 'profile page should request tier profile documents')
assert.match(miniAppsApi, /\/api\/mini-apps\/\$\{app\}\/profile/, 'mini app profile API should use the shared backend profile route')
assert.match(miniAppsApi, /X-Requested-With/, 'mini app profile API should keep the AJAX guard header')

console.log('mini app profile contract passed')
