import './setupDom.mjs'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { act, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthContext } from '../src/contexts/useAuth.ts'

registerHooks({ load(url, context, next) { return url.endsWith('.css') ? { format: 'module', source: '', shortCircuit: true } : next(url, context) } })
const { default: StudyGroupPage } = await import('../src/pages/study/groups/StudyGroupPage.tsx')
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const group = {
  id: 1, name: '테스트 스터디', description: '설명', topicTags: [], term: '2026-2',
  schedule: '', place: '', capacity: null, createdBy: 'leader', createdAt: '', updatedAt: '',
  leaderStudentId: 'leader', leaderName: '이전 리더', status: 'ACTIVE', manager: true,
  myMembership: { studentId: 'leader', name: '이전 리더', role: 'LEADER', status: 'APPROVED', joinedAt: '' },
  myInterest: null, interestSummary: { total: 0, levels: {}, slots: {}, names: null },
}
const approved = { studentId: 'leader', name: '이전 리더', role: 'MEMBER', status: 'APPROVED', joinedAt: '' }
const pending = { studentId: 'applicant', name: '비공개 신청자', role: 'MEMBER', status: 'PENDING', joinedAt: '' }
let memberRequests = 0
globalThis.fetch = async url => {
  if (String(url) === '/api/study-groups/1') return Response.json(group)
  if (String(url) === '/api/study-groups/1/members') {
    memberRequests += 1
    return Response.json(memberRequests === 1 ? [approved, pending] : [approved])
  }
  throw new Error(`Unexpected request: ${url}`)
}

const waitFor = async (ready, turns = 100) => {
  for (let turn = 0; turn < turns && !ready(); turn += 1) {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)) })
  }
}

const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60_000 } } })
const host = document.createElement('div')
document.body.append(host)
const root = createRoot(host)
await act(async () => root.render(h(MemoryRouter, { initialEntries: ['/study/groups/1'] },
  h(QueryClientProvider, { client }, h(AuthContext.Provider,
    { value: { user: { studentId: 'leader', role: 'USER' }, permissions: [], permissionsSettled: true } },
    h(Routes, null, h(Route, { path: '/study/groups/:groupId', element: h(StudyGroupPage) })))))))
const memberTab = () => [...host.querySelectorAll('[role="tab"]')].find(tab => tab.textContent === '멤버')
await waitFor(() => Boolean(memberTab()))
await act(async () => memberTab().click())
await waitFor(() => host.textContent.includes('비공개 신청자'))
assert.match(host.textContent, /비공개 신청자/, 'leader initially sees pending applicant')

await act(async () => client.setQueryData(['study', 1, 'leader'], {
  ...group, manager: false, leaderStudentId: 'new-leader', leaderName: '새 리더', myMembership: approved,
}))
await waitFor(() => !host.textContent.includes('비공개 신청자'))
assert.doesNotMatch(host.textContent, /비공개 신청자/, 'former leader cannot see cached pending applicant')
// The role change keys a fresh roster query; on a slow runner it can still be loading after one tick.
await waitFor(() => memberRequests === 2 && !host.textContent.includes('멤버를 불러오는 중'))
assert.equal(memberRequests, 2, 'manager role change uses a separate roster cache')
assert.match(host.textContent, /이전 리더/, 'approved members remain visible')

await act(async () => root.unmount())
client.clear()
host.remove()
console.log('study member role cache regression passed')
