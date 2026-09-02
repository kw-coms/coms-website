import assert from 'node:assert/strict'

import { safeExternalSrc, safeYoutubeEmbedSrc } from '../src/pages/community/postEditorUtils.ts'

// Both helpers guard an attribute that goes straight into the DOM (an <iframe src>
// and an <img>/<video> src), so they return '' — never a partially-trusted value —
// when the input fails the check, and the caller skips rendering the element.

// ─── safeYoutubeEmbedSrc: canonical /embed/ form on the two YouTube origins ──
// It is an allow-list check, NOT a converter: a watch/youtu.be link must already
// have been turned into an /embed/ URL upstream (youtubeVideoIdFromUrl →
// youtubeEmbedUrl, when the embed block is built).

assert.equal(
  safeYoutubeEmbedSrc('https://www.youtube.com/embed/dQw4w9WgXcQ'),
  'https://www.youtube.com/embed/dQw4w9WgXcQ',
)
assert.equal(
  safeYoutubeEmbedSrc('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'),
  'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
  'the nocookie origin is allowed too (it is in the CSP frame-src)',
)
assert.equal(
  safeYoutubeEmbedSrc('https://www.youtube.com/embed/dQw4w9WgXcQ?start=30&rel=0'),
  'https://www.youtube.com/embed/dQw4w9WgXcQ?start=30&rel=0',
  'player query params survive',
)

// Rejected: not the /embed/ form, wrong origin, wrong scheme.
for (const rejected of [
  'https://youtu.be/dQw4w9WgXcQ',
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  'https://example.com/embed/dQw4w9WgXcQ',
  // Suffix/prefix tricks against a sloppy hostname check.
  'https://www.youtube.com.evil.com/embed/dQw4w9WgXcQ',
  'https://evil.com/https://www.youtube.com/embed/dQw4w9WgXcQ',
  'http://www.youtube.com/embed/dQw4w9WgXcQ',
  'javascript:alert(1)',
  'javascript:https://www.youtube.com/embed/dQw4w9WgXcQ',
  'data:text/html,<script>alert(1)</script>',
  '',
  null,
  undefined,
]) {
  assert.equal(safeYoutubeEmbedSrc(rejected), '', `${String(rejected)} must not be embeddable`)
}

// ─── safeExternalSrc: https only ─────────────────────────────────────────────

assert.equal(safeExternalSrc('https://cdn.example.com/a.png'), 'https://cdn.example.com/a.png')
assert.equal(safeExternalSrc('HTTPS://cdn.example.com/a.png'), 'HTTPS://cdn.example.com/a.png', 'scheme match is case-insensitive')

for (const rejected of [
  'http://cdn.example.com/a.png',
  '//evil.com/a.png',
  '/local/a.png',
  'javascript:alert(1)',
  'data:image/svg+xml,<svg onload=alert(1)>',
  ' https://cdn.example.com/a.png',
  '',
  null,
  undefined,
]) {
  assert.equal(safeExternalSrc(rejected), '', `${String(rejected)} must not be used as a src`)
}
