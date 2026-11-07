/** 220 → "220Ω", 4700 → "4.7kΩ", 1e6 → "1MΩ". */
export function fmtOhms(ohms: number): string {
  if (!Number.isFinite(ohms)) return '-';
  const trim = (n: number) => String(Math.round(n * 100) / 100);
  if (ohms >= 1e6) return `${trim(ohms / 1e6)}MΩ`;
  if (ohms >= 1e3) return `${trim(ohms / 1e3)}kΩ`;
  return `${trim(ohms)}Ω`;
}
export const fmtVolts = (v: number) => `${(Math.abs(v) < 0.005 ? 0 : v).toFixed(2)} V`;
