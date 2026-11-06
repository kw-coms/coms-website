#!/usr/bin/env node
// Rendering-cost probe. Drives the built site (vite preview) in Chromium twice -- with the
// default GPU path and with software-only rendering (what a machine without hardware
// acceleration gets) -- and records, per page and interaction: rAF frame times (p50/p95,
// share of frames over 33 ms / 100 ms), long tasks, and the time Chromium spent in
// Paint/Raster/Composite/Layout (CDP tracing).
//
// Usage: PWA_DISABLE=1 npm run build && node scripts/perf-probe.mjs [--mode software|normal|both]
//          [--pages home,study,...] [--out file.json] [--perf lite|full] [--port 4199]
// --dpr 1.5 --throttle 4 --width 1920 --height 1080 approximate a mid-range Windows laptop (the dev
// machine's CPU is far faster than a typical GPU-less PC, so main-thread work is slowed 4x).
// --css '<rules>' injects extra CSS (to A/B a single rule without rebuilding).
// --perf forces the site's own render mode (localStorage kwcoms-perf-mode:v1) for A/B runs.

import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'
import { mockAdminApis, mockOptionalApis } from '../tests/e2e/visualSupport.js'

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, arg, i, all) => (arg.startsWith('--') ? [...acc, [arg.slice(2), all[i + 1]?.startsWith('--') ? 'true' : all[i + 1] ?? 'true']] : acc), []),
)
const PORT = Number(args.port || 4199)
const BASE = `http://127.0.0.1:${PORT}`
const MODES = args.mode === 'normal' ? ['normal'] : args.mode === 'both' ? ['normal', 'software'] : ['software']
const FORCE_PERF = args.perf || null
const DPR = Number(args.dpr || 1.5)
const THROTTLE = Number(args.throttle || 4)
const VIEW = { width: Number(args.width || 1920), height: Number(args.height || 1080) }
const TRACE_CATS = ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'cc', 'gpu', 'viz']
const COST_NAMES = {
  Paint: 'paint', PrePaint: 'paint', Layerize: 'paint',
  RasterTask: 'raster', ImageDecodeTask: 'raster', 'cc::RasterTask': 'raster',
  CompositeLayers: 'composite', 'Commit': 'composite', 'DrawFrame': 'composite', 'cc::DrawFrame': 'composite', 'Display::DrawAndSwap': 'composite',
  UpdateLayoutTree: 'layout', Layout: 'layout',
  FunctionCall: 'script', EvaluateScript: 'script', FireAnimationFrame: 'script',
}

const LAUNCH_ARGS = {
  // Headless Chromium here defaults to SwiftShader; ANGLE/Metal gives the real-GPU reference.
  normal: ['--use-angle=metal', '--ignore-gpu-blocklist'],
  software: ['--disable-gpu', '--disable-gpu-compositing', '--disable-software-rasterizer=false'],
}

const PAGES = {
  home: { path: '/' },
  study: { path: '/study' },
  'study-arduino': { path: '/study/arduino' },
  community: { path: '/community', admin: true },
  activities: { path: '/activities' },
  projects: { path: '/projects' },
}

const pct = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : 0)
const round = (n) => Math.round(n * 10) / 10

function summarize(frames, longTasks, cost) {
  const deltas = frames.slice(1).map((t, i) => t - frames[i])
  const sorted = [...deltas].sort((a, b) => a - b)
  return {
    frames: deltas.length,
    p50: round(pct(sorted, 0.5)),
    p95: round(pct(sorted, 0.95)),
    max: round(sorted.at(-1) || 0),
    over33: deltas.length ? round((deltas.filter((d) => d > 33).length / deltas.length) * 100) : 0,
    over100: deltas.filter((d) => d > 100).length,
    longTasks: longTasks.length,
    longTaskMs: Math.round(longTasks.reduce((s, t) => s + t, 0)),
    cost,
  }
}

function sumTrace(buffer) {
  const cost = { paint: 0, raster: 0, composite: 0, layout: 0, script: 0 }
  let events = []
  try {
    const parsed = JSON.parse(buffer.toString())
    events = Array.isArray(parsed) ? parsed : parsed.traceEvents || []
  } catch {
    return cost
  }
  for (const e of events) {
    if (e.ph !== 'X' || !e.dur) continue
    const bucket = COST_NAMES[e.name]
    if (bucket) cost[bucket] += e.dur / 1000
  }
  for (const k of Object.keys(cost)) cost[k] = Math.round(cost[k])
  return cost
}

const INIT = `
  window.__frames = []; window.__long = []; window.__rec = (() => { try { return sessionStorage.getItem('__probe_rec') === '1' } catch { return false } })();
  const loop = (t) => { if (window.__rec) window.__frames.push(t); requestAnimationFrame(loop) };
  requestAnimationFrame(loop);
  try { new PerformanceObserver((l) => { if (window.__rec) l.getEntries().forEach((e) => window.__long.push(e.duration)) }).observe({ entryTypes: ['longtask'] }) } catch {}
`

async function record(browser, page, label, action, { preArmed = false } = {}) {
  if (!preArmed) await page.evaluate(() => { window.__frames = []; window.__long = []; window.__rec = true })
  await browser.startTracing(page, { categories: TRACE_CATS })
  await action()
  const buffer = await browser.stopTracing()
  const { frames, long } = await page.evaluate(() => { window.__rec = false; return { frames: window.__frames, long: window.__long } })
  return { label, ...summarize(frames, long, sumTrace(buffer)) }
}

async function scrollThrough(page) {
  const height = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)
  await page.mouse.move(640, 450)
  const steps = Math.min(Math.ceil(height / 90), 140)
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, 90)
    await page.waitForTimeout(16)
  }
  await page.waitForTimeout(200)
}

async function newPage(browser, { admin, viewport, skipIntro, perf, recordFromStart }) {
  const mobile = !!viewport
  const context = await browser.newContext({ viewport: viewport || VIEW, deviceScaleFactor: mobile ? 2 : DPR, reducedMotion: 'no-preference' })
  const page = await context.newPage()
  if (THROTTLE > 1) await (await context.newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: THROTTLE })
  await page.addInitScript(({ skipIntro, perf, recordFromStart }) => {
    try {
      if (recordFromStart) sessionStorage.setItem('__probe_rec', '1')
      if (skipIntro) sessionStorage.setItem('coms.intro.played:v1', '1')
      if (perf) localStorage.setItem('kwcoms-perf-mode:v1', perf)
    } catch {}
  }, { skipIntro, perf, recordFromStart })
  await page.addInitScript(INIT)
  if (args.css) await page.addInitScript((css) => document.addEventListener('DOMContentLoaded', () => { const el = document.createElement('style'); el.textContent = css; document.head.append(el) }), args.css)
  await page.route('**/api/**', (route) => route.fulfill({ status: 200, json: [] }))
  await (admin ? mockAdminApis(page) : mockOptionalApis(page))
  return { context, page }
}

async function renderer(browser) {
  const page = await browser.newPage()
  const info = await page.evaluate(() => {
    const c = document.createElement('canvas')
    const strict = c.getContext('webgl', { failIfMajorPerformanceCaveat: true })
    const gl = strict || c.getContext('webgl')
    const ext = gl?.getExtension('WEBGL_debug_renderer_info')
    return { strictWebgl: !!strict, renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl ? 'webgl(no debug info)' : 'none' }
  })
  await page.close()
  return info
}

async function runMode(mode) {
  const browser = await chromium.launch({ headless: true, args: LAUNCH_ARGS[mode] })
  const out = { mode, gpu: await renderer(browser), results: {} }
  console.error(`[${mode}] webgl:`, JSON.stringify(out.gpu))
  const only = args.pages ? args.pages.split(',') : Object.keys(PAGES)
  try {
    // Boot intro: fresh session, measured from navigation start for 4.5 s.
    if (only.includes('home')) {
      const { context, page } = await newPage(browser, { skipIntro: false, perf: FORCE_PERF, recordFromStart: true })
      out.results['home-intro'] = [await record(browser, page, 'intro 4.5s', async () => {
        await page.goto(BASE + '/', { waitUntil: 'commit' })
        await page.waitForTimeout(4500)
      }, { preArmed: true })]
      await context.close()
    }
    for (const name of only) {
      const def = PAGES[name]
      if (!def) continue
      const rows = []
      const { context, page } = await newPage(browser, { admin: def.admin, skipIntro: true, perf: FORCE_PERF })
      await page.goto(BASE + def.path, { waitUntil: 'load' })
      await page.waitForTimeout(1200)
      rows.push(await record(browser, page, 'idle 2s', () => page.waitForTimeout(2000)))
      rows.push(await record(browser, page, 'scroll', () => scrollThrough(page)))
      if (name === 'home' || name === 'study') {
        await page.evaluate(() => scrollTo(0, 0))
        await page.waitForTimeout(300)
        const toggles = page.locator('.apple-global-nav nav > div button[aria-expanded], .apple-global-nav nav button[aria-expanded]')
        const n = Math.min(await toggles.count(), 3)
        for (let i = 0; i < n; i++) {
          rows.push(await record(browser, page, `dropdown #${i + 1}`, async () => {
            await toggles.nth(i).click()
            await page.waitForTimeout(700)
            await page.keyboard.press('Escape')
            await page.waitForTimeout(200)
          }))
        }
      }
      await context.close()
      out.results[name] = rows
    }
    if (only.includes('home')) {
      const { context, page } = await newPage(browser, { skipIntro: true, perf: FORCE_PERF, viewport: { width: 390, height: 844 } })
      await page.goto(BASE + '/', { waitUntil: 'load' })
      await page.waitForTimeout(1200)
      out.results['home-mobile'] = [
        await record(browser, page, 'mobile menu open', async () => {
          await page.getByRole('button', { name: '메뉴 열기' }).click()
          await page.waitForTimeout(900)
        }),
      ]
      await context.close()
    }
  } finally {
    await browser.close()
  }
  return out
}

function table(run) {
  console.log(`\n=== ${run.mode} (webgl: ${run.gpu.renderer}, strict=${run.gpu.strictWebgl}) ===`)
  console.log('page / step'.padEnd(34) + 'frames  p50   p95   max   >33%  >100ms  long(ms)  paint raster comp layout script')
  for (const [page, rows] of Object.entries(run.results)) {
    for (const r of rows) {
      const c = r.cost
      console.log(`${(page + ' / ' + r.label).padEnd(34)}${String(r.frames).padEnd(8)}${String(r.p50).padEnd(6)}${String(r.p95).padEnd(6)}${String(r.max).padEnd(6)}${String(r.over33).padEnd(6)}${String(r.over100).padEnd(8)}${(r.longTasks + '/' + r.longTaskMs).padEnd(10)}${String(c.paint).padEnd(6)}${String(c.raster).padEnd(7)}${String(c.composite).padEnd(5)}${String(c.layout).padEnd(7)}${c.script}`)
    }
  }
}

const server = spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: false })
const stop = () => { try { server.kill('SIGTERM') } catch {} }
process.on('exit', stop)
process.on('SIGINT', () => { stop(); process.exit(130) })
try {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(BASE)).ok) break } catch {}
    await new Promise((r) => setTimeout(r, 200))
  }
  const runs = []
  for (const mode of MODES) {
    const run = await runMode(mode)
    runs.push(run)
    table(run)
  }
  if (args.out) writeFileSync(args.out, JSON.stringify(runs, null, 2))
} finally {
  stop()
}
