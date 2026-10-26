import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { PUBLIC_PAGE_META, SITE_URL, renderPublicPageHtml } from '../src/routes/publicPageMeta.ts'
import { documentTitleFor } from '../src/routes/pageTitles.ts'

const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const sitemap = readFileSync(new URL('../public/sitemap.xml', import.meta.url), 'utf8')

// ─── Every public page in the sitemap has its own preview, and nothing else does ───
const sitemapPaths = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)]
  .map((match) => match[1].replace(SITE_URL, ''))
  .filter((path) => path !== '/')
assert.deepEqual(
  [...PUBLIC_PAGE_META.map((page) => page.path)].sort(),
  [...sitemapPaths].sort(),
  'publicPageMeta.ts and public/sitemap.xml list the same public pages',
)

for (const page of PUBLIC_PAGE_META) {
  // The prerendered title is exactly what the app sets once it runs, so the tab never flickers.
  assert.equal(page.title, documentTitleFor(page.path), `${page.path}: title matches documentTitleFor()`)
  assert.ok(page.description.length >= 20 && page.description.length <= 160, `${page.path}: description length`)

  const html = renderPublicPageHtml(indexHtml, page)
  const url = `${SITE_URL}${page.path}`
  assert.ok(html.includes(`<title>${page.title}</title>`), `${page.path}: <title>`)
  assert.ok(html.includes(`<meta property="og:url" content="${url}" />`), `${page.path}: og:url`)
  assert.ok(html.includes(`<link rel="canonical" href="${url}" />`), `${page.path}: canonical`)
  assert.ok(html.includes(`<meta property="og:title" content="${page.title}" />`), `${page.path}: og:title`)
  assert.equal((html.match(/<meta name="description"/g) || []).length, 1, `${page.path}: one description`)
  assert.ok(!html.includes('https://coms.kw.ac.kr/" />'), `${page.path}: no home URL left behind`)
  // Same app: the module entry and the shared og:image are untouched.
  assert.ok(html.includes('<script type="module" src="/src/main.tsx"></script>'), `${page.path}: app entry kept`)
  assert.ok(html.includes('og-image.jpg'), `${page.path}: og:image kept`)
}

// ─── Values are escaped, and a broken index.html fails the build instead of shipping ───
const tricky = renderPublicPageHtml(indexHtml, {
  path: '/x',
  title: 'A & B <script>',
  description: 'say "hi" & <b>bye</b> — 이 설명은 충분히 깁니다',
})
assert.ok(tricky.includes('<title>A &amp; B &lt;script&gt;</title>'))
assert.ok(tricky.includes('content="say &quot;hi&quot; &amp; &lt;b&gt;bye&lt;/b&gt; — 이 설명은 충분히 깁니다"'))
assert.throws(() => renderPublicPageHtml('<html><head></head></html>', PUBLIC_PAGE_META[0]), /title/)

console.log('publicPageMeta tests passed')
