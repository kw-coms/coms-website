import type { Scene, PartKind, PartInstance, PinRef, RotY, Vec3, Wire, WireColor } from './types';
import { PARTS } from './parts';

type Example = { id: string; title: string; chapter?: string; scene: Scene };

// ---------------------------------------------------------------------------
// Bench layout (millimetres, Y up, breadboard top = 0; camera looks from +Z, so "back" = -Z)
//
//   back row : tall modules (LCD, HC-SR04, servo, motor...) stand behind UNO and breadboard
//   UNO      : left, digital header (D0-D13, SDA/SCL, GND) on the back edge, power + A0-A5 on the front edge
//   board    : half breadboard right of the UNO; rows a-e = back half, f-j = front half
//
// Wires are colour coded: 5V red, GND black, signals blue/green/yellow/orange/purple.
// Long power wires that must get from the UNO's front power header to the board's back
// rails run along the front edge and up the gap between UNO and board (see `feed`).
// ---------------------------------------------------------------------------
const BOARD_X = 4;
const UNO_X = -80;
const WIRE_Y = 12;
const BOARD_KIND = 'breadboard-half';

const code = (body: string) => body.trim() + '\n';

const rotate = (x: number, z: number, rotY: number): [number, number] => {
  const radians = rotY * Math.PI / 180;
  return [x * Math.cos(radians) + z * Math.sin(radians), -x * Math.sin(radians) + z * Math.cos(radians)];
};

const HOLES = new Map(PARTS[BOARD_KIND].pins.map(pin => [pin.id, [BOARD_X + pin.pos[0], pin.pos[2]] as const]));

class Builder {
  parts: PartInstance[] = [
    { id: 'uno', kind: 'arduino-uno', pos: [UNO_X, 0, 0], rotY: 0, props: {} },
    { id: 'board', kind: BOARD_KIND, pos: [BOARD_X, 0, 0], rotY: 0, props: {} },
  ];
  wires: Wire[] = [];
  private taken = new Set<string>();

  /** Plug a through-hole part into the breadboard so that its first pin sits in `hole`. */
  put(id: string, kind: PartKind, hole: string, props: PartInstance['props'] = {}, rotY: RotY = 0) {
    const pins = PARTS[kind].pins;
    const target = HOLES.get(hole);
    if (!target) throw new Error(`브레드보드에 ${hole} 구멍이 없습니다`);
    const [ox, oz] = rotate(pins[0]!.pos[0], pins[0]!.pos[2], rotY);
    const pos: Vec3 = [target[0] - ox, 0, target[1] - oz];
    for (const pin of pins.filter(pin => !(kind === 'l9110s' && pin.id.startsWith('M')))) {
      const [px, pz] = rotate(pin.pos[0], pin.pos[2], rotY);
      const found = [...HOLES].find(([, at]) => Math.hypot(pos[0] + px - at[0], pos[2] + pz - at[1]) <= 0.6);
      if (!found) throw new Error(`${id}.${pin.id} 핀이 구멍에 맞지 않습니다`);
      if (this.taken.has(found[0])) throw new Error(`${id}: ${found[0]} 구멍을 두 번 썼습니다`);
      this.taken.add(found[0]);
    }
    this.parts.push({ id, kind, pos, rotY, props });
    return this;
  }

  /** Stand a module that cannot go into a breadboard (LCD, HC-SR04, servo...) on the desk. */
  place(id: string, kind: PartKind, x: number, z: number, rotY: RotY = 0, props: PartInstance['props'] = {}) {
    this.parts.push({ id, kind, pos: [x, 0, z], rotY, props });
    return this;
  }

  /** wire('uno.D8', 'board.a2', 'orange', [[x, z], ...]) — the optional list routes the wire through corner points. */
  wire(from: string, to: string, color: WireColor, via: [number, number][] = []) {
    const ref = (text: string): PinRef => {
      const dot = text.indexOf('.');
      return { partId: text.slice(0, dot), pinId: text.slice(dot + 1) };
    };
    const bends = via.map(([x, z]): Vec3 => [x, WIRE_Y, z]);
    this.wires.push({ id: `w${this.wires.length + 1}`, from: ref(from), to: ref(to), color, ...(bends.length ? { bends } : {}) });
    return this;
  }

  /** Jumper from a breadboard hole up to the nearest hole of a power rail (tp/tn at the back, bp/bn at the front). */
  rail(hole: string, rail: 'tp' | 'tn' | 'bp' | 'bn', color: WireColor) {
    const x = HOLES.get(hole)![0];
    const nearest = [...HOLES].filter(([id]) => id.startsWith(rail)).sort((a, b) => Math.abs(a[1][0] - x) - Math.abs(b[1][0] - x))[0]!;
    return this.wire(`board.${hole}`, `board.${nearest[0]}`, color);
  }

  /**
   * UNO power header -> breadboard rails. Front rails: out past the front edge and along it.
   * Back rails: additionally up through the gap between UNO and breadboard.
   */
  feed(to: 'front5V' | 'frontGND' | 'back5V' | 'backGND') {
    const front = to.startsWith('front');
    const is5V = to.endsWith('5V');
    const pin = is5V ? '5V' : 'GND.2';
    const pinX = UNO_X + (is5V ? -3.81 + 3 * 2.54 : -3.81 + 4 * 2.54);
    const lane = is5V ? 31 : 34; // z of the run along the front edge
    const gap = is5V ? -43.5 : -40.5; // x of the run up the gap
    const rail = `${front ? 'b' : 't'}${is5V ? 'p' : 'n'}1`;
    const via: [number, number][] = front
      ? [[pinX, lane], [HOLES.get(rail)![0], lane]]
      : [[pinX, lane], [gap, lane], [gap, HOLES.get(rail)![1]]];
    return this.wire(`uno.${pin}`, `board.${rail}`, is5V ? 'red' : 'black', via);
  }

  /** D-pin -> 220 ohm -> LED -> GND, on the back half of the breadboard (columns col..col+5). */
  led(pin: string, wire: WireColor, id = 'led', col = 2) {
    return this.put(`res${id}`, 'resistor', `c${col}`, { ohms: 220 })
      .put(id, 'led', `e${col + 4}`)
      .wire(`uno.${pin}`, `board.a${col}`, wire)
      .rail(`a${col + 5}`, 'tn', 'black');
  }
}

function build(id: string, title: string, chapter: string, sketch: string, configure: (builder: Builder) => void): Example {
  const builder = new Builder();
  configure(builder);
  return {
    id,
    title,
    chapter,
    scene: { version: 1, title, parts: builder.parts, wires: builder.wires, code: code(sketch) },
  };
}

// Chapter names follow the 아두이노 기초 study page; pins match its wiring tables.
export const EXAMPLES: Example[] = [
  build('builtin-blink', '내장 LED 깜빡이기', 'LED 출력', `
// 내장 LED 깜빡이기: 보드에 달린 작은 LED(L)가 1초에 한 번 깜빡입니다.
// 부품을 연결하지 않아도 돼요. 실행을 누르고 UNO의 "L" LED를 보세요.
// 해 보기: delay() 안의 숫자(밀리초)를 바꿔 깜빡이는 속도를 바꿔 보세요.

void setup() {
  pinMode(LED_BUILTIN, OUTPUT);  // LED_BUILTIN = 보드 안의 LED가 연결된 핀 (UNO에서는 13번)
}

void loop() {
  digitalWrite(LED_BUILTIN, HIGH);  // 5V를 내보내 LED 켜기
  delay(500);                       // 500ms = 0.5초 기다리기
  digitalWrite(LED_BUILTIN, LOW);   // 0V로 내려 LED 끄기
  delay(500);
}
`, () => {}),

  build('external-blink', '외부 LED 깜빡이기', 'LED 출력', `
// 외부 LED 깜빡이기: 브레드보드에 꽂은 LED가 0.5초 간격으로 깜빡입니다.
// 연결: D8 -> 220Ω 저항 -> LED 긴 다리(+), LED 짧은 다리(-) -> GND
// 220Ω을 쓰는 이유: (5V - LED 약 2V) / 220Ω = 약 14mA. 저항이 없으면 전류가 너무 커서 LED와 핀이 망가져요.
// 해 보기: LED_PIN을 바꾸면(점퍼선도 함께 옮기세요) 다른 핀의 LED도 깜빡일 수 있어요.

const int LED_PIN = 8;  // 핀 번호에 이름을 붙여 두면 나중에 바꾸기 쉽습니다

void setup() {
  pinMode(LED_PIN, OUTPUT);
}

void loop() {
  digitalWrite(LED_PIN, HIGH);
  delay(500);
  digitalWrite(LED_PIN, LOW);
  delay(500);
}
`, b => {
    b.led('D8', 'orange').feed('backGND');
  }),

  build('button-led', '버튼으로 LED 켜기', '디지털 입력', `
// 버튼으로 LED 켜기: 버튼을 누르고 있는 동안만 LED가 켜집니다.
// 연결: 버튼 한쪽 다리 -> D2, 반대쪽 다리 -> GND / LED 회로는 이전 예제와 같아요 (D8 -> 220Ω -> LED -> GND)
// 해 보기: 버튼을 눌렀다 뗄 때 LED가 어떻게 변하는지 보고, 아래 코드의 LOW가 왜 "눌림"인지 생각해 보세요.

const int BTN_PIN = 2;
const int LED_PIN = 8;

void setup() {
  // INPUT_PULLUP: 아두이노 안의 풀업 저항이 핀을 5V 쪽으로 살짝 당겨 둡니다.
  // 그래서 버튼을 안 누르면 HIGH, 누르면 GND와 이어져 LOW가 됩니다. 눌림 = LOW (거꾸로예요!)
  pinMode(BTN_PIN, INPUT_PULLUP);
  pinMode(LED_PIN, OUTPUT);
}

void loop() {
  if (digitalRead(BTN_PIN) == LOW) {  // == 는 "같은가?"를 묻는 비교, = 는 값을 넣는 대입이에요
    digitalWrite(LED_PIN, HIGH);
  } else {
    digitalWrite(LED_PIN, LOW);
  }
}
`, b => {
    b.led('D8', 'orange')
      .put('button', 'pushbutton', 'e11')
      .wire('uno.D2', 'board.a11', 'green')
      .rail('j11', 'bn', 'black')
      .feed('frontGND')
      .feed('backGND');
  }),

  build('serial-hello', '시리얼 Hello', '시리얼 통신', `
// 시리얼 Hello: 1초마다 "Hello"를 컴퓨터로 보냅니다. 부품은 필요 없어요.
// 보낸 글자는 아래 "시리얼 모니터" 탭에서 볼 수 있습니다.
// 해 보기: println을 print로 바꾸면 줄바꿈이 사라지는 것을 확인해 보세요.

void setup() {
  Serial.begin(9600);  // 통신 속도(보레이트) 9600. 모니터의 속도와 같아야 글자가 깨지지 않아요
}

void loop() {
  Serial.println("Hello");  // println = 출력한 뒤 줄바꿈
  delay(1000);
}
`, () => {}),

  build('pot-led', '가변저항으로 LED 밝기', '아날로그 입력과 PWM', `
// 가변저항으로 LED 밝기 조절: 손잡이를 돌리는 만큼 LED가 밝아지거나 어두워집니다.
// 연결: 가변저항 양쪽 다리 -> 5V / GND, 가운데 다리 -> A0 / LED: D9 -> 220Ω -> LED -> GND
// 해 보기: 가변저항을 움직이며 아래 raw와 duty 값이 어떻게 따라 변하는지 생각해 보세요.

const int POT_PIN = A0;
const int LED_PIN = 9;  // ~ 표시가 있는 PWM 핀(3, 5, 6, 9, 10, 11)만 analogWrite로 밝기를 조절할 수 있어요

void setup() {
  pinMode(LED_PIN, OUTPUT);
}

void loop() {
  int raw = analogRead(POT_PIN);  // 0 ~ 1023: 0V ~ 5V를 1024단계로 읽은 값
  // analogWrite는 0 ~ 255까지만 받아요. map()으로 1023 -> 255 비율을 맞춰 줍니다.
  int duty = map(raw, 0, 1023, 0, 255);
  analogWrite(LED_PIN, duty);  // PWM: 핀을 아주 빠르게 켰다 껐다 하며 켜진 시간의 비율로 밝기를 만들어요
  delay(10);
}
`, b => {
    b.led('D9', 'orange')
      .put('pot', 'potentiometer', 'g4')
      .rail('j4', 'bp', 'red')
      .rail('j6', 'bn', 'black')
      .wire('uno.A0', 'board.i5', 'yellow')
      .feed('front5V')
      .feed('frontGND')
      .feed('backGND');
  }),

  build('night-light', '조도 센서 야간등', '아날로그 입력과 PWM', `
// 조도 센서 야간등: 주변이 어두울수록 LED가 밝아집니다.
// 연결: 5V -> CDS -> (A0) -> 10kΩ -> GND 로 이어지는 전압 분배 회로 / LED: D9 -> 220Ω -> LED -> GND
// 해 보기: 밝기 슬라이더를 낮춰 "어두운 방"을 만들어 보세요. 255 - 부분을 지우면 반대로 동작해요.

const int CDS_PIN = A0;
const int LED_PIN = 9;  // 밝기를 천천히 바꾸려고 PWM 핀을 썼어요

void setup() {
  pinMode(LED_PIN, OUTPUT);
}

void loop() {
  // CDS는 빛을 받을수록 저항이 작아지는 부품이에요. 그런데 아두이노는 저항이 아니라 "전압"을 읽습니다.
  // 그래서 10kΩ 저항과 직렬로 연결해(전압 분배) 저항의 변화를 A0 전압의 변화로 바꿔 줍니다.
  // CDS가 5V 쪽에 있으므로 밝을수록 값이 커져요 (밝음 = 큰 값, 어두움 = 작은 값).
  int light = analogRead(CDS_PIN);
  // 어두울수록 밝게 하려고 255에서 빼서 값을 뒤집습니다.
  analogWrite(LED_PIN, 255 - map(light, 0, 1023, 0, 255));
  delay(20);
}
`, b => {
    b.led('D9', 'orange')
      .put('cds', 'photoresistor', 'f4')
      .put('divider', 'resistor', 'h5', { ohms: 10000 })
      .rail('j4', 'bp', 'red')
      .wire('uno.A0', 'board.i5', 'yellow')
      .rail('j9', 'bn', 'black')
      .feed('front5V')
      .feed('frontGND')
      .feed('backGND');
  }),

  build('rgb-cycle', 'RGB LED 색 순환', 'PWM과 RGB LED', `
// RGB LED 색 순환: 빨강, 초록, 파랑이 차례로 0.5초씩 켜집니다.
// 연결: D9 / D10 / D11 -> 각각 220Ω 저항 -> RGB LED의 R / G / B 다리, 가장 긴 공통 다리 -> GND
// LED가 세 개 들어 있어서 저항도 세 개 필요해요. 공통 캐소드형이라 핀을 HIGH(255)로 하면 켜집니다.
// 해 보기: 두 색을 동시에 255로 켜서 노랑이나 보라 같은 섞인 색을 만들어 보세요.

const int pins[] = {9, 10, 11};  // 빨강, 초록, 파랑 (모두 ~ 표시가 있는 PWM 핀)

void setup() {
  for (int i = 0; i < 3; i++) {
    pinMode(pins[i], OUTPUT);
  }
}

void loop() {
  for (int i = 0; i < 3; i++) {
    analogWrite(pins[i], 255);  // i번째 색만 최대 밝기로
    delay(500);
    analogWrite(pins[i], 0);    // 다음 색으로 넘어가기 전에 끄기
  }
}
`, b => {
    b.put('rgb', 'rgb-led', 'e6')
      .put('rR', 'resistor', 'a2', { ohms: 220 })
      .put('rG', 'resistor', 'a12', { ohms: 220 }, 180)
      .put('rB', 'resistor', 'c13', { ohms: 220 }, 180)
      .wire('uno.D9', 'board.b2', 'orange')
      .wire('uno.D10', 'board.b12', 'green')
      .wire('uno.D11', 'board.b13', 'blue')
      .rail('a7', 'tn', 'black')
      .feed('backGND');
  }),

  build('servo-sweep', '서보 스윕', '서보 모터', `
// 서보 스윕: 서보 모터의 팔(혼)이 0도에서 180도까지 갔다가 되돌아옵니다.
// 연결: 서보 빨강선 -> 5V, 갈색선 -> GND, 주황선 -> D9 (각도 신호)
// 해 보기: delay(15)를 줄이면 빨라지고, 늘리면 천천히 움직여요.

#include <Servo.h>  // 서보를 쉽게 다루는 기본 라이브러리

Servo servo;
const int SERVO_PIN = 9;

void setup() {
  servo.attach(SERVO_PIN);  // 이 핀으로 각도를 알리는 펄스 신호를 보냅니다
}

void loop() {
  for (int angle = 0; angle <= 180; angle++) {  // 0도 -> 180도
    servo.write(angle);
    delay(15);  // 서보가 그 각도까지 움직일 시간을 줍니다
  }
  for (int angle = 180; angle >= 0; angle--) {  // 180도 -> 0도
    servo.write(angle);
    delay(15);
  }
}
`, b => {
    b.place('servo', 'servo', -44, -40)
      .wire('uno.D9', 'servo.SIG', 'orange')
      .wire('servo.V+', 'board.tp3', 'red')
      .wire('servo.GND', 'board.tn3', 'black')
      .feed('back5V')
      .feed('backGND');
  }),

  build('melody', '피에조 멜로디', '소리 출력', `
// 피에조 멜로디: 도, 미, 솔, 높은 도를 차례로 연주합니다.
// 연결: 부저 + -> D8, 부저 - -> GND
// 해 보기: notes 숫자(주파수, Hz)를 바꿔 나만의 멜로디를 만들어 보세요. 숫자가 클수록 높은 소리예요.

const int BUZZER_PIN = 8;
const int notes[] = {262, 330, 392, 523};  // 도 미 솔 높은도
const int NOTE_COUNT = sizeof(notes) / sizeof(notes[0]);  // 배열 전체 크기 / 한 칸 크기 = 음 개수

void setup() {
  pinMode(BUZZER_PIN, OUTPUT);
}

void loop() {
  for (int i = 0; i < NOTE_COUNT; i++) {
    // tone(핀, 주파수, 길이): 소리를 "시작만" 시키고 바로 다음 줄로 넘어갑니다.
    tone(BUZZER_PIN, notes[i], 250);
    delay(300);  // 소리(250ms)가 끝날 때까지 기다리고 조금 쉽니다
  }
  delay(500);
}
`, b => {
    b.put('piezo', 'buzzer', 'c3')
      .wire('uno.D8', 'board.a3', 'orange')
      .rail('a5', 'tn', 'black')
      .feed('backGND');
  }),

  build('ultrasonic', '초음파 거리 측정', '초음파 센서', `
// 초음파 거리 측정: HC-SR04로 앞 물체까지의 거리(cm)를 재서 시리얼 모니터에 보여 줍니다.
// 연결: VCC -> 5V, TRIG -> D7, ECHO -> D6, GND -> GND
// 해 보기: 거리 슬라이더나 3D 화면의 장애물 상자를 움직이며 숫자가 따라오는지 보세요.

const int TRIG_PIN = 7;
const int ECHO_PIN = 6;

void setup() {
  Serial.begin(9600);
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
}

void loop() {
  // 1) TRIG를 10µs 동안 HIGH로 만들면 센서가 초음파를 쏩니다. 먼저 2µs 동안 LOW로 안정시켜요.
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  // 2) ECHO가 HIGH인 시간 = 소리가 갔다가 돌아오는 데 걸린 시간(µs).
  //    30000µs 안에 안 돌아오면 포기하고 0을 돌려줘요.
  long us = pulseIn(ECHO_PIN, HIGH, 30000);

  // 3) 소리는 1cm를 약 29µs에 가요 (0.034cm/µs). 갔다 오는 왕복이라서
  //    거리 = 시간 * 0.034 / 2 이고, 이것은 시간 / 58 과 거의 같습니다. (0이 나오면 "반사가 없다"는 뜻)
  Serial.println(us / 58.0);
  delay(200);
}
`, b => {
    b.place('sonar', 'hc-sr04', -44, -42, 180)
      .wire('uno.D7', 'sonar.TRIG', 'green')
      .wire('uno.D6', 'sonar.ECHO', 'blue')
      .wire('sonar.VCC', 'board.tp3', 'red')
      .wire('sonar.GND', 'board.tn3', 'black')
      .feed('back5V')
      .feed('backGND');
  }),

  build('lcd-counter', 'I2C LCD 인사 + 카운터', 'I2C LCD', `
// I2C LCD 인사 + 카운터: 첫 줄에 인사말, 둘째 줄에 1초마다 1씩 커지는 숫자를 보여 줍니다.
// 연결: LCD GND -> GND, VCC -> 5V, SDA -> A4, SCL -> A5 (I2C는 데이터선 SDA와 박자선 SCL, 선 두 개로 통신)
// 해 보기: "Hello COMs!" 대신 내 이름을 띄워 보세요.

#include <Wire.h>               // I2C 통신을 위한 기본 라이브러리
#include <LiquidCrystal_I2C.h>  // I2C LCD를 쉽게 쓰게 해 주는 라이브러리

// 맨 앞의 0x27은 LCD의 I2C 주소예요. 제품에 따라 0x3F인 것도 있고, 주소가 틀리면 화면에 아무것도 안 나옵니다.
// 뒤의 16, 2는 16칸 x 2줄이라는 뜻이에요.
LiquidCrystal_I2C lcd(0x27, 16, 2);

int count = 0;

void setup() {
  lcd.init();       // LCD 준비
  lcd.backlight();  // 뒤쪽 불빛 켜기
  lcd.print("Hello COMs!");
}

void loop() {
  lcd.setCursor(0, 1);  // setCursor(칸, 줄): 줄 번호는 0부터라서 1이 둘째 줄이에요
  lcd.print(count);
  count++;
  lcd.print("    ");  // 숫자 자리수가 줄어도 이전 글자가 남지 않게 빈칸으로 덮어써요
  delay(1000);
}
`, b => {
    b.place('lcd', 'lcd1602-i2c', -52, -50)
      .wire('uno.SDA', 'lcd.SDA', 'blue')
      .wire('uno.SCL', 'lcd.SCL', 'yellow')
      .wire('lcd.VCC', 'board.tp3', 'red')
      .wire('lcd.GND', 'board.tn3', 'black')
      .feed('back5V')
      .feed('backGND');
  }),

  build('distance-alarm', '거리 경보기', '초음파 센서', `
// 거리 경보기: 물체가 20cm 안으로 들어오면 LED가 켜지고 부저가 울립니다.
// 연결: 초음파 TRIG -> D7, ECHO -> D6 / 부저 + -> D8 / LED: D4 -> 220Ω -> LED -> GND
// 해 보기: ALARM_CM 값을 바꿔 경보가 울리는 거리를 조절해 보세요.

const int TRIG_PIN = 7;
const int ECHO_PIN = 6;
const int BUZZER_PIN = 8;
const int LED_PIN = 4;
const int ALARM_CM = 20;  // 이 거리보다 가까우면 경보

void setup() {
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  pinMode(LED_PIN, OUTPUT);
}

void loop() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);  // 10µs 동안 HIGH = "초음파 쏴!"
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  // 돌아온 왕복 시간(µs)을 58로 나누면 cm가 됩니다. 시간 안에 안 돌아오면 0이 나와요.
  long cm = pulseIn(ECHO_PIN, HIGH, 30000) / 58;

  // cm > 0 은 "측정 실패(0)"를 걸러 내는 조건이에요. 빼면 반사가 없을 때 0cm로 착각해서 경보가 울려요.
  if (cm > 0 && cm < ALARM_CM) {
    digitalWrite(LED_PIN, HIGH);
    tone(BUZZER_PIN, 1000);  // 1000Hz 소리를 계속 냅니다
  } else {
    digitalWrite(LED_PIN, LOW);
    noTone(BUZZER_PIN);
  }
  delay(60);  // 측정 사이에 쉬어야 앞 초음파의 메아리가 다음 측정에 섞이지 않아요
}
`, b => {
    b.led('D4', 'purple')
      .put('piezo', 'buzzer', 'c12')
      .place('sonar', 'hc-sr04', -44, -42, 180)
      .wire('uno.D8', 'board.a12', 'orange')
      .rail('a14', 'tn', 'black')
      .wire('uno.D7', 'sonar.TRIG', 'green')
      .wire('uno.D6', 'sonar.ECHO', 'blue')
      .wire('sonar.VCC', 'board.tp3', 'red')
      .wire('sonar.GND', 'board.tn3', 'black')
      .feed('back5V')
      .feed('backGND');
  }),

  build('dht-lcd', '온습도', '온습도 센서', `
// 온습도: DHT11 센서로 온도와 습도를 재서 LCD와 시리얼 모니터에 함께 보여 줍니다.
// 연결: DHT11 DATA -> D2, VCC -> 5V, GND -> GND / LCD: SDA -> A4, SCL -> A5, VCC -> 5V, GND -> GND
// 해 보기: 온도·습도 슬라이더를 움직이고 2초쯤 뒤 화면의 숫자가 바뀌는지 보세요.

#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <DHT.h>  // DHT 온습도 센서 라이브러리 (Adafruit)

const int DHT_PIN = 2;
DHT dht(DHT_PIN, DHT11);             // 센서 종류는 DHT11
LiquidCrystal_I2C lcd(0x27, 16, 2);  // I2C 주소 0x27 (제품에 따라 0x3F)

void setup() {
  Serial.begin(9600);
  dht.begin();
  lcd.init();
  lcd.backlight();
}

void loop() {
  float t = dht.readTemperature();  // 섭씨 온도
  float h = dht.readHumidity();     // 상대 습도(%)

  // 읽기에 실패하면 숫자가 아닌 NaN이 돌아와요. isnan()으로 확인하고, 실패하면 이번 바퀴는 건너뜁니다.
  if (!isnan(t) && !isnan(h)) {
    Serial.print(t);
    Serial.print(" C ");
    Serial.println(h);
    lcd.clear();
    lcd.print("Temp:");
    lcd.print(t);
    lcd.setCursor(0, 1);
    lcd.print("Humidity:");
    lcd.print(h);
  }
  delay(2000);  // DHT11은 느려서 1초에 한 번보다 자주 읽으면 안 돼요 (여유 있게 2초)
}
`, b => {
    b.put('dht', 'dht11', 'c3')
      .place('lcd', 'lcd1602-i2c', -52, -50)
      .wire('uno.D2', 'board.a4', 'green')
      .rail('a3', 'tp', 'red')
      .rail('a5', 'tn', 'black')
      .wire('uno.SDA', 'lcd.SDA', 'blue')
      .wire('uno.SCL', 'lcd.SCL', 'yellow')
      .wire('lcd.VCC', 'board.tp3', 'red')
      .wire('lcd.GND', 'board.tn3', 'black')
      .feed('back5V')
      .feed('backGND');
  }),

  build('joystick-direction', '조이스틱 방향', '조이스틱', `
// 조이스틱 방향: 스틱을 기울이는 방향(왼쪽/오른쪽, 위/아래)과 누름 버튼을 시리얼 모니터로 보여 줍니다.
// 연결: GND -> GND, +5V -> 5V, VRx -> A0, VRy -> A1, SW -> D7
// 해 보기: 시리얼 모니터를 열고 스틱을 움직여 보세요. 가운데에서는 CENTER라고 나옵니다.

const int X_PIN = A0;
const int Y_PIN = A1;
const int SW_PIN = 7;

void setup() {
  Serial.begin(9600);
  pinMode(SW_PIN, INPUT_PULLUP);  // 스틱을 누르면 GND와 이어져 LOW (버튼과 같은 방식)
}

void loop() {
  // 조이스틱은 가변저항 두 개예요. 가운데에 두면 약 512, 한쪽 끝은 0, 반대쪽 끝은 1023에 가까워요.
  int x = analogRead(X_PIN);
  int y = analogRead(Y_PIN);

  // 딱 512만 CENTER로 하면 손이 떨릴 때마다 값이 바뀌어서, 300 ~ 700 사이는 모두 CENTER로 봅니다.
  Serial.print(x < 300 ? "LEFT" : x > 700 ? "RIGHT" : "CENTER");
  Serial.print(' ');
  Serial.print(y < 300 ? "DOWN" : y > 700 ? "UP" : "CENTER");
  Serial.println(digitalRead(SW_PIN) == LOW ? " PRESSED" : "");
  delay(100);
}
`, b => {
    b.place('stick', 'joystick', -52, 52, 180)
      .wire('uno.5V', 'stick.+5V', 'red')
      .wire('uno.GND.2', 'stick.GND', 'black')
      .wire('uno.A0', 'stick.VRx', 'green')
      .wire('uno.A1', 'stick.VRy', 'blue')
      .wire('uno.D7', 'stick.SW', 'yellow');
  }),

  build('seven-count', '7세그먼트 0–9 카운트', '7세그먼트', `
// 7세그먼트 0-9 카운트: 숫자 0부터 9까지 1초마다 하나씩 보여 줍니다.
// 연결: D2 ~ D8 -> 각각 220Ω 저항 -> 세그먼트 a ~ g, 공통(COM) 핀 -> GND (공통 캐소드형)
// 해 보기: delay(1000)을 줄여 빠른 시계처럼 만들어 보세요.

// 숫자 하나를 비트 7개로 적은 표예요. 비트 0 = 세그먼트 a, ... 비트 6 = 세그먼트 g 이고, 1이면 켭니다.
// 예) 0x06 = 0b0000110 -> b, c만 켜서 숫자 "1"
const byte digits[10] = {
  0x3F,  // 0
  0x06,  // 1
  0x5B,  // 2
  0x4F,  // 3
  0x66,  // 4
  0x6D,  // 5
  0x7D,  // 6
  0x07,  // 7
  0x7F,  // 8
  0x6F   // 9
};
const int pins[] = {2, 3, 4, 5, 6, 7, 8};  // 세그먼트 a b c d e f g 가 연결된 핀 순서

void setup() {
  for (int s = 0; s < 7; s++) {
    pinMode(pins[s], OUTPUT);
  }
}

void loop() {
  for (int n = 0; n < 10; n++) {
    for (int s = 0; s < 7; s++) {
      digitalWrite(pins[s], bitRead(digits[n], s));  // bitRead(값, 번호): 그 값의 번호번째 비트(0 또는 1)
    }
    delay(1000);
  }
}
`, b => {
    // Resistors sit in the back half next to the D pins; short jumpers carry each segment over to the digit.
    b.put('digit', 'seven-segment', 'g24');
    const segments = [
      // segment, D pin, resistor hole (pin 1), segment hole it feeds
      ['g', 'D8', 'a2', 'e24'], ['f', 'D7', 'c4', 'e25'], ['e', 'D6', 'a7', 'h24'], ['d', 'D5', 'c9', 'h25'],
      ['c', 'D4', 'a12', 'h27'], ['b', 'D3', 'a17', 'e28'], ['a', 'D2', 'c18', 'e27'],
    ] as const;
    const colors: WireColor[] = ['orange', 'yellow', 'green', 'blue', 'purple', 'white', 'gray'];
    segments.forEach(([segment, pin, hole, target], index) => {
      const column = Number(hole.slice(1));
      b.put(`r${segment}`, 'resistor', hole, { ohms: 220 })
        .wire(`uno.${pin}`, `board.b${column}`, colors[index]!)
        .wire(`board.e${column + 4}`, `board.${target}`, colors[index]!);
    });
    b.rail('e26', 'tn', 'black').feed('backGND');
  }),

  build('neopixel-rainbow', 'NeoPixel 무지개', 'NeoPixel', `
// NeoPixel 무지개: 8개의 LED가 무지개 색으로 바뀌며 흘러갑니다.
// 연결: DIN -> D6, 5V -> 5V, GND -> GND (데이터선 한 줄로 8개를 모두 제어해요)
// 해 보기: setBrightness의 숫자(0 ~ 255)를 바꿔 밝기를 조절해 보세요.

#include <Adafruit_NeoPixel.h>

const int PIXEL_PIN = 6;
const int NUM_PIXELS = 8;

// NEO_GRB: 이 LED는 색 데이터를 초록(G) - 빨강(R) - 파랑(B) 순서로 받아요 (RGB가 아니에요!).
// NEO_KHZ800: 데이터를 800kHz 속도로 보냅니다. 대부분의 NeoPixel이 이 방식이에요.
Adafruit_NeoPixel strip(NUM_PIXELS, PIXEL_PIN, NEO_GRB + NEO_KHZ800);

void setup() {
  strip.begin();
  strip.setBrightness(40);  // 0 ~ 255. 전부 최대로 켜면 전류도 많이 흐르고 눈도 부셔서 낮춰 둡니다
  strip.show();             // show()를 불러야 실제 LED에 반영돼요. 처음에는 모두 끕니다
}

void loop() {
  for (int j = 0; j < 256; j++) {  // 색을 조금씩 밀어서 무지개가 흘러가게 해요
    for (int i = 0; i < NUM_PIXELS; i++) {
      // 색상(Hue)은 0 ~ 65535가 한 바퀴인 색 동그라미 위의 위치예요.
      // 픽셀마다 65536 / 8씩 어긋나게 주면 8개가 무지개 한 바퀴를 나눠 가집니다.
      uint16_t hue = (i * 65536L / NUM_PIXELS + j * 256) & 65535;
      // gamma32: 사람 눈에 자연스러운 밝기로 보정
      strip.setPixelColor(i, strip.gamma32(strip.ColorHSV(hue)));
    }
    strip.show();
    delay(20);
  }
}
`, b => {
    b.place('pixels', 'neopixel-strip', -50, -46, 0, { count: 8 })
      .wire('uno.D6', 'pixels.DIN', 'green')
      .wire('pixels.5V', 'board.tp3', 'red')
      .wire('pixels.GND', 'board.tn3', 'black')
      .feed('back5V')
      .feed('backGND');
  }),

  build('motor-direction', '모터 속도·방향', 'DC 모터', `
// 모터 속도·방향: DC 모터가 앞으로 돌다가, 반대로 돌다가, 멈추기를 반복합니다.
// 연결: 드라이버 A-IA -> D5, A-IB -> D6 / 모터 -> 드라이버 MOTOR-A 두 단자 / VCC, GND -> 모터 전원
// 왜 드라이버? 핀 하나(최대 40mA)로는 모터의 큰 전류를 줄 수 없어서, 신호는 아두이노가 보내고 전류는 드라이버가 공급해요.
// 해 보기: 160, 200(속도, 0 ~ 255)을 바꿔 보세요. 여기서는 5V를 썼지만 실제로는 건전지 같은 별도 전원을 씁니다.

const int IA_PIN = 5;  // L9110S 입력 A-IA (PWM 핀)
const int IB_PIN = 6;  // L9110S 입력 A-IB (PWM 핀)

// 방향표:  A-IA     A-IB     동작
//          PWM값    LOW      앞으로 (값이 클수록 빠르게)
//          LOW      PWM값    뒤로
//          LOW      LOW      멈춤

void setup() {
  pinMode(IA_PIN, OUTPUT);
  pinMode(IB_PIN, OUTPUT);
}

void loop() {
  analogWrite(IA_PIN, 160);  // 앞으로, 중간 속도
  digitalWrite(IB_PIN, LOW);
  delay(2000);

  digitalWrite(IA_PIN, LOW);
  analogWrite(IB_PIN, 200);  // 뒤로, 조금 더 빠르게
  delay(2000);

  digitalWrite(IA_PIN, LOW);  // 둘 다 LOW: 멈춤
  digitalWrite(IB_PIN, LOW);
  delay(500);
}
`, b => {
    b.place('driver', 'l9110s', -44, -42, 180)
      .place('motor', 'dc-motor', -44, -66)
      .wire('uno.D5', 'driver.A-IA', 'green')
      .wire('uno.D6', 'driver.A-IB', 'blue')
      .wire('driver.VCC', 'board.tp3', 'red')
      .wire('driver.GND', 'board.tn3', 'black')
      .wire('driver.MA+', 'motor.+', 'orange')
      .wire('driver.MA−', 'motor.-', 'purple')
      .feed('back5V')
      .feed('backGND');
  }),
];
