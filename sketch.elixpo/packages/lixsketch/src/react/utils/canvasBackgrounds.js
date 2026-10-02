export const CANVAS_BACKGROUNDS = {
  light: [
    { color: '#FBE4DB', label: 'menu.canvasBg.white' },
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

export const DEFAULT_CANVAS_BACKGROUNDS = { dark: '#15111f', light: '#F5F2ED' }
export const canvasBackgroundStorageKey = (theme) => `lixsketch-canvas-background-${theme}`

export function readCanvasBackground(theme, storage) {
  const resolved = theme === 'light' ? 'light' : 'dark'
  try {
    const stored = storage?.getItem(canvasBackgroundStorageKey(resolved))
    const match = CANVAS_BACKGROUNDS[resolved].find(({ color }) => color.toLowerCase() === stored?.toLowerCase())
    if (match) return match.color
  } catch {}
  return DEFAULT_CANVAS_BACKGROUNDS[resolved]
}
