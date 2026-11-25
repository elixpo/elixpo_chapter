import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { parseSequenceDiagram, parseSequenceDiagramWithErrors } from '../../src/core/MermaidSequenceParser.js'
import { layoutSequence, renderSequenceOnCanvas, renderSequencePreviewSVG } from '../../src/core/MermaidSequenceRenderer.js'

const parse = (src) => {
    const { diagram, errors } = parseSequenceDiagramWithErrors(src)
    expect(errors).toEqual([])
    return diagram
}

describe('sequence parser', () => {
    it('reads participants, actors, aliases and quoted names', () => {
        const d = parse(`sequenceDiagram
  actor U as "End user"
  participant API as Gateway
  participant DB
  U->>API: call
  API->>DB: query`)
        expect(d.participants).toEqual([
            { name: 'End user', type: 'actor' },
            { name: 'Gateway', type: 'participant' },
            { name: 'DB', type: 'participant' },
        ])
        expect(d.messages.map(m => `${m.from}>${m.to}`)).toEqual(['End user>Gateway', 'Gateway>DB'])
    })

    it('parses every message arrow type', () => {
        const d = parse(`sequenceDiagram
  A->>B: solid open
  A-->>B: dashed open
  A->B: solid line
  A-->B: dashed line
  A-xB: solid cross
  A--xB: dashed cross
  A-)B: solid async
  A--)B: dashed async
  A<<->>B: both solid
  A<<-->>B: both dashed`)
        expect(d.messages.map(m => [m.solid, m.arrowHead, !!m.bidirectional])).toEqual([
            [true, 'open', false], [false, 'open', false], [true, 'none', false], [false, 'none', false],
            [true, 'cross', false], [false, 'cross', false], [true, 'async', false], [false, 'async', false],
            [true, 'open', true], [false, 'open', true],
        ])
    })

    it('tracks activations from activate/deactivate and the +/- shorthand, nested', () => {
        const d = parse(`sequenceDiagram
  A->>+B: one
  B->>+B: nested
  B-->>-B: back
  B-->>-A: done
  activate A
  A->>B: two
  deactivate A`)
        expect(d.activations.map(a => [a.participant, a.start, a.end, a.depth])).toEqual([
            ['B', 0, 3, 0], ['B', 1, 2, 1], ['A', 3, 4, 0],
        ])
        expect(parseSequenceDiagramWithErrors('sequenceDiagram\nA->>B: x\ndeactivate B').errors[0].message).toMatch(/line 3.*not active/)
    })

    it('reads notes, blocks (incl. par/and, critical/option, rect, nesting) and autonumber', () => {
        const d = parse(`sequenceDiagram
  autonumber 10 5
  Note left of A: left
  Note over A,B: both
  par Alice to Bob
    A->>B: hi
  and Alice to Carol
    A->>C: hi
  end
  critical Connect
    A->>B: open
  option Timeout
    A->>A: retry
  end
  rect rgb(200, 220, 255)
    loop every minute
      B-->>A: ping
    end
  end
  break failure
    A-xB: drop
  end`)
        expect(d.messages.map(m => m.number)).toEqual([10, 15, 20, 25, 30, 35])
        expect(d.notes.map(n => n.position)).toEqual(['left of', 'over'])
        const types = d.blocks.map(b => `${b.type}:${b.sections.map(s => s.keyword || 'start').join('/')}:${b.depth}`)
        expect(types).toEqual(['par:start/and:0', 'critical:start/option:0', 'loop:start:1', 'rect:start:0', 'break:start:0'])
        expect(d.blocks.find(b => b.type === 'rect').color).toBe('rgb(200, 220, 255)')
    })

    it('supports create / destroy and boxes', () => {
        const d = parse(`sequenceDiagram
  box Aqua Frontend
    participant A
    participant B
  end
  A->>B: hello
  create participant C
  B->>C: spawn
  destroy C
  B-xC: kill`)
        expect(d.boxes).toEqual([{ label: 'Frontend', color: 'Aqua', participants: ['A', 'B'] }])
        expect(d.participants.find(p => p.name === 'C')).toMatchObject({ createdAt: 1, destroyedAt: 2 })
        expect(d.messages[1].creates).toBe('C')
    })

    it('accepts `title Text` and `title: Text`, ignores links / acc lines', () => {
        expect(parse('sequenceDiagram\ntitle Checkout\nA->>B: x').title).toBe('Checkout')
        expect(parse('sequenceDiagram\ntitle: Checkout\nlink A: Docs @ https://x\naccTitle: t\nA->>B: x').title).toBe('Checkout')
    })

    it('reports unrecognised lines and unclosed blocks with line numbers', () => {
        const { diagram, errors } = parseSequenceDiagramWithErrors('sequenceDiagram\n  A->>B: ok\n  this is nonsense\n  loop x\n  A->>B: y')
        expect(diagram).toBeNull()
        expect(errors[0]).toMatchObject({ line: 3 })
        expect(errors[0].message).toMatch(/Parse error on line 3/)
        expect(errors[1].message).toMatch(/'loop' block is missing 'end'/)
        expect(parseSequenceDiagram('sequenceDiagram\n  A->>B: ok\n  nonsense')).toBeNull()
    })
})

describe('sequence layout', () => {
    it('keeps columns ordered, rows increasing and widens gaps for long labels', () => {
        const short = layoutSequence(parse('sequenceDiagram\nA->>B: x\nB->>C: y'))
        const long = layoutSequence(parse(`sequenceDiagram\nA->>B: ${'a very long message label '.repeat(4)}\nB->>C: y`))
        const gap = (L) => L.columns[1].cx - L.columns[0].cx
        expect(gap(long)).toBeGreaterThan(gap(short))
        expect(short.messages[0].y).toBeLessThan(short.messages[1].y)
        expect(short.columns.map(c => c.cx)).toEqual([...short.columns.map(c => c.cx)].sort((a, b) => a - b))
    })

    it('draws activation bars and offsets messages to them', () => {
        const L = layoutSequence(parse('sequenceDiagram\nA->>+B: go\nB-->>-A: back'))
        expect(L.activations).toHaveLength(1)
        const bar = L.activations[0]
        expect(bar.y).toBeLessThan(L.messages[0].y)
        expect(bar.y + bar.height).toBeGreaterThan(L.messages[1].y)
        expect(L.messages[0].x2).toBe(L.columns[1].cx - 6) // ends on the bar edge
    })

    it('starts created participants at their creation row and ends destroyed lifelines', () => {
        const L = layoutSequence(parse('sequenceDiagram\nA->>B: a\ncreate participant C\nA->>C: make\ndestroy C\nA-xC: kill\nA->>B: z'))
        const c = L.columns.find(col => col.name === 'C')
        expect(c.top.y).toBeGreaterThan(L.columns[0].top.y)
        expect(c.bottom).toBeNull()
        expect(c.lifeline.y2).toBe(L.messages[2].y)
        expect(c.destroyedY).toBe(L.messages[2].y)
    })

    it('nests blocks inside each other', () => {
        const L = layoutSequence(parse('sequenceDiagram\nloop outer\nalt inner\nA->>B: x\nelse other\nB->>A: y\nend\nend'))
        const [inner, outer] = L.blocks
        expect(outer.x).toBeLessThan(inner.x)
        expect(outer.y).toBeLessThan(inner.y)
        expect(outer.y + outer.height).toBeGreaterThanOrEqual(inner.y + inner.height)
        expect(inner.sections).toHaveLength(1)
    })
})

describe('sequence rendering', () => {
    let created
    beforeEach(() => {
        created = []
        class Base { constructor(kind, args) { Object.assign(this, args); this.kind = kind; created.push(this) } }
        globalThis.window = {
            svg: {}, shapes: [], currentViewBox: { x: 0, y: 0, width: 1000, height: 800 },
            Frame: class extends Base { constructor(x, y, w, h, o) { super('frame', { o, children: [] }) } addShapeToFrame(s) { this.children.push(s) } },
            Rectangle: class extends Base { constructor(x, y, w, h, options) { super('rect', { options }) } },
            Circle: class extends Base { constructor(x, y, rx, ry, options) { super('circle', { options }) } },
            Line: class extends Base { constructor(a, b, options) { super('line', { options }) } },
            Arrow: class extends Base { constructor(a, b, options) { super('arrow', { options }) } },
        }
    })
    afterEach(() => { delete globalThis.window })

    it('places participants, actor figures, activations, messages and notes', () => {
        const d = parse('sequenceDiagram\nactor U\nparticipant S\nU->>+S: req\nNote right of S: work\nS-->>-U: res\nU-)S: async\nU<<->>S: both\nU->S: plain')
        expect(renderSequenceOnCanvas(d)).toBe(true)
        const kinds = created.map(c => c.kind)
        expect(kinds.filter(k => k === 'circle')).toHaveLength(2) // actor heads top + bottom
        const arrows = created.filter(c => c.kind === 'arrow')
        expect(arrows).toHaveLength(4) // req, res, async, both (one two-headed arrow)
        expect(arrows[3].options).toMatchObject({ startArrowhead: 'arrow', endArrowhead: 'arrow' })
        const labels = created.filter(c => c.kind === 'rect').map(c => c.options.label)
        expect(labels).toContain('S')
        expect(labels).toContain('work')
        expect(created.filter(c => c.groupId).length).toBeGreaterThan(0)
    })

    it('draws cross messages as one arrow with a cross head', () => {
        expect(renderSequenceOnCanvas(parse('sequenceDiagram\nA-xB: nope'))).toBe(true)
        const arrows = created.filter(c => c.kind === 'arrow')
        expect(arrows).toHaveLength(1)
        expect(arrows[0].options).toMatchObject({ endArrowhead: 'cross' })
    })

    it('renders a preview with every message', () => {
        const svg = renderSequencePreviewSVG(parse('sequenceDiagram\nA->>B: one\nB-->>A: two\nA->>A: self'))
        expect(svg.match(/data-seq-type="message"/g)).toHaveLength(3)
    })
})
