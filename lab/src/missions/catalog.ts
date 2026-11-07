import type { PartKind, Scene, PartInstance, Wire } from '../core/types';
import { EXAMPLES } from '../core/examples';
import type { Mission } from './types';

const part = (id: string, kind: PartKind, x: number, z: number, props: PartInstance['props'] = {}): PartInstance =>
  ({ id, kind, pos: [x, 0, z], rotY: 0, props });
const wire = (id: string, a: string, b: string): Wire => {
  const ref = (s: string) => { const i = s.indexOf('.'); return { partId: s.slice(0, i), pinId: s.slice(i + 1) }; };
  return { id, from: ref(a), to: ref(b), color: 'blue' };
};
const scene = (title: string, parts: PartInstance[], links: [string, string][], code: string): Scene =>
  ({ version: 2, title, parts, wires: links.map(([a, b], i) => wire(`w${i}`, a, b)), code: code.trim() + '\n', codeMode: 'text' });
const fromExample = (id: string, title: string, code?: string): Scene => {
  const source = EXAMPLES.find(e => e.id === id)?.scene;
  if (!source) throw new Error(`Missing core example: ${id}`);
  return { ...source, version: 2, title, code: code ?? source.code, codeMode: 'text' };
};
const withMission = (id: string, referenceScene: Scene): Scene => ({ ...structuredClone(referenceScene), mission: id });
const blank = (id: string, referenceScene: Scene): Scene => {
  const starter = structuredClone(referenceScene);
  starter.mission = id;
  starter.code = '// 코드를 작성해 보세요.\n';
  if (id === 'timer-555') starter.wires = starter.wires.filter(w => !(w.from.partId === 'ra' && w.to.partId === 'ic' && w.to.pinId === '7'));
  return starter;
};

const blink = fromExample('external-blink', 'LED 깜빡이기', `
void setup(){ pinMode(8, OUTPUT); }
void loop(){ digitalWrite(8,HIGH); delay(1000); digitalWrite(8,LOW); delay(1000); }
`);
const traffic = scene('세 가지 신호등', [part('uno','arduino-uno',-70,0), ...(['red','yellow','green'] as const).flatMap((color,i) => [part(color,'led',i*22,-30,{color}),part(`r${i}`,'resistor',i*22,-19,{ohms:220})])],
  [8,9,10].flatMap((pin,i):[string,string][] => [[`uno.D${pin}`,`r${i}.1`],[`r${i}.2`,`${['red','yellow','green'][i]}.anode`],[`${['red','yellow','green'][i]}.cathode`,'uno.GND.1']]), `
void setup(){for(int p=8;p<=10;p++) pinMode(p,OUTPUT);}
void loop(){digitalWrite(8,HIGH);delay(1000);digitalWrite(8,LOW);digitalWrite(9,HIGH);delay(300);digitalWrite(9,LOW);digitalWrite(10,HIGH);delay(1000);digitalWrite(10,LOW);}
`);
const button = fromExample('button-led','버튼으로 LED 토글',`
bool on=false; bool old=HIGH;
void setup(){pinMode(2,INPUT_PULLUP);pinMode(8,OUTPUT);}
void loop(){bool now=digitalRead(2);if(old==HIGH && now==LOW){on=!on;digitalWrite(8,on);delay(30);}old=now;}
`);
const pot = fromExample('pot-led','가변저항으로 밝기 바꾸기');
const alarm = fromExample('distance-alarm','10 cm 거리 경보기',EXAMPLES.find(e=>e.id==='distance-alarm')!.scene.code.replace('ALARM_CM = 20','ALARM_CM = 10').replace('pulseIn(ECHO_PIN, HIGH, 30000) / 58','(pulseIn(ECHO_PIN, HIGH, 30000) + 29) / 58').replace('cm < ALARM_CM','cm <= ALARM_CM'));
const tmp = scene('TMP36 온도계',[part('uno','arduino-uno',-70,0),part('sensor','tmp36',0,-30)], [['uno.5V','sensor.VCC'],['uno.GND.1','sensor.GND'],['sensor.OUT','uno.A0']],`
void setup(){Serial.begin(9600);}
void loop(){float c=analogRead(A0)*(5.0/1023.0)*100.0-50.0;Serial.print("TEMP:");Serial.println(c,1);delay(250);}
`);
const shift = scene('74HC595 흐르는 불빛',[part('uno','arduino-uno',-70,0),part('reg','shift-register-595',0,-30),...Array.from({length:8},(_,i)=>part(`led${i}`,'led',i*13,-65)),...Array.from({length:8},(_,i)=>part(`r${i}`,'resistor',i*13,-55,{ohms:220}))],
  [['uno.5V','reg.16'],['uno.GND.1','reg.8'],['uno.D8','reg.14'],['uno.D12','reg.11'],['uno.D11','reg.12'],['reg.13','uno.GND.1'],['reg.10','uno.5V'],...Array.from({length:8},(_,i):[string,string][]=>[[`reg.${i === 0 ? 15 : i}`,`r${i}.1`],[`r${i}.2`,`led${i}.anode`],[`led${i}.cathode`,'uno.GND.1']]).flat()],`
void setup(){pinMode(8,OUTPUT);pinMode(11,OUTPUT);pinMode(12,OUTPUT);}
void loop(){for(byte i=0;i<8;i++){digitalWrite(11,LOW);shiftOut(8,12,MSBFIRST,1<<i);digitalWrite(11,HIGH);delay(200);}}
`);
const motor = scene('트랜지스터 모터',[part('uno','arduino-uno',-70,0),part('q','npn',0,-30),part('motor','dc-motor',22,-30),part('baseR','resistor',-18,-30,{ohms:1000}),part('diode','diode',30,-15)],
  [['uno.D9','baseR.1'],['baseR.2','q.B'],['q.E','uno.GND.1'],['q.C','motor.-'],['motor.+','uno.5V'],['diode.A','motor.-'],['diode.K','motor.+']],`
void setup(){pinMode(9,OUTPUT);}
void loop(){analogWrite(9,180);delay(2000);analogWrite(9,0);delay(1000);}
`);
const keypad = scene('키패드 비밀번호',[part('uno','arduino-uno',-70,0),part('keys','keypad-4x4',0,-30),part('led','led',30,-30),part('r','resistor',20,-30,{ohms:220})],
  [...Array.from({length:4},(_,i):[string,string]=>[`uno.D${2+i}`,`keys.${i+1}`]),...Array.from({length:4},(_,i):[string,string]=>[`uno.D${6+i}`,`keys.${i+5}`]),['uno.D10','r.1'],['r.2','led.anode'],['led.cathode','uno.GND.1']],`
const byte rows[4]={2,3,4,5}, cols[4]={6,7,8,9};
const char keys[4][4]={{'1','2','3','A'},{'4','5','6','B'},{'7','8','9','C'},{'*','0','#','D'}};
String entered=""; bool held=false;
void setup(){for(byte i=0;i<4;i++){pinMode(rows[i],OUTPUT);digitalWrite(rows[i],HIGH);pinMode(cols[i],INPUT_PULLUP);}pinMode(10,OUTPUT);}
void loop(){char hit=0;for(byte r=0;r<4;r++){digitalWrite(rows[r],LOW);for(byte c=0;c<4;c++)if(!digitalRead(cols[c]))hit=keys[r][c];digitalWrite(rows[r],HIGH);}if(hit&&!held){entered+=hit;if(entered.length()>=4){digitalWrite(10,entered=="1234");entered="";}}held=hit;delay(20);}
`);
const timer = scene('아두이노 없는 555 점멸',[part('battery','battery-9v',-70,0),part('ic','timer-555',0,-30),part('ra','resistor',-35,-20,{ohms:1000}),part('rb','resistor',-20,-30,{ohms:68000}),part('cap','capacitor-electrolytic',0,-55,{capacitance:10}),part('led','led',35,-30),part('limit','resistor',22,-30,{ohms:1000})],
  [['battery.+','ic.8'],['battery.+','ic.4'],['battery.-','ic.1'],['battery.+','ra.1'],['ra.2','ic.7'],['ic.7','rb.1'],['rb.2','ic.2'],['rb.2','ic.6'],['rb.2','cap.+'],['cap.-','battery.-'],['ic.3','limit.1'],['limit.2','led.anode'],['led.cathode','battery.-']], 'void setup() {} void loop() {} // 555 회로는 MCU 없이 작동합니다.');
const simple = (id:string,title:string,story:string,goal:string,hints:string[],requiredParts:PartKind[],ref:Scene,checker:Mission['checker']):Mission => ({id,title,story,goal,hints,requiredParts,allowedParts:[...new Set(ref.parts.map(p=>p.kind))],starterScene:blank(id,ref),referenceScene:withMission(id,ref),checker});
const run=(ms:number)=>({kind:'run',ms} as const);
const expect=(partId:string,path:string,op:'eq'|'gte'|'lte'|'between',value:number|boolean|string,max?:number)=>({kind:'expectPart',partId,path,op,value,max} as const);
const trafficSamples: [number, 'red'|'yellow'|'green'][] = [[100,'red'],[750,'red'],[1100,'yellow'],[1220,'yellow'],[1450,'green'],[2050,'green'],[2450,'red'],[3400,'yellow'],[3700,'green']];
let previousSample = 0;
const trafficChecks: Mission['checker'] = trafficSamples.flatMap(([at,color]) => {
  const checks: Mission['checker'] = [run(at - previousSample), ...(['red','yellow','green'] as const).map(id => expect(id,'led.brightness',id === color ? 'gte' : 'lte',id === color ? .5 : .1))];
  previousSample = at;
  return checks;
});
export const MISSIONS: Mission[] = [
  simple('led-blink','LED 깜빡이기','첫 회로에 불을 붙여 보세요.','D8 LED를 1초마다 켜고 끄기',['LED 긴 다리가 양극입니다.','저항 220Ω을 직렬로 연결하세요.','HIGH/LOW 사이에 delay(1000)을 넣으세요.'],['arduino-uno','led','resistor'],blink,[run(4500),{kind:'expectTransitions',partId:'led',path:'led.brightness',threshold:.5,minTransitions:3,intervalMs:1000,tolerance:.2}]),
  simple('traffic-light','순서 지키는 신호등','건널목의 흐름을 설계하세요.','빨강→노랑→초록, 1초·0.3초·1초',['세 LED에 각자 저항을 연결하세요.','각 색에 서로 다른 핀을 쓰세요.','켜진 색을 끄고 다음 색을 켜세요.'],['arduino-uno','led','resistor'],traffic,[...trafficChecks,run(7000),{kind:'expectTransitions',partId:'red',path:'led.brightness',threshold:.5,minTransitions:4,highMs:1000,lowMs:1300,tolerance:.2},{kind:'expectTransitions',partId:'yellow',path:'led.brightness',threshold:.5,minTransitions:4,highMs:300,lowMs:2000,tolerance:.2},{kind:'expectTransitions',partId:'green',path:'led.brightness',threshold:.5,minTransitions:4,highMs:1000,lowMs:1300,tolerance:.2}]),
  simple('button-toggle','버튼으로 LED 토글','한 번 누를 때마다 상태가 바뀝니다.','누름 1회 ON, 2회 OFF',['INPUT_PULLUP을 쓰세요.','눌림은 LOW입니다.','이전 입력과 현재 입력을 비교하세요.'],['arduino-uno','pushbutton','led','resistor'],button,[run(100),expect('led','led.brightness','lte',.1),{kind:'setInput',partId:'button',key:'pressed',value:true},run(100),expect('led','led.brightness','gte',.5),run(100),expect('led','led.brightness','gte',.5),{kind:'setInput',partId:'button',key:'pressed',value:false},run(100),expect('led','led.brightness','gte',.5),{kind:'setInput',partId:'button',key:'pressed',value:true},run(100),expect('led','led.brightness','lte',.1)]),
  simple('pot-dimmer','가변저항으로 밝기','손잡이로 빛의 세기를 바꿔요.','A0 값에 따라 PWM 밝기가 변함',['가운데 단자는 wiper입니다.','PWM 핀 D9를 쓰세요.','analogRead의 0~1023을 0~255로 바꾸세요.'],['arduino-uno','potentiometer','led','resistor'],pot,[{kind:'setInput',partId:'pot',key:'position',value:.1},run(150),expect('led','led.brightness','lte',.3),{kind:'setInput',partId:'pot',key:'position',value:.9},run(150),expect('led','led.brightness','gte',.6)]),
  simple('distance-alarm','10cm 거리 경보기','가까이 오면 소리로 알려요.','10cm 이하에서 부저 ON',['TRIG에 10µs 펄스를 주세요.','ECHO HIGH 시간을 거리로 바꾸세요.','측정 실패인 0cm를 제외하세요.'],['arduino-uno','hc-sr04','buzzer'],alarm,[{kind:'setInput',partId:'sonar',key:'distanceCm',value:30},run(300),expect('piezo','buzzer.on','eq',false),{kind:'setInput',partId:'sonar',key:'distanceCm',value:10},run(300),expect('piezo','buzzer.on','eq',true),{kind:'setInput',partId:'sonar',key:'distanceCm',value:11},run(300),expect('piezo','buzzer.on','eq',false),{kind:'setInput',partId:'sonar',key:'distanceCm',value:8},run(300),expect('piezo','buzzer.on','eq',true)]),
  simple('tmp36-serial','TMP36 온도계','센서 전압을 사람이 읽는 온도로 바꿔요.','25°C에서 TEMP:25 시리얼 출력',['TMP36 출력은 0°C에서 0.5V입니다.','1°C마다 10mV씩 증가합니다.','Serial.begin(9600)을 먼저 호출하세요.'],['arduino-uno','tmp36'],tmp,[{kind:'setInput',partId:'sensor',key:'temperature',value:25},run(600),{kind:'expectSerialNumber',prefix:'TEMP:',min:24,max:26},{kind:'setInput',partId:'sensor',key:'temperature',value:40},run(600),{kind:'expectSerialNumber',prefix:'TEMP:',min:39,max:41}]),
  simple('shift-chase','74HC595 LED 흐르기','3개 핀으로 8개의 빛을 움직여요.','Q0~Q7 LED가 순서대로 점등',['SER로 데이터를 보내세요.','SRCLK로 한 비트씩 밀어 넣으세요.','RCLK 펄스로 출력에 반영하세요.'],['arduino-uno','shift-register-595','led','resistor'],shift,Array.from({length:8},(_,i):Mission['checker'] => [run(i===0?100:200),...Array.from({length:8},(_,j)=>expect(`led${j}`,'led.brightness',i===j?'gte':'lte',i===j?.5:.1))]).flat()),
  simple('transistor-motor','트랜지스터로 모터 구동','작은 핀 신호로 모터 전류를 제어해요.','D9 PWM으로 모터를 회전·정지',['베이스에 저항을 넣으세요.','모터는 컬렉터 쪽에 연결하세요.','플라이백 다이오드 방향을 확인하세요.'],['arduino-uno','npn','dc-motor','diode'],motor,[run(500),expect('motor','motor.rpm','gte',1),run(2200),expect('motor','motor.rpm','lte',1)]),
  simple('keypad-password','키패드 비밀번호','올바른 번호만 잠금을 엽니다.','1234 입력 시 LED 켜기',['행을 차례로 LOW로 스캔하세요.','열을 INPUT_PULLUP으로 읽으세요.','키를 뗄 때까지 중복 입력을 막으세요.'],['arduino-uno','keypad-4x4','led'],keypad,[run(100),expect('led','led.brightness','lte',.1),...['1','2','3','4'].flatMap(key=>[{kind:'setInput',partId:'keys',key:'key',value:Number(key)},run(70),{kind:'setInput',partId:'keys',key:'key',value:0},run(70)] as Mission['checker']),expect('led','led.brightness','lte',.1),...['1','2','3','5'].flatMap(key=>[{kind:'setInput',partId:'keys',key:'key',value:Number(key)},run(70),{kind:'setInput',partId:'keys',key:'key',value:0},run(70)] as Mission['checker']),expect('led','led.brightness','gte',.5)]),
  simple('timer-555','아두이노 없는 555 깜빡이','IC와 저항·커패시터만으로 발진기를 만듭니다.','LED가 약 1Hz로 점멸',['RA/RB와 커패시터로 주기를 정하세요.','TRIG와 THRESH를 연결하세요.','RESET을 전원에 연결하세요.'],['timer-555','capacitor-electrolytic','led'],timer,[run(5000),{kind:'expectTransitions',partId:'led',path:'led.brightness',threshold:.5,minTransitions:3,intervalMs:500,tolerance:.35}]),
];
