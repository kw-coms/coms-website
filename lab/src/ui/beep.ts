// Multimeter continuity beep (SPEC-v2 §1): a ~2 kHz tone while a meter in continuity mode sees a closed path.
// The AudioContext is created lazily and only after a user gesture, so there are no autoplay warnings in the console;
// every Web Audio failure is swallowed (a missing beep must never break the simulator).
import type { SimFrame } from '../core/types';

export const BEEP_HZ = 2000;
const BEEP_GAIN = 0.04;

/** True when any multimeter in continuity mode reports a closed path in this frame. */
export const continuityHolds = (frame: Pick<SimFrame, 'parts'>): boolean =>
  Object.values(frame.parts).some((p) => p.meter?.measurementMode === 'continuity' && p.meter.continuity === true);

let gestureSeen = false;
if (typeof window !== 'undefined') {
  const mark = () => { gestureSeen = true; };
  for (const type of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(type, mark, { capture: true, once: true, passive: true });
}
const defaultGesture = () => gestureSeen || (typeof navigator !== 'undefined' && navigator.userActivation?.hasBeenActive === true);
const defaultCtor = (): (new () => AudioContext) | undefined =>
  typeof AudioContext === 'undefined' ? undefined : AudioContext;

export interface Beeper {
  /** Start (true) or stop (false) the tone. Idempotent. */
  set(on: boolean): void;
}

export function createBeeper(ctor: () => (new () => AudioContext) | undefined = defaultCtor, activated: () => boolean = defaultGesture): Beeper {
  let ctx: AudioContext | undefined;
  let tone: { osc: OscillatorNode; gain: GainNode } | undefined;
  const stop = () => {
    if (!tone) return;
    try { tone.osc.stop(); tone.osc.disconnect(); tone.gain.disconnect(); } catch { /* already stopped */ }
    tone = undefined;
  };
  return {
    set(on) {
      if (!on) return stop();
      if (tone || !activated()) return;
      try {
        const Ctor = ctor();
        if (!Ctor) return;
        ctx ??= new Ctor();
        void ctx.resume?.();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = BEEP_HZ;
        gain.gain.value = BEEP_GAIN;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        tone = { osc, gain };
      } catch {
        tone = undefined;
      }
    },
  };
}
