import type { Analysis, McuPinState, PartVisualState, Scene, SimFrame, SimInput } from './types';
import { analyze } from './analyze';
import { PARTS } from './parts';
import { validateScene } from './scene';
import { solveCircuit, type SolveResult } from './solver';
import { Mcu, MCU_HZ } from './mcu';

const empty: Scene = { version: 1, parts: [], wires: [], code: '' };
const clamp = (n:number,min=0,max=1)=>Math.max(min,Math.min(max,n));
/** Headless deterministic stepping; wall-clock only limits expensive DC solves and measures speed. */
export class SimulationEngine {
  scene: Scene = empty;
  analysis: Analysis = analyze(empty);
  mcu = new Mcu(text=>this.onSerial(text));
  onSerial: (text:string)=>void = ()=>{};
  inputs: Record<string,Record<string,number|boolean>> = {};
  private hex: string | undefined;
  private solution: SolveResult | undefined;
  private opticalCurrents: Record<string,number> = {};
  private solveInterval = 1000/60;
  private lastSolve = -Infinity;
  private lastSignature = '';
  private dirty = true;
  private elapsedReal = 0;
  private elapsedCycles = 0;
  private echoPins = new Set<string>();
  get nextSolveDelay():number {return Math.max(0,this.lastSolve+this.solveInterval-this.now());}
  constructor(private now: ()=>number = ()=>performance.now()) {
    this.mcu.onPinChange=(pin,level)=>{
      for(const uno of this.scene.parts.filter(p=>p.kind==='arduino-uno')) {
        const net=this.analysis.pinToNet[`${uno.id}:${pin}`];
        const peers=this.analysis.nets.find(n=>n.id===net)?.pins??[];
        for(const peer of peers) if(peer.partId===uno.id && peer.pinId!==pin && /^(D\d+|A[0-5])$/.test(peer.pinId) && this.mcu.pins()[peer.pinId]?.mode!=='output')this.mcu.setVoltage(peer.pinId,level*5);
      }
      this.dirty=true;
    };
  }
  private powered(id:string,positive:string):boolean {
    const volts=(pin:string)=>this.solution?.netVolts[this.analysis.pinToNet[`${id}:${pin}`]!]??0;
    const ground=this.analysis.nets.find(n=>n.id===this.analysis.pinToNet[`${id}:GND`]);
    return volts(positive)-volts('GND')>3.5 && !!ground?.pins.some(p=>this.scene.parts.some(s=>s.id===p.partId&&s.kind==='arduino-uno')&&p.pinId.startsWith('GND'));
  }
  setScene(scene: Scene): Analysis {
    const valid=validateScene(scene); this.mcu.clearEcho(); this.scene=structuredClone(valid); this.analysis=analyze(this.scene);
    this.inputs=Object.fromEntries(this.scene.parts.map(p=>[p.id,Object.fromEntries((PARTS[p.kind].inputs??[]).map(i=>[i.key,i.default]))]));
    this.dirty=true; this.solution=undefined; this.configureDevices(); return this.analysis;
  }
  private unoPin(partId:string,pin:string):string|undefined {
    const id=this.analysis.pinToNet[`${partId}:${pin}`];
    return this.analysis.nets.find(n=>n.id===id)?.pins.find(p=>this.scene.parts.some(s=>s.id===p.partId&&s.kind==='arduino-uno')&&/^(D\d+|A[0-5])$/.test(p.pinId))?.pinId;
  }
  private configureDevices():void {
    const lcd=this.scene.parts.find(p=>p.kind==='lcd1602-i2c'&&this.powered(p.id,'VCC')&&this.unoPin(p.id,'SDA')==='A4'&&this.unoPin(p.id,'SCL')==='A5');
    this.mcu.setLcdAddress(lcd?Number(lcd.props.address??0x27):null);
    this.echoPins.clear();
    for(const p of this.scene.parts.filter(p=>p.kind==='hc-sr04'&&this.powered(p.id,'VCC'))) {
      const trig=this.unoPin(p.id,'TRIG'),echo=this.unoPin(p.id,'ECHO');
      if(trig&&echo){this.mcu.triggerEcho(trig,echo,Number(this.inputs[p.id]?.distanceCm??100));this.echoPins.add(echo);}
    }
    if(!this.echoPins.size)this.mcu.clearEcho();
  }
  loadHex(hex:string):void {this.mcu.loadHex(hex);this.hex=hex;this.afterReset();}
  reset():void {if(this.hex)this.mcu.loadHex(this.hex);else this.mcu.reset();this.afterReset();}
  private afterReset():void {this.solution=undefined;this.dirty=true;this.elapsedReal=0;this.elapsedCycles=0;this.lastSignature='';this.configureDevices();}
  setInput(input:SimInput):void {
    const part=this.scene.parts.find(p=>p.id===input.partId), definition=part&&PARTS[part.kind].inputs?.find(i=>i.key===input.key);
    if(!part||!definition)throw new Error('존재하지 않는 부품 입력입니다.');
    if(definition.type==='momentary'?typeof input.value!=='boolean':typeof input.value!=='number'||!Number.isFinite(input.value))throw new Error('입력값 형식이 올바르지 않습니다.');
    const value=typeof input.value==='number'?clamp(input.value,definition.min??0,definition.max??1):input.value;
    this.inputs[input.partId]![input.key]=value;this.dirty=true;
    if(input.key==='distanceCm')this.configureDevices();
  }
  writeSerial(text:string):void {this.mcu.writeSerial(text);}
  private solve():void {
    const pins=this.mcu.pins();
    const signature=JSON.stringify(pins);
    if(signature!==this.lastSignature)this.dirty=true;
    const now=this.now();
    if(this.dirty&&(!this.solution||now-this.lastSolve>=this.solveInterval)) {
      // MCU inputs must see instantaneous levels, never PWM-average threshold values.
      const instantaneous=Object.fromEntries(Object.entries(pins).map(([id,state])=>[id,{...state,duty:state.level}]));
      const external=Object.fromEntries(this.scene.parts.filter(p=>p.kind==='hc-sr04').map(p=>[`${p.id}:ECHO`,{volts:this.mcu.isEchoActive(this.unoPin(p.id,'ECHO')??'')?5:0}]));
      this.solution=solveCircuit(this.scene,this.analysis,instantaneous,this.inputs,external);
      this.opticalCurrents=this.solution.currents;
      this.solveInterval=1000/60;
      // A diode's Vf must not be applied to the average PWM voltage: solve the
      // on-state current, then integrate its duty. Two solves at 30 Hz stay <=60/s.
      if(Object.values(pins).some(p=>p.mode==='output'&&p.freq>0&&p.duty>0&&p.duty<1)) {
        const drive=structuredClone(instantaneous), factors:Record<string,number>={};
        const sources=(start:string):string[]=>{
          const seen=new Set<string>(),todo=[start],found:string[]=[];
          while(todo.length){const n=todo.pop()!;if(seen.has(n))continue;seen.add(n);
            for(const ref of this.analysis.nets.find(net=>net.id===n)?.pins??[]){
              const part=this.scene.parts.find(p=>p.id===ref.partId)!;
              if(part.kind==='arduino-uno'&&pins[ref.pinId]?.mode==='output')found.push(ref.pinId);
              if(part.kind==='resistor')todo.push(this.analysis.pinToNet[`${part.id}:${ref.pinId==='1'?'2':'1'}`]!);
            }
          }return found;
        };
        for(const p of this.scene.parts.filter(p=>p.kind==='led'||p.kind==='rgb-led')) {
          const channels=p.kind==='led'?['']:['R','G','B'];
          for(const channel of channels){
            const a=p.kind==='led'?'anode':p.props.common==='anode'?'common':channel;
            const c=p.kind==='led'?'cathode':p.props.common==='anode'?channel:'common';
            let duty=1;
            for(const [pin,active] of [...sources(this.analysis.pinToNet[`${p.id}:${a}`]!).map(pin=>[pin,1] as const),...sources(this.analysis.pinToNet[`${p.id}:${c}`]!).map(pin=>[pin,0] as const)]) {
              const state=pins[pin]!;
              if(state.freq>0&&state.duty>0&&state.duty<1){drive[pin]={...state,level:active,duty:active};duty=Math.min(duty,active?state.duty:1-state.duty);}
            }
            factors[channel?`${p.id}:${channel}`:p.id]=duty;
          }
        }
        const on=solveCircuit(this.scene,this.analysis,drive,this.inputs,external);
        this.solution.warnings.push(...on.warnings.filter(w=>w.id.startsWith('led-overcurrent:')));
        this.opticalCurrents={...this.solution.currents};
        for(const [key,factor] of Object.entries(factors))this.opticalCurrents[key]=(on.currents[key]??0)*factor;
        this.solveInterval=1000/30;
      }
      this.configureDevices();
      this.lastSolve=now;this.dirty=false;this.lastSignature=signature;
      for(const p of this.scene.parts.filter(p=>p.kind==='arduino-uno')) for(const [id,state] of Object.entries(pins)) {
        if(state.mode==='output'||this.echoPins.has(id))continue;
        this.mcu.setVoltage(id,this.solution.netVolts[this.analysis.pinToNet[`${p.id}:${id}`]!]??0);
      }
    }
  }
  step(cycles:number):SimFrame {
    if(!Number.isFinite(cycles)||cycles<0||cycles>MCU_HZ*10)throw new Error('실행 사이클 범위가 올바르지 않습니다.');
    this.solve();
    const before=this.mcu.cpu.cycles,start=this.now();
    this.mcu.step(Math.floor(cycles));
    this.elapsedReal+=Math.max(0,this.now()-start);this.elapsedCycles+=this.mcu.cpu.cycles-before;
    this.solve();return this.frame();
  }
  frame(realtimeRatio?:number):SimFrame {
    this.solve();
    const solution=this.solution!, pins=this.mcu.pins(), parts:Record<string,PartVisualState>={};
    const voltage=(id:string,pin:string)=>solution.netVolts[this.analysis.pinToNet[`${id}:${pin}`]!]??0;
    for(const p of this.scene.parts) {
      const state:PartVisualState={pinVolts:Object.fromEntries(PARTS[p.kind].pins.map(pin=>[pin.id,voltage(p.id,pin.id)]))};
      const activity=(pin:string):McuPinState|undefined=>pins[this.unoPin(p.id,pin)??''];
      if(p.kind==='led')state.led={brightness:clamp((this.opticalCurrents[p.id]??0)/0.02)};
      if(p.kind==='rgb-led')state.rgb={r:clamp((this.opticalCurrents[`${p.id}:R`]??0)/0.02),g:clamp((this.opticalCurrents[`${p.id}:G`]??0)/0.02),b:clamp((this.opticalCurrents[`${p.id}:B`]??0)/0.02)};
      if(p.kind==='arduino-uno')state.led={brightness:pins.D13?.duty??0};
      if(p.kind==='servo')state.servo={angle:this.powered(p.id,'V+')?this.mcu.servoAngle(this.unoPin(p.id,'SIG')??''):0};
      if(p.kind==='buzzer'){const freq=activity('+')?.freq??0;state.buzzer={on:freq>0,freq};}
      if(p.kind==='lcd1602-i2c')state.lcd=this.powered(p.id,'VCC')?this.mcu.lcd.state:{lines:[' '.repeat(16),' '.repeat(16)],backlight:false};
      if(p.kind==='hc-sr04')state.hcsr04={pinging:this.mcu.isEchoActive(this.unoPin(p.id,'ECHO')??'')};
      if(p.kind==='multimeter'){const mode=p.props.mode==='mA'?'mA':'V';state.meter={mode,reading:mode==='V'?(voltage(p.id,'V')-voltage(p.id,'COM')).toFixed(3):((solution.currents[p.id]??0)*1000).toFixed(3)};}
      parts[p.id]=state;
    }
    return {timeMs:this.mcu.cpu.cycles/MCU_HZ*1000,realtimeRatio:realtimeRatio??(this.elapsedReal>0?this.elapsedCycles/MCU_HZ/(this.elapsedReal/1000):0),pins,parts,netVolts:solution.netVolts,warnings:[...new Map([...this.analysis.warnings,...solution.warnings].map(w=>[w.id,w])).values()]};
  }
}
export { SimulationEngine as Engine };
