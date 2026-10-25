import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { parseFlowchart, parseMermaidFlowchart } from '../../src/core/MermaidFlowchartParser.js'
import { renderFlowchartOnCanvas, renderFlowchartPreviewSVG } from '../../src/core/MermaidFlowchartRenderer.js'
import { layeredLayout } from '../../src/core/MermaidLayout.js'
import { parseMermaid } from '../../src/core/AIRenderer.js'

const parse = (src) => {
    const result = parseFlowchart(src)
    expect(result.errors).toEqual([])
    return result.diagram
}
const centre = (n) => ({ x: n.x + n.width / 2, y: n.y + n.height / 2 })

describe('flowchart parser', () => {
    it('reads header direction (TD = TB) and YAML front-matter title', () => {
        expect(parse('graph TD\nA-->B').direction).toBe('TB')
        expect(parse('flowchart RL\nA-->B').direction).toBe('RL')
        expect(parse('---\ntitle: Hello\n---\nflowchart LR\nA-->B')).toMatchObject({ direction: 'LR', title: 'Hello' })
        expect(parse('A-->B').direction).toBe('TB') // header optional
        expect(parse('graph LR; A-->B; B-->C').edges).toHaveLength(2)
    })

    it('recognises every node shape', () => {
        const d = parse(`flowchart TD
  a[rect] --- b(round) --- c([stadium]) --- d[[sub]] --- e[(cyl)]
  f((circle)) --- g(((double))) --- h{rhombus} --- i{{hex}} --- j>flag]
  k[/para/] --- l[\\alt\\] --- m[/trap\\] --- n[\\inv/]
  o@{ shape: lean-r, label: "Lean" } --- p@{ shape: dbl-circ }`)
        const shapes = Object.fromEntries(d.nodes.map(n => [n.id, n.shape]))
        expect(shapes).toEqual({
            a: 'rect', b: 'round', c: 'stadium', d: 'subroutine', e: 'cylinder',
            f: 'circle', g: 'doublecircle', h: 'diamond', i: 'hexagon', j: 'asymmetric',
            k: 'parallelogram', l: 'parallelogram_alt', m: 'trapezoid', n: 'trapezoid_alt',
            o: 'parallelogram', p: 'doublecircle',
        })
        expect(d.nodes.find(n => n.id === 'o').label).toBe('Lean')
    })

    it('expands chained edges into N-1 edges and & into the cartesian product', () => {
        expect(parse('graph TD\nA --> B --> C --> D').edges.map(e => `${e.from}${e.to}`)).toEqual(['AB', 'BC', 'CD'])
        expect(parse('graph TD\nA & B --> C & D').edges.map(e => `${e.from}${e.to}`)).toEqual(['AC', 'AD', 'BC', 'BD'])
        expect(parse('graph TD\nA --> B & C --> D').edges.map(e => `${e.from}${e.to}`)).toEqual(['AB', 'AC', 'BD', 'CD'])
    })

    it('reads both edge label syntaxes on every stroke', () => {
        const d = parse(`graph LR
  A -->|pipe| B
  B -- text form --> C
  C == thick text ==> D
  D -. dotted text .-> E
  E ---|plain| F
  F -- line text --- G`)
        expect(d.edges.map(e => [e.label, e.stroke, e.endHead])).toEqual([
            ['pipe', 'normal', 'arrow'],
            ['text form', 'normal', 'arrow'],
            ['thick text', 'thick', 'arrow'],
            ['dotted text', 'dotted', 'arrow'],
            ['plain', 'normal', null],
            ['line text', 'normal', null],
        ])
    })

    it('distinguishes all arrow types and lengths', () => {
        const d = parse(`graph LR
  A --> B
  B --- C
  C -.-> D
  D -.- E
  E ==> F
  F === G
  G ~~~ H
  H --o I
  I --x J
  J <--> K
  K o--o L
  L x--x M
  M ---> N
  N -..-> O
  O ===> P`)
        expect(d.edges.map(e => `${e.stroke}:${e.startHead ?? '-'}:${e.endHead ?? '-'}:${e.minlen}`)).toEqual([
            'normal:-:arrow:1', 'normal:-:-:1', 'dotted:-:arrow:1', 'dotted:-:-:1', 'thick:-:arrow:1', 'thick:-:-:1',
            'invisible:-:-:1', 'normal:-:circle:1', 'normal:-:cross:1', 'normal:arrow:arrow:1', 'normal:circle:circle:1',
            'normal:cross:cross:1', 'normal:-:arrow:2', 'dotted:-:arrow:2', 'thick:-:arrow:2',
        ])
    })

    it('parses nested subgraphs with titles and direction', () => {
        const d = parse(`flowchart TB
  subgraph outer [Outer title]
    direction LR
    A --> B
    subgraph inner ["Inner title"]
      C
    end
  end
  subgraph "Quoted only"
    D
  end
  B --> C --> D`)
        expect(d.subgraphs.map(s => [s.id, s.label, s.parent, s.nodes])).toEqual([
            ['outer', 'Outer title', null, ['A', 'B']],
            ['inner', 'Inner title', 'outer', ['C']],
            ['subgraph_1', 'Quoted only', null, ['D']],
        ])
        expect(d.subgraphs[0].direction).toBe('LR')
    })

    it('maps classDef / class / ::: / style / linkStyle', () => {
        const d = parse(`graph TD
  classDef hot fill:#f96,stroke:#333,stroke-width:4px,color:#fff
  classDef default stroke:#0af
  A:::hot --> B --> C
  class C hot
  style B fill:#0f0,stroke-dasharray: 5 5
  linkStyle 1 stroke:#f00,stroke-width:3px,color:#00f
  linkStyle default stroke:#999`)
        const byId = Object.fromEntries(d.nodes.map(n => [n.id, n.style]))
        expect(byId.A).toEqual({ stroke: '#333', fill: '#f96', strokeWidth: 4, labelColor: '#fff' })
        expect(byId.B).toEqual({ stroke: '#0af', fill: '#0f0', strokeDasharray: '5 5' })
        expect(byId.C).toMatchObject({ fill: '#f96' })
        expect(d.edges[0].style).toEqual({ stroke: '#999' })
        expect(d.edges[1].style).toEqual({ stroke: '#999', strokeWidth: 3, labelColor: '#00f' })
    })

    it('decodes markdown strings, <br>, entity codes and ignores comments / interaction lines', () => {
        const d = parse(`graph TD
  %% a comment
  A["\`**Bold** and _it_\`"] --> B["one<br>two<br/>three"]
  C["say #quot;hi#quot; #35;1"]
  click A callback "Tooltip"
  click B href "https://example.com"
  accTitle: Title`)
        expect(d.nodes.map(n => n.label)).toEqual(['Bold and it', 'one\ntwo\nthree', 'say "hi" #1'])
    })

    it('reports syntax errors with line numbers instead of returning an empty diagram', () => {
        const { errors } = parseFlowchart('graph TD\n  A --> B\n  C[unclosed --> D\n  end')
        expect(errors.map(e => e.line)).toEqual([3, 4])
        expect(errors[0].message).toMatch(/^Parse error on line 3: Unclosed node shape/)
        expect(parseMermaidFlowchart('graph TD\n  A[oops').errors[0].message).toMatch(/line 2/)
        expect(parseMermaid('graph TD\n  A[oops')).toBeNull()
        expect(parseFlowchart('graph TD\nsubgraph x\nA').errors[0].message).toMatch(/missing 'end'/)
    })
})

describe('flowchart layout', () => {
    const src = (dir) => `flowchart ${dir}\n  A --> B --> C\n  A --> D --> C\n  C --> E`

    it('places ranks along the flow direction', () => {
        const td = parseMermaidFlowchart(src('TD'))
        const byId = Object.fromEntries(td.nodes.map(n => [n.id, centre(n)]))
        expect(byId.A.y).toBeLessThan(byId.B.y)
        expect(byId.B.y).toBeLessThan(byId.C.y)
        expect(byId.C.y).toBeLessThan(byId.E.y)
        expect(byId.B.y).toBe(byId.D.y)
        const lr = Object.fromEntries(parseMermaidFlowchart(src('LR')).nodes.map(n => [n.id, centre(n)]))
        expect(lr.A.x).toBeLessThan(lr.B.x)
        expect(lr.C.x).toBeLessThan(lr.E.x)
    })

    it('mirrors BT against TD and RL against LR', () => {
        const td = parseMermaidFlowchart(src('TD'))
        const bt = parseMermaidFlowchart(src('BT'))
        const H = td.height
        for (const n of td.nodes) {
            const m = bt.nodes.find(o => o.id === n.id)
            expect(centre(m).x).toBeCloseTo(centre(n).x, 6)
            expect(centre(m).y).toBeCloseTo(H - centre(n).y, 6)
        }
        const lr = parseMermaidFlowchart(src('LR'))
        const rl = parseMermaidFlowchart(src('RL'))
        for (const n of lr.nodes) {
            const m = rl.nodes.find(o => o.id === n.id)
            expect(centre(m).y).toBeCloseTo(centre(n).y, 6)
            expect(centre(m).x).toBeCloseTo(lr.width - centre(n).x, 6)
        }
    })

    it('never overlaps nodes and honours edge length', () => {
        const d = parseMermaidFlowchart('graph TD\nA --> B & C & D & E\nA ---> F\nB --> G\nC --> G')
        for (const a of d.nodes) {
            for (const b of d.nodes) {
                if (a === b) continue
                const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
                expect(overlap, `${a.id}/${b.id}`).toBe(false)
            }
        }
        const rank = (id) => d.nodes.find(n => n.id === id)
        expect(centre(rank('F')).y).toBeGreaterThan(centre(rank('B')).y) // `--->` spans two ranks
    })

    it('puts every subgraph box around its nodes and nested subgraphs', () => {
        const d = parseMermaidFlowchart(`flowchart LR
  subgraph outer [Outer]
    A --> B
    subgraph inner [Inner]
      C --> D
    end
  end
  X --> A
  D --> Y`)
        const sg = Object.fromEntries(d.subgraphs.map(s => [s.id, s]))
        const inside = (box, n) => n.x >= box.x && n.y >= box.y && n.x + n.width <= box.x + box.width && n.y + n.height <= box.y + box.height
        for (const n of d.nodes) {
            if (['A', 'B', 'C', 'D'].includes(n.id)) expect(inside(sg.outer, n), n.id).toBe(true)
            if (['C', 'D'].includes(n.id)) expect(inside(sg.inner, n), n.id).toBe(true)
            if (['X', 'Y'].includes(n.id)) expect(inside(sg.outer, n), n.id).toBe(false)
        }
        expect(inside(sg.outer, sg.inner)).toBe(true)
        expect(sg.inner.depth).toBe(2)
    })

    it('handles cycles and self loops without hanging', () => {
        const d = parseMermaidFlowchart('graph TD\nA --> B --> C --> A\nC --> C')
        expect(d.nodes).toHaveLength(3)
        expect(d.edges).toHaveLength(4)
    })

    it('layout is deterministic', () => {
        const g = { direction: 'TB', nodes: [{ id: 'a', width: 10, height: 10 }, { id: 'b', width: 10, height: 10 }], edges: [{ from: 'a', to: 'b' }] }
        expect([...layeredLayout(g).nodes.entries()]).toEqual([...layeredLayout(g).nodes.entries()])
    })
})

describe('flowchart rendering', () => {
    let created
    beforeEach(() => {
        created = []
        class Base {
            constructor(kind, args) { Object.assign(this, args); this.kind = kind; created.push(this) }
        }
        class Frame extends Base {
            constructor(x, y, width, height, options) { super('frame', { x, y, width, height, options, frameName: options.frameName, children: [] }); this.shapeName = 'frame' }
            addShapeToFrame(s) { this.children.push(s); s.parentFrame = this }
        }
        globalThis.window = {
            svg: {}, shapes: [], currentViewBox: { x: 0, y: 0, width: 1000, height: 800 },
            Frame,
            Rectangle: class extends Base { constructor(x, y, width, height, options) { super('rect', { x, y, width, height, options }); this.shapeName = 'rectangle' } draw() {} },
            Circle: class extends Base { constructor(x, y, rx, ry, options) { super('circle', { x, y, rx, ry, options }); this.shapeName = 'circle' } },
            Line: class extends Base { constructor(a, b, options) { super('line', { a, b, options }); this.shapeName = 'line' } },
            Arrow: class extends Base { constructor(a, b, options) { super('arrow', { a, b, options }); this.shapeName = 'arrow' } },
            __autoAttach: (arrow, shape, isStart) => { arrow[isStart ? 'boundStart' : 'boundEnd'] = shape },
        }
    })
    afterEach(() => { delete globalThis.window })

    const place = (src) => {
        const d = parseMermaidFlowchart(src)
        expect(d.errors).toEqual([])
        expect(renderFlowchartOnCanvas(d)).toBe(true)
        return created
    }

    it('creates subgraph frames that contain their nodes, nested inside each other', () => {
        place(`flowchart TD
  subgraph outer [Outer]
    A --> B
    subgraph inner [Inner]
      C
    end
  end
  B --> C
  C --> D`)
        const frames = created.filter(s => s.kind === 'frame')
        const [root, outer, inner] = frames
        expect(frames.map(f => f.frameName)).toEqual(['Mermaid Diagram', 'Outer', 'Inner'])
        const labels = (f) => f.children.filter(c => c.kind !== 'arrow' && c.kind !== 'frame').map(c => c.options.label)
        expect(labels(outer)).toEqual(['A', 'B'])
        expect(labels(inner)).toEqual(['C'])
        expect(labels(root)).toEqual(['D'])
        expect(outer.children).toContain(inner)
        expect(root.children).toContain(outer)
        // edge between nodes of outer and inner lives in their common frame (outer)
        const bc = outer.children.find(c => c.kind === 'arrow')
        expect(bc).toBeTruthy()
    })

    it('maps node shapes to the closest canvas primitives', () => {
        place('graph LR\n a[r] --> b((c)) --> c{d} --> d[[s]] --> e[(db)] --> f(((dc))) --> g{{h}} --> h([st])')
        const kinds = created.filter(s => s.kind !== 'frame' && s.kind !== 'arrow').map(s => `${s.kind}${s.rotation ? '@45' : ''}`)
        expect(kinds).toEqual(['rect', 'circle', 'rect@45', 'rect', 'line', 'line', 'rect', 'circle', 'circle', 'circle', 'rect', 'rect'])
        const stadium = created.filter(s => s.kind === 'rect').pop()
        expect(stadium.options.edges).toBe('round') // rounded via the shape's Sharp/Round setting
        const grouped = created.filter(s => s.groupId)
        expect(new Set(grouped.map(s => s.groupId)).size).toBe(3) // subroutine, cylinder, double circle
    })

    it('maps edge types to arrows / lines with heads and binds arrows to nodes', () => {
        place('graph LR\n A --> B\n B --- C\n C -.-> D\n D ==> E\n E --o F\n F <--> G\n G ~~~ H\n I --x J')
        const arrows = created.filter(s => s.kind === 'arrow')
        const lines = created.filter(s => s.kind === 'line')
        expect(lines).toHaveLength(1)
        expect(arrows).toHaveLength(6) // <--> is one arrow with two heads; ~~~ draws nothing
        expect(arrows[0].boundStart.options.label).toBe('A')
        expect(arrows[0].boundEnd.options.label).toBe('B')
        expect(arrows[0].options).toMatchObject({ startArrowhead: 'none', endArrowhead: 'arrow' })
        expect(arrows[1].options.strokeDasharray).toBe('5 3')
        expect(arrows[2].options.strokeWidth).toBe(3)
        expect(arrows[3].options).toMatchObject({ startArrowhead: 'none', endArrowhead: 'circle' }) // --o
        expect(arrows[4].options).toMatchObject({ startArrowhead: 'arrow', endArrowhead: 'arrow' }) // <-->
        expect(arrows[4].boundStart.options.label).toBe('F')
        expect(arrows[4].boundEnd.options.label).toBe('G')
        expect(arrows[4].groupId).toBeFalsy()
        expect(arrows[5].options).toMatchObject({ startArrowhead: 'none', endArrowhead: 'cross' }) // --x
    })

    it('renders a preview SVG with subgraph boxes and every node', () => {
        const svg = renderFlowchartPreviewSVG(parseMermaidFlowchart('flowchart TD\nsubgraph S [Group]\nA-->B\nend\nB-->C{x}'))
        expect(svg.startsWith('<svg')).toBe(true)
        expect(svg.match(/data-fc-type="node"/g)).toHaveLength(3)
        expect(svg).toContain('data-fc-type="subgraph"')
        expect(svg).toContain('>Group<')
    })
})
