// Installs a real (jsdom) browser DOM on globalThis for the node test runner.
//
// MUST be imported BEFORE any module that pulls in dompurify: DOMPurify binds to
// the global `window` at import time and permanently sets `isSupported = false`
// when there is none — in which case `sanitize()` returns its input untouched and
// a "sanitizer" test would pass while sanitizing nothing. sanitizeHtml() likewise
// falls back to plain HTML-escaping when `window`/`document` are missing, so
// without this setup the DOMPurify branch is never executed.
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://coms.kw.ac.kr',
})

globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.Node = dom.window.Node
globalThis.Element = dom.window.Element
globalThis.HTMLElement = dom.window.HTMLElement
globalThis.HTMLTemplateElement = dom.window.HTMLTemplateElement
globalThis.DocumentFragment = dom.window.DocumentFragment
globalThis.NodeFilter = dom.window.NodeFilter
globalThis.DOMParser = dom.window.DOMParser

export { dom }
