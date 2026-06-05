/**
 * Light/dark theme state. Thin Vue wrapper over `~/utils/theme`: reflects the
 * choice on `<html>` (b24ui's `dark`/`light` classes) and persists it.
 *
 * To avoid a flash, the initial theme is already applied before paint by an
 * inline script in `app.vue`; on mount we mirror it into reactive state and
 * keep this composable the source of truth for toggling.
 */
import { onMounted, ref } from 'vue'
import { oppositeTheme, resolveInitialTheme, THEME_KEY, type Theme } from '~/utils/theme'

/** Reflects `theme` on <html> via b24ui's dark/light classes. */
function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return // client-only (SSG/SSR guard)
  const list = document.documentElement.classList
  list.toggle('dark', theme === 'dark')
  list.toggle('light', theme === 'light')
}

/**
 * Theme state for the app shell. Instantiate once (in `app.vue`): each call
 * creates an independent ref, synced only via the DOM / localStorage.
 */
export function useTheme() {
  // SSG prerenders <html class="dark">; reconciled with the real choice on mount.
  const theme = ref<Theme>('dark')

  /** Sets the theme, applies it to <html>, and persists the choice. */
  function setTheme(next: Theme) {
    theme.value = next
    applyTheme(next)
    try {
      localStorage.setItem(THEME_KEY, next)
    } catch {
      // localStorage may be unavailable (private mode) — in-session toggle still works
    }
  }

  /** Switches between light and dark. */
  function toggleTheme() {
    setTheme(oppositeTheme(theme.value))
  }

  onMounted(() => {
    let saved: string | null = null
    try {
      saved = localStorage.getItem(THEME_KEY)
    } catch {
      saved = null
    }
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    theme.value = resolveInitialTheme(saved, prefersDark)
    applyTheme(theme.value)
  })

  return { theme, toggleTheme }
}
