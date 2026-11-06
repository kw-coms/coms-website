import { expect, it } from 'vitest';
import { LCD1602, DHT11Protocol, HCSR04Protocol, WS2812Protocol, servoAngleFromPulseUs } from './protocols';
function clock() {
 let now=0; const events:{at:number; fn:()=>void}[]=[];
 return { get now(){return now}, schedule(fn:()=>void,delay:number){events.push({at:now+delay,fn})}, advance(to:number){while(true){events.sort((a,b)=>a.at-b.at);const e=events[0];if(!e||e.at>to)break;events.shift();now=e.at;e.fn();}now=to;} };
}
it('LiquidCrystal_I2C 초기화와 Hi 쓰기, 주소 ACK',()=>{
 const lcd=new LCD1602(0x27); const nibble=(n:number,rs=false)=>{const b=(n<<4)|8|(rs?1:0); expect(lcd.writeI2c(0x27,b|4)).toBe(true);lcd.writeI2c(0x27,b);};
 expect(lcd.writeI2c(0x3f,0)).toBe(false);
 [3,3,3,2].forEach(n=>nibble(n)); const byte=(v:number,rs=false)=>{nibble(v>>4,rs);nibble(v&15,rs)};
 byte(0x28);byte(0x0c);byte(0x01);byte(0x80);byte('H'.charCodeAt(0),true);byte('i'.charCodeAt(0),true);
 expect(lcd.visual().lines[0]).toBe('Hi'+' '.repeat(14));byte(0xc0);byte('!'.charCodeAt(0),true);expect(lcd.visual().lines[1].startsWith('!')).toBe(true);
});
it('DHT11 응답은 80/80 µs와 40비트 checksum을 보낸다',()=>{
 const c=clock(), edges:{at:number;level:number}[]=[];
 const d=new DHT11Protocol(c.schedule.bind(c),level=>edges.push({at:c.now,level}),()=>({temperature:25,humidity:60}));
 d.onDataChange(0,0);c.advance(300000);d.onDataChange(1,c.now,true);c.advance(400000);
 expect(edges[0]).toEqual({at:300320,level:0});expect(edges[1]).toEqual({at:301600,level:1});
 expect(edges.length).toBe(84);expect(edges[83]!.level).toBe(1);expect(edges[83]!.at-edges[82]!.at).toBe(800);expect(d.busy).toBe(false);
 const highs:number[]=[];for(let i=2;i<82;i+=2)highs.push(Math.round((edges[i+2]!.at-edges[i+1]!.at)/16));
 const bytes=Array.from({length:5},(_,j)=>highs.slice(j*8,j*8+8).reduce((a,v)=>(a<<1)|(v>50?1:0),0));
 expect(bytes).toEqual([60,0,25,0,85]);
});
it('HC-SR04 echo 폭은 거리 × 58µs',()=>{
 const c=clock(), edges:{at:number;level:number}[]=[];const h=new HCSR04Protocol(c.schedule.bind(c),v=>edges.push({at:c.now,level:v}),()=>100);
 h.onTrigChange(1,0);h.onTrigChange(0,160);c.advance(100000);
 expect(edges).toEqual([{at:3200,level:1},{at:96000,level:0}]);expect(h.pinging).toBe(false);
});
it('WS2812 GRB 비트 폭과 latch',()=>{
 const w=new WS2812Protocol(1);let cycle=0;
 for(const v of [0x22,0x11,0x33])for(let bit=7;bit>=0;bit--){w.onDataChange(1,cycle);cycle+=(v&(1<<bit))?13:6;w.onDataChange(0,cycle);cycle+=14;}
 cycle+=800;w.onDataChange(1,cycle);expect(w.colors).toEqual([[0x11,0x22,0x33]]);
 expect(servoAngleFromPulseUs(544)).toBe(0);expect(servoAngleFromPulseUs(2400)).toBe(180);
});
