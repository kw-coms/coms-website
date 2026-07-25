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

assert.doesNotMatch(headers, /frame-src[^;]*'self'/, 'CSP should not imply same-origin Apps iframe support')
assert.match(headers, /frame-src https:\/\/www\.youtube\.com https:\/\/www\.youtube-nocookie\.com;/,
  'only explicitly trusted video frame origins should remain allowed')

console.log('apps public hardening contract passed')
