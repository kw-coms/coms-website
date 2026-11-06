import type { Analysis, Scene, SimFrame, SimInput, Simulator } from './types';
import { analyze } from './analyze';
import { validateScene } from './scene';
import { loadIntelHex } from './mcu';
import { PARTS } from './parts';
export type Command = {method:'setScene';value:Scene}|{method:'loadHex'|'writeSerial';value:string}|{method:'setInput';value:SimInput}|{method:'setSpeed';value:number}|{method:'start'|'pause'|'stop'|'reset'|'dispose'};
export type Event = {type:'frame';value:SimFrame}|{type:'serial';value:string}|{type:'error';value:string};
import { LocalSimulator } from './local-simulator';
export { LocalSimulator } from './local-simulator';
class WorkerSimulator implements Simulator {
  private worker = new Worker(new URL('./worker.ts', import.meta.url), {type:'module'});
  private frames=new Set<(f:SimFrame)=>void>();
  private serial=new Set<(s:string)=>void>();
  private _state:Simulator['state']='idle';
  private scene:Scene={version:1,parts:[],wires:[],code:''};
  private lastFrame:SimFrame={timeMs:0,realtimeRatio:0,pins:{},parts:{},netVolts:{},warnings:[]};
  get state(){return this._state;}
  private fail(message:string){this._state='paused';const frame={...this.lastFrame,warnings:[...this.lastFrame.warnings,{id:'worker-error',level:'error' as const,message:`시뮬레이션 오류: ${message}`}]};for(const cb of this.frames)cb(frame);}
  constructor(){this.worker.onerror=event=>{event.preventDefault();this.fail(event.message||'워커 실행 오류');};this.worker.onmessage=(event:MessageEvent<Event>)=>{const e=event.data;if(e.type==='frame'){this.lastFrame=e.value;for(const cb of this.frames)cb(e.value);}else if(e.type==='serial')for(const cb of this.serial)cb(e.value);else if(e.type==='error')this.fail(e.value);};}
  private send(command:Command){try{this.worker.postMessage(command);}catch(error){this.fail(error instanceof Error?error.message:String(error));throw error;}}
  setScene(scene:Scene):Analysis {const valid=validateScene(scene), result=analyze(valid);this.send({method:'setScene',value:valid});this.scene=structuredClone(valid);return result;}
  loadHex(hex:string):void {loadIntelHex(hex);this.send({method:'loadHex',value:hex});}
  start():void {this._state='running';this.send({method:'start'});}
  pause():void {if(this._state==='running')this._state='paused';this.send({method:'pause'});}
  stop():void {this._state='idle';this.send({method:'stop'});}
  reset():void {this.send({method:'reset'});}
  setSpeed(value:number):void {if(!Number.isFinite(value))throw new Error('속도가 올바르지 않습니다.');this.send({method:'setSpeed',value:Math.max(.25,Math.min(2,value))});}
  setInput(value:SimInput):void {
    const part=this.scene.parts.find(p=>p.id===value.partId), definition=part&&PARTS[part.kind].inputs?.find(i=>i.key===value.key);
    if(!definition)throw new Error('존재하지 않는 부품 입력입니다.');
    if(definition.type==='momentary'?typeof value.value!=='boolean':typeof value.value!=='number'||!Number.isFinite(value.value))throw new Error('입력값 형식이 올바르지 않습니다.');
    this.send({method:'setInput',value});
  }
  writeSerial(value:string):void {this.send({method:'writeSerial',value});}
  onFrame(cb:(frame:SimFrame)=>void):()=>void {this.frames.add(cb);return()=>{this.frames.delete(cb);};}
  onSerial(cb:(text:string)=>void):()=>void {this.serial.add(cb);return()=>{this.serial.delete(cb);};}
  dispose():void {this.worker.terminate();this._state='idle';this.frames.clear();this.serial.clear();}
}
export function createSimulator():Simulator {return typeof Worker==='undefined'?new LocalSimulator():new WorkerSimulator();}
