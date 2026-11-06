import type { Scene, PartKind, PartInstance, WireColor, PinRef } from './types';
import { PARTS } from './parts';
const code = (body: string) => body.trim() + '\n';
type Example = { id: string; title: string; chapter?: string; scene: Scene };
function build(id: string, title: string, chapter: string, sketch: string, configure: (b: Builder)=>void): Example { const b=new Builder(); configure(b); return {id,title,chapter,scene:{version:1,title,parts:b.parts,wires:b.wires,code:code(sketch)}}; }
class Builder {
 parts: PartInstance[]=[{id:'uno',kind:'arduino-uno',pos:[-80,0,0],rotY:0,props:{}},{id:'board',kind:'breadboard-half',pos:[30,0,0],rotY:0,props:{}}];
 wires: {id:string;from:PinRef;to:PinRef;color:WireColor}[]=[];
 private occupied = new Set<string>();
 add(id:string,kind:PartKind, col:number,row=0,props:Record<string,string|number|boolean>={}) {
  const holes=PARTS['breadboard-half'].pins.filter(pin=>/^[a-j]\d+$/.test(pin.id));
  const pins=PARTS[kind].pins;
  const lead=pins[0];
  if(!lead) throw new Error(`예제 부품 핀이 없습니다: ${kind}`);
  const targetX=((Math.min(col,7)*4)-15.5)*2.54;
  const targetZ=row*8 + (col>7?8:0);
  const candidates=holes.slice().sort((a,b)=>Math.hypot(a.pos[0]-targetX,a.pos[2]-targetZ)-Math.hypot(b.pos[0]-targetX,b.pos[2]-targetZ));
  for(const hole of candidates) {
   const pos:[number,number,number]=[30+hole.pos[0]-lead.pos[0],hole.pos[1]-lead.pos[1],hole.pos[2]-lead.pos[2]];
   const insertions=pins.flatMap(pin=>holes.filter(h=>Math.hypot(pos[0]+pin.pos[0]-30-h.pos[0],pos[2]+pin.pos[2]-h.pos[2])<=0.6).map(h=>h.id));
   if(insertions.some(h=>this.occupied.has(h))) continue;
   insertions.forEach(h=>this.occupied.add(h));
   this.parts.push({id,kind,pos,rotY:0,props}); return this;
  }
  throw new Error(`예제 부품을 배치할 구멍이 없습니다: ${kind}`);
 }
 wire(from:string,to:string,color?:WireColor) { const [a,b]=[from,to].map(s=>{const i=s.indexOf('.'); return {partId:s.slice(0,i),pinId:s.slice(i+1)};}); this.wires.push({id:`w${this.wires.length+1}`,from:a!,to:b!,color:color ?? (from.endsWith('.5V') || to.endsWith('.5V') ? 'red' : from.includes('GND') || to.includes('GND') ? 'black' : 'blue')}); return this; }
 power(id:string,v='VCC',g='GND') { return this.wire(`uno.5V`,`${id}.${v}`,'red').wire(`uno.GND.1`,`${id}.${g}`,'black'); }
 led(pin:string,id='led',col=1,row=0) { return this.add(`res${id}`,'resistor',col,row,{ohms:220}).add(id,'led',col+1,row).wire(`uno.${pin}`,`res${id}.1`).wire(`res${id}.2`,`${id}.anode`).wire(`${id}.cathode`,'uno.GND.1','black'); }
}
// Chapter names follow lesson topics because the referenced study HTML is absent in this checkout.
export const EXAMPLES: Example[] = [
 build('builtin-blink','내장 LED 깜빡이기','LED 출력',`void setup(){pinMode(LED_BUILTIN,OUTPUT);} void loop(){digitalWrite(LED_BUILTIN,HIGH);delay(500);digitalWrite(LED_BUILTIN,LOW);delay(500);}`,()=>{}),
 build('external-blink','외부 LED 깜빡이기','LED 출력',`const int LED=13; void setup(){pinMode(LED,OUTPUT);} void loop(){digitalWrite(LED,HIGH);delay(500);digitalWrite(LED,LOW);delay(500);}`,b=>b.led('D13')),
 build('button-led','버튼으로 LED 켜기','디지털 입력',`const int BTN=2, LED=13; void setup(){pinMode(BTN,INPUT_PULLUP);pinMode(LED,OUTPUT);} void loop(){digitalWrite(LED,digitalRead(BTN)==LOW);}`,b=>b.led('D13').add('button','pushbutton',4).wire('uno.D2','button.1').wire('button.3','uno.GND.1','black')),
 build('serial-hello','시리얼 Hello','시리얼 통신',`void setup(){Serial.begin(9600);} void loop(){Serial.println("Hello");delay(1000);}`,()=>{}),
 build('pot-led','가변저항으로 LED 밝기','아날로그 입력과 PWM',`void setup(){pinMode(9,OUTPUT);} void loop(){analogWrite(9,map(analogRead(A0),0,1023,0,255));delay(10);}`,b=>b.led('D9').add('pot','potentiometer',4).wire('uno.5V','pot.1','red').wire('uno.GND.1','pot.3','black').wire('pot.wiper','uno.A0')),
 build('night-light','조도 센서 야간등','아날로그 입력과 PWM',`void setup(){pinMode(9,OUTPUT);} void loop(){int light=analogRead(A0);analogWrite(9,255-map(light,0,1023,0,255));delay(20);}`,b=>b.led('D9').add('cds','photoresistor',4).add('divider','resistor',5,0,{ohms:10000}).wire('uno.5V','cds.1','red').wire('cds.2','uno.A0').wire('cds.2','divider.1').wire('divider.2','uno.GND.1','black')),
 build('rgb-cycle','RGB LED 색 순환','PWM과 RGB LED',`const int pins[]={9,10,11}; void setup(){for(int p:pins)pinMode(p,OUTPUT);} void loop(){for(int i=0;i<3;i++){analogWrite(pins[i],255);delay(500);analogWrite(pins[i],0);}}`,b=>{b.add('rgb','rgb-led',5);(['R','G','B'] as const).forEach((p,i)=>b.add(`r${p}`,'resistor',i+1,0,{ohms:220}).wire(`uno.D${9+i}`,`r${p}.1`).wire(`r${p}.2`,`rgb.${p}`));b.wire('rgb.common','uno.GND.1','black');}),
 build('servo-sweep','서보 스윕','서보 모터',`#include <Servo.h>\nServo servo; void setup(){servo.attach(9);} void loop(){for(int a=0;a<=180;a++){servo.write(a);delay(15);}for(int a=180;a>=0;a--){servo.write(a);delay(15);}}`,b=>b.add('servo','servo',3).wire('uno.5V','servo.V+','red').wire('uno.GND.1','servo.GND','black').wire('uno.D9','servo.SIG')),
 build('melody','피에조 멜로디','소리 출력',`int notes[]={262,330,392,523}; void setup(){} void loop(){for(int n:notes){tone(8,n,250);delay(300);}delay(500);}`,b=>b.add('piezo','buzzer',3).wire('uno.D8','piezo.+').wire('uno.GND.1','piezo.-','black')),
 build('ultrasonic','초음파 거리 측정','초음파 센서',`const int TRIG=7,ECHO=6; void setup(){Serial.begin(9600);pinMode(TRIG,OUTPUT);pinMode(ECHO,INPUT);} void loop(){digitalWrite(TRIG,LOW);delayMicroseconds(2);digitalWrite(TRIG,HIGH);delayMicroseconds(10);digitalWrite(TRIG,LOW);long us=pulseIn(ECHO,HIGH,30000);Serial.println(us/58.0);delay(200);}`,b=>b.add('sonar','hc-sr04',3).power('sonar').wire('uno.D7','sonar.TRIG').wire('uno.D6','sonar.ECHO')),
 build('lcd-counter','I2C LCD 인사 + 카운터','I2C LCD',`#include <Wire.h>\n#include <LiquidCrystal_I2C.h>\nLiquidCrystal_I2C lcd(0x27,16,2); void setup(){lcd.init();lcd.backlight();lcd.print("Hello COMs!");} void loop(){static int n=0;lcd.setCursor(0,1);lcd.print(n++);lcd.print("    ");delay(1000);}`,b=>b.add('lcd','lcd1602-i2c',3).power('lcd').wire('uno.SDA','lcd.SDA').wire('uno.SCL','lcd.SCL')),
 build('distance-alarm','거리 경보기','초음파 센서',`const int T=7,E=6; void setup(){pinMode(T,OUTPUT);pinMode(E,INPUT);pinMode(13,OUTPUT);} void loop(){digitalWrite(T,HIGH);delayMicroseconds(10);digitalWrite(T,LOW);long cm=pulseIn(E,HIGH,30000)/58;if(cm>0&&cm<20){digitalWrite(13,HIGH);tone(8,1000);}else{digitalWrite(13,LOW);noTone(8);}delay(60);}`,b=>b.led('D13').add('sonar','hc-sr04',4).add('piezo','buzzer',6).power('sonar').wire('uno.D7','sonar.TRIG').wire('uno.D6','sonar.ECHO').wire('uno.D8','piezo.+').wire('uno.GND.1','piezo.-','black')),
 build('dht-lcd','온습도','온습도 센서',`#include <Wire.h>\n#include <LiquidCrystal_I2C.h>\n#include <DHT.h>\nDHT dht(2,DHT11); LiquidCrystal_I2C lcd(0x27,16,2); void setup(){Serial.begin(9600);dht.begin();lcd.init();lcd.backlight();} void loop(){float t=dht.readTemperature(),h=dht.readHumidity();if(!isnan(t)&&!isnan(h)){Serial.print(t);Serial.print(" C ");Serial.println(h);lcd.clear();lcd.print("Temp:");lcd.print(t);lcd.setCursor(0,1);lcd.print("Humidity:");lcd.print(h);}delay(2000);}`,b=>b.add('dht','dht11',3).add('lcd','lcd1602-i2c',6).power('dht').power('lcd').wire('uno.D2','dht.DATA').wire('uno.SDA','lcd.SDA').wire('uno.SCL','lcd.SCL')),
 build('joystick-direction','조이스틱 방향','조이스틱',`void setup(){Serial.begin(9600);pinMode(2,INPUT_PULLUP);} void loop(){int x=analogRead(A0),y=analogRead(A1);Serial.print(x<400?"LEFT":x>600?"RIGHT":"CENTER");Serial.print(' ');Serial.print(y<400?"DOWN":y>600?"UP":"CENTER");Serial.println(digitalRead(2)==LOW?" PRESSED":"");delay(100);}`,b=>b.add('stick','joystick',3).wire('uno.5V','stick.+5V','red').wire('uno.GND.1','stick.GND','black').wire('uno.A0','stick.VRx').wire('uno.A1','stick.VRy').wire('uno.D2','stick.SW')),
 build('seven-count','7세그먼트 0–9 카운트','7세그먼트',`const byte digits[10]={0x3F,0x06,0x5B,0x4F,0x66,0x6D,0x7D,0x07,0x7F,0x6F}; const int pins[]={2,3,4,5,6,7,8}; void setup(){for(int p:pins)pinMode(p,OUTPUT);} void loop(){for(int n=0;n<10;n++){for(int s=0;s<7;s++)digitalWrite(pins[s],bitRead(digits[n],s));delay(1000);}}`,b=>{b.add('digit','seven-segment',9);['a','b','c','d','e','f','g'].forEach((s,i)=>b.add(`r${s}`,'resistor',i+1,0,{ohms:220}).wire(`uno.D${i+2}`,`r${s}.1`).wire(`r${s}.2`,`digit.${s}`));b.wire('digit.COM.1','uno.GND.1','black');}),
 build('neopixel-rainbow','NeoPixel 무지개','NeoPixel',`#include <Adafruit_NeoPixel.h>\nAdafruit_NeoPixel strip(8,6,NEO_GRB+NEO_KHZ800); void setup(){strip.begin();strip.show();} void loop(){for(int j=0;j<256;j++){for(int i=0;i<8;i++)strip.setPixelColor(i,strip.gamma32(strip.ColorHSV((i*65536L/8+j*256)&65535)));strip.show();delay(20);}}`,b=>b.add('pixels','neopixel-strip',3,0,{count:8}).wire('uno.5V','pixels.5V','red').wire('uno.GND.1','pixels.GND','black').wire('uno.D6','pixels.DIN')),
 build('motor-direction','모터 속도·방향','DC 모터',`const int IA=5,IB=6; void setup(){pinMode(IA,OUTPUT);pinMode(IB,OUTPUT);} void loop(){analogWrite(IA,160);digitalWrite(IB,LOW);delay(2000);digitalWrite(IA,LOW);analogWrite(IB,200);delay(2000);digitalWrite(IA,LOW);digitalWrite(IB,LOW);delay(500);}`,b=>b.add('driver','l9110s',3).add('motor','dc-motor',5).power('driver').wire('uno.D5','driver.A-IA').wire('uno.D6','driver.A-IB').wire('driver.MA+','motor.+').wire('driver.MA−','motor.-')),
];
