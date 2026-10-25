export const CANVAS_BACKGROUNDS = {
  light: [
    { color: '#FAFAF9', label: 'menu.canvasBg.offWhite' },
    { color: '#FFFFFF', label: 'menu.canvasBg.white' },
    { color: '#F6DBC0', label: 'menu.canvasBg.cream' },
    { color: '#F5EED2', label: 'menu.canvasBg.paper' },
    { color: '#F5F2ED', label: 'menu.canvasBg.skyTint' },
    { color: '#F5DABF', label: 'menu.canvasBg.sageTint' },
  ],
  dark: [
    { color: '#000000', label: 'menu.canvasBg.black' },
    { color: '#161718', label: 'menu.canvasBg.darkGray' },
    { color: '#15111f', label: 'menu.canvasBg.blueBlack' },
    { color: '#181605', label: 'menu.canvasBg.darkYellow' },
    { color: '#1B1615', label: 'menu.canvasBg.darkBrown' },
  ],
}

export const DEFAULT_CANVAS_BACKGROUNDS = {
  dark: '#15111f',
  light: '#FAFAF9',
}

const LEGACY_LIGHT_DEFAULT = '#F5F2ED'
const LIGHT_DEFAULT_MIGRATION_KEY = 'lixsketch-canvas-light-default-v2'
// v3: the pure-white default became the softer off-white. Users who never
// picked a light background (or kept the old white default) move once.
const LEGACY_WHITE_DEFAULT = '#FFFFFF'
const LIGHT_SOFT_DEFAULT_MIGRATION_KEY = 'lixsketch-canvas-light-default-v3'

export const canvasBackgroundStorageKey = (theme) => `lixsketch-canvas-background-${theme}`

export function readCanvasBackground(theme, storage) {
  const resolved = theme === 'light' ? 'light' : 'dark'
  try {
    const stored = storage?.getItem(canvasBackgroundStorageKey(resolved))
    if (resolved === 'light' && storage?.getItem(LIGHT_SOFT_DEFAULT_MIGRATION_KEY) !== '1') {
      const legacyDefaults = [LEGACY_WHITE_DEFAULT]
      if (storage?.getItem(LIGHT_DEFAULT_MIGRATION_KEY) !== '1') legacyDefaults.push(LEGACY_LIGHT_DEFAULT)
      storage?.setItem?.(LIGHT_DEFAULT_MIGRATION_KEY, '1')
      storage?.setItem?.(LIGHT_SOFT_DEFAULT_MIGRATION_KEY, '1')
      if (legacyDefaults.some((color) => color.toLowerCase() === stored?.toLowerCase())) {
        storage?.setItem?.(canvasBackgroundStorageKey(resolved), DEFAULT_CANVAS_BACKGROUNDS.light)
        return DEFAULT_CANVAS_BACKGROUNDS.light
      }
    }
    const match = CANVAS_BACKGROUNDS[resolved].find(({ color }) => color.toLowerCase() === stored?.toLowerCase())
    if (match) return match.color
  } catch {}
  return DEFAULT_CANVAS_BACKGROUNDS[resolved]
}

export function exportBackground(bgMode, currentTheme, canvasBackground) {
  if (bgMode !== 'dark' && bgMode !== 'light') return null
  return bgMode === currentTheme && canvasBackground
    ? canvasBackground
    : DEFAULT_CANVAS_BACKGROUNDS[bgMode]
}
