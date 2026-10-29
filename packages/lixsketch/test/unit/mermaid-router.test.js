import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
    MERMAID_TYPES,
    detectMermaidType,
    mermaidError,
    planMermaid,
    previewMermaid,
    renderMermaidOnCanvas,
    setMermaidLoader,
    svgToDataUrl,
} from '../../src/core/MermaidRouter.js'

function fakeMermaid({ parseError = null } = {}) {
    return {
        initialize: vi.fn(),
        parse: vi.fn(async () => { if (parseError) throw parseError; return { diagramType: 'x' } }),
        render: vi.fn(async (id) => ({ svg: `<svg id="${id}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200"><text>ok</text></svg>` })),
    }
}

describe('mermaid type routing', () => {
    it('routes native and image types like Excalidraw', () => {
        const path = (src) => detectMermaidType(src).path
        expect(path('flowchart LR\nA-->B')).toBe('native')
        expect(path('graph TD\nA-->B')).toBe('native')
        expect(path('sequenceDiagram\nA->>B: x')).toBe('native')
        expect(path('classDiagram\nA <|-- B')).toBe('native')
        expect(path('erDiagram\nA ||--o{ B : x')).toBe('native')
        expect(path('pie\n"a": 1')).toBe('native')
        expect(path('xychart-beta\nbar [1]')).toBe('native')
        for (const kw of ['stateDiagram-v2', 'gantt', 'journey', 'mindmap', 'timeline', 'gitGraph', 'quadrantChart', 'sankey-beta', 'requirementDiagram', 'C4Context', 'block-beta', 'packet-beta', 'architecture-beta', 'kanban']) {
            expect(path(`${kw}\n  x`), kw).toBe('image')
        }
        expect(detectMermaidType('---\ntitle: T\n---\n%%{init: {"theme":"dark"}}%%\nsequenceDiagram\nA->>B: x').type).toBe('sequence')
        expect(detectMermaidType('A --> B')).toMatchObject({ type: 'flowchart', headerless: true })
        expect(MERMAID_TYPES.filter(t => t.path === 'native').map(t => t.type)).toEqual(['flowchart', 'flowchart', 'flowchart', 'sequence', 'class', 'class', 'er', 'pie', 'xychart', 'xychart'])
    })

    it('extracts line numbers from mermaid errors', () => {
        expect(mermaidError({ message: 'Parse error on line 3:\n...\nExpecting SEMI' })).toMatchObject({ line: 3 })
        expect(mermaidError({ message: 'bad', hash: { loc: { first_line: 7 } } })).toMatchObject({ line: 7, message: 'bad' })
        expect(mermaidError({ message: 'bad', hash: { line: 1 } })).toMatchObject({ line: 2 })
    })
})

describe('mermaid planning, preview and placement', () => {
    let images
    beforeEach(() => {
        images = []
        globalThis.window = {
            svg: { appendChild: vi.fn() }, shapes: [], currentViewBox: { x: 0, y: 0, width: 1000, height: 800 },
            ImageShape: class { constructor(el) { this.el = el; images.push(this) } },
            Rectangle: class {}, Arrow: class {}, Line: class {}, Circle: class {}, Frame: class { addShapeToFrame() {} },
        }
        globalThis.document = { createElementNS: () => { const attrs = {}; return { attrs, setAttribute: (k, v) => { attrs[k] = String(v) } } } }
    })
    afterEach(() => {
        setMermaidLoader(null)
        delete globalThis.window
        delete globalThis.document
    })

    it('uses the native importer when it can read the source', async () => {
        setMermaidLoader(async () => fakeMermaid())
        const plan = await planMermaid('flowchart LR\nA-->B')
        expect(plan).toMatchObject({ ok: true, path: 'native', type: 'flowchart' })
        const preview = await previewMermaid('classDiagram\nA <|-- B')
        expect(preview.svg).toMatch(/^<svg/)
        expect(preview.path).toBe('native')
    })

    it('renders other types with mermaid and inserts them as one image', async () => {
        const mermaid = fakeMermaid()
        setMermaidLoader(async () => ({ default: mermaid }))
        const src = 'stateDiagram-v2\n  [*] --> Idle\n  Idle --> [*]'
        const preview = await previewMermaid(src)
        expect(preview).toMatchObject({ ok: true, path: 'image', type: 'state' })
        expect(preview.svg).toContain('viewBox="0 0 320 200"')
        const result = await renderMermaidOnCanvas(src)
        expect(result).toMatchObject({ ok: true, path: 'image' })
        expect(images).toHaveLength(1)
        const attrs = images[0].el.attrs
        expect(attrs.href.startsWith('data:image/svg+xml;base64,')).toBe(true)
        expect(attrs).toMatchObject({ width: '320', height: '200', 'data-mermaid-type': 'state', 'data-mermaid-source': src })
        expect(mermaid.initialize).toHaveBeenCalledWith(expect.objectContaining({ startOnLoad: false, securityLevel: 'strict' }))
    })

    it('falls back to an image when mermaid accepts syntax the native importer cannot read', async () => {
        setMermaidLoader(async () => fakeMermaid())
        const plan = await planMermaid('sequenceDiagram\n  A->>B: hi\n  something mermaid-only')
        expect(plan).toMatchObject({ ok: true, path: 'image', fallback: true, type: 'sequence' })
    })

    it('surfaces mermaid parse errors with line info instead of an empty result', async () => {
        setMermaidLoader(async () => fakeMermaid({ parseError: { message: 'Parse error on line 2:\nA-->\n----^\nExpecting NODE_STRING' } }))
        const plan = await planMermaid('gantt\n  oops ::')
        expect(plan.ok).toBe(false)
        expect(plan.errors[0]).toMatchObject({ line: 2 })
        expect(plan.errors[0].message).toMatch(/Expecting NODE_STRING/)
        const preview = await previewMermaid('flowchart TD\n  A[oops')
        expect(preview.ok).toBe(false)
        expect(preview.svg).toBe('')
        expect(preview.errors[0].line).toBe(2)
    })

    it('without the mermaid library: native still works, image types and native errors are explained', async () => {
        expect((await planMermaid('graph TD\nA-->B')).ok).toBe(true)
        const image = await planMermaid('gantt\n  title x')
        expect(image).toMatchObject({ ok: false, path: 'image' })
        expect(image.errors[0].message).toMatch(/rendered by the Mermaid library/)
        const broken = await planMermaid('graph TD\n  A --> B\n  C[[unclosed')
        expect(broken.errors[0]).toMatchObject({ line: 3 })
        expect(broken.errors[0].message).toMatch(/Parse error on line 3/)
        expect((await planMermaid('   ')).ok).toBe(false)
    })

    it('encodes SVG as a UTF-8 data URL', () => {
        expect(svgToDataUrl('<svg>é</svg>')).toBe(`data:image/svg+xml;base64,${Buffer.from('<svg>é</svg>').toString('base64')}`)
    })
})
