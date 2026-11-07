import { afterEach, expect, it, vi } from 'vitest';
import { SimulationEngine } from './engine';
import { LocalSimulator } from './local-simulator';
import type { Command } from './simulator';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('dispatches mission mode before setup and forwards a caught engine crash', async () => {
  vi.useFakeTimers();
  const send = vi.fn();
  vi.stubGlobal('postMessage', send);
  vi.stubGlobal('onmessage', null);
  const missionMode = vi.spyOn(LocalSimulator.prototype, 'setMissionMode');
  const setScene = vi.spyOn(LocalSimulator.prototype, 'setScene');
  const start = vi.spyOn(LocalSimulator.prototype, 'start');
  await import('./worker');
  const handler = globalThis.onmessage as ((event: MessageEvent<Command>) => void) | null;
  const dispatch = (data: Command) => handler?.({ data } as MessageEvent<Command>);
  dispatch({ method: 'setMissionMode' });
  dispatch({ method: 'setScene', value: JSON.stringify({ version: 2, parts: [], wires: [], code: '' }) });
  expect(missionMode).toHaveBeenCalledOnce();
  expect(setScene).toHaveBeenCalledOnce();
  expect(missionMode.mock.invocationCallOrder[0]).toBeLessThan(setScene.mock.invocationCallOrder[0]!);
  vi.spyOn(SimulationEngine.prototype, 'step').mockImplementation(() => { throw new Error('engine crash'); });
  dispatch({ method: 'start' });
  expect(start).toHaveBeenCalledOnce();
  expect(setScene.mock.invocationCallOrder[0]).toBeLessThan(start.mock.invocationCallOrder[0]!);
  vi.advanceTimersByTime(1);
  expect(send).toHaveBeenCalledWith({ type: 'error', value: 'engine crash' });
  expect(vi.getTimerCount()).toBe(0);
  dispatch({ method: 'dispose' });
});
