import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
    compileLixSketch,
    detectSceneText,
    extractTextProps,
    lixSketchToScene,
    parseLixSketch,
    sceneFromFileText,
    sceneToLixSketch,
} from '../../src/core/LixSketchFormat.js'
import { buildSyntheticScene } from '../helpers/syntheticScene.js'

function fixture(name) {
    return JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'))
}

function roundTrip(scene) {
    const text = sceneToLixSketch(scene)
    const { scene: back, errors } = compileLixSketch(text)
    expect(errors, text).toEqual([])
    return { text, back }
}

const TEXT_MARKUP = '<g id="note" data-type="text-group" data-x="40" data-y="400" transform="translate(40, 400)"><text id="note-text" x="0" y="0" fill="#e8e3f3" font-size="24" font-family="lixFont" text-anchor="start" dominant-baseline="hanging" white-space="pre" data-type="text" data-initial-size="24px">'
    + '<tspan x="0" dy="0">Hello &amp; "world"</tspan><tspan x="0" dy="1.2em">second line</tspan></text></g>'
const CODE_MARKUP = '<g id="snippet" data-type="code-group" transform="translate(600, 400)"><rect class="code-background" x="-10" y="-10" width="300" height="60"></rect><text id="snippet-code" fill="#c9d1d9" font-size="14" font-family="lixCode" data-language="javascript"><tspan x="0" dy="0">const a = 1 &lt; 2</tspan></text></g>'
const ICON_MARKUP = '<g id="ic" transform="translate(900, 40) scale(2) rotate(0, 12, 12)" data-viewbox-width="24" data-viewbox-height="24"><path d="M12 2L2 7l10 5 10-5z" fill="#fff"/></g>'

/** A scene exercising every shape type and every persisted property. */
function kitchenSink() {
    const base = { docBlockIds: [], parentFrame: null, groupId: null }
    return {
        format: 'lixsketch',
        version: 1,
        sessionID: 'lx-kitchen-sink',
        name: 'Kitchen "sink"',
        createdAt: '2026-10-25T10:00:00.000Z',
        viewport: { x: -20.5, y: 10, width: 1600, height: 900 },
        zoom: 1.25,
        settings: { background: '#15111f', theme: 'dark', grid: 'dots' },
        mcpRevision: 4,
        shapes: [
            {
                ...base, shapeID: 'frame-main', type: 'frame', x: 0, y: 0, width: 1200, height: 800, rotation: 0,
                frameName: 'Main frame', fillStyle: 'grid', fillColor: '#21182f', gridSize: 24, gridColor: 'var(--lixsketch-grid-fine, rgba(255,255,255,0.06))',
                frameType: null, webEmbedURL: null, options: { stroke: '#555', strokeWidth: 1, fill: 'transparent', opacity: 1 },
                containedShapeIDs: ['box-a', 'ellipse-b'],
            },
            {
                ...base, shapeID: 'box-a', parentFrame: 'frame-main', groupId: 'grp-1', docBlockIds: ['doc-1', 'doc-2'], locked: true, link: 'https://example.com/a?b=1#c',
                type: 'rectangle', x: 40, y: 60, width: 180, height: 90, rotation: 12.5,
                options: {
                    roughness: 2.5, stroke: '#7255b5', strokeWidth: 3, fill: '#d9ccff', fillStyle: 'cross-hatch', strokeDasharray: '10,10',
                    opacity: 0.8, label: 'Box: A\nsecond', labelColor: '#fff', labelFontSize: 18, labelBg: false,
                    shadeColor: '#00f', shadeOpacity: 0.3, shadeDirection: 'top', seed: 1234, roundness: 'round',
                    style: 'should-not-collide', 'weird key': [1, { a: null }],
                },
            },
            {
                ...base, shapeID: 'ellipse-b', parentFrame: 'frame-main', groupId: 'grp-1', type: 'circle', x: 400.25, y: 120, rx: 60, ry: 40, rotation: -15,
                options: { stroke: '#2ECC71', fill: 'transparent', fillStyle: 'none', strokeDasharray: '2,8', roughness: 0 },
            },
            {
                ...base, shapeID: 'line-1', type: 'line', startPoint: { x: 10, y: 10 }, endPoint: { x: 300, y: 1e-7 },
                controlPoint: { x: 150, y: -40 }, isCurved: true, options: { stroke: '#fff', strokeWidth: 2, strokeDasharray: '4,4', label: 'link', rotation: 3 },
            },
            {
                ...base, shapeID: 'arrow-1', type: 'arrow', startPoint: { x: 220, y: 105 }, endPoint: { x: 340, y: 120 },
                options: { stroke: '#e0e0e0', strokeWidth: 2, arrowHeadLength: 22, label: 'Yes', labelOffsetY: -6, elbowX: 280 },
                arrowOutlineStyle: 'dashed', startArrowhead: 'dot', endArrowhead: 'bar', arrowCurved: 'curved', arrowCurveAmount: 80,
                controlPoint1: { x: 250, y: 60 }, controlPoint2: { x: 300, y: 150 },
                startAttachmentID: 'box-a', endAttachmentID: 'ellipse-b',
                startBinding: { shapeID: 'box-a', side: 'right', offset: { x: 0, y: 5 } },
                endBinding: { shapeID: 'ellipse-b', side: 'perimeter', offset: { angle: 3.14 } },
            },
            {
                ...base, shapeID: 'arrow-legacy', type: 'arrow', startPoint: { x: 0, y: 0 }, endPoint: { x: 10, y: 10 },
                options: {}, arrowOutlineStyle: 'solid', startArrowhead: 'none', endArrowhead: 'arrow', arrowCurved: 'elbow', arrowCurveAmount: 50,
                startAttachmentID: 'box-a',
            },
            {
                ...base, shapeID: 'pen-1', type: 'freehandStroke', rotation: 0,
                points: [[0, 0, 0.5], [10.5, 3, 0.7], [20, -4, 0.2]],
                options: { stroke: '#302842', outlineStroke: '#302842', fill: '#a98deb', fillStyle: 'hachure', closedFill: true, strokeWidth: 2, thinning: 0.6, strokeStyle: 'dotted' },
            },
            { ...base, shapeID: 'note', type: 'text', x: 40, y: 400, rotation: 0, groupHTML: TEXT_MARKUP },
            {
                ...base, shapeID: 'tilted', type: 'text', x: 12.3, y: 15.1, rotation: 30,
                groupHTML: '<g id="tilted" data-type="text-group" transform="translate(10, 20) rotate(30, 50, 10)"><text fill="#fff" font-size="16"><tspan x="0" dy="0">Tilted</tspan></text></g>',
            },
            { ...base, shapeID: 'snippet', type: 'code', x: 600, y: 400, rotation: 0, groupHTML: CODE_MARKUP },
            {
                ...base, shapeID: 'img-inline', type: 'image', x: 10, y: 500, width: 320, height: 200, rotation: 3,
                href: `data:image/png;base64,${'QUJD'.repeat(600)}`, sizeBytes: 2048, cloudinaryId: null,
                storageProvider: 'platform_cloudinary', storageCloudName: null, aiGenerated: true, aiModel: 'flux',
                frameType: null, graphData: null,
            },
            {
                ...base, shapeID: 'img-graph', type: 'image', x: 400, y: 500, width: 300, height: 200, rotation: 0,
                href: 'https://res.cloudinary.com/demo/image/upload/v1/g.webp', sizeBytes: 0, cloudinaryId: 'asset-1',
                storageProvider: 'personal_cloudinary', storageCloudName: 'demo', aiGenerated: false, aiModel: null,
                frameType: 'graph', graphData: { expressions: ['y = x^2'], range: { x: [-5, 5] } },
            },
            {
                ...base, shapeID: 'ic', type: 'icon', x: 900, y: 40, width: 48, height: 48, rotation: 0,
                elementHTML: ICON_MARKUP, viewboxWidth: 24, viewboxHeight: 24,
            },
            {
                ...base, shapeID: 'embed-1', type: 'frame', x: 1300, y: 0, width: 640, height: 360, rotation: 0,
                frameName: 'Docs', fillStyle: 'transparent', fillColor: '#1e1e28', gridSize: 20, gridColor: 'rgba(255,255,255,0.06)',
                frameType: 'web-embed', webEmbedURL: 'https://www.youtube.com/embed/abc', options: {}, containedShapeIDs: [],
            },
            {
                ...base, shapeID: 'weird id with spaces', parentFrame: 'frame-main', type: 'rectangle', x: 1, y: 2, width: 3, height: 4, rotation: 0,
                options: { stroke: '$notAVariable', fill: 'rgba(1, 2, 3, 0.5)', fontFamily: 'lixFont, sans-serif', '': 'empty key' },
                aiGenerated: true,
            },
        ],
    }
}

describe('.lixsketch round-trip', () => {
    it('round-trips every shape type and property losslessly', () => {
        const scene = kitchenSink()
        const { text, back } = roundTrip(scene)
        expect(back).toEqual(scene)
        // Stable: serializing the compiled scene again yields identical text.
        expect(sceneToLixSketch(back)).toBe(text)
    })

    it('produces readable DSL', () => {
        const { text } = roundTrip(kitchenSink())
        expect(text.startsWith('lixsketch 1\n@name "Kitchen \\"sink\\""')).toBe(true)
        expect(text).toContain('rect box-a at 40, 60 size 180x90 {')
        expect(text).toContain('  style: dashed')
        expect(text).toContain('circle ellipse-b center 400.25, 120 radius 60, 40 {')
        expect(text).toContain('arrow arrow-1 from 220, 105 to 340, 120 {')
        expect(text).toContain('  bindStart: box-a')
        expect(text).toContain('  bindStartSide: right')
        expect(text).toContain('  contains: box-a, ellipse-b')
        expect(text).toContain('embed embed-1 at 1300, 0 size 640x360 {')
        expect(text).toContain('  content: <<<TEXT\n  Hello & "world"\n  second line\n  TEXT')
        expect(text).toContain('  markup: <<<SVG')
        expect(text).toMatch(/asset [\w-]+ = "data:image\/png;base64,/)
        expect(text).toContain('rect "weird id with spaces" at 1, 2 size 3x4 {')
        expect(text).toContain('  options.style: should-not-collide')
        expect(text).toContain('  data.aiGenerated: true')
        expect(text).toContain('@meta.mcpRevision 4')
    })

    it('round-trips a synthetic 2,000-shape scene', () => {
        const scene = buildSyntheticScene({ total: 2000, inlineImages: 2, inlineImageBytes: 3000 })
        const { back } = roundTrip(scene)
        expect(back).toEqual(scene)
    })

    it('honours edits to structured text props while keeping the rest of the markup', () => {
        const scene = kitchenSink()
        const text = sceneToLixSketch(scene)
            .replace(/content: <<<TEXT[\s\S]*?\n {2}TEXT/, 'content: "Edited"')
            .replace('text note at 40, 400', 'text note at 50, 410')
        const { scene: back } = lixSketchToScene(text)
        const note = back.shapes.find(s => s.shapeID === 'note')
        expect(extractTextProps(note.groupHTML)).toMatchObject({ content: 'Edited', fontSize: 24, color: '#e8e3f3' })
        expect(note.groupHTML).toContain('translate(50, 410)')
        expect(note.groupHTML).toContain('data-initial-size="24px"')
        expect(note.x).toBe(50)
    })
})

describe('.lixsketch authoring (LixScript syntax)', () => {
    const source = `lixsketch 1
// Comments, variables and relative positions
$blue = #4A90D9
$w = 200
rect login at 200, 60 size $w x 65 { stroke: $blue, label: "Login" }
rect next at login.right + 250, login.y size 200x65 {
  style: dotted
  fontFamily: lixFont, sans-serif
}
circle check at login.x, login.bottom + 150 size 110x110
arrow a1 from login.right to next.left { curve: curved, head: arrow }
arrow a2 from check.top to 10, 20
line l1 from login.bottom to check.top { curve: true }
text t1 at login.centerX, login.y - 30 { content: "Title", align: center, fontSize: 28 }
code c1 at 0, 400 { content: "let x = 1\\nlet y = 2", language: js }
freehand f1 at 10, 10 { points: "0,0;10,10,0.9;20,0" }
icon i1 at 0, 0 size 32x32 { svg: "<path d='M0 0h24v24H0z' fill='currentColor'/>", color: #f00 }
image img at 0, 0 size 10x10 { src: "https://example.com/x.png" }
frame f at 100, 0 size 900x600 { name: "Flow", contains: [login, next] }
embed video at 0, 0 size 320x180 { url: "https://www.youtube.com/embed/x" }
`
    it('compiles LixScript constructs into a scene', () => {
        const { scene, errors, warnings } = compileLixSketch(source)
        expect(errors).toEqual([])
        expect(warnings).toEqual([])
        const byId = Object.fromEntries(scene.shapes.map(s => [s.shapeID, s]))
        expect(byId.login).toMatchObject({ type: 'rectangle', x: 200, y: 60, width: 200, height: 65, options: { stroke: '#4A90D9', label: 'Login' } })
        expect(byId.next).toMatchObject({ x: 650, y: 60, options: { strokeDasharray: '2,8', fontFamily: 'lixFont, sans-serif' }, parentFrame: 'f' })
        expect(byId.check).toMatchObject({ type: 'circle', x: 255, y: 330, rx: 55, ry: 55 })
        expect(byId.a1).toMatchObject({
            startPoint: { x: 400, y: 92.5 }, endPoint: { x: 650, y: 92.5 }, arrowCurved: 'curved', startArrowhead: 'none', endArrowhead: 'arrow',
            startAttachmentID: 'login', startBinding: { shapeID: 'login', side: 'right' },
            endAttachmentID: 'next', endBinding: { side: 'left' },
        })
        expect(byId.a2).toMatchObject({ startAttachmentID: 'check', startBinding: { side: 'top' }, endPoint: { x: 10, y: 20 } })
        expect(byId.a2.endAttachmentID).toBeUndefined()
        expect(byId.l1).toMatchObject({ isCurved: true, startPoint: { x: 300, y: 125 } })
        expect(extractTextProps(byId.t1.groupHTML)).toMatchObject({ content: 'Title', align: 'center', fontSize: 28 })
        expect(byId.t1).toMatchObject({ x: 300, y: 30 })
        expect(extractTextProps(byId.c1.groupHTML, 'code')).toMatchObject({ content: 'let x = 1\nlet y = 2', language: 'js' })
        expect(byId.f1.points).toEqual([[10, 10, 0.5], [20, 20, 0.9], [30, 10, 0.5]])
        expect(byId.i1.elementHTML).toContain("fill=\"#f00\"")
        expect(byId.f).toMatchObject({ frameName: 'Flow', containedShapeIDs: ['login', 'next'] })
        expect(byId.video).toMatchObject({ type: 'frame', frameType: 'web-embed', webEmbedURL: 'https://www.youtube.com/embed/x' })
        expect(scene.shapes.map(s => s.shapeID)).toEqual(['login', 'next', 'check', 'a1', 'a2', 'l1', 't1', 'c1', 'f1', 'i1', 'img', 'f', 'video'])
    })

    it('resolves forward references', () => {
        const { scene, errors } = compileLixSketch('lixsketch 1\nrect b at a.right + 10, a.y\nrect a at 0, 0 size 50x20\n')
        expect(errors).toEqual([])
        expect(scene.shapes[0]).toMatchObject({ x: 60, y: 0 })
    })

    it('treats headerless documents as LixScript (frame contains everything by default)', () => {
        const { scene, errors } = compileLixSketch('rect a at 0, 0 size 10x10\nrect b at 20, 0 size 10x10\nframe f at 0, 0 size 100x100\n')
        expect(errors).toEqual([])
        expect(scene.shapes.find(s => s.shapeID === 'f').containedShapeIDs).toEqual(['a', 'b'])
        expect(scene.shapes.find(s => s.shapeID === 'a').parentFrame).toBe('f')
    })

    it('compiles the LIXSCRIPT.md quick start', () => {
        const quick = `// A simple flowchart
rect start at 200, 60 size 200x65 {
  stroke: #4A90D9
  label: "Start"
}

rect end at start.x, start.bottom + 150 size 200x65 {
  stroke: #2ECC71
  label: "End"
}

arrow a1 from start.bottom to end.top {
  stroke: #e0e0e0
}`
        const { scene, errors } = compileLixSketch(quick)
        expect(errors).toEqual([])
        expect(scene.shapes[1]).toMatchObject({ x: 200, y: 275 })
    })
})

describe('.lixsketch errors report line:col', () => {
    const cases = [
        ['lixsketch 2\n', 1, 11, /Unsupported .lixsketch version 2/],
        ['lixsketch 1\nrectangel a at 0, 0\n', 2, 1, /Unknown statement 'rectangel' \(did you mean 'rectangle'\?\)/],
        ['lixsketch 1\nrect a at 0 0\n', 2, 13, /Expected ',' between X and Y/],
        ['lixsketch 1\nrect a at 0, 0 size 10 by 10\n', 2, 24, /Expected 'x' in 'size/],
        ['lixsketch 1\nrect a at 0, 0 {\n  stroke #fff\n}\n', 3, 10, /Expected ':' after property 'stroke'/],
        ['lixsketch 1\nrect a at 0, 0 {\n  stroke: #fff\n', 2, 16, /Unclosed '\{' \(opened at 2:16\)/],
        ['lixsketch 1\nrect a at 0, 0 { label: "oops }\n', 2, 25, /Unterminated string/],
        ['lixsketch 1\nrect a at 0, 0 { stroke: $missing }\n', 2, 26, /Undefined variable '\$missing'/],
        ['lixsketch 1\nrect a at b.x, 0\n', 2, 11, /Unknown shape 'b'/],
        ['lixsketch 1\nrect a at 0, 0\nrect a at 1, 1\n', 3, 6, /Duplicate shape id 'a' \(first declared at 2:1\)/],
        ['lixsketch 1\nrect a at b.x, 0\nrect b at a.x, 0\n', 2, 1, /circular reference/],
        ['lixsketch 1\narrow x from a.middle to 0, 0\nrect a at 0, 0\n', 2, 16, /'middle' is not a connection side/],
        ['lixsketch 1\ntext t at 0, 0 { colour: red }\n', 2, 18, /Unknown property 'colour' for text \(did you mean 'color'\?\)/],
        ['lixsketch 1\nrect a at 0, 0 { rotation: fast }\n', 2, 28, /'rotation' on rect expects a number/],
        ['lixsketch 1\n@zoom -1\n', 2, 7, /@zoom must be a positive number/],
        ['lixsketch 1\n@colour red\n', 2, 1, /Unknown directive '@colour'/],
        ['lixsketch 1\ntext t at 0, 0 {\n  markup: <<<SVG\n  <g/>\n', 3, 11, /Unterminated heredoc/],
        ['lixsketch 1\nimage i at 0, 0\n', 2, 1, /requires a 'src' property/],
        ['lixsketch 1\nrect a at 0, 0 size 1x1 junk\n', 2, 25, /Unknown clause 'junk'/],
    ]
    for (const [source, line, col, message] of cases) {
        it(`${JSON.stringify(source.split('\n')[1] || source)} → ${line}:${col}`, () => {
            const { errors } = compileLixSketch(source)
            expect(errors.length).toBeGreaterThan(0)
            expect(errors[0].message).toMatch(message)
            expect({ line: errors[0].line, col: errors[0].col }).toEqual({ line, col })
        })
    }

    it('keeps parsing after an error and reports every broken statement', () => {
        const { errors } = parseLixSketch('lixsketch 1\nrect a at 0 0 {\n  stroke: #fff\n}\nbogus\nrect b at 0, 0\n')
        expect(errors.map(e => e.line)).toEqual([2, 5])
    })
})

describe('legacy JSON import', () => {
    it('converts legacy v1 fixtures to DSL and back', () => {
        for (const name of ['legacy-v1-scene.json', 'legacy-v1-arrow-binding.json']) {
            const legacy = fixture(name)
            const text = sceneToLixSketch(legacy)
            const { scene } = lixSketchToScene(text)
            // Legacy records gain the defaults saveScene() writes today …
            expect(scene.shapes.map(s => s.shapeID)).toEqual(legacy.shapes.map(s => s.shapeID))
            for (const [i, shape] of legacy.shapes.entries()) {
                // The end-only legacy arrowHeadStyle becomes start/end heads.
                const { arrowHeadStyle, ...rest } = shape
                expect(scene.shapes[i]).toMatchObject(rest)
                if (arrowHeadStyle) expect(scene.shapes[i]).toMatchObject({ startArrowhead: 'none', endArrowhead: 'arrow' })
            }
            // … and are stable from then on.
            expect(lixSketchToScene(sceneToLixSketch(scene)).scene).toEqual(scene)
        }
    })

    it('detects file kinds and opens both JSON and DSL text', () => {
        const legacy = fixture('legacy-v1-scene.json')
        expect(detectSceneText(JSON.stringify(legacy))).toBe('json')
        expect(detectSceneText('lixsketch 1\n')).toBe('lixsketch')
        expect(detectSceneText('// comment\nrect a at 0, 0')).toBe('lixsketch')
        expect(detectSceneText('hello')).toBe('unknown')
        expect(sceneFromFileText(JSON.stringify(legacy)).scene).toEqual(legacy)
        expect(sceneFromFileText(sceneToLixSketch(legacy)).scene.shapes[0]).toMatchObject(legacy.shapes[0])
        expect(() => sceneFromFileText('hello')).toThrow(/Not a LixSketch file/)
    })
})

describe('opacity and edges', () => {
    const source = [
        'lixsketch 1',
        'rect card at 0, 0 size 200x100 {',
        '  edges: round',
        '  opacity: 0.4',
        '}',
        'rect pct at 300, 0 size 100x100 { opacity: 50 }',
        'rect alias at 0, 200 size 80x80 { roundness: round }',
        'rect plain at 300, 200 size 80x80 {',
        '  edges: sharp',
        '  opacity: 1',
        '}',
        'circle dot center 500, 50 radius 20 { opacity: "30%" }',
        'frame board at 0, 400 size 300x200 { edges: round }',
        '',
    ].join('\n')

    it('compiles appearance into scene records, eliding defaults', () => {
        const { scene, errors } = compileLixSketch(source)
        expect(errors).toEqual([])
        const byId = Object.fromEntries(scene.shapes.map(shape => [shape.shapeID, shape]))
        expect(byId.card).toMatchObject({ edges: 'round', opacity: 0.4 })
        expect(byId.card.options).not.toHaveProperty('opacity')
        expect(byId.pct.opacity).toBe(0.5)
        expect(byId.alias.edges).toBe('round')
        expect(byId.plain).not.toHaveProperty('edges')
        expect(byId.plain).not.toHaveProperty('opacity')
        expect(byId.dot.opacity).toBe(0.3)
        expect(byId.board.edges).toBe('round')
    })

    it('round-trips losslessly through text', () => {
        const { scene } = compileLixSketch(source)
        const { text, back } = roundTrip(scene)
        expect(back).toEqual(scene)
        expect(text).toContain('edges: round')
        expect(text).toContain('opacity: 0.4')
        expect(text).not.toContain('roundness')
    })

    it('keeps a frame and each shape inside it at independent opacities', () => {
        const framed = [
            'lixsketch 1',
            'rect faded at 0, 0 size 100x60 { opacity: 0.3 }',
            'circle solid center 200, 30 radius 20',
            'rect half at 0, 100 size 100x60 { opacity: 50 }',
            'frame area at -20, -20 size 300x220 {',
            '  name: "Area"',
            '  opacity: 0.6',
            '  contains: faded, solid, half',
            '}',
            '',
        ].join('\n')
        const { scene, errors } = compileLixSketch(framed)
        expect(errors).toEqual([])
        const byId = Object.fromEntries(scene.shapes.map(shape => [shape.shapeID, shape]))
        expect(byId.area.opacity).toBe(0.6)
        expect(byId.faded.opacity).toBe(0.3)
        expect(byId.half.opacity).toBe(0.5)
        expect(byId.solid).not.toHaveProperty('opacity')
        expect(byId.area.containedShapeIDs).toEqual(expect.arrayContaining(['faded', 'solid', 'half']))
        const { back } = roundTrip(scene)
        expect(back).toEqual(scene)
    })

    it('rejects invalid values', () => {
        expect(compileLixSketch('lixsketch 1\nrect a at 0, 0 size 10x10 { edges: wobbly }').errors[0].message).toMatch(/sharp' or 'round/)
        expect(compileLixSketch('lixsketch 1\nrect a at 0, 0 size 10x10 { opacity: 400 }').errors[0].message).toMatch(/0 to 1/)
    })
})

describe('arrowheads', () => {
    const src = [
        'lixsketch 1',
        'rect a at 0, 0 size 100x50',
        'rect b at 300, 0 size 100x50',
        'arrow both from a.right to b.left {',
        '  startHead: crowfoot_one',
        '  endHead: crowfoot_one_or_many',
        '}',
        'arrow legacy from 0, 200 to 100, 200 { head: solid }',
        'arrow plain from 0, 300 to 100, 300',
        '',
    ].join('\n')

    it('compiles start/end heads and the legacy head property', () => {
        const { scene, errors } = compileLixSketch(src)
        expect(errors).toEqual([])
        const byId = Object.fromEntries(scene.shapes.map(shape => [shape.shapeID, shape]))
        expect(byId.both).toMatchObject({ startArrowhead: 'crowfoot_one', endArrowhead: 'crowfoot_one_or_many' })
        expect(byId.legacy).toMatchObject({ startArrowhead: 'none', endArrowhead: 'triangle' })
        expect(byId.plain).toMatchObject({ startArrowhead: 'none', endArrowhead: 'arrow' })
        expect(byId.legacy).not.toHaveProperty('arrowHeadStyle')
    })

    it('round-trips losslessly and writes only non-default heads', () => {
        const { scene } = compileLixSketch(src)
        const { text, back } = roundTrip(scene)
        expect(back).toEqual(scene)
        expect(text).toContain('startHead: crowfoot_one')
        expect(text).toContain('endHead: triangle')
        expect(text).not.toMatch(/\bhead:/)
    })

    it('rejects unknown heads', () => {
        const { errors } = compileLixSketch('lixsketch 1\narrow x from 0, 0 to 1, 1 { endHead: spiral }')
        expect(errors[0].message).toMatch(/one of none, arrow/)
    })

    it('upgrades legacy scenes on export', () => {
        const legacy = {
            format: 'lixsketch', version: 1, name: 'L', shapes: [
                { shapeID: 'old', type: 'arrow', startPoint: { x: 0, y: 0 }, endPoint: { x: 1, y: 1 }, options: {}, arrowHeadStyle: 'outline', docBlockIds: [], groupId: null, parentFrame: null },
            ],
        }
        const { back } = roundTrip(legacy)
        expect(back.shapes[0]).toMatchObject({ startArrowhead: 'none', endArrowhead: 'triangle_outline' })
        expect(back.shapes[0]).not.toHaveProperty('arrowHeadStyle')
    })
})

describe('line arrowheads', () => {
    it('compiles startHead/endHead on lines, never storing none', () => {
        const { scene, errors } = compileLixSketch('lixsketch 1\nline a from 0, 0 to 100, 0 { endHead: triangle }\nline b from 0, 50 to 100, 50 { startHead: none }\n')
        expect(errors).toEqual([])
        const [a, b] = scene.shapes
        expect(a.endArrowhead).toBe('triangle')
        expect(a).not.toHaveProperty('startArrowhead')
        expect(b).not.toHaveProperty('startArrowhead')
        const { text, back } = roundTrip(scene)
        expect(back).toEqual(scene)
        expect(text).toContain('endHead: triangle')
    })

    it('rejects unknown line heads', () => {
        expect(compileLixSketch('lixsketch 1\nline a from 0, 0 to 1, 1 { endHead: blob }').errors[0].message).toMatch(/one of none/)
    })
})
