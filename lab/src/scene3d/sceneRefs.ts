import type { Camera, Scene, WebGLRenderer } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';

// Handles to live three.js objects so DOM-side code (toolbar, drag&drop) can reach them.
export const refs: {
  gl: WebGLRenderer | null;
  scene: Scene | null;
  camera: Camera | null;
  controls: OrbitControlsImpl | null;
  invalidate: () => void;
} = { gl: null, scene: null, camera: null, controls: null, invalidate: () => {} };

export const DESK_Y = -9;

/** Wire preview target while the user is drawing a wire (mutated by Interaction, read by PreviewWire). */
export const preview: { point: [number, number, number] | null; v: number } = { point: null, v: 0 };
