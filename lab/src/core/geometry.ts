import type { PartInstance, Vec3 } from './types';
import { PARTS } from './parts';

export function pinWorldPos(part: PartInstance, pinId: string): Vec3 {
  const pin = PARTS[part.kind].pins.find(candidate => candidate.id === pinId);
  if (!pin) throw new Error(`핀을 찾을 수 없습니다: ${part.id}:${pinId}`);
  const [x, y, z] = pin.pos;
  const radians = part.rotY * Math.PI / 180;
  return [
    part.pos[0] + x * Math.cos(radians) + z * Math.sin(radians),
    part.pos[1] + y,
    part.pos[2] - x * Math.sin(radians) + z * Math.cos(radians),
  ];
}

const bandNames = ['검정', '갈색', '빨강', '주황', '노랑', '초록', '파랑', '보라', '회색', '흰색', '금', '은'];
const bandColors = [
  '#171717', '#795548', '#e53935', '#fb8c00', '#fdd835', '#43a047',
  '#1e88e5', '#8e24aa', '#808080', '#ffffff', '#d4af37', '#c0c0c0',
];

export function resistorBands(ohms: number): { colors: string[]; names: string[] } {
  if (!Number.isFinite(ohms) || ohms < 0.1 || ohms > 99e9) {
    throw new Error('저항은 양수여야 합니다.');
  }
  let exponent = Math.floor(Math.log10(ohms)) - 1;
  let digits = Math.round(ohms / 10 ** exponent);
  if (digits === 100) {
    digits = 10;
    exponent++;
  }
  exponent = Math.max(-2, Math.min(9, exponent));
  const bands = [
    Math.floor(digits / 10),
    digits % 10,
    exponent === -1 ? 10 : exponent === -2 ? 11 : exponent,
    10,
  ];
  return {
    colors: bands.map(index => bandColors[index]!),
    names: bands.map(index => bandNames[index]!),
  };
}
