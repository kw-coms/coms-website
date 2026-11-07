import type { Analysis, LogicTrace, Scene, ScopeTrace } from './types';

/** Samples per acquisition: a screen is CAPACITY - 1 sample intervals wide (10 divisions). */
export const CAPACITY = 512;
const PRETRIGGER = CAPACITY / 4;
type Buffer = { scope: boolean; dt: number; next: number; lastTime: number; last: number[];
  t0: number; channels: number[][]; triggered: boolean; capture?: ScopeTrace };

/** Samples on a fixed simulated-time grid, independently of UI frame cadence. */
export class Instruments {
  private buffers = new Map<string, Buffer>();
  reset(): void { this.buffers.clear(); }

  sample(scene: Scene, analysis: Analysis, volts: Record<string, number>, timeMs: number): void {
    if (!Number.isFinite(timeMs)) return;
    for (const part of scene.parts) {
      if (part.kind !== 'oscilloscope' && part.kind !== 'logic-analyzer') continue;
      const scope = part.kind === 'oscilloscope';
      const count = scope ? 2 : 8;
      const dt = Math.max(.001, Number(part.props.timeDiv ?? 1) * 10 / (CAPACITY - 1));
      const ground = volts[analysis.pinToNet[`${part.id}:GND`] ?? ''] ?? 0;
      const current = Array.from({ length: count }, (_, index) => {
        const pin = scope ? `CH${index + 1}` : `D${index}`;
        return (volts[analysis.pinToNet[`${part.id}:${pin}`] ?? ''] ?? 0) - ground;
      });
      let buffer = this.buffers.get(part.id);
      if (!buffer || buffer.dt !== dt || buffer.scope !== scope || timeMs < buffer.lastTime) {
        buffer = { scope, dt, next: timeMs, lastTime: timeMs, last: current, t0: timeMs,
          channels: Array.from({ length: count }, () => []), triggered: false };
        this.buffers.set(part.id, buffer);
      }
      if (timeMs <= buffer.lastTime && buffer.channels[0]!.length) continue;
      // Skip old grid points after a long pause; one call never has unbounded work.
      if (!buffer.triggered && timeMs - buffer.next > CAPACITY * dt) {
        buffer.next += Math.floor((timeMs - buffer.next - CAPACITY * dt) / dt) * dt;
        buffer.channels.forEach(channel => channel.splice(0));
        buffer.t0 = buffer.next;
      }
      while (buffer.next <= timeMs + 1e-9) {
        const f = timeMs === buffer.lastTime ? 1 : Math.max(0, Math.min(1, (buffer.next - buffer.lastTime) / (timeMs - buffer.lastTime)));
        const values = current.map((v, index) => buffer!.last[index]! + (v - buffer!.last[index]!) * f);
        const previous = buffer.channels[0]!.at(-1);
        if (scope && !buffer.triggered && previous !== undefined && previous < Number(part.props.trigger ?? 2.5) && values[0]! >= Number(part.props.trigger ?? 2.5)) {
          const remove = Math.max(0, buffer.channels[0]!.length - PRETRIGGER);
          buffer.channels.forEach(channel => channel.splice(0, remove));
          buffer.t0 += remove * dt;
          buffer.triggered = true;
        }
        values.forEach((v, index) => buffer!.channels[index]!.push(scope ? v : v >= 2.5 ? 1 : 0));
        if (buffer.channels[0]!.length > CAPACITY) {
          buffer.channels.forEach(channel => channel.shift());
          buffer.t0 += dt;
        }
        if (buffer.triggered && buffer.channels[0]!.length === CAPACITY) {
          buffer.capture = { t0Ms: buffer.t0, dtMs: dt, channels: buffer.channels.map(channel => [...channel]), triggered: true };
          buffer.channels = Array.from({ length: count }, () => []);
          buffer.t0 = buffer.next + dt;
          buffer.triggered = false;
        }
        buffer.next += dt;
      }
      buffer.lastTime = timeMs;
      buffer.last = current;
    }
  }

  traces(): { scopes: Record<string, ScopeTrace>; logic: Record<string, LogicTrace> } {
    const scopes: Record<string, ScopeTrace> = {};
    const logic: Record<string, LogicTrace> = {};
    for (const [id, buffer] of this.buffers) {
      const channels = buffer.channels.map(channel => [...channel]);
      if (buffer.scope) scopes[id] = buffer.capture
        ? { ...buffer.capture, channels: buffer.capture.channels.map(channel => [...channel]) }
        : { t0Ms: buffer.t0, dtMs: buffer.dt, channels, triggered: buffer.triggered };
      else logic[id] = { t0Ms: buffer.t0, dtMs: buffer.dt, channels: channels as (0 | 1)[][] };
    }
    return { scopes, logic };
  }
}
