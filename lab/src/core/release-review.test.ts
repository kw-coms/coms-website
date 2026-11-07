import { describe, expect, it, vi } from 'vitest';
import { SimulationEngine } from './engine';
import { analyze } from './analyze';
import { EXAMPLES } from './examples';
import type { PartInstance, Scene } from './types';

const part = (id: string, kind: PartInstance['kind'], x: number, props = {}): PartInstance =>
  ({ id, kind, pos: [x, 0, 100], rotY: 0, props });
const connect = (scene: Scene, from: string, pin: string, to: string, terminal: string) => {
  scene.wires.push({ id: `review-wire-${scene.wires.length}`, from: { partId: from, pinId: pin }, to: { partId: to, pinId: terminal }, color: 'blue' });
};
const example = (kind: PartInstance['kind']) => structuredClone(EXAMPLES.find(e => e.scene.parts.some(p => p.kind === kind))!.scene);

// Spatially separated parts avoid accidental breadboard/header insertion.
function peripheral(kind: 'neopixel-strip' | 'dht11', ohms: number, series = true): Scene {
  const scene: Scene = { version: 1, code: '', parts: [
    part('u', 'arduino-uno', -150), part('device', kind, 0, kind === 'neopixel-strip' ? { count: 1 } : {}), part('r', 'resistor', 100, { ohms }),
  ], wires: [] };
  const data = kind === 'dht11' ? 'DATA' : 'DIN';
  connect(scene, 'u', '5V', 'device', kind === 'dht11' ? 'VCC' : '5V');
  connect(scene, 'u', 'GND.1', 'device', 'GND');
  connect(scene, 'u', series ? 'D2' : '5V', 'r', '1');
  connect(scene, 'r', '2', 'device', data);
  if (!series) connect(scene, 'u', 'D2', 'device', data);
  return scene;
}

function sendPixel(engine: SimulationEngine): void {
  const cpu = engine.mcu.cpu;
  cpu.writeData(0x2a, 4); // DDRD2
  for (const byte of [0x22, 0x11, 0x33]) {
    for (let bit = 7; bit >= 0; bit--) {
      cpu.writeData(0x2b, 4);
      engine.mcu.step(byte & (1 << bit) ? 13 : 6);
      cpu.writeData(0x2b, 0);
      engine.mcu.step(14);
    }
  }
  engine.mcu.step(1000);
}

describe('release review regressions', () => {
  it('preserves inputs, ADC, and runtime identity on a code-only update', () => {
    const scene = example('potentiometer');
    const pot = scene.parts.find(p => p.kind === 'potentiometer')!;
    const engine = new SimulationEngine();
    engine.setScene(scene);
    engine.setInput({ partId: pot.id, key: 'position', value: .9 });
    engine.step(160);
    const analysis = engine.analysis;
    const inputs = engine.inputs;
    const cycles = engine.mcu.cpu.cycles;
    const adc = engine.mcu.adc.channelValues[0];
    const clear = vi.spyOn(engine.mcu, 'clearEcho');
    engine.setScene({ ...structuredClone(scene), code: '// edited' });
    expect(engine.inputs[pot.id]?.position).toBe(.9);
    expect(engine.analysis).toBe(analysis);
    expect(engine.inputs).toBe(inputs);
    expect(engine.mcu.cpu.cycles).toBe(cycles);
    expect(engine.mcu.adc.channelValues[0]).toBe(adc);
    expect(adc).toBeCloseTo(4.5, 1);
    expect(clear).not.toHaveBeenCalled();
    expect(engine.scene.code).toBe('// edited');
  });

  it('preserves surviving inputs across movement, defaults new inputs, and drops removed parts', () => {
    const scene = example('potentiometer');
    const pot = scene.parts.find(p => p.kind === 'potentiometer')!;
    const engine = new SimulationEngine();
    engine.setScene(scene);
    engine.setInput({ partId: pot.id, key: 'position', value: .9 });
    scene.parts.push(part('other', 'dht11', 250));
    engine.setScene(scene);
    engine.setInput({ partId: 'other', key: 'temperature', value: 35 });
    scene.parts.find(p => p.id === 'other')!.pos[0] += 20;
    engine.setScene(scene);
    engine.frame();
    expect(engine.inputs[pot.id]?.position).toBe(.9);
    expect(engine.inputs.other).toEqual({ temperature: 35, humidity: 50 });
    expect(engine.mcu.adc.channelValues[0]).toBeCloseTo(4.5, 1);
    scene.parts = scene.parts.filter(p => p.id !== 'other');
    engine.setScene(scene);
    expect(engine.inputs.other).toBeUndefined();
    scene.parts.push(part('other', 'dht11', 250));
    engine.setScene(scene);
    expect(engine.inputs.other?.temperature).toBe(25);
  });

  it('reports every additional UNO as unsupported at error level', () => {
    const scene: Scene = { version: 1, code: '', wires: [], parts: [part('u', 'arduino-uno', -150), part('u2', 'arduino-uno', 150)] };
    expect(analyze(scene).warnings).toContainEqual({ id: 'multiple-uno:u2', partId: 'u2', level: 'error', message: '아두이노 UNO는 한 회로에 하나만 시뮬레이션할 수 있어요.' });
  });

  it('only samples and drives the first UNO, including immediate GPIO links', () => {
    const scene = example('potentiometer');
    const pot = scene.parts.find(p => p.kind === 'potentiometer')!;
    scene.parts.push(part('u2', 'arduino-uno', 250));
    connect(scene, 'u2', 'A0', 'u2', 'GND.1');
    connect(scene, 'u2', 'D13', 'u2', 'D2');
    const engine = new SimulationEngine();
    engine.setScene(scene);
    engine.setInput({ partId: pot.id, key: 'position', value: .9 });
    engine.frame();
    expect(engine.mcu.adc.channelValues[0]).toBeCloseTo(4.5, 1);
    engine.mcu.cpu.writeData(0x24, 32);
    engine.mcu.cpu.writeData(0x25, 32);
    expect(engine.mcu.cpu.readData(0x29) & 4).toBe(0);
    // Force a solve after the GPIO change without relying on wall-clock timing.
    scene.code = '// unchanged circuit';
    const later = new SimulationEngine(() => 100);
    later.setScene(scene);
    later.mcu.cpu.writeData(0x24, 32);
    later.mcu.cpu.writeData(0x25, 32);
    const frame = later.frame();
    expect(frame.netVolts[later.analysis.pinToNet['u2:D13']!] ?? 0).toBeLessThan(.1);
    expect(frame.netVolts[later.analysis.pinToNet['u2:5V']!] ?? 0).toBeLessThan(.1);
    expect(frame.parts.u2?.led?.brightness).toBe(0);
  });

  it.each([330, 1000])('decodes NeoPixel pulses through one %i ohm resistor without merging nets', ohms => {
    const engine = new SimulationEngine();
    engine.setScene(peripheral('neopixel-strip', ohms));
    engine.frame();
    expect(engine.analysis.pinToNet['u:D2']).not.toBe(engine.analysis.pinToNet['device:DIN']);
    sendPixel(engine);
    expect(engine.frame().parts.device?.pixels?.colors).toEqual([[0x11, 0x22, 0x33]]);
  });

  it('does not propagate protocol data through a resistor above 1k or a two-resistor chain', () => {
    for (const chain of [false, true]) {
      const scene = peripheral('neopixel-strip', chain ? 330 : 1001);
      if (chain) {
        scene.parts.push(part('r2', 'resistor', 200, { ohms: 330 }));
        scene.wires.find(w => w.from.partId === 'r')!.to = { partId: 'r2', pinId: '1' };
        connect(scene, 'r2', '2', 'device', 'DIN');
      }
      const engine = new SimulationEngine();
      engine.setScene(scene);
      engine.frame();
      sendPixel(engine);
      expect(engine.frame().parts.device?.pixels?.colors).toEqual([[0, 0, 0]]);
    }
  });

  it.each([false, true])('discovers DHT data with a pull-up or series resistor (series=%s)', series => {
    const engine = new SimulationEngine();
    engine.setScene(peripheral('dht11', series ? 330 : 10000, series));
    engine.frame();
    expect(engine.analysis.pinToNet['device:DATA']).not.toBe(engine.analysis.pinToNet['u:5V']);
    engine.mcu.cpu.writeData(0x2a, 4);
    engine.mcu.step(300000);
    engine.mcu.cpu.writeData(0x2a, 0);
    expect(engine.mcu.dhtBusy('D2')).toBe(true);
    engine.mcu.step(100000);
    expect(engine.mcu.dhtBusy('D2')).toBe(false);
  });
  it('keeps an active sonar transaction across code-only synchronization', () => {
    const scene: Scene = { version: 1, code: '', parts: [part('u', 'arduino-uno', -150), part('s', 'hc-sr04', 0)], wires: [] };
    for (const [pin, terminal] of [['5V', 'VCC'], ['GND.1', 'GND'], ['D2', 'TRIG'], ['D3', 'ECHO']]) {
      connect(scene, 'u', pin!, 's', terminal!);
    }
    const engine = new SimulationEngine(() => 0);
    engine.setScene(scene);
    engine.frame();
    engine.mcu.cpu.writeData(0x2a, 4);
    engine.mcu.cpu.writeData(0x2b, 4);
    engine.mcu.step(160);
    engine.mcu.cpu.writeData(0x2b, 0);
    engine.setScene({ ...scene, code: '// edited during echo delay' });
    engine.mcu.step(4000);
    expect(engine.mcu.isEchoActive('D3')).toBe(true);
    engine.mcu.step(100000);
    expect(engine.mcu.isEchoActive('D3')).toBe(false);
  });

  it('discovers sonar trigger and echo through separate single resistors', () => {
    const scene: Scene = { version: 1, code: '', parts: [
      part('u', 'arduino-uno', -150), part('s', 'hc-sr04', 0),
      part('rt', 'resistor', 100, { ohms: 330 }), part('re', 'resistor', 200, { ohms: 1000 }),
    ], wires: [] };
    connect(scene, 'u', '5V', 's', 'VCC');
    connect(scene, 'u', 'GND.1', 's', 'GND');
    connect(scene, 'u', 'D2', 'rt', '1');
    connect(scene, 'rt', '2', 's', 'TRIG');
    connect(scene, 'u', 'D3', 're', '1');
    connect(scene, 're', '2', 's', 'ECHO');
    const engine = new SimulationEngine();
    engine.setScene(scene);
    engine.frame();
    engine.mcu.cpu.writeData(0x2a, 4);
    engine.mcu.cpu.writeData(0x2b, 4);
    engine.mcu.step(160);
    engine.mcu.cpu.writeData(0x2b, 0);
    engine.mcu.step(4000);
    expect(engine.mcu.isEchoActive('D3')).toBe(true);
  });

  it('acknowledges an I2C LCD through one series resistor per data line', () => {
    const scene: Scene = { version: 1, code: '', parts: [
      part('u', 'arduino-uno', -150), part('lcd', 'lcd1602-i2c', 0),
      part('ra', 'resistor', 100, { ohms: 330 }), part('rc', 'resistor', 200, { ohms: 330 }),
    ], wires: [] };
    connect(scene, 'u', '5V', 'lcd', 'VCC');
    connect(scene, 'u', 'GND.1', 'lcd', 'GND');
    connect(scene, 'u', 'A4', 'ra', '1');
    connect(scene, 'ra', '2', 'lcd', 'SDA');
    connect(scene, 'u', 'A5', 'rc', '1');
    connect(scene, 'rc', '2', 'lcd', 'SCL');
    const engine = new SimulationEngine();
    engine.setScene(scene);
    engine.frame();
    engine.mcu.twi.eventHandler.connectToSlave(0x27, true);
    expect(engine.mcu.cpu.data[0xb9]! & 0xf8).toBe(0x18); // SLA+W ACK
  });

});
