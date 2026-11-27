import { describe, expect, it, vi } from 'vitest'
import {
    applyClassGeometry,
    applyFlowchartGeometry,
    extractMermaidGeometry,
    layoutWithMermaid,
} from '../../src/core/MermaidNativeLayout.js'
import { routeCurve } from '../../src/core/MermaidCanvas.js'
import { parseMermaidFlowchart } from '../../src/core/MermaidFlowchartParser.js'
import { layoutClassDiagram, parseClassDiagram } from '../../src/core/MermaidClassDiagram.js'

const box = (x, y, width, height) => ({ x, y, width, height })

function geometry({ nodes = {}, clusters = {}, edges = {}, notes = {}, width = 400, height = 300 } = {}) {
    return {
        width, height,
        nodes: new Map(Object.entries(nodes)),
        notes: new Map(Object.entries(notes)),
        clusters: new Map(Object.entries(clusters)),
        edges: new Map(Object.entries(edges)),
    }
}

describe('applyFlowchartGeometry', () => {
    const diagram = parseMermaidFlowchart(`flowchart TD
  A --> B
  A --> B
  B --> B
  subgraph S [Group]
    B
  end`)

    it('replaces node boxes, subgraph boxes and size with Mermaid geometry', () => {
        const g = geometry({
            nodes: { A: box(10, 20, 80, 54), B: box(30, 140, 90, 54) },
            clusters: { S: box(8, 120, 150, 100) },
            width: 300, height: 260,
        })
        const out = applyFlowchartGeometry(diagram, g)
        expect(out.layout).toBe('mermaid')
        expect(out.nodes.find(n => n.id === 'A')).toMatchObject({ x: 10, y: 20, width: 80, height: 54 })
        expect(out.nodes.find(n => n.id === 'B')).toMatchObject({ x: 30, y: 140, width: 90, height: 54 })
        expect(out.subgraphs.find(s => s.id === 'S')).toMatchObject({ x: 8, y: 120, width: 150, height: 100 })
        expect(out).toMatchObject({ width: 300, height: 260 })
        // Semantics stay with our parser.
        expect(out.nodes.map(n => n.label)).toEqual(diagram.nodes.map(n => n.label))
        expect(out.edges.map(e => [e.from, e.to, e.endHead])).toEqual(diagram.edges.map(e => [e.from, e.to, e.endHead]))
        // Input is not mutated.
        expect(diagram.layout).toBeUndefined()
    })

    it('matches repeated pairs by occurrence and joins self-loop segments', () => {
        const p = (x, y) => ({ x, y })
        const g = geometry({
            nodes: { A: box(0, 0, 50, 50), B: box(0, 100, 50, 50) },
            edges: {
                L_A_B_0: [p(25, 50), p(20, 75), p(25, 100)],
                L_A_B_1: [p(30, 50), p(40, 75), p(30, 100)],
                'B-cyclic-special-1': [p(50, 110), p(70, 110)],
                'B-cyclic-special-mid': [p(70, 110), p(70, 140)],
                'B-cyclic-special-2': [p(70, 140), p(50, 140)],
            },
        })
        const out = applyFlowchartGeometry(diagram, g)
        expect(out.edges[0].points).toEqual(g.edges.get('L_A_B_0'))
        expect(out.edges[1].points).toEqual(g.edges.get('L_A_B_1'))
        expect(out.edges[2].points).toEqual([p(50, 110), p(70, 110), p(70, 140), p(50, 140)])
    })

    it('keeps the built-in layout unless every node has a Mermaid box', () => {
        const g = geometry({ nodes: { A: box(0, 0, 50, 50) } })
        expect(applyFlowchartGeometry(diagram, g)).toBe(diagram)
        expect(applyFlowchartGeometry(diagram, null)).toBe(diagram)
    })
})

describe('applyClassGeometry + layoutClassDiagram', () => {
    const { diagram } = parseClassDiagram(`classDiagram
  Animal <|-- Duck
  Animal : +int age
  Animal : +mate()
  class Duck{ +swim() }`)

    it('uses Mermaid boxes and keeps header/attribute/method proportions', () => {
        const g = geometry({
            nodes: { Animal: box(8, 8, 108, 144), Duck: box(12, 202, 100, 126) },
            edges: { id_Animal_Duck_1: [{ x: 62, y: 152 }, { x: 62, y: 177 }, { x: 62, y: 202 }] },
            width: 124, height: 336,
        })
        const L = layoutClassDiagram(applyClassGeometry(diagram, g))
        const animal = L.classes.find(c => c.id === 'Animal')
        expect(animal).toMatchObject({ x: 8, y: 8, width: 108, height: 144 })
        expect(animal.headerH + animal.attrsH + animal.methodsH).toBeCloseTo(144)
        expect(L).toMatchObject({ width: 124, height: 336 })
        const rel = L.relations[0]
        // Route follows the relation's from→to orientation.
        expect(rel.route[0]).toEqual(rel.from === 'Animal' ? { x: 62, y: 152 } : { x: 62, y: 202 })
    })

    it('drops a route whose ends do not belong to the relation', () => {
        const g = geometry({
            nodes: { Animal: box(0, 0, 10, 10), Duck: box(0, 50, 10, 10) },
            edges: { id_Other_Thing_1: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
        })
        expect(layoutClassDiagram(applyClassGeometry(diagram, g)).relations[0].route).toBeNull()
    })
})

describe('routeCurve', () => {
    const p = (x, y) => ({ x, y })
    it('is straight when inner points sit on the chord', () => {
        expect(routeCurve([p(0, 0), p(50, 0.5), p(100, 0)])).toMatchObject({ kind: 'straight', start: p(0, 0), end: p(100, 0) })
        expect(routeCurve([p(0, 0), p(10, 10)]).kind).toBe('straight')
        expect(routeCurve([p(0, 0)])).toBeNull()
    })
    it('makes a quadratic (with cubic equivalents) for one bend', () => {
        const c = routeCurve([p(0, 0), p(50, 50), p(100, 0)])
        expect(c.kind).toBe('quad')
        expect(c.control).toEqual(p(50, 50))
        expect(c.c1.x).toBeCloseTo(100 / 3)
        expect(c.c1.y).toBeCloseTo(100 / 3)
    })
    it('makes a cubic through the inner points for longer routes', () => {
        const c = routeCurve([p(0, 0), p(0, 50), p(100, 50), p(100, 100)])
        expect(c).toMatchObject({ kind: 'cubic', c1: p(0, 50), c2: p(100, 50) })
        expect(c.control).toEqual(p(50, 50))
    })
})

describe('extractMermaidGeometry', () => {
    function el(attrs = {}, { bbox, children = [] } = {}) {
        return {
            ...attrs,
            getAttribute: (k) => (k in attrs ? attrs[k] : null),
            getBBox: bbox ? () => bbox : undefined,
            querySelector: (sel) => children.find(c => sel.includes(c.tag)) || null,
        }
    }
    it('reads nodes, notes, clusters and edge routes from a rendered SVG', () => {
        const points = [{ x: 1, y: 2 }, { x: 3, y: 4 }]
        const encoded = Buffer.from(JSON.stringify(points)).toString('base64')
        const nodes = [
            el({ id: 'r-flowchart-user_db-0', transform: 'translate(100, 50)' }, { bbox: { x: -40, y: -20, width: 80, height: 40 } }),
            el({ id: 'r-classId-Duck-1', transform: 'translate(10,20)' }, { bbox: { x: -5, y: -5, width: 10, height: 10 } }),
            el({ id: 'r-note0', transform: 'translate(0,0)' }, { bbox: { x: 0, y: 0, width: 20, height: 10 } }),
            el({ id: 'r-flowchart-empty-2', transform: 'translate(0,0)' }, { bbox: { x: 0, y: 0, width: 0, height: 0 } }),
        ]
        const clusters = [el({ id: 'r-S2' }, { children: [{ tag: 'rect', getAttribute: (k) => ({ x: '8', y: '9', width: '100', height: '50' })[k] }] })]
        const paths = [el({ 'data-id': 'L_user_db_api_0', 'data-points': encoded }), el({ id: 'r-edgeNote0', 'data-points': encoded })]
        const svg = {
            getAttribute: (k) => (k === 'viewBox' ? '0 0 320 200' : null),
            querySelectorAll: (sel) => (sel === 'g.node' ? nodes : sel === 'g.cluster' ? clusters : paths),
        }
        const g = extractMermaidGeometry(svg, 'r')
        expect(g).toMatchObject({ width: 320, height: 200 })
        expect(g.nodes.get('user_db')).toEqual(box(60, 30, 80, 40))
        expect(g.nodes.get('Duck')).toEqual(box(5, 15, 10, 10))
        expect(g.nodes.has('empty')).toBe(false)
        expect(g.notes.get('__note_0')).toEqual(box(0, 0, 20, 10))
        expect(g.clusters.get('S2')).toEqual(box(8, 9, 100, 50))
        expect(g.edges.get('L_user_db_api_0')).toEqual(points)
        expect(g.edges.get('edgeNote0')).toEqual(points)
    })
})

describe('layoutWithMermaid', () => {
    it('returns the diagram unchanged without a DOM or a usable mermaid', async () => {
        const diagram = parseMermaidFlowchart('flowchart TD\n A --> B')
        expect(await layoutWithMermaid('flowchart TD\n A --> B', 'flowchart', diagram, null)).toBe(diagram)
        const restore = vi.fn()
        expect(await layoutWithMermaid('pie\n "a": 1', 'pie', diagram, { render() {}, initialize() {} }, restore)).toBe(diagram)
    })
})
