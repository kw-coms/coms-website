import { expect, it } from 'vitest';
import { SimulationEngine } from './engine';
import type { Scene, Wire } from './types';

const wire = (id: string, a: string, b: string): Wire => {
  const [fromPart, fromPin] = a.split('.');
  const [toPart, toPin] = b.split('.');
  return { id, from: { partId: fromPart!, pinId: fromPin! }, to: { partId: toPart!, pinId: toPin! }, color: 'blue' };
};

const circuit = (connections: [string, string][]): Scene => ({
  version: 2, code: '',
  parts: [
    { id: 'supply', kind: 'power-supply', pos: [0, 0, 0], rotY: 0, props: { volts: 5 } },
    { id: 'ic', kind: 'logic-7404', pos: [0, 0, 0], rotY: 0, props: {} },
  ],
  wires: [wire('vcc', 'supply.OUT+', 'ic.14'), wire('ground', 'supply.OUT-', 'ic.7'),
    ...connections.map(([a, b], index) => wire(`signal${index}`, a, b))],
});

it('settles all six cascaded 7404 inverters in one frame', () => {
  const engine = new SimulationEngine();
  engine.setScene(circuit([
    ['supply.OUT-', 'ic.1'], ['ic.2', 'ic.3'], ['ic.4', 'ic.5'],
    ['ic.6', 'ic.9'], ['ic.8', 'ic.11'], ['ic.10', 'ic.13'],
  ]));
  const expected = [1, 0, 1, 0, 1, 0];
  for (let sample = 0; sample < 2; sample++) {
    const frame = engine.frame();
    expect(['2', '4', '6', '8', '10', '12'].map(pin => frame.parts.ic!.ic!.outputs[pin])).toEqual(expected);
    expect(frame.warnings.some(warning => warning.id === 'behavior-nonconvergent')).toBe(false);
  }
});

it('bounds an odd inverter ring and warns when it cannot settle', () => {
  const engine = new SimulationEngine();
  engine.setScene(circuit([['ic.2', 'ic.3'], ['ic.4', 'ic.5'], ['ic.6', 'ic.1']]));
  const first = engine.frame();
  expect(first.warnings.some(warning => warning.id === 'behavior-nonconvergent')).toBe(true);
  expect((engine as unknown as { dirty: boolean }).dirty).toBe(true);
  expect(engine.frame().warnings.some(warning => warning.id === 'behavior-nonconvergent')).toBe(true);
});
