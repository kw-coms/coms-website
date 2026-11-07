import type { Analysis, Scene, SimWarning } from './types';

/** Topology warnings for v2 devices. Only inspect connected, powered components. */
export function runtimeWarningsV2(
  scene: Scene, analysis: Analysis, netVolts: Record<string, number>, previousVolts: Record<string, number> = {},
): SimWarning[] {
  const net = (id: string, pin: string) => analysis.pinToNet[`${id}:${pin}`];
  const volts = (id: string | undefined, table = netVolts) => id ? table[id] ?? 0 : 0;
  const wired = (id: string | undefined) => !!id && (analysis.nets.find(n => n.id === id)?.pins.length ?? 0) > 1;
  const warning = (id: string, partId: string, message: string, level: SimWarning['level'] = 'warn'): SimWarning =>
    ({ id: `${id}:${partId}`, partId, level, message });
  const result: SimWarning[] = [];

  const sourced = new Set<string>();
  for (const part of scene.parts) {
    const ids = part.kind === 'arduino-uno' ? ['5V','3V3','GND.1','GND.2','GND.3', ...Array.from({ length: 14 }, (_, i) => `D${i}`), ...Array.from({ length: 6 }, (_, i) => `A${i}`)]
      : ['battery-9v','battery-aa-pack','coin-cell-3v'].includes(part.kind) ? ['+','-']
      : part.kind === 'power-supply' ? ['OUT+','OUT-'] : [];
    for (const pin of ids) { const n = net(part.id, pin); if (n) sourced.add(n); }
  }
  for (let changed = true; changed;) {
    changed = false;
    for (const part of scene.parts.filter(p => p.kind === 'resistor')) {
      const a = net(part.id, '1'), b = net(part.id, '2');
      if (a && b && sourced.has(a) !== sourced.has(b)) {
        sourced.add(a); sourced.add(b); changed = true;
      }
    }
  }
  for (const part of scene.parts) {
    const id = part.id;
    if (['battery-9v', 'battery-aa-pack', 'coin-cell-3v', 'power-supply'].includes(part.kind)) {
      const positive = net(id, part.kind === 'power-supply' ? 'OUT+' : '+');
      const negative = net(id, part.kind === 'power-supply' ? 'OUT-' : '-');
      if (positive && positive === negative)
        result.push(warning('battery-short', id, '전원 양극과 음극이 직접 연결되어 단락되었습니다.', 'error'));
    }
    if (['npn', 'pnp', 'tip120'].includes(part.kind)) {
      const base = net(id, 'B');
      if (!wired(base)) continue;
      const refs = analysis.nets.find(n => n.id === base)?.pins ?? [];
      if (refs.some(ref => ref.partId !== id && (
        (scene.parts.find(p => p.id === ref.partId)?.kind === 'arduino-uno' && /^D\d+$|^A\d+$/.test(ref.pinId)) ||
        ['+', 'OUT+'].includes(ref.pinId)
      ))) result.push(warning('transistor-base-resistor', id, '트랜지스터 베이스와 출력 사이에 전류 제한 저항을 연결하세요.'));
    }
    if (part.kind.startsWith('logic-74')) {
      const vcc = net(id, '14'), gnd = net(id, '7');
      if (wired(vcc) && wired(gnd) && volts(vcc) - volts(gnd) > 2.7) {
        const pins = part.kind === 'logic-7404' ? ['1','3','5','9','11','13'] : ['1','2','4','5','9','10','12','13'];
        for (const pin of pins) {
          const input = net(id, pin);
          if (input && wired(input) && !sourced.has(input))
            result.push(warning(`floating-cmos-${pin}`, id, `${pin}번 CMOS 입력이 떠 있습니다. 풀업 또는 풀다운 저항을 연결하세요.`));
        }
      }
    }
    if (part.kind === 'relay-spdt') {
      const positive = net(id, 'COIL+'), negative = net(id, 'COIL-');
      if (!wired(positive) || !wired(negative)) continue;
      const diode = scene.parts.some(d => ['diode', 'zener'].includes(d.kind)
        && net(d.id, 'K') === positive && net(d.id, 'A') === negative);
      if (diode) continue;
      const rated = Number(part.props.coilVolts ?? 5);
      const energized = volts(positive) - volts(negative) >= .75 * rated;
      const wasEnergized = volts(positive, previousVolts) - volts(negative, previousVolts) >= .75 * rated;
      if (energized || wasEnergized)
        result.push(warning('relay-flyback', id, '릴레이 코일에 역방향 플라이백 다이오드가 없습니다.'));
      if (wasEnergized && !energized)
        result.push(warning('relay-turnoff-spike', id, '릴레이 코일 차단 시 역기전력 스파이크가 발생할 수 있습니다.'));
    }
  }
  return result;
}
