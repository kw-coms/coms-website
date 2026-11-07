import type { Analysis, McuPinState, PartVisualState, Scene, SimWarning } from './types';
import { runtimeWarningsV2 } from './electrical-warnings-v2';
import { PARTS } from './parts';
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
    current?: number; // Norton companion current, positive a -> b
    model?: { kind: 'diode' | 'zener' | 'mos' | 'regulator' | 'supply' | 'opto' | 'sensor' | 'relay'; control?: string; emitter?: string; beta?: number; threshold?: number; vz?: number; limit?: number; closed?: boolean };
};
type Bipolar = { id: string; c: string; b: string; e: string; sign: 1 | -1; beta: number; saturation?: number };
export interface TransientState {
    capacitors: Record<string, { volts: number; amps: number }>;
    inductors: Record<string, { volts: number; amps: number }>;
    bulbs?: Record<string, number>;
    previous?: Record<string, number>;
}
export interface SolveContext {
    timeMs?: number;
    dtMs?: number;
    state?: TransientState;
    links?: { a: string; b: string; ohms: number }[];
}
export const newTransientState = (): TransientState => ({ capacitors: {}, inductors: {} });
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

function bipolarCurrents(device: Bipolar, volts: Record<string, number>): [number, number, number] {
    const { c, b, e, sign, beta } = device;
    const vb = volts[b] ?? 0, vc = volts[c] ?? 0, ve = volts[e] ?? 0;
    const junction = (voltage: number) => {
        const limited = clamp(voltage, -.8, .75);
        const exponential = Math.exp(limited / .026);
        return (device.saturation ?? 1e-13) * (exponential - 1 + Math.max(0, voltage - .75) * exponential / .026);
    };
    const forward = junction(sign * (vb - ve));
    const reverse = junction(sign * (vb - vc));
    const alpha = beta / (beta + 1);
    const ic = sign * (alpha * forward - reverse);
    const ie = sign * (-forward + .5 * reverse);
    return [ic, -ic - ie, ie];
}
function solveNodeVoltages(branches: Branch[], analysis: Analysis, grounds: Set<string>, bipolar: Bipolar[]) {
    const touched = new Set<string>();
    for (const b of branches)
        if (b.r < 1e8 || b.model?.kind === 'relay' || b.current) {
            touched.add(b.a);
            touched.add(b.b);
        }
    for (const device of bipolar) for (const id of [device.c, device.b, device.e]) touched.add(id);
    const nodes = [...new Set([...analysis.nets.map(n => n.id), ...bipolar.flatMap(device => [device.c, device.b, device.e])])].filter(id => touched.has(id) && !grounds.has(id));
    const index = new Map(nodes.map((n, i) => [n, i]));
    const volts: Record<string, number> = Object.fromEntries(analysis.nets.map(n => [n.id, 0]));
    let converged = nodes.length === 0;
    for (let iter = 0; iter < 120; iter++) {
        const mat = nodes.map(() => Array(nodes.length).fill(0) as number[]), rhs = nodes.map(() => 0);
        for (const br of branches) {
            let effectiveV = br.v ?? 0;
            let r = br.r;
            let offset = br.current ?? 0;
            let gm = 0;
            if (br.model?.kind === 'diode' || br.model?.kind === 'zener') {
                const v = clamp((volts[br.a] ?? 0) - (volts[br.b] ?? 0) - (br.model.vz ?? 0), -.8, br.model.kind === 'zener' ? .2 : .82);
                const saturation = br.model.kind === 'zener' ? .001 : 1e-12;
                const exp = Math.exp(v / .026), current = saturation * (exp - (br.model.kind === 'zener' ? 0 : 1)), slope = Math.max(1e-9, saturation * exp / .026);
                r = 1 / slope;
                offset = current - slope * (v + (br.model.vz ?? 0));
            }
            if (br.model?.kind === 'opto') {
                const led = (volts[br.model.control ?? ''] ?? 0) - (volts[br.model.emitter ?? ''] ?? 0);
                const amps = Math.max(0, 1e-12 * (Math.exp(clamp(led / .026, -30, 31)) - 1));
                offset = Math.min(.1, amps * (br.model.beta ?? 1)) * clamp(((volts[br.a] ?? 0) - (volts[br.b] ?? 0)) / .2, 0, 1);
            }
            if (br.model?.kind === 'mos') {
                const overdrive = (volts[br.model.control ?? ''] ?? 0) - (volts[br.model.emitter ?? ''] ?? 0) - (br.model.threshold ?? 2);
                const vds = Math.max(0, (volts[br.a] ?? 0) - (volts[br.b] ?? 0));
                if (overdrive <= 0) r = 1e9;
                else {
                    const beta = 8;
                    const slope = vds < overdrive ? Math.max(.01, beta * (overdrive - vds)) : .01;
                    const current = vds < overdrive ? beta * (overdrive * vds - vds * vds / 2) : beta * overdrive * overdrive / 2;
                    r = 1 / slope;
                    gm = vds < overdrive ? beta * vds : beta * overdrive;
                    offset = current - slope * vds - gm * ((volts[br.model.control ?? ''] ?? 0) - (volts[br.model.emitter ?? ''] ?? 0));
                }
            }
            if (br.model?.kind === 'regulator') effectiveV = Math.max(0, Math.min(5, (volts[br.model.control ?? ''] ?? 0) - (volts[br.b] ?? 0) - 2));
            if (br.model?.kind === 'sensor') effectiveV = Math.max(0, Math.min(br.v ?? 0, (volts[br.model.control ?? ''] ?? 0) - (volts[br.b] ?? 0)));
            if (br.model?.kind === 'relay') {
                const coil = (volts[br.model.control ?? ''] ?? 0) - (volts[br.model.emitter ?? ''] ?? 0);
                r = (coil >= (br.model.threshold ?? 3.75)) === br.model.closed ? .05 : 1e9;
            }
            if (iter > 0 && br.model?.kind === 'supply') {
                const demand = ((br.v ?? 0) - ((volts[br.a] ?? 0) - (volts[br.b] ?? 0))) / br.r;
                if (demand > (br.model.limit ?? 1)) { r = 1e9; effectiveV = 0; offset = -(br.model.limit ?? 1); }
            }
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
                rhs[ia]! += effectiveV * c - offset;
                if (ib !== undefined)
                    mat[ia]![ib]! -= (c);
                if (gm) {
                    const ctrl = index.get(br.model!.control!);
                    const emit = index.get(br.model!.emitter!);
                    if (ctrl !== undefined) mat[ia]![ctrl]! += gm;
                    if (emit !== undefined) mat[ia]![emit]! -= gm;
                }
            }
            if (ib !== undefined) {
                mat[ib]![ib]! += c;
                rhs[ib]! -= effectiveV * c - offset;
                if (ia !== undefined)
                    mat[ib]![ia]! -= (c);
                if (gm) {
                    const ctrl = index.get(br.model!.control!);
                    const emit = index.get(br.model!.emitter!);
                    if (ctrl !== undefined) mat[ib]![ctrl]! -= gm;
                    if (emit !== undefined) mat[ib]![emit]! += gm;
                }
            }
        }
        for (const device of bipolar) {
            const terminals = [device.c, device.b, device.e];
            const flow = bipolarCurrents(device, volts);
            const jacobian = terminals.map(terminal => {
                const old = volts[terminal] ?? 0;
                volts[terminal] = old + 1e-5;
                const up = bipolarCurrents(device, volts);
                volts[terminal] = old;
                return up.map((value, i) => (value - flow[i]!) / 1e-5);
            });
            terminals.forEach((terminal, row) => {
                const ri = index.get(terminal);
                if (ri === undefined) return;
                rhs[ri]! -= flow[row]!;
                terminals.forEach((column, col) => {
                    const derivative = jacobian[col]![row]!;
                    rhs[ri]! += derivative * (volts[column] ?? 0);
                    const ci = index.get(column);
                    if (ci !== undefined) mat[ri]![ci]! += derivative;
                });
            });
        }
        for (let i = 0; i < nodes.length; i++)
            mat[i]![i]! += 1e-12;
        const out = gauss(mat, rhs);
        let delta = 0;
        for (let i = 0; i < nodes.length; i++) {
            const old = volts[nodes[i]!] ?? 0;
            const nonlinear = bipolar.some(device => device.c === nodes[i] || device.b === nodes[i] || device.e === nodes[i]);
            const deltaV = (out[i]! - old) * .5;
            const v = iter ? old + (nonlinear ? clamp(deltaV, -.1, .1) : deltaV) : out[i]!;
            delta = Math.max(delta, Math.abs(v - old));
            volts[nodes[i]!] = v;
        }
        if (delta < 1e-6) {
            converged = true;
            break;
        }
    }
    const currents = branches.map(b => { const dv = (volts[b.a] ?? 0) - (volts[b.b] ?? 0) - (b.v ?? 0);
        if (b.model?.kind === 'diode' || b.model?.kind === 'zener') return (b.model.kind === 'zener' ? .001 : 1e-12) * (Math.exp(clamp((dv - (b.model.vz ?? 0)) / .026, -30, 31)) - (b.model.kind === 'zener' ? 0 : 1));
        if (b.model?.kind === 'mos') {
            const overdrive = Math.max(0, (volts[b.model.control ?? ''] ?? 0) - (volts[b.model.emitter ?? ''] ?? 0) - (b.model.threshold ?? 2));
            const vds = Math.max(0, dv);
            return 8 * (vds < overdrive ? overdrive * vds - vds * vds / 2 : overdrive * overdrive / 2);
        }
        if (b.model?.kind === 'supply') return Math.max(-(b.model.limit ?? 1), dv / b.r);
        if (b.model?.kind === 'relay') {
            const coil = (volts[b.model.control ?? ''] ?? 0) - (volts[b.model.emitter ?? ''] ?? 0);
            return dv / ((coil >= (b.model.threshold ?? 3.75)) === b.model.closed ? .05 : 1e9);
        }
        if (b.vf !== undefined)
        return dv >= b.vf - 1e-3 ? (dv - b.vf) / b.r : 0; return dv / b.r + (b.current ?? 0); });
    return { volts, currents, converged };
}
export function solveCircuit(scene: Scene, analysis: Analysis, pins: Record<string, McuPinState> = {}, inputs: Record<string, Record<string, number | boolean>> = {}, externalDrives: Record<string, {
    volts: number;
    resistance?: number;
}> = {}, context: SolveContext = {}): SolveResult {
    const unoId = scene.parts.find(part => part.kind === 'arduino-uno')?.id;
    const net = (pid: string, id: string) => analysis.pinToNet[`${pid}:${id}`];
    const sourceNets = new Set<string>();
    for (const part of scene.parts) {
        const sourcePins = part.kind === 'arduino-uno' ? ['5V', '3V3', ...Object.keys(pins).filter(pin => pins[pin]?.mode === 'output')]
            : ['power-supply', 'battery-9v', 'battery-aa-pack', 'coin-cell-3v', 'function-generator'].includes(part.kind)
                ? (part.kind === 'power-supply' ? ['OUT+', 'OUT-'] : part.kind === 'function-generator' ? ['OUT', 'GND'] : ['+', '-']) : [];
        for (const pin of sourcePins) if (net(part.id, pin)) sourceNets.add(net(part.id, pin)!);
    }
    const passiveEdges = new Map<string, string[]>();
    for (const part of scene.parts) {
        if (!['resistor', 'inductor', 'light-bulb', 'diode', 'zener', 'capacitor-ceramic', 'capacitor-electrolytic'].includes(part.kind)) continue;
        const terminals = part.kind === 'diode' || part.kind === 'zener' ? ['A', 'K']
            : part.kind === 'capacitor-electrolytic' ? ['+', '-'] : ['1', '2'];
        const a = net(part.id, terminals[0]!), b = net(part.id, terminals[1]!);
        if (!a || !b) continue;
        passiveEdges.set(a, [...(passiveEdges.get(a) ?? []), b]);
        passiveEdges.set(b, [...(passiveEdges.get(b) ?? []), a]);
    }
    const meterPowered = new Set<string>();
    for (const meter of scene.parts.filter(part => part.kind === 'multimeter' && (part.props.mode === 'Ω' || part.props.mode === 'continuity'))) {
        const seen = new Set<string>(), pending = [net(meter.id, 'V'), net(meter.id, 'COM')].filter((x): x is string => !!x);
        while (pending.length) {
            const node = pending.pop()!;
            if (seen.has(node)) continue;
            seen.add(node);
            if (sourceNets.has(node)) { meterPowered.add(meter.id); break; }
            pending.push(...passiveEdges.get(node) ?? []);
        }
    }
    const grounds = new Set<string>();
    for (const p of scene.parts)
        if (p.id === unoId)
            for (const id of ['GND.1', 'GND.2', 'GND.3']) {
                const n = net(p.id, id);
                if (n)
                    grounds.add(n);
            }
    for (const part of scene.parts) {
        if (grounds.size) break;
        if (part.kind === 'battery-9v' || part.kind === 'battery-aa-pack' || part.kind === 'coin-cell-3v' || part.kind === 'power-supply' || part.kind === 'function-generator') {
                const negative = net(part.id, part.kind === 'power-supply' ? 'OUT-' : part.kind === 'function-generator' ? 'GND' : '-');
            if (negative) grounds.add(negative);
        }
    }
    if (!grounds.size) {
        const meter = scene.parts.find(part => part.kind === 'multimeter' && (part.props.mode === 'Ω' || part.props.mode === 'continuity'));
        const common = meter && net(meter.id, 'COM');
        if (common) grounds.add(common);
    }
    const ground = [...grounds][0] ?? '__ground';
    const branches: Branch[] = [];
    const bipolar: Bipolar[] = [];
    const add = (a: string | undefined, b: string | undefined, r: number, v = 0, part?: string, type?: Branch['type'], vf?: number): Branch | undefined => {
        if (!a || !b || a === b) return undefined;
        const branch: Branch = { a, b, r: Math.max(r, .001), v, part, type, vf };
        branches.push(branch);
        return branch;
    };
    const g = ground;
    const warnings: SimWarning[] = [];
    for (const link of context.links ?? []) add(analysis.pinToNet[link.a], analysis.pinToNet[link.b], link.ohms);
    for (const p of scene.parts)
        if (p.id === unoId && grounds.has(net(p.id, '5V') ?? ''))
            warnings.push({ id: `short:${p.id}`, level: 'error', partId: p.id, message: '5V와 GND가 직접 연결되어 단락되었습니다.' });
    for (const [ref, drive] of Object.entries(externalDrives)) {
        const n = analysis.pinToNet[ref];
        if (n)
            add(n, g, drive.resistance ?? 25, drive.volts, ref, 'driver');
    }
    const get = (p: string, k: string, d: number) => Number(inputs[p]?.[k] ?? d);
    const prop = (p: Scene['parts'][number], key: string, fallback: number) => Number(p.props[key] ?? PARTS[p.kind].props.find(item => item.key === key)?.default ?? fallback);
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
            case 'battery-9v': case 'battery-aa-pack': case 'coin-cell-3v': case 'power-supply': case 'function-generator': {
                const positive = p.kind === 'power-supply' ? 'OUT+' : p.kind === 'function-generator' ? 'OUT' : '+';
                const negative = p.kind === 'power-supply' ? 'OUT-' : p.kind === 'function-generator' ? 'GND' : '-';
                let volts = p.kind === 'battery-9v' ? 9 : p.kind === 'coin-cell-3v' ? 3 : p.kind === 'battery-aa-pack' ? prop(p, 'cells', 2) * 1.5 : prop(p, 'volts', 5);
                if (p.kind === 'function-generator') {
                    const frequency = prop(p, 'frequencyHz', 1000);
                    const phase = ((context.timeMs ?? 0) / 1000 * frequency) % 1;
                    const amplitude = prop(p, 'amplitudeVolts', 2.5);
                    const duty = prop(p, 'duty', 50) / 100;
                    const waveform = p.props.waveform ?? 'sine';
                    const wave = waveform === 'square' ? (phase < duty ? 1 : -1) : waveform === 'triangle' ? 1 - 4 * Math.abs(phase - .5) : waveform === 'sawtooth' ? 2 * phase - 1 : Math.sin(phase * 2 * Math.PI);
                    volts = prop(p, 'offsetVolts', 2.5) + amplitude * wave;
                }
                const resistance = Number(p.props.internalOhms ?? (p.kind === 'power-supply' ? .1 : p.kind === 'coin-cell-3v' ? 10 : .5));
                const source = add(net(id, positive), net(id, negative), resistance, volts, id, 'driver');
                if (source && p.kind === 'power-supply') source.model = { kind: 'supply', limit: prop(p, 'currentLimit', 1) };
                break;
            }
            case 'capacitor-ceramic': case 'capacitor-electrolytic': {
                const a = p.kind === 'capacitor-ceramic' ? '1' : '+';
                const b = p.kind === 'capacitor-ceramic' ? '2' : '-';
                const c = Number(p.props.capacitance ?? 100) * (p.kind === 'capacitor-ceramic' ? 1e-9 : 1e-6);
                const dt = Math.max(1e-7, (context.dtMs ?? 1) / 1000);
                const old = context.state?.capacitors[id];
                const conductance = old ? 2 * c / dt : c / dt;
                if (c > 0) branches.push({ a: net(id, a)!, b: net(id, b)!, r: 1 / conductance, current: old ? -conductance * old.volts - old.amps : 0, part: id });
                break;
            }
            case 'inductor': {
                const inductance = Number(p.props.millihenries ?? 10) / 1000;
                const dt = Math.max(1e-7, (context.dtMs ?? 1) / 1000);
                const old = context.state?.inductors[id];
                const r = old ? 2 * inductance / dt : inductance / dt;
                add(net(id, '1'), net(id, '2'), r + Number(p.props.seriesOhms ?? 0), -(old ? r * old.amps + old.volts : 0), id);
                break;
            }
            case 'diode': case 'zener': {
                const a = net(id, 'A'), b = net(id, 'K');
                if (a && b) {
                    branches.push({ a, b, r: 1e9, part: id, model: { kind: 'diode' } });
                    if (p.kind === 'zener') {
                        branches.push({ a: b, b: a, r: 1e9, part: id, model: { kind: 'zener', vz: Number(p.props.vz ?? 5.1) } });
                    }
                }
                break;
            }
            case 'npn': case 'tip120': case 'pnp': {
                const emitter = net(id, 'E'), base = net(id, 'B'), collector = net(id, 'C');
                if (emitter && base && collector) {
                    const beta = Number(p.props.beta ?? (p.kind === 'tip120' ? 1000 : 100));
                    if (p.kind === 'tip120') {
                        const middle = `__darlington:${id}`;
                        const stageBeta = Math.sqrt(beta);
                        bipolar.push({ id, c: collector, b: base, e: middle, sign: 1, beta: stageBeta, saturation: 1e-12 });
                        bipolar.push({ id, c: collector, b: middle, e: emitter, sign: 1, beta: stageBeta, saturation: 1e-12 });
                    } else bipolar.push({ id, c: collector, b: base, e: emitter, sign: p.kind === 'pnp' ? -1 : 1, beta });
                }
                break;
            }
            case 'nmos': {
                const drain = net(id, 'D'), source = net(id, 'S'), gate = net(id, 'G');
                if (drain && source && gate) branches.push({ a: drain, b: source, r: 1e9, part: id,
                    model: { kind: 'mos', control: gate, emitter: source, threshold: Number(p.props.thresholdVolts ?? 2) } });
                break;
            }
            case 'optocoupler-4n35': {
                const anode = net(id, '1'), cathode = net(id, '2'), collector = net(id, '5'), emitter = net(id, '4');
                if (anode && cathode) branches.push({ a: anode, b: cathode, r: 1e9, part: id, model: { kind: 'diode' } });
                if (collector && emitter && anode && cathode) branches.push({ a: collector, b: emitter, r: 1e9, part: id, model: { kind: 'opto', control: anode, emitter: cathode, beta: Number(p.props.ctr ?? 100) / 100 } });
                break;
            }
            case 'dip-switch-4':
                for (let i = 1; i <= 4; i++) if (Math.floor(get(id, 'switches', 0)) & (1 << (i - 1))) add(net(id, `${i}A`), net(id, `${i}B`), .05, 0, id);
                break;
            case 'tilt-switch':
                if (get(id, 'tilt', 0) >= .5) add(net(id, '1'), net(id, '2'), .05, 0, id);
                break;
            case 'flex-sensor': case 'force-sensor':
                add(net(id, '1'), net(id, '2'), p.kind === 'flex-sensor' ? 10000 + get(id, 'bend', 0) * 900 : 100000 / (1 + get(id, 'force', 0)), 0, id);
                break;
            case 'soil-moisture':
                { const analog = add(net(id, 'AO'), net(id, 'GND'), 100, clamp(get(id, 'moisture', 0) / 100, 0, 1) * 5, id, 'driver');
                  if (analog) analog.model = { kind: 'sensor', control: net(id, 'VCC') };
                  const digital = add(net(id, 'DO'), net(id, 'GND'), 100, get(id, 'moisture', 0) > 50 ? 5 : 0, id, 'driver');
                  if (digital) digital.model = { kind: 'sensor', control: net(id, 'VCC') }; }
                break;
            case 'tmp36':
                { const output = add(net(id, 'OUT'), net(id, 'GND'), 100, .5 + get(id, 'temperature', 25) * .01, id, 'driver');
                  if (output) output.model = { kind: 'sensor', control: net(id, 'VCC') }; }
                break;
            case 'gas-sensor':
                { const analog = add(net(id, 'AO'), net(id, 'GND'), 100, clamp(get(id, 'gas', 0) / 100, 0, 1) * 5, id, 'driver');
                  if (analog) analog.model = { kind: 'sensor', control: net(id, 'VCC') };
                  const digital = add(net(id, 'DO'), net(id, 'GND'), 100, get(id, 'gas', 0) > 50 ? 5 : 0, id, 'driver');
                  if (digital) digital.model = { kind: 'sensor', control: net(id, 'VCC') }; }
                break;
            case 'light-bulb':
                add(net(id, '1'), net(id, '2'), Math.max(1, Number(p.props.ratedVolts ?? 6) ** 2 / Number(p.props.ratedWatts ?? .5)) * (.1 + .9 * (context.state?.bulbs?.[id] ?? 0)), 0, id);
                break;
            case 'vibration-motor': case 'gearmotor':
                add(net(id, '+'), net(id, '-'), p.kind === 'gearmotor' ? 30 : 50, 0, id);
                break;
            case 'regulator-7805':
                { const output = add(net(id, 'OUT'), net(id, 'GND'), .2, 5, id, 'driver');
                  if (output && net(id, 'IN')) output.model = { kind: 'regulator', control: net(id, 'IN') }; }
                break;
            case 'relay-spdt': {
                add(net(id, 'COIL+'), net(id, 'COIL-'), 70, 0, id);
                for (const [pin, closed] of [['NO', true], ['NC', false]] as const) {
                    const contact = add(net(id, 'COM'), net(id, pin), 1e9, 0, id);
                    if (contact) contact.model = { kind: 'relay', control: net(id, 'COIL+'), emitter: net(id, 'COIL-'), threshold: Number(p.props.coilVolts ?? 5) * .75, closed };
                }
                break;
            }
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
                else if (p.props.mode === 'Ω' || p.props.mode === 'continuity') {
                    const a = net(id, 'V'), b = net(id, 'COM');
                    if (!meterPowered.has(id) && a && b && a !== b) branches.push({ a, b, r: 1e8, current: -.001, part: id });
                }
                else
                    add(net(id, 'V'), net(id, 'COM'), 1e7, 0, id);
                break;
            default: break;
        }
    }
    const { volts, currents, converged } = solveNodeVoltages(branches, analysis, grounds, bipolar);
    if (!converged && (bipolar.length || branches.some(branch => branch.model || branch.vf !== undefined)))
        warnings.push({ id: 'solver-nonconvergence', level: 'warn', message: '비선형 회로 풀이가 수렴하지 않아 표시 전압이 부정확할 수 있습니다.' });
    warnings.push(...runtimeWarningsV2(scene, analysis, volts, context.state?.previous));
    if (context.state && (context.dtMs ?? 0) > 0) {
        context.state.bulbs ??= {};
        for (const p of scene.parts) {
            const id = p.id;
            if (p.kind === 'capacitor-ceramic' || p.kind === 'capacitor-electrolytic') {
                const a = net(id, p.kind === 'capacitor-ceramic' ? '1' : '+');
                const b = net(id, p.kind === 'capacitor-ceramic' ? '2' : '-');
                const index = branches.findIndex(branch => branch.part === id && branch.a === a && branch.b === b);
                if (a && b && index >= 0) context.state.capacitors[id] = { volts: (volts[a] ?? 0) - (volts[b] ?? 0), amps: currents[index] ?? 0 };
            }
            if (p.kind === 'light-bulb') {
                const index = branches.findIndex(branch => branch.part === id);
                const power = Math.abs(((volts[net(id, '1') ?? ''] ?? 0) - (volts[net(id, '2') ?? ''] ?? 0)) * (currents[index] ?? 0));
                const target = clamp(power / Number(p.props.ratedWatts ?? .5), 0, 1);
                context.state.bulbs[id] = (context.state.bulbs[id] ?? 0) + (target - (context.state.bulbs[id] ?? 0)) * clamp((context.dtMs ?? 0) / 100, 0, 1);
            }
            if (p.kind === 'inductor') {
                const a = net(id, '1'), b = net(id, '2');
                const index = branches.findIndex(branch => branch.part === id && branch.a === a && branch.b === b);
                if (a && b && index >= 0) context.state.inductors[id] = { volts: (volts[a] ?? 0) - (volts[b] ?? 0), amps: currents[index] ?? 0 };
            }
        }
    }
    if (context.state) context.state.previous = volts;
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
    for (const device of bipolar) {
        const current = Math.abs(bipolarCurrents(device, volts)[0]);
        branchCurrents[device.id] = (branchCurrents[device.id] ?? 0) + current;
    }
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
        if (p.kind === 'multimeter') {
            const mode = p.props.mode;
            if (mode === 'Ω' || mode === 'continuity') {
                const resistance = Math.abs(v('V') - v('COM')) * 1000;
                const continuity = !meterPowered.has(p.id) && resistance < 50;
                state.meter = { mode: 'V', measurementMode: mode, continuity,
                    reading: meterPowered.has(p.id) ? '전원 연결' : resistance > 1e7 ? 'OL' : mode === 'Ω' ? `${resistance.toFixed(1)} Ω` : continuity ? '도통' : '개방' };
                if (meterPowered.has(p.id))
                    warnings.push({ id: `meter-powered:${p.id}`, level: 'warn', partId: p.id, message: '전원이 연결된 회로에서는 저항·도통 측정을 하지 마세요.' });
            } else state.meter = mode === 'mA'
                ? { mode: 'mA', reading: `${((branchCurrents[p.id] ?? 0) * 1000).toFixed(2)} mA` }
                : { mode: 'V', reading: `${(v('V') - v('COM')).toFixed(2)} V` };
        }
        if (p.kind === 'capacitor-electrolytic' || p.kind === 'capacitor-ceramic') {
            const positive = p.kind === 'capacitor-ceramic' ? '1' : '+';
            const negative = p.kind === 'capacitor-ceramic' ? '2' : '-';
            const delta = v(positive) - v(negative);
            const overVoltage = Math.abs(delta) > prop(p, 'ratedVolts', 16);
            const reversed = p.kind === 'capacitor-electrolytic' && delta < -.5;
            state.capacitor = { volts: delta, overVoltage, reversed };
            if (overVoltage) warnings.push({ id: `capacitor-overvoltage:${p.id}`, level: 'error', partId: p.id, message: '커패시터 정격 전압을 초과했습니다.' });
            if (reversed) warnings.push({ id: `capacitor-reversed:${p.id}`, level: 'error', partId: p.id, message: '전해 커패시터 극성이 반대로 연결되었습니다.' });
        }
        if (p.kind === 'power-supply') {
            const limit = prop(p, 'currentLimit', 1);
            const shorted = net(p.id, 'OUT+') === net(p.id, 'OUT-');
            const amps = shorted ? limit : Math.abs(branchCurrents[p.id] ?? 0);
            const limiting = amps >= limit * (1 - 1e-5);
            state.supply = { volts: v('OUT+') - v('OUT-'), amps, limiting };
            if (limiting) warnings.push({ id: `supply-limit:${p.id}`, level: 'warn', partId: p.id, message: '전원공급기가 전류 제한(CC)에 도달했습니다.' });
        }
        if (p.kind === 'regulator-7805' && v('IN') - v('GND') < 7 && v('IN') - v('GND') > .5)
            warnings.push({ id: `regulator-dropout:${p.id}`, level: 'warn', partId: p.id, message: '7805 입력 전압이 낮아 정상적인 5V 출력이 어렵습니다.' });
        if (p.kind === 'relay-spdt') state.relay = { closed: (v('COIL+') - v('COIL-')) > Number(p.props.coilVolts ?? 5) * .75 };
        if (p.kind === 'light-bulb') state.bulb = { brightness: clamp(context.state?.bulbs?.[p.id] ?? (Math.abs(v('1') - v('2')) / prop(p, 'ratedVolts', 6)) ** 2, 0, 1) };
        if (p.kind === 'vibration-motor') state.vibration = { on: Math.abs(v('+') - v('-')) > 1.5 };
        if (p.kind === 'gearmotor') state.motor = { rpm: Math.round(prop(p, 'rpm', 200) * clamp(Math.abs(v('+') - v('-')) / 6, 0, 1)), direction: v('+') - v('-') > .1 ? 1 : v('+') - v('-') < -.1 ? -1 : 0 };
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
