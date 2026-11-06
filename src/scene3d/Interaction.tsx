import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { Vector3, type Object3D } from 'three';
import type { PartInstance, PinRef, Vec3 } from '../core/types';
import { PARTS, pinWorldPos } from '../ui/core';
import { setSimInput } from '../ui/simHost';
import {
  addWire, clearSelection, deleteBend, getPart, getState, liveEnd, liveStart, liveWire, selectedPartIds, selectPart, selectParts, set,
} from '../ui/store';
import { focusParts } from './cameraFrame';
import { commitMove, commitMoveGroup, groundPoint, isBoard, pickPin, placeAt, rayFromClient } from './placement';
import { preview, refs } from './sceneRefs';

interface Hit {
  partId?: string;
  wireId?: string;
  obstacleOf?: string;
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
      const point: Vec3 = [h.point.x, h.point.y, h.point.z];
      if (u.bend) return { bend: u.bend, distance: h.distance, point };
      if (u.wireId) return { wireId: u.wireId, distance: h.distance, point };
      if (u.obstacle) return { obstacleOf: u.obstacle, distance: h.distance, point };
      if (u.partId) return { partId: u.partId, distance: h.distance, point };
      o = o.parent;
    }
  }
  return null;
}

type Down =
  | { type: 'empty' | 'pin' | 'wire'; x: number; y: number; pin?: PinRef; wireId?: string }
  | { type: 'part'; x: number; y: number; part: PartInstance; grab: [number, number]; moved: boolean; group: PartInstance[] }
  | { type: 'input'; x: number; y: number; part: PartInstance; start: number }
  | { type: 'obstacle'; x: number; y: number; part: PartInstance; planeY: number }
  | { type: 'marquee'; x: number; y: number; additive: boolean }
  | { type: 'bend'; x: number; y: number; wireId: string; index: number; ghost: boolean; startDoc: ReturnType<typeof liveStart>; planeY: number; moved: boolean };

let lastDesired: [number, number] = [0, 0];
export function rotateDraft(): boolean {
  const d = getState().draft;
  if (!d || d.extra?.length) return false;
  const { part, snap } = placeAt({ ...d.part, rotY: (((d.part.rotY + 90) % 360) as PartInstance['rotY']) }, lastDesired);
  set({ draft: { ...d, part, snap } });
  return true;
}

/** Distance in cm of the HC-SR04 obstacle block along the sensor's forward axis (inverse of HcSr04's mesh offset). */
export const OBSTACLE_BASE = 16;
export const OBSTACLE_MM_PER_CM = 0.8;
export function obstacleCm(part: PartInstance, g: Vec3): number {
  const t = (part.rotY * Math.PI) / 180;
  const along = (g[0] - part.pos[0]) * Math.sin(t) + (g[2] - part.pos[2]) * Math.cos(t);
  return Math.max(2, Math.min(400, Math.round(((along - OBSTACLE_BASE) / OBSTACLE_MM_PER_CM) * 10) / 10));
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
    let rightDown: { x: number; y: number } | null = null;
    const setControls = (on: boolean) => controls && (controls.enabled = on);
    const running = () => getState().simState !== 'idle';
    const local = (cx: number, cy: number) => {
      const r = el.getBoundingClientRect();
      return { x: cx - r.left, y: cy - r.top };
    };

    const onDown = (e: PointerEvent) => {
      if (e.button === 2) {
        rightDown = { x: e.clientX, y: e.clientY };
        return;
      }
      if (e.button !== 0) return;
      if (getState().ctx) set({ ctx: null });
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
      if (obj?.obstacleOf) {
        const part = getPart(obj.obstacleOf);
        if (part) {
          selectPart(part.id, false, false);
          down = { type: 'obstacle', ...base, part, planeY: obj.point[1] };
          setControls(false);
          el.setPointerCapture(e.pointerId);
          return;
        }
      }
      // a free part's body in front of the pin wins; otherwise the pin does
      const pinDist = pin && refs.camera ? refs.camera.position.distanceTo(new Vector3(...pin.pos)) : Infinity;
      const objKind = obj?.partId ? getPart(obj.partId)?.kind : undefined;
      const bodyInFront = !!objKind && !isBoard(objKind) && obj!.distance < pinDist - 3;
      if (pin && !bodyInFront && !e.shiftKey) {
        down = { type: 'pin', ...base, pin: pin.ref };
        return;
      }
      if (obj?.partId) {
        const part = getPart(obj.partId);
        if (!part) return;
        if (e.shiftKey) {
          selectPart(part.id, true);
          down = { type: 'empty', ...base };
          return;
        }
        const inGroup = st.multi.includes(part.id);
        const interactive = running() && !!PARTS[part.kind].inputs?.length;
        if (!inGroup) selectPart(part.id, false, !interactive);
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
        const group = inGroup ? selectedPartIds(getState()).map((id) => getPart(id)).filter((p): p is PartInstance => !!p) : [part];
        down = { type: 'part', ...base, part, grab: [g[0] - part.pos[0], g[2] - part.pos[2]], moved: false, group };
        setControls(false);
        el.setPointerCapture(e.pointerId);
        return;
      }
      if (obj?.wireId) {
        set({ selection: { kind: 'wire', id: obj.wireId }, multi: [], sideTab: 'props', sideOpen: true });
        down = { type: 'wire', ...base, wireId: obj.wireId };
        return;
      }
      // empty space: marquee in the top view (or with Shift), orbit otherwise
      if (!st.wireStart && e.pointerType !== 'touch' && (st.view === 'top' || e.shiftKey)) {
        down = { type: 'marquee', ...base, additive: e.shiftKey };
        setControls(false);
        el.setPointerCapture(e.pointerId);
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
        const grp = down.group;
        if (grp.length <= 1) {
          const { part, snap } = placeAt(down.part, lastDesired);
          set({ draft: { part, hideId: down.part.id, snap } });
        } else {
          const hasBoard = grp.some((p) => isBoard(p.kind));
          const placed = hasBoard
            ? { part: { ...down.part, pos: [Math.round(lastDesired[0] * 2) / 2, down.part.pos[1], Math.round(lastDesired[1] * 2) / 2] as Vec3 }, snap: { ok: [], bad: [] } }
            : placeAt(down.part, lastDesired);
          const anchor = down.part;
          const d: Vec3 = [placed.part.pos[0] - anchor.pos[0], placed.part.pos[1] - anchor.pos[1], placed.part.pos[2] - anchor.pos[2]];
          const moved2 = grp.map((p) => ({ ...p, pos: [p.pos[0] + d[0], p.pos[1] + d[1], p.pos[2] + d[2]] as Vec3 }));
          const prim = moved2.find((p) => p.id === anchor.id)!;
          set({ draft: { part: prim, hideId: prim.id, hideIds: grp.map((p) => p.id), extra: moved2.filter((p) => p.id !== prim.id), snap: placed.snap } });
        }
        el.style.cursor = 'grabbing';
      } else if (down.type === 'obstacle') {
        const g = groundPoint(e.clientX, e.clientY, down.planeY);
        if (g) setSimInput(down.part.id, 'distanceCm', obstacleCm(getPart(down.part.id) ?? down.part, g));
      } else if (down.type === 'marquee') {
        const a = local(down.x, down.y), b = local(e.clientX, e.clientY);
        if (moved) set({ marquee: { x0: a.x, y0: a.y, x1: b.x, y1: b.y } });
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
        else bends[d.index] = g;
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
        if (d.moved && dr) (d.group.length > 1 ? commitMoveGroup([dr.part, ...(dr.extra ?? [])]) : commitMove(dr.part));
        else if (click && d.group.length > 1) selectPart(d.part.id);
      } else if (d.type === 'input') {
        if (d.part.kind === 'pushbutton') setSimInput(d.part.id, 'pressed', false);
        if (d.part.kind === 'joystick') (setSimInput(d.part.id, 'x', 0.5), setSimInput(d.part.id, 'y', 0.5));
      } else if (d.type === 'bend') {
        if (d.moved) liveEnd(d.startDoc);
      } else if (d.type === 'marquee') {
        const m = st.marquee;
        set({ marquee: null });
        if (m && !click) {
          const inside = boxSelect(m, el);
          const ids = d.additive ? [...new Set([...selectedPartIds(st), ...inside])] : inside;
          selectParts(ids);
        } else if (!d.additive) {
          clearSelection();
          set({ wireStart: null });
          preview.point = null;
        }
      } else if (click && d.type === 'pin' && d.pin) {
        if (!st.wireStart) set({ wireStart: d.pin, selection: null, multi: [] });
        else {
          if (st.wireStart.partId !== d.pin.partId || st.wireStart.pinId !== d.pin.pinId) addWire(st.wireStart, d.pin);
          set({ wireStart: null });
          preview.point = null;
        }
      } else if (click && d.type === 'empty') {
        set({ selection: null, multi: [], wireStart: null });
        preview.point = null;
      }
      invalidate();
    };

    const onDbl = (e: MouseEvent) => {
      const obj = pickObject(e.clientX, e.clientY);
      if (obj?.bend && !obj.bend.ghost) return deleteBend(obj.bend.wireId, obj.bend.index);
      if (obj?.partId) focusParts([obj.partId]);
    };

    const onContext = (e: MouseEvent) => {
      e.preventDefault();
      const rd = rightDown;
      rightDown = null;
      if (rd && Math.hypot(e.clientX - rd.x, e.clientY - rd.y) > 5) return; // was a pan drag
      const obj = pickObject(e.clientX, e.clientY);
      const x = e.clientX, y = e.clientY;
      if (obj?.bend && !obj.bend.ghost) return set({ ctx: { x, y, target: { kind: 'bend', id: obj.bend.wireId, index: obj.bend.index } } });
      const pid = obj?.partId ?? obj?.obstacleOf;
      if (pid) {
        if (!getState().multi.includes(pid)) selectPart(pid, false, false);
        return set({ ctx: { x, y, target: { kind: 'part', id: pid } } });
      }
      if (obj?.wireId) {
        set({ selection: { kind: 'wire', id: obj.wireId }, multi: [] });
        return set({ ctx: { x, y, target: { kind: 'wire', id: obj.wireId } } });
      }
      set({ ctx: null });
    };

    const onLeave = () => {
      if (!down && getState().hover) set({ hover: null });
    };

    el.addEventListener('pointerdown', onDown, true);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('pointerleave', onLeave);
    el.addEventListener('dblclick', onDbl);
    el.addEventListener('contextmenu', onContext);
    return () => {
      el.removeEventListener('pointerdown', onDown, true);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('pointerleave', onLeave);
      el.removeEventListener('dblclick', onDbl);
      el.removeEventListener('contextmenu', onContext);
    };
  }, [gl, controls, invalidate]);
  return null;
}

/** Part ids whose centre falls inside the marquee rectangle (canvas-local px). */
function boxSelect(m: { x0: number; y0: number; x1: number; y1: number }, el: HTMLElement): string[] {
  const cam = refs.camera;
  if (!cam) return [];
  const r = el.getBoundingClientRect();
  const x0 = Math.min(m.x0, m.x1), x1 = Math.max(m.x0, m.x1), y0 = Math.min(m.y0, m.y1), y1 = Math.max(m.y0, m.y1);
  const v = new Vector3();
  const out: string[] = [];
  for (const p of getState().hist.present.parts) {
    const h = PARTS[p.kind]?.size[1] ?? 6;
    v.set(p.pos[0], p.pos[1] + h / 2, p.pos[2]).project(cam);
    const sx = ((v.x + 1) / 2) * r.width, sy = ((1 - v.y) / 2) * r.height;
    if (sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1) out.push(p.id);
  }
  return out;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
function worldOf(ref: PinRef): Vec3 | null {
  const p = getPart(ref.partId);
  return p && PARTS[p.kind].pins.some((d) => d.id === ref.pinId) ? pinWorldPos(p, ref.pinId) : null;
}
