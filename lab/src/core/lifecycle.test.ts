import { afterEach, expect, it, vi } from 'vitest';
import fixtures from './__fixtures__/examples-hex.json';
import { EXAMPLES } from './examples';
import { LocalSimulator } from './local-simulator';

afterEach(() => vi.useRealTimers());

const hexOf = (id: string): string | undefined => (fixtures.examples as Record<string, { hex: string }>)[id]?.hex;

// Regression for a UI toast "시뮬레이션 오류: Cannot access 'pins' before initialization":
// quickly loading, running, stopping and switching examples must never throw out of the simulator
// (a throw would move it to idle with a 시뮬레이션 오류 state, which the UI shows as a toast).
it('survives start / stop / switch-example sequences for every example with its real HEX', () => {
  vi.useFakeTimers();
  const sim = new LocalSimulator();
  const failures: string[] = [];
  sim.onState((_, error) => { if (error) failures.push(error); });
  EXAMPLES.forEach((example, index) => {
    const next = EXAMPLES[(index * 7 + 3) % EXAMPLES.length]!;
    sim.setScene(example.scene);
    const hex = hexOf(example.id);
    if (hex) sim.loadHex(hex);
    sim.start();
    vi.advanceTimersByTime(50);
    sim.setScene(next.scene); // switching scene while the old program is still running
    vi.advanceTimersByTime(30);
    sim.stop();
    sim.setScene(example.scene);
    sim.start();
    vi.advanceTimersByTime(20);
    sim.reset();
    vi.advanceTimersByTime(20);
    sim.stop();
  });
  sim.dispose();
  expect(failures).toEqual([]);
});
