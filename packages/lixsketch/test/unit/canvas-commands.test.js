import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applyLayerAction,
  applyStyleToShape,
  copyStyles,
  editSelectedLabel,
  extractStyle,
  getSelectionTargets,
  layerActionForShortcut,
  nudgeDeltaForKey,
  nudgeSelection,
  pasteStyles,
  resetStyleClipboard,
  setSelectionAppearance,
  beginAppearanceEdit,
  previewAppearance,
  commitAppearanceEdit,
} from '../../src/core/CanvasCommands.js'
import { getNextShapeOpacity, setNextShapeOpacity } from '../../src/core/ShapeAppearance.js'

function shape(id, extra = {}) {
  return {
    shapeID: id,
    shapeName: 'rectangle',
    x: 0,
    y: 0,
    isSelected: true,
    options: { stroke: '#1e1e1e', strokeWidth: 2, fill: 'transparent', fillStyle: 'none', roughness: 1.5 },
    move: vi.fn(function move(dx, dy) { this.x += dx; this.y += dy }),
    draw: vi.fn(),
    ...extra,
  }
}

function fakeWindow({ selected = [], current = null, shapes = [] } = {}) {
  const undo = []
  return {
    undo,
    shapes,
    currentShape: current,
    multiSelection: {
      selectedShapes: new Set(selected),
      updateControls: vi.fn(),
      _captureShapeState: (s) => ({ x: s.x, y: s.y }),
    },
    beginUndoBatch: () => ({ startIndex: undo.length }),
    endUndoBatch: vi.fn(),
    pushTransformAction: (s, before, after) => undo.push({ type: 'transform', s, before, after }),
    pushOptionsChangeAction: (s, before, after) => undo.push({ type: 'options', s, before, after }),
    pushAppearanceChangeAction: (s, before, after) => undo.push({ type: 'appearance', s, before, after }),
  }
}

beforeEach(() => resetStyleClipboard())

describe('selection targets', () => {
  it('prefers the multi-selection, then the current shape', () => {
    const a = shape('a')
    const b = shape('b')
    expect(getSelectionTargets(fakeWindow({ selected: [a, b], current: a }))).toEqual([a, b])
    expect(getSelectionTargets(fakeWindow({ current: a }))).toEqual([a])
    expect(getSelectionTargets(fakeWindow({ current: shape('c', { isSelected: false }) }))).toEqual([])
  })
})

describe('arrow key nudge', () => {
  it('moves 1px, or 10px with Shift', () => {
    expect(nudgeDeltaForKey('ArrowLeft')).toEqual({ dx: -1, dy: 0 })
    expect(nudgeDeltaForKey('ArrowDown', true)).toEqual({ dx: 0, dy: 10 })
    expect(nudgeDeltaForKey('a')).toBeNull()
  })

  it('moves every selected shape once and records undo', () => {
    const a = shape('a')
    const b = shape('b', { x: 5 })
    const win = fakeWindow({ selected: [a, b] })
    expect(nudgeSelection(10, 0, win)).toBe(2)
    expect(a.x).toBe(10)
    expect(b.x).toBe(15)
    expect(win.undo.map((u) => [u.before.x, u.after.x])).toEqual([[0, 10], [5, 15]])
    expect(win.endUndoBatch).toHaveBeenCalledWith(expect.anything(), 'nudge')
    expect(win.multiSelection.updateControls).toHaveBeenCalled()
  })

  it('does not double-move children of a selected frame', () => {
    const frame = shape('frame', { shapeName: 'frame' })
    const child = shape('child', { parentFrame: frame })
    nudgeSelection(0, 1, fakeWindow({ selected: [frame, child] }))
    expect(frame.move).toHaveBeenCalledTimes(1)
    expect(child.move).not.toHaveBeenCalled()
  })

  it('finalizes freehand moves and refreshes arrows', () => {
    const stroke = shape('s', { finalizeMove: vi.fn(), updateAttachedArrows: vi.fn() })
    nudgeSelection(1, 1, fakeWindow({ current: stroke }))
    expect(stroke.finalizeMove).toHaveBeenCalled()
    expect(stroke.updateAttachedArrows).toHaveBeenCalled()
  })

  it('is a no-op without a selection', () => {
    expect(nudgeSelection(1, 0, fakeWindow())).toBe(0)
  })
})

describe('layer order shortcuts', () => {
  it('maps Ctrl+[ / ] with and without Shift', () => {
    expect(layerActionForShortcut({ ctrlKey: true, code: 'BracketRight', key: ']' })).toBe('bringForward')
    expect(layerActionForShortcut({ ctrlKey: true, shiftKey: true, code: 'BracketRight', key: '}' })).toBe('bringToFront')
    expect(layerActionForShortcut({ metaKey: true, code: 'BracketLeft', key: '[' })).toBe('sendBackward')
    expect(layerActionForShortcut({ ctrlKey: true, shiftKey: true, key: '{' })).toBe('sendToBack')
    expect(layerActionForShortcut({ key: ']' })).toBeNull()
    expect(layerActionForShortcut({ ctrlKey: true, altKey: true, key: ']' })).toBeNull()
  })

  it('keeps relative order when bringing several shapes to the front', () => {
    const a = shape('a')
    const b = shape('b')
    const c = shape('c')
    const shapes = [a, b, c]
    const calls = []
    const win = fakeWindow({ selected: [b, a], shapes })
    win.__layerOrder = {
      bringToFront: (s) => { calls.push(s.shapeID); shapes.splice(shapes.indexOf(s), 1); shapes.push(s) },
    }
    expect(applyLayerAction('bringToFront', win)).toBe(2)
    expect(calls).toEqual(['a', 'b'])
    expect(shapes.map((s) => s.shapeID)).toEqual(['c', 'a', 'b'])
  })

  it('processes the top-most shape first when moving forward one step', () => {
    const [a, b, c] = [shape('a'), shape('b'), shape('c')]
    const calls = []
    const win = fakeWindow({ selected: [a, b], shapes: [a, b, c] })
    win.__layerOrder = { bringForward: (s) => calls.push(s.shapeID) }
    applyLayerAction('bringForward', win)
    expect(calls).toEqual(['b', 'a'])
  })

  it('ignores unknown actions', () => {
    expect(applyLayerAction('explode', fakeWindow({ current: shape('a') }))).toBe(0)
  })
})

describe('copy / paste styles', () => {
  it('extracts the visual options and label color', () => {
    const s = shape('a', { labelColor: '#e03131', options: { stroke: '#2f9e44', strokeWidth: 4, fill: '#ffc9c9', fillStyle: 'solid', label: 'ignored' } })
    expect(extractStyle(s)).toEqual({ stroke: '#2f9e44', strokeWidth: 4, fill: '#ffc9c9', fillStyle: 'solid', labelColor: '#e03131', opacity: 1, edges: 'sharp' })
    expect(extractStyle(null)).toBeNull()
  })

  it('applies styles as an undoable options change and redraws', () => {
    const target = shape('t')
    const win = fakeWindow()
    expect(applyStyleToShape(target, { stroke: '#1971c2', fillStyle: 'hachure' }, win)).toBe(true)
    expect(target.options).toMatchObject({ stroke: '#1971c2', fillStyle: 'hachure', strokeWidth: 2 })
    expect(win.undo[0]).toMatchObject({ type: 'options', before: { stroke: '#1e1e1e' }, after: { stroke: '#1971c2' } })
    expect(target.draw).toHaveBeenCalled()
  })

  it('does nothing when the style already matches', () => {
    const target = shape('t')
    expect(applyStyleToShape(target, { stroke: '#1e1e1e' }, fakeWindow())).toBe(false)
    expect(target.draw).not.toHaveBeenCalled()
  })

  it('colors text shapes from the copied stroke', () => {
    const attrs = { fill: '#1e1e1e' }
    const textEl = { getAttribute: (k) => attrs[k], setAttribute: (k, v) => { attrs[k] = v } }
    const text = { shapeName: 'text', isSelected: true, group: { querySelector: () => textEl } }
    expect(applyStyleToShape(text, { stroke: '#e03131' }, fakeWindow())).toBe(true)
    expect(attrs.fill).toBe('#e03131')
  })

  it('copies from the first selected shape and pastes onto the selection', () => {
    const source = shape('src', { options: { stroke: '#9c36b5', strokeWidth: 1 } })
    expect(pasteStyles(fakeWindow({ current: source }))).toBe(0)
    expect(copyStyles(fakeWindow({ current: source }))).toBe(true)
    const a = shape('a')
    const b = shape('b')
    const win = fakeWindow({ selected: [a, b] })
    expect(pasteStyles(win)).toBe(2)
    expect(a.options.stroke).toBe('#9c36b5')
    expect(b.options.strokeWidth).toBe(1)
    expect(win.endUndoBatch).toHaveBeenCalledWith(expect.anything(), 'paste-styles')
  })
})

describe('Enter edits the selected label', () => {
  it('opens the embedded label editor', () => {
    const s = shape('a', { startLabelEdit: vi.fn() })
    expect(editSelectedLabel(fakeWindow({ current: s }))).toBe(true)
    expect(s.startLabelEdit).toHaveBeenCalled()
  })

  it('enters text edit mode for text shapes', () => {
    const group = {}
    const win = fakeWindow({ current: { shapeName: 'text', isSelected: true, group } })
    win.__enterTextEditMode = vi.fn()
    expect(editSelectedLabel(win)).toBe(true)
    expect(win.__enterTextEditMode).toHaveBeenCalledWith(group)
  })

  it('ignores multi-selections', () => {
    expect(editSelectedLabel(fakeWindow({ selected: [shape('a'), shape('b')] }))).toBe(false)
  })
})

describe('opacity / edges from the properties panel', () => {
  it('sets opacity on every selected shape as one batch and remembers it for new shapes', () => {
    const a = shape('a', { opacity: 1 })
    const b = shape('b', { shapeName: 'line', opacity: 1 })
    const win = fakeWindow({ selected: [a, b] })
    expect(setSelectionAppearance({ opacity: 40 }, win)).toBe(2)
    expect([a.opacity, b.opacity]).toEqual([0.4, 0.4])
    expect(win.undo.map(u => [u.type, u.before.opacity, u.after.opacity])).toEqual([['appearance', 1, 0.4], ['appearance', 1, 0.4]])
    expect(win.endUndoBatch).toHaveBeenCalledWith(expect.anything(), 'appearance')
    expect(getNextShapeOpacity()).toBe(0.4)
    setNextShapeOpacity(1)
  })

  it('applies edges only to shapes that can round, and redraws them', () => {
    const rect = shape('r', { edges: 'sharp', opacity: 1, updateAttachedArrows: vi.fn() })
    const circle = shape('c', { shapeName: 'circle', opacity: 1 })
    const win = fakeWindow({ selected: [rect, circle] })
    expect(setSelectionAppearance({ edges: 'round' }, win)).toBe(1)
    expect(rect.edges).toBe('round')
    expect(rect.draw).toHaveBeenCalled()
    expect(rect.updateAttachedArrows).toHaveBeenCalled()
    expect(circle.edges).toBeUndefined()
  })

  it('records no undo when nothing changes', () => {
    const rect = shape('r', { edges: 'round', opacity: 0.5 })
    const win = fakeWindow({ current: rect })
    expect(setSelectionAppearance({ opacity: 0.5, edges: 'round' }, win)).toBe(0)
    expect(win.undo).toEqual([])
    setNextShapeOpacity(1)
  })

  it('copy / paste styles carries opacity and edges', () => {
    const source = shape('src', { opacity: 0.3, edges: 'round' })
    copyStyles(fakeWindow({ current: source }))
    const target = shape('t', { opacity: 1, edges: 'sharp' })
    const win = fakeWindow({ current: target })
    expect(pasteStyles(win)).toBe(1)
    expect(target).toMatchObject({ opacity: 0.3, edges: 'round' })
    expect(win.undo.some(u => u.type === 'appearance')).toBe(true)
  })
})

describe('opacity slider drag', () => {
  it('previews live and commits a single undo step per shape on release', () => {
    const a = shape('a', { opacity: 1 })
    const b = shape('b', { opacity: 0.5 })
    const win = fakeWindow({ selected: [a, b] })
    beginAppearanceEdit(win)
    for (const value of [90, 70, 40]) previewAppearance({ opacity: value }, win)
    expect([a.opacity, b.opacity]).toEqual([0.4, 0.4])
    expect(win.undo).toEqual([])
    expect(commitAppearanceEdit(win)).toBe(2)
    expect(win.undo.map(u => [u.before.opacity, u.after.opacity])).toEqual([[1, 0.4], [0.5, 0.4]])
    expect(commitAppearanceEdit(win)).toBe(0)
    setNextShapeOpacity(1)
  })
})

describe('copy / paste styles on arrows', () => {
  it('carries both arrowheads and records an undo snapshot with them', () => {
    const source = shape('src', { shapeName: 'arrow', startArrowhead: 'dot', endArrowhead: 'triangle', options: { stroke: '#e03131' } })
    copyStyles(fakeWindow({ current: source }))
    const target = shape('t', { shapeName: 'arrow', startArrowhead: 'none', endArrowhead: 'arrow', arrowOutlineStyle: 'solid', options: { stroke: '#000' } })
    const win = fakeWindow({ current: target })
    expect(pasteStyles(win)).toBe(1)
    expect([target.startArrowhead, target.endArrowhead]).toEqual(['dot', 'triangle'])
    const change = win.undo.find(u => u.type === 'options')
    expect(change.before).toMatchObject({ startArrowhead: 'none', endArrowhead: 'arrow', stroke: '#000' })
    expect(change.after).toMatchObject({ startArrowhead: 'dot', endArrowhead: 'triangle', stroke: '#e03131' })
  })

  it('does not put arrowheads on non-arrow shapes', () => {
    const source = shape('src', { shapeName: 'arrow', startArrowhead: 'dot', endArrowhead: 'triangle' })
    copyStyles(fakeWindow({ current: source }))
    const rect = shape('r')
    pasteStyles(fakeWindow({ current: rect }))
    expect(rect).not.toHaveProperty('startArrowhead')
  })
})

describe('copy / paste styles onto lines', () => {
  it('carries arrowheads between arrows and lines with an undoable snapshot', () => {
    const source = shape('src', { shapeName: 'arrow', startArrowhead: 'dot', endArrowhead: 'arrow', options: {} })
    copyStyles(fakeWindow({ current: source }))
    const line = shape('ln', { shapeName: 'line', startArrowhead: 'none', endArrowhead: 'none', options: {} })
    const win = fakeWindow({ current: line })
    expect(pasteStyles(win)).toBe(1)
    expect([line.startArrowhead, line.endArrowhead]).toEqual(['dot', 'arrow'])
    const change = win.undo.find(u => u.type === 'options')
    expect(change.before).toMatchObject({ startArrowhead: 'none', endArrowhead: 'none' })
  })
})
