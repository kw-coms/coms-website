#!/usr/bin/env node
// Usage: node scripts/verify-exercises.mjs --local [--only id]
//        node scripts/verify-exercises.mjs --runner http://localhost:3000
// The runner image has no node_modules. Problem files only use erasable types, so there
// run it with `node --experimental-strip-types` (Node 22.6+; default from 23.6).
import { readdir, mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'
import http from 'node:http'
import https from 'node:https'

try {
  (await import('tsx/esm/api')).register()
} catch (err) {
  if (err?.code !== 'ERR_MODULE_NOT_FOUND') throw err
}
const root = fileURLToPath(new URL('../', import.meta.url))
const markers = { c: '/*@USER@*/', java: '/*@USER@*/', python: '#@USER@' }

export async function loadProblems() {
  const dir = join(root, 'src/pages/study/exercises/problems')
  const files = (await readdir(dir)).filter(f => f.endsWith('.ts') && f !== 'index.ts').sort()
  const problems = []
  for (const file of files) {
    const { default: entries } = await import(pathToFileURL(join(dir, file)).href)
    if (!Array.isArray(entries)) throw new Error(`${file}: default export must be an array`)
    problems.push(...entries)
  }
  return problems
}

export function buildProgram(problem, lang, kind) {
  const code = problem[kind]?.[lang]
  if (typeof code !== 'string') throw new Error(`${problem.id}: missing ${kind}.${lang}`)
  if (problem.mode === 'stdio') return code
  const harness = problem.harness?.[lang]
  if (typeof harness !== 'string' || harness.split(markers[lang]).length !== 2) {
    throw new Error(`${problem.id}: harness must contain exactly one marker`)
  }
  // A callback preserves literal $ sequences in student code.
  return harness.replace(markers[lang], () => code)
}

export function compare(actual, expected, mode = 'tokens') {
  const normalize = text => text.replace(/\r\n?/g, '\n')
  if (mode === 'lines') return normalize(actual).trimEnd() === normalize(expected).trimEnd()
  const tokens = text => text.trim() ? text.trim().split(/\s+/u) : []
  const a = tokens(actual), b = tokens(expected)
  if (a.length !== b.length) return false
  const number = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/
  return a.every((value, i) => {
    if (mode === 'tokens' || !number.test(value) || !number.test(b[i])) return value === b[i]
    const x = Number(value), y = Number(b[i])
    return Number.isFinite(x) && Number.isFinite(y) && Math.abs(x - y) <= mode.float * Math.max(1, Math.abs(y))
  })
}

function command(executable, args, cwd, stdin = '', timeout = 5000) {
  return new Promise(resolveResult => {
    const child = spawn(executable, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'], detached: process.platform !== 'win32' })
    let stdout = '', stderr = '', timedOut = false, truncated = false, error = null
    const kill = () => {
      try { process.platform === 'win32' ? child.kill('SIGKILL') : process.kill(-child.pid, 'SIGKILL') } catch { /* already exited */ }
    }
    const timer = setTimeout(() => { timedOut = true; kill() }, timeout)
    const capture = key => chunk => {
      if (key === 'stdout') stdout += chunk
      else stderr += chunk
      if (Buffer.byteLength(stdout) + Buffer.byteLength(stderr) > 256 * 1024) { truncated = true; kill() }
    }
    child.stdout.setEncoding('utf8').on('data', capture('stdout'))
    child.stderr.setEncoding('utf8').on('data', capture('stderr'))
    child.on('error', e => { error = e.message })
    child.stdin.on('error', () => {}) // A program may exit without reading all input.
    child.stdin.end(stdin)
    child.on('close', (exitCode, signal) => {
      clearTimeout(timer)
      resolveResult({ stdout, stderr: error || stderr, exitCode, signal, timedOut, truncated, error })
    })
  })
}

export async function runLocal(lang, code, tests) {
  const dir = await mkdtemp(join(tmpdir(), 'study-exercises-'))
  try {
    const filename = { c: 'main.c', java: 'Main.java', python: 'main.py' }[lang]
    await writeFile(join(dir, filename), code)
    let compile
    if (lang === 'c') {
      compile = await command('gcc', ['-std=c17', '-O1', '-Wall', '-Wextra', filename, '-lm', '-o', 'main'], dir, '', 20000)
      if (compile.error) compile = await command('clang', ['-std=c17', '-O1', '-Wall', '-Wextra', filename, '-lm', '-o', 'main'], dir, '', 20000)
    } else if (lang === 'java') {
      compile = await command('javac', ['-encoding', 'UTF-8', '--release', '17', filename], dir, '', 20000)
    } else {
      compile = await command('python3', ['-c', 'import ast; ast.parse(open("main.py", encoding="utf-8").read())'], dir)
    }
    if (compile.exitCode !== 0 || compile.timedOut || compile.truncated) return { stage: 'compile', stderr: compile.stderr, results: [] }
    const results = []
    for (const stdin of tests) {
      // Compile once, but isolate each execution's working directory.
      const runDir = await mkdtemp(join(dir, 'case-'))
      const executable = { c: join(dir, 'main'), java: 'java', python: 'python3' }[lang]
      const args = { c: [], java: ['-cp', dir, 'Main'], python: [join(dir, filename)] }[lang]
      results.push(await command(executable, args, runDir, stdin))
    }
    return { stage: 'run', results }
  } finally { await rm(dir, { recursive: true, force: true }) }
}

export function runRemote(endpoint, lang, code, tests) {
  return new Promise((resolveResult, reject) => {
    const body = JSON.stringify({ lang, code, tests })
    const unix = endpoint.startsWith('unix:')
    const url = unix ? null : new URL('/study/api/run', endpoint)
    if (url && !['http:', 'https:'].includes(url.protocol)) return reject(new Error('Runner URL must use http or https'))
    const transport = url?.protocol === 'https:' ? https : http
    const options = { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'X-Runner-Client': 'verify' }, ...(unix ? { socketPath: endpoint.slice(5), path: '/study/api/run' } : {}) }
    const onResponse = res => {
      let text = ''
      res.setEncoding('utf8')
      res.on('data', chunk => {
        text += chunk
        if (Buffer.byteLength(text) > 1024 * 1024) req.destroy(new Error('Runner response too large'))
      })
      res.on('error', reject)
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`Runner HTTP ${res.statusCode}: ${text.slice(0, 300)}`))
        try { resolveResult(JSON.parse(text)) } catch { reject(new Error('Runner returned invalid JSON')) }
      })
    }
    const req = unix ? transport.request(options, onResponse) : transport.request(url, options, onResponse)
    const timer = setTimeout(() => req.destroy(new Error('Runner request timed out')), 45000)
    req.on('close', () => clearTimeout(timer))
    req.on('error', reject)
    req.end(body)
  })
}

export function validateWeb(problem) {
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
  if (!problem || typeof problem.chapter !== 'string' || !['html', 'css', 'js'].includes(problem.chapter)) throw new Error('Invalid web chapter')
  for (const key of ['id', 'title', 'statement', 'explain']) if (typeof problem[key] !== 'string' || !problem[key].trim()) throw new Error(`Missing web ${key}`)
  if (!Number.isInteger(problem.level) || problem.level < 1 || problem.level > 5) throw new Error('Invalid web level')
  for (const key of ['topics', 'hints']) if (!Array.isArray(problem[key]) || !problem[key].length || problem[key].some(s => typeof s !== 'string' || !s.trim())) throw new Error(`Invalid web ${key}`)
  if (problem.hints.length > 3) throw new Error('Too many web hints')
  for (const kind of ['starter', 'solution']) for (const lang of ['html', 'css', 'js']) if (typeof problem[kind]?.[lang] !== 'string') throw new Error(`Missing ${kind}.${lang}`)
  if (!Array.isArray(problem.checks) || problem.checks.length < 2 || problem.checks.length > 5) throw new Error('Expected 2–5 web checks')
  for (const check of problem.checks) {
    if (typeof check.name !== 'string' || !check.name.trim() || typeof check.code !== 'string' || !check.code.trim()) throw new Error('Invalid web check')
    new AsyncFunction('t', check.code)
  }
}

async function main() {
  let backend = null, endpoint = null, only = null
  const args = process.argv.slice(2)
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--local' && !backend) backend = 'local'
    else if (args[i] === '--runner' && !backend && args[i + 1]) { backend = 'runner'; endpoint = args[++i] }
    else if (args[i] === '--only' && args[i + 1]) only = args[++i]
    else throw new Error(`Unsupported argument: ${args[i]}. Use --local or --runner <URL|unix:path> [--only id]. Web execution belongs to the UI Playwright suite.`)
  }
  if (!backend) throw new Error('Specify --local or --runner <URL|unix:path>')
  const problems = (await loadProblems()).filter(p => !only || p.id === only)
  if (!problems.length) throw new Error('No matching problems')
  const rows = []
  let failures = 0, submissions = 0, casesPassed = 0, webCount = 0
  for (const p of problems) {
    if (!('langs' in p)) {
      try { validateWeb(p); webCount++; rows.push({ id: p.id, lang: 'web', solution: 'SHAPE PASS', starter: 'NOT RUN' }) }
      catch (e) { failures++; rows.push({ id: p.id, lang: 'web', solution: e.message, starter: 'NOT RUN' }) }
      continue
    }
    const cases = [...p.examples, ...p.tests]
    for (const lang of p.langs) {
      const row = { id: p.id, lang }
      let valid = true
      for (const kind of ['solution', 'starter']) {
        try {
          const code = buildProgram(p, lang, kind)
          const result = backend === 'local' ? await runLocal(lang, code, cases.map(c => c.stdin)) : await runRemote(endpoint, lang, code, cases.map(c => c.stdin))
          submissions++
          if (result.stage !== 'run' || !Array.isArray(result.results) || result.results.length !== cases.length) throw new Error(`${result.stage || 'invalid response'}: ${(result.stderr || 'missing case results').slice(0, 300)}`)
          const healthy = r => r && !r.skipped && !r.timedOut && !r.truncated && !r.signal && r.exitCode === 0 && typeof r.stdout === 'string'
          const passed = result.results.map((r, i) => healthy(r) && compare(r.stdout, cases[i].expected, p.compare))
          const count = passed.filter(Boolean).length
          const ok = kind === 'solution' ? count === cases.length : count < cases.length && result.results.every(healthy)
          if (kind === 'solution') casesPassed += count
          row[kind] = `${ok ? 'PASS' : 'FAIL'} ${count}/${cases.length}`
          if (!ok) {
            valid = false
            console.error(`${p.id}/${lang}/${kind}:`, result.results.map((r, i) => ({ case: i + 1, expected: cases[i].expected, ...r })))
          }
        } catch (e) { row[kind] = `FAIL ${e.message}`; valid = false }
      }
      if (!valid) failures++
      rows.push(row)
    }
  }
  console.table(rows)
  console.log(`Summary: ${rows.length - webCount} language variants, ${casesPassed} solution cases passed, ${submissions} submissions, ${webCount} web shapes, ${failures} failures.`)
  if (failures) process.exitCode = 1
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => { console.error(error.message); process.exitCode = 1 })
}
