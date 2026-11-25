import { afterEach, describe, expect, it } from 'vitest'
import {
  BACKGROUND_SWATCHES,
  THEME_INK,
  getStrokeSwatches,
  getThemeForeground,
  isThemeOwnedColor,
  normalizeSceneColorsForTheme,
  resolveThemeLabelColor,
  themeColorFor,
} from '../../src/utils/themeColors.js'

const lightDocument = { body: { classList: { contains: (name) => name === 'theme-light' } } }
const darkDocument = { body: { classList: { contains: (name) => name === 'theme-dark' } } }

afterEach(() => {
  delete globalThis.document
})

describe('soft theme ink', () => {
  it('uses a soft ink instead of pure black/white', () => {
    expect(THEME_INK.light).toBe('#1e1e1e')
    expect(THEME_INK.dark).not.toBe('#ffffff')
    expect(THEME_INK.dark).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('uses the light ink on the light canvas', () => {
    globalThis.document = lightDocument
    expect(getThemeForeground()).toBe(THEME_INK.light)
    expect(resolveThemeLabelColor('#e0e0e0')).toBe(THEME_INK.light)
  })

  it('treats a body without theme-dark as the light canvas', () => {
    globalThis.document = { body: { classList: { contains: () => false } } }
    expect(getThemeForeground()).toBe(THEME_INK.light)
  })

  it('uses the dark ink on the dark canvas', () => {
    globalThis.document = darkDocument
    expect(getThemeForeground()).toBe(THEME_INK.dark)
    expect(resolveThemeLabelColor('#e8e3f3')).toBe(THEME_INK.dark)
  })

  it('falls back to the dark ink without a DOM', () => {
    expect(getThemeForeground()).toBe(THEME_INK.dark)
  })

  it('preserves an explicitly selected label color', () => {
    globalThis.document = lightDocument
    expect(resolveThemeLabelColor('#FF8383')).toBe('#FF8383')
  })

  it('maps legacy pure black / white labels to the theme ink', () => {
    globalThis.document = darkDocument
    expect(resolveThemeLabelColor('#000000')).toBe(THEME_INK.dark)
    expect(resolveThemeLabelColor('#FFF')).toBe(THEME_INK.dark)
  })
})

describe('theme-owned color recognition', () => {
  it.each(['#000', '#000000', 'black', '#fff', '#FFFFFF', 'white', '#1a1a2e', '#1a1a20', '#e0e0e0', '#e8e3f3', '#f7f4ff', ' #1E1E1E ', THEME_INK.dark])(
    'recognises %s as theme-owned',
    (color) => {
      expect(isThemeOwnedColor(color)).toBe(true)
    },
  )

  it.each(['#e03131', '#ffc9c9', 'transparent', 'none', '', null, undefined, 42])(
    'leaves %s as an explicit color',
    (color) => {
      expect(isThemeOwnedColor(color)).toBe(false)
    },
  )

  it('swaps theme-owned colors in both directions', () => {
    expect(themeColorFor('#000000', 'dark')).toBe(THEME_INK.dark)
    expect(themeColorFor('#ffffff', 'light')).toBe(THEME_INK.light)
    expect(themeColorFor(THEME_INK.light, 'dark')).toBe(THEME_INK.dark)
    expect(themeColorFor(THEME_INK.dark, 'light')).toBe(THEME_INK.light)
    expect(themeColorFor('#e03131', 'light')).toBe('#e03131')
    expect(themeColorFor('transparent', 'dark')).toBe('transparent')
  })
})

describe('swatches', () => {
  it('leads stroke swatches with the active ink, then the opposite ink', () => {
    expect(getStrokeSwatches('light').slice(0, 2)).toEqual([THEME_INK.light, THEME_INK.dark])
    expect(getStrokeSwatches('dark').slice(0, 2)).toEqual([THEME_INK.dark, THEME_INK.light])
    expect(getStrokeSwatches('light')).toHaveLength(8)
  })

  it('offers pastel backgrounds with a no-fill entry first', () => {
    expect(BACKGROUND_SWATCHES[0]).toBe('transparent')
    expect(BACKGROUND_SWATCHES).toHaveLength(8)
    for (const color of BACKGROUND_SWATCHES.slice(1)) {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16))
      // Pastel: every channel is light.
      expect(Math.min(r, g, b)).toBeGreaterThanOrEqual(0x99)
    }
  })
})

describe('normalizeSceneColorsForTheme', () => {
  it('rewrites legacy #000/#fff scene defaults to the soft ink', () => {
    const scene = {
      shapes: [
        { type: 'rectangle', labelColor: '#e0e0e0', options: { stroke: '#000000', fill: 'transparent', labelColor: '#fff' } },
        { type: 'circle', options: { stroke: '#FF8383', fill: '#ffc9c9' } },
        { type: 'text', groupHTML: '<g><text fill="#fff" stroke=\'#000\'>a</text><text fill="#e03131">b</text></g>' },
      ],
    }
    normalizeSceneColorsForTheme(scene, 'light')
    expect(scene.shapes[0]).toMatchObject({
      labelColor: THEME_INK.light,
      options: { stroke: THEME_INK.light, fill: 'transparent', labelColor: THEME_INK.light },
    })
    expect(scene.shapes[1].options).toEqual({ stroke: '#FF8383', fill: '#ffc9c9' })
    expect(scene.shapes[2].groupHTML).toBe(
      `<g><text fill="${THEME_INK.light}" stroke='${THEME_INK.light}'>a</text><text fill="#e03131">b</text></g>`,
    )
  })

  it('maps the light ink to the dark ink for dark scenes', () => {
    const scene = { shapes: [{ options: { stroke: THEME_INK.light } }, { elementHTML: `<text fill="${THEME_INK.light}">x</text>` }] }
    normalizeSceneColorsForTheme(scene, 'dark')
    expect(scene.shapes[0].options.stroke).toBe(THEME_INK.dark)
    expect(scene.shapes[1].elementHTML).toBe(`<text fill="${THEME_INK.dark}">x</text>`)
  })

  it('ignores scenes without a shape list', () => {
    expect(normalizeSceneColorsForTheme(null, 'light')).toBeNull()
    const scene = { version: 1 }
    expect(normalizeSceneColorsForTheme(scene, 'light')).toBe(scene)
  })
})
