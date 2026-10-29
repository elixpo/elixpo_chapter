import { describe, expect, it, vi } from 'vitest'
import {
  ARROWHEAD_TYPES,
  arrowEndAngles,
  arrowheadGeometry,
  arrowheadSize,
  layoutArrowheads,
  normalizeArrowhead,
  readArrowheads,
  renderArrowhead,
  shaftPathData,
  splitCubic,
  trimShaft,
} from '../../src/core/ArrowHeads.js'

const close = (a, b, eps = 1e-6) => Math.abs(a - b) < eps
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)

describe('types and legacy mapping', () => {
  it('has every Excalidraw head plus cross', () => {
    expect(ARROWHEAD_TYPES).toEqual([
      'none', 'arrow', 'bar', 'dot', 'circle', 'triangle', 'triangle_outline',
      'diamond', 'diamond_outline', 'crowfoot_one', 'crowfoot_many', 'crowfoot_one_or_many', 'cross',
    ])
  })

  it('maps legacy arrowHeadStyle values onto the end head', () => {
    expect(readArrowheads({ arrowHeadStyle: 'default' })).toEqual({ startArrowhead: 'none', endArrowhead: 'arrow' })
    expect(readArrowheads({ arrowHeadStyle: 'outline' }).endArrowhead).toBe('triangle_outline')
    expect(readArrowheads({ arrowHeadStyle: 'solid' }).endArrowhead).toBe('triangle')
    expect(readArrowheads({ arrowHeadStyle: 'square' }).endArrowhead).toBe('bar')
    expect(readArrowheads({ arrowHeadStyle: 'none' }).endArrowhead).toBe('none')
    expect(readArrowheads({})).toEqual({ startArrowhead: 'none', endArrowhead: 'arrow' })
  })

  it('prefers the new keys and normalizes aliases', () => {
    expect(readArrowheads({ arrowHeadStyle: 'solid', startArrowhead: 'dot', endArrowhead: 'diamond' })).toEqual({ startArrowhead: 'dot', endArrowhead: 'diamond' })
    expect(normalizeArrowhead('TRIANGLE_OUTLINE')).toBe('triangle_outline')
    expect(normalizeArrowhead('x')).toBe('cross')
    expect(normalizeArrowhead(null)).toBe('none')
    expect(normalizeArrowhead('bogus')).toBe('arrow')
    expect(normalizeArrowhead('bogus', 'none')).toBe('none')
  })
})

describe('size', () => {
  it('grows with stroke width', () => {
    expect(arrowheadSize('arrow', 4)).toBeGreaterThan(arrowheadSize('arrow', 2))
    expect(arrowheadSize('arrow', 7)).toBeGreaterThan(arrowheadSize('arrow', 4))
    expect(arrowheadSize('arrow', 1)).toBeLessThanOrEqual(arrowheadSize('arrow', 2))
  })

  it('never takes more than half the shaft', () => {
    expect(arrowheadSize('arrow', 2, 10)).toBe(5)
    expect(arrowheadSize('none', 2)).toBe(0)
  })
})

describe('geometry per type', () => {
  const tip = { x: 100, y: 50 }

  it('open arrow meets at the tip with symmetric wings behind it', () => {
    const { trim, parts } = arrowheadGeometry('arrow', tip, 0, 20)
    expect(trim).toBe(0)
    const [a, t, b] = parts[0].points
    expect(t).toEqual(tip)
    expect(a.x).toBeLessThan(tip.x)
    expect(close(a.y - tip.y, -(b.y - tip.y))).toBe(true)
    expect(close(dist(a, tip), 20)).toBe(true)
  })

  it('triangles are closed at the tip and trim the shaft to their base', () => {
    const filled = arrowheadGeometry('triangle', tip, 0, 20)
    const outline = arrowheadGeometry('triangle_outline', tip, 0, 20)
    expect(filled.parts[0]).toMatchObject({ kind: 'polygon', filled: true })
    expect(outline.parts[0]).toMatchObject({ kind: 'polygon', filled: false })
    expect(filled.parts[0].points[0]).toEqual(tip)
    expect(close(filled.trim, 20 * Math.cos(Math.PI / 6))).toBe(true)
  })

  it('dot and circle touch the tip and trim by their diameter', () => {
    const dot = arrowheadGeometry('dot', tip, 0, 12)
    expect(dot.parts[0]).toMatchObject({ kind: 'circle', filled: true, diameter: 12 })
    expect(dot.parts[0].center).toEqual({ x: 94, y: 50 })
    expect(dot.trim).toBe(12)
    expect(arrowheadGeometry('circle', tip, 0, 12).parts[0].filled).toBe(false)
  })

  it('diamonds run from the tip back one size along the shaft', () => {
    const { trim, parts } = arrowheadGeometry('diamond', tip, Math.PI, 18) // pointing left
    expect(trim).toBe(18)
    expect(parts[0].points[0]).toEqual(tip)
    expect(close(parts[0].points[2].x, 118)).toBe(true)
    expect(arrowheadGeometry('diamond_outline', tip, 0, 18).parts[0].filled).toBe(false)
  })

  it('bar is perpendicular to the shaft through the tip', () => {
    const [a, b] = arrowheadGeometry('bar', tip, Math.PI / 2, 10).parts[0].points
    expect(close(a.y, tip.y) && close(b.y, tip.y)).toBe(true)
    expect(close(Math.abs(a.x - b.x), 10)).toBe(true)
  })

  it("crow's feet open at the tip; one-or-many adds a bar", () => {
    const many = arrowheadGeometry('crowfoot_many', tip, 0, 16).parts
    expect(many).toHaveLength(1)
    const [left, apex, right] = many[0].points
    expect(close(left.x, tip.x) && close(right.x, tip.x)).toBe(true)
    expect(close(apex.x, tip.x - 16)).toBe(true)
    expect(arrowheadGeometry('crowfoot_one', tip, 0, 16).parts).toHaveLength(1)
    expect(arrowheadGeometry('crowfoot_one_or_many', tip, 0, 16).parts).toHaveLength(2)
    expect(arrowheadGeometry('cross', tip, 0, 12).parts).toHaveLength(2)
  })

  it('none draws nothing', () => {
    expect(arrowheadGeometry('none', tip, 0, 20)).toEqual({ trim: 0, parts: [] })
  })
})

describe('tangents at both ends', () => {
  it('straight: outward along the shaft', () => {
    const { startAngle, endAngle } = arrowEndAngles({ kind: 'straight', start: { x: 0, y: 0 }, end: { x: 10, y: 10 } })
    expect(close(endAngle, Math.PI / 4)).toBe(true)
    expect(close(startAngle, -3 * Math.PI / 4)).toBe(true)
  })

  it('curved: the bezier tangent at each end, not the chord', () => {
    const shaft = { kind: 'curved', start: { x: 0, y: 0 }, c1: { x: 0, y: 100 }, c2: { x: 100, y: 100 }, end: { x: 100, y: 0 } }
    const { startAngle, endAngle } = arrowEndAngles(shaft)
    expect(close(endAngle, -Math.PI / 2)).toBe(true) // arrives going up
    expect(close(startAngle, -Math.PI / 2)).toBe(true) // leaves going down → head points up
  })

  it('curved: falls back when a control point sits on its endpoint', () => {
    const shaft = { kind: 'curved', start: { x: 0, y: 0 }, c1: { x: 50, y: 50 }, c2: { x: 100, y: 0 }, end: { x: 100, y: 0 } }
    expect(close(arrowEndAngles(shaft).endAngle, Math.atan2(-50, 50))).toBe(true)
  })

  it('elbow: horizontal legs, vertical when a leg is degenerate', () => {
    const shaft = { kind: 'elbow', start: { x: 0, y: 0 }, end: { x: 100, y: 80 }, elbowX: 50 }
    const { startAngle, endAngle } = arrowEndAngles(shaft)
    expect(endAngle).toBe(0)
    expect(startAngle).toBe(Math.PI)
    expect(arrowEndAngles({ ...shaft, elbowX: 100 }).endAngle).toBe(Math.PI / 2)
  })
})

describe('shaft trimming', () => {
  it('pulls straight ends back along the shaft', () => {
    const out = trimShaft({ kind: 'straight', start: { x: 0, y: 0 }, end: { x: 100, y: 0 } }, 5, 10)
    expect(out.start).toEqual({ x: 5, y: 0 })
    expect(out.end).toEqual({ x: 90, y: 0 })
  })

  it('cuts curves at the trim distance and keeps the curve', () => {
    const shaft = { kind: 'curved', start: { x: 0, y: 0 }, c1: { x: 0, y: 100 }, c2: { x: 100, y: 100 }, end: { x: 100, y: 0 } }
    const out = trimShaft(shaft, 0, 12)
    expect(close(dist(out.end, shaft.end), 12, 1e-3)).toBe(true)
    expect(out.start).toEqual(shaft.start)
  })

  it('shortens elbow legs only', () => {
    const out = trimShaft({ kind: 'elbow', start: { x: 0, y: 0 }, end: { x: 100, y: 80 }, elbowX: 50 }, 0, 10)
    expect(out.end).toEqual({ x: 90, y: 80 })
    expect(out.elbowX).toBe(50)
  })

  it('splitCubic halves share the split point', () => {
    const [l, r] = splitCubic({ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 0 }, 0.5)
    expect(l[3]).toEqual(r[0])
    expect(l[3]).toEqual({ x: 5, y: 7.5 })
  })
})

describe('layout', () => {
  it('puts each head on its endpoint and trims only for closed heads', () => {
    const shaft = { kind: 'straight', start: { x: 0, y: 0 }, end: { x: 200, y: 0 } }
    const open = layoutArrowheads(shaft, { startArrowhead: 'none', endArrowhead: 'arrow' })
    expect(open.shaft.end).toEqual({ x: 200, y: 0 })
    expect(open.end.parts[0].points[1]).toEqual({ x: 200, y: 0 })
    const closed = layoutArrowheads(shaft, { startArrowhead: 'dot', endArrowhead: 'triangle', strokeWidth: 2 })
    expect(closed.shaft.end.x).toBeCloseTo(200 - closed.end.trim)
    expect(closed.shaft.start.x).toBeCloseTo(closed.start.trim)
    expect(closed.start.parts[0].center.x).toBeGreaterThan(0)
  })

  it('emits SVG path data for each shaft kind', () => {
    expect(shaftPathData({ kind: 'straight', start: { x: 0, y: 0 }, end: { x: 5, y: 5 } })).toBe('M 0 0 L 5 5')
    expect(shaftPathData({ kind: 'curved', start: { x: 0, y: 0 }, c1: { x: 1, y: 1 }, c2: { x: 2, y: 2 }, end: { x: 3, y: 3 } })).toBe('M 0 0 C 1 1, 2 2, 3 3')
    expect(shaftPathData({ kind: 'elbow', start: { x: 0, y: 0 }, end: { x: 100, y: 100 }, elbowX: 50 }, 0)).toBe('M 0 0 H 50 V 100 H 100')
  })
})

describe('rendering with RoughJS', () => {
  function fakeRc() {
    const calls = []
    const node = (kind, args) => { calls.push({ kind, args }); return { kind } }
    return {
      calls,
      linearPath: (...a) => node('linearPath', a),
      polygon: (...a) => node('polygon', a),
      circle: (...a) => node('circle', a),
    }
  }

  it('fills solid heads with the stroke colour, never dashes, and passes the seed', () => {
    const rc = fakeRc()
    const geometry = arrowheadGeometry('triangle', { x: 10, y: 0 }, 0, 10)
    renderArrowhead(rc, geometry, { stroke: '#e03131', strokeWidth: 2, roughness: 1, seed: 42 })
    const opts = rc.calls[0].args[1]
    expect(rc.calls[0].kind).toBe('polygon')
    expect(opts).toMatchObject({ stroke: '#e03131', fill: '#e03131', fillStyle: 'solid', seed: 42, roughness: 1 })
    expect(opts.strokeLineDash).toBeUndefined()
  })

  it('leaves outline heads unfilled and draws open heads as polylines', () => {
    const rc = fakeRc()
    renderArrowhead(rc, arrowheadGeometry('circle', { x: 10, y: 0 }, 0, 10), { stroke: '#000', strokeWidth: 2, seed: 1 })
    renderArrowhead(rc, arrowheadGeometry('arrow', { x: 10, y: 0 }, 0, 10), { stroke: '#000', strokeWidth: 2, seed: 1 })
    expect(rc.calls.map(c => c.kind)).toEqual(['circle', 'linearPath'])
    expect(rc.calls[0].args[3].fill).toBeUndefined()
  })

  it('is deterministic for the same inputs', () => {
    const a = fakeRc()
    const b = fakeRc()
    const g = arrowheadGeometry('diamond', { x: 10, y: 5 }, 1, 14)
    renderArrowhead(a, g, { stroke: '#000', strokeWidth: 2, seed: 7 })
    renderArrowhead(b, g, { stroke: '#000', strokeWidth: 2, seed: 7 })
    expect(a.calls).toEqual(b.calls)
    vi.restoreAllMocks()
  })
})
