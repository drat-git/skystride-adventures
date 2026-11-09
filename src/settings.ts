/** A device preference, deliberately independent of accounts and gameplay physics. */
export const MOTION_STORAGE_KEY = 'skystride.reducedMotion';
let reducedMotion = false;

export function readMotionPreference(): { value: boolean; error?: string } {
  try {
    const stored = localStorage.getItem(MOTION_STORAGE_KEY);
    if (stored === null) return { value: false };
    if (stored === 'true' || stored === 'false') return { value: stored === 'true' };
    return { value: false, error: 'The saved motion preference was invalid. The default is being used.' };
  } catch {
    return { value: false, error: 'This browser could not read the saved motion preference. The default is being used.' };
  }
}

export function applyMotionPreference(value: boolean): void {
  reducedMotion = value;
  if (typeof document !== 'undefined') document.documentElement.dataset.reducedMotion = String(value);
}

export function saveMotionPreference(value: boolean): { saved: boolean; error?: string } {
  applyMotionPreference(value);
  try {
    localStorage.setItem(MOTION_STORAGE_KEY, String(value));
    return { saved: true };
  } catch {
    return { saved: false, error: 'The preference applies now, but could not be saved on this device.' };
  }
}

export function prefersReducedMotion(): boolean { return reducedMotion; }
