// setupDom first: the settings page mounts into a real (jsdom) document.
import './setupDom.mjs'
import assert from 'node:assert/strict'
import * as nodeModule from 'node:module'
import { act, createElement, useState } from 'react'
import { createRoot } from 'react-dom/client'

import { AuthContext } from '../src/contexts/useAuth.ts'
import { ToastHost } from '../src/components/common/Toast.tsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const realSetTimeout = globalThis.setTimeout
globalThis.setTimeout = (...args) => {
  const timer = realSetTimeout(...args)
  timer.unref?.()
  return timer
}

// logoAssets reads import.meta.glob, which only exists under Vite: give the page a stand-in.
const LOGO_ASSETS_STUB = 'data:text/javascript,export const getLogoAsset = () => "/coms-logo.png"'
if (typeof nodeModule.registerHooks === 'function') {
  // In-thread hooks are asked first. The TypeScript loader registers its own this way on newer
  // Node versions and resolves the import itself, so a hook added with register() is never
  // consulted there — the real module loaded and the test died on import.meta.glob.
  nodeModule.registerHooks({
    resolve(specifier, context, nextResolve) {
      return /\/utils\/logoAssets(\.ts)?$/.test(specifier)
        ? { url: LOGO_ASSETS_STUB, shortCircuit: true }
        : nextResolve(specifier, context)
    },
  })
} else {
  nodeModule.register(`data:text/javascript,${encodeURIComponent(`
    export async function resolve(specifier, context, nextResolve) {
      if (/\\/utils\\/logoAssets(\\.ts)?$/.test(specifier)) {
        return { url: ${JSON.stringify(LOGO_ASSETS_STUB)}, shortCircuit: true }
      }
      return nextResolve(specifier, context)
    }
  `)}`)
}
const { default: ChangePassword } = await import('../src/pages/ChangePassword.tsx')

const MEMBER = {
  id: 7, studentId: '2026000001', name: '홍길동', role: 'USER', email: 'member@example.com',
  emailVerified: true, phone: '01012345678', aspiration: '열심히 하겠습니다.',
  interests: '웹,알고리즘,기타:게임', selectedFontId: null, selectedBuiltinFontKey: null,
}

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

let profileBodies = []
let passwordBodies = []
let answerPassword = () => new Response(null, { status: 204 })
let currentMember = MEMBER
globalThis.fetch = async (url, options = {}) => {
  const path = String(url)
  if (path === '/api/auth/profile') {
    const body = JSON.parse(options.body)
    profileBodies.push(body)
    return json(200, { ...currentMember, ...body })
  }
  if (path === '/api/auth/password') {
    passwordBodies.push(JSON.parse(options.body))
    return answerPassword()
  }
  if (path.startsWith('/api/notifications/preferences')) return json(200, {})
  return json(200, [])
}

let clearSessionCalls = 0
function Harness({ member }) {
  const [user, setUser] = useState(member)
  const value = {
    user,
    permissions: [],
    setUser,
    refreshUser: async () => user,
    clearSession: () => { clearSessionCalls += 1; setUser(null) },
  }
  return createElement(
    AuthContext.Provider,
    { value },
    user ? createElement(ChangePassword, { onBack() {} }) : createElement('p', null, 'signed out'),
    createElement(ToastHost),
  )
}

async function flush() {
  for (let turn = 0; turn < 10; turn += 1) {
    await act(async () => { await new Promise((resolve) => setImmediate(resolve)) })
  }
}

async function mount(member) {
  currentMember = member
  profileBodies = []
  passwordBodies = []
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(createElement(Harness, { member })) })
  await flush()
  return {
    container,
    async unmount() {
      await act(async () => { root.unmount() })
      container.remove()
    },
  }
}

const buttonByText = (scope, text) => [...scope.querySelectorAll('button')].find((button) => button.textContent.trim() === text)
const chip = (scope, label) => [...scope.querySelectorAll('button[aria-pressed]')].find((button) => button.textContent.trim() === label)

async function click(element) {
  assert.ok(element, 'element to click exists')
  await act(async () => { element.click() })
  await flush()
}

async function type(input, value) {
  assert.ok(input, 'input to type into exists')
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, value)
    input.dispatchEvent(new window.Event('input', { bubbles: true }))
  })
}

// ─── 1. Saving the profile leaves untouched interests exactly as stored ──────
{
  const page = await mount(MEMBER)
  assert.equal(chip(page.container, '알고리즘')?.getAttribute('aria-pressed'), 'true', 'a signup option shows as its own chip')
  assert.equal(chip(page.container, '웹')?.getAttribute('aria-pressed'), 'true')
  assert.equal(chip(page.container, '기타')?.getAttribute('aria-pressed'), 'true')
  assert.equal(page.container.querySelector('input[aria-label="기타 관심 분야"]')?.value, '게임')

  await click(buttonByText(page.container, '회원 정보 저장'))
  assert.equal(profileBodies.length, 1)
  assert.equal(profileBodies[0].interests, '웹,알고리즘,기타:게임')

  // Edited: written back in the signup format.
  await click(chip(page.container, '앱'))
  await click(buttonByText(page.container, '회원 정보 저장'))
  assert.equal(profileBodies[1].interests, '웹,알고리즘,기타:게임,앱')
  await page.unmount()
}

// A value an older build of this page wrote is not "fixed up" behind the member's back either.
{
  const legacy = { ...MEMBER, interests: '웹, 기타: 알고리즘 / 디자인' }
  const page = await mount(legacy)
  await click(buttonByText(page.container, '회원 정보 저장'))
  assert.equal(profileBodies[0].interests, '웹, 기타: 알고리즘 / 디자인')
  await page.unmount()
}

// 기타 with nothing typed is dropped rather than stored as a dangling "기타:".
{
  const page = await mount({ ...MEMBER, interests: '웹' })
  await click(chip(page.container, '기타'))
  await click(buttonByText(page.container, '회원 정보 저장'))
  assert.equal(profileBodies[0].interests, '웹')
  await click(chip(page.container, '웹'))
  await click(chip(page.container, '기타'))
  await click(buttonByText(page.container, '회원 정보 저장'))
  assert.equal(profileBodies[1].interests, null)
  await page.unmount()
}

// ─── 2. Password errors render inside the password form ──────────────────────
{
  const page = await mount(MEMBER)
  const submit = [...page.container.querySelectorAll('button[type="submit"]')].find((button) => button.textContent.trim() === '비밀번호 변경')
  const form = submit.closest('form')
  const [current, next, confirm] = form.querySelectorAll('input[type="password"]')

  // Over 72 bytes: stopped here, never sent.
  const tooLong = `Aa1!${'비밀번호'.repeat(6)}`
  await type(current, 'Current!234')
  await type(next, tooLong)
  await type(confirm, tooLong)
  await click(submit)
  assert.equal(passwordBodies.length, 0)
  let alert = form.querySelector('[role="alert"]')
  assert.match(alert?.textContent ?? '', /비밀번호가 너무 깁니다/)
  assert.equal(page.container.querySelectorAll('[role="alert"]').length, 1)

  // The server's own message, in the same place.
  answerPassword = () => json(401, { message: '현재 비밀번호가 올바르지 않습니다.' })
  await type(next, 'NewPass!234')
  await type(confirm, 'NewPass!234')
  await click(submit)
  assert.deepEqual(passwordBodies, [{ currentPassword: 'Current!234', newPassword: 'NewPass!234' }])
  alert = form.querySelector('[role="alert"]')
  assert.equal(alert?.textContent, '현재 비밀번호가 올바르지 않습니다.')
  assert.equal(clearSessionCalls, 0)

  // ─── 3. A successful change ends the session, and says so ──────────────────
  answerPassword = () => new Response(null, { status: 204 })
  await click(submit)
  assert.equal(clearSessionCalls, 1)
  assert.match(document.body.textContent, /비밀번호가 변경되었습니다\. 새 비밀번호로 다시 로그인해주세요\./)
  assert.match(page.container.textContent, /signed out/)
  await page.unmount()
}

console.log('account settings contract passed')
