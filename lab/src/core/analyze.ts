import type { Analysis, PinRef, Scene, SimWarning } from './types';
import { PARTS, breadboardGroups, partInternalConnections } from './parts';
import { socketInsertions } from './socket-insertions';
const key = (p: PinRef) => `${p.partId}:${p.pinId}`;
/** Collapse ideal conductors only; resistors, diodes and active contacts remain branches. */
export function analyze(scene: Scene): Analysis {
    const parent = new Map<string, string>();
    const refs = new Map<string, PinRef>();
    const join = (a: string, b: string) => { if (parent.has(a) && parent.has(b))
        parent.set(root(b), root(a)); };
    const root = (id: string): string => { const p = parent.get(id)!; if (p !== id)
        parent.set(id, root(p)); return parent.get(id)!; };
    const warnings: SimWarning[] = [];
    const unos = scene.parts.filter(part => part.kind === 'arduino-uno');
    for (const part of unos.slice(1)) {
        warnings.push({ id: `multiple-uno:${part.id}`, level: 'error', partId: part.id,
            message: '아두이노 UNO는 한 회로에 하나만 시뮬레이션할 수 있어요.' });
    }
    for (const part of scene.parts)
        for (const pin of PARTS[part.kind].pins) {
            const ref = { partId: part.id, pinId: pin.id }, k = key(ref);
            refs.set(k, ref);
            parent.set(k, k);
        }
    for (const part of scene.parts) {
        const links = part.kind.startsWith('breadboard-') ? breadboardGroups(part.kind) :
            ['arduino-uno', 'seven-segment', 'pushbutton', 'l293d'].includes(part.kind) ? partInternalConnections(part.kind) : [];
        for (const group of links)
            for (const id of group.slice(1))
                join(`${part.id}:${group[0]}`, `${part.id}:${id}`);
    }
    for (const wire of scene.wires)
        join(key(wire.from), key(wire.to));
    const insertions = socketInsertions(scene.parts);
    const occupied = new Set<string>();
    for (const [pin, socket] of Object.entries(insertions)) {
        const target = key(socket);
        join(pin, target);
        if (occupied.has(target))
            warnings.push({ id: `same-hole:${target}`, level: 'error', partId: pin.slice(0, pin.indexOf(':')), message: '한 구멍에 두 부품의 핀이 꽂혀 있습니다.' });
        else
            occupied.add(target);
    }
    const grouped = new Map<string, PinRef[]>();
    for (const [k, ref] of refs) {
        const r = root(k);
        grouped.set(r, [...(grouped.get(r) ?? []), ref]);
    }
    const unoIds = new Set(unos.slice(0, 1).map(p => p.id));
    const nets: Analysis['nets'] = [], pinToNet: Analysis['pinToNet'] = {};
    const priority = (n: string) => n === 'GND' ? 0 : n === '5V' ? 1 : n === '3V3' ? 2 : n.startsWith('D') ? 3 : n.startsWith('A') ? 4 : 5;
    for (const pins of grouped.values()) {
        const id = `n${nets.length}`;
        const names = pins.filter(p => unoIds.has(p.partId)).map(p => p.pinId.startsWith('GND.') ? 'GND' : p.pinId).sort((a, b) => priority(a) - priority(b));
        nets.push({ id, ...(names[0] ? { name: names[0] } : {}), pins });
        for (const p of pins)
            pinToNet[key(p)] = id;
    }
    const net = (partId: string, pinId: string): string => pinToNet[`${partId}:${pinId}`] ?? '';
    // A closed slide contact is nearly ideal (0.05 Ω) in the electrical solver.
    // Traverse it here only for topology warnings, never merge its nets.
    const links = new Map<string, Set<string>>();
    const connect = (a: string, b: string) => {
        if (!a || !b)
            return;
        if (!links.has(a))
            links.set(a, new Set());
        if (!links.has(b))
            links.set(b, new Set());
        links.get(a)!.add(b);
        links.get(b)!.add(a);
    };
    for (const part of scene.parts.filter(p => p.kind === 'slide-switch'))
        connect(net(part.id, '2'), net(part.id, Number(part.props.position ?? 0) < .5 ? '1' : '3'));
    const reachable = (from: string, target: (n: string) => boolean, blocked?: string): boolean => {
        const seen = new Set<string>(blocked ? [blocked] : []), todo = [from];
        while (todo.length) {
            const id = todo.pop()!;
            if (seen.has(id))
                continue;
            seen.add(id);
            if (target(id))
                return true;
            todo.push(...(links.get(id) ?? []));
        }
        return false;
    };
    for (const uno of scene.parts.filter(p => p.kind === 'arduino-uno')) {
        if (reachable(net(uno.id, '5V'), id => id === net(uno.id, 'GND.1')))
            warnings.push({ id: `hard-short:${uno.id}`, level: 'error', partId: uno.id, message: '5V와 GND가 직접 단락되었습니다.' });
    }
    const terminals = new Set(nets.filter(n => n.pins.some(p => unoIds.has(p.partId))).map(n => n.id));
    for (const part of scene.parts.filter(p => p.kind !== 'arduino-uno' && !p.kind.startsWith('breadboard-'))) {
        for (const pin of PARTS[part.kind].pins) {
            const id = net(part.id, pin.id), peers = nets.find(n => n.id === id)?.pins ?? [];
            if (!peers.some(p => p.partId !== part.id))
                warnings.push({ id: `unconnected:${part.id}:${pin.id}`, level: 'info', partId: part.id, message: `${pin.label} 핀이 연결되지 않았습니다.` });
        }
        const diodePairs = part.kind === 'led' ? [['anode', 'cathode']] : part.kind === 'rgb-led' ? ['R', 'G', 'B'].map(c => [c, 'common']) : [];
        for (const [a, b] of diodePairs) {
            if (!a || !b)
                continue;
            const na = net(part.id, a), nb = net(part.id, b);
            const external = (id: string, other: string) => reachable(id, n => terminals.has(n) && n !== other, other);
            if (na !== nb && external(na, nb) && external(nb, na))
                warnings.push({ id: `no-resistor:${part.id}:${a}`, level: 'warn', partId: part.id, message: 'LED 전류 경로에 전류 제한 저항이 없습니다.' });
        }
    }
    return { nets, pinToNet, insertions, warnings };
}
