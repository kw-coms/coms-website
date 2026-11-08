// Dev-only stage for tools/part-thumbs.mjs: renders one catalog part alone, fitted, on a transparent
// background. Reached through `?partthumbs` on the dev server; never bundled in production builds.
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas, useThree } from '@react-three/fiber';
import { OrthographicCamera, PMREMGenerator, Vector3, type Scene } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { PARTS } from '../ui/core';
import type { PartInstance, PartKind } from '../core/types';
import { partsBox } from './cameraFrame';
import { PartView } from './PartView';
import { refs } from './sceneRefs';
import { set } from '../ui/store';

export const THUMB_W = 360, THUMB_H = 270;
const ELEV = (32 * Math.PI) / 180, YAW = (32 * Math.PI) / 180;
const DIR = new Vector3(Math.sin(YAW) * Math.cos(ELEV), Math.sin(ELEV), Math.cos(YAW) * Math.cos(ELEV));
const PAD = 1.1;
const frames = (n: number) => new Promise<void>((r) => { const f = (k: number) => (k ? requestAnimationFrame(() => f(k - 1)) : r()); f(n); });

declare global { interface Window { __thumbs?: { kinds: string[]; render(kind: string): Promise<string>; ready: boolean } } }

function Rig({ setKind }: { setKind: (k: PartKind | null) => void }) {
  const gl = useThree((s) => s.gl), scene = useThree((s) => s.scene), camera = useThree((s) => s.camera) as OrthographicCamera;
  useEffect(() => {
    const pm = new PMREMGenerator(gl), env = new RoomEnvironment(), rt = pm.fromScene(env, 0.04);
    scene.environment = rt.texture;
    scene.environmentIntensity = 0.5;
    refs.scene = scene as Scene;
    set({ quality: 'high' }); // no baked ground blob under parts
    window.__thumbs = {
      kinds: Object.keys(PARTS),
      ready: true,
      async render(kind) {
        setKind(kind as PartKind);
        await frames(4);
        await new Promise((r) => setTimeout(r, 120));
        // the HC-SR04's draggable obstacle is a scene prop, not part of the module
        scene.traverse((o) => { if (o.userData.obstacle !== undefined && o.type === 'Group') o.visible = false; });
        const box = partsBox(['thumb']);
        if (!box) throw new Error(`no geometry for ${kind}`);
        const c = box.getCenter(new Vector3());
        camera.position.copy(c).addScaledVector(DIR, 1500);
        camera.zoom = 1;
        camera.lookAt(c);
        camera.updateMatrixWorld(true);
        const inv = camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
          const v = new Vector3(x, y, z).applyMatrix4(inv);
          x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
        }
        const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
        const halfW = Math.max((x1 - x0) / 2, ((y1 - y0) / 2) * (THUMB_W / THUMB_H)) * PAD, halfH = (halfW * THUMB_H) / THUMB_W;
        Object.assign(camera, { left: cx - halfW, right: cx + halfW, top: cy + halfH, bottom: cy - halfH, near: 1, far: 5000 });
        camera.updateProjectionMatrix();
        gl.render(scene, camera);
        const out = document.createElement('canvas');
        out.width = THUMB_W; out.height = THUMB_H;
        out.getContext('2d')!.drawImage(gl.domElement, 0, 0);
        return out.toDataURL('image/png');
      },
    };
    return () => { scene.environment = null; env.dispose(); rt.dispose(); pm.dispose(); };
  }, [gl, scene, camera, setKind]);
  return null;
}

function Stage() {
  const [kind, setKind] = useState<PartKind | null>(null);
  const part: PartInstance | null = kind ? { id: 'thumb', kind, pos: [0, 0, 0], rotY: 0, props: Object.fromEntries((PARTS[kind]?.props ?? []).map((p) => [p.key, p.default])) } : null;
  return (
    <div style={{ width: THUMB_W, height: THUMB_H }}>
      <Canvas orthographic frameloop="demand" dpr={1} gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true }} camera={{ near: 1, far: 5000 }}>
        <hemisphereLight args={['#ffffff', '#8c97a8', 0.95]} />
        <directionalLight position={[190, 420, 230]} intensity={2.2} />
        <directionalLight position={[-220, 260, -140]} intensity={0.55} />
        <Rig setKind={setKind} />
        {part && <PartView key={part.kind} part={part} />}
      </Canvas>
    </div>
  );
}

export function mountThumbStage(el: HTMLElement) {
  document.body.style.margin = '0';
  createRoot(el).render(<Stage />);
}
