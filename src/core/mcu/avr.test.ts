import {describe,it,expect} from 'vitest';
import {AvrMcu} from './avr';
import {loadIntelHex,wordsToHex} from './hex';
const ldi=(reg:number,value:number)=>0xe000|((value&0xf0)<<4)|((reg-16)<<4)|(value&15);
const sbi=(addr:number,bit:number)=>0x9a00|(addr<<3)|bit;
const cbi=(addr:number,bit:number)=>0x9800|(addr<<3)|bit;
const sts=(reg:number,addr:number)=>[0x9200|(reg<<4),addr];
const rjmp=(offset:number)=>0xc000|(offset&0xfff);
describe('AVR UNO adapter',()=>{
 it('loads HEX and measures PB5 edges',()=>{
  const m=new AvrMcu(); const edges:string[]=[];
  m.onPinChange=(pin,level)=>{if(pin==='D13')edges.push(String(level));};
  m.loadHex(wordsToHex([sbi(4,5),sbi(5,5),cbi(5,5),rjmp(-3)]));m.step(100);
  expect(m.getPins().D13?.mode).toBe('output');expect(edges).toContain('1');expect(edges).toContain('0');
 });
 it('reports DDR release to a DHT protocol',()=>{
  const m=new AvrMcu();const modes:string[]=[];m.onPinModeChange=(p,mode)=>{if(p==='D4')modes.push(mode);};
  m.cpu.writeData(0x2a,1<<4);m.cpu.writeData(0x2a,0);
  expect(modes).toEqual(['output','input']);
 });
 it('transmits an AVR USART byte',()=>{
  const m=new AvrMcu();let output='';m.onSerial=t=>{output+=t;};
  m.loadHex(wordsToHex([ldi(16,8),...sts(16,0xc1),ldi(16,72),...sts(16,0xc6),rjmp(-1)]));m.step(200);
  expect(output).toContain('H');
 });
 it('samples ADC0 against 5 V AVcc',()=>{
  const m=new AvrMcu();m.loadHex(wordsToHex([ldi(16,0x40),...sts(16,0x7c),ldi(16,0xc7),...sts(16,0x7a),rjmp(-1)]));
  m.setAnalog('A0',2.5);m.step(5000);const value=m.cpu.readData(0x78)|(m.cpu.readData(0x79)<<8);
  expect(value).toBeGreaterThan(450);expect(value).toBeLessThan(575);
 });
 it('decodes servo pulse width from output edges',()=>{
  const m=new AvrMcu();m.cpu.writeData(0x24,2);m.cpu.writeData(0x25,2);
  m.step(24000);m.cpu.writeData(0x25,0);expect(m.activity.servoAngle('D9')).toBeCloseTo(92.7,0);
 });
 it('rejects damaged HEX checksum',()=>expect(()=>loadIntelHex(':0100000000FE\n:00000001FF')).toThrow());
});
