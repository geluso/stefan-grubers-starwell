const storageKey = 'starwell.preferences'

export type PreferenceName = 'enforceTurns' | 'outlines' | 'pieces' | 'hexes' | 'background'

export function loadPreferences(): Partial<Record<PreferenceName, unknown>> {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(storageKey) ?? '{}')
    if (typeof stored === 'object' && stored !== null && !Array.isArray(stored)) {
      return stored as Partial<Record<PreferenceName, unknown>>
    }
  } catch {
    // Storage can be blocked or contain invalid JSON.
  }
  return {}
}

export function savePreference(name: PreferenceName, value: boolean | string) {
  try {
    const preferences = { ...loadPreferences(), [name]: value }
    window.localStorage.setItem(storageKey, JSON.stringify(preferences))
  } catch {
    // The control still works for this page when storage is unavailable.
  }
}
