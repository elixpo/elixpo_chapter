import { describe, expect, it, vi } from 'vitest'

globalThis.document = {
    addEventListener: vi.fn(),
    getElementById: () => null,
    querySelectorAll: () => [],
    body: { classList: { contains: () => true } },
}
globalThis.window = {}
globalThis.svg = {
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  querySelector: () => null,
  style: {},
}
globalThis.rough = { svg: () => ({}) }

const copyPaste = await import('../../src/core/CopyPaste.js')
const { getCopyRoots, serializeShape } = copyPaste

function rectangle(id, x, y) {
  return {
    shapeID: id,
    shapeName: 'rectangle',
    x,
    y,
    width: 80,
    height: 40,
    rotation: 0,
    options: { stroke: '#fff' },
    parentFrame: null,
  }
}

function frame(id, children = []) {
  const result = {
    shapeID: id,
    shapeName: 'frame',
    x: 10,
    y: 20,
    width: 320,
    height: 220,
    rotation: 0,
    frameName: 'Mermaid diagram',
    options: { stroke: '#888' },
    containedShapes: children,
    parentFrame: null,
    _diagramType: 'mermaid-flowchart',
  }
  children.forEach(child => { child.parentFrame = result })
  return result
}

describe('frame clipboard trees', () => {
  it('serializes every contained shape with its frame', () => {
    const first = rectangle('first', 40, 60)
    const second = rectangle('second', 180, 140)
    const source = frame('frame', [first, second])

    const data = serializeShape(source)

    expect(data.type).toBe('frame')
    expect(data.diagramType).toBe('mermaid-flowchart')
    expect(data.children.map(child => child.type)).toEqual(['rectangle', 'rectangle'])
    expect(data.children.map(child => child.x)).toEqual([40, 180])
  })

  it('does not duplicate children selected together with their frame', () => {
    const child = rectangle('child', 40, 60)
    const source = frame('frame', [child])

    expect(getCopyRoots([source, child])).toEqual([source])
    expect(getCopyRoots([child])).toEqual([child])
  })
})

describe('clipboard appearance', () => {
  it('copies opacity and round edges with the shape and its frame children', () => {
    const child = { ...rectangle('child', 40, 60), opacity: 0.5, edges: 'round' }
    const plain = rectangle('plain', 0, 0)
    const source = frame('frame', [child])
    source.edges = 'round'

    expect(serializeShape(child)).toMatchObject({ opacity: 0.5, edges: 'round' })
    expect(serializeShape(plain)).not.toHaveProperty('opacity')
    expect(serializeShape(plain)).not.toHaveProperty('edges')
    const data = serializeShape(source)
    expect(data.edges).toBe('round')
    expect(data.children[0]).toMatchObject({ opacity: 0.5, edges: 'round' })
  })
})

describe('clipboard line arrowheads', () => {
  it('copies line heads and omits none', () => {
    const base = { shapeName: 'line', startPoint: { x: 0, y: 0 }, endPoint: { x: 5, y: 5 }, options: {}, parentFrame: null }
    expect(serializeShape({ ...base, startArrowhead: 'none', endArrowhead: 'dot' })).toMatchObject({ endArrowhead: 'dot' })
    expect(serializeShape({ ...base, startArrowhead: 'none', endArrowhead: 'dot' })).not.toHaveProperty('startArrowhead')
    expect(serializeShape(base)).not.toHaveProperty('endArrowhead')
  })
})

describe('clipboard arrowheads', () => {
  it('copies both heads, defaulting legacy arrows', () => {
    const base = { shapeName: 'arrow', startPoint: { x: 0, y: 0 }, endPoint: { x: 5, y: 5 }, options: {}, parentFrame: null }
    expect(serializeShape({ ...base, startArrowhead: 'bar', endArrowhead: 'cross' })).toMatchObject({ startArrowhead: 'bar', endArrowhead: 'cross' })
    const legacy = serializeShape(base)
    expect(legacy).toMatchObject({ startArrowhead: 'none', endArrowhead: 'arrow' })
    expect(legacy).not.toHaveProperty('arrowHeadStyle')
  })
})

describe('duplicateSelected', () => {
  it('returns no shapes and leaves the clipboard alone without a selection', () => {
    globalThis.window.multiSelection = { selectedShapes: new Set() }
    expect(copyPaste.duplicateSelected()).toEqual([])
    expect(copyPaste.pasteClipboard()).toBe(false)
    delete globalThis.window.multiSelection
  })
})
