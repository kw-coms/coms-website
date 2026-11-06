import { describe, expect, it } from 'vitest';
import { solveCircuit } from './solver';
import type { Analysis, PartInstance, Scene } from './types';

const part = (id: string, kind: PartInstance['kind'], props: PartInstance['props'] = {}): PartInstance => ({ id, kind, pos: [0, 0, 0], rotY: 0, props });
function circuit(parts: PartInstance[], connections: Record<string, string>) {
  const scene: Scene = { version: 1, parts, wires: [], code: '' };
  const ids = [...new Set(Object.values(connections))];
  const analysis: Analysis = {
    nets: ids.map(id => ({ id, pins: Object.entries(connections).filter(([, nid]) => nid === id).map(([ref]) => ({ partId: ref.split(':')[0]!, pinId: ref.split(':')[1]! })) })),
    pinToNet: connections, insertions: {}, warnings: [],
  };
  return solveCircuit(scene, analysis);
}

describe('DC solver', () => {
  it('solves a 10k/10k divider', () => {
    const result = circuit([part('uno', 'arduino-uno'), part('r1', 'resistor', { ohms: 10000 }), part('r2', 'resistor', { ohms: 10000 })], {
      'uno:5V': 'v', 'uno:GND.1': 'g', 'r1:1': 'v', 'r1:2': 'mid', 'r2:1': 'mid', 'r2:2': 'g',
    });
    expect(result.netVolts.mid).toBeCloseTo(2.5, 2);
  });
  it('limits a red LED through 220 ohms to roughly 13mA', () => {
    const result = circuit([part('uno', 'arduino-uno'), part('r', 'resistor', { ohms: 220 }), part('led', 'led')], {
      'uno:5V': 'v', 'uno:GND.1': 'g', 'r:1': 'v', 'r:2': 'a', 'led:anode': 'a', 'led:cathode': 'g',
    });
    expect(result.branchCurrents.led).toBeGreaterThan(0.012);
    expect(result.branchCurrents.led).toBeLessThan(0.015);
    expect(result.warnings.filter(w => w.level === 'error')).toHaveLength(0);
  });
  it('reports a directly driven LED overcurrent', () => {
    const result = circuit([part('uno', 'arduino-uno'), part('led', 'led')], {
      'uno:5V': 'v', 'uno:GND.1': 'g', 'led:anode': 'v', 'led:cathode': 'g',
    });
    expect(result.warnings.some(w => w.id === 'led-overcurrent:led' && w.level === 'error')).toBe(true);
  });
  it('pulls an input high until the button closes to ground', () => {
    const scene: Scene = { version: 1, parts: [part('uno', 'arduino-uno'), part('button', 'pushbutton')], wires: [], code: '' };
    const connections = { 'uno:D2': 'in', 'uno:GND.1': 'g', 'button:1': 'in', 'button:3': 'g' };
    const analysis: Analysis = { pinToNet: connections, nets: ['in','g'].map(id => ({id, pins: []})), insertions: {}, warnings: [] };
    const pins = { D2: { mode: 'input_pullup' as const, level: 1 as const, duty: 1, freq: 0 } };
    expect(solveCircuit(scene, analysis, pins).netVolts.in).toBeCloseTo(5, 2);
    expect(solveCircuit(scene, analysis, pins, { button: { pressed: true } }).netVolts.in).toBeLessThan(0.01);
  });
  it('reports a direct short through a closed switch', () => {
    const scene: Scene = { version: 1, parts: [part('uno', 'arduino-uno'), part('button', 'pushbutton')], wires: [], code: '' };
    const connections = { 'uno:5V': 'v', 'uno:GND.1': 'g', 'button:1': 'v', 'button:3': 'g' };
    const analysis: Analysis = { pinToNet: connections, nets: ['v','g'].map(id => ({id, pins: []})), insertions: {}, warnings: [] };
    expect(solveCircuit(scene, analysis, {}, { button: { pressed: true } }).warnings.some(w => w.id.startsWith('short:'))).toBe(true);
  });
  it('detects conflicting output drivers on one net', () => {
    const scene: Scene = { version: 1, parts: [part('uno', 'arduino-uno')], wires: [], code: '' };
    const connections = { 'uno:D2': 'bus', 'uno:D3': 'bus', 'uno:GND.1': 'g' };
    const analysis: Analysis = { pinToNet: connections, nets: [
      { id: 'bus', pins: [{ partId: 'uno', pinId: 'D2' }, { partId: 'uno', pinId: 'D3' }] },
      { id: 'g', pins: [{ partId: 'uno', pinId: 'GND.1' }] },
    ], insertions: {}, warnings: [] };
    const result = solveCircuit(scene, analysis, {
      D2: { mode: 'output', level: 1, duty: 1, freq: 0 },
      D3: { mode: 'output', level: 0, duty: 0, freq: 0 },
    });
    expect(result.warnings.some(w => w.id === 'contention:bus')).toBe(true);
  });
  it('keeps unused breadboard holes out of the solve while reporting them floating', () => {
    const scene: Scene = { version: 1, parts: [part('uno', 'arduino-uno')], wires: [], code: '' };
    const analysis: Analysis = { pinToNet: { 'uno:5V': 'v', 'uno:GND.1': 'g', 'board:a1': 'empty' }, nets: ['v','g','empty'].map(id => ({id, pins: []})), insertions: {}, warnings: [] };
    const result = solveCircuit(scene, analysis);
    expect(result.netVolts.v).toBeCloseTo(5, 2);
    expect(result.netVolts.empty).toBe(0);
    expect(result.floating).toContain('empty');
  });
  it('measures volts with 10 megohm input and milliamps through the shunt', () => {
    const scene: Scene = { version: 1, parts: [part('uno', 'arduino-uno'), part('meter', 'multimeter', { mode: 'V' })], wires: [], code: '' };
    const connections = { 'uno:5V': 'v', 'uno:GND.1': 'g', 'meter:V': 'v', 'meter:COM': 'g' };
    const analysis: Analysis = { pinToNet: connections, nets: ['v','g'].map(id => ({id, pins: []})), insertions: {}, warnings: [] };
    const result = solveCircuit(scene, analysis);
    expect(Number(result.parts.meter?.meter?.reading.split(' ')[0])).toBeCloseTo(5, 1);
    expect(result.branchCurrents.meter).toBeLessThan(0.000001);
  });
  it('drives IOREF at five volts', () => {
    const result = circuit([part('uno', 'arduino-uno')], { 'uno:IOREF': 'io', 'uno:GND.1': 'g' });
    expect(result.netVolts.io).toBeCloseTo(5, 2);
  });
  it('identifies reversed LED polarity', () => {
    const result = circuit([part('uno', 'arduino-uno'), part('led', 'led')], {
      'uno:5V': 'v', 'uno:GND.1': 'g', 'led:anode': 'g', 'led:cathode': 'v',
    });
    expect(result.warnings.some(w => w.id === 'led-reversed:led')).toBe(true);
  });
  it('changes a CDS divider voltage as illumination changes', () => {
    const scene: Scene = { version: 1, parts: [part('uno', 'arduino-uno'), part('cds', 'photoresistor'), part('r', 'resistor', { ohms: 10000 })], wires: [], code: '' };
    const connections = { 'uno:5V': 'v', 'uno:GND.1': 'g', 'cds:1': 'v', 'cds:2': 'out', 'r:1': 'out', 'r:2': 'g' };
    const analysis: Analysis = { pinToNet: connections, nets: ['v','g','out'].map(id => ({id, pins: []})), insertions: {}, warnings: [] };
    const dark = solveCircuit(scene, analysis, {}, { cds: { lux: 1 } }).netVolts.out;
    const bright = solveCircuit(scene, analysis, {}, { cds: { lux: 10000 } }).netVolts.out;
    expect(bright).toBeGreaterThan(dark!);
  });
  it('provides separate RGB channel currents', () => {
    const result = circuit([part('uno', 'arduino-uno'), part('r', 'resistor', { ohms: 220 }), part('rgb', 'rgb-led')], {
      'uno:5V': 'v', 'uno:GND.1': 'g', 'r:1': 'v', 'r:2': 'red',
      'rgb:R': 'red', 'rgb:G': 'g', 'rgb:B': 'g', 'rgb:common': 'g',
    });
    expect(result.currents['rgb:R']).toBeGreaterThan(0.012);
    expect(result.currents['rgb:G']).toBe(0);
    expect(result.currents['rgb:B']).toBe(0);
  });
  it('reports a direct 5V-to-GND merged net', () => {
    const result = circuit([part('uno', 'arduino-uno')], { 'uno:5V': 'short', 'uno:GND.1': 'short' });
    expect(result.warnings.some(w => w.id === 'short:uno')).toBe(true);
  });
  it('solves an external HC-SR04 ECHO drive', () => {
    const scene: Scene = { version: 1, parts: [part('uno', 'arduino-uno'), part('sonar', 'hc-sr04')], wires: [], code: '' };
    const connections = { 'uno:GND.1': 'g', 'uno:D7': 'echo', 'sonar:ECHO': 'echo' };
    const analysis: Analysis = { pinToNet: connections, nets: ['g','echo'].map(id => ({id, pins: []})), insertions: {}, warnings: [] };
    const result = solveCircuit(scene, analysis, {}, {}, { 'sonar:ECHO': { volts: 5 } });
    expect(result.netVolts.echo).toBeCloseTo(5, 2);
  });
  it('shows signed mA when meter leads are reversed', () => {
    const parts = [part('uno', 'arduino-uno'), part('r', 'resistor', { ohms: 1000 }), part('meter', 'multimeter', { mode: 'mA' })];
    const forward = circuit(parts, { 'uno:5V': 'v', 'uno:GND.1': 'g', 'r:1': 'v', 'r:2': 'mid', 'meter:A': 'mid', 'meter:COM': 'g' });
    const reverse = circuit(parts, { 'uno:5V': 'v', 'uno:GND.1': 'g', 'r:1': 'v', 'r:2': 'mid', 'meter:A': 'g', 'meter:COM': 'mid' });
    expect(forward.branchCurrents.meter).toBeGreaterThan(0.004);
    expect(reverse.branchCurrents.meter).toBeLessThan(-0.004);
    expect(reverse.parts.meter?.meter?.reading.startsWith('-')).toBe(true);
  });
  it('warns separately for RGB channel overcurrent and reverse polarity', () => {
    const warning = circuit([part('uno', 'arduino-uno'), part('r', 'resistor', { ohms: 100 }), part('rgb', 'rgb-led')], {
      'uno:5V': 'v', 'uno:GND.1': 'g', 'r:1': 'v', 'r:2': 'red', 'rgb:R': 'red', 'rgb:common': 'g',
    });
    expect(warning.warnings.some(w => w.id === 'led-overcurrent:rgb:R' && w.level === 'warn')).toBe(true);
    const error = circuit([part('uno', 'arduino-uno'), part('rgb', 'rgb-led')], {
      'uno:5V': 'v', 'uno:GND.1': 'g', 'rgb:R': 'v', 'rgb:common': 'g',
    });
    expect(error.warnings.some(w => w.id === 'led-overcurrent:rgb:R' && w.level === 'error')).toBe(true);
    const reversed = circuit([part('uno', 'arduino-uno'), part('rgb', 'rgb-led')], {
      'uno:5V': 'v', 'uno:GND.1': 'g', 'rgb:R': 'g', 'rgb:common': 'v',
    });
    expect(reversed.warnings.some(w => w.id === 'led-reversed:rgb:R')).toBe(true);
  });
  it('moves the potentiometer wiper with its input position', () => {
    const scene: Scene = { version: 1, parts: [part('uno', 'arduino-uno'), part('pot', 'potentiometer')], wires: [], code: '' };
    const connections = { 'uno:5V': 'v', 'uno:GND.1': 'g', 'pot:1': 'g', 'pot:3': 'v', 'pot:wiper': 'w' };
    const analysis: Analysis = { pinToNet: connections, nets: ['v','g','w'].map(id => ({id, pins: []})), insertions: {}, warnings: [] };
    expect(solveCircuit(scene, analysis, {}, { pot: { position: 0.25 } }).netVolts.w).toBeCloseTo(1.25, 2);
  });
});
