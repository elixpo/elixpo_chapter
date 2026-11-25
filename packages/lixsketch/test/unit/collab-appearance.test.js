import { describe, expect, it } from 'vitest'
import { applyOps, transform } from '../../src/core/collab/OT.js'
import { diffSceneAgainstDoc, docFromScene, docToScene, flattenShape } from '../../src/core/collab/SceneDoc.js'
import { readAppearance } from '../../src/core/ShapeAppearance.js'

const base = () => ({
  format: 'lixsketch',
  version: 1,
  shapes: [
    { shapeID: 'r1', type: 'rectangle', x: 0, y: 0, width: 80, height: 40, rotation: 0, options: { stroke: '#000' }, parentFrame: null, groupId: null, docBlockIds: [] },
  ],
})

describe('opacity / edges over collaboration', () => {
  it('flattens as top-level shape properties, not options', () => {
    const record = flattenShape({ ...base().shapes[0], opacity: 0.5, edges: 'round' })
    expect(record.opacity).toBe(0.5)
    expect(record.edges).toBe('round')
    expect(record).not.toHaveProperty('options.opacity')
  })

  it('sends one property op per change and restores defaults when cleared', () => {
    const doc = docFromScene(base())
    const edited = base()
    edited.shapes[0].opacity = 0.3
    edited.shapes[0].edges = 'round'
    const ops = diffSceneAgainstDoc(doc, edited)
    expect(ops).toHaveLength(1)
    expect(ops[0]).toMatchObject({ t: 'update', id: 'r1' })
    const next = applyOps(doc, ops)
    const shape = docToScene(next).shapes[0]
    expect(readAppearance(shape)).toEqual({ opacity: 0.3, edges: 'round' })

    // Back to defaults: the serializer omits the keys, the diff removes them.
    const cleared = diffSceneAgainstDoc(next, base())
    const after = docToScene(applyOps(next, cleared)).shapes[0]
    expect(after).not.toHaveProperty('opacity')
    expect(readAppearance(after)).toEqual({ opacity: 1, edges: 'sharp' })
  })

  it('merges concurrent opacity and stroke edits on the same shape', () => {
    const doc = docFromScene(base())
    const a = base()
    a.shapes[0].opacity = 0.6
    const b = base()
    b.shapes[0].options.stroke = '#e03131'
    const opsA = diffSceneAgainstDoc(doc, a)
    const opsB = diffSceneAgainstDoc(doc, b)
    const aPrime = opsA.map(op => transform(op, opsB[0], true))
    const merged = docToScene(applyOps(applyOps(doc, opsB), aPrime)).shapes[0]
    expect(merged.opacity).toBe(0.6)
    expect(merged.options.stroke).toBe('#e03131')
  })
})
