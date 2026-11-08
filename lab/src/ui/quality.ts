import { getItem, setItem } from './storage';

export type Quality = 'high' | 'medium' | 'low';
export type QualityMode = 'auto' | Quality;
export const QUALITY_MODE_KEY = 'coms-lab:quality';
/** Shared with the main site: 'lite' | 'full' | 'auto'. */
export const SITE_PERF_KEY = 'kwcoms-perf-mode:v1';
export const QUALITY_ORDER: Quality[] = ['low', 'medium', 'high'];

/**
 * Only true software rasterizers. ANGLE strings carry the real backend ("ANGLE Metal Renderer", "Direct3D11", "Vulkan"), so they
 * are judged by what they name, never by the word ANGLE.
 */
const SOFTWARE = /swiftshader|llvmpipe|softpipe|mesa offscreen|basic render (driver|adapter)|software (rasterizer|renderer)/i;
export const looksSoftware = (renderer: string) => SOFTWARE.test(renderer);

/** `strictOk`: a context was granted with failIfMajorPerformanceCaveat; `name`: unmasked renderer string ('' when hidden). */
export function softwareVerdict(strictOk: boolean, name: string): boolean {
  if (looksSoftware(name)) return true;
  // The browser flagged a performance caveat but the renderer names real hardware: trust the name, do not downgrade.
  return !strictOk && name === '';
}

const rendererName = (gl: WebGLRenderingContext | WebGL2RenderingContext) => {
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  return info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
};

/** True when WebGL is missing or the renderer is a software one. */
export function detectSoftwareRendering(): boolean {
  try {
    const cv = document.createElement('canvas');
    const strict = cv.getContext('webgl2', { failIfMajorPerformanceCaveat: true }) ?? cv.getContext('webgl', { failIfMajorPerformanceCaveat: true });
    if (strict) {
      const name = rendererName(strict);
      strict.getExtension('WEBGL_lose_context')?.loseContext();
      return softwareVerdict(true, name);
    }
    const cv2 = document.createElement('canvas');
    const loose = cv2.getContext('webgl2') ?? cv2.getContext('webgl');
    if (!loose) return true;
    const name = rendererName(loose);
    loose.getExtension('WEBGL_lose_context')?.loseContext();
    return softwareVerdict(false, name);
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
 * several consecutive slow windows (median frame time, so one-off spikes never count) and to step up only after a long run of fast windows (with a cool-down), so it never flaps.
 */
export function createGovernor(opts: { window?: number; slowMs?: number; fastMs?: number; upWindows?: number; maxUps?: number; downWindows?: number } = {}) {
  const { window: win = 30, slowMs = 45, fastMs = 18, upWindows = 8, maxUps = 2, downWindows = 3 } = opts;
  let buf: number[] = [];
  let slow = 0, fast = 0, ups = 0;
  return {
    push(ms: number): 'down' | 'up' | null {
      buf.push(ms);
      if (buf.length < win) return null;
      const med = [...buf].sort((a, b) => a - b)[win >> 1]!;
      buf = [];
      if (med > slowMs) { slow++; fast = 0; if (slow >= downWindows) { slow = 0; return 'down'; } return null; }
      slow = 0;
      if (med < fastMs && ups < maxUps) { if (++fast >= upWindows) { fast = 0; ups++; return 'up'; } } else fast = 0;
      return null;
    },
    reset() { buf = []; slow = fast = 0; },
  };
}

/** Governor is blind for this long after load, a scene/example change or a quality change (shader compiles, model loads, first shadow maps). */
export const WARMUP_MS = 6000;
