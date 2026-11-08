export const SAVE_KEY = 'coms-lab:scene:v1';
// localStorage that never throws (blocked storage, private mode, quota).
export function getItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function removeItem(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* blocked storage */
  }
}
export function setItem(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
