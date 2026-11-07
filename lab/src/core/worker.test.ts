import { afterEach, expect, it, vi } from 'vitest';
import { SimulationEngine } from './engine';
import type { Command } from './simulator';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('forwards a caught asynchronous engine crash from worker to its parent', async () => {
  vi.useFakeTimers();
  const send = vi.fn();
  vi.stubGlobal('postMessage', send);
  vi.stubGlobal('onmessage', null);
  await import('./worker');
  const handler = globalThis.onmessage as ((event: MessageEvent<Command>) => void) | null;
  const dispatch = (data: Command) => handler?.({ data } as MessageEvent<Command>);
  vi.spyOn(SimulationEngine.prototype, 'step').mockImplementation(() => { throw new Error('engine crash'); });
  dispatch({ method: 'start' });
  vi.advanceTimersByTime(1);
  expect(send).toHaveBeenCalledWith({ type: 'error', value: 'engine crash' });
  expect(vi.getTimerCount()).toBe(0);
  dispatch({ method: 'dispose' });
});
