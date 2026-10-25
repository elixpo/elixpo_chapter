/**
 * ScenePersistence — environment-agnostic building blocks for fast local
 * scene saves/loads. The app (src/hooks/useAutoSave.js) wires these to
 * IndexedDB + localStorage; tests and the benchmark use in-memory stores.
 *
 * What makes the save path fast:
 *  - Dirty tracking: nothing is serialized when nothing changed.
 *  - Unchanged-skip: the last written JSON is kept per key; an identical
 *    snapshot is not compressed/written again.
 *  - Content-addressed assets: inline `data:` image hrefs are split out of
 *    the scene and stored once under their hash, so the body that gets
 *    rewritten on every edit stays small.
 *  - Async store (IndexedDB) stores the JSON body uncompressed: no LZ pass
 *    on the main thread. LZ is only used for the synchronous localStorage
 *    fallback (private mode / unload flush).
 *
 * The on-disk scene body is still a v1 `.lixjson` scene (with asset refs),
 * so a body can always be inlined back to the exact object `saveScene()`
 * produced. Legacy localStorage entries (`lzs:` + LZ, or raw JSON) remain
 * readable.
 */

export const ASSET_REF_PREFIX = 'lixasset:';
export const COMPRESSED_PREFIX = 'lzs:';
export const IDB_MARKER_PREFIX = 'idb:';
const DEFAULT_ASSET_MIN_LENGTH = 1024;

// cyrb53 — fast, well-distributed 53-bit string hash. Not cryptographic;
// collisions only matter within one browser's asset cache and are guarded
// by also comparing lengths (hash + length in the id).
export function hashString(str, seed = 0) {
    let h1 = 0xdeadbeef ^ seed;
    let h2 = 0x41c6ce57 ^ seed;
    for (let i = 0; i < str.length; i += 1) {
        const ch = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export function assetIdFor(dataUrl) {
    return `${hashString(dataUrl)}-${dataUrl.length.toString(36)}`;
}

/**
 * `saveScene()` stamps `createdAt` on every call; strip it so two snapshots
 * of an unchanged canvas compare equal. The key is emitted before `shapes`
 * and a literal `,"createdAt":"` cannot occur inside an escaped string
 * value, so the first match is always the top-level key.
 */
export function comparableSceneJSON(json) {
    return json.replace(/,"createdAt":"[^"]*"/, '');
}

function isInlineAsset(href, minLength) {
    return typeof href === 'string' && href.startsWith('data:') && href.length >= minLength;
}

/**
 * Replace inline image data URLs with `lixasset:<id>` refs.
 * Returns a new scene object (input untouched) and the extracted assets.
 */
export function extractInlineAssets(scene, { minLength = DEFAULT_ASSET_MIN_LENGTH } = {}) {
    const assets = new Map();
    if (!scene || !Array.isArray(scene.shapes)) return { scene, assets };
    let changed = false;
    const shapes = scene.shapes.map((shape) => {
        if (!shape || shape.type !== 'image' || !isInlineAsset(shape.href, minLength)) return shape;
        const id = assetIdFor(shape.href);
        assets.set(id, shape.href);
        changed = true;
        return { ...shape, href: ASSET_REF_PREFIX + id };
    });
    return { scene: changed ? { ...scene, shapes } : scene, assets };
}

export function collectAssetRefs(scene) {
    const refs = new Set();
    for (const shape of scene?.shapes || []) {
        if (shape && typeof shape.href === 'string' && shape.href.startsWith(ASSET_REF_PREFIX)) {
            refs.add(shape.href.slice(ASSET_REF_PREFIX.length));
        }
    }
    return refs;
}

/** Inline asset refs back into the scene (mutates and returns it). */
export function inlineAssets(scene, lookup) {
    const missing = [];
    for (const shape of scene?.shapes || []) {
        if (!shape || typeof shape.href !== 'string' || !shape.href.startsWith(ASSET_REF_PREFIX)) continue;
        const id = shape.href.slice(ASSET_REF_PREFIX.length);
        const value = lookup(id);
        if (typeof value === 'string') shape.href = value;
        else { missing.push(id); shape.href = ''; }
    }
    return { scene, missing };
}

/** Tracks whether the canvas changed since the last successful save. */
export function createDirtyTracker() {
    let version = 0;
    let savedVersion = 0;
    return {
        markDirty() { version += 1; return version; },
        /** Mark clean up to `upTo` (the version captured before saving). */
        markClean(upTo = version) { savedVersion = Math.max(savedVersion, upTo); },
        isDirty() { return version !== savedVersion; },
        get version() { return version; },
    };
}

/**
 * Debounced, idle-scheduled save runner.
 *  schedule(): coalesce bursts; runs after `delay` ms of quiet, but never
 *              later than `maxWait` ms after the first change, in an idle
 *              callback when available.
 *  flush():    run immediately (sync) if anything is pending.
 */
export function createSaveScheduler({
    run,
    delay = 400,
    maxWait = 3000,
    setTimer = (fn, ms) => setTimeout(fn, ms),
    clearTimer = (id) => clearTimeout(id),
    requestIdle = typeof requestIdleCallback === 'function'
        ? (fn, opts) => requestIdleCallback(fn, opts) : null,
    cancelIdle = typeof cancelIdleCallback === 'function'
        ? (id) => cancelIdleCallback(id) : null,
} = {}) {
    let timer = null;
    let idleHandle = null;
    let firstPendingAt = 0;
    let pending = false;

    const clear = () => {
        if (timer !== null) { clearTimer(timer); timer = null; }
        if (idleHandle !== null && cancelIdle) { cancelIdle(idleHandle); }
        idleHandle = null;
    };

    const execute = () => {
        clear();
        if (!pending) return undefined;
        pending = false;
        firstPendingAt = 0;
        return run();
    };

    const fire = () => {
        timer = null;
        if (requestIdle) {
            idleHandle = requestIdle(() => { idleHandle = null; execute(); }, { timeout: 1000 });
        } else {
            execute();
        }
    };

    return {
        schedule() {
            const now = Date.now();
            if (!pending) firstPendingAt = now;
            pending = true;
            if (idleHandle !== null) return; // already queued for idle time
            if (timer !== null) clearTimer(timer);
            const waited = now - firstPendingAt;
            timer = setTimer(fire, Math.max(0, Math.min(delay, maxWait - waited)));
        },
        flush() { return execute(); },
        cancel() { pending = false; clear(); },
        get pending() { return pending; },
    };
}

/** localStorage-compatible in-memory storage (tests, benchmark, SSR). */
export function createMemoryStorage() {
    const map = new Map();
    return {
        getItem: (key) => (map.has(key) ? map.get(key) : null),
        setItem: (key, value) => { map.set(key, String(value)); },
        removeItem: (key) => { map.delete(key); },
        key: (index) => Array.from(map.keys())[index] ?? null,
        get length() { return map.size; },
        clear: () => map.clear(),
    };
}

/** Map-backed async key/value store with the IndexedDB adapter's shape. */
export function createMemoryKV() {
    const map = new Map();
    return {
        async get(key) { return map.get(key); },
        async set(key, value) { map.set(key, value); },
        async delete(key) { map.delete(key); },
        async keys() { return Array.from(map.keys()); },
        _map: map,
    };
}

/** Parse a localStorage scene entry (legacy raw JSON or `lzs:` body). */
export function decodeStoredScene(raw, decompress) {
    if (!raw || raw.startsWith(IDB_MARKER_PREFIX)) return null;
    try {
        if (raw.startsWith(COMPRESSED_PREFIX)) {
            if (!decompress) return null;
            const text = decompress(raw.slice(COMPRESSED_PREFIX.length));
            return text ? JSON.parse(text) : null;
        }
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

/**
 * Synchronous localStorage scene store (fallback + unload flush).
 * Body: `lzs:` + LZ(JSON(scene with asset refs)). Assets: one entry per
 * content hash under `${assetPrefix}${id}`, written once.
 */
export function createLocalSceneStore({
    storage,
    compress,
    decompress,
    assetPrefix = 'lixsketch-asset-',
    assetMinLength = DEFAULT_ASSET_MIN_LENGTH,
} = {}) {
    const lastJSON = new Map();
    const encodeAsset = (value) => (compress ? COMPRESSED_PREFIX + compress(value) : value);
    const decodeAsset = (raw) => {
        if (raw == null) return undefined;
        if (raw.startsWith(COMPRESSED_PREFIX)) return decompress ? decompress(raw.slice(COMPRESSED_PREFIX.length)) : undefined;
        return raw;
    };

    return {
        /**
         * Write a scene. `json` may be passed when the caller already has
         * JSON.stringify(scene). Returns { skipped, bytes }.
         */
        write(key, scene, json = JSON.stringify(scene)) {
            const comparable = comparableSceneJSON(json);
            if (lastJSON.get(key) === comparable) return { skipped: true, bytes: 0, json };
            const { scene: stripped, assets } = extractInlineAssets(scene, { minLength: assetMinLength });
            for (const [id, value] of assets) {
                const assetKey = assetPrefix + id;
                if (storage.getItem(assetKey) == null) storage.setItem(assetKey, encodeAsset(value));
            }
            const bodyJSON = assets.size ? JSON.stringify(stripped) : json;
            const body = compress ? COMPRESSED_PREFIX + compress(bodyJSON) : bodyJSON;
            storage.setItem(key, body);
            lastJSON.set(key, comparable);
            return { skipped: false, bytes: body.length * 2, json };
        },
        read(key) {
            const scene = decodeStoredScene(storage.getItem(key), decompress);
            if (!scene) return null;
            inlineAssets(scene, (id) => decodeAsset(storage.getItem(assetPrefix + id)));
            return scene;
        },
        /** Last persisted snapshot for `key` (comparable form, createdAt stripped). */
        lastJSON(key) { return lastJSON.get(key) ?? null; },
        /** Remember `json` as already persisted under `key` (e.g. after a load). */
        remember(key, json) { lastJSON.set(key, comparableSceneJSON(json)); },
        forget(key) { lastJSON.delete(key); },
        /** Remove asset entries not referenced by any of `keepScenes`. */
        gcAssets(keepScenes = []) {
            const keep = new Set();
            for (const s of keepScenes) for (const id of collectAssetRefs(extractInlineAssets(s, { minLength: assetMinLength }).scene)) keep.add(id);
            const remove = [];
            for (let i = 0; i < storage.length; i += 1) {
                const k = storage.key(i);
                if (k && k.startsWith(assetPrefix) && !keep.has(k.slice(assetPrefix.length))) remove.push(k);
            }
            remove.forEach((k) => storage.removeItem(k));
            return remove.length;
        },
    };
}

/**
 * Async scene store over a key/value backend (IndexedDB in the app).
 * Records: `scene:<key>` → { json, savedAt, bytes }, `asset:<id>` → dataUrl.
 * The JSON body is stored uncompressed — IndexedDB has no 5 MB quota and
 * skipping LZ keeps saves off the critical path.
 */
export function createAsyncSceneStore({ kv, assetMinLength = DEFAULT_ASSET_MIN_LENGTH, now = () => Date.now() } = {}) {
    const lastJSON = new Map();
    const knownAssets = new Set();
    let generation = 0;

    return {
        get generation() { return generation; },
        bumpGeneration() { generation += 1; return generation; },
        async write(key, scene, json = JSON.stringify(scene)) {
            const comparable = comparableSceneJSON(json);
            if (lastJSON.get(key) === comparable) return { skipped: true, bytes: 0, json, generation };
            const myGeneration = ++generation;
            const { scene: stripped, assets } = extractInlineAssets(scene, { minLength: assetMinLength });
            for (const [id, value] of assets) {
                if (knownAssets.has(id)) continue;
                // eslint-disable-next-line no-await-in-loop
                if ((await kv.get(`asset:${id}`)) == null) await kv.set(`asset:${id}`, value);
                knownAssets.add(id);
            }
            const body = assets.size ? JSON.stringify(stripped) : json;
            const savedAt = now();
            await kv.set(`scene:${key}`, { json: body, savedAt, bytes: body.length });
            lastJSON.set(key, comparable);
            return { skipped: false, bytes: body.length, json, savedAt, generation: myGeneration, stale: myGeneration !== generation };
        },
        async read(key) {
            const record = await kv.get(`scene:${key}`);
            if (!record || typeof record.json !== 'string') return null;
            let scene;
            try { scene = JSON.parse(record.json); } catch { return null; }
            const ids = collectAssetRefs(scene);
            const values = new Map();
            for (const id of ids) {
                // eslint-disable-next-line no-await-in-loop
                const value = await kv.get(`asset:${id}`);
                if (typeof value === 'string') { values.set(id, value); knownAssets.add(id); }
            }
            inlineAssets(scene, (id) => values.get(id));
            return { scene, savedAt: record.savedAt || 0, bytes: record.bytes || record.json.length };
        },
        async remove(key) { lastJSON.delete(key); await kv.delete(`scene:${key}`); },
        lastJSON(key) { return lastJSON.get(key) ?? null; },
        remember(key, json) { lastJSON.set(key, comparableSceneJSON(json)); },
        forget(key) { lastJSON.delete(key); },
        /** Delete scenes not in `keepKeys` and assets they no longer reference. */
        async gc(keepKeys = []) {
            const keep = new Set(keepKeys.map((k) => `scene:${k}`));
            const keys = await kv.keys();
            const referenced = new Set();
            for (const k of keys) {
                if (!k.startsWith('scene:')) continue;
                if (!keep.has(k)) { await kv.delete(k); continue; } // eslint-disable-line no-await-in-loop
                const record = await kv.get(k); // eslint-disable-line no-await-in-loop
                try { for (const id of collectAssetRefs(JSON.parse(record.json))) referenced.add(id); } catch {}
            }
            let removed = 0;
            for (const k of keys) {
                if (k.startsWith('asset:') && !referenced.has(k.slice(6))) {
                    await kv.delete(k); // eslint-disable-line no-await-in-loop
                    knownAssets.delete(k.slice(6));
                    removed += 1;
                }
            }
            return removed;
        },
    };
}

/**
 * Cheap fingerprint used to skip redundant cloud uploads. Ignores the
 * per-snapshot `createdAt` stamp so an unchanged canvas fingerprints equal.
 */
export function sceneFingerprint(json) {
    const comparable = comparableSceneJSON(json);
    return `${hashString(comparable)}-${comparable.length.toString(36)}`;
}
