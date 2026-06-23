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

console.log('mobile navigation contract passed')
