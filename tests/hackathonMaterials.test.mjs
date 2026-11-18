import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { HACKATHON_PROJECTS } from '../src/features/hackathon/hackathon.ts'
import { pwaOptions } from '../vite.config.js'

const nginx = readFileSync(new URL('../nginx.frontend.conf', import.meta.url), 'utf8')
const materials = ['/hackathon-2026/opening.pptx', ...HACKATHON_PROJECTS.flatMap((project) => [project.proposal, project.presentation, project.video, project.poster])]

test('hackathon materials bypass the service worker app shell, including new tabs and query strings', () => {
  const denylist = pwaOptions.workbox.navigateFallbackDenylist
  for (const path of materials) {
    for (const suffix of ['', '?download=1']) {
      assert.ok(denylist.some((pattern) => pattern.test(path + suffix)), `${path + suffix} must reach the real file`)
    }
  }
  assert.ok(!denylist.some((pattern) => pattern.test('/hackathon')), 'the evaluation page still uses the app shell')
  assert.ok(!denylist.some((pattern) => pattern.test('/hackathon-20260/test.pdf')), 'the exception stays inside the materials directory')
})

test('hackathon PDFs avoid the HTML CSP while other pages keep it', () => {
  const location = nginx.match(/location ~ (\^\/hackathon-2026\/[^\n]+) \{([\s\S]*?)\n {4}}/)
  assert.ok(location, 'PDFs need a dedicated response policy for the native browser viewer')
  const [, pattern, block] = location
  const pdfRoute = /^\/hackathon-2026\/.+\.pdf$/
  assert.equal(pattern, pdfRoute.source.replaceAll('\\/', '/'))
  for (const path of materials.filter((path) => path.endsWith('.pdf'))) {
    assert.ok(pdfRoute.test(path), `${path} uses the PDF response policy`)
    assert.equal(readFileSync(new URL(`../public${path}`, import.meta.url)).subarray(0, 5).toString(), '%PDF-')
  }
  for (const path of ['/hackathon', '/api/archive/test.pdf', '/hackathon-2026/test.pdf.html']) assert.ok(!pdfRoute.test(path))
  assert.match(block, /include \/etc\/nginx\/security-headers-common\.conf;/)
  assert.doesNotMatch(block, /include \/etc\/nginx\/security-headers\.conf;|add_header Content-Security-Policy/)
  assert.match(block, /try_files \$uri =404;/, 'missing PDFs return 404 instead of HTML')
  const siteHeaders = readFileSync(new URL('../security-headers.conf', import.meta.url), 'utf8')
  assert.match(siteHeaders, /object-src 'none'/, 'the site-wide HTML policy stays strict')
})
