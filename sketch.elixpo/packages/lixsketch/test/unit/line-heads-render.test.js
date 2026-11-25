import { beforeEach, describe, expect, it, vi } from 'vitest'

function node(name) {
  const attrs = new Map()
  return {
    name,
    children: [],
    parentNode: null,
    attrs,
    style: {},
    get firstChild() { return this.children[0] || null },
    setAttribute(k, v) { attrs.set(k, String(v)) },
    getAttribute(k) { return attrs.has(k) ? attrs.get(k) : null },
    removeAttribute(k) { attrs.delete(k) },
    addEventListener() {},
    removeEventListener() {},
    querySelector: () => null,
    appendChild(child) {
      child.parentNode?.removeChild(child)
      this.children.push(child)
      child.parentNode = this
      return child
    },
    insertBefore(child, before) {
      child.parentNode?.removeChild(child)
      const i = this.children.indexOf(before)
      this.children.splice(i < 0 ? 0 : i, 0, child)
      child.parentNode = this
      return child
    },
    removeChild(child) {
      this.children = this.children.filter(c => c !== child)
      child.parentNode = null
      return child
    },
  }
}

const calls = []
const generator = {
  line: (x1, y1, x2, y2, o) => { calls.push({ kind: 'line', pts: [x1, y1, x2, y2], o }); return node('rough-line') },
  linearPath: (pts, o) => { calls.push({ kind: 'linearPath', pts, o }); return node('rough-linear') },
  polygon: (pts, o) => { calls.push({ kind: 'polygon', pts, o }); return node('rough-polygon') },
  circle: (x, y, d, o) => { calls.push({ kind: 'circle', x, y, d, o }); return node('rough-circle') },
}

globalThis.document = { createElementNS: (_ns, n) => node(n), querySelectorAll: () => [], addEventListener: vi.fn(), getElementById: () => null, body: { classList: { contains: () => true } } }
globalThis.window = { getComputedStyle: () => ({ backgroundColor: '#fff' }), currentZoom: 1 }
globalThis.svg = node('svg')
globalThis.rough = { svg: () => generator }
globalThis.currentZoom = 1
globalThis.shapes = []
globalThis.currentShape = null

const { Line } = await import('../../src/shapes/Line.js')

function render(line) {
  calls.length = 0
  line.draw()
  return JSON.parse(JSON.stringify(calls))
}

beforeEach(() => { calls.length = 0 })

describe('Line arrowheads', () => {
  it('draws no heads by default and keeps the plain shaft', () => {
    const line = new Line({ x: 0, y: 0 }, { x: 100, y: 0 }, { stroke: '#000' })
    expect([line.startArrowhead, line.endArrowhead]).toEqual(['none', 'none'])
    const out = render(line)
    expect(out.map(c => c.kind)).toEqual(['line'])
    expect(out[0].pts).toEqual([0, 0, 100, 0])
  })

  it('renders heads with the line seed, solid, and trims the shaft behind closed heads', () => {
    const line = new Line({ x: 0, y: 0 }, { x: 200, y: 0 }, { stroke: '#e03131', seed: 77, startArrowhead: 'arrow', endArrowhead: 'triangle' })
    expect(line.options).not.toHaveProperty('endArrowhead')
    const out = render(line)
    expect(out.map(c => c.kind)).toEqual(['line', 'linearPath', 'polygon'])
    const [shaft, start, end] = out
    expect(shaft.pts[0]).toBe(0) // open arrow: no trim
    expect(shaft.pts[2]).toBeLessThan(200) // triangle: trimmed
    expect(start.pts[1]).toEqual([0, 0])
    expect(end.pts[0]).toEqual([200, 0])
    expect(start.o.seed).toBe(77)
    expect(end.o).toMatchObject({ seed: 77, fill: '#e03131', fillStyle: 'solid' })
    expect(render(line)).toEqual(out) // stable across redraws
  })

  it('keeps heads solid on dashed lines', () => {
    const line = new Line({ x: 0, y: 0 }, { x: 200, y: 0 }, { strokeDasharray: '5,5', endArrowhead: 'arrow' })
    const out = render(line)
    expect(out.map(c => c.kind)).toEqual(['linearPath'])
    expect(out[0].o.strokeLineDash).toBeUndefined()
    const shaft = line.element
    expect(shaft.getAttribute('stroke-dasharray')).toBe('5,5')
  })

  it('aims heads along the curve tangent of a curved line', () => {
    const line = new Line({ x: 0, y: 0 }, { x: 100, y: 0 }, { endArrowhead: 'arrow', startArrowhead: 'arrow' })
    line.isCurved = true
    line.controlPoint = { x: 50, y: 100 }
    const out = render(line)
    const heads = out.filter(c => c.kind === 'linearPath')
    const [a, tip, b] = heads[1].pts
    expect(tip).toEqual([100, 0])
    // End tangent of the quadratic is (E - Q) = (50, -100): wings sit below-left
    const angle = Math.atan2(-100, 50)
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
    expect(Math.atan2(tip[1] - mid[1], tip[0] - mid[0])).toBeCloseTo(angle, 5)
    expect(heads[0].pts[1]).toEqual([0, 0])
    // The shaft is the trimmed curve as a cubic path.
    expect(line.element.getAttribute('d')).toMatch(/^M 0 0 C /)
  })

  it('moves heads with the drag fast path', () => {
    const line = new Line({ x: 0, y: 0 }, { x: 100, y: 0 }, { endArrowhead: 'dot' })
    line.endPoint = { x: 150, y: 50 }
    calls.length = 0
    line.updateLineElement()
    const dot = calls.find(c => c.kind === 'circle')
    expect(Math.hypot(dot.x - 150, dot.y - 50)).toBeCloseTo(dot.d / 2)
  })
})
