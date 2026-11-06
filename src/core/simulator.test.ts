import { describe, it, expect, vi, afterEach } from 'vitest';
import { LocalSimulator, createSimulator } from './simulator';
import type { Scene } from './types';
const scene: Scene = {
    version: 1,
    parts: [
        { id: 'uno', kind: 'arduino-uno', pos: [0, 0, 0], rotY: 0, props: {} },
        { id: 'pot', kind: 'potentiometer', pos: [100, 0, 0], rotY: 0, props: {} },
    ],
    wires: [],
    code: '',
};

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});
describe('simulator lifecycle', () => {
    it('delivers the final paused input after the solve throttle', () => {
        vi.useFakeTimers();
        const sim = new LocalSimulator();
        const frames: number[] = [];
        sim.onFrame(f => frames.push(f.timeMs));
        sim.setScene(scene);
        const initial = frames.length;
        sim.setInput({ partId: 'pot', key: 'position', value: 0.2 });
        sim.setInput({ partId: 'pot', key: 'position', value: 0.8 });
        expect(frames).toHaveLength(initial);
        vi.advanceTimersByTime(18);
        expect(frames).toHaveLength(initial + 1);
        sim.dispose();
    });
    it('disposal cancels pending input emission', () => {
        vi.useFakeTimers();
        const sim = new LocalSimulator();
        let count = 0;
        sim.onFrame(() => count++);
        sim.setScene(scene);
        sim.setInput({ partId: 'pot', key: 'position', value: 0.9 });
        sim.dispose();
        vi.advanceTimersByTime(100);
        expect(count).toBe(1);
    });
    it('worker error pauses execution and publishes a Korean error warning', () => {
        let worker: {
            onmessage: ((e: MessageEvent) => void) | null;
            onerror: ((e: ErrorEvent) => void) | null;
            postMessage: ReturnType<typeof vi.fn>;
            terminate: ReturnType<typeof vi.fn>;
        } | undefined;
        class MockWorker {
            onmessage: ((e: MessageEvent) => void) | null = null;
            onerror: ((e: ErrorEvent) => void) | null = null;
            postMessage = vi.fn();
            terminate = vi.fn();
            constructor() {
                worker = this;
            }
        }
        vi.stubGlobal('Worker', MockWorker);
        const sim = createSimulator();
        const frames: string[][] = [];
        sim.onFrame(f => frames.push(f.warnings.map(w => w.message)));
        sim.start();
        worker!.onmessage!({ data: { type: 'error', value: 'boom' } } as MessageEvent);
        expect(sim.state).toBe('paused');
        expect(frames.at(-1)?.[0]).toContain('시뮬레이션 오류: boom');
        sim.dispose();
    });
    it('worker path rejects invalid HEX and inputs synchronously', () => {
        class MockWorker {
            onmessage: ((e: MessageEvent) => void) | null = null;
            onerror: ((e: ErrorEvent) => void) | null = null;
            postMessage = vi.fn();
            terminate = vi.fn();
        }
        vi.stubGlobal('Worker', MockWorker);
        const sim = createSimulator();
        sim.setScene(scene);
        expect(() => sim.loadHex('bad')).toThrow();
        expect(() => sim.setInput({ partId: 'missing', key: 'pressed', value: true })).toThrow('존재하지 않는');
        expect(() => sim.setInput({ partId: 'pot', key: 'position', value: true })).toThrow('형식');
        sim.dispose();
    });
    it('uses the local simulator when browser Worker construction fails', () => {
        class UnavailableWorker {
            constructor() {
                throw new Error('Worker blocked');
            }
        }
        vi.stubGlobal('Worker', UnavailableWorker);
        const sim = createSimulator();
        expect(sim).toBeInstanceOf(LocalSimulator);
        sim.setScene(scene);
        expect(sim.state).toBe('idle');
        sim.dispose();
    });
    it('pauses and resumes the local clock without advancing while paused', () => {
        vi.useFakeTimers();
        const sim = new LocalSimulator();
        const frames: number[] = [];
        sim.onFrame(frame => frames.push(frame.timeMs));
        sim.setScene(scene);
        sim.setSpeed(0.25);
        sim.start();
        vi.advanceTimersByTime(20);
        sim.pause();
        const pausedTime = frames.at(-1)!;
        vi.advanceTimersByTime(100);
        expect(frames.at(-1)).toBe(pausedTime);
        sim.start();
        vi.advanceTimersByTime(20);
        expect(frames.at(-1)).toBeGreaterThan(pausedTime);
        sim.dispose();
    });
    it('clamps speed to the supported quarter to double range', () => {
        vi.useFakeTimers();
        const sim = new LocalSimulator();
        const frames: number[] = [];
        sim.onFrame(frame => frames.push(frame.timeMs));
        sim.setScene(scene);

        sim.setSpeed(-10);
        sim.start();
        vi.advanceTimersByTime(1);
        const quarterSpeedMs = frames.at(-1)!;
        expect(quarterSpeedMs).toBeCloseTo(1000 / 60 / 4, 1);

        sim.stop();
        sim.setSpeed(100);
        sim.start();
        vi.advanceTimersByTime(1);
        expect(frames.at(-1)).toBeCloseTo(1000 / 60 * 2, 1);
        sim.dispose();
    });
});
