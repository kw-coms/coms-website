import type { PartKind, Scene, SimInput } from '../core/types';

export type Comparison = 'eq' | 'gte' | 'lte' | 'between';
export type ExpectedValue = number | boolean | string;

export type CheckerStep =
  | ({ kind: 'setInput' } & SimInput)
  | { kind: 'run'; ms: number }
  | { kind: 'expectPart'; partId: string; path: string; op: Comparison; value: ExpectedValue; max?: number }
  | { kind: 'expectPin'; pin: string; field: 'level' | 'duty' | 'freq'; op: Comparison; value: number; max?: number }
  | { kind: 'expectSerial'; includes: string }
  | { kind: 'expectSerialNumber'; prefix: string; min: number; max: number }
  | { kind: 'expectTransitions'; partId: string; path: string; threshold: number; minTransitions: number; intervalMs?: number; highMs?: number; lowMs?: number; tolerance?: number };

export interface Mission {
  id: string;
  title: string;
  story: string;
  goal: string;
  hints: string[];
  requiredParts: PartKind[];
  allowedParts: PartKind[];
  starterScene: Scene;
  referenceScene: Scene;
  checker: CheckerStep[];
}

export interface MissionResult {
  passed: boolean;
  step: number;
  message: string;
}
