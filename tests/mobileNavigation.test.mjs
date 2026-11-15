import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const nav = readFileSync(new URL('../src/components/GlobalNavigation.tsx', import.meta.url), 'utf8')
const mobileMenu = readFileSync(new URL('../src/components/MobileNavMenu.tsx', import.meta.url), 'utf8')
const notificationButton = readFileSync(new URL('../src/components/NotificationButton.tsx', import.meta.url), 'utf8')
const indexCss = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')
const css = [...indexCss.matchAll(/@import "(\.\/.+?)";/g)]
  .map((m) => readFileSync(new URL(`../src/${m[1]}`, import.meta.url), 'utf8'))
  .join('\n')

assert.match(
  mobileMenu,
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

// The menu is a full-screen overlay with every group open (not a dropdown list), and it is modal.
assert.match(
  mobileMenu,
  /role=\{guidedPreview \? undefined : 'dialog'\} aria-modal=\{guidedPreview \? undefined : 'true'\}/,
  'the ordinary phone menu remains modal while guided preview leaves focus to the tour',
)

assert.match(
  mobileMenu,
  /useModalFocus\(!guidedPreview, onClose\)/,
  'the phone menu should trap focus and close on Escape',
)

assert.match(
  mobileMenu,
  /document\.body\.style\.overflow = 'hidden'[\s\S]*?document\.body\.style\.overflow = previous/,
  'the page behind the phone menu should not scroll, and be released on close',
)

assert.match(
  mobileMenu,
  /navGroups\.map\(\(group\) => \(\s*<section/,
  'the phone menu should list every navGroups group as a headed section',
)

assert.match(
  css,
  /\.nav-m-item \{[\s\S]*?width: 100%;[\s\S]*?min-height: 2\.75rem;[\s\S]*?text-align: left;/,
  'phone menu rows should keep finger-sized (44px) full-width hit areas',
)

assert.doesNotMatch(
  css,
  /\.nav-m-item \{[^}]*animation:/,
  'phone menu rows should not each run a cascade animation',
)

assert.match(
  css,
  /\.nav-m-overlay \{[\s\S]*?animation: nav-panel-in 250ms cubic-bezier\(0\.16, 1, 0\.3, 1\) both;/,
  'the phone menu should use one short rise-and-fade open animation',
)

assert.match(
  css,
  /@media \(min-width: 600px\) and \(max-width: 1023px\) and \(max-height: 480px\) \{[\s\S]*?\.nav-m-overlay\[data-tour-guided='true'\] \{[\s\S]*?width: calc\(50vw - 12px\)/,
  'only the guided phone menu narrows in short landscape',
)

assert.match(
  css,
  /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.nav-m-overlay \{\s*animation: none;/,
  'the phone menu should not animate under reduced motion',
)

assert.match(
  css,
  /:root\[data-perf='lite'\] \.nav-panel,\s*:root\[data-perf='lite'\] \.nav-m-overlay \{\s*animation: none;/,
  'the panels should not animate in lite mode',
)

// The brand link, a notification row and the browser's Back button navigate without going
// through the menu's own closeAndGo, so the menu has to follow the route itself.
assert.match(
  nav,
  /if \(location\.key !== menuLocationKey\) \{[\s\S]*?setMobileMenuOpen\(false\)[\s\S]*?setOpenGroup\(null\)/,
  'the menus should close on every route change, not only from their own links',
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
