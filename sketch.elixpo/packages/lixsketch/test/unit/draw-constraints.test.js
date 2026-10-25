import { describe, expect, it } from 'vitest'
import { constrainToSquare, snapToAngle } from '../../src/core/DrawConstraints.js'

describe('constrainToSquare', () => {
  it('extends the shorter side to match the longer one', () => {
    expect(constrainToSquare({ x: 0, y: 0 }, { x: 100, y: 40 })).toEqual({ x: 100, y: 100 })
    expect(constrainToSquare({ x: 10, y: 10 }, { x: 30, y: 90 })).toEqual({ x: 90, y: 90 })
  })

  it('keeps the drag direction in every quadrant', () => {
    expect(constrainToSquare({ x: 0, y: 0 }, { x: -50, y: 20 })).toEqual({ x: -50, y: 50 })
    expect(constrainToSquare({ x: 0, y: 0 }, { x: 20, y: -60 })).toEqual({ x: 60, y: -60 })
    expect(constrainToSquare({ x: 0, y: 0 }, { x: -5, y: -8 })).toEqual({ x: -8, y: -8 })
  })

  it('passes the point through when disabled', () => {
    expect(constrainToSquare({ x: 0, y: 0 }, { x: 100, y: 40 }, false)).toEqual({ x: 100, y: 40 })
  })
})

describe('snapToAngle', () => {
  it('snaps to horizontal, vertical and diagonal steps', () => {
    const h = snapToAngle({ x: 0, y: 0 }, { x: 100, y: 10 })
    expect(h.x).toBeCloseTo(Math.hypot(100, 10))
    expect(h.y).toBeCloseTo(0)

    const v = snapToAngle({ x: 0, y: 0 }, { x: -8, y: -100 })
    expect(v.x).toBeCloseTo(0)
    expect(v.y).toBeCloseTo(-Math.hypot(8, 100))

    const d = snapToAngle({ x: 0, y: 0 }, { x: 50, y: 60 })
    expect(d.x).toBeCloseTo(d.y)
  })

  it('preserves segment length', () => {
    const p = snapToAngle({ x: 5, y: 5 }, { x: 45, y: 35 })
    expect(Math.hypot(p.x - 5, p.y - 5)).toBeCloseTo(50)
  })

  it('handles zero-length segments and disabled snapping', () => {
    expect(snapToAngle({ x: 3, y: 4 }, { x: 3, y: 4 })).toEqual({ x: 3, y: 4 })
    expect(snapToAngle({ x: 0, y: 0 }, { x: 10, y: 3 }, false)).toEqual({ x: 10, y: 3 })
  })
})
