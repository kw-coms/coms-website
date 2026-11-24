import './setupDom.mjs'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
registerHooks({
  resolve(specifier, context, nextResolve) {
    return specifier.endsWith('.css')
      ? { url: 'data:text/javascript,export {}', shortCircuit: true }
      : nextResolve(specifier, context)
  },
})
const { default: AdminAppCatalogRow } = await import('../src/pages/admin/AdminAppCatalogRow.tsx')

const preview = { id: 7, version: 3, title: '검토 작품', reviewStatus: 'PENDING' }
const latest = { ...preview, version: 4, title: '수정 작품' }
const calls = []
globalThis.fetch = async (url, options) => {
  calls.push([String(url), options?.method ?? 'GET'])
  if (options?.method === 'PATCH') return Response.json({ message: '작품이 변경됐습니다.' }, { status: 409 })
  return Response.json([latest])
}

const container = document.createElement('div')
const root = createRoot(container)
let updated
await act(async () => {
  root.render(createElement(AdminAppCatalogRow, { item: preview, categories: [], onUpdated: (item) => { updated = item } }))
})
await act(async () => {
  [...container.querySelectorAll('button')].find((button) => button.textContent === '승인').click()
})

assert.deepEqual(calls, [
  ['/api/club-projects/7/review?status=APPROVED&version=3', 'PATCH'],
  ['/api/club-projects', 'GET'],
])
assert.deepEqual(updated, latest)
assert.equal(container.querySelector('[role="alert"]').textContent, '작품이 변경됐습니다.')
await act(async () => { root.unmount() })
console.log('admin project review version passed')
