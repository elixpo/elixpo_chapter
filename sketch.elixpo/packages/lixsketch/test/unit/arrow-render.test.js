import { beforeEach, describe, expect, it } from 'vitest'

// Minimal DOM + RoughJS stand-ins so the real Arrow class can render.
function node(name) {
  const attrs = new Map()
  return {
    name,
    children: [],
    parentNode: null,
    attrs,
    setAttribute(k, v) { attrs.set(k, String(v)) },
    getAttribute(k) { return attrs.has(k) ? attrs.get(k) : null },
    removeAttribute(k) { attrs.delete(k) },
    addEventListener() {},
    appendChild(child) {
      child.parentNode?.removeChild(child)
      this.children.push(child)
      child.parentNode = this
      return child
    },
    removeChild(child) {
      this.children = this.children.filter(c => c !== child)
      child.parentNode = null
      return child
    },
    replaceChild(next, prev) {
      const i = this.children.indexOf(prev)
      next.parentNode?.removeChild(next)
      this.children[i] = next
      next.parentNode = this
      prev.parentNode = null
      return prev
    },
    remove() { this.parentNode?.removeChild(this) },
  }
}

const roughCalls = []
const generator = {
  path: (d, o) => { roughCalls.push({ kind: 'path', d, o }); return node('rough-path') },
  linearPath: (pts, o) => { roughCalls.push({ kind: 'linearPath', pts, o }); return node('rough-linear') },
  polygon: (pts, o) => { roughCalls.push({ kind: 'polygon', pts, o }); return node('rough-polygon') },
  circle: (x, y, d, o) => { roughCalls.push({ kind: 'circle', x, y, d, o }); return node('rough-circle') },
}

globalThis.document = { createElementNS: (_ns, name) => node(name), querySelectorAll: () => [], addEventListener() {} }
globalThis.window = { getComputedStyle: () => ({ backgroundColor: '#fff' }) }
globalThis.svg = node('svg')
globalThis.rough = { svg: () => generator }
globalThis.currentZoom = 1
globalThis.shapes = []

const { Arrow } = await import('../../src/shapes/Arrow.js')

const drawCalls = (arrow) => {
  roughCalls.length = 0
  arrow.draw()
  return JSON.parse(JSON.stringify(roughCalls))
}

beforeEach(() => { roughCalls.length = 0 })

describe('Arrow rendering', () => {
  it('defaults to no start head and an open arrow at the end', () => {
    const arrow = new Arrow({ x: 0, y: 0 }, { x: 200, y: 0 }, { stroke: '#1e1e1e' })
    expect(arrow.startArrowhead).toBe('none')
    expect(arrow.endArrowhead).toBe('arrow')
    const calls = drawCalls(arrow)
    expect(calls.map(c => c.kind)).toEqual(['path', 'linearPath'])
    // The V head meets the shaft tip exactly.
    expect(calls[1].pts[1]).toEqual([200, 0])
  })

  it('maps legacy arrowHeadStyle options and keeps head keys out of RoughJS options', () => {
    const arrow = new Arrow({ x: 0, y: 0 }, { x: 100, y: 0 }, { arrowHeadStyle: 'solid' })
    expect(arrow.endArrowhead).toBe('triangle')
    expect(arrow.options).not.toHaveProperty('arrowHeadStyle')
    expect(arrow.options).not.toHaveProperty('endArrowhead')
    expect(arrow.arrowHeadStyle).toBe('triangle') // legacy alias
  })

  it('derives dash and curve from outline/curve fields and keeps them out of options', () => {
    // Scenes from the DSL / MCP / AI carry only these top-level fields, with
    // no stored strokeDasharray or control points; the deserializer passes
    // them to the constructor.
    const arrow = new Arrow({ x: 0, y: 0 }, { x: 300, y: 100 }, { arrowOutlineStyle: 'dashed', arrowCurved: 'curved', arrowCurveAmount: 60 })
    expect(arrow.arrowOutlineStyle).toBe('dashed')
    expect(arrow.options.strokeDasharray).toBe('10,10')
    expect(arrow.arrowCurved).toBe('curved')
    expect(arrow.arrowCurveAmount).toBe(60)
    expect(arrow.controlPoint1).toBeTruthy()
    expect(arrow.controlPoint2).toBeTruthy()
    for (const key of ['arrowOutlineStyle', 'arrowCurved', 'arrowCurveAmount', 'controlPoint1', 'controlPoint2']) {
      expect(arrow.options).not.toHaveProperty(key)
    }
    const cp = { x: 10, y: 80 }
    expect(new Arrow({ x: 0, y: 0 }, { x: 1, y: 1 }, { arrowCurved: 'curved', controlPoint1: cp, controlPoint2: cp }).controlPoint1).toEqual(cp)
  })

  it('uses one stable seed so redraws are identical', () => {
    const arrow = new Arrow({ x: 0, y: 0 }, { x: 150, y: 40 }, { startArrowhead: 'diamond', endArrowhead: 'triangle' })
    const seed = arrow.options.seed
    expect(Number.isInteger(seed) && seed > 0).toBe(true)
    const first = drawCalls(arrow)
    const second = drawCalls(arrow)
    expect(second).toEqual(first)
    expect(first.every(c => c.o.seed === seed)).toBe(true)
    // A restored arrow keeps its saved seed.
    expect(new Arrow({ x: 0, y: 0 }, { x: 1, y: 1 }, { seed: 99 }).options.seed).toBe(99)
  })

  it('dashes only the shaft; heads stay solid and filled with the stroke', () => {
    const arrow = new Arrow({ x: 0, y: 0 }, { x: 200, y: 0 }, { stroke: '#2f9e44', arrowOutlineStyle: 'dashed', endArrowhead: 'triangle' })
    const [shaft, head] = drawCalls(arrow)
    expect(shaft.o.strokeLineDash).toEqual([10, 10])
    expect(head.kind).toBe('polygon')
    expect(head.o.strokeLineDash).toBeUndefined()
    expect(head.o).toMatchObject({ fill: '#2f9e44', fillStyle: 'solid' })
  })

  it('trims the shaft behind closed heads at both ends', () => {
    const arrow = new Arrow({ x: 0, y: 0 }, { x: 200, y: 0 }, { startArrowhead: 'dot', endArrowhead: 'triangle' })
    const [shaft, dot, triangle] = drawCalls(arrow)
    const [, startX, endX] = shaft.d.match(/^M ([\d.]+) [\d.]+ L ([\d.]+)/).map(Number)
    // Shaft starts at the far side of the dot and ends at the triangle's base.
    expect(startX).toBeCloseTo(dot.d)
    expect(endX).toBeLessThan(200)
    expect(Math.min(...triangle.pts.slice(1).map(p => p[0]))).toBeCloseTo(endX)
  })

  it('scales heads with stroke width', () => {
    const thin = new Arrow({ x: 0, y: 0 }, { x: 300, y: 0 }, { strokeWidth: 1 })
    const thick = new Arrow({ x: 0, y: 0 }, { x: 300, y: 0 }, { strokeWidth: 6 })
    const wing = (a) => 300 - drawCalls(a)[1].pts[0][0]
    expect(wing(thick)).toBeGreaterThan(wing(thin))
  })

  it('keeps heads on the tips after the arrow moves', () => {
    const arrow = new Arrow({ x: 0, y: 0 }, { x: 100, y: 0 }, { startArrowhead: 'arrow', endArrowhead: 'arrow' })
    arrow.startPoint = { x: 10, y: 10 }
    arrow.endPoint = { x: 110, y: 60 }
    roughCalls.length = 0
    arrow._updatePathElement() // the drag fast path
    const heads = roughCalls.filter(c => c.kind === 'linearPath')
    expect(heads[0].pts[1]).toEqual([10, 10])
    expect(heads[1].pts[1]).toEqual([110, 60])
  })

  it('aims curved heads along the curve tangent, not the chord', () => {
    const arrow = new Arrow({ x: 0, y: 0 }, { x: 100, y: 0 }, {
      arrowCurved: 'curved', controlPoint1: { x: 0, y: 80 }, controlPoint2: { x: 100, y: 80 },
    })
    const head = drawCalls(arrow).find(c => c.kind === 'linearPath')
    const [a, tip, b] = head.pts
    expect(tip).toEqual([100, 0])
    // Arriving straight up: both wings sit below the tip, symmetric in x.
    expect(a[1]).toBeGreaterThan(0)
    expect(b[1]).toBeGreaterThan(0)
    expect(a[0] - 100).toBeCloseTo(100 - b[0])
  })

  it('aims elbow heads along the last horizontal leg', () => {
    const arrow = new Arrow({ x: 0, y: 0 }, { x: 100, y: 80 }, { arrowCurved: 'elbow' })
    const head = drawCalls(arrow).find(c => c.kind === 'linearPath')
    const [a, tip, b] = head.pts
    expect(tip).toEqual([100, 80])
    expect(a[0]).toBeLessThan(100)
    expect(a[1] - 80).toBeCloseTo(-(b[1] - 80))
  })

  it('updateStyle sets heads without polluting options and swaps cleanly', () => {
    const arrow = new Arrow({ x: 0, y: 0 }, { x: 100, y: 0 }, {})
    arrow.updateStyle({ startArrowhead: 'bar', endArrowhead: 'crowfoot_many' })
    expect([arrow.startArrowhead, arrow.endArrowhead]).toEqual(['bar', 'crowfoot_many'])
    expect(arrow.options).not.toHaveProperty('startArrowhead')
    arrow.updateStyle({ startArrowhead: arrow.endArrowhead, endArrowhead: arrow.startArrowhead })
    expect([arrow.startArrowhead, arrow.endArrowhead]).toEqual(['crowfoot_many', 'bar'])
  })
})
