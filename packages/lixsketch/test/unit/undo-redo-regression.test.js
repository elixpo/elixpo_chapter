import { beforeEach, describe, expect, it, vi } from 'vitest'

function node(name) {
  return {
    name,
    children: [],
    parentNode: null,
    appendChild(child) {
      child.parentNode?.removeChild(child)
      this.children.push(child)
      child.parentNode = this
      return child
    },
    removeChild(child) {
      this.children = this.children.filter(candidate => candidate !== child)
      child.parentNode = null
      return child
    },
    remove() { this.parentNode?.removeChild(this) },
  }
}

const defs = node('defs')
const svgNode = node('svg')
svgNode.querySelector = selector => selector === 'defs' ? defs : null
svgNode.insertBefore = child => svgNode.appendChild(child)
svgNode.appendChild(defs)

globalThis.document = {
  addEventListener: vi.fn(),
  getElementById: () => null,
  createElementNS: (_namespace, name) => node(name),
}
globalThis.window = {}
globalThis.svg = svgNode
globalThis.shapes = []
globalThis.currentShape = null

const {
  clearUndoHistory,
  pushCreateAction,
  pushDeleteAction,
  pushFrameAttachmentAction,
  pushTransformAction,
  redo,
  setTextReferences,
  undo,
} = await import('../../src/core/UndoRedo.js')
setTextReferences(null, null, svgNode)

function rectangle(id, x, y) {
  const group = node(`${id}-group`)
  svgNode.appendChild(group)
  return {
    shapeID: id,
    shapeName: 'rectangle',
    x,
    y,
    width: 40,
    height: 30,
    rotation: 0,
    group,
    parentFrame: null,
    draw: vi.fn(),
    removeSelection: vi.fn(),
  }
}

function frame(id) {
  const group = node(`${id}-group`)
  const clipGroup = node(`${id}-clip-group`)
  const clipPath = node(`${id}-clip-path`)
  svgNode.appendChild(group)
  svgNode.appendChild(clipGroup)
  defs.appendChild(clipPath)
  return {
    shapeID: id,
    shapeName: 'frame',
    group,
    clipGroup,
    clipPath,
    containedShapes: [],
    draw: vi.fn(),
    updateClipPath: vi.fn(),
    removeSelection: vi.fn(),
    addShapeToFrame(shape) {
      if (!this.containedShapes.includes(shape)) this.containedShapes.push(shape)
      shape.parentFrame = this
      this.clipGroup.appendChild(shape.group)
    },
    removeShapeFromFrame(shape) {
      this.containedShapes = this.containedShapes.filter(candidate => candidate !== shape)
      shape.parentFrame = null
      svgNode.appendChild(shape.group)
    },
  }
}

function sceneState() {
  return shapes.map(shape => ({
    id: shape.shapeID,
    x: shape.x,
    y: shape.y,
    parent: shape.parentFrame?.shapeID || null,
  }))
}

describe('UndoRedo regressions for recent tools', () => {
  beforeEach(() => {
    clearUndoHistory()
    shapes.length = 0
    currentShape = null
    window.multiSelection = null
    for (const child of [...svgNode.children]) if (child !== defs) svgNode.removeChild(child)
    for (const child of [...defs.children]) defs.removeChild(child)
  })

  it('restores frame creation and its initial attachments as one action', () => {
    const child = rectangle('child', 20, 30)
    const targetFrame = frame('frame')
    shapes.push(child, targetFrame)
    targetFrame.addShapeToFrame(child)
    const created = sceneState()
    pushCreateAction(targetFrame, { frameCreation: true, containedShapes: [child] })

    undo()
    expect(sceneState()).toEqual([{ id: 'child', x: 20, y: 30, parent: null }])

    redo()
    expect(sceneState()).toEqual(created)
    expect(targetFrame.containedShapes).toEqual([child])
    expect(child.group.parentNode).toBe(targetFrame.clipGroup)
  })

  it('undoes and redoes both new and fallback frame attachments', () => {
    const child = rectangle('child', 20, 30)
    const oldFrame = frame('old-frame')
    const newFrame = frame('new-frame')
    shapes.push(child, oldFrame, newFrame)
    oldFrame.addShapeToFrame(child)
    oldFrame.removeShapeFromFrame(child)
    newFrame.addShapeToFrame(child)
    pushFrameAttachmentAction(newFrame, child, 'attach', oldFrame)

    undo()
    expect(child.parentFrame).toBe(oldFrame)
    expect(oldFrame.containedShapes).toEqual([child])
    expect(newFrame.containedShapes).toEqual([])

    redo()
    expect(child.parentFrame).toBe(newFrame)
    expect(newFrame.containedShapes).toEqual([child])
    expect(oldFrame.containedShapes).toEqual([])
  })

  it('undoes and redoes an initial attachment from the canvas', () => {
    const child = rectangle('child', 20, 30)
    const targetFrame = frame('frame')
    shapes.push(child, targetFrame)
    targetFrame.addShapeToFrame(child)
    pushFrameAttachmentAction(targetFrame, child, 'attach')

    undo()
    expect(child.parentFrame).toBeNull()
    expect(child.group.parentNode).toBe(svgNode)

    redo()
    expect(child.parentFrame).toBe(targetFrame)
    expect(child.group.parentNode).toBe(targetFrame.clipGroup)
  })

  it('returns lasso-moved shapes to the exact before and after states', () => {
    const first = rectangle('first', 10, 15)
    const second = rectangle('second', 80, 45)
    shapes.push(first, second)
    const before = sceneState()
    const moves = [
      [first, { x: 10, y: 15, width: 40, height: 30, rotation: 0 }, { x: 35, y: 55, width: 40, height: 30, rotation: 0 }],
      [second, { x: 80, y: 45, width: 40, height: 30, rotation: 0 }, { x: 105, y: 85, width: 40, height: 30, rotation: 0 }],
    ]
    for (const [shape, oldState, newState] of moves) {
      Object.assign(shape, newState)
      pushTransformAction(shape, oldState, newState)
    }
    const after = sceneState()

    undo(); undo()
    expect(sceneState()).toEqual(before)

    redo(); redo()
    expect(sceneState()).toEqual(after)
  })

  it('restores lasso-deleted shapes in their exact z-order and redoes deletion', () => {
    const first = rectangle('first', 10, 15)
    const second = rectangle('second', 80, 45)
    shapes.push(first, second)
    const before = sceneState()
    for (const target of [second, first]) {
      const index = shapes.indexOf(target)
      shapes.splice(index, 1)
      target.group.remove()
      pushDeleteAction(target, { shapeIndex: index })
    }
    expect(shapes).toEqual([])

    undo(); undo()
    expect(sceneState()).toEqual(before)

    redo(); redo()
    expect(shapes).toEqual([])
  })
})
