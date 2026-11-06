import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { Vector3, type Object3D } from 'three';
import type { PartInstance, PinRef, Vec3 } from '../core/types';
import { PARTS, pinWorldPos } from '../ui/core';
import { setSimInput } from '../ui/simHost';
import { addWire, getPart, getState, liveEnd, liveStart, liveWire, set } from '../ui/store';
import { commitMove, groundPoint, isBoard, pickPin, placeAt, rayFromClient } from './placement';
import { preview, refs } from './sceneRefs';

interface Hit {
  partId?: string;
  wireId?: string;
  bend?: { wireId: string; index: number; ghost: boolean };
  distance: number;
  point: Vec3;
}

function pickObject(cx: number, cy: number): Hit | null {
  const r = rayFromClient(cx, cy);
  if (!r || !refs.scene) return null;
  const hits = r.intersectObjects(refs.scene.children, true);
  for (const h of hits) {
    let o: Object3D | null = h.object;
    if (!h.object.visible) continue;
    while (o) {
      const u = o.userData;
      if (u.bend) return { bend: u.bend, distance: h.distance, point: [h.point.x, h.point.y, h.point.z] };
      if (u.wireId) return { wireId: u.wireId, distance: h.distance, point: [h.point.x, h.point.y, h.point.z] };
      if (u.partId) return { partId: u.partId, distance: h.distance, point: [h.point.x, h.point.y, h.point.z] };
      o = o.parent;
    }
  }
  return null;
}

type Down =
  | { type: 'empty' | 'pin' | 'wire'; x: number; y: number; pin?: PinRef; wireId?: string }
  | { type: 'part'; x: number; y: number; part: PartInstance; grab: [number, number]; moved: boolean }
  | { type: 'input'; x: number; y: number; part: PartInstance; start: number }
  | { type: 'bend'; x: number; y: number; wireId: string; index: number; ghost: boolean; startDoc: ReturnType<typeof liveStart>; planeY: number; moved: boolean };

let lastDesired: [number, number] = [0, 0];
export function rotateDraft(): boolean {
  const d = getState().draft;
  if (!d) return false;
  const { part, snap } = placeAt({ ...d.part, rotY: (((d.part.rotY + 90) % 360) as PartInstance['rotY']) }, lastDesired);
  set({ draft: { ...d, part, snap } });
  return true;
}

export function Interaction() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const controls = useThree((s) => s.controls) as { enabled: boolean } | null;

  useEffect(() => {
    Object.assign(refs, { gl, scene, camera, invalidate });
  }, [gl, scene, camera, invalidate]);

  useEffect(() => {
    const el = gl.domElement;
    let down: Down | null = null;
    const setControls = (on: boolean) => controls && (controls.enabled = on);
    const running = () => getState().simState !== 'idle';

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const st = getState();
      const pin = pickPin(e.clientX, e.clientY);
      const obj = pickObject(e.clientX, e.clientY);
      const base = { x: e.clientX, y: e.clientY };
      if (obj?.bend) {
        const w = st.hist.present.wires.find((q) => q.id === obj.bend!.wireId);
        if (!w) return;
        const planeY = obj.point[1];
        down = { type: 'bend', ...base, wireId: w.id, index: obj.bend.index, ghost: obj.bend.ghost, startDoc: liveStart(), planeY, moved: false };
        setControls(false);
        el.setPointerCapture(e.pointerId);
        return;
      }
      // a free part's body in front of the pin wins; otherwise the pin does
      const pinDist = pin && refs.camera ? refs.camera.position.distanceTo(new Vector3(...pin.pos)) : Infinity;
      const objKind = obj?.partId ? getPart(obj.partId)?.kind : undefined;
      const bodyInFront = !!objKind && !isBoard(objKind) && obj!.distance < pinDist - 3;
      if (pin && !bodyInFront) {
        down = { type: 'pin', ...base, pin: pin.ref };
        return;
      }
      if (obj?.partId) {
        const part = getPart(obj.partId);
        if (!part) return;
        set({ selection: { kind: 'part', id: part.id }, sideTab: 'props', mobileTab: st.mobileTab === 'view' ? 'view' : st.mobileTab });
        // simulation inputs take over the drag while running
        if (running()) {
          if (part.kind === 'pushbutton') {
            setSimInput(part.id, 'pressed', true);
            down = { type: 'input', ...base, part, start: 0 };
            setControls(false);
            el.setPointerCapture(e.pointerId);
            return;
          }
          if (part.kind === 'potentiometer' || part.kind === 'joystick') {
            down = { type: 'input', ...base, part, start: Number(st.inputs[part.id]?.position ?? 0.5) };
            setControls(false);
            el.setPointerCapture(e.pointerId);
            return;
          }
          if (part.kind === 'slide-switch') {
            setSimInput(part.id, 'position', Number(st.inputs[part.id]?.position ?? 0) >= 0.5 ? 0 : 1);
            down = { type: 'empty', ...base };
            return;
          }
        }
        const g = groundPoint(e.clientX, e.clientY, 0);
        if (!g) return;
        down = { type: 'part', ...base, part, grab: [g[0] - part.pos[0], g[2] - part.pos[2]], moved: false };
        setControls(false);
        el.setPointerCapture(e.pointerId);
        return;
      }
      if (obj?.wireId) {
        set({ selection: { kind: 'wire', id: obj.wireId }, sideTab: 'props' });
        down = { type: 'wire', ...base, wireId: obj.wireId };
        return;
      }
      down = { type: 'empty', ...base };
    };

    const onMove = (e: PointerEvent) => {
      const st = getState();
      if (!down) {
        // hover
        const pin = e.buttons ? null : pickPin(e.clientX, e.clientY);
        const key = pin ? `${pin.ref.partId}:${pin.ref.pinId}` : '';
        const cur = st.hover ? `${st.hover.ref.partId}:${st.hover.ref.pinId}` : '';
        if (key !== cur) set({ hover: pin ? { ref: pin.ref, netId: st.analysis.pinToNet[key] } : null });
        el.style.cursor = pin || st.wireStart ? 'crosshair' : 'default';
        if (st.wireStart) {
          const start = worldOf(st.wireStart);
          const g = pin ? pin.pos : groundPoint(e.clientX, e.clientY, start?.[1] ?? 0);
          if (g) {
            preview.point = [g[0], g[1], g[2]];
            preview.v++;
            invalidate();
          }
        }
        return;
      }
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4;
      if (down.type === 'part') {
        if (!moved && !down.moved) return;
        down.moved = true;
        const g = groundPoint(e.clientX, e.clientY, 0);
        if (!g) return;
        lastDesired = [g[0] - down.grab[0], g[2] - down.grab[1]];
        const { part, snap } = placeAt(down.part, lastDesired);
        set({ draft: { part, hideId: down.part.id, snap } });
        el.style.cursor = 'grabbing';
      } else if (down.type === 'input') {
        const p = down.part;
        if (p.kind === 'potentiometer') setSimInput(p.id, 'position', clamp01(down.start + (e.clientX - down.x - (e.clientY - down.y)) / 220));
        else if (p.kind === 'joystick') {
          setSimInput(p.id, 'x', clamp01(0.5 + (e.clientX - down.x) / 80));
          setSimInput(p.id, 'y', clamp01(0.5 + (e.clientY - down.y) / 80));
        }
      } else if (down.type === 'bend') {
        const g = groundPoint(e.clientX, e.clientY, down.planeY);
        const w = getState().hist.present.wires.find((q) => q.id === (down as { wireId: string }).wireId);
        if (!g || !w || !moved) return;
        const d = down;
        const bends = [...(w.bends ?? [])];
        if (d.ghost && !d.moved) bends.splice(d.index, 0, g);
        else bends[d.ghost ? d.index : d.index] = g;
        d.moved = true;
        d.ghost = false;
        liveWire(w.id, { bends });
      }
    };

    const onUp = (e: PointerEvent) => {
      const d = down;
      down = null;
      if (el.hasPointerCapture?.(e.pointerId)) el.releasePointerCapture(e.pointerId);
      setControls(true);
      el.style.cursor = 'default';
      if (!d) return;
      const click = Math.hypot(e.clientX - d.x, e.clientY - d.y) <= 4;
      const st = getState();
      if (d.type === 'part') {
        const dr = st.draft;
        set({ draft: null });
        if (d.moved && dr) commitMove(dr.part);
      } else if (d.type === 'input') {
        if (d.part.kind === 'pushbutton') setSimInput(d.part.id, 'pressed', false);
        if (d.part.kind === 'joystick') (setSimInput(d.part.id, 'x', 0.5), setSimInput(d.part.id, 'y', 0.5));
      } else if (d.type === 'bend') {
        if (d.moved) liveEnd(d.startDoc);
      } else if (click && d.type === 'pin' && d.pin) {
        if (!st.wireStart) set({ wireStart: d.pin, selection: null });
        else {
          if (st.wireStart.partId !== d.pin.partId || st.wireStart.pinId !== d.pin.pinId) addWire(st.wireStart, d.pin);
          set({ wireStart: null });
          preview.point = null;
        }
      } else if (click && d.type === 'empty') {
        set({ selection: null, wireStart: null });
        preview.point = null;
      }
      invalidate();
    };

    const onLeave = () => {
      if (!down && getState().hover) set({ hover: null });
    };

    el.addEventListener('pointerdown', onDown, true);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('pointerleave', onLeave);
    return () => {
      el.removeEventListener('pointerdown', onDown, true);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('pointerleave', onLeave);
    };
  }, [gl, controls, invalidate]);
  return null;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
function worldOf(ref: PinRef): Vec3 | null {
  const p = getPart(ref.partId);
  return p && PARTS[p.kind].pins.some((d) => d.id === ref.pinId) ? pinWorldPos(p, ref.pinId) : null;
}
