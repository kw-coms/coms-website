import type { PartKind, Scene, WireColor } from './types';
import { PARTS } from './parts';

export type LabExample = { id: string; title: string; chapter: string; scene: Scene };
type Item = [string, PartKind, Record<string, number | string | boolean>?];
type Link = [string, string, WireColor];
const layout = (items: Item[]) => {
  const widths = Array.from({length: 4}, (_, col) => Math.max(12, ...items.filter((_, i) => i % 4 === col).map(([, kind]) => PARTS[kind].size[0])));
  const heights = Array.from({length: Math.ceil(items.length / 4)}, (_, row) => Math.max(12, ...items.slice(row * 4, row * 4 + 4).map(([, kind]) => PARTS[kind].size[2])));
  return items.map((_, index): [number, number, number] => {
    const col = index % 4, row = Math.floor(index / 4);
    return [20 + widths.slice(0, col).reduce((a, b) => a + b + 12, 0) + widths[col]! / 2, 0,
      -70 + heights.slice(0, row).reduce((a, b) => a + b + 12, 0) + heights[row]! / 2];
  });
};
const create = (id: string, title: string, chapter: string, sketch: string, items: Item[], links: Link[]): LabExample => ({
  id, title, chapter,
  scene: {
    version: 2, title, codeMode: 'text', code: sketch.trim() + '\n',
    parts: [
      ...(['timer-555-blink', 'rc-oscilloscope', 'regulator-7805'].includes(id) ? [] : [{ id: 'uno', kind: 'arduino-uno' as const, pos: [-80, 0, 0] as [number, number, number], rotY: 0 as const, props: {} }]),
      ...items.map(([partId, kind, props], index) => ({
        id: partId, kind, props: props ?? {}, rotY: 0 as const,
        pos: layout(items)[index]!,
      })),
    ],
    wires: links.map(([from, to, color], index) => {
      const [fromPart, ...fromPin] = from.split('.');
      const [toPart, ...toPin] = to.split('.');
      return { id: `w${index + 1}`, from: { partId: fromPart!, pinId: fromPin.join('.') }, to: { partId: toPart!, pinId: toPin.join('.') }, color };
    }),
  },
});
const rail = (id: string, positive = 'VCC', ground = 'GND'): Link[] => [
  ['uno.5V', `${id}.${positive}`, 'red'], ['uno.GND.2', `${id}.${ground}`, 'black'],
];
const led = (pin: string, id = 'led'): Link[] => [
  [`uno.${pin}`, `${id}R.1`, 'blue'], [`${id}R.2`, `${id}.anode`, 'orange'], [`${id}.cathode`, 'uno.GND.1', 'black'],
];
const ledItems = (id = 'led'): Item[] => [[`${id}R`, 'resistor', { ohms: 220 }], [id, 'led']];

export const V2_EXAMPLES: LabExample[] = [
  create('transistor-motor', '트랜지스터로 모터 구동', '반도체', `
// D9가 HIGH이면 베이스 전류가 흐르고 2N2222가 모터 전류를 스위칭합니다.
// 역기전력은 모터 양단의 다이오드로 흘려 트랜지스터를 보호합니다.
void setup() { pinMode(9, OUTPUT); }
void loop() { digitalWrite(9, HIGH); delay(1000); digitalWrite(9, LOW); delay(1000); }
`, [['baseR','resistor',{ohms:1000}], ['q','npn'], ['motor','dc-motor'], ['fly','diode']], [
  ['uno.D9','baseR.1','blue'], ['baseR.2','q.B','orange'], ['q.E','uno.GND.1','black'],
  ['uno.5V','motor.+','red'], ['motor.-','q.C','green'], ['fly.K','motor.+','red'], ['fly.A','motor.-','green'],
  ]),
  create('relay-lamp', '릴레이로 램프 켜기', '릴레이', `
// 코일에 전원을 주면 COM이 NO 접점으로 옮겨 램프를 켭니다.
// 코일에는 역방향 다이오드를 병렬로 붙여 역기전력을 흡수합니다.
void setup() { pinMode(8, OUTPUT); }
void loop() { digitalWrite(8, HIGH); delay(1000); digitalWrite(8, LOW); delay(1000); }
`, [['r','relay-spdt'],['q','npn'],['br','resistor',{ohms:1000}],['fly','diode'],['bulb','light-bulb'],['battery','battery-9v']], [
  ['uno.D8','br.1','blue'],['br.2','q.B','orange'],['q.E','uno.GND.1','black'],['uno.5V','r.COIL+','red'],['r.COIL-','q.C','green'],
  ['fly.K','r.COIL+','red'],['fly.A','r.COIL-','green'],['battery.+','r.COM','red'],['r.NO','bulb.1','orange'],['bulb.2','battery.-','black'],
  ]),
  create('shift-register-eight', '74HC595로 LED 8개', 'IC', `
// 데이터 한 비트씩 밀어 넣고 래치하면 8개 출력이 동시에 바뀝니다.
const byte DATA=2, CLOCK=3, LATCH=4;
void setup() { pinMode(DATA,OUTPUT); pinMode(CLOCK,OUTPUT); pinMode(LATCH,OUTPUT); }
void loop() { for(byte n=0;n<8;n++){ digitalWrite(LATCH,LOW); shiftOut(DATA,CLOCK,MSBFIRST,byte(1<<n)); digitalWrite(LATCH,HIGH); delay(250); } }
`, [['ic','shift-register-595'], ...Array.from({length:8},(_,i): Item => [`r${i}`,'resistor',{ohms:330}]), ...Array.from({length:8},(_,i): Item => [`led${i}`,'led'])], [
  ['uno.5V','ic.16','red'],['uno.GND.2','ic.8','black'],['uno.GND.1','ic.13','black'],['uno.5V','ic.10','red'],
  ['uno.D2','ic.14','blue'],['uno.D3','ic.11','green'],['uno.D4','ic.12','orange'],
  ...[15,1,2,3,4,5,6,7].flatMap((pin,i):Link[]=>[[`ic.${pin}`,`r${i}.1`,'purple'],[`r${i}.2`,`led${i}.anode`,'orange'],[`led${i}.cathode`,'uno.GND.3','black']]),
  ]),
  create('timer-555-blink', '555 깜빡이 (아두이노 없이)', 'IC', `
// 555의 2·6번을 묶고 R1·R2·C로 충방전 시간을 만듭니다.
// 주파수는 약 1.44 / ((R1 + 2 × R2) × C) 입니다.
void setup() {} void loop() {}
`, [['battery','battery-9v'],['ic','timer-555'],['r1','resistor',{ohms:1000}],['r2','resistor',{ohms:10000}],['c','capacitor-electrolytic',{capacitance:100}],['lr','resistor',{ohms:470}],['led','led']], [
  ['battery.+','ic.8','red'],['battery.+','ic.4','red'],['battery.-','ic.1','black'],['battery.+','r1.1','red'],['r1.2','ic.7','orange'],['ic.7','r2.1','orange'],
  ['r2.2','ic.6','blue'],['ic.6','ic.2','blue'],['ic.6','c.+','blue'],['c.-','battery.-','black'],['ic.3','lr.1','green'],['lr.2','led.anode','orange'],['led.cathode','battery.-','black'],
  ]),
  create('rc-oscilloscope', '커패시터 충전·방전 관찰', 'RC 회로', `
// 사각파를 RC 회로에 넣고 CH1과 CH2의 파형을 비교해 보세요.
// 저항 10kΩ × 커패시터 100µF = 시간상수 약 1초입니다.
void setup() {} void loop() {}
`, [['gen','function-generator',{waveform:'square',frequencyHz:0.5,amplitudeVolts:2.5,offsetVolts:2.5}],['r','resistor',{ohms:10000}],['c','capacitor-electrolytic',{capacitance:100}],['scope','oscilloscope',{timeDiv:500,trigger:2.5}]], [
  ['gen.OUT','r.1','orange'],['r.2','c.+','green'],['c.-','gen.GND','black'],['scope.CH1','gen.OUT','blue'],['scope.CH2','c.+','purple'],['scope.GND','gen.GND','black'],
  ]),
  create('regulator-7805', '7805로 5V 만들기', '전원', `
// 9V 배터리를 7805 입력에 연결하고 출력 5V를 LED로 확인합니다.
// 입력 전압이 약 7V 아래면 5V를 유지할 수 없습니다.
void setup() {} void loop() {}
`, [['battery','battery-9v'],['reg','regulator-7805'],['r','resistor',{ohms:330}],['led','led']], [
  ['battery.+','reg.IN','red'],['battery.-','reg.GND','black'],['reg.OUT','r.1','red'],['r.2','led.anode','orange'],['led.cathode','battery.-','black'],
  ]),
  create('tmp36-thermometer', 'TMP36 온도계', '온도 센서', `
// TMP36은 0°C에서 0.5V, 1°C마다 0.01V씩 올라갑니다.
void setup() { Serial.begin(9600); }
void loop() { float volts=analogRead(A0)*5.0/1023.0; float c=(volts-0.5)*100.0; Serial.println(c); delay(500); }
`, [['sensor','tmp36']], [...rail('sensor','VCC','GND'),['sensor.OUT','uno.A0','blue']]),
  create('pir-alarm', 'PIR 움직임 경보', '움직임 센서', `
// PIR의 OUT이 HIGH인 동안 경보 LED를 켭니다.
void setup() { pinMode(2,INPUT); pinMode(8,OUTPUT); }
void loop() { digitalWrite(8,digitalRead(2)); delay(20); }
`, [['sensor','pir'],...ledItems()], [...rail('sensor'),['sensor.OUT','uno.D2','blue'],...led('D8')]),
  create('keypad-password', '키패드 비밀번호', '키패드', `
// 행을 하나씩 LOW로 당기고 열의 LOW를 읽어 눌린 키를 찾습니다.
// 열(6~9)은 INPUT_PULLUP: 키를 누르지 않으면 내부 풀업 저항이 HIGH로 잡아 줍니다.
// 선택되지 않은 행(2~5)도 INPUT_PULLUP으로 둡니다. INPUT(풀업 없음)으로 두면
// 핀이 어디에도 연결되지 않은 채 떠 있어(플로팅) 노이즈가 들어오고, 눌린 키를 통해
// 다른 행의 떠 있는 값이 열로 새어 오작동할 수 있습니다.
// 선택된 행만 OUTPUT LOW로 바꾸므로 눌린 키의 열만 LOW가 됩니다.
const byte rowPins[4]={2,3,4,5}, colPins[4]={6,7,8,9};
const char keys[4][4]={{'1','2','3','A'},{'4','5','6','B'},{'7','8','9','C'},{'*','0','#','D'}};
char entered[5]={0}; byte count=0;
void setup(){ for(byte r=0;r<4;r++)pinMode(rowPins[r],INPUT_PULLUP); for(byte c=0;c<4;c++)pinMode(colPins[c],INPUT_PULLUP); pinMode(13,OUTPUT); }
void loop(){ for(byte r=0;r<4;r++){ for(byte i=0;i<4;i++)pinMode(rowPins[i],INPUT_PULLUP); pinMode(rowPins[r],OUTPUT); digitalWrite(rowPins[r],LOW); for(byte c=0;c<4;c++)if(digitalRead(colPins[c])==LOW){ char k=keys[r][c]; if(count<4)entered[count++]=k; if(count==4){ digitalWrite(13,entered[0]=='1'&&entered[1]=='2'&&entered[2]=='3'&&entered[3]=='4'); count=0; } while(digitalRead(colPins[c])==LOW) delay(5); delay(20); } } }
`, [['pad','keypad-4x4']], [
  ...Array.from({length:4},(_,i):Link=>[`uno.D${i+2}`,`pad.${i+1}`,'blue']),...Array.from({length:4},(_,i):Link=>[`uno.D${i+6}`,`pad.${i+5}`,'green']),
  ]),
  create('ir-remote-led', 'IR 리모컨 LED', '적외선 입력', `
// 리모컨의 NEC 펄스열이 들어오면 LED 상태를 반전합니다.
// 수신기는 평소 HIGH이고 신호 동안 LOW입니다.
// pulseIn은 이미 시작된 펄스를 건너뜁니다. 헤더 뒤에는 현재 레벨의 길이를 직접 잽니다.
unsigned long currentPulse(byte level, unsigned long timeout) {
  unsigned long start=micros();
  while(digitalRead(2)==level) { if(micros()-start>=timeout) return 0; }
  return micros()-start;
}
void setup(){ pinMode(2,INPUT_PULLUP); pinMode(8,OUTPUT); }
void loop(){
  if(pulseIn(2,LOW,100000)>8000 && currentPulse(HIGH,10000)>4000){
    unsigned long code=0; bool valid=true;
    for(byte i=0;i<32;i++){
      unsigned long mark=currentPulse(LOW,2000), space=currentPulse(HIGH,3000);
      if(mark<300 || space<300) valid=false;
      code|=(unsigned long)(space>1000)<<i;
    }
    if(valid && ((code>>16)&255)==0x18) digitalWrite(8,!digitalRead(8));
  }
}
`, [['ir','ir-receiver'],...ledItems()], [...rail('ir'),['ir.OUT','uno.D2','blue'],...led('D8')]),
  create('four-digit-counter', '4자리 FND 카운터', '디스플레이', `
// 한 자리씩 빠르게 선택해 4자리 숫자가 동시에 켜진 것처럼 보입니다.
const byte seg[7]={2,3,4,5,6,7,8}, digit[4]={9,10,11,12};
const byte glyph[10]={0x3F,0x06,0x5B,0x4F,0x66,0x6D,0x7D,0x07,0x7F,0x6F};
void setup(){ for(byte i=0;i<7;i++)pinMode(seg[i],OUTPUT); for(byte i=0;i<4;i++)pinMode(digit[i],OUTPUT); }
void loop(){ unsigned int number=millis()/1000%10000; for(byte d=0;d<4;d++){ for(byte i=0;i<4;i++)digitalWrite(digit[i],HIGH); unsigned int n=number; for(byte i=0;i<3-d;i++)n/=10; n%=10; for(byte s=0;s<7;s++)digitalWrite(seg[s],(glyph[n]>>s)&1); digitalWrite(digit[d],LOW); delay(2); } }
`, [['display','seven-segment-4digit'],...Array.from({length:7},(_,i):Item=>[`r${i}`,'resistor',{ohms:330}])], [
  ...'abcdefg'.split('').flatMap((s,i):Link[]=>[[`uno.D${i+2}`,`r${i}.1`,'blue'],[`r${i}.2`,`display.${s}`,'orange']]),
  ...Array.from({length:4},(_,i):Link=>[`uno.D${i+9}`,`display.D${i+1}`,'green']),
  ]),
  create('l293d-direction', 'L293D 모터 방향', '모터 드라이버', `
// EN을 켜고 IN1/IN2를 반대로 바꾸면 모터 방향이 바뀝니다.
void setup(){ pinMode(2,OUTPUT); pinMode(3,OUTPUT); pinMode(4,OUTPUT); }
void loop(){ digitalWrite(2,HIGH); digitalWrite(3,HIGH); digitalWrite(4,LOW); delay(1000); digitalWrite(3,LOW); digitalWrite(4,HIGH); delay(1000); }
`, [['driver','l293d'],['motor','dc-motor']], [
  ['uno.5V','driver.16','red'],['uno.5V','driver.8','red'],['uno.GND.1','driver.4','black'],['uno.GND.1','driver.5','black'],
  ['uno.D2','driver.1','blue'],['uno.D3','driver.2','green'],['uno.D4','driver.7','orange'],['driver.3','motor.+','purple'],['driver.6','motor.-','yellow'],
  ]),
  create('logic-truth-table', '논리 게이트 진리표', '논리 IC', `
// DIP 스위치 두 개로 입력을 바꾸고 AND 게이트 출력을 확인합니다.
// A와 B가 모두 HIGH일 때만 LED가 켜집니다.
void setup() {} void loop() {}
`, [['dip','dip-switch-4'],['ic','logic-7408'],['r','resistor',{ohms:330}],['led','led'],['pullA','resistor',{ohms:10000}],['pullB','resistor',{ohms:10000}]], [
  ['uno.5V','ic.14','red'],['uno.GND.1','ic.7','black'],['uno.5V','dip.1A','red'],['uno.5V','dip.2A','red'],
  ['dip.1B','ic.1','blue'],['dip.2B','ic.2','green'],['ic.1','pullA.1','blue'],['pullA.2','uno.GND.1','black'],['ic.2','pullB.1','green'],['pullB.2','uno.GND.1','black'],['ic.3','r.1','orange'],['r.2','led.anode','purple'],['led.cathode','uno.GND.2','black'],
  ]),
];
