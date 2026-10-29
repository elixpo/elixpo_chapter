import { describe, expect, it } from 'vitest'
import {
  clampZoom,
  fitBoundsToViewport,
  unionBounds,
  wheelDeltaToPixels,
  wheelPanDelta,
  wheelZoomFactor,
  zoomViewBoxAroundPoint,
} from '../../src/core/ViewportMath.js'

describe('wheel pan', () => {
  it('pans both axes from a trackpad scroll', () => {
    expect(wheelPanDelta({ deltaX: 30, deltaY: -12 }, 1)).toEqual({ dx: 30, dy: -12 })
  })

  it('scales pan distance by zoom so it feels constant on screen', () => {
    expect(wheelPanDelta({ deltaY: 100 }, 2)).toEqual({ dx: 0, dy: 50 })
    expect(wheelPanDelta({ deltaY: 100 }, 0.5)).toEqual({ dx: 0, dy: 200 })
  })

  it('turns a vertical wheel into a horizontal pan with Shift', () => {
    expect(wheelPanDelta({ deltaY: 40, shiftKey: true }, 1)).toEqual({ dx: 40, dy: 0 })
  })

  it('normalizes line and page delta modes', () => {
    expect(wheelDeltaToPixels(3, 1)).toBe(48)
    expect(wheelDeltaToPixels(1, 2)).toBe(800)
    expect(wheelDeltaToPixels('x', 0)).toBe(0)
  })
})

describe('wheel zoom', () => {
  it('zooms in for negative deltas and out for positive ones', () => {
    expect(wheelZoomFactor(-100)).toBeGreaterThan(1)
    expect(wheelZoomFactor(100)).toBeLessThan(1)
    expect(wheelZoomFactor(0)).toBe(1)
  })

  it('is symmetric so zooming in then out returns to the start', () => {
    expect(wheelZoomFactor(-20) * wheelZoomFactor(20)).toBeCloseTo(1, 10)
  })

  it('caps a single event', () => {
    expect(wheelZoomFactor(10000)).toBeCloseTo(wheelZoomFactor(50), 10)
    expect(wheelZoomFactor(-100)).toBeLessThan(1.25)
  })

  it('keeps small pinch deltas gentle', () => {
    const step = wheelZoomFactor(-2)
    expect(step).toBeGreaterThan(1)
    expect(step).toBeLessThan(1.02)
  })

  it('clamps to the zoom range', () => {
    expect(clampZoom(50, 0.4, 30)).toBe(30)
    expect(clampZoom(0.1, 0.4, 30)).toBe(0.4)
  })
})

describe('zoom around cursor', () => {
  it('keeps the world point under the cursor fixed', () => {
    const viewBox = { x: 100, y: 50, width: 1000, height: 500 }
    const rect = { left: 0, top: 0, width: 1000, height: 500 }
    const cursor = { x: 250, y: 100 }
    const worldBefore = { x: viewBox.x + 0.25 * viewBox.width, y: viewBox.y + 0.2 * viewBox.height }
    const next = zoomViewBoxAroundPoint(viewBox, rect, cursor, 2)
    expect(next.width).toBe(500)
    expect(next.height).toBe(250)
    expect(next.x + 0.25 * next.width).toBeCloseTo(worldBefore.x)
    expect(next.y + 0.2 * next.height).toBeCloseTo(worldBefore.y)
  })

  it('accounts for the element offset on the page', () => {
    const next = zoomViewBoxAroundPoint({ x: 0, y: 0, width: 400, height: 400 }, { left: 100, top: 100, width: 400, height: 400 }, { x: 300, y: 300 }, 2)
    expect(next).toEqual({ x: 100, y: 100, width: 200, height: 200 })
  })
})

describe('fit bounds', () => {
  it('unions bounds and ignores invalid entries', () => {
    expect(unionBounds([
      { x: 0, y: 0, width: 10, height: 10 },
      null,
      { x: 20, y: -5, width: -5, height: 5 },
      { x: NaN, y: 0, width: 1, height: 1 },
    ])).toEqual({ x: 0, y: -5, width: 20, height: 15 })
    expect(unionBounds([])).toBeNull()
  })

  it('centers the content and pads it', () => {
    const { zoom, viewBox } = fitBoundsToViewport({ x: 0, y: 0, width: 100, height: 100 }, { width: 1000, height: 1000 }, 0.4, 30)
    expect(zoom).toBeCloseTo(1000 / 200)
    expect(viewBox.x + viewBox.width / 2).toBeCloseTo(50)
    expect(viewBox.y + viewBox.height / 2).toBeCloseTo(50)
  })

  it('respects the maximum zoom for tiny selections', () => {
    const { zoom } = fitBoundsToViewport({ x: 0, y: 0, width: 1, height: 1 }, { width: 4000, height: 4000 }, 0.4, 30)
    expect(zoom).toBe(30)
  })
})
