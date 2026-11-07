import { LineBuffer, MAX_SERIES, parseLine } from './plotter';

const MAX_CHARS = 100_000;
export const MAX_POINTS = 300;

export const serialLog = { text: '' };
export const plot = { series: [] as number[][], names: [] as string[] };
const lines = new LineBuffer();
const subs = new Set<() => void>();
export const onSerialLog = (cb: () => void) => (subs.add(cb), () => subs.delete(cb));

export function pushSerial(chunk: string) {
  serialLog.text = (serialLog.text + chunk).slice(-MAX_CHARS);
  for (const line of lines.push(chunk)) {
    const s = parseLine(line);
    if (!s) continue;
    s.values.forEach((v, i) => {
      if (i >= MAX_SERIES) return;
      (plot.series[i] ??= []).push(v);
      if (plot.series[i]!.length > MAX_POINTS) plot.series[i]!.shift();
      if (s.names[i]) plot.names[i] = s.names[i]!;
    });
  }
  subs.forEach((cb) => cb());
}
export function clearSerial() {
  serialLog.text = '';
  plot.series = [];
  plot.names = [];
  lines.reset();
  subs.forEach((cb) => cb());
}
