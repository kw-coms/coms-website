import './setupDom.mjs'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { act, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'

const require = createRequire(import.meta.url)
const { build } = require('esbuild')
const { MemoryRouter } = require('react-router-dom')

globalThis.IS_REACT_ACT_ENVIRONMENT = true
let phone = true
window.matchMedia = () => ({ get matches() { return phone }, addEventListener() {}, removeEventListener() {} })
globalThis.requestAnimationFrame = () => 1
globalThis.cancelAnimationFrame = () => {}
window.scrollTo = () => {}
Object.defineProperty(window.HTMLElement.prototype, 'offsetParent', { configurable: true, get() { return document.body } })
globalThis.__tourAuth = { user: null, loading: false, logout: async () => true }

const mocks = {
  '../utils/logoAssets': 'export const getLogoAsset=()=>"/coms-logo.png"',
  '../contexts/useAuth': 'export const useAuth=()=>globalThis.__tourAuth',
  '../contexts/usePermissions': 'export const usePermissions=()=>({permissions:[]})',
  '../data/homeContent': `const Icon=()=>null; export const navGroups=[
    {id:'club',label:'동아리',sub:'Club',items:[{id:'about',path:'/about',label:'소개',sub:'About',icon:Icon},{id:'activities',path:'/activities',label:'활동',sub:'Activities',icon:Icon}]},
    {id:'learn',label:'배움',sub:'Learn',items:[{id:'study',path:'/study',label:'스터디 자료',sub:'Study',icon:Icon},{id:'lab',path:'/lab/',label:'회로 Lab',sub:'Lab',icon:Icon}]},
    {id:'members',label:'멤버',sub:'Members',items:[{id:'notices',path:'/notices',label:'공지',sub:'Notices',icon:Icon}]},
    {id:'tools',label:'도구',sub:'Tools',items:[{id:'apps',path:'/apps',label:'작품',sub:'Works',icon:Icon}]},
  ]`,
  '../utils/themeColors': 'export const scrollToTopInstant=()=>{}',
  '../utils/fullPageLink': 'export const isFullPageLink=()=>false',
  '../utils/navVisits': 'export const countNavVisit=()=>{}; export const frequentNavPaths=()=>[]; export const navPathFor=(path,paths)=>paths.includes(path)?path:null; export const readNavVisits=()=>({})',
  './NotificationButton': 'export default function NotificationButton(){return null}',
  './MemberLock': 'export default function MemberLock(){return null}',
  '../utils/quickSearch': 'export const openQuickSearch=()=>{}',
  '../utils/roleAccess': 'export const ROLE_LABELS={}; export const canAccessOperationsPanel=()=>false',
  '../hooks/useEditorDraft': 'export const confirmEditorLeave=async()=>true',
}
const result = await build({
  entryPoints: [fileURLToPath(new URL('../src/components/GlobalNavigation.tsx', import.meta.url))],
  bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false,
  plugins: [{ name: 'nav-test-dependencies', setup(build) {
    build.onResolve({ filter: /.*/ }, ({ path }) => mocks[path] ? { path, namespace: 'mock' } : undefined)
    build.onLoad({ filter: /.*/, namespace: 'mock' }, ({ path }) => ({ contents: mocks[path], loader: 'tsx' }))
  } }],
})
const module = { exports: {} }
new Function('require', 'module', 'exports', result.outputFiles[0].text)(require, module, module.exports)
const GlobalNavigation = module.exports.default
const host = document.createElement('div')
document.body.append(host)
const sentinel = document.createElement('button')
sentinel.textContent = 'outside focus'
document.body.append(sentinel)
const root = createRoot(host)
await act(async () => root.render(h(MemoryRouter, { initialEntries: ['/about'] }, h(GlobalNavigation))))
const surface = async (value) => act(async () => window.dispatchEvent(new window.CustomEvent('coms:tour-surface', { detail: value })))

sentinel.focus()
await surface('club')
let mobile = host.querySelector('#mobile-menu')
assert.ok(mobile, 'tour opens the real phone menu')
assert.ok(mobile.querySelector('[data-tour-group="club"] [data-tour-path="/about"]'), 'actual About row is targetable')
assert.equal(mobile.closest('.nav-m-overlay').getAttribute('role'), null, 'tour owns the modal role')
assert.equal(mobile.closest('.nav-m-overlay').getAttribute('data-tour-guided'), 'true')
assert.ok(mobile.querySelector('[data-tour="login"]'), 'guest login is a real menu target')
assert.equal(document.activeElement, sentinel, 'guided menu does not steal tour card focus')
assert.notEqual(document.body.style.overflow, 'hidden', 'tour owns scroll policy')
await surface('learn')
assert.ok(host.querySelector('[data-tour-group="learn"] [data-tour-path="/study"]'))
assert.ok(host.querySelector('[data-tour-group="learn"] [data-tour-path="/lab/"]'))
await surface('tools')
assert.ok(host.querySelector('[data-tour-group="tools"] [data-tour-path="/apps"]'))
await surface(null)
assert.equal(host.querySelector('#mobile-menu'), null, 'release closes the tour-owned menu')

await act(async () => host.querySelector('[data-tour="mobile-menu"]').click())
mobile = host.querySelector('#mobile-menu')
assert.ok(mobile, 'ordinary hamburger still opens the menu')
assert.equal(mobile.closest('.nav-m-overlay').getAttribute('role'), 'dialog')
assert.equal(mobile.closest('.nav-m-overlay').getAttribute('aria-modal'), 'true')
assert.equal(document.body.style.overflow, 'hidden')
assert.ok(mobile.closest('.nav-m-overlay').contains(document.activeElement), 'ordinary menu still takes focus')
await act(async () => mobile.closest('.nav-m-overlay').querySelector('[aria-label="메뉴 닫기"]').click())
assert.equal(document.body.style.overflow, '')

phone = false
sentinel.focus()
await surface('learn')
assert.ok(host.querySelector('#nav-panel [data-tour-group="learn"] [data-tour-path="/study"]'), 'desktop opens the real Learn dropdown')
assert.equal(document.activeElement, sentinel, 'guided desktop dropdown does not steal focus')
await act(async () => document.body.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true })))
assert.ok(host.querySelector('#nav-panel'), 'outside presses do not dismiss a tour-owned dropdown')
await act(async () => host.querySelector('#nav-panel').dispatchEvent(new window.FocusEvent('focusout', { bubbles: true, relatedTarget: sentinel })))
assert.ok(host.querySelector('#nav-panel'), 'focus leaving the preview cannot dismiss the tour-owned dropdown')
await act(async () => document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
assert.ok(host.querySelector('#nav-panel'), 'the tour owns Escape during guided preview')
await surface('menu')
assert.equal(host.querySelector('#nav-panel [data-nav-col="club"]').getAttribute('data-open'), 'true')
await surface('account')
assert.equal(host.querySelector('#nav-panel'), null, 'desktop account step releases the dropdown')
await surface(null)
await act(async () => host.querySelector('[data-tour="nav-club"]').click())
assert.ok(host.querySelector('#nav-panel'), 'ordinary desktop group click still works')
await act(async () => document.body.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true })))
assert.equal(host.querySelector('#nav-panel'), null, 'ordinary dropdown still closes outside')

phone = true
globalThis.__tourAuth = { user: { name: '회원', role: 'USER' }, loading: false, logout: async () => true }
await act(async () => root.render(h(MemoryRouter, { initialEntries: ['/about'] }, h(GlobalNavigation))))
sentinel.focus()
await surface('account')
assert.ok(host.querySelector('#mobile-menu [data-tour="account"]'), 'member account is a real phone-menu target')
assert.equal(document.activeElement, sentinel)
await surface(null)
await act(async () => root.unmount())
host.remove()
sentinel.remove()

console.log('guided and ordinary navigation controls passed')
