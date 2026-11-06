import type { Analysis, McuPinState, PartVisualState, Scene, SimWarning } from './types';
export interface SolveResult {
    netVolts: Record<string, number>;
    branchCurrents: Record<string, number>;
    currents: Record<string, number>;
    pinCurrents: Record<string, number>;
    floating: string[];
    warnings: SimWarning[];
    parts: Record<string, PartVisualState>;
}
type Branch = {
    a: string;
    b: string;
    r: number;
    v?: number;
    part?: string;
    type?: 'led' | 'resistor' | 'driver' | 'pin';
    vf?: number;
};
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const gpio = (id: string) => /^D\d+$|^A\d+$/.test(id);

// A red LED behind 220 Ω at 5 V carries about 13 mA. Visual saturation
// is separate from the 20/30 mA electrical warning thresholds.
export function ledBrightness(currentAmps: number): number {
    return clamp(currentAmps / 0.013, 0, 1);
}
function gauss(a: number[][], b: number[]): number[] { const n = b.length; for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++)
        if (Math.abs(a[r]![c]!) > Math.abs(a[p]![c]!))
            p = r;
    if (Math.abs(a[p]![c]!) < 1e-15)
        continue;
    [a[c], a[p]] = [a[p]!, a[c]!];
    [b[c], b[p]] = [b[p]!, b[c]!];
    const d = a[c]![c]!;
    for (let j = c; j < n; j++)
        a[c]![j]! /= d;
    b[c]! /= d;
    for (let r = 0; r < n; r++)
        if (r !== c) {
            const m = a[r]![c]!;
            if (!m)
                continue;
            for (let j = c; j < n; j++)
                a[r]![j]! -= m * a[c]![j]!;
            b[r]! -= m * b[c]!;
        }
} return b; }

function solveNodeVoltages(branches: Branch[], analysis: Analysis, grounds: Set<string>) {
    const touched = new Set<string>();
    for (const b of branches)
        if (b.r < 1e8) {
            touched.add(b.a);
            touched.add(b.b);
        }
    const nodes = analysis.nets.map(n => n.id).filter(id => touched.has(id) && !grounds.has(id));
    const index = new Map(nodes.map((n, i) => [n, i]));
    const volts: Record<string, number> = Object.fromEntries(analysis.nets.map(n => [n.id, 0]));
    for (let iter = 0; iter < 30; iter++) {
        const mat = nodes.map(() => Array(nodes.length).fill(0) as number[]), rhs = nodes.map(() => 0);
        for (const br of branches) {
            let effectiveV = br.v ?? 0;
            let r = br.r;
            if (br.vf !== undefined) {
                const dv = (volts[br.a] ?? 0) - (volts[br.b] ?? 0);
                if (dv < br.vf - .05) {
                    r = 1e9;
                    effectiveV = 0;
                }
                else
                    effectiveV = br.vf;
            }
            const c = 1 / r, ia = index.get(br.a), ib = index.get(br.b);
            if (ia !== undefined) {
                mat[ia]![ia]! += c;
                rhs[ia]! += effectiveV * c;
                if (ib !== undefined)
                    mat[ia]![ib]! -= (c);
            }
            if (ib !== undefined) {
                mat[ib]![ib]! += c;
                rhs[ib]! -= effectiveV * c;
                if (ia !== undefined)
                    mat[ib]![ia]! -= (c);
            }
        }
        for (let i = 0; i < nodes.length; i++)
            mat[i]![i]! += 1e-12;
        const out = gauss(mat, rhs);
        let delta = 0;
        for (let i = 0; i < nodes.length; i++) {
            const old = volts[nodes[i]!] ?? 0;
            const v = iter ? old * .35 + out[i]! * .65 : out[i]!;
            delta = Math.max(delta, Math.abs(v - old));
            volts[nodes[i]!] = v;
        }
        if (delta < 1e-6)
            break;
    }
    const currents = branches.map(b => { const dv = (volts[b.a] ?? 0) - (volts[b.b] ?? 0) - (b.v ?? 0); if (b.vf !== undefined)
        return dv >= b.vf - 1e-3 ? (dv - b.vf) / b.r : 0; return dv / b.r; });
    return { volts, currents };
}
export function solveCircuit(scene: Scene, analysis: Analysis, pins: Record<string, McuPinState> = {}, inputs: Record<string, Record<string, number | boolean>> = {}, externalDrives: Record<string, {
    volts: number;
    resistance?: number;
}> = {}): SolveResult {
    const unoId = scene.parts.find(part => part.kind === 'arduino-uno')?.id;
    const net = (pid: string, id: string) => analysis.pinToNet[`${pid}:${id}`];
    const grounds = new Set<string>();
    for (const p of scene.parts)
        if (p.id === unoId)
            for (const id of ['GND.1', 'GND.2', 'GND.3']) {
                const n = net(p.id, id);
                if (n)
                    grounds.add(n);
            }
    const ground = [...grounds][0] ?? '__ground';
    const branches: Branch[] = [];
    const add = (a: string | undefined, b: string | undefined, r: number, v = 0, part?: string, type?: Branch['type'], vf?: number) => { if (a && b && a !== b)
        branches.push({ a, b, r: Math.max(r, .001), v, part, type, vf }); };
    const g = ground;
    const warnings: SimWarning[] = [];
    for (const p of scene.parts)
        if (p.id === unoId && grounds.has(net(p.id, '5V') ?? ''))
            warnings.push({ id: `short:${p.id}`, level: 'error', partId: p.id, message: '5V와 GND가 직접 연결되어 단락되었습니다.' });
    for (const [ref, drive] of Object.entries(externalDrives)) {
        const n = analysis.pinToNet[ref];
        if (n)
            add(n, g, drive.resistance ?? 25, drive.volts, ref, 'driver');
    }
    const get = (p: string, k: string, d: number) => Number(inputs[p]?.[k] ?? d);
    const fwd = (pid: string, a: string, b: string, vf: number, r = 15, key = pid) => add(net(pid, a), net(pid, b), r, 0, key, 'led', vf);
    const vfColor = (c: unknown) => c === 'blue' || c === 'white' ? 3 : c === 'green' ? 2.1 : c === 'yellow' ? 2 : 1.8;
    for (const p of scene.parts) {
        const id = p.id;
        switch (p.kind) {
            case 'arduino-uno': {
                if (id !== unoId) break;
                add(net(id, '5V'), g, .1, 5, id, 'driver');
                add(net(id, 'IOREF'), g, .1, 5, id, 'driver');
                add(net(id, '3V3'), g, .1, 3.3, id, 'driver');
                for (const pin of ['D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'D10', 'D11', 'D12', 'D13', 'A0', 'A1', 'A2', 'A3', 'A4', 'A5']) {
                    const s = pins[pin];
                    const n = net(id, pin);
                    if (!n)
                        continue;
                    if (s?.mode === 'output')
                        add(n, g, 25, 5 * clamp(s.duty ?? s.level, 0, 1), `${id}:${pin}`, 'pin');
                    else if (s?.mode === 'input_pullup')
                        add(n, g, 35000, 5, `${id}:${pin}`, 'pin');
                    else
                        add(n, g, 1e9, 0, `${id}:${pin}`, 'pin');
                }
                break;
            }
            case 'resistor':
                add(net(id, '1'), net(id, '2'), Number(p.props.ohms ?? 220), 0, id, 'resistor');
                break;
            case 'led':
                fwd(id, 'anode', 'cathode', vfColor(p.props.color));
                break;
            case 'rgb-led':
                for (const ch of ['R', 'G', 'B']) {
                    const color = ch === 'R' ? 'red' : ch === 'G' ? 'green' : 'blue';
                    const anode = p.props.common === 'anode' ? 'common' : ch;
                    const cathode = p.props.common === 'anode' ? ch : 'common';
                    fwd(id, anode, cathode, vfColor(color), 15, `${id}:${ch}`);
                }
                break;
            case 'seven-segment':
                for (const ch of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'dp'])
                    p.props.common === 'anode' ? fwd(id, 'COM.1', ch, 1.8, 15, `${id}:${ch}`) : fwd(id, ch, 'COM.1', 1.8, 15, `${id}:${ch}`);
                break;
            case 'pushbutton':
                if (inputs[id]?.pressed)
                    add(net(id, '1'), net(id, '3'), .05, 0, id);
                break;
            case 'slide-switch':
                add(net(id, '2'), net(id, get(id, 'position', 0) < .5 ? '1' : '3'), .05, 0, id);
                break;
            case 'potentiometer': {
                const r = Number(p.props.ohms ?? 10000), x = clamp(get(id, 'position', .5), .00001, .99999);
                add(net(id, '1'), net(id, 'wiper'), r * (1 - x), 0, id);
                add(net(id, 'wiper'), net(id, '3'), r * x, 0, id);
                break;
            }
            case 'photoresistor':
                add(net(id, '1'), net(id, '2'), clamp(10000 * (10 / clamp(get(id, 'lux', 100), 1, 10000)) ** .7, 200, 1e6), 0, id);
                break;
            case 'dht11':
                add(net(id, 'DATA'), net(id, 'VCC'), 10000, 0, id);
                break;
            case 'joystick': {
                for (const [w, k] of [['VRx', 'x'], ['VRy', 'y']] as const) {
                    const x = clamp(get(id, k, .5), .00001, .99999);
                    add(net(id, '+5V'), net(id, w), 10000 * (1 - x), 0, id);
                    add(net(id, w), net(id, 'GND'), 10000 * x, 0, id);
                }
                add(net(id, 'SW'), net(id, '+5V'), 10000, 0, id);
                if (inputs[id]?.pressed)
                    add(net(id, 'SW'), net(id, 'GND'), .05, 0, id);
                break;
            }
            case 'l9110s': {
                const powered = scene.parts.some(uno => uno.id === unoId && net(id, 'VCC') === net(uno.id, '5V') && net(id, 'GND') === net(uno.id, 'GND.1'));
                if (powered)
                    for (const [a, b, pa, pb] of [['MA+', 'MA−', 'A-IA', 'A-IB'], ['MB+', 'MB−', 'B-IA', 'B-IB']] as const) {
                        const drive = (inputPin: string): number => {
                            const inputNet = net(id, inputPin);
                            const rail = scene.parts.find(uno => uno.kind === 'arduino-uno');
                            if (rail && inputNet && inputNet === net(rail.id, '5V')) return 1;
                            if (rail && inputNet && inputNet === net(rail.id, 'GND.1')) return 0;
                            const name = analysis.nets.find(candidate => candidate.id === inputNet)?.name;
                            return clamp(pins[name ?? '']?.duty ?? 0, 0, 1);
                        };
                        add(net(id, a), net(id, b), 2, 5 * (drive(pa) - drive(pb)), id, 'driver');
                    }
                break;
            }
            case 'dc-motor':
                add(net(id, '+'), net(id, '-'), 30, 0, id);
                break;
            case 'buzzer':
                add(net(id, '+'), net(id, '-'), 1000, 0, id);
                break;
            case 'multimeter':
                if (p.props.mode === 'mA')
                    add(net(id, 'A'), net(id, 'COM'), .05, 0, id);
                else
                    add(net(id, 'V'), net(id, 'COM'), 1e7, 0, id);
                break;
            default: break;
        }
    }
    const { volts, currents } = solveNodeVoltages(branches, analysis, grounds);
    const branchCurrents: Record<string, number> = {}, pinCurrents: Record<string, number> = {}, parts: Record<string, PartVisualState> = {};
    const meterIds = new Set(scene.parts.filter(p => p.kind === 'multimeter').map(p => p.id));
    branches.forEach((b, i) => { const c = currents[i]!; if (b.part) {
        if (b.type === 'pin')
            pinCurrents[b.part.split(':')[1]!] = c;
        else if (meterIds.has(b.part))
            branchCurrents[b.part] = c;
        else
            branchCurrents[b.part] = (branchCurrents[b.part] ?? 0) + Math.abs(c);
    } });
    // A wire can merge an output pin directly into ground. The normal branch
    // builder omits same-net branches, so account for the 25 Ω output stage here.
    for (const uno of scene.parts.filter(part => part.id === unoId)) {
        for (const [pin, state] of Object.entries(pins)) {
            if (state.mode !== 'output' || !grounds.has(net(uno.id, pin) ?? '')) continue;
            pinCurrents[pin] = -(5 * clamp(state.duty, 0, 1)) / 25;
        }
    }
    for (const p of scene.parts)
        if (p.kind === 'rgb-led')
            for (const ch of ['R', 'G', 'B'])
                branchCurrents[`${p.id}:${ch}`] ??= 0;
    for (const p of scene.parts) {
        const v = (x: string) => volts[net(p.id, x) ?? ''] ?? 0;
        const pinVolts = Object.fromEntries(
            Object.keys(analysis.pinToNet)
                .filter(key => key.startsWith(`${p.id}:`))
                .map(key => [key.slice(p.id.length + 1), volts[analysis.pinToNet[key]!] ?? 0]),
        );
        const state: PartVisualState = { pinVolts };
        if (p.kind === 'led') {
            const c = branchCurrents[p.id] ?? 0;
            state.led = { brightness: ledBrightness(c) };
            if (c > .03)
                warnings.push({ id: `led-overcurrent:${p.id}`, level: 'error', partId: p.id, message: 'LED 전류가 30 mA를 초과했습니다.' });
            else if (c > .02)
                warnings.push({ id: `led-overcurrent:${p.id}`, level: 'warn', partId: p.id, message: 'LED 전류가 20 mA를 초과했습니다.' });
            if (v('anode') < v('cathode') - 1)
                warnings.push({ id: `led-reversed:${p.id}`, level: 'info', partId: p.id, message: 'LED 극성이 반대로 연결되었습니다.' });
        }
        if (p.kind === 'rgb-led') {
            state.rgb = {
                r: ledBrightness(branchCurrents[`${p.id}:R`] ?? 0),
                g: ledBrightness(branchCurrents[`${p.id}:G`] ?? 0),
                b: ledBrightness(branchCurrents[`${p.id}:B`] ?? 0),
            };
            for (const ch of ['R', 'G', 'B']) {
                const key = `${p.id}:${ch}`, current = branchCurrents[key] ?? 0;
                if (current > .03)
                    warnings.push({ id: `led-overcurrent:${key}`, level: 'error', partId: p.id, message: `RGB LED ${ch} 채널 전류가 30 mA를 초과했습니다.` });
                else if (current > .02)
                    warnings.push({ id: `led-overcurrent:${key}`, level: 'warn', partId: p.id, message: `RGB LED ${ch} 채널 전류가 20 mA를 초과했습니다.` });
                const reverse = p.props.common === 'anode' ? v('common') < v(ch) - 1 : v(ch) < v('common') - 1;
                if (reverse)
                    warnings.push({ id: `led-reversed:${key}`, level: 'info', partId: p.id, message: `RGB LED ${ch} 채널 극성이 반대로 연결되었습니다.` });
            }
        }
        if (p.kind === 'seven-segment') {
            const channels = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'dp'];
            state.sevenSeg = { segments: channels.map(ch => (branchCurrents[`${p.id}:${ch}`] ?? 0) > 0.0001) };
            for (const channel of channels) {
                const current = branchCurrents[`${p.id}:${channel}`] ?? 0;
                const level = current > .03 ? 'error' : current > .02 ? 'warn' : null;
                if (level) warnings.push({
                    id: `led-overcurrent:${p.id}:${channel}`,
                    level,
                    partId: p.id,
                    message: `7세그먼트 ${channel} 전류가 ${level === 'error' ? 30 : 20} mA를 초과했습니다.`,
                });
            }
        }
        if (p.kind === 'multimeter')
            state.meter = p.props.mode === 'mA'
                ? { mode: 'mA', reading: `${((branchCurrents[p.id] ?? 0) * 1000).toFixed(2)} mA` }
                : { mode: 'V', reading: `${(v('V') - v('COM')).toFixed(2)} V` };
        if (p.kind === 'dc-motor') {
            const dv = v('+') - v('-');
            state.motor = { rpm: Math.round(200 * clamp(Math.abs(dv) / 5, 0, 1)), direction: dv > .1 ? 1 : dv < -.1 ? -1 : 0 };
            const names = [net(p.id, '+'), net(p.id, '-')].map(n => analysis.nets.find(x => x.id === n)?.name);
            if (names.some(n => n && gpio(n)))
                warnings.push({ id: `motor-direct:${p.id}`, level: 'warn', partId: p.id, message: 'DC 모터를 아두이노 핀에 직접 연결하지 마세요.' });
        }
        parts[p.id] = state;
    }
    for (let i = 0; i < branches.length; i++) {
        const b = branches[i]!;
        if (b.r <= .05 && Math.abs(currents[i] ?? 0) > .1 && ((volts[b.a] ?? 0) > 1 || (volts[b.b] ?? 0) > 1))
            warnings.push({ id: `short:${b.part ?? i}`, level: 'error', partId: b.part, message: '5V와 GND가 스위치를 통해 단락되었습니다.' });
    }
    for (const [name, c] of Object.entries(pinCurrents))
        if (Math.abs(c) > .04)
            warnings.push({ id: `pin-overcurrent:${name}`, level: 'error', message: `${name} 핀 전류가 40 mA를 초과했습니다.` });
    const reached = new Set<string>(grounds);
    for (const b of branches)
        if ((b.v ?? 0) !== 0)
            reached.add(b.a);
    for (let changed = true; changed;) {
        changed = false;
        for (const b of branches)
            if (b.r < 1e8) {
                if (reached.has(b.a) && !reached.has(b.b)) {
                    reached.add(b.b);
                    changed = true;
                }
                if (reached.has(b.b) && !reached.has(b.a)) {
                    reached.add(b.a);
                    changed = true;
                }
            }
    }
    const floating = analysis.nets.filter(n => !reached.has(n.id)).map(n => n.id);
    // Floating warning only for a pin the user wired something to (another pin on its net besides the header pin itself).
    // An unconnected INPUT pin (every unused pin at reset) never warns; INPUT_PULLUP is mode 'input_pullup', never 'input'.
    for (const p of scene.parts)
        if (p.id === unoId)
            for (const [id, state] of Object.entries(pins)) {
                const netId = net(p.id, id);
                if (state.mode !== 'input' || netId === undefined || !floating.includes(netId)) continue;
                if (!analysis.nets.find(n => n.id === netId)?.pins.some(r => r.partId !== p.id || r.pinId !== id)) continue;
                warnings.push({ id: `floating:${id}`, level: 'warn', partId: p.id, message: `${id} 입력이 떠 있어요(플로팅). 풀업/풀다운 저항이나 INPUT_PULLUP을 쓰세요.` });
            }
    for (const n of analysis.nets) {
        const outs = n.pins.filter(p => p.partId === unoId).map(p => [p.pinId, pins[p.pinId]] as const).filter(([, s]) => s?.mode === 'output');
        if (outs.some(([, s]) => s!.level === 0) && outs.some(([, s]) => s!.level === 1))
            warnings.push({ id: `contention:${n.id}`, level: 'error', message: '출력 핀끼리 충돌합니다.' });
    }
    return { netVolts: volts, branchCurrents, currents: branchCurrents, pinCurrents, floating, warnings, parts };
}
