import { describe, expect, it } from 'vitest'
import { canvasToLocal, localToCanvas } from '../../src/core/CanvasSpace.js'

describe('canvas-space controls', () => {
  it('maps translated and rotated anchor points without viewport CTM data', () => {
    const transform = { x: 100, y: 50, rotation: 90, centerX: 20, centerY: 10 }
    expect(localToCanvas({ x: 40, y: 10 }, transform).x).toBeCloseTo(120, 10)
    expect(localToCanvas({ x: 40, y: 10 }, transform).y).toBeCloseTo(80, 10)
  })

  it('round-trips pointer coordinates through a rotated shape', () => {
    const transform = { x: -240, y: 180, rotation: 37, centerX: 75, centerY: 45 }
    const local = { x: 151, y: -8 }
    const restored = canvasToLocal(localToCanvas(local, transform), transform)
    expect(restored.x).toBeCloseTo(local.x, 10)
    expect(restored.y).toBeCloseTo(local.y, 10)
  })

  it('does not apply viewport pan or zoom a second time', () => {
    const transform = { x: 30, y: 40, rotation: 0, centerX: 50, centerY: 25 }
    const anchor = localToCanvas({ x: 100, y: 50 }, transform)
    expect(anchor).toEqual({ x: 130, y: 90 })
    expect(canvasToLocal(anchor, transform)).toEqual({ x: 100, y: 50 })
  })
})
