import { describe, expect, it } from 'vitest'
import {
  CANVAS_BACKGROUNDS,
  DEFAULT_CANVAS_BACKGROUNDS,
  canvasBackgroundStorageKey,
  readCanvasBackground,
} from '../../src/react/utils/canvasBackgrounds.js'
import { exportBackground } from '../../../../src/utils/canvasBackgrounds.js'

describe('canvas background palettes', () => {
  it('starts the light palette with a soft off-white canvas', () => {
    expect(CANVAS_BACKGROUNDS.light.map(({ color }) => color)).toEqual([
      '#FAFAF9', '#FFFFFF', '#F6DBC0', '#F5EED2', '#F5F2ED', '#F5DABF',
    ])
    expect(DEFAULT_CANVAS_BACKGROUNDS.light).toBe('#FAFAF9')
  })

  it('keeps the established dark palette unchanged', () => {
    expect(CANVAS_BACKGROUNDS.dark.map(({ color }) => color)).toEqual([
      '#000000', '#161718', '#15111f', '#181605', '#1B1615',
    ])
  })

  it('restores independent valid choices for light and dark themes', () => {
    const values = new Map([
      [canvasBackgroundStorageKey('light'), '#F5EED2'],
      [canvasBackgroundStorageKey('dark'), '#181605'],
    ])
    const storage = { getItem: (key) => values.get(key) ?? null }
    expect(readCanvasBackground('light', storage)).toBe('#F5EED2')
    expect(readCanvasBackground('dark', storage)).toBe('#181605')
  })

  it('rejects stale palette values and uses readable defaults', () => {
    const storage = { getItem: () => '#ff00ff' }
    expect(readCanvasBackground('light', storage)).toBe(DEFAULT_CANVAS_BACKGROUNDS.light)
    expect(readCanvasBackground('dark', storage)).toBe(DEFAULT_CANVAS_BACKGROUNDS.dark)
  })

  it('migrates the former warm light default to the soft default', () => {
    const values = new Map([[canvasBackgroundStorageKey('light'), '#F5F2ED']])
    const storage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    }
    expect(readCanvasBackground('light', storage)).toBe('#FAFAF9')
    expect(readCanvasBackground('light', storage)).toBe('#FAFAF9')
  })

  it('migrates the former pure-white default once', () => {
    const values = new Map([
      [canvasBackgroundStorageKey('light'), '#FFFFFF'],
      ['lixsketch-canvas-light-default-v2', '1'],
    ])
    const storage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    }
    expect(readCanvasBackground('light', storage)).toBe('#FAFAF9')
    // Picking pure white afterwards is respected.
    values.set(canvasBackgroundStorageKey('light'), '#FFFFFF')
    expect(readCanvasBackground('light', storage)).toBe('#FFFFFF')
  })

  it('allows the former defaults to be selected after migration', () => {
    const values = new Map([
      [canvasBackgroundStorageKey('light'), '#F5F2ED'],
      ['lixsketch-canvas-light-default-v2', '1'],
      ['lixsketch-canvas-light-default-v3', '1'],
    ])
    const storage = { getItem: (key) => values.get(key) ?? null }
    expect(readCanvasBackground('light', storage)).toBe('#F5F2ED')
  })

  it('uses the selected canvas color for matching-theme exports', () => {
    expect(exportBackground('light', 'light', '#FBE4DB')).toBe('#FBE4DB')
    expect(exportBackground('dark', 'dark', '#181605')).toBe('#181605')
    expect(exportBackground('none', 'light', '#FBE4DB')).toBeNull()
    expect(exportBackground('dark', 'light', '#FBE4DB')).toBe(DEFAULT_CANVAS_BACKGROUNDS.dark)
  })
})
