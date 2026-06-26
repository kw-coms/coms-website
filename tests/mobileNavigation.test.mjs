import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')

assert.match(
  app,
  /<NotificationButton alignLeft variant="mobileMenu" \/>/,
  'mobile menu should render notifications as a menu row',
)

assert.match(
  app,
  /variant === 'mobileMenu'/,
  'notification button should keep a dedicated mobile menu variant',
)

assert.match(
  app,
  /apple-mobile-menu-item apple-mobile-menu-notification/,
  'mobile notification row should reuse the shared menu item sizing',
)

assert.match(
  css,
  /\.apple-mobile-menu-item \{[\s\S]*?min-height: 3\.25rem;[\s\S]*?width: 100%;[\s\S]*?text-align: left;/,
  'mobile menu rows should have stable full-width sizing',
)

assert.match(
  css,
  /\.apple-mobile-menu-notification \{[\s\S]*?border: 0;[\s\S]*?background: transparent;/,
  'mobile notification row should not add a separate card-like button surface',
)

assert.match(
  app,
  /className="apple-mobile-menu-item apple-mobile-menu-subitem"/,
  'mobile Activity submenu rows should reuse the shared menu item touch sizing',
)

assert.match(
  css,
  /\.apple-mobile-menu-subitem \{[\s\S]*?min-height: 3\.75rem;[\s\S]*?align-items: flex-start;[\s\S]*?padding: 0\.75rem 1\.25rem 0\.75rem 1\.5rem;/,
  'mobile Activity submenu rows should keep stable finger-sized hit areas',
)

assert.doesNotMatch(
  css,
  /\.apple-mobile-menu-panel \.apple-mobile-menu-item \{[\s\S]*?animation:/,
  'mobile menu should not stagger every row with a separate cascade animation',
)

assert.match(
  css,
  /animation: menu-slide-down 160ms ease-out both;/,
  'mobile menu panel should use a short, restrained open animation',
)

console.log('mobile navigation contract passed')
