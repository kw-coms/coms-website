import type { CPU } from 'avr8js';
import type { DebugInfo, DebugState } from '../types';

type StepMode = 'into' | 'over' | 'out';

/** Instruction-boundary debugger; AVR PCs are words, DWARF addresses are bytes. */
export class AvrDebugger {
  private info?: DebugInfo;
  private entries: DebugInfo['lines'] = [];
  private breakpoints = new Set<number>();
  private paused = false;
  private reason: DebugState['reason'];
  private mode?: StepMode;
  private startLine?: number;
  private startDepth = 0;
  private depth = 0;
  private skipPc?: number;

  get active(): boolean { return !!this.info; }
  get isPaused(): boolean { return this.paused; }

  load(info: DebugInfo): void {
    this.info = info;
    this.entries = [...info.lines].filter(e => Number.isInteger(e.addr) && Number.isInteger(e.line) && e.line > 0)
      .sort((a, b) => a.addr - b.addr);
    this.breakpoints.clear();
    this.paused = false;
    this.mode = undefined;
    this.depth = 0;
    this.skipPc = undefined;
  }

  unload(): void { this.info = undefined; this.breakpoints.clear(); this.resetRuntime(); }
  resetRuntime(): void { this.paused = false; this.mode = undefined; this.depth = 0; this.skipPc = undefined; this.reason = undefined; }
  pause(): void { if (this.info) { this.paused = true; this.reason = 'pause'; this.mode = undefined; } }

  setBreakpoints(lines: number[]): void {
    this.breakpoints = new Set(lines.map(line => this.entries.find(e => e.line === line)?.addr).filter((n): n is number => n !== undefined));
  }

  line(pc: number): number | undefined {
    let lo = 0, hi = this.entries.length;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (this.entries[mid]!.addr <= pc * 2) lo = mid + 1; else hi = mid; }
    return this.entries[lo - 1]?.line;
  }

  before(cpu: CPU): boolean {
    if (!this.info || this.paused) return !this.paused;
    const addr = cpu.pc * 2, line = this.line(cpu.pc);
    if (this.skipPc === addr) { this.skipPc = undefined; return true; }
    const stepped = this.mode && line !== undefined && line !== this.startLine
      && (this.mode === 'into' || (this.mode === 'over' && this.depth <= this.startDepth)
        || (this.mode === 'out' && this.depth < this.startDepth));
    if (stepped || this.breakpoints.has(addr)) {
      this.paused = true;
      this.reason = stepped ? 'step' : 'breakpoint';
      this.mode = undefined;
      return false;
    }
    return true;
  }

  after(opcode: number, spBefore?: number, spAfter?: number): void {
    const call = (opcode & 0xf000) === 0xd000 || (opcode & 0xfe0e) === 0x940e || opcode === 0x9509 || opcode === 0x9519;
    if (call) this.depth++;
    else if (opcode === 0x9508 || opcode === 0x9518) this.depth = Math.max(0, this.depth - 1);
    // avr8js services an interrupt in cpu.tick(), which pushes a return
    // address after the instruction. Count that push separately from CALL.
    if (spBefore !== undefined && spAfter !== undefined) {
      const expected = call ? -2 : opcode === 0x9508 || opcode === 0x9518 ? 2 : 0;
      if (spAfter - spBefore - expected === -2) this.depth++;
    }
  }

  continue(cpu: CPU): void { this.skipPc = cpu.pc * 2; this.paused = false; this.mode = undefined; }
  private step(cpu: CPU, mode: StepMode): void {
    this.startLine = this.line(cpu.pc);
    this.startDepth = this.depth;
    this.skipPc = cpu.pc * 2;
    this.mode = mode;
    this.paused = false;
  }
  stepInto(cpu: CPU): void { this.step(cpu, 'into'); }
  stepOver(cpu: CPU): void { this.step(cpu, 'over'); }
  stepOut(cpu: CPU): void { this.step(cpu, 'out'); }

  state(cpu: CPU): DebugState | undefined {
    if (!this.info) return undefined;
    return { paused: this.paused, line: this.line(cpu.pc), reason: this.paused ? this.reason : undefined,
      globals: this.info.globals.map(g => ({ name: g.name, type: g.type, value: formatGlobal(cpu, g) })) };
  }
}

function formatGlobal(cpu: CPU, g: DebugInfo['globals'][number]): string {
  const addr = g.addr >= 0x800000 ? g.addr - 0x800000 : g.addr;
  const type = g.type.toLowerCase();
  if (!Number.isInteger(addr) || addr < 0 || addr + g.size > cpu.data.length) return '?';
  const view = cpu.dataView;
  const array = /\[(\d+)\]/.exec(type);
  const signed = !/unsigned|uint|byte/.test(type);
  const width = /long|int32|uint32|float/.test(type) ? 4
    : /int16|uint16|short|\b(?:unsigned\s+)?int\b/.test(type) ? 2 : 1;
  if (!array && g.size < width) return '?';
  const read = (offset: number): string => {
    const at = addr + offset;
    if (/float/.test(type)) return String(Number(view.getFloat32(at, true).toPrecision(7)));
    if (/bool/.test(type)) return cpu.data[at] ? 'true' : 'false';
    if (/char/.test(type)) return JSON.stringify(String.fromCharCode(cpu.data[at]!));
    if (width === 4) return String(signed ? view.getInt32(at, true) : view.getUint32(at, true));
    if (width === 2) return String(signed ? view.getInt16(at, true) : view.getUint16(at, true));
    return String(signed && !/byte/.test(type) ? view.getInt8(at) : view.getUint8(at));
  };
  if (!array) return read(0);
  return `[${Array.from({ length: Math.min(16, Number(array[1]), Math.floor(g.size / width)) }, (_, i) => read(i * width)).join(', ')}]`;
}
