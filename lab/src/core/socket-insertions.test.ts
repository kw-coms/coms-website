import { afterEach, expect, it, vi } from 'vitest';
import { analyze } from './analyze';
import * as geometry from './geometry';
import { PARTS } from './parts';
import { socketInsertions } from './socket-insertions';
import type { Scene } from './types';

const inserted = (): Scene => {
  const hole = PARTS['breadboard-half'].pins.find(pin => pin.id === 'b12')!.pos;
  const lead = PARTS.resistor.pins[0]!.pos;
  return { version: 2, code: '', wires: [], parts: [
    { id: 'board', kind: 'breadboard-half', pos: [0, 0, 0], rotY: 0, props: {} },
    { id: 'r', kind: 'resistor', pos: [hole[0] - lead[0], 0, hole[2] - lead[2]], rotY: 0, props: { ohms: 1000 } },
  ] };
};

afterEach(() => vi.restoreAllMocks());

it('reuses analysis socket scans across scene wrappers and ignores electrical props in the placement cache', () => {
  const scene = inserted();
  const world = vi.spyOn(geometry, 'pinWorldPos');
  const initial = analyze(scene).insertions;
  expect(initial['r:1']).toEqual({ partId: 'board', pinId: 'b12' });
  expect(world).toHaveBeenCalled();
  world.mockClear();
  scene.parts[1]!.props.ohms = 2000;
  expect(analyze({ ...scene }).insertions).toEqual(initial);
  expect(socketInsertions(scene.parts)).toEqual(initial);
  expect(world).not.toHaveBeenCalled();
});

it('invalidates cached placement after in-place movement and rotation', () => {
  const scene = inserted();
  const initial = socketInsertions(scene.parts);
  const world = vi.spyOn(geometry, 'pinWorldPos');
  scene.parts[1]!.rotY = 90;
  expect(socketInsertions(scene.parts)).not.toEqual(initial);
  expect(world).toHaveBeenCalled();
  world.mockClear();
  scene.parts[1]!.pos[0] += 100;
  expect(socketInsertions(scene.parts)['r:1']).toBeUndefined();
  expect(world).toHaveBeenCalled();
});

it('does not let mutations of returned analysis corrupt cached connections', () => {
  const scene = inserted();
  const analysis = analyze(scene);
  analysis.insertions['r:1']!.pinId = 'a1';
  delete analysis.insertions['r:2'];
  expect(analyze(scene)).toEqual(analyze(structuredClone(scene)));
  expect(socketInsertions(scene.parts)['r:1']).toEqual({ partId: 'board', pinId: 'b12' });
});

it('keeps duplicate-hole warnings identical on cache hits', () => {
  const scene = inserted();
  scene.parts.push({ ...structuredClone(scene.parts[1]!), id: 'duplicate' });
  const first = analyze(scene);
  expect(first.warnings).toContainEqual({ id: 'same-hole:board:b12', level: 'error', partId: 'duplicate', message: '한 구멍에 두 부품의 핀이 꽂혀 있습니다.' });
  expect(analyze(scene)).toEqual(first);
  expect(analyze(structuredClone(scene))).toEqual(first);
});

it('keeps the last socket on equal-distance ties and invalidates when socket order changes', () => {
  const scene = inserted();
  scene.parts.push({ ...structuredClone(scene.parts[0]!), id: 'overlapping-board' });
  expect(socketInsertions(scene.parts)['r:1']).toEqual({ partId: 'overlapping-board', pinId: 'b12' });
  scene.parts.reverse();
  expect(socketInsertions(scene.parts)['r:1']).toEqual({ partId: 'board', pinId: 'b12' });
});
