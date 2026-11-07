import { expect, it } from 'vitest';
import { analyze } from './analyze';
import { runtimeWarningsV2 } from './electrical-warnings-v2';
import type { PartInstance, Scene, Wire } from './types';

const part = (id: string, kind: PartInstance['kind']): PartInstance => ({ id, kind, pos: [0,0,0], rotY: 0, props: {} });
const wire = (id: string, from: [string,string], to: [string,string]): Wire => ({ id, from: { partId: from[0], pinId: from[1] }, to: { partId: to[0], pinId: to[1] }, color: 'red' });
const scene = (parts: PartInstance[], wires: Wire[]): Scene => ({ version: 2, parts, wires, code: '' });

it('warns only when a source is actually hard shorted', () => {
  const s = scene([part('b','battery-9v')], []);
  expect(runtimeWarningsV2(s, analyze(s), {})).toEqual([]);
  s.wires.push(wire('w',['b','+'],['b','-']));
  expect(runtimeWarningsV2(s, analyze(s), {}).map(w => w.id)).toContain('battery-short:b');
});
it('recognizes a reverse-connected flyback diode', () => {
  const s = scene([part('b','battery-9v'),part('r','relay-spdt'),part('d','diode')], [
    wire('w1',['b','+'],['r','COIL+']), wire('w2',['b','-'],['r','COIL-'])]);
  let a = analyze(s);
  const v = { [a.pinToNet['r:COIL+']!]: 9, [a.pinToNet['r:COIL-']!]: 0 };
  expect(runtimeWarningsV2(s,a,v).map(w => w.id)).toContain('relay-flyback:r');
  s.wires.push(wire('w3',['d','K'],['r','COIL+']),wire('w4',['d','A'],['r','COIL-']));
  a = analyze(s);
  expect(runtimeWarningsV2(s,a,v).map(w => w.id)).not.toContain('relay-flyback:r');
});
it('requires a base resistor only for direct drive', () => {
  const s = scene([part('u','arduino-uno'), part('q','npn')], [wire('w',['u','D3'],['q','B'])]);
  expect(runtimeWarningsV2(s,analyze(s),{}).map(w => w.id)).toContain('transistor-base-resistor:q');
  s.parts.push(part('r','resistor'));
  s.wires = [wire('w1',['u','D3'],['r','1']),wire('w2',['r','2'],['q','B'])];
  expect(runtimeWarningsV2(s,analyze(s),{}).map(w => w.id)).not.toContain('transistor-base-resistor:q');
});
it('warns when an energized wired CMOS input has no source', () => {
  const s = scene([part('b','power-supply'),part('ic','logic-7400'),part('load','logic-7408')], [
    wire('w1',['b','OUT+'],['ic','14']),wire('w2',['b','OUT-'],['ic','7']),
    wire('w3',['ic','1'],['load','1'])]);
  const a = analyze(s);
  const v = { [a.pinToNet['ic:14']!]: 5, [a.pinToNet['ic:7']!]: 0 };
  expect(runtimeWarningsV2(s,a,v).map(w => w.id)).toContain('floating-cmos-1:ic');
});
