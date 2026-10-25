import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

// Minimal SVG/DOM stand-ins: the shapes only need attributes, children and
// event registration. Text width comes from an injected measurer.
function node(name) {
  const listeners = new Map()
  return {
    name,
    tagName: name,
    children: [],
    parentNode: null,
    attributes: new Map(),
    style: {},
    listeners,
    get firstChild() { return this.children[0] || null },
    get nextSibling() {
      if (!this.parentNode) return null
      const siblings = this.parentNode.children
      return siblings[siblings.indexOf(this) + 1] || null
    },
    setAttribute(key, value) { this.attributes.set(key, String(value)) },
    getAttribute(key) { return this.attributes.get(key) ?? null },
    appendChild(child) {
      child.parentNode?.removeChild?.(child)
      this.children.push(child)
      child.parentNode = this
      return child
    },
    insertBefore(child, before) {
      child.parentNode?.removeChild?.(child)
      const index = this.children.indexOf(before)
      this.children.splice(index < 0 ? 0 : index, 0, child)
      child.parentNode = this
      return child
    },
    removeChild(child) {
      this.children = this.children.filter(candidate => candidate !== child)
      child.parentNode = null
      return child
    },
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, [])
      listeners.get(type).push(handler)
    },
    removeEventListener: vi.fn(),
    dispatch(type, event = {}) {
      for (const handler of listeners.get(type) || []) {
        handler({ preventDefault() {}, stopPropagation() {}, ...event })
      }
    },
    querySelector: () => null,
    querySelectorAll: () => [],
    focus: vi.fn(),
    blur() { this.dispatch('blur') },
    // Identity CTM: local coordinates are screen coordinates.
    getScreenCTM: () => ({}),
    cloneNode() { return node(name) },
    outerHTML: `<${name}></${name}>`,
  }
}

const svgNode = node('svg')
svgNode.ownerDocument = { importNode: n => n }
svgNode.createSVGPoint = () => ({
  x: 0,
  y: 0,
  matrixTransform() { return { x: this.x, y: this.y } },
})

const body = node('body')
body.classList = { contains: () => true }

globalThis.document = {
  addEventListener: vi.fn(),
  getElementById: id => (id === 'freehand-canvas' ? svgNode : null),
  querySelectorAll: () => [],
  createElementNS: (_namespace, name) => node(name),
  createElement: name => node(name),
  createRange: () => ({ selectNodeContents: vi.fn() }),
  body,
}
globalThis.CustomEvent = class CustomEvent { constructor(type) { this.type = type } }
globalThis.window = {
  currentZoom: 1,
  svg: svgNode,
  getComputedStyle: () => ({ backgroundColor: '#000' }),
  getSelection: () => ({ removeAllRanges: vi.fn(), addRange: vi.fn() }),
  dispatchEvent: vi.fn(),
}
globalThis.svg = svgNode
globalThis.shapes = []
window.shapes = globalThis.shapes
globalThis.currentShape = null
globalThis.currentZoom = 1
globalThis.rough = {
  svg: () => ({
    rectangle: () => node('rough-rect'),
    ellipse: () => node('rough-ellipse'),
  }),
}

class BasicShape {
  constructor(shapeName) {
    this.shapeName = shapeName
    this.group = node('g')
    this.options = {}
  }
}

// Only rectangles and circles are under test; keep the other shape modules
// (and their DOM/CDN side effects) out of the serializer import graph.
vi.mock('../../src/shapes/Line.js', () => ({ Line: class extends BasicShape { constructor() { super('line') } } }))
vi.mock('../../src/shapes/Arrow.js', () => ({ Arrow: class extends BasicShape { constructor() { super('arrow') } } }))
vi.mock('../../src/shapes/FreehandStroke.js', () => ({ FreehandStroke: class extends BasicShape { constructor() { super('freehandStroke') } } }))
vi.mock('../../src/shapes/Frame.js', () => ({ Frame: class extends BasicShape { constructor() { super('frame') } } }))
vi.mock('../../src/shapes/TextShape.js', () => ({ TextShape: class {} }))
vi.mock('../../src/shapes/CodeShape.js', () => ({ CodeShape: class {} }))
vi.mock('../../src/shapes/IconShape.js', () => ({ IconShape: class {} }))
vi.mock('../../src/shapes/ImageShape.js', () => ({ ImageShape: class {} }))

const { setShapeLabelMeasurer, SHAPE_LABEL_PADDING_X, SHAPE_LABEL_PADDING_Y } = await import('../../src/core/ShapeLabelLayout.js')
const { Rectangle } = await import('../../src/shapes/Rectangle.js')
const { Circle } = await import('../../src/shapes/Circle.js')
const undoRedo = await import('../../src/core/UndoRedo.js')
const serializer = await import('../../src/core/SceneSerializer.js')
const copyPaste = await import('../../src/core/CopyPaste.js')

// 20px font -> 10 units per character, 26 units per line.
const FONT = 20
const LINE = FONT * 1.3
const heightFor = lines => Math.ceil(lines * LINE + 2 * SHAPE_LABEL_PADDING_Y)
setShapeLabelMeasurer((text, fontSize) => [...text].length * fontSize * 0.5)
afterAll(() => setShapeLabelMeasurer(null))

function rect(label = '', width = 100, height = 60) {
  const shape = new Rectangle(10, 20, width, height, { label, labelFontSize: FONT })
  shapes.push(shape)
  return shape
}

function fakeArrowAttachedTo(shape) {
  const arrow = {
    shapeName: 'arrow',
    attachedToStart: { shape },
    attachedToEnd: null,
    updateAttachments: vi.fn(),
    getAttachmentState: () => ({}),
    restoreAttachmentState: vi.fn(),
    startPoint: { x: 0, y: 0 },
    endPoint: { x: 0, y: 0 },
  }
  shapes.push(arrow)
  return arrow
}

function labelLines(shape) {
  return shape.labelElement.children.map(tspan => tspan.textContent)
}

beforeEach(() => {
  shapes.length = 0
  undoRedo.clearUndoHistory()
  body.children = []
})

describe('rectangle label auto-grow', () => {
  it('wraps by default and grows the height while keeping the top-left anchored', () => {
    const shape = rect()
    expect(shape.labelWrap).toBe(true)

    shape.setLabel('aaa bbb ccc ddd')

    expect(labelLines(shape)).toEqual(['aaa', 'bbb', 'ccc', 'ddd'])
    expect(shape.width).toBe(100)
    expect(shape.height).toBe(heightFor(4))
    expect({ x: shape.x, y: shape.y }).toEqual({ x: 10, y: 20 })
    expect({ w: shape.userWidth, h: shape.userHeight }).toEqual({ w: 100, h: 60 })
  })

  it('draws the label on a transparent background (no backdrop rect)', () => {
    const shape = rect('Try now :D')
    expect(shape._labelBg).toBeNull()
    expect(shape.group.children).toContain(shape.labelElement)
    // The label is the last child so it paints above the fill.
    expect(shape.group.children.at(-1)).toBe(shape.labelElement)

    const ellipse = new Circle(200, 200, 60, 40, { label: 'Hi', labelFontSize: FONT })
    shapes.push(ellipse)
    expect(ellipse._labelBg).toBeNull()
    expect(ellipse.group.children.at(-1)).toBe(ellipse.labelElement)
  })

  it('grows the width only for an unbreakable word', () => {
    const shape = rect()
    shape.setLabel('supercalifragilistic')

    expect(shape.width).toBe(200 + 2 * SHAPE_LABEL_PADDING_X)
    expect(shape.height).toBe(60)
    expect(shape.userWidth).toBe(100)
  })

  it('shrinks back toward, but never below, the user size when text is deleted', () => {
    const shape = rect()
    shape.setLabel('aaa bbb ccc ddd eee fff')
    expect(shape.height).toBe(heightFor(6))

    shape.setLabel('aaa bbb ccc')
    expect(shape.height).toBe(heightFor(3))

    shape.setLabel('aaa')
    expect(shape.height).toBe(60)
    expect(shape.width).toBe(100)

    shape.setLabel('')
    expect({ w: shape.width, h: shape.height }).toEqual({ w: 100, h: 60 })
  })

  it('re-fits on font size change', () => {
    const shape = rect('aa bb')
    expect(shape.height).toBe(60)

    shape.setLabel('aa bb', null, 40)

    // 40px -> 20 units per char; inner width 68 fits one word (40) per line.
    expect(shape.height).toBe(Math.ceil(2 * 40 * 1.3 + 2 * SHAPE_LABEL_PADDING_Y))
  })

  it('updates attached arrows after label-driven growth', () => {
    const shape = rect()
    const arrow = fakeArrowAttachedTo(shape)
    arrow.updateAttachments.mockClear()

    shape.setLabel('aaa bbb ccc ddd')
    expect(arrow.updateAttachments).toHaveBeenCalled()

    arrow.updateAttachments.mockClear()
    shape.draw()
    expect(arrow.updateAttachments).not.toHaveBeenCalled()
  })

  it('re-wraps live on resize and clamps the height to what the label needs', () => {
    const shape = rect('aaa bbb ccc ddd', 200, 60)
    expect(shape.height).toBe(60)

    // Drag the bottom-right corner to make it narrow and very short.
    shape.updatePosition(3, shape.x + 100, shape.y + 5)
    shape.draw()

    expect(shape.width).toBe(100)
    expect(shape.height).toBe(heightFor(4))
    expect(labelLines(shape)).toEqual(['aaa', 'bbb', 'ccc', 'ddd'])
    expect({ x: shape.x, y: shape.y }).toEqual({ x: 10, y: 20 })
    expect(shape.userHeight).toBe(5)

    // Widen again: the label re-wraps onto one line and the height relaxes.
    shape.updatePosition(3, shape.x + 300, shape.y + 5)
    shape.draw()
    expect(shape.width).toBe(300)
    expect(labelLines(shape)).toEqual(['aaa bbb ccc ddd'])
    expect(shape.height).toBe(heightFor(1))
  })

  it('keeps the fixed edge in place when the clamp stops a top-edge drag', () => {
    const shape = rect('aaa bbb ccc ddd', 100, 200)
    const bottom = shape.y + shape.height

    // Drag the top edge (anchor 4) far below the bottom-up minimum.
    shape.updatePosition(4, shape.x + 50, bottom - 10)

    expect(shape.height).toBe(heightFor(4))
    expect(shape.y + shape.height).toBeCloseTo(bottom)
  })

  it('cannot be made smaller than the label through direct size writes', () => {
    const shape = rect('aaa bbb ccc ddd')
    shape.height = 10
    expect(shape.height).toBe(heightFor(4))
    expect(shape.userHeight).toBe(10)
  })

  it('leaves dense renderer labels (labelBg:false) unmanaged', () => {
    const shape = new Rectangle(0, 0, 100, 20, { label: 'aaa bbb ccc ddd', labelFontSize: FONT, labelBg: false })
    expect({ w: shape.width, h: shape.height }).toEqual({ w: 100, h: 20 })
  })

  it('respects labelWrap:false by growing the width instead', () => {
    const shape = new Rectangle(0, 0, 100, 60, { label: 'aaa bbb ccc ddd', labelFontSize: FONT, labelWrap: false })
    expect(shape.width).toBe(150 + 2 * SHAPE_LABEL_PADDING_X)
    expect(shape.height).toBe(60)
  })
})

describe('label editor', () => {
  it('grows the shape live while typing and records one undo step', () => {
    const shape = rect()
    const arrow = fakeArrowAttachedTo(shape)
    shape.startLabelEdit()

    const overlay = body.children.at(-1)
    const input = overlay.children[0]
    expect(shape._isEditingLabel).toBe(true)

    input.innerText = 'aaa bbb'
    input.dispatch('input')
    expect(shape.height).toBe(heightFor(2))
    expect(shape.labelElement.getAttribute('visibility')).toBe('hidden')

    arrow.updateAttachments.mockClear()
    input.innerText = 'aaa bbb ccc ddd'
    input.dispatch('input')
    expect(shape.height).toBe(heightFor(4))
    expect(arrow.updateAttachments).toHaveBeenCalled()
    // The overlay follows the grown box.
    expect(overlay.style.cssText).toContain(`height: ${heightFor(4)}px`)

    input.dispatch('blur')
    expect(shape._isEditingLabel).toBe(false)
    expect(shape.label).toBe('aaa bbb ccc ddd')
    expect(shape.labelElement.getAttribute('visibility')).toBe('visible')
    expect(body.children).not.toContain(overlay)

    undoRedo.undo()
    expect(shape.label).toBe('')
    expect(shape.height).toBe(60)

    undoRedo.redo()
    expect(shape.label).toBe('aaa bbb ccc ddd')
    expect(shape.height).toBe(heightFor(4))
  })

  it('restores the original label on Escape', () => {
    const shape = rect('aaa')
    shape.startLabelEdit()
    const input = body.children.at(-1).children[0]

    input.innerText = 'aaa bbb ccc ddd'
    input.dispatch('input')
    expect(shape.height).toBe(heightFor(4))

    input.dispatch('keydown', { key: 'Escape' })

    expect(shape.label).toBe('aaa')
    expect(shape.height).toBe(60)
  })
})

describe('undo / redo', () => {
  it('re-fits after undoing and redoing a label change', () => {
    const shape = rect()
    const before = undoRedo.captureLabelState(shape)
    shape.setLabel('aaa bbb ccc ddd', null, 30)
    undoRedo.pushLabelChangeAction(shape, before)

    undoRedo.undo()
    expect(shape.label).toBe('')
    expect(shape.labelFontSize).toBe(FONT)
    expect({ w: shape.width, h: shape.height }).toEqual({ w: 100, h: 60 })

    undoRedo.redo()
    expect(shape.labelFontSize).toBe(30)
    expect(shape.height).toBeGreaterThan(60)
  })

  it('restores the user size, not just the grown size, when undoing a resize', () => {
    const shape = rect('aaa bbb ccc ddd', 200, 60)
    const oldPos = { x: shape.x, y: shape.y, width: shape.width, height: shape.height, userWidth: shape.userWidth, userHeight: shape.userHeight, rotation: 0 }

    shape.updatePosition(3, shape.x + 100, shape.y + 5)
    undoRedo.pushTransformAction(shape, oldPos, { x: shape.x, y: shape.y, width: shape.width, height: shape.height, rotation: 0 })
    expect(shape.height).toBe(heightFor(4))

    undoRedo.undo()
    expect({ w: shape.width, h: shape.height }).toEqual({ w: 200, h: 60 })
    expect({ w: shape.userWidth, h: shape.userHeight }).toEqual({ w: 200, h: 60 })

    undoRedo.redo()
    expect(shape.width).toBe(100)
    expect(shape.userHeight).toBe(5)
    expect(shape.height).toBe(heightFor(4))

    // With the label cleared the redone shape relaxes to its explicit size.
    shape.setLabel('')
    expect(shape.height).toBe(5)
  })
})

describe('circle label auto-grow', () => {
  it('wraps inside the inscribed box and grows with its top-left anchored', () => {
    const circle = new Circle(100, 100, 50, 20, { labelFontSize: FONT })
    shapes.push(circle)
    const top = circle.y - circle.ry
    const left = circle.x - circle.rx

    circle.setLabel('aaa bbb ccc ddd')

    expect(circle.ry).toBeGreaterThan(20)
    expect(circle.rx).toBe(50)
    expect(circle.y - circle.ry).toBeCloseTo(top)
    expect(circle.x - circle.rx).toBeCloseTo(left)
    expect({ rx: circle.userRx, ry: circle.userRy }).toEqual({ rx: 50, ry: 20 })

    // Inner box = 100 * sqrt(1/2) - 32 ~= 38.7 -> one word per line.
    const lines = circle.labelElement.children.map(tspan => tspan.textContent)
    expect(lines).toEqual(['aaa', 'bbb', 'ccc', 'ddd'])

    circle.setLabel('')
    expect({ rx: circle.rx, ry: circle.ry }).toEqual({ rx: 50, ry: 20 })
    expect(circle.y - circle.ry).toBeCloseTo(top)
  })

  it('clamps resize to the label and updates attached arrows', () => {
    const circle = new Circle(100, 100, 80, 80, { label: 'aaa bbb ccc ddd', labelFontSize: FONT })
    shapes.push(circle)
    const arrow = fakeArrowAttachedTo(circle)

    circle.updatePosition(5, circle.x, circle.y + 10)
    expect(circle.userRy).toBe(10)
    expect(circle.ry).toBeGreaterThan(10)
    expect(arrow.updateAttachments).toHaveBeenCalled()
  })
})

describe('serialization', () => {
  it('round-trips label, wrap and user size for rectangles and circles', () => {
    const shape = rect()
    shape.shapeID = 'rect-1'
    shape.setLabel('aaa bbb ccc ddd')
    const circle = new Circle(300, 300, 50, 20, { labelFontSize: FONT })
    circle.shapeID = 'circle-1'
    circle.setLabel('aaa bbb ccc ddd')
    shapes.push(circle)
    const grownRect = { w: shape.width, h: shape.height }
    const grownCircle = { x: circle.x, y: circle.y, rx: circle.rx, ry: circle.ry }

    const scene = serializer.saveScene('Labels')
    expect(scene.shapes[0]).toMatchObject({
      type: 'rectangle',
      label: 'aaa bbb ccc ddd',
      labelWrap: true,
      labelFontSize: FONT,
      width: 100,
      height: heightFor(4),
      userWidth: 100,
      userHeight: 60,
    })
    expect(scene.shapes[1]).toMatchObject({ type: 'circle', userRx: 50, userRy: 20, label: 'aaa bbb ccc ddd' })

    // Through JSON, like autosave and collaboration snapshots.
    expect(serializer.loadScene(JSON.parse(JSON.stringify(scene)))).toBe(true)
    const [loadedRect, loadedCircle] = window.shapes

    expect(loadedRect.label).toBe('aaa bbb ccc ddd')
    expect({ w: loadedRect.width, h: loadedRect.height }).toEqual(grownRect)
    expect({ w: loadedRect.userWidth, h: loadedRect.userHeight }).toEqual({ w: 100, h: 60 })
    expect({ x: loadedCircle.x, y: loadedCircle.y, rx: loadedCircle.rx, ry: loadedCircle.ry }).toEqual(grownCircle)
    expect({ rx: loadedCircle.userRx, ry: loadedCircle.userRy }).toEqual({ rx: 50, ry: 20 })

    // Deleting text after a reload still shrinks back to the user size.
    loadedRect.setLabel('')
    expect({ w: loadedRect.width, h: loadedRect.height }).toEqual({ w: 100, h: 60 })

    expect(serializer.saveScene('Labels').shapes[0]).toMatchObject({ label: '', userWidth: 100, userHeight: 60 })
  })

  it('loads legacy scenes without label or user-size fields', () => {
    const legacy = {
      format: 'lixsketch',
      version: 1,
      shapes: [
        { type: 'rectangle', shapeID: 'old-rect', x: 0, y: 0, width: 180, height: 90, rotation: 0, options: { stroke: '#fff' } },
        { type: 'rectangle', shapeID: 'ai-rect', x: 0, y: 0, width: 100, height: 60, rotation: 0, options: { label: 'aaa bbb ccc ddd', labelFontSize: FONT } },
        { type: 'circle', shapeID: 'old-circle', x: 50, y: 50, rx: 30, ry: 20, rotation: 0, options: {} },
      ],
    }

    expect(serializer.loadScene(legacy)).toBe(true)
    const [plain, aiLabelled, circle] = window.shapes

    expect(plain).toMatchObject({ label: '', labelWrap: true, width: 180, height: 90, userWidth: 180, userHeight: 90 })
    expect(aiLabelled.label).toBe('aaa bbb ccc ddd')
    expect(aiLabelled.userHeight).toBe(60)
    expect(aiLabelled.height).toBe(heightFor(4))
    expect(circle).toMatchObject({ label: '', rx: 30, ry: 20, userRx: 30, userRy: 20 })
  })
})

describe('copy / paste and duplicate', () => {
  function selectForCopy(selected) {
    const pasted = []
    window.multiSelection = {
      selectedShapes: new Set(selected),
      clearSelection: vi.fn(),
      addShape: shape => pasted.push(shape),
      updateControls: vi.fn(),
    }
    return pasted
  }

  afterAll(() => { delete window.multiSelection })

  it('serializes label state and explicit size for clipboard data', () => {
    const shape = rect('aaa bbb ccc ddd')
    shape.labelColor = '#ff8800'
    shape.labelWrap = false
    shape.setUserSize(100, 60)

    expect(copyPaste.serializeShape(shape)).toMatchObject({
      type: 'rectangle',
      label: 'aaa bbb ccc ddd',
      labelWrap: false,
      labelFontSize: FONT,
      labelColor: '#ff8800',
      userWidth: 100,
      userHeight: 60,
    })
  })

  it('pastes (and duplicates) rectangles and circles with labels and user size intact', () => {
    const shape = rect()
    shape.setLabel('aaa bbb ccc ddd', '#ff8800', FONT)
    const circle = new Circle(300, 300, 50, 20, { labelFontSize: FONT })
    circle.setLabel('aaa bbb ccc ddd')
    shapes.push(circle)
    const pasted = selectForCopy([shape, circle])

    expect(copyPaste.copySelected()).toBe(true)
    expect(copyPaste.pasteClipboard()).toBe(true)

    expect(pasted).toHaveLength(2)
    const [pastedRect, pastedCircle] = pasted
    expect(pastedRect).not.toBe(shape)
    expect(pastedRect).toMatchObject({
      label: 'aaa bbb ccc ddd',
      labelColor: '#ff8800',
      labelFontSize: FONT,
      labelWrap: true,
      width: 100,
      height: heightFor(4),
      userWidth: 100,
      userHeight: 60,
    })
    expect(pastedCircle).toMatchObject({
      label: 'aaa bbb ccc ddd',
      rx: circle.rx,
      ry: circle.ry,
      userRx: 50,
      userRy: 20,
    })
    // Paste offsets the copy but must not shift it further by re-growing.
    expect(pastedCircle.x - pastedCircle.rx - (circle.x - circle.rx))
      .toBeCloseTo(pastedRect.x - shape.x)

    // The copy still shrinks back to the original's explicit size.
    pastedRect.setLabel('')
    expect({ w: pastedRect.width, h: pastedRect.height }).toEqual({ w: 100, h: 60 })
    expect(shape.height).toBe(heightFor(4))
  })
})
