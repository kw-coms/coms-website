import { describe, expect, it } from 'vitest';
import { PARTS } from '../core/parts';
import { analyze } from '../core/analyze';
import { validateScene } from '../core/scene';
import { MISSIONS } from './catalog';

describe('mission catalogue', () => {
  it('has ten distinct Korean lessons with usable metadata and checker steps', () => {
    expect(MISSIONS).toHaveLength(10);
    expect(new Set(MISSIONS.map(m => m.id)).size).toBe(10);
    for (const mission of MISSIONS) {
      expect(mission.title).toMatch(/[가-힣]/);
      expect(mission.story).toMatch(/[가-힣]/);
      expect(mission.goal).toMatch(/[가-힣]/);
      expect(mission.hints.length).toBeGreaterThanOrEqual(3);
      expect(mission.referenceScene.code.length).toBeGreaterThan(10);
      expect(mission.starterScene.code).not.toBe(mission.referenceScene.code);
      expect(mission.referenceScene.mission).toBe(mission.id);
      expect(mission.starterScene.mission).toBe(mission.id);
      expect(mission.checker.some(step => step.kind === 'run')).toBe(true);
      expect(mission.checker.some(step => step.kind.startsWith('expect'))).toBe(true);
      for (const kind of mission.requiredParts) expect(mission.referenceScene.parts.some(part => part.kind === kind)).toBe(true);
      for (const part of mission.referenceScene.parts) expect(mission.allowedParts).toContain(part.kind);
    }
  });

  it('uses declared pin IDs, unique IDs, and valid scenes for implemented parts', () => {
    for (const mission of MISSIONS) {
      for (const scene of [mission.starterScene, mission.referenceScene]) {
        const parts = new Map(scene.parts.map(part => [part.id, part]));
        expect(parts.size).toBe(scene.parts.length);
        expect(new Set(scene.wires.map(w => w.id)).size).toBe(scene.wires.length);
        for (const w of scene.wires) for (const ref of [w.from, w.to]) {
          const part = parts.get(ref.partId);
          expect(part, `${mission.id}: missing ${ref.partId}`).toBeDefined();
          if (part) expect(PARTS[part.kind].pins.some(pin => pin.id === ref.pinId), `${mission.id}: ${ref.partId}.${ref.pinId}`).toBe(true);
        }
        expect(validateScene(scene).mission).toBe(mission.id);
        expect(analyze(scene).warnings.filter(w => w.level === 'error'), mission.id).toEqual([]);
      }
    }
  });

  it('keeps starter edits separate and checker inputs valid', () => {
    for (const mission of MISSIONS) {
      expect(mission.starterScene.parts).not.toBe(mission.referenceScene.parts);
      expect(mission.starterScene.wires).not.toBe(mission.referenceScene.wires);
      const ids = new Map(mission.referenceScene.parts.map(p => [p.id, p]));
      for (const step of mission.checker) {
        if (step.kind === 'setInput') {
          const part = ids.get(step.partId);
          expect(part, mission.id).toBeDefined();
          const def = part && PARTS[part.kind].inputs?.find(input => input.key === step.key);
          expect(def, `${mission.id}:${step.partId}.${step.key}`).toBeDefined();
          if (typeof step.value === 'number') {
            if (def?.min !== undefined) expect(step.value).toBeGreaterThanOrEqual(def.min);
            if (def?.max !== undefined) expect(step.value).toBeLessThanOrEqual(def.max);
          }
        }
        if (step.kind === 'expectPart' || step.kind === 'expectTransitions') expect(ids.has(step.partId)).toBe(true);
      }
    }
    const alarm = MISSIONS.find(m => m.id === 'distance-alarm')!;
    expect(alarm.referenceScene.code).toContain('cm <= ALARM_CM');
    expect(alarm.referenceScene.code).toContain('(pulseIn(ECHO_PIN, HIGH, 30000) + 29) / 58');
    const shift = MISSIONS.find(m => m.id === 'shift-chase')!;
    for (let i = 0; i < 8; i++) {
      const group = shift.checker.slice(i * 9 + 1, i * 9 + 9);
      expect(group.map(step => step.kind === 'expectPart' ? step.partId : null)).toEqual(Array.from({ length: 8 }, (_, j) => `led${j}`));
    }
    const analog = MISSIONS.find(m => m.id === 'timer-555')!;
    expect(analog.starterScene.wires.length).toBeLessThan(analog.referenceScene.wires.length);
  });
});
