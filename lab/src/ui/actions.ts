import { encodeShare, decodeShare, EXAMPLES, PARTS, validateScene } from './core';
import { refs } from '../scene3d/sceneRefs';
import { MISSIONS } from '../missions';
import { parseMissionHash, parseShareHash, shareHash } from './shareHash';
import { BACKUP_KEY, getState, isDirty, loadScene, markClean, scene, set, THEME_KEY, toast } from './store';
import { stop } from './simHost';
import { getItem, setItem } from './storage';
import type { Scene } from '../core/types';

function download(name: string, href: string) {
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
function downloadText(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  download(name, url);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** One gate for every action that replaces the whole document (example, import, share link). */
export const confirmReplace = (what: string) =>
  !isDirty() || confirm(`저장하지 않은 작업이 사라져요. ${what}`);

/** Stop the simulator and replace the document. */
function replaceWith(s: Scene) {
  stop();
  loadScene(s);
}

export function exportJson() {
  downloadText(`${scene().title ?? 'circuit-lab'}.json`, JSON.stringify(scene(), null, 2));
  markClean();
}

/** Download the raw copy of an autosave that failed validation at startup. */
export function downloadBackup() {
  const raw = getItem(BACKUP_KEY);
  if (raw) downloadText('circuit-lab-backup.json', raw);
  else toast('백업 데이터를 찾지 못했어요.');
}
export const dismissRestoreNotice = () => set({ restoreNotice: false });

const errMsg = (e: unknown) => (e instanceof Error && e.message && !/^[\x00-\x7f]*$/.test(e.message) ? e.message : '');

export async function importJson(file: File) {
  try {
    if (file.size > 400_000) throw new Error('파일이 너무 커요.');
    let json: unknown;
    try {
      json = JSON.parse(await file.text());
    } catch {
      throw new Error('JSON 형식이 아니에요.');
    }
    const s = validateScene(json);
    if (!confirmReplace('불러올까요?')) return;
    replaceWith(s);
    toast('불러왔어요.');
  } catch (e) {
    const m = errMsg(e);
    toast(m ? `불러오지 못했어요: ${m}` : '불러오지 못했어요. 올바른 회로 파일인지 확인해 주세요.');
  }
}

/** The share link goes to the clipboard only; it is never left in the working URL. */
export async function copyShareLink() {
  try {
    const token = await encodeShare(scene());
    const url = `${location.origin}${location.pathname}${shareHash(token)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast('공유 링크를 복사했어요.');
    } catch {
      prompt('이 링크를 복사해서 공유하세요.', url);
    }
  } catch (e) {
    toast(errMsg(e) || '공유 링크를 만들지 못했어요.');
  }
}

/** `#mission=<id>` (links from the study site): open that mission like the Missions tab does; an unknown id only gets a notice. */
function openMissionFromHash(id: string) {
  history.replaceState(null, '', location.pathname + location.search);
  const m = MISSIONS.find((x) => x.id === id);
  if (!m) return toast('그 미션을 찾을 수 없어요.');
  if (!confirmReplace('미션 회로를 불러올까요?')) return;
  replaceWith(structuredClone(m.starterScene)); // loadScene sets missionId and opens the Missions tab
}

/** Consume a #s=… share hash: remove it from the URL first (so a reload never restores a stale snapshot), then import. */
export async function loadFromLocationHash() {
  const missionId = parseMissionHash(location.hash);
  if (missionId) return openMissionFromHash(missionId);
  const token = parseShareHash(location.hash);
  if (!token) return;
  history.replaceState(null, '', location.pathname + location.search);
  try {
    const s = await decodeShare(token);
    if (!confirmReplace('공유 링크의 회로를 불러올까요?')) return;
    replaceWith(s);
    toast('공유 링크의 회로를 불러왔어요.');
  } catch (e) {
    toast(errMsg(e) || '공유 링크를 읽을 수 없어요.');
  }
}

export function snapshotPng() {
  const { gl, scene: sc, camera } = refs;
  if (!gl || !sc || !camera) return;
  // editing helpers (selection box, snap rings, bend handles, wire preview) stay out of the picture
  const hidden: { visible: boolean }[] = [];
  sc.traverse((o) => {
    if (o.visible && (o.type === 'Box3Helper' || o.renderOrder >= 6)) { hidden.push(o); o.visible = false; }
  });
  gl.render(sc, camera);
  gl.domElement.toBlob((b) => {
    if (!b) return toast('이미지를 만들지 못했어요.');
    const url = URL.createObjectURL(b);
    download('circuit-lab.png', url);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }, 'image/png');
  for (const o of hidden) o.visible = true;
  refs.invalidate();
}

export function loadExample(id: string) {
  const ex = EXAMPLES.find((e) => e.id === id);
  if (!ex) return;
  if (!confirmReplace('예제를 불러올까요?')) return;
  replaceWith(validateScene(ex.scene));
  history.replaceState(null, '', location.pathname + location.search);
  set({ examplesOpen: false });
}

export function toggleTheme() {
  const theme = getState().theme === 'dark' ? 'light' : 'dark';
  setItem(THEME_KEY, theme);
  set({ theme });
}

// ---------- exports ----------
const csv = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
/** The sketch as an Arduino IDE file. */
export function exportIno() {
  const name = (scene().title ?? 'circuit-lab').replace(/[^\w가-힣-]+/g, '_') || 'sketch';
  const url = URL.createObjectURL(new Blob([getState().code], { type: 'text/plain;charset=utf-8' }));
  download(`${name}.ino`, url);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
/** Bill of materials as CSV (UTF-8 with BOM so Excel reads the Korean). */
export function exportBom() {
  const rows = new Map<string, { name: string; kind: string; value: string; ids: string[] }>();
  for (const p of getState().hist.present.parts) {
    const d = PARTS[p.kind];
    if (!d) continue;
    const value = d.props.map((q) => `${q.label}=${p.props[q.key] ?? q.default}${q.unit ?? ''}`).join(' ');
    const key = `${p.kind}|${value}`;
    const r = rows.get(key) ?? { name: d.title, kind: p.kind, value, ids: [] };
    r.ids.push(p.id);
    rows.set(key, r);
  }
  const lines = [['부품', '종류', '값', '수량', '부품 ID'].map(csv).join(','), ...[...rows.values()].map((r) => [r.name, r.kind, r.value, r.ids.length, r.ids.join(' ')].map(csv).join(','))];
  const url = URL.createObjectURL(new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  download('circuit-lab-bom.csv', url);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
