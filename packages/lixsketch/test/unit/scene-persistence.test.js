import { readFileSync } from 'node:fs'

import LZString from 'lz-string'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildSyntheticScene } from '../helpers/syntheticScene.js'
import { installGlobals, uninstallGlobals } from '../helpers/mockShapes.js'

vi.mock('../../src/shapes/Rectangle.js', async () => (await import('../helpers/mockShapes.js')).modules.Rectangle)
vi.mock('../../src/shapes/Circle.js', async () => (await import('../helpers/mockShapes.js')).modules.Circle)
vi.mock('../../src/shapes/Line.js', async () => (await import('../helpers/mockShapes.js')).modules.Line)
vi.mock('../../src/shapes/Arrow.js', async () => (await import('../helpers/mockShapes.js')).modules.Arrow)
vi.mock('../../src/shapes/FreehandStroke.js', async () => (await import('../helpers/mockShapes.js')).modules.FreehandStroke)
vi.mock('../../src/shapes/Frame.js', async () => (await import('../helpers/mockShapes.js')).modules.Frame)
vi.mock('../../src/shapes/TextShape.js', async () => (await import('../helpers/mockShapes.js')).modules.TextShape)
vi.mock('../../src/shapes/CodeShape.js', async () => (await import('../helpers/mockShapes.js')).modules.CodeShape)
vi.mock('../../src/shapes/IconShape.js', async () => (await import('../helpers/mockShapes.js')).modules.IconShape)
vi.mock('../../src/shapes/ImageShape.js', async () => (await import('../helpers/mockShapes.js')).modules.ImageShape)
vi.mock('../../src/core/UndoRedo.js', () => ({ clearUndoHistory: vi.fn(), pushCanvasResetAction: vi.fn() }))

const serializer = await import('../../src/core/SceneSerializer.js')
const persistence = await import('../../src/core/ScenePersistence.js')

const codec = { compress: LZString.compressToUTF16, decompress: LZString.decompressFromUTF16 }

function fixture(name) {
    return JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'))
}

function withoutCreatedAt(scene) {
    const { createdAt: _createdAt, ...rest } = scene
    return rest
}

describe('scene save/load round-trip (synthetic 2,000 shapes)', () => {
    beforeEach(() => { installGlobals(vi); serializer.resetSessionID() })
    afterEach(() => uninstallGlobals())

    it('save → load → save is lossless for every shape type', () => {
        const source = buildSyntheticScene({ total: 2000, inlineImages: 3, inlineImageBytes: 4000 })
        expect(serializer.loadScene(source)).toBe(true)
        const first = serializer.saveScene('Round trip')
        expect(first.shapes).toHaveLength(source.shapes.length)
        expect(new Set(first.shapes.map(s => s.type))).toEqual(new Set(source.shapes.map(s => s.type)))

        expect(serializer.loadScene(first)).toBe(true)
        const second = serializer.saveScene('Round trip')
        expect(withoutCreatedAt(second)).toEqual(withoutCreatedAt(first))
    })

    it('preserves arrow bindings with side and offset', () => {
        const scene = fixture('legacy-v1-arrow-binding.json')
        expect(serializer.loadScene(scene)).toBe(true)
        const arrow = window.shapes.find(s => s.shapeName === 'arrow')
        // Legacy scene: side inferred from the saved endpoints.
        expect(arrow.attachedToStart).toMatchObject({ side: 'right', offset: { x: 0, y: 0 } })
        expect(arrow.attachedToStart.shape.shapeID).toBe('box-a')
        expect(arrow.attachedToEnd).toMatchObject({ side: 'left' })
        expect(arrow.draws).toBe(1) // no redraw per binding on load

        arrow.attachedToEnd.offset = { x: 4, y: -2 }
        const saved = serializer.saveScene('Bindings')
        const savedArrow = saved.shapes.find(s => s.type === 'arrow')
        expect(savedArrow).toMatchObject({
            startAttachmentID: 'box-a',
            endAttachmentID: 'box-b',
            startBinding: { shapeID: 'box-a', side: 'right' },
            endBinding: { shapeID: 'box-b', side: 'left', offset: { x: 4, y: -2 } },
        })
        serializer.loadScene(saved)
        const restored = window.shapes.find(s => s.shapeName === 'arrow')
        expect(restored.attachedToEnd).toMatchObject({ side: 'left', offset: { x: 4, y: -2 } })
    })

    it('persists instance-level label, shading, arrowhead, lock and link state', () => {
        serializer.loadScene({
            format: 'lixsketch', version: 1, shapes: [
                { shapeID: 'r', type: 'rectangle', x: 0, y: 0, width: 10, height: 10, options: {} },
                { shapeID: 'a', type: 'arrow', startPoint: { x: 0, y: 0 }, endPoint: { x: 9, y: 9 }, options: {} },
            ],
        })
        const [rect, arrow] = window.shapes
        Object.assign(rect, { label: 'Hello', labelColor: '#f00', labelFontSize: 18, shadeColor: '#00f', shadeOpacity: 0.3, shadeDirection: 'top', locked: true, link: 'https://example.test' })
        Object.assign(arrow, { label: 'go', labelColor: '#0f0', labelFontSize: 12, labelBg: false, arrowHeadLength: 22, arrowHeadAngleDeg: 30, elbowX: 40 })
        const saved = serializer.saveScene('Labels')
        // Container (rectangle/circle) labels are top-level, written by ShapeLabelState.
        expect(saved.shapes[0]).toMatchObject({
            locked: true,
            link: 'https://example.test',
            label: 'Hello', labelColor: '#f00', labelFontSize: 18,
            options: { shadeColor: '#00f', shadeOpacity: 0.3, shadeDirection: 'top' },
        })
        expect(saved.shapes[0].options).not.toHaveProperty('label')
        expect(saved.shapes[1].options).toMatchObject({ label: 'go', labelBg: false, arrowHeadLength: 22, elbowX: 40 })
        expect(saved.shapes[1].options).not.toHaveProperty('arrowHeadAngleDeg') // default
        serializer.loadScene(saved)
        expect(window.shapes[0]).toMatchObject({ locked: true, link: 'https://example.test' })
        expect(window.shapes[0].label).toBe('Hello')
    })

    it('exports the canvas as .lixsketch text and opens it again (with scene settings)', async () => {
        serializer.loadScene(buildSyntheticScene({ total: 60, inlineImages: 1, inlineImageBytes: 2000 }))
        window.__lixsketchSceneSettings = () => ({ background: '#15111f', theme: 'dark', grid: true })
        const before = serializer.saveScene('Export')
        const text = serializer.saveSceneAsLixSketch('Export')
        expect(text.startsWith('lixsketch 1\n@name "Export"')).toBe(true)
        expect(text).toContain('@grid true')

        const applied = vi.fn()
        window.__applyLixsketchSceneSettings = applied
        const file = { name: 'export.lixsketch', arrayBuffer: async () => new TextEncoder().encode(text).buffer }
        const result = await serializer.openSceneFile(file)
        expect(result).toMatchObject({ success: true, kind: 'lixsketch' })
        expect(applied).toHaveBeenCalledWith({ background: '#15111f', theme: 'dark', grid: true })
        expect(withoutCreatedAt(serializer.saveScene('Export'))).toEqual({ ...withoutCreatedAt(before), sessionID: expect.any(String) })

        const legacy = { name: 'old.lixjson', arrayBuffer: async () => new TextEncoder().encode(readFileSync(new URL('../fixtures/legacy-v1-scene.json', import.meta.url))).buffer }
        expect(await serializer.openSceneFile(legacy)).toMatchObject({ success: true, kind: 'json' })
        const broken = { name: 'bad.lixsketch', arrayBuffer: async () => new TextEncoder().encode('lixsketch 1\nrect a at 0 0\n').buffer }
        expect(await serializer.openSceneFile(broken)).toMatchObject({ success: false, error: expect.stringMatching(/^bad\.lixsketch:2:13: Expected ','/) })
        expect(serializer.isSceneFileName('a.LIXSKETCH')).toBe(true)
        expect(serializer.isSceneFileName('a.png')).toBe(false)
    })

    it('clones options with JSON semantics and does not alias live objects', () => {
        serializer.loadScene({
            format: 'lixsketch', version: 1, shapes: [{
                shapeID: 'r', type: 'rectangle', x: 0, y: 0, width: 1, height: 1,
                options: { stroke: '#fff', nested: { a: [1, 2] } },
            }],
        })
        const rect = window.shapes[0]
        rect.options.weird = undefined
        rect.options.fn = () => {}
        rect.options.bad = Number.NaN
        const saved = serializer.saveScene('x')
        expect(saved.shapes[0].options).toEqual(JSON.parse(JSON.stringify(rect.options)))
        saved.shapes[0].options.nested.a.push(3)
        expect(rect.options.nested.a).toEqual([1, 2])
    })

    it('draws each restored frame once after its children are attached', () => {
        const source = buildSyntheticScene({ total: 200, inlineImages: 0 })
        serializer.loadScene(source)
        const frames = window.shapes.filter(s => s.shapeName === 'frame')
        expect(frames.length).toBeGreaterThan(0)
        for (const frame of frames) expect(frame.drawCount).toBe(1)
    })

    it('loads the version-one fixtures', () => {
        expect(serializer.loadScene(fixture('legacy-v1-scene.json'))).toBe(true)
        expect(window.shapes[0]).toMatchObject({ shapeID: 'legacy-rectangle', width: 180 })
        expect(serializer.loadScene(fixture('corrupt-scene.json'))).toBe(false)
    })
})

describe('ScenePersistence', () => {
    it('extracts inline images by content hash and inlines them back', () => {
        const scene = buildSyntheticScene({ total: 300, inlineImages: 4, inlineImageBytes: 3000 })
        const original = JSON.stringify(scene)
        const { scene: stripped, assets } = persistence.extractInlineAssets(scene)
        expect(JSON.stringify(scene)).toBe(original) // input untouched
        expect(assets.size).toBe(4)
        const refs = persistence.collectAssetRefs(stripped)
        expect([...refs].sort()).toEqual([...assets.keys()].sort())
        const copy = JSON.parse(JSON.stringify(stripped))
        persistence.inlineAssets(copy, id => assets.get(id))
        expect(JSON.stringify(copy)).toBe(original)
    })

    it('local store skips unchanged writes and stores each asset once', () => {
        const storage = persistence.createMemoryStorage()
        const store = persistence.createLocalSceneStore({ storage, ...codec })
        const scene = buildSyntheticScene({ total: 100, inlineImages: 2, inlineImageBytes: 5000 })
        const setItem = vi.spyOn(storage, 'setItem')

        expect(store.write('k', scene).skipped).toBe(false)
        expect(setItem).toHaveBeenCalledTimes(3) // 2 assets + body
        // A fresh snapshot of the same canvas differs only in createdAt.
        expect(store.write('k', { ...scene, createdAt: new Date().toISOString() }).skipped).toBe(true)

        const moved = { ...scene, shapes: scene.shapes.map((s, i) => (i === 0 ? { ...s, x: s.x + 1 } : s)) }
        expect(store.write('k', moved).skipped).toBe(false)
        expect(setItem).toHaveBeenCalledTimes(4) // body only — assets reused
        expect(store.read('k')).toEqual(moved)

        // Asset GC keeps referenced assets only.
        expect(store.gcAssets([moved])).toBe(0)
        expect(store.gcAssets([])).toBe(2)
    })

    it('reads legacy localStorage entries (lzs: and raw JSON)', () => {
        const scene = fixture('legacy-v1-scene.json')
        const storage = persistence.createMemoryStorage()
        storage.setItem('lzs', `lzs:${LZString.compressToUTF16(JSON.stringify(scene))}`)
        storage.setItem('raw', JSON.stringify(scene))
        storage.setItem('ptr', 'idb:123:456')
        const store = persistence.createLocalSceneStore({ storage, ...codec })
        expect(store.read('lzs')).toEqual(scene)
        expect(store.read('raw')).toEqual(scene)
        expect(store.read('ptr')).toBeNull()
        expect(persistence.decodeStoredScene('lzs:garbage', codec.decompress)).toBeNull()
    })

    it('async store round-trips, skips unchanged writes and garbage-collects', async () => {
        const kv = persistence.createMemoryKV()
        let clock = 1000
        const store = persistence.createAsyncSceneStore({ kv, now: () => clock++ })
        const scene = buildSyntheticScene({ total: 200, inlineImages: 2, inlineImageBytes: 5000 })
        const first = await store.write('a', scene)
        expect(first.skipped).toBe(false)
        expect((await store.write('a', { ...scene, createdAt: 'later' })).skipped).toBe(true)
        const read = await store.read('a')
        expect(read.scene).toEqual(scene)
        expect(read.savedAt).toBe(1000)
        // Body stored with asset refs, not inline data URLs.
        expect(kv._map.get('scene:a').json).not.toContain('data:image')

        await store.write('b', buildSyntheticScene({ total: 10, inlineImages: 0 }))
        expect(await store.gc(['b'])).toBe(2)
        expect(await store.read('a')).toBeNull()
        expect(await store.read('b')).not.toBeNull()
    })

    it('marks a superseded async write as stale', async () => {
        const kv = persistence.createMemoryKV()
        const store = persistence.createAsyncSceneStore({ kv })
        const pending = store.write('a', buildSyntheticScene({ total: 5, inlineImages: 0 }))
        store.bumpGeneration() // e.g. a synchronous unload flush happened
        expect((await pending).stale).toBe(true)
    })

    it('dirty tracker only reports changes made after the saved version', () => {
        const tracker = persistence.createDirtyTracker()
        expect(tracker.isDirty()).toBe(false)
        tracker.markDirty()
        const captured = tracker.version
        tracker.markDirty() // edit lands while the save is running
        tracker.markClean(captured)
        expect(tracker.isDirty()).toBe(true)
        tracker.markClean()
        expect(tracker.isDirty()).toBe(false)
    })

    it('scheduler debounces bursts, respects maxWait and flushes on demand', () => {
        vi.useFakeTimers()
        try {
            const run = vi.fn()
            const scheduler = persistence.createSaveScheduler({ run, delay: 100, maxWait: 250, requestIdle: null })
            for (let i = 0; i < 5; i += 1) { scheduler.schedule(); vi.advanceTimersByTime(60) }
            // 300ms of continuous edits: maxWait forced one save.
            expect(run).toHaveBeenCalledTimes(1)
            scheduler.schedule()
            expect(scheduler.pending).toBe(true)
            scheduler.flush()
            expect(run).toHaveBeenCalledTimes(2)
            scheduler.flush() // nothing pending
            expect(run).toHaveBeenCalledTimes(2)
            vi.advanceTimersByTime(1000)
            expect(run).toHaveBeenCalledTimes(2)
        } finally {
            vi.useRealTimers()
        }
    })

    it('fingerprints ignore createdAt but see real edits', () => {
        const scene = buildSyntheticScene({ total: 20, inlineImages: 0 })
        const a = persistence.sceneFingerprint(JSON.stringify(scene))
        expect(persistence.sceneFingerprint(JSON.stringify({ ...scene, createdAt: 'x' }))).toBe(a)
        expect(persistence.sceneFingerprint(JSON.stringify({ ...scene, name: 'Renamed' }))).not.toBe(a)
    })

    it('comparableSceneJSON ignores only the top-level createdAt', () => {
        const a = JSON.stringify({ format: 'lixsketch', name: 'x","createdAt":"y', createdAt: '1', shapes: [] })
        const b = JSON.stringify({ format: 'lixsketch', name: 'x","createdAt":"y', createdAt: '2', shapes: [] })
        expect(persistence.comparableSceneJSON(a)).toBe(persistence.comparableSceneJSON(b))
        expect(persistence.comparableSceneJSON(a)).toContain('createdAt\\":\\"y')
    })
})
