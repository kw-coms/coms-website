import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFileSync } from 'node:fs'

const section = readFileSync(new URL('../src/components/home/CompanionServicesSection.tsx', import.meta.url), 'utf8')
const card = readFileSync(new URL('../src/components/apps/AppProjectCard.tsx', import.meta.url), 'utf8')
const embedUrl = new URL('../src/components/apps/AppEmbedModal.tsx', import.meta.url)
const embed = existsSync(embedUrl) ? readFileSync(embedUrl, 'utf8') : ''
const headers = readFileSync(new URL('../security-headers.conf', import.meta.url), 'utf8')

assert.doesNotMatch(section, /companionServices/, 'public Apps should not revive removed data from homeContent fallback')
assert.doesNotMatch(section, /FALLBACK_PROJECTS|FALLBACK_CATEGORIES/, 'API empty should render an honest empty state')
assert.match(section, /loadState|error/i, 'API failure should be represented as an explicit error state')
assert.match(section, /등록된 프로젝트가 아직 없습니다/, 'empty API response should keep the Korean empty state')
assert.match(section, /프로젝트를 불러오지 못했습니다/, 'failed API response should show an explicit Korean error state')

assert.doesNotMatch(card, /DEFAULT_MADE_BY|최준혁/, 'project cards must not invent a default author')
assert.doesNotMatch(card, /AppEmbedModal|여기서 열기|PanelTopOpen/, 'normal project links should remain external-link only')
assert.equal(existsSync(embedUrl), false, 'unused inline Apps iframe component should not remain available')
assert.doesNotMatch(embed, /allow-scripts[^"]*allow-same-origin|allow-same-origin[^"]*allow-scripts/,
  'inline embeds must not combine allow-scripts and allow-same-origin')

// 'self' is allowed for exactly one reason: the /study demo sandbox frame (see below).
assert.match(headers, /frame-src 'self' https:\/\/www\.youtube\.com https:\/\/www\.youtube-nocookie\.com;/,
  "frame-src should be 'self' (study sandbox) plus the explicitly trusted video frame origins only")

const nginx = readFileSync(new URL('../nginx.frontend.conf', import.meta.url), 'utf8')
const sandboxLocation = nginx.match(/location = \/study-sandbox\.html \{([^}]*)\}/)?.[1] ?? ''
assert.ok(sandboxLocation, 'nginx should have an exact-match location for the study sandbox')
assert.ok(nginx.indexOf('location = /study-sandbox.html') < nginx.indexOf('location / {'), 'sandbox location must precede the SPA fallback')
assert.doesNotMatch(sandboxLocation, /security-headers\.conf/, 'sandbox page must not get the site CSP (it needs inline scripts)')
assert.match(sandboxLocation, /Content-Security-Policy "sandbox allow-scripts allow-modals;/, 'sandbox CSP must force an opaque origin')
assert.doesNotMatch(sandboxLocation, /allow-same-origin/, 'sandbox must never get allow-same-origin')
assert.match(sandboxLocation, /connect-src 'none'/, 'sandboxed demo code must not open network connections')
const sandboxPage = readFileSync(new URL('../public/study-sandbox.html', import.meta.url), 'utf8')
assert.match(sandboxPage, /event\.source !== window\.parent/, 'sandbox page must only accept messages from its parent')
const studyDemos = readFileSync(new URL('../src/pages/study/studyDemos.ts', import.meta.url), 'utf8')
assert.doesNotMatch(studyDemos, /allow-same-origin/, 'demo frames must stay on an opaque origin')
assert.doesNotMatch(studyDemos, /\.srcdoc\b|setAttribute\('srcdoc'/, 'srcdoc frames inherit the site CSP; use the sandbox page')

console.log('apps public hardening contract passed')
