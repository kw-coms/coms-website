import type { PartDef, PartKind, PinDef, PropDef, SimInputDef } from '../types';
const P = 2.54;
const pin = (id: string, x: number, z: number, role: PinDef['role'] = 'passive', y = 0): PinDef => ({ id, label: id, pos: [x, y, z], role });
const line = (ids: string[], pitch = P): PinDef[] => ids.map((id, i) => pin(id, (i - (ids.length - 1) / 2) * pitch, 0));
const number = (key: string, label: string, value: number, min: number, max: number, unit?: string): PropDef => ({ key, label, type: 'number', default: value, min, max, unit });
const CHOICE_LABELS: Record<string, string> = {
    red: '빨강', green: '초록', blue: '파랑', yellow: '노랑', white: '흰색',
    cathode: '공통 음극', anode: '공통 양극', V: '전압 (V)', mA: '전류 (mA)', 'Ω': '저항 (Ω)', continuity: '도통',
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
    if (kind !== 'breadboard-half' && kind !== 'breadboard-full' && kind !== 'breadboard-mini')
        return [];
    const count = kind === 'breadboard-mini' ? 17 : kind === 'breadboard-half' ? 30 : 63;
    const rails = kind === 'breadboard-mini' ? 0 : kind === 'breadboard-half' ? 25 : 50;
    const groups: string[][] = [];
    for (let c = 1; c <= count; c++)
        for (const rows of ['abcde', 'fghij'])
            groups.push([...rows].map(r => `${r}${c}`));
    for (const r of rails ? ['tp', 'tn', 'bp', 'bn'] : [])
        groups.push(Array.from({ length: rails }, (_, i) => `${r}${i + 1}`));
    return groups;
}
function breadboard(kind: 'breadboard-half' | 'breadboard-full' | 'breadboard-mini'): PartDef {
    const n = kind === 'breadboard-mini' ? 17 : kind === 'breadboard-half' ? 30 : 63, railN = n === 17 ? 0 : n === 30 ? 25 : 50;
    const pins: PinDef[] = [];
    for (let r = 0; r < 10; r++)
        for (let c = 1; c <= n; c++)
            pins.push(pin(`${'abcdefghij'[r]}${c}`, (c - (n + 1) / 2) * P, (r < 5 ? r - 5.5 : r - 3.5) * P, 'hole'));
    for (const [row, z] of (railN ? [['tp', -24.13], ['tn', -21.59], ['bp', 21.59], ['bn', 24.13]] : []) as [string, number][])
        for (let c = 0; c < railN; c++)
            pins.push(pin(`${row}${c + 1}`, (c + Math.floor(c / 5) - (railN + railN / 5 - 2) / 2) * P, z, 'hole'));
    return def(kind, n === 17 ? '브레드보드 (미니)' : n === 30 ? '브레드보드 (하프)' : '브레드보드 (풀)', '보드', [n === 17 ? 47 : n === 30 ? 83 : 165, 9, n === 17 ? 35 : 55], pins);
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

const cap = (key: string, label: string, defaultValue: number, unit: string, presets: number[]) => ({
    ...number(key, label, defaultValue, .001, 100000, unit),
    options: presets.map(value => ({ value, label: `${value} ${unit}` })),
});
const dip = (ids: string[]): PinDef[] => {
    const half = ids.length / 2;
    return ids.map((id, i) => {
        const side = i < half ? -1 : 1;
        const row = i < half ? i : ids.length - 1 - i;
        return { ...pin(id, (row - (half - 1) / 2) * P, side * 3.81), label: id === '1' ? '1 • 핀 1' : id };
    });
};
const dipLabels: Partial<Record<PartKind, string[]>> = {
    'timer-555': ['GND','TRIG','OUT','RESET','CTRL','THRESH','DISCH','VCC'],
    'shift-register-595': ['QB','QC','QD','QE','QF','QG','QH','GND',"QH′",'MR','SHCP','STCP','OE','SER','QA','VCC'],
    l293d: ['EN1','IN1','OUT1','GND','GND','OUT2','IN2','VS','EN2','IN3','OUT3','GND','GND','OUT4','IN4','VSS'],
    'optocoupler-4n35': ['LED A','LED K','NC','E','C','B'],
    'logic-7400': ['1A','1B','1Y','2A','2B','2Y','GND','3Y','3A','3B','4Y','4A','4B','VCC'],
    'logic-7408': ['1A','1B','1Y','2A','2B','2Y','GND','3Y','3A','3B','4Y','4A','4B','VCC'],
    'logic-7432': ['1A','1B','1Y','2A','2B','2Y','GND','3Y','3A','3B','4Y','4A','4B','VCC'],
    'logic-7486': ['1A','1B','1Y','2A','2B','2Y','GND','3Y','3A','3B','4Y','4A','4B','VCC'],
    'logic-7404': ['1A','1Y','2A','2Y','3A','3Y','GND','4Y','4A','5Y','5A','6Y','6A','VCC'],
};
const logic = (kind: PartKind, title: string, count = 14) =>
    def(kind, title, 'IC', [count === 8 ? 10 : count === 14 ? 19 : 22, 5, 8],
        dip(Array.from({ length: count }, (_, i) => String(i + 1))).map((p, i) => ({
            ...p, label: `${p.id}${i === 0 ? ' • 핀 1' : ''} ${dipLabels[kind]?.[i] ?? ''}`.trim(),
        })));
const sensor3 = (kind: PartKind, title: string, input: SimInputDef) =>
    def(kind, title, '센서', [14, 8, 10], line(['VCC', 'OUT', 'GND']), [], [input]);

export const PARTS: Record<PartKind, PartDef> = {
    'arduino-uno': def('arduino-uno', '아두이노 UNO R3', '보드', [68.58, 13, 53.34], unoPins),
    'breadboard-half': breadboard('breadboard-half'), 'breadboard-full': breadboard('breadboard-full'),
    'breadboard-mini': breadboard('breadboard-mini'),
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
    multimeter: def('multimeter', '멀티미터', '측정', [45, 15, 75], line(['COM', 'V', 'A'], 12.7), [choice('mode', '측정 모드', ['V', 'mA', 'Ω', 'continuity'])]),
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
    'battery-9v': def('battery-9v', '9V 배터리', '전원', [26.5, 48.5, 17.5], line(['+', '-'], 10.16), [number('internalOhms', '내부 저항', 1.5, .05, 100, 'Ω')]),
    'battery-aa-pack': def('battery-aa-pack', 'AA 배터리 팩', '전원', [58, 18, 30], line(['+', '-'], 10.16), [choice('cells', '직렬 셀 수', [1, 2, 3, 4], 2)]),
    'coin-cell-3v': def('coin-cell-3v', '3V 코인 전지', '전원', [20, 3.2, 20], line(['+', '-'], 5.08), [number('internalOhms', '내부 저항', 15, 1, 100, 'Ω')]),
    'power-supply': def('power-supply', '가변 직류 전원공급기', '전원', [85, 60, 90], line(['OUT+', 'OUT-'], 12.7), [number('volts', '출력 전압', 5, 0, 30, 'V'), number('currentLimit', '전류 제한', 1, .01, 5, 'A')]),
    'capacitor-ceramic': def('capacitor-ceramic', '세라믹 커패시터', '기본', [5, 7, 4], line(['1', '2'], 5.08), [cap('capacitance', '정전용량', 100, 'nF', [1, 10, 22, 47, 100, 220, 470]), number('ratedVolts', '정격 전압', 50, 6, 1000, 'V')]),
    'capacitor-electrolytic': def('capacitor-electrolytic', '전해 커패시터', '기본', [10, 18, 10], line(['+', '-'], 5.08), [cap('capacitance', '정전용량', 100, 'µF', [1, 4.7, 10, 22, 47, 100, 220, 470, 1000]), number('ratedVolts', '정격 전압', 16, 6, 450, 'V')]),
    diode: def('diode', '정류 다이오드 1N4007', '반도체', [7, 3, 3], line(['A', 'K'], 10.16)),
    zener: def('zener', '제너 다이오드', '반도체', [7, 3, 3], line(['A', 'K'], 10.16), [number('vz', '제너 전압', 5.1, 2.4, 24, 'V')]),
    inductor: def('inductor', '인덕터', '기본', [12, 6, 6], line(['1', '2'], 10.16), [number('millihenries', '인덕턴스', 10, .01, 1000, 'mH'), number('seriesOhms', '권선 저항', 1, .01, 100, 'Ω')]),
    'dip-switch-4': def('dip-switch-4', '4채널 DIP 스위치', '입력', [12, 5, 10], dip(['1A', '2A', '3A', '4A', '4B', '3B', '2B', '1B']), [], [range('switches', '스위치 비트마스크', 0, 0, 15)]),
    'keypad-4x4': def('keypad-4x4', '4×4 매트릭스 키패드', '입력', [70, 4, 77], line(['1', '2', '3', '4', '5', '6', '7', '8']), [], [range('key', '키 번호 (0=해제)', 0, 0, 16)]),
    'tilt-switch': def('tilt-switch', '기울기 스위치', '입력', [8, 15, 5], line(['1', '2'], 5.08), [], [{ key: 'tilt', label: '기울임', type: 'momentary', default: false }]),
    tmp36: sensor3('tmp36', 'TMP36 온도 센서', range('temperature', '온도 (°C)', 25, -40, 125)),
    pir: sensor3('pir', 'PIR 동작 감지 센서', { key: 'motion', label: '움직임', type: 'momentary', default: false }),
    'flex-sensor': def('flex-sensor', '플렉스 센서', '센서', [57, 2, 7], line(['1', '2'], 5.08), [], [range('bend', '굽힘', 0, 0, 1)]),
    'force-sensor': def('force-sensor', '압력 센서 FSR', '센서', [18, 1, 38], line(['1', '2'], 5.08), [], [range('force', '누르는 힘', 0, 0, 100)]),
    'soil-moisture': def('soil-moisture', '토양 수분 센서', '센서', [20, 4, 60], line(['VCC', 'AO', 'DO', 'GND']), [], [range('moisture', '수분 (%)', 50, 0, 100)]),
    'gas-sensor': def('gas-sensor', 'MQ-2 가스 센서', '센서', [32, 25, 22], line(['VCC', 'AO', 'DO', 'GND']), [], [range('gas', '가스 농도 (%)', 0, 0, 100)]),
    'ir-receiver': def('ir-receiver', '적외선 수신기', '센서', [6, 9, 6], line(['OUT', 'GND', 'VCC']), [], [range('irCode', 'NEC 코드', 0, 0, 0xffffffff)]),
    'light-bulb': def('light-bulb', '소형 백열전구', '출력', [15, 25, 15], line(['1', '2'], 5.08), [number('ratedVolts', '정격 전압', 6, 1.5, 24, 'V'), number('ratedWatts', '정격 전력', .5, .05, 10, 'W')]),
    'vibration-motor': def('vibration-motor', '진동 모터', '출력', [10, 5, 8], line(['+', '-'], 5.08), [number('ratedVolts', '정격 전압', 3, 1.5, 6, 'V')]),
    gearmotor: def('gearmotor', '기어 모터', '출력', [70, 25, 25], line(['+', '-'], 5.08), [number('rpm', '무부하 회전수', 200, 20, 1000, 'rpm')]),
    'neopixel-ring': def('neopixel-ring', 'NeoPixel LED 링', '디스플레이', [45, 3, 45], line(['DIN', 'DOUT', '5V', 'GND']), [choice('count', 'LED 개수', [12, 16, 24], 12)]),
    'seven-segment-4digit': def('seven-segment-4digit', '4자리 7세그먼트', '디스플레이', [50, 12, 19], [...line(['e', 'd', 'dp', 'c', 'g', 'D4']).map(p => ({ ...p, pos: [p.pos[0], 0, 7.62] as [number, number, number] })), ...line(['b', 'D3', 'D2', 'f', 'a', 'D1']).map(p => ({ ...p, pos: [p.pos[0], 0, -7.62] as [number, number, number] }))], [choice('common', '공통 유형', ['cathode', 'anode'])]),
    'lcd1602-parallel': def('lcd1602-parallel', '병렬 LCD 1602', '디스플레이', [80, 13, 36], line(['VSS','VDD','VO','RS','RW','E','D0','D1','D2','D3','D4','D5','D6','D7','A','K']), [choice('mode', '데이터 모드', ['4-bit', '8-bit'], '4-bit')]),
    npn: def('npn', 'NPN 트랜지스터 2N2222', '반도체', [5, 5, 5], line(['E', 'B', 'C']), [number('beta', '전류 증폭률', 100, 20, 300)]),
    pnp: def('pnp', 'PNP 트랜지스터 2N2907', '반도체', [5, 5, 5], line(['E', 'B', 'C']), [number('beta', '전류 증폭률', 100, 20, 300)]),
    nmos: def('nmos', 'N-MOSFET IRLZ44N', '반도체', [10, 16, 5], line(['G', 'D', 'S']), [number('thresholdVolts', '문턱 전압', 2, .5, 4, 'V')]),
    tip120: def('tip120', '다즐링턴 TIP120', '반도체', [10, 16, 5], line(['B', 'C', 'E']), [number('beta', '전류 증폭률', 1000, 200, 2000)]),
    'relay-spdt': def('relay-spdt', 'SPDT 릴레이', '출력', [20, 17, 16], [...line(['COIL+', 'COIL-'], 5.08).map(p => ({ ...p, pos: [p.pos[0], 0, -7.62] as [number, number, number] })), ...line(['NC', 'COM', 'NO']).map(p => ({ ...p, pos: [p.pos[0], 0, 7.62] as [number, number, number] }))], [choice('coilVolts', '코일 정격 전압', [5, 12, 24], 5)]),
    l293d: logic('l293d', 'L293D 모터 드라이버', 16),
    'shift-register-595': logic('shift-register-595', '74HC595 시프트 레지스터', 16),
    'logic-7400': logic('logic-7400', '74HC00 NAND 게이트'),
    'logic-7408': logic('logic-7408', '74HC08 AND 게이트'),
    'logic-7432': logic('logic-7432', '74HC32 OR 게이트'),
    'logic-7486': logic('logic-7486', '74HC86 XOR 게이트'),
    'logic-7404': logic('logic-7404', '74HC04 NOT 게이트'),
    'timer-555': logic('timer-555', 'NE555 타이머', 8),
    'regulator-7805': def('regulator-7805', '7805 전압 조정기', 'IC', [10, 15, 5], line(['IN', 'GND', 'OUT'])),
    'optocoupler-4n35': def('optocoupler-4n35', '4N35 광커플러', 'IC', [9, 5, 8], dip(['1', '2', '3', '4', '5', '6']).map((p, i) => ({ ...p, label: `${p.id}${i === 0 ? ' • 핀 1' : ''} ${dipLabels['optocoupler-4n35']![i]}` })), [number('ctr', '전류 전달 비율', 100, 20, 300, '%')]),
    oscilloscope: def('oscilloscope', '2채널 오실로스코프', '측정', [140, 80, 95], line(['CH1', 'CH2', 'GND'], 12.7), [number('timeDiv', '시간/칸', 1, .001, 1000, 'ms'), number('voltsDiv', '전압/칸', 1, .01, 20, 'V'), number('trigger', '트리거 전압', 2.5, -30, 30, 'V')]),
    'function-generator': def('function-generator', '함수 발생기', '전원', [90, 60, 90], line(['OUT', 'GND'], 12.7), [choice('waveform', '파형', ['sine', 'square', 'triangle', 'sawtooth']), number('frequencyHz', '주파수', 1000, .01, 100000, 'Hz'), number('amplitudeVolts', '진폭', 2.5, 0, 15, 'V'), number('offsetVolts', '직류 오프셋', 2.5, -15, 15, 'V'), number('duty', '듀티비', 50, 1, 99, '%')]),
    'logic-analyzer': def('logic-analyzer', '8채널 로직 분석기', '측정', [100, 40, 70], line(['D0','D1','D2','D3','D4','D5','D6','D7','GND'], 5.08), [number('timeDiv', '시간/칸', 1, .001, 1000, 'ms')]),

};
export function partInternalConnections(kind: PartKind, inputs: Record<string, number | boolean> = {}): string[][] {
    if (kind === 'arduino-uno')
        return [['GND.1', 'GND.2', 'GND.3'], ['A4', 'SDA'], ['A5', 'SCL']];
    if (kind === 'pushbutton')
        return inputs.pressed ? [['1', '2', '3', '4']] : [['1', '2'], ['3', '4']];
    if (kind === 'l293d')
        return [['4', '5', '12', '13']];
    if (kind === 'seven-segment')
        return [['COM.1', 'COM.2']];
    if (kind === 'slide-switch')
        return [['2', Number(inputs.position ?? 0) < .5 ? '1' : '3']];
    if (kind === 'joystick' && inputs.pressed)
        return [['SW', 'GND']];
    return [];
}
