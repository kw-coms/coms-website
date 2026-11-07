// Lab v2 UI e2e: node tools/e2e-ui-v2.mjs [shotsDir]   (needs the compile service at 127.0.0.1:8787; starts vite itself unless LAB_URL is set)
// Covers: debugger gutter + bar (set, hit, step, resume with the main Run button), notes (add / edit / delete, kept in the scene
// and in a share link), mission restore through a share link, hostile share links (huge Blockly mutator, hidden code in a block
// scene), and the scope time/div control writing the part's props.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { chromeExecutable, compileOrigin, GL_ARGS, outDir } from './browser.mjs';

const OUT = outDir('shots-ui-v2', process.argv[2]);
const COMPILE = compileOrigin();
if (!(await fetch(new URL('/lab/api/health', COMPILE), { redirect: 'error' }).then((r) => r.ok, () => false))) { console.log(`FAIL compile service not reachable at ${COMPILE}`); process.exit(2); }
let dev, base = process.env.LAB_URL;
if (!base) {
  const port = 5700 + Math.floor(Math.random() * 90);
  dev = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { stdio: 'ignore', env: { ...process.env, LAB_COMPILE_URL: COMPILE } });
  base = `http://localhost:${port}/lab/`;
  for (let i = 0; i < 80; i++) { try { if ((await fetch(base)).ok) break; } catch { /* retry */ } await new Promise((r) => setTimeout(r, 250)); }
}
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`); };
const browser = await chromium.launch({ executablePath: chromeExecutable(), args: GL_ARGS });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
await ctx.addInitScript(() => { try { localStorage.setItem('coms-lab:tutorial-done', '1'); } catch { /* about:blank has no storage */ } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' || (m.type() === 'warning' && /AudioContext/i.test(m.text()))) errs.push(m.text()); });
page.on('dialog', (d) => d.accept().catch(() => {}));
const lab = (f, a) => page.evaluate(f, a);
/** Click the breakpoint gutter next to a sketch line (the gutter container handles the mouse, so click by position). */
async function clickGutter(line) {
  const gutter = await page.locator('.cm-bp-gutter').boundingBox();
  const row = await page.locator('.cm-line').nth(line - 1).boundingBox();
  await page.mouse.click(gutter.x + gutter.width / 2, row.y + row.height / 2);
}
const settle = (ms = 400) => page.waitForTimeout(ms);
const shot = (n) => page.screenshot({ path: join(OUT, `ui-v2-${n}.png`) });
const until = async (f, a, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await lab(f, a)) return true; await settle(150); } return false; };
const st = () => lab(() => { const s = window.__lab.getState(); return { notes: s.hist.present.notes ?? [], mission: s.missionId, tab: s.sideTab, code: s.code, mode: s.hist.present.codeMode, bps: s.breakpoints, dbg: s.debug, toast: s.toast }; });
/** A share token for any scene, built in the page with the app's own modules (hostile scenes are compressed by hand: encodeShare validates). */
const token = (scene, raw = false) => lab(async ([url, scene, raw]) => {
  if (!raw) return (await import(/* @vite-ignore */ url)).encodeShare(scene);
  const stream = new Blob([new TextEncoder().encode(JSON.stringify(scene))]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}, [new URL('src/ui/core.ts', base).href, scene, raw]);
/** Open the app fresh on a share link. */
async function openShared(scene, raw = false) {
  const t = await token(scene, raw);
  await page.goto('about:blank');
  await page.goto(`${base}#s=${t}`);
  await page.waitForFunction(() => window.__lab?.EXAMPLES, null, { timeout: 30000 });
  await settle(900);
}
const boot = async () => {
  await page.goto('about:blank');
  await page.goto(base);
  await page.waitForFunction(() => window.__lab?.EXAMPLES, null, { timeout: 30000 });
  await lab(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => window.__lab?.EXAMPLES, null, { timeout: 30000 });
  await page.getByRole('button', { name: '확인', exact: true }).click({ timeout: 1500 }).catch(() => {});
};

try {
  await boot();

  // ---- debugger: gutter -> hit -> step -> resume with the main Run button ----
  await lab(() => window.__lab.loadScene(window.__lab.EXAMPLES.find((e) => e.id === 'builtin-blink').scene));
  await lab(() => window.__lab.set({ sideTab: 'code', sideOpen: true }));
  await page.waitForSelector('.cm-bp-gutter');
  const line = await lab(() => window.__lab.getState().code.split('\n').findIndex((l) => /digitalWrite\(.*HIGH/.test(l)) + 1);
  await clickGutter(line);
  await until(() => document.querySelectorAll('.bp-dot:not(.ghost)').length === 1, undefined, 3000);
  check('gutter click sets a breakpoint dot', (await lab(() => window.__lab.getState().breakpoints.length)) === 1 && (await page.locator('.bp-dot:not(.ghost)').count()) === 1);
  await page.getByRole('button', { name: '실행', exact: true }).click();
  check('hits the breakpoint', await until(() => window.__lab.getState().debug?.paused === true));
  await settle(300);
  const hit = await st();
  check('debug bar says where it stopped and the line is highlighted', (await page.locator('.debug-state').innerText()).includes(`${hit.dbg.line}번 줄에서 멈춤`) && (await page.locator('.cm-debug-line').count()) === 1);
  check('the stop is on the breakpoint line', hit.dbg.line === hit.bps[0], `${hit.dbg.line} vs ${hit.bps}`);
  await shot('debugger-hit');
  await page.getByRole('button', { name: /한 줄씩/ }).click();
  check('step moves to another line and stays paused', await until((l) => window.__lab.getState().debug?.paused === true && window.__lab.getState().debug.line !== l, hit.dbg.line));
  const frozenAt = await lab(() => window.__lab.frame().timeMs);
  await settle(500);
  check('simulated time is frozen while paused', (await lab(() => window.__lab.frame().timeMs)) === frozenAt);
  await page.getByRole('button', { name: '실행', exact: true }).click(); // the main Run action, not 계속
  check('main Run resumes: simulated time advances ~500 ms (one blink period)', await until((t) => window.__lab.frame().timeMs > t + 400, frozenAt));
  check('...and the breakpoint is hit again on the next loop', await until(() => window.__lab.getState().debug?.paused === true));
  await clickGutter(line);
  check('clicking the dot clears the breakpoint', (await lab(() => window.__lab.getState().breakpoints.length)) === 0);
  await page.getByRole('button', { name: '실행', exact: true }).click();
  check('Run continues freely once the breakpoint is gone', await until(() => window.__lab.simState() === 'running' && window.__lab.getState().debug?.paused !== true));
  await page.locator('button.tb[aria-label="정지"]').click();

  // ---- notes: add / edit / delete, kept in the scene and in a share link ----
  await lab(() => window.__lab.loadScene(window.__lab.EXAMPLES.find((e) => e.id === 'external-blink').scene));
  await page.getByRole('button', { name: '메모 붙이기' }).click();
  await page.getByLabel('메모 내용').fill('첫 번째 메모');
  check('note added and text edited', (await st()).notes.map((n) => n.text).join() === '첫 번째 메모');
  await page.getByRole('button', { name: '완료' }).click();
  await page.getByRole('button', { name: '메모 붙이기' }).click();
  await page.getByLabel('메모 내용').fill('두 번째 메모');
  await page.getByRole('button', { name: '메모 색 pink' }).click();
  check('second note has its text and color', (await st()).notes.map((n) => `${n.text}/${n.color}`).join() === '첫 번째 메모/yellow,두 번째 메모/pink');
  await shot('notes');
  const scene = await lab(() => window.__lab.getState().hist.present && { ...window.__lab.getState().hist.present, code: window.__lab.getState().code });
  await openShared(scene);
  check('both notes come back through the share link', (await st()).notes.map((n) => `${n.text}/${n.color}`).join() === '첫 번째 메모/yellow,두 번째 메모/pink');
  await page.reload(); // the autosave keeps them too
  await page.waitForFunction(() => window.__lab?.EXAMPLES);
  check('and through the autosave', (await st()).notes.length === 2);
  await lab(() => window.__lab.set({ editingNote: window.__lab.getState().hist.present.notes[1].id }));
  await page.getByRole('button', { name: '삭제' }).click();
  check('delete removes only that note', (await st()).notes.map((n) => n.text).join() === '첫 번째 메모');

  // ---- mission restore through a share link ----
  const mission = await lab(() => { const m = window.__lab.MISSIONS[2]; return { id: m.id, scene: m.starterScene, goal: m.goal }; });
  await openShared(mission.scene);
  const afterMission = await st();
  check('share link restores the mission id and opens the mission panel', afterMission.mission === mission.id && afterMission.tab === 'missions', JSON.stringify([afterMission.mission, afterMission.tab]));
  check('the mission view (not the list) is showing', await page.getByRole('button', { name: '확인하기' }).isVisible());
  await shot('mission-restored');
  await lab(() => window.__lab.loadScene(window.__lab.EXAMPLES[0].scene));
  check('loading another scene leaves the mission', (await st()).mission === null);

  // ---- study-site link: /lab/#mission=<id> ----
  await page.goto('about:blank');
  await page.goto(`${base}#mission=${mission.id}`);
  await page.waitForFunction(() => window.__lab?.EXAMPLES, null, { timeout: 30000 });
  await settle(900);
  const viaLink = await st();
  check('#mission=<id> opens that mission in the Missions tab', viaLink.mission === mission.id && viaLink.tab === 'missions' && await page.getByRole('button', { name: '확인하기' }).isVisible());
  check('the hash is cleared afterwards', (await lab(() => location.hash)) === '');
  await page.goto('about:blank');
  await page.goto(`${base}#mission=no-such-mission`);
  await page.waitForFunction(() => window.__lab?.EXAMPLES, null, { timeout: 30000 });
  await settle(600);
  check('an unknown mission id only shows a Korean notice', /미션을 찾을 수 없어요/.test((await st()).toast ?? ''));

  // ---- hostile share links ----
  const bare = { version: 2, parts: [], wires: [], code: 'void setup(){}\nvoid loop(){}\n' };
  const t0 = Date.now();
  await openShared({ ...bare, codeMode: 'blocks', blocks: { blocks: { languageVersion: 0, blocks: [{ type: 'lab_loop', inputs: { DO: { block: { type: 'lab_serial_print', inputs: { VALUE: { block: { type: 'text_join', extraState: { itemCount: 1000000000 } } } } } } } }] } } }, true);
  const hostile = await st();
  check('a 1e9-item text_join link is refused quickly with a Korean error', Date.now() - t0 < 15000 && /블록/.test(hostile.toast ?? ''), `${Date.now() - t0}ms ${hostile.toast}`);
  check('the page is still responsive afterwards', (await lab(() => 1 + 1)) === 2);
  await openShared({ ...bare, codeMode: 'blocks', code: 'void setup(){}\nvoid loop(){ /* HIDDEN */ }\n', blocks: { blocks: { languageVersion: 0, blocks: [{ type: 'lab_setup' }, { type: 'lab_loop' }] } } });
  check('a block-mode scene never runs its hidden code', !(await st()).code.includes('HIDDEN'));

  // ---- scope time/div writes the part prop the simulator acquires with ----
  await lab(() => { window.__lab.loadScene({ version: 2, parts: [], wires: [], code: 'void setup(){}\nvoid loop(){}\n' }); window.__lab.addPart('oscilloscope', [0, -9, 0]); window.__lab.set({ sideTab: 'instruments', sideOpen: true }); });
  await page.locator('.inst-card select[aria-label="시간/칸"]:visible').first().selectOption('100');
  check('시간/칸 = 100 ms is stored in the part props', (await lab(() => window.__lab.getState().hist.present.parts.find((p) => p.kind === 'oscilloscope').props.timeDiv)) === 100);
  check('no console errors / AudioContext warnings', errs.length === 0, errs.slice(0, 3).join(' | '));
} catch (e) {
  console.log('FAIL exception', e.message);
  await shot('zz-failure').catch(() => {});
  results.push(false);
} finally {
  await browser.close();
  dev?.kill();
  console.log(`${results.filter(Boolean).length}/${results.length} passed`);
  process.exit(results.every(Boolean) ? 0 : 1);
}
