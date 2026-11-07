import { getItem, setItem } from './storage';

export type Quality = 'high' | 'medium' | 'low';
export type QualityMode = 'auto' | Quality;
export const QUALITY_MODE_KEY = 'coms-lab:quality';
/** Shared with the main site: 'lite' | 'full' | 'auto'. */
export const SITE_PERF_KEY = 'kwcoms-perf-mode:v1';
export const QUALITY_ORDER: Quality[] = ['low', 'medium', 'high'];

const SOFTWARE = /swiftshader|llvmpipe|softpipe|basic render|software|microsoft basic|mesa offscreen/i;
export const looksSoftware = (renderer: string) => SOFTWARE.test(renderer);

/** True when WebGL is missing, refuses a "major performance caveat" context, or reports a software renderer. */
export function detectSoftwareRendering(): boolean {
  try {
    const cv = document.createElement('canvas');
    const strict = cv.getContext('webgl2', { failIfMajorPerformanceCaveat: true }) ?? cv.getContext('webgl', { failIfMajorPerformanceCaveat: true });
    if (!strict) return true;
    const info = strict.getExtension('WEBGL_debug_renderer_info');
    const name = info ? String(strict.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
    strict.getExtension('WEBGL_lose_context')?.loseContext();
    return looksSoftware(name);
  } catch {
    return false;
  }
}

export function loadQualityMode(): QualityMode {
  const own = getItem(QUALITY_MODE_KEY);
  if (own === 'high' || own === 'medium' || own === 'low') return own;
  const site = getItem(SITE_PERF_KEY);
  return site === 'lite' ? 'low' : site === 'full' ? 'high' : 'auto';
}
export const saveQualityMode = (m: QualityMode) => setItem(QUALITY_MODE_KEY, m);

/** Initial effective level; `softwareHint` is the detection result (only used in auto). */
export function initialQuality(mode: QualityMode, softwareHint: boolean): Quality {
  return mode === 'auto' ? (softwareHint ? 'low' : 'high') : mode;
}

/**
 * Frame-time governor: feed it the duration of frames rendered back-to-back; it asks to step down after
 * two slow windows and to step up only after a long run of fast windows (with a cool-down), so it never flaps.
 */
export function createGovernor(opts: { window?: number; slowMs?: number; fastMs?: number; upWindows?: number; maxUps?: number } = {}) {
  const { window: win = 30, slowMs = 45, fastMs = 18, upWindows = 8, maxUps = 2 } = opts;
  let buf: number[] = [];
  let slow = 0, fast = 0, ups = 0;
  return {
    push(ms: number): 'down' | 'up' | null {
      buf.push(ms);
      if (buf.length < win) return null;
      const med = [...buf].sort((a, b) => a - b)[win >> 1]!;
      buf = [];
      if (med > slowMs) { slow++; fast = 0; if (slow >= 2) { slow = 0; return 'down'; } return null; }
      slow = 0;
      if (med < fastMs && ups < maxUps) { if (++fast >= upWindows) { fast = 0; ups++; return 'up'; } } else fast = 0;
      return null;
    },
    reset() { buf = []; slow = fast = 0; },
  };
}
