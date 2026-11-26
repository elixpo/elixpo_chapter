/*
 * Theme preferences.
 *
 * LixSketch keeps two independent themes:
 *
 *  - Canvas theme: the drawing surface (background, grid, theme-default
 *    black/white shape colours). Stored under CANVAS_THEME_KEY and exposed
 *    to the engine through `body.theme-light` / `body.theme-dark`.
 *  - UI theme: the workspace chrome (header, toolbar, menus, docs panel).
 *    Stored as `uiTheme` inside UI_PREFS_KEY and exposed through
 *    `body.ui-light` / `body.ui-dark`.
 *
 * Both default to light. Site routes (landing, docs, pricing, ...) never read
 * either value and always render light.
 *
 * This module has no imports so it can be unit tested with `node --test`
 * and inlined into the pre-hydration bootstrap script in app/layout.jsx.
 */

export const THEMES = ['light', 'dark', 'system']
export const DEFAULT_THEME = 'light'
export const CANVAS_THEME_KEY = 'lixsketch-canvas-theme'
export const UI_PREFS_KEY = 'lix_ui_prefs'
/** Pre-split key that used to drive canvas and chrome together. */
export const LEGACY_THEME_KEY = 'theme'

export function isTheme(value) {
  return THEMES.includes(value)
}

function readPrefs(storage) {
  try {
    const parsed = JSON.parse(storage.getItem(UI_PREFS_KEY) || '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function writePrefs(storage, prefs) {
  try {
    storage.setItem(UI_PREFS_KEY, JSON.stringify(prefs))
  } catch {}
}

/**
 * Resolve 'system' against the OS preference. Anything that is not
 * explicitly 'dark' resolves to light.
 */
export function resolveThemeValue(theme, prefersDark = false) {
  if (theme === 'system') return prefersDark ? 'dark' : 'light'
  return theme === 'dark' ? 'dark' : 'light'
}

/**
 * Read the canvas theme, migrating the legacy shared value once.
 *
 * Before the split, `theme` (and `lix_ui_prefs.theme`) was only written when
 * the user picked a theme from the workspace, and it chiefly changed the
 * canvas. A stored legacy value is therefore treated as an explicit canvas
 * choice: it moves to CANVAS_THEME_KEY and the legacy fields are removed so
 * they can never drive the chrome or the site again.
 */
export function readCanvasTheme(storage) {
  if (!storage) return DEFAULT_THEME
  let stored = null
  try { stored = storage.getItem(CANVAS_THEME_KEY) } catch {}
  if (isTheme(stored)) return stored

  let legacy = null
  try { legacy = storage.getItem(LEGACY_THEME_KEY) } catch {}
  const prefs = readPrefs(storage)
  if (!isTheme(legacy)) legacy = isTheme(prefs.theme) ? prefs.theme : null

  if (legacy) {
    try { storage.setItem(CANVAS_THEME_KEY, legacy) } catch {}
  }
  try { storage.removeItem(LEGACY_THEME_KEY) } catch {}
  if ('theme' in prefs) {
    delete prefs.theme
    writePrefs(storage, prefs)
  }
  return legacy || DEFAULT_THEME
}

export function writeCanvasTheme(storage, theme) {
  if (!storage || !isTheme(theme)) return
  try { storage.setItem(CANVAS_THEME_KEY, theme) } catch {}
}

/** Read the workspace chrome theme. Legacy values are deliberately ignored. */
export function readUITheme(storage) {
  if (!storage) return DEFAULT_THEME
  const prefs = readPrefs(storage)
  return isTheme(prefs.uiTheme) ? prefs.uiTheme : DEFAULT_THEME
}

export function writeUITheme(storage, theme) {
  if (!storage || !isTheme(theme)) return
  writePrefs(storage, { ...readPrefs(storage), uiTheme: theme })
}
