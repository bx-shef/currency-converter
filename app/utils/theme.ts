/**
 * Theme selection logic — pure, framework-agnostic, unit-testable.
 * The reactive wiring lives in `~/composables/useTheme`; the same resolution
 * rule is mirrored by the inline pre-paint script in `app.vue` (to avoid FOUC).
 */

export type Theme = 'light' | 'dark'

/**
 * localStorage key for the persisted theme choice.
 * SYNC: the literal `'theme'` is also hard-coded in app.vue's inline
 * theme-init script (which runs before the bundle loads).
 */
export const THEME_KEY = 'theme'

/** Type guard for a persisted/raw theme value. */
export function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark'
}

/**
 * Resolves the theme to apply on load: an explicit saved choice wins; otherwise
 * fall back to the OS preference (`prefers-color-scheme: dark`).
 */
export function resolveInitialTheme(saved: string | null, prefersDark: boolean): Theme {
  if (isTheme(saved)) return saved
  return prefersDark ? 'dark' : 'light'
}

/** The opposite theme — used by the toggle. */
export function oppositeTheme(theme: Theme): Theme {
  return theme === 'dark' ? 'light' : 'dark'
}
