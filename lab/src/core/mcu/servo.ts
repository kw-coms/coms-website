export function servoAngleFromPulseUs(pulseUs: number): number {
  return Math.max(0, Math.min(180, (pulseUs - 544) * 180 / (2400 - 544)));
}
