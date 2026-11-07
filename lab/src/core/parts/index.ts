import type { PartDef, PartKind, PinDef, PropDef, SimInputDef } from '../types';
const P = 2.54;
const pin = (id: string, x: number, z: number, role: PinDef['role'] = 'passive', y = 0): PinDef => ({ id, label: id, pos: [x, y, z], role });
const line = (ids: string[], pitch = P): PinDef[] => ids.map((id, i) => pin(id, (i - (ids.length - 1) / 2) * pitch, 0));
const number = (key: string, label: string, value: number, min: number, max: number, unit?: string): PropDef => ({ key, label, type: 'number', default: value, min, max, unit });
const CHOICE_LABELS: Record<string, string> = {
    red: '빨강', green: '초록', blue: '파랑', yellow: '노랑', white: '흰색',
    cathode: '공통 음극', anode: '공통 양극', V: '전압 (V)', mA: '전류 (mA)',
};
const choice = (key: string, label: string, values: (string | number)[], value = values[0]!): PropDef => ({
    key, label, type: 'enum', default: value,
    options: values.map(option => ({ value: option, label: CHOICE_LABELS[String(option)] ?? String(option) })),
});
const range = (key: SimInputDef['key'], label: string, value: number, min: number, max: number): SimInputDef => ({ key, label, type: 'range', default: value, min, max });
const pressed: SimInputDef = { key: 'pressed', label: '누르기', type: 'momentary', default: false };
const def = (
    kind: PartKind, title: string, category: PartDef['category'], size: PartDef['size'],
    pins: PinDef[], props: PropDef[] = [], inputs?: SimInputDef[],
): PartDef => ({ kind, title, category, size, pins, props, inputs });
// UNO origin is PCB centre, PCB top y=0. Socket openings sit on 8.5 mm headers.
// Coordinates use USB at -X, digital headers at -Z. The D7/D8 gap is 160 mil.
const unoPins: PinDef[] = [];
for (let i = 0; i < 8; i++)
    unoPins.push(pin(`D${i}`, 29.21 - i * P, -24.13, 'digital', 8.5));
for (let i = 8; i < 14; i++)
    unoPins.push(pin(`D${i}`, 7.366 - (i - 8) * P, -24.13, 'digital', 8.5));
['GND.1', 'AREF', 'SDA', 'SCL'].forEach((id, i) => unoPins.push(pin(id, -7.874 - i * P, -24.13, id.startsWith('GND') ? 'gnd' : 'digital', 8.5)));
['IOREF', 'RESET', '3V3', '5V', 'GND.2', 'GND.3', 'VIN'].forEach((id, i) => unoPins.push(pin(id, -3.81 + i * P, 24.13, id.startsWith('GND') ? 'gnd' : 'power', 8.5)));
for (let i = 0; i < 6; i++)
    unoPins.push(pin(`A${i}`, 16.51 + i * P, 24.13, 'analog', 8.5));
export function breadboardGroups(kind: PartKind): string[][] {
    if (kind !== 'breadboard-half' && kind !== 'breadboard-full')
        return [];
    const count = kind === 'breadboard-half' ? 30 : 63;
    const rails = kind === 'breadboard-half' ? 25 : 50;
    const groups: string[][] = [];
    for (let c = 1; c <= count; c++)
        for (const rows of ['abcde', 'fghij'])
            groups.push([...rows].map(r => `${r}${c}`));
    for (const r of ['tp', 'tn', 'bp', 'bn'])
        groups.push(Array.from({ length: rails }, (_, i) => `${r}${i + 1}`));
    return groups;
}
function breadboard(kind: 'breadboard-half' | 'breadboard-full'): PartDef {
    const n = kind === 'breadboard-half' ? 30 : 63, railN = n === 30 ? 25 : 50;
    const pins: PinDef[] = [];
    for (let r = 0; r < 10; r++)
        for (let c = 1; c <= n; c++)
            pins.push(pin(`${'abcdefghij'[r]}${c}`, (c - (n + 1) / 2) * P, (r < 5 ? r - 5.5 : r - 3.5) * P, 'hole'));
    for (const [row, z] of [['tp', -24.13], ['tn', -21.59], ['bp', 21.59], ['bn', 24.13]] as const)
        for (let c = 0; c < railN; c++)
            pins.push(pin(`${row}${c + 1}`, (c + Math.floor(c / 5) - (railN + railN / 5 - 2) / 2) * P, z, 'hole'));
    return def(kind, n === 30 ? '브레드보드 (하프)' : '브레드보드 (풀)', '보드', [n === 30 ? 83 : 165, 9, 55], pins);
}
export const RESISTOR_PRESETS = [100, 150, 220, 330, 470, 680, 1000, 1500, 2200, 3300, 4700, 6800, 10000, 15000, 22000, 33000, 47000, 68000, 100000, 220000, 1000000];
export const E12 = [10, 12, 15, 18, 22, 27, 33, 39, 47, 56, 68, 82];
export const E24 = [10, 11, 12, 13, 15, 16, 18, 20, 22, 24, 27, 30, 33, 36, 39, 43, 47, 51, 56, 62, 68, 75, 82, 91];
const ohms = {
    ...number('ohms', '저항', 220, 0.1, 1e9, 'Ω'),
    options: [...new Set([...RESISTOR_PRESETS, ...E24.flatMap(v => [v, v * 10, v * 100, v * 1000])])]
        .sort((a, b) => a - b)
        .map(value => ({ value, label: `${value} Ω` })),
};
export const PARTS: Record<PartKind, PartDef> = {
    'arduino-uno': def('arduino-uno', '아두이노 UNO R3', '보드', [68.58, 13, 53.34], unoPins),
    'breadboard-half': breadboard('breadboard-half'), 'breadboard-full': breadboard('breadboard-full'),
    led: def('led', 'LED', '출력', [5, 8, 5], line(['anode', 'cathode']), [choice('color', '색상', ['red', 'green', 'blue', 'yellow', 'white'])]),
    'rgb-led': def('rgb-led', 'RGB LED', '출력', [8, 9, 5], line(['R', 'common', 'G', 'B']), [choice('common', '공통 단자', ['cathode', 'anode'])]),
    resistor: def('resistor', '저항', '기본', [12, 3, 3], line(['1', '2'], 10.16), [ohms]),
    // 3 x 2 grid spacing: 7.62 across the centre trench, 5.08 along the board.
    pushbutton: def('pushbutton', '택트 버튼', '입력', [6, 5, 6], [pin('1', -2.54, -3.81), pin('2', 2.54, -3.81), pin('3', -2.54, 3.81), pin('4', 2.54, 3.81)], [], [pressed]),
    'slide-switch': def('slide-switch', '슬라이드 스위치', '입력', [9, 6, 4], line(['1', '2', '3']), [], [range('position', '스위치 위치', 0, 0, 1)]),
    potentiometer: def('potentiometer', '가변저항', '입력', [10, 12, 10], line(['1', 'wiper', '3']), [number('ohms', '전체 저항', 10000, 1, 1e7, 'Ω')], [range('position', '회전 위치', .5, 0, 1)]),
    photoresistor: def('photoresistor', '조도 센서 (CDS)', '센서', [5, 5, 3], line(['1', '2']), [], [range('lux', '밝기', 100, 1, 10000)]),
    buzzer: def('buzzer', '피에조 부저', '출력', [12, 9, 12], line(['+', '-'], 5.08)),
    // Servo pins are at the cable's female connector, not the motor body.
    servo: def('servo', '서보 모터 SG90', '출력', [23, 29, 12], line(['GND', 'V+', 'SIG']).map(p => ({ ...p, label: { GND: 'GND (갈색)', 'V+': 'V+ (빨강)', SIG: 'SIG (주황)' }[p.id]! }))),
    'hc-sr04': def('hc-sr04', '초음파 센서 HC-SR04', '센서', [45, 15, 20], line(['VCC', 'TRIG', 'ECHO', 'GND']), [], [range('distanceCm', '거리', 100, 2, 400)]),
    'lcd1602-i2c': def('lcd1602-i2c', 'I2C LCD 1602', '디스플레이', [80, 13, 36], line(['GND', 'VCC', 'SDA', 'SCL']), [choice('address', 'I2C 주소', [0x27, 0x3f])]),
    multimeter: def('multimeter', '멀티미터', '측정', [45, 15, 75], line(['COM', 'V', 'A'], 12.7), [choice('mode', '측정 모드', ['V', 'mA'])]),
    dht11: def('dht11', '온습도 센서 DHT11', '센서', [16, 12, 22], line(['VCC', 'DATA', 'GND']), [], [range('temperature', '온도 (°C)', 25, 0, 50), range('humidity', '습도 (%)', 50, 20, 90)]),
    joystick: def('joystick', '조이스틱', '입력', [34, 30, 26], line(['GND', '+5V', 'VRx', 'VRy', 'SW']), [], [range('x', '가로', .5, 0, 1), range('y', '세로', .5, 0, 1), pressed]),
    'seven-segment': def('seven-segment', '7세그먼트', '디스플레이', [12.7, 8, 19], [...line(['e', 'd', 'COM.1', 'c', 'dp']).map(p => ({ ...p, pos: [p.pos[0], 0, 7.62] as [
                number,
                number,
                number
            ] })), ...line(['g', 'f', 'COM.2', 'a', 'b']).map(p => ({ ...p, pos: [p.pos[0], 0, -7.62] as [
                number,
                number,
                number
            ] }))], [choice('common', '공통 단자', ['cathode', 'anode'])]),
    'neopixel-strip': def('neopixel-strip', 'NeoPixel LED 스트립', '디스플레이', [80, 3, 10], line(['DIN', '5V', 'GND']), [number('count', 'LED 개수', 8, 1, 16)]),
    l9110s: def('l9110s', 'L9110S 모터 드라이버', '출력', [29, 9, 21], [...line(['B-IA', 'B-IB', 'GND', 'VCC', 'A-IA', 'A-IB']).map(p => ({ ...p, pos: [p.pos[0], 0, -7.62] as [
                number,
                number,
                number
            ] })), ...line(['MA+', 'MA−', 'MB+', 'MB−'], 5.08).map(p => ({ ...p, pos: [p.pos[0], 0, 7.62] as [
                number,
                number,
                number
            ] }))]),
    'dc-motor': def('dc-motor', 'DC 모터', '출력', [25, 20, 20], line(['+', '-'], 5.08)),
};
export function partInternalConnections(kind: PartKind, inputs: Record<string, number | boolean> = {}): string[][] {
    if (kind === 'arduino-uno')
        return [['GND.1', 'GND.2', 'GND.3'], ['A4', 'SDA'], ['A5', 'SCL']];
    if (kind === 'pushbutton')
        return inputs.pressed ? [['1', '2', '3', '4']] : [['1', '2'], ['3', '4']];
    if (kind === 'seven-segment')
        return [['COM.1', 'COM.2']];
    if (kind === 'slide-switch')
        return [['2', Number(inputs.position ?? 0) < .5 ? '1' : '3']];
    if (kind === 'joystick' && inputs.pressed)
        return [['SW', 'GND']];
    return [];
}
