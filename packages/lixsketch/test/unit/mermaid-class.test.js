import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { layoutClassDiagram, parseClassDiagram, parseMember, renderClassOnCanvas, renderClassPreviewSVG } from '../../src/core/MermaidClassDiagram.js'

const parse = (src) => {
    const { diagram, errors } = parseClassDiagram(src)
    expect(errors).toEqual([])
    return diagram
}

const SAMPLE = `classDiagram
  direction TB
  class Animal {
    <<abstract>>
    +String name
    -int age
    #List~String~ tags
    +makeSound()* void
    +count()$ int
  }
  class Duck~T~ {
    +swim() bool
  }
  class Shape["Geometric shape"]
  <<interface>> Shape
  Animal : +isMammal() bool
  Animal <|-- Duck : extends
  Duck "1" *-- "many" Egg : lays
  Pond o-- Duck
  Duck --> Food
  Duck ..> Water : needs
  Shape <|.. Circle
  A -- B
  C .. D
  E <|--|> F
  namespace Geometry {
    class Circle
    class Square
  }
  note for Duck "can fly\\nsometimes"
  note "general note"`

describe('class diagram parser', () => {
    it('parses classes, members, visibility, classifiers, generics and annotations', () => {
        const d = parse(SAMPLE)
        const animal = d.classes.find(c => c.id === 'Animal')
        expect(animal.annotations).toEqual(['abstract'])
        expect(animal.attributes.map(m => m.text)).toEqual(['+String name', '-int age', '#List<String> tags'])
        expect(animal.methods.map(m => [m.text, m.classifier])).toEqual([
            ['+makeSound() void*', 'abstract'], ['+count() int$', 'static'], ['+isMammal() bool', null],
        ])
        expect(d.classes.find(c => c.id === 'Duck').name).toBe('Duck<T>')
        expect(d.classes.find(c => c.id === 'Shape')).toMatchObject({ label: 'Geometric shape', annotations: ['interface'] })
        expect(parseMember('~internal()$')).toMatchObject({ visibility: '~', kind: 'method', classifier: 'static' })
    })

    it('recognises every relationship kind with cardinalities and labels', () => {
        const d = parse(SAMPLE)
        expect(d.relations.map(r => `${r.from}>${r.to}:${r.kind}`)).toEqual([
            'Animal>Duck:inheritance', 'Duck>Egg:composition', 'Pond>Duck:aggregation', 'Duck>Food:association',
            'Duck>Water:dependency', 'Shape>Circle:realization', 'A>B:link', 'C>D:link-dashed', 'E>F:inheritance',
        ])
        expect(d.relations[1]).toMatchObject({ fromCardinality: '1', toCardinality: 'many', label: 'lays', leftMarker: '*' })
        expect(d.relations[8]).toMatchObject({ leftMarker: '<|', rightMarker: '|>' })
    })

    it('groups namespace classes and reads notes and direction', () => {
        const d = parse(SAMPLE)
        expect(d.namespaces).toEqual([{ id: 'Geometry', label: 'Geometry', classes: ['Circle', 'Square'] }])
        expect(d.classes.find(c => c.id === 'Circle').namespace).toBe('Geometry')
        expect(d.notes).toEqual([{ for: 'Duck', text: 'can fly\nsometimes' }, { for: null, text: 'general note' }])
        expect(parse('classDiagram\ndirection LR\nA <|-- B').direction).toBe('LR')
    })

    it('applies classDef / cssClass / ::: / style colours', () => {
        const d = parse('classDiagram\nclass A:::hot\nclass B\ncssClass "B" hot\nstyle C fill:#00f\nclassDef hot fill:#f00,color:#fff\nA --> B\nB --> C')
        expect(d.classes.map(c => c.style)).toEqual([{ fill: '#f00', labelColor: '#fff' }, { fill: '#f00', labelColor: '#fff' }, { fill: '#00f' }])
    })

    it('reports errors with line numbers', () => {
        const { diagram, errors } = parseClassDiagram('classDiagram\n  A <|-- B\n  this is ??? wrong\n  class C {\n    +x')
        expect(diagram).toBeNull()
        expect(errors[0]).toMatchObject({ line: 3 })
        expect(errors[0].message).toMatch(/Parse error on line 3/)
        expect(errors[1].message).toMatch(/class "C" is missing '}'/)
    })
})

describe('class diagram layout', () => {
    it('puts parents above children and namespaces around their classes', () => {
        const L = layoutClassDiagram(parse(SAMPLE))
        const c = Object.fromEntries(L.classes.map(k => [k.id, k]))
        expect(c.Animal.y).toBeLessThan(c.Duck.y) // Animal <|-- Duck
        expect(c.Duck.y).toBeLessThan(c.Egg.y) // Duck *-- Egg (whole above part)
        expect(c.Pond.y).toBeLessThan(c.Duck.y)
        const ns = L.namespaces[0]
        for (const id of ['Circle', 'Square']) {
            expect(c[id].x).toBeGreaterThanOrEqual(ns.x)
            expect(c[id].x + c[id].width).toBeLessThanOrEqual(ns.x + ns.width)
        }
        expect(c.Animal.height).toBeGreaterThan(c.A.height) // members grow the box
    })
})

describe('class diagram rendering', () => {
    let created
    beforeEach(() => {
        created = []
        class Base { constructor(kind, args) { Object.assign(this, args); this.kind = kind; created.push(this) } }
        globalThis.window = {
            svg: {}, shapes: [], currentViewBox: { x: 0, y: 0, width: 1000, height: 800 },
            Frame: class extends Base { constructor(x, y, w, h, o) { super('frame', { frameName: o.frameName, children: [] }) } addShapeToFrame(s) { this.children.push(s) } },
            Rectangle: class extends Base { constructor(x, y, w, h, options) { super('rect', { options }); this.shapeName = 'rectangle' } },
            Line: class extends Base { constructor(a, b, options) { super('line', { options }) } },
            Arrow: class extends Base { constructor(a, b, options) { super('arrow', { a, b, options }); this.shapeName = 'arrow' } },
            __autoAttach: (arrow, shape, isStart) => { arrow[isStart ? 'boundStart' : 'boundEnd'] = shape },
        }
    })
    afterEach(() => { delete globalThis.window })

    it('creates grouped class boxes, bound relation arrows with UML-like heads and namespace frames', () => {
        expect(renderClassOnCanvas(parse(SAMPLE))).toBe(true)
        const frames = created.filter(c => c.kind === 'frame')
        expect(frames.map(f => f.frameName)).toEqual(['Class diagram', 'Geometry'])
        const headers = created.filter(c => c.kind === 'rect' && c.options.labelFontSize === 14).map(c => c.options.label)
        expect(headers).toContain('«abstract»\nAnimal')
        expect(headers).toContain('Duck<T>')
        const arrows = created.filter(c => c.kind === 'arrow')
        const inheritance = arrows[0]
        // Animal <|-- Duck: one arrow, hollow triangle at Animal's end.
        expect(inheritance.options).toMatchObject({ startArrowhead: 'triangle_outline', endArrowhead: 'none' })
        expect(inheritance.boundStart).toBeTruthy() // bound at Animal (the arrow's start)
        const lays = arrows.find(a => a.options.label.includes('lays'))
        expect(lays.options).toMatchObject({ startArrowhead: 'diamond', endArrowhead: 'none' }) // composition
        expect(arrows.some(a => a.options.startArrowhead === 'diamond_outline')).toBe(true) // aggregation (Pond o-- Duck)
        expect(arrows.find(a => a.options.label === 'needs').options).toMatchObject({ startArrowhead: 'none', endArrowhead: 'arrow' }) // dependency
        // Two-way relation: a single arrow with both heads, no grouped halves.
        const twoWay = arrows.filter(a => a.options.startArrowhead === 'triangle_outline' && a.options.endArrowhead === 'triangle_outline')
        expect(twoWay).toHaveLength(1)
        expect(created.some(c => c.groupId?.startsWith('mermaid-rel'))).toBe(false)
        expect(arrows.find(a => a.options.label === 'needs').options.strokeDasharray).toBe('5 3')
        const classGroups = new Set(created.filter(c => c.kind === 'rect' && c.groupId?.startsWith('mermaid-class-Animal')).map(c => c.groupId))
        expect(classGroups.size).toBe(1)
        expect(frames[1].children.length).toBeGreaterThanOrEqual(8) // 2 classes × 4 rects
    })

    it('renders a preview', () => {
        const svg = renderClassPreviewSVG(parse(SAMPLE))
        expect(svg.startsWith('<svg')).toBe(true)
        expect(svg.match(/data-cd-type="class"/g).length).toBeGreaterThanOrEqual(12)
        expect(svg).toContain('data-cd-kind="composition"')
    })
})
