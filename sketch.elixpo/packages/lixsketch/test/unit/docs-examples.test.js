// Every example in the format/Mermaid reference docs must actually work:
// ```lixsketch / ```lixscript blocks compile without errors or warnings and
// ```mermaid blocks parse and render a preview through the engine's own
// Mermaid parsers (string based, no DOM needed).
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { compileLixSketch, lixSketchToScene, sceneToLixSketch } from '../../src/core/LixSketchFormat.js'
import { parseMermaid, unsupportedMermaidType } from '../../src/core/AIRenderer.js'
import { parseSequenceDiagram } from '../../src/core/MermaidSequenceParser.js'
import { detectMermaidType, parseNative, previewMermaid } from '../../src/core/MermaidRouter.js'

const DOCS = [
    '../../../../src/content/docs/lixsketch-dsl.md',
    '../../../../src/content/docs/mermaid.md',
    '../../../../LIXSCRIPT.md',
]

function codeBlocks(path) {
    const text = readFileSync(new URL(path, import.meta.url), 'utf8')
    const blocks = []
    const lines = text.split('\n')
    for (let i = 0; i < lines.length; i += 1) {
        const open = lines[i].match(/^```(\S*)\s*$/)
        if (!open) continue
        const start = i + 1
        const body = []
        i += 1
        while (i < lines.length && !/^```\s*$/.test(lines[i])) { body.push(lines[i]); i += 1 }
        blocks.push({ lang: open[1], code: body.join('\n'), line: start })
    }
    return blocks
}

// Native types render through the engine's own parsers (no DOM, no
// mermaid library); image types must at least be routed to the image path.
async function renderMermaid(src) {
    const native = parseNative(src)
    if (native.path === 'image') return { path: 'image', native }
    const preview = await previewMermaid(src)
    return { path: 'native', native, preview }
}

for (const path of DOCS) {
    const name = path.split('/').pop()
    const blocks = codeBlocks(path)
    const dsl = blocks.filter(b => b.lang === 'lixsketch' || b.lang === 'lixscript')
    const mermaid = blocks.filter(b => b.lang === 'mermaid')

    describe(`${name} examples`, () => {
        it('has examples', () => {
            expect(dsl.length + mermaid.length).toBeGreaterThan(0)
        })

        for (const block of dsl) {
            it(`${block.lang} block at line ${block.line} compiles`, () => {
                const { scene, errors, warnings } = compileLixSketch(block.code)
                expect(errors.map(e => `${block.line + e.line - 1}:${e.col}: ${e.message}`)).toEqual([])
                expect(warnings.map(e => `${block.line + e.line - 1}:${e.col}: ${e.message}`)).toEqual([])
                expect(scene.shapes.length).toBeGreaterThan(0)
                // And survives an export/import round trip.
                expect(lixSketchToScene(sceneToLixSketch(scene)).scene).toEqual(scene)
            })
        }

        for (const block of mermaid) {
            it(`mermaid block at line ${block.line} parses and renders (${detectMermaidType(block.code).path})`, async () => {
                const result = await renderMermaid(block.code)
                if (result.path === 'image') {
                    expect(result.native.keyword).toBeTruthy()
                    return
                }
                expect(result.native.errors).toEqual([])
                expect(result.native.diagram).toBeTruthy()
                expect(result.preview.ok).toBe(true)
                expect(result.preview.path).toBe('native')
                expect(result.preview.svg).toMatch(/^\s*<svg/)
            })
        }
    })
}

describe('Mermaid behaviour documented in mermaid.md', () => {
    it('keeps non-flowchart sources out of the flowchart parser', () => {
        expect(parseMermaid('classDiagram\n  Animal <|-- Duck')).toBeNull()
        expect(parseMermaid('stateDiagram-v2\n  [*] --> Still')).toBeNull()
        expect(parseMermaid('gantt\n  title Plan')).toBeNull()
        expect(unsupportedMermaidType('%% comment\nmindmap\n  root')).toBe('mindmap')
        expect(parseMermaid('A --> B')).toMatchObject({ direction: 'TB' })
    })

    it('maps participant aliases to one box', () => {
        const d = parseSequenceDiagram('sequenceDiagram\n  participant A as Alice\n  A->>B: hi\n  Note over A,B: x')
        expect(d.participants.map(p => p.name)).toEqual(['Alice', 'B'])
        expect(d.messages[0]).toMatchObject({ from: 'Alice', to: 'B' })
        expect(d.notes[0].targets).toEqual(['Alice', 'B'])
    })

    it('accepts `title Text` without a colon', () => {
        expect(parseSequenceDiagram('sequenceDiagram\n  title Checkout\n  A->>B: x').title).toBe('Checkout')
    })

    it('maps classDef / style to node styles', () => {
        const d = parseMermaid('flowchart LR\n  classDef hot fill:#E74C3C,stroke:#922B21,stroke-width:3px,color:#ffffff\n  A[Alert] --> B\n  class A hot\n  style B stroke-width:4px')
        expect(d.nodes.find(n => n.id === 'A')).toMatchObject({ fill: '#E74C3C', stroke: '#922B21', strokeWidth: 3, labelColor: '#ffffff' })
        expect(d.nodes.find(n => n.id === 'B')).toMatchObject({ strokeWidth: 4 })
    })
})
