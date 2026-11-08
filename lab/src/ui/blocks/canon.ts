// Door to the headless-Blockly canonicalizer (blocklyRuntime.ts) without pulling Blockly into the main bundle.
// The store needs the answer synchronously, so the runtime registers itself here when its chunk loads:
// the editor's lazy chunk does it, and ensureCanon() does it for flows that have no editor open (import, share link, autosave restore).
type Canon = { ok: true; blocks: object } | { ok: false; error: string };
type Canonicalizer = (state: unknown) => Canon;

/** Iterative (the tree can be deep): isCanonical trusts object identity, so nothing may mutate a canonical tree afterwards. */
function deepFreeze(root: object): void {
  const todo: unknown[] = [root];
  while (todo.length) {
    const o = todo.pop();
    if (typeof o !== 'object' || o === null || Object.isFrozen(o)) continue;
    Object.freeze(o);
    todo.push(...Object.values(o));
  }
}

let impl: Canonicalizer | null = null;
const results = new WeakSet<object>();

export function registerCanonicalizer(fn: Canonicalizer): void { impl = fn; }
export async function ensureCanon(): Promise<void> { await import('./blocklyRuntime'); }

/**
 * ensureCanon for the startup restore and its retry button: a bounded wait (a stalled chunk must not hang the app) and one
 * automatic retry (a stale chunk after a deploy, a dropped connection). Never throws: false means Blockly is not available.
 */
export async function loadCanon(timeoutMs = 10_000): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([ensureCanon(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), timeoutMs); })]);
      return true;
    } catch { /* retry once */ } finally { clearTimeout(timer); }
  }
  return false;
}

/** Blockly's own reading of an untrusted workspace, or the Korean reason it cannot be accepted. Fails closed while the runtime is not loaded. */
export function canonicalize(state: unknown): Canon {
  if (!impl) return { ok: false, error: '블록 편집기를 아직 불러오지 못했어요. 잠시 뒤에 다시 해 보세요.' };
  const result = impl(state);
  if (result.ok) { deepFreeze(result.blocks); results.add(result.blocks); }
  return result;
}
/** True for an object that canonicalize() itself returned (nothing else is trusted to be Blockly's reading). */
export const isCanonical = (blocks: unknown): boolean => typeof blocks === 'object' && blocks !== null && results.has(blocks);
