import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { crowfootForCardinality, parseERDiagram, renderEROnCanvas } from '../../src/core/MermaidStructuredRenderer.js'

describe("ER cardinalities → crow's-foot heads", () => {
  it('maps every Mermaid cardinality token', () => {
    expect(crowfootForCardinality('||')).toBe('crowfoot_one')
    expect(crowfootForCardinality('|o')).toBe('crowfoot_one') // zero or one → closest
    expect(crowfootForCardinality('o|')).toBe('crowfoot_one')
    expect(crowfootForCardinality('}o')).toBe('crowfoot_many') // zero or more
    expect(crowfootForCardinality('o{')).toBe('crowfoot_many')
    expect(crowfootForCardinality('}|')).toBe('crowfoot_one_or_many')
    expect(crowfootForCardinality('|{')).toBe('crowfoot_one_or_many')
  })

  describe('on the canvas', () => {
    let created
    beforeEach(() => {
      created = []
      class Base { constructor(kind, args) { Object.assign(this, args); this.kind = kind; created.push(this) } }
      globalThis.window = {
        svg: {}, shapes: [], currentViewBox: { x: 0, y: 0, width: 1000, height: 800 },
        Frame: class extends Base { constructor(x, y, w, h, o) { super('frame', { o, children: [] }) } addShapeToFrame(s) { this.children.push(s) } },
        Rectangle: class extends Base { constructor(x, y, w, h, options) { super('rect', { options }) } },
        Arrow: class extends Base { constructor(a, b, options) { super('arrow', { options }) } },
        TextShape: class extends Base { constructor() { super('text', {}) } },
      }
    })
    afterEach(() => { delete globalThis.window })

    it('draws each relationship as one arrow with a crow’s foot at each entity', () => {
      const diagram = parseERDiagram('erDiagram\n  CUSTOMER ||--o{ ORDER : places\n  ORDER }|..|{ LINE : contains')
      expect(renderEROnCanvas(diagram)).toBe(true)
      const arrows = created.filter(c => c.kind === 'arrow')
      expect(arrows).toHaveLength(2)
      expect(arrows[0].options).toMatchObject({ startArrowhead: 'crowfoot_one', endArrowhead: 'crowfoot_many', label: 'places' })
      expect(arrows[1].options).toMatchObject({ startArrowhead: 'crowfoot_one_or_many', endArrowhead: 'crowfoot_one_or_many' })
    })
  })
})
