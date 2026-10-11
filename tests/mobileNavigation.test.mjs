import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const nav = readFileSync(new URL('../src/components/GlobalNavigation.tsx', import.meta.url), 'utf8')
const notificationButton = readFileSync(new URL('../src/components/NotificationButton.tsx', import.meta.url), 'utf8')
const indexCss = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')
const css = [...indexCss.matchAll(/@import "(\.\/.+?)";/g)]
  .map((m) => readFileSync(new URL(`../src/${m[1]}`, import.meta.url), 'utf8'))
  .join('\n')

assert.match(
  nav,
  /<NotificationButton alignLeft variant="mobileMenu" \/>/,
  'mobile menu should render notifications as a menu row',
)

assert.match(
  notificationButton,
  /variant === 'mobileMenu'/,
  'notification button should keep a dedicated mobile menu variant',
)

assert.match(
  notificationButton,
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
  nav,
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

// The brand link, a notification row and the browser's Back button navigate without going
// through the menu's own closeAndGo, so the menu has to follow the route itself.
assert.match(
  nav,
  /if \(location\.key !== menuLocationKey\) \{[\s\S]*?setMobileMenuOpen\(false\)[\s\S]*?setMobileActivityOpen\(false\)/,
  'mobile menu should close on every route change, not only from its own links',
)

assert.match(
  notificationButton,
  /aria-haspopup="dialog"\s+aria-expanded=\{effectiveOpen\}\s+aria-controls=\{popoverId\}/,
  'notification bell should expose its popover and whether it is open',
)

assert.match(
  notificationButton,
  /id=\{popoverId\}\s+role="dialog"\s+aria-label="알림"\s+tabIndex=\{-1\}/,
  'notification popover should be a named dialog that can take focus',
)

assert.match(
  notificationButton,
  /btnRef\.current\?\.contains\(target\) \|\| dropdownRef\.current\?\.contains\(target\)\) return\s+setOpen\(false\)/,
  'a press outside the popover and the bell should close the popover',
)

assert.match(
  notificationButton,
  /if \(event\.key !== 'Escape'\) return\s+event\.stopPropagation\(\)\s+setOpen\(false\)\s+btnRef\.current\?\.focus\(\)/,
  'Escape should close only the popover and hand focus back to the bell',
)

assert.doesNotMatch(
  notificationButton,
  /aria-label="notifications"/,
  'the bell label should be Korean like the rest of the navigation',
)

console.log('mobile navigation contract passed')
