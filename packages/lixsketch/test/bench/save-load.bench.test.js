// Save/load pipeline benchmark on a synthetic 2,000-shape scene.
// Run: npm run bench --workspace @elixpo/lixsketch
import { webcrypto } from 'node:crypto'
import LZString from 'lz-string'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'

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
vi.mock('../../src/core/UndoRedo.js', () => ({ clearUndoHistory() {}, pushCanvasResetAction() {} }))

const serializer = await import('../../src/core/SceneSerializer.js')
let persistence = null
try { persistence = await import('../../src/core/ScenePersistence.js') } catch { /* baseline build */ }

const ITERATIONS = Number(process.env.BENCH_ITERATIONS || 7)

async function time(fn) {
    const samples = []
    for (let i = 0; i < ITERATIONS; i += 1) {
        const start = performance.now()
        await fn()
        samples.push(performance.now() - start)
    }
    samples.sort((a, b) => a - b)
    return samples[Math.floor(samples.length / 2)]
}

async function encryptString(plaintext, rawKey) {
    const key = await webcrypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, ['encrypt'])
    const iv = webcrypto.getRandomValues(new Uint8Array(12))
    return webcrypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext))
}

const results = []
const record = (name, ms) => results.push({ step: name, 'median ms': Number(ms.toFixed(2)) })

beforeAll(() => { installGlobals() })
afterAll(() => {
    console.table(results)
    uninstallGlobals()
})

it('measures the save/load pipeline on 2,000 mixed shapes', async () => {
    const source = buildSyntheticScene({ total: 2000 })
    expect(serializer.loadScene(source)).toBe(true)
    const rawKey = webcrypto.getRandomValues(new Uint8Array(32))

    // ── Legacy pipeline (what useAutoSave did before lix/06) ──
    record('serialize (saveScene)', await time(() => serializer.saveScene('Bench')))
    const scene = serializer.saveScene('Bench')
    const json = JSON.stringify(scene)
    record('JSON.stringify', await time(() => JSON.stringify(scene)))
    let compressed = ''
    record('legacy local write: serialize+stringify+LZ', await time(() => {
        compressed = 'lzs:' + LZString.compressToUTF16(JSON.stringify(serializer.saveScene('Bench')))
    }))
    record('legacy cloud prep: LZ decompress+parse+stringify+encrypt', await time(async () => {
        const text = JSON.stringify(JSON.parse(LZString.decompressFromUTF16(compressed.slice(4))))
        await encryptString(text, rawKey)
    }))
    record('legacy restore: LZ decompress+parse+loadScene', await time(() => {
        serializer.loadScene(JSON.parse(LZString.decompressFromUTF16(compressed.slice(4))))
    }))
    record('loadScene only', await time(() => serializer.loadScene(scene)))
    console.log(`scene JSON: ${(json.length / 1024).toFixed(0)} KiB, legacy local entry: ${(compressed.length * 2 / 1024).toFixed(0)} KiB`)

    if (!persistence) return
    // ── New pipeline ──
    const codec = { compress: LZString.compressToUTF16, decompress: LZString.decompressFromUTF16 }
    const storage = persistence.createMemoryStorage()
    const store = persistence.createLocalSceneStore({ storage, ...codec })
    store.write('lixsketch-autosave-bench', scene)
    record('new local write (IndexedDB path): first write', await time(async () => {
        const fresh = persistence.createAsyncSceneStore({ kv: persistence.createMemoryKV() })
        await fresh.write('k', serializer.saveScene('Bench'))
    }))
    record('new local write (sync LZ fallback): first write', await time(() => {
        const fresh = persistence.createLocalSceneStore({ storage: persistence.createMemoryStorage(), ...codec })
        fresh.write('k', serializer.saveScene('Bench'))
    }))
    record('new local write: unchanged scene (skipped)', await time(() => {
        store.write('lixsketch-autosave-bench', serializer.saveScene('Bench'))
    }))
    let flip = 0
    let lastWrite = null
    record('new local write (sync LZ fallback): one shape moved', await time(() => {
        window.shapes[0].x += (flip ^= 1) ? 1 : -1
        lastWrite = store.write('lixsketch-autosave-bench', serializer.saveScene('Bench'))
    }))
    const kvStore = persistence.createAsyncSceneStore({ kv: persistence.createMemoryKV() })
    await kvStore.write('bench', serializer.saveScene('Bench'))
    record('new local write (IndexedDB path): one shape moved', await time(async () => {
        window.shapes[0].x += (flip ^= 1) ? 1 : -1
        await kvStore.write('bench', serializer.saveScene('Bench'))
    }))
    record('new cloud prep: in-memory JSON + encrypt', await time(async () => {
        await encryptString(lastWrite.json, rawKey)
    }))
    record('new cloud prep: unchanged fingerprint (skipped)', await time(() => {
        persistence.sceneFingerprint(lastWrite.json)
    }))
    record('new restore (IndexedDB path): read+loadScene', await time(async () => {
        serializer.loadScene((await kvStore.read('bench')).scene)
    }))
    record('new restore (LZ fallback): read+loadScene', await time(() => {
        serializer.loadScene(store.read('lixsketch-autosave-bench'))
    }))
    // App encryption helper (chunked base64 + cached CryptoKey) vs. the
    // previous per-byte base64 loop, on the full scene JSON.
    const { encrypt, generateKey } = await import('../../../../src/utils/encryption.js')
    const sessionKey = await generateKey()
    record('app encrypt(): full scene JSON', await time(() => encrypt(json, sessionKey)))
    record('legacy encrypt (importKey + per-byte base64)', await time(async () => {
        const buffer = new Uint8Array(await encryptString(json, rawKey))
        let binary = ''
        for (let i = 0; i < buffer.length; i++) binary += String.fromCharCode(buffer[i])
        btoa(binary)
    }))
    const tracker = persistence.createDirtyTracker()
    record('new idle tick: nothing dirty', await time(() => { if (tracker.isDirty()) serializer.saveScene('Bench') }))
    const entry = storage.getItem('lixsketch-autosave-bench')
    console.log(`new local entry: ${(entry.length * 2 / 1024).toFixed(0)} KiB (+ assets stored once)`)
})
