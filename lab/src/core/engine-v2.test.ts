import { describe, expect, it } from 'vitest';
import { SimulationEngine } from './engine';
import { V2_EXAMPLES } from './examples-v2';

const engineFor = (id: string) => {
  const engine = new SimulationEngine();
  engine.setScene(V2_EXAMPLES.find(example => example.id === id)!.scene);
  return engine;
};

describe('v2 time integration through the public engine', () => {
  it('runs a standalone 555 oscillator without firmware and measures physical frequency', () => {
    const engine = engineFor('timer-555-blink');
    const rises: number[] = [];
    let high = false;
    for (let i = 0; i < 900; i++) {
      const frame = engine.step(160000); // 10 ms, user-facing frame frequency is independent of integration
      const next = !!frame.parts.ic!.ic?.outputs['3'];
      if (next && !high) rises.push(frame.timeMs);
      high = next;
    }
    expect(rises.length).toBeGreaterThan(3);
    const frequency = 1000 / ((rises.at(-1)! - rises[1]!) / (rises.length - 2));
    expect(Math.abs(frequency / (1.44 / ((1000 + 2 * 10000) * .0001)) - 1)).toBeLessThan(.05);
    expect(engine.frame().timeMs).toBeCloseTo(9000, 1);
  }, 30000);

  it('preserves state when reading frames and records both RC scope channels', () => {
    const engine = engineFor('rc-oscilloscope');
    engine.step(8000000);
    const first = engine.frame();
    for (let i = 0; i < 20; i++) expect(engine.frame().netVolts).toEqual(first.netVolts);
    const scope = first.scopes!.scope!;
    expect(scope.channels).toHaveLength(2);
    expect(scope.channels[0]!.length).toBeGreaterThan(20);
    const volts = first.parts.c!.capacitor!.volts;
    expect(volts).toBeGreaterThan(1.8);
    expect(volts).toBeLessThan(2.1); // 5(1-exp(-0.5/1.005))
  }, 30000);
});

it('does not flood the frame with unused-pin warnings for a part dropped on the workspace', () => {
  const engine = new SimulationEngine();
  engine.setScene({ version: 2, parts: [{ id: 'ic', kind: 'logic-7408', pos: [0, 0, 0], rotY: 0, props: {} }], wires: [], code: '' });
  expect(engine.frame().warnings).toEqual([]);
});
