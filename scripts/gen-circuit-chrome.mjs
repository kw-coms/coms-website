#!/usr/bin/env node
// Writes the static chrome of every circuit figure (src/pages/study/circuits/chrome.ts) into the Arduino lesson, so
// each figure has its final height before the circuits chunk loads. Idempotent.
//
// Usage: node --import tsx scripts/gen-circuit-chrome.mjs
import { readFileSync, writeFileSync } from 'node:fs'

import { chromeHtml, hintHtml } from '../src/pages/study/circuits/chrome.ts'
import { circuitById } from '../src/pages/study/circuits/definitions.ts'

const file = new URL('../src/pages/study/content/arduino.html', import.meta.url)
const html = readFileSync(file, 'utf8')
// one figure at a time: nothing in a match may cross a </figure>
const inFigure = '(?:(?!</figure>)[\\s\\S])*?'
const figures = (html.match(/<figure class="circuit" data-circuit="/g) ?? []).length
let count = 0
const out = html.replace(
  new RegExp(`(<figure class="circuit" data-circuit="([\\w-]+)"[^>]*>)${inFigure}<figcaption>(${inFigure})(?: ?<span class="circuit-hint"[^>]*>[^<]*</span>)?</figcaption>`, 'g'),
  (_m, open, id, caption) => {
    const def = circuitById(id)
    if (!def) throw new Error(`no circuit definition for ${id}`)
    count += 1
    return `${open}\n${chromeHtml(def)}\n<figcaption>${caption} ${hintHtml(def)}</figcaption>`
  },
)
if (count !== figures) throw new Error(`${figures - count} circuit figure(s) have no <figcaption>: every figure needs one`)
writeFileSync(file, out)
console.log(`${count} circuit figures written`)
