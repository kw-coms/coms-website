import { useEffect } from 'react';
import { rotateDraft } from '../scene3d/Interaction';
import { setSimInput } from './simHost';
import { copySelection, deleteSelection, duplicateSelection, getState, paste, redo, rotateSelection, set, undo } from './store';

const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable || !!el.closest?.('.cm-editor'));
};

export function useShortcuts() {
  useEffect(() => {
    const spacePart = () => {
      const s = getState();
      const p = s.selection?.kind === 'part' ? s.hist.present.parts.find((q) => q.id === s.selection!.id) : undefined;
      return p && (p.kind === 'pushbutton' || p.kind === 'joystick') && s.simState !== 'idle' ? p : undefined;
    };
    const down = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (e.key === ' ' && !e.repeat) {
        const p = spacePart();
        if (p) (e.preventDefault(), setSimInput(p.id, 'pressed', true));
        return;
      }
      if (mod && k === 'z') (e.preventDefault(), e.shiftKey ? redo() : undo());
      else if (mod && k === 'y') (e.preventDefault(), redo());
      else if (mod && k === 'd') (e.preventDefault(), duplicateSelection());
      else if (mod && k === 'c') copySelection();
      else if (mod && k === 'v') paste();
      else if (mod) return;
      else if (k === 'r') rotateDraft() || rotateSelection();
      else if (e.key === 'Delete' || e.key === 'Backspace') (e.preventDefault(), deleteSelection());
      else if (e.key === 'Escape') set({ wireStart: null, draft: null, selection: null, multi: [], marquee: null, ctx: null, examplesOpen: false });
    };
    const up = (e: KeyboardEvent) => {
      if (e.key !== ' ' || isTyping(e.target)) return;
      const p = spacePart();
      if (p) setSimInput(p.id, 'pressed', false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);
}
