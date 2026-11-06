// Serial plotter line parsing. Accepts "1 2 3", "1,2,3", tab-separated and "name:1,other:2".
export const MAX_SERIES = 6;
const MAX_PENDING = 4096;

export interface PlotSample {
  names: (string | null)[];
  values: number[];
}

export function parseLine(line: string): PlotSample | null {
  const tokens = line.trim().split(/[\s,]+/).filter(Boolean);
  if (!tokens.length) return null;
  const names: (string | null)[] = [];
  const values: number[] = [];
  for (const tok of tokens) {
    const m = /^(?:([^:]+):)?(-?\d*\.?\d+(?:[eE][-+]?\d+)?)$/.exec(tok);
    if (!m) return null;
    names.push(m[1] ?? null);
    values.push(Number(m[2]));
    if (values.length === MAX_SERIES) break;
  }
  return { names, values };
}

/** Collects text chunks and emits complete lines. */
export class LineBuffer {
  private rest = '';
  push(text: string): string[] {
    const parts = (this.rest + text).split(/\r\n|\n|\r/);
    // Serial.print without a newline must not grow the buffer (and the next split) without bound
    this.rest = (parts.pop() ?? '').slice(-MAX_PENDING);
    return parts;
  }
  reset() {
    this.rest = '';
  }
}
