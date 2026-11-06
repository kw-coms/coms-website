import type { McuPinState } from '../types';
const HZ = 16_000_000, WINDOW = HZ / 50;
interface Transition { cycle: number; level: 0 | 1 }
/** Tracks physical output edges; 20 ms duty/frequency and servo high pulse widths. */
export class PinActivity {
 private edges = new Map<string,Transition[]>();
 private lastWidth = new Map<string,number>();
 record(pin:string,level:0|1,cycle:number): void {
  const e=this.edges.get(pin) ?? [{cycle:0,level:0}];
  const prev=e[e.length-1]!; if (prev.level===level) return;
  if (prev.level===1 && level===0) this.lastWidth.set(pin,(cycle-prev.cycle)/16); // µs
  e.push({cycle,level}); this.edges.set(pin,e);
 }
 get(pin:string,cycle:number): Pick<McuPinState,'duty'|'freq'> {
  const e=this.edges.get(pin) ?? [{cycle:0,level:0}]; const start=Math.max(0,cycle-WINDOW);
  let level=e[0]!.level, t=start, high=0, rises=0;
  for(const edge of e) { if(edge.cycle<=start) {level=edge.level;continue;} if(edge.cycle>cycle) break; if(level)high+=edge.cycle-t; if(edge.level===1)rises++; t=edge.cycle; level=edge.level; }
  if(level)high+=cycle-t;
  // Retain one prior edge for pulse and time continuity.
  const cutoff=e.findIndex(x=>x.cycle>=start); if(cutoff>1) e.splice(0,cutoff-1);
  return {duty:cycle>start?high/(cycle-start):level, freq:rises*HZ/Math.max(1,cycle-start)};
 }
 pulseWidthUs(pin:string):number {return this.lastWidth.get(pin)??0;}
 servoAngle(pin:string):number {return Math.max(0,Math.min(180,(this.pulseWidthUs(pin)-544)*180/(2400-544)));}
 reset():void {this.edges.clear();this.lastWidth.clear();}
}
