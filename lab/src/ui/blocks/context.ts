import { PARTS } from '../../core';
import type { Analysis, PartInstance } from '../../core';
import type { GenOptions } from './generate';

/** What the blocks may know about the circuit: pin labels ("8 · LED") and part sizes for the generator. */
export function sceneContext(parts: PartInstance[], analysis: Analysis): { hints: Record<string, string>; opts: GenOptions } {
  const kindOf = new Map(parts.map((p) => [p.id, p.kind]));
  const netOf = (partId: string, pinId: string) => analysis.pinToNet[`${partId}:${pinId}`];
  const skip = (kind: string) => kind === 'arduino-uno' || kind.startsWith('breadboard-');
  const titles = (netId: string, seen = new Set<string>()): string[] => {
    const out: string[] = [];
    const net = analysis.nets.find((n) => n.id === netId);
    for (const ref of net?.pins ?? []) {
      const kind = kindOf.get(ref.partId);
      if (!kind || skip(kind) || seen.has(ref.partId)) continue;
      seen.add(ref.partId);
      if (kind === 'resistor') {
        // a resistor only passes the signal on: name what sits behind it (the LED), not the resistor
        const far = PARTS[kind].pins.map((p) => netOf(ref.partId, p.id)).find((n) => n && n !== netId);
        if (far) out.push(...titles(far, seen));
      } else out.push(PARTS[kind].title);
    }
    return out;
  };
  const hints: Record<string, string> = {};
  for (const net of analysis.nets) {
    const m = /^(?:D(\d+)|(A\d))$/.exec(net.name ?? '');
    if (!m) continue;
    const t = [...new Set(titles(net.id))];
    if (t.length) hints[m[1] ?? m[2]!] = t.join(', ').slice(0, 24);
  }
  const strip = parts.find((p) => p.kind === 'neopixel-strip' || p.kind === 'neopixel-ring');
  const lcd = parts.find((p) => p.kind === 'lcd1602-i2c');
  return {
    hints,
    opts: { pixelCount: strip ? Number(strip.props.count) || undefined : undefined, lcdAddress: lcd ? Number(lcd.props.address) || undefined : undefined },
  };
}
