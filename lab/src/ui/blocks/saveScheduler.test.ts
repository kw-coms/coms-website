import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSaveScheduler } from './saveScheduler';

describe('the editor save scheduler', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('saves 300 ms after the last edit', () => {
    const run = vi.fn();
    const s = createSaveScheduler(run);
    s.schedule(); vi.advanceTimersByTime(200); s.schedule(); vi.advanceTimersByTime(200);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('an edit, then a refused load, never saves the stand-in over the held program', () => {
    const run = vi.fn();
    const s = createSaveScheduler(run);
    s.schedule(); // the edit starts the timer
    vi.advanceTimersByTime(100);
    s.setBlocked(true); // a store change makes load() refuse: the editor now shows the stand-in
    vi.advanceTimersByTime(1000);
    expect(run).not.toHaveBeenCalled();
    s.schedule(); // edits on the stand-in stay blocked too
    vi.advanceTimersByTime(1000);
    expect(run).not.toHaveBeenCalled();
  });

  it('saving resumes after a successful load', () => {
    const run = vi.fn();
    const s = createSaveScheduler(run);
    s.setBlocked(true);
    s.setBlocked(false);
    s.schedule(); vi.advanceTimersByTime(300);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
