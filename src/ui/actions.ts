import { encodeShare, decodeShare, EXAMPLES, validateScene } from './core';
import { refs } from '../scene3d/sceneRefs';
import { loadSharedScene, shareHash } from './shareHash';
import { getState, loadScene, scene, set, THEME_KEY, toast } from './store';
import { stop } from './simHost';
import { setItem } from './storage';

function download(name: string, href: string) {
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function exportJson() {
  const url = URL.createObjectURL(new Blob([JSON.stringify(scene(), null, 2)], { type: 'application/json' }));
  download(`${scene().title ?? 'circuit-lab'}.json`, url);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function importJson(file: File) {
  try {
    if (file.size > 400_000) throw new Error('파일이 너무 커요.');
    const s = validateScene(JSON.parse(await file.text()));
    stop();
    loadScene(s);
    toast('불러왔어요.');
  } catch (e) {
    toast(e instanceof Error && e.message ? `불러오지 못했어요: ${e.message}` : '불러오지 못했어요. 올바른 회로 파일인지 확인해 주세요.');
  }
}

export async function copyShareLink() {
  try {
    const token = await encodeShare(scene());
    const url = `${location.origin}${location.pathname}${shareHash(token)}`;
    history.replaceState(null, '', shareHash(token));
    try {
      await navigator.clipboard.writeText(url);
      toast('공유 링크를 복사했어요.');
    } catch {
      toast('주소창의 링크를 복사해서 공유하세요.');
    }
  } catch (e) {
    toast(e instanceof Error ? e.message : '공유 링크를 만들지 못했어요.');
  }
}

export async function loadFromLocationHash() {
  try {
    const s = await loadSharedScene(location.hash, decodeShare);
    if (s) loadScene(s);
  } catch (e) {
    toast(e instanceof Error ? e.message : '공유 장면을 읽을 수 없어요.');
  }
}

export function snapshotPng() {
  const { gl, scene: sc, camera } = refs;
  if (!gl || !sc || !camera) return;
  gl.render(sc, camera);
  gl.domElement.toBlob((b) => {
    if (!b) return toast('이미지를 만들지 못했어요.');
    const url = URL.createObjectURL(b);
    download('circuit-lab.png', url);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }, 'image/png');
}

export function loadExample(id: string) {
  const ex = EXAMPLES.find((e) => e.id === id);
  if (!ex) return;
  if (getState().hist.past.length > 0 && !confirm('현재 작업은 사라져요. 예제를 불러올까요?')) return;
  stop();
  loadScene(ex.scene);
  history.replaceState(null, '', location.pathname + location.search);
  set({ examplesOpen: false });
}

export function toggleTheme() {
  const theme = getState().theme === 'dark' ? 'light' : 'dark';
  setItem(THEME_KEY, theme);
  set({ theme });
}
