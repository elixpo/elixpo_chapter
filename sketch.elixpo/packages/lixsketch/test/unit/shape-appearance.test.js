import { describe, expect, it, vi } from 'vitest'
import {
  adaptiveRadius,
  applyAppearance,
  captureAppearance,
  cornerRadiusFor,
  getNextShapeOpacity,
  initNewShapeAppearance,
  normalizeEdges,
  normalizeOpacity,
  readAppearance,
  rectOutlinePoint,
  roughRectangle,
  roundedRectPath,
  serializeAppearance,
  setNextShapeOpacity,
  syncOpacityToDom,
} from '../../src/core/ShapeAppearance.js'

function el(cls) {
  const attrs = new Map()
  if (cls) attrs.set('class', cls)
  return {
    getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
    setAttribute: (k, v) => attrs.set(k, String(v)),
    removeAttribute: (k) => attrs.delete(k),
    attrs,
  }
}

function shapeWith(children, extra = {}) {
  return { shapeName: 'rectangle', width: 200, height: 100, group: { children }, draw: vi.fn(), ...extra }
}

describe('normalization', () => {
  it('clamps opacity, reads percentages and defaults to 1', () => {
    expect(normalizeOpacity(0.5)).toBe(0.5)
    expect(normalizeOpacity(40)).toBe(0.4)
    expect(normalizeOpacity('30%')).toBe(0.3)
    expect(normalizeOpacity(-1)).toBe(0)
    expect(normalizeOpacity(undefined)).toBe(1)
    expect(normalizeOpacity('nope')).toBe(1)
    expect(normalizeOpacity(0)).toBe(0)
  })

  it('only knows sharp and round edges', () => {
    expect(normalizeEdges('round')).toBe('round')
    expect(normalizeEdges('rounded')).toBe('sharp')
    expect(normalizeEdges(undefined)).toBe('sharp')
  })
})

describe('serialized appearance', () => {
  it('omits defaults so older scenes stay identical', () => {
    expect(serializeAppearance({ shapeName: 'rectangle' })).toEqual({})
    expect(serializeAppearance({ shapeName: 'rectangle', opacity: 1, edges: 'sharp' })).toEqual({})
    expect(serializeAppearance({ shapeName: 'rectangle', opacity: 0.3, edges: 'round' })).toEqual({ opacity: 0.3, edges: 'round' })
  })

  it('never writes edges for shapes that cannot round', () => {
    expect(serializeAppearance({ shapeName: 'circle', opacity: 0.5, edges: 'round' })).toEqual({ opacity: 0.5 })
    expect(serializeAppearance({ shapeName: 'frame', edges: 'round' })).toEqual({ edges: 'round' })
  })

  it('reads missing fields as opacity 1 / sharp', () => {
    expect(readAppearance({ type: 'rectangle' })).toEqual({ opacity: 1, edges: 'sharp' })
    expect(readAppearance({ type: 'image', opacity: 0.2 })).toEqual({ opacity: 0.2 })
  })
})

describe('adaptive radius', () => {
  it('is 25% of the shorter side up to 128px, then 32px', () => {
    expect(adaptiveRadius(200, 40)).toBe(10)
    expect(adaptiveRadius(128, 500)).toBe(32)
    expect(adaptiveRadius(400, 300)).toBe(32)
    expect(adaptiveRadius(0, 50)).toBe(0)
  })

  it('applies only to round rectangles and frames', () => {
    expect(cornerRadiusFor({ shapeName: 'rectangle', width: 80, height: 60, edges: 'round' })).toBe(15)
    expect(cornerRadiusFor({ shapeName: 'rectangle', width: 80, height: 60, edges: 'sharp' })).toBe(0)
    expect(cornerRadiusFor({ shapeName: 'circle', width: 80, height: 60, edges: 'round' })).toBe(0)
  })
})

describe('rounded rectangle path', () => {
  function numbers(d) {
    return d.match(/-?\d+(\.\d+)?/g).map(Number)
  }

  it('is a closed path of straight edges joined by corner curves', () => {
    const d = roundedRectPath(100, 60, 15)
    expect(d.startsWith('M 15 0')).toBe(true)
    expect(d.endsWith('Z')).toBe(true)
    expect(d.match(/Q/g)).toHaveLength(4)
    expect(d.match(/L/g)).toHaveLength(4)
    // Every coordinate stays inside the box.
    for (const n of numbers(d)) expect(n).toBeGreaterThanOrEqual(0)
    expect(Math.max(...numbers(d))).toBe(100)
    // Corner control points sit on the box corners.
    expect(d).toContain('Q 100 0, 100 15')
    expect(d).toContain('Q 100 60, 85 60')
    expect(d).toContain('Q 0 60, 0 45')
    expect(d).toContain('Q 0 0, 15 0')
  })

  it('caps the radius at half the shorter side', () => {
    expect(roundedRectPath(40, 10, 32)).toContain('M 5 0')
  })

  it('falls back to a plain rectangle path at radius 0', () => {
    expect(roundedRectPath(50, 20, 0)).toBe('M 0 0 L 50 0 L 50 20 L 0 20 Z')
  })

  it('renders with RoughJS path for round edges and rectangle otherwise', () => {
    const rc = { path: vi.fn(() => 'path'), rectangle: vi.fn(() => 'rect') }
    expect(roughRectangle(rc, 100, 60, { fill: 'x' }, 'round')).toBe('path')
    expect(rc.path).toHaveBeenCalledWith(roundedRectPath(100, 60, 15), { fill: 'x' })
    expect(roughRectangle(rc, 100, 60, {}, 'sharp')).toBe('rect')
    expect(rc.rectangle).toHaveBeenCalledWith(0, 0, 100, 60, {})
  })
})

describe('outline points for arrow bindings', () => {
  it('keeps straight-edge points unchanged', () => {
    expect(rectOutlinePoint(100, 60, 15, 'top', 50)).toEqual({ x: 50, y: 0 })
    expect(rectOutlinePoint(100, 60, 15, 'right', 30)).toEqual({ x: 100, y: 30 })
    expect(rectOutlinePoint(100, 60, 0, 'bottom', 3)).toEqual({ x: 3, y: 60 })
  })

  it('moves corner points onto the quadratic corner curve', () => {
    const r = 15
    const p = rectOutlinePoint(100, 60, r, 'top', 5)
    // B(t) = (t²r, (1-t)²r) for the top-left corner.
    const t = Math.sqrt(5 / r)
    expect(p.x).toBe(5)
    expect(p.y).toBeCloseTo((1 - t) ** 2 * r)
    expect(rectOutlinePoint(100, 60, r, 'top', 0)).toEqual({ x: 0, y: r })
  })

  it('is symmetric across all four corners', () => {
    const tl = rectOutlinePoint(100, 60, 15, 'top', 4)
    const tr = rectOutlinePoint(100, 60, 15, 'top', 96)
    const bl = rectOutlinePoint(100, 60, 15, 'bottom', 4)
    const lt = rectOutlinePoint(100, 60, 15, 'left', 4)
    const rb = rectOutlinePoint(100, 60, 15, 'right', 56)
    expect(tr.y).toBeCloseTo(tl.y)
    expect(bl.y).toBeCloseTo(60 - tl.y)
    expect(lt.x).toBeCloseTo(tl.y)
    expect(rb.x).toBeCloseTo(100 - tl.y)
  })

  it('returns null for non-edge sides', () => {
    expect(rectOutlinePoint(100, 60, 15, 'center', 0)).toBeNull()
  })
})

describe('applying opacity to the DOM', () => {
  it('fades content but not selection controls', () => {
    const body = el()
    const label = el('shape-label')
    const anchor = el('anchor')
    const outline = el('selection-outline')
    const shape = shapeWith([body, label, anchor, outline], { opacity: 0.4 })
    syncOpacityToDom(shape)
    expect(body.getAttribute('opacity')).toBe('0.4')
    expect(label.getAttribute('opacity')).toBe('0.4')
    expect(anchor.getAttribute('opacity')).toBeNull()
    expect(outline.getAttribute('opacity')).toBeNull()
  })

  it('frame opacity fades only the frame; shapes inside keep their own', () => {
    // Frame children live in the frame's clipGroup, a sibling of frame.group.
    const border = el()
    const title = el('frame-label')
    const frame = shapeWith([border, title], { shapeName: 'frame', opacity: 0.5 })
    const childBody = el()
    const child = shapeWith([childBody], { opacity: 0.3, parentFrame: frame })
    const plainBody = el()
    const plain = shapeWith([plainBody], { parentFrame: frame })
    frame.clipGroup = { children: [child.group, plain.group] }

    syncOpacityToDom(frame)
    syncOpacityToDom(child)
    syncOpacityToDom(plain)
    expect(border.getAttribute('opacity')).toBe('0.5')
    expect(title.getAttribute('opacity')).toBe('0.5')
    expect(childBody.getAttribute('opacity')).toBe('0.3')
    expect(plainBody.getAttribute('opacity')).toBeNull()

    // Changing the frame does not touch its children, and vice versa.
    frame.opacity = 1
    syncOpacityToDom(frame)
    expect(border.getAttribute('opacity')).toBeNull()
    expect(childBody.getAttribute('opacity')).toBe('0.3')
    child.opacity = 0.7
    syncOpacityToDom(child)
    expect(childBody.getAttribute('opacity')).toBe('0.7')
    expect(border.getAttribute('opacity')).toBeNull()
  })

  it('multiplies with a renderer’s own opacity and restores it at 100%', () => {
    const shade = el()
    shade.setAttribute('opacity', '0.5')
    const shape = shapeWith([shade], { opacity: 0.5 })
    syncOpacityToDom(shape)
    expect(shade.getAttribute('opacity')).toBe('0.25')
    syncOpacityToDom(shape) // idempotent
    expect(shade.getAttribute('opacity')).toBe('0.25')
    shape.opacity = 1
    syncOpacityToDom(shape)
    expect(shade.getAttribute('opacity')).toBe('0.5')
    expect(shade.getAttribute('data-lix-opacity')).toBeNull()
  })

  it('redraws only when the edges change', () => {
    const shape = shapeWith([], { opacity: 1, edges: 'sharp' })
    applyAppearance(shape, { opacity: 0.7 })
    expect(shape.draw).not.toHaveBeenCalled()
    applyAppearance(shape, { edges: 'round' })
    expect(shape.draw).toHaveBeenCalledTimes(1)
    expect(captureAppearance(shape)).toEqual({ opacity: 0.7, edges: 'round' })
  })

  it('gives new shapes the panel opacity but keeps an explicit one', () => {
    setNextShapeOpacity(60)
    expect(getNextShapeOpacity()).toBe(0.6)
    const fresh = { shapeName: 'line', group: { children: [] } }
    initNewShapeAppearance(fresh)
    expect(fresh.opacity).toBe(0.6)
    const pasted = { shapeName: 'line', opacity: 0.2, group: { children: [] } }
    initNewShapeAppearance(pasted)
    expect(pasted.opacity).toBe(0.2)
    setNextShapeOpacity(1)
  })
})
