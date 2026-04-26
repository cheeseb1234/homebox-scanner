export type AppearanceMode = 'amoled' | 'dark' | 'light' | 'system';

export const APPEARANCE_STORAGE_KEY = 'homebox-scanner-appearance';
export const DEFAULT_APPEARANCE: AppearanceMode = 'amoled';

export function isAppearanceMode(value: string | null): value is AppearanceMode {
  return value === 'amoled' || value === 'dark' || value === 'light' || value === 'system';
}

export function getStoredAppearance(): AppearanceMode {
  try {
    const stored = localStorage.getItem(APPEARANCE_STORAGE_KEY);
    return isAppearanceMode(stored) ? stored : DEFAULT_APPEARANCE;
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

export function applyAppearance(mode: AppearanceMode): void {
  document.documentElement.dataset.theme = mode;
}

export function saveAppearance(mode: AppearanceMode): void {
  try {
    localStorage.setItem(APPEARANCE_STORAGE_KEY, mode);
  } catch {
    // Ignore storage failures; the current page can still use the chosen mode.
  }
  applyAppearance(mode);
}
