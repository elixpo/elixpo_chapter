/**
 * Theme-owned canvas colors.
 *
 * The canvas has a single "ink" color per theme: the default stroke, text
 * and label color. It is intentionally soft (not pure #000 / #fff) so the
 * workspace is easy on the eyes, Excalidraw-style.
 *
 * Any color in THEME_OWNED_COLORS is treated as "the theme default" rather
 * than an explicit user choice. That covers the current inks plus every
 * legacy default older scenes were saved with (#000, #fff, near-black,
 * lavender label greys). When the theme flips, or a serialized scene is
 * loaded under a theme, those colors are mapped to the active ink; any
 * other color is left exactly as the user picked it.
 */

export const THEME_INK = Object.freeze({
  light: '#1e1e1e',
  dark: '#e3e3e8',
})

const LEGACY_THEME_COLORS = [
  '#000', '#000000', 'black',
  '#fff', '#ffffff', 'white',
  '#1a1a2e', '#1a1a20',
  '#e0e0e0', '#e8e3f3', '#f7f4ff',
]

export const THEME_OWNED_COLORS = new Set([
  ...LEGACY_THEME_COLORS,
  THEME_INK.light,
  THEME_INK.dark,
])

/** Excalidraw-like swatches. The first slot is always the active theme ink. */
export const STROKE_SWATCHES = Object.freeze([
  '#e03131', '#2f9e44', '#1971c2', '#f08c00', '#c2255c', '#9c36b5',
])

/** Pastel background swatches (first entry is "no fill"). */
export const BACKGROUND_SWATCHES = Object.freeze([
  'transparent', '#ffc9c9', '#b2f2bb', '#a5d8ff', '#ffec99', '#eebefa', '#e9ecef', '#d0bfff',
])

export function normalizeColor(color) {
  if (typeof color !== 'string') return color
  return color.trim().toLowerCase()
}

/** True when `color` is a theme default (current or legacy), not a user pick. */
export function isThemeOwnedColor(color) {
  if (!color || typeof color !== 'string') return false
  return THEME_OWNED_COLORS.has(normalizeColor(color))
}

export function resolveThemeName(resolved) {
  return resolved === 'light' ? 'light' : 'dark'
}

export function getThemeInk(resolved) {
  return THEME_INK[resolveThemeName(resolved)]
}

/**
 * Active canvas theme read from the body class. Without a DOM (SSR, MCP,
 * node tests) the engine historically drew for the dark canvas.
 */
export function getActiveCanvasTheme() {
  if (typeof document === 'undefined') return 'dark'
  return document.body?.classList?.contains('theme-dark') ? 'dark' : 'light'
}

/** Default ink for the active canvas theme. */
export function getThemeForeground() {
  return getThemeInk(getActiveCanvasTheme())
}

/** Ordered stroke swatches for a theme: theme ink, the opposite ink, then hues. */
export function getStrokeSwatches(resolved) {
  const theme = resolveThemeName(resolved)
  const other = theme === 'light' ? 'dark' : 'light'
  return [THEME_INK[theme], THEME_INK[other], ...STROKE_SWATCHES]
}

/**
 * Map a theme-owned color to the given theme's ink. Explicit colors, and
 * the `transparent` / `none` sentinels, pass through unchanged.
 */
export function themeColorFor(color, resolved) {
  if (!isThemeOwnedColor(color)) return color
  return getThemeInk(resolved)
}

export function resolveThemeLabelColor(color) {
  if (!color) return getThemeForeground()
  return isThemeOwnedColor(color) ? getThemeForeground() : color
}

// Serialized SVG markup (text/code groups) stores theme-default colors as
// literal attributes. Match every theme-owned spelling, current or legacy.
const THEME_OWNED_ATTR_PATTERN = new RegExp(
  `\\b(fill|stroke)=(['"])(${[...THEME_OWNED_COLORS].join('|')})\\2`,
  'gi',
)

/**
 * Rewrite theme-default colors in a serialized scene to the given theme's
 * ink before shape constructors draw it. Mutates and returns `sceneData`.
 */
export function normalizeSceneColorsForTheme(sceneData, resolved) {
  if (!Array.isArray(sceneData?.shapes)) return sceneData
  const map = (value) => (typeof value === 'string' ? themeColorFor(value, resolved) : value)
  for (const shape of sceneData.shapes) {
    if (!shape || typeof shape !== 'object') continue
    if (shape.labelColor !== undefined) shape.labelColor = map(shape.labelColor)
    if (shape.options) {
      for (const key of ['stroke', 'fill', 'labelColor']) {
        if (shape.options[key] !== undefined) shape.options[key] = map(shape.options[key])
      }
    }
    for (const htmlKey of ['groupHTML', 'elementHTML']) {
      if (typeof shape[htmlKey] !== 'string') continue
      shape[htmlKey] = shape[htmlKey].replace(
        THEME_OWNED_ATTR_PATTERN,
        (match, attribute, quote, color) => `${attribute}=${quote}${map(color)}${quote}`,
      )
    }
  }
  return sceneData
}
