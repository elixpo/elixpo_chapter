/**
 * Browser-local scene storage for the autosave buffer.
 *
 * Primary store: IndexedDB (no 5 MB quota, async, body stored uncompressed
 * so there is no LZ pass on the main thread). Inline image data URLs are
 * stored once per content hash.
 *
 * localStorage still owns the *pointer* `lixsketch-autosave-<sessionId>`:
 *   - `idb:<savedAt>:<bytes>`  → newest copy is in IndexedDB
 *   - `lzs:…` or raw JSON      → newest copy is this localStorage body
 *                                (legacy entries, template instantiation,
 *                                private-mode fallback, unload flush)
 * Removing the key (workspace delete / new workspace) therefore still
 * discards the local scene, and `hasLocalSavedWorkspace()` keeps working.
 */
import LZString from 'lz-string'
import {
  IDB_MARKER_PREFIX,
  comparableSceneJSON,
  createAsyncSceneStore,
  createLocalSceneStore,
} from '@elixpo/lixsketch/src/core/ScenePersistence.js'

const DB_NAME = 'lixsketch-local'
const STORE_NAME = 'kv'
const ASSET_PREFIX = 'lixsketch-asset-'

let _syncStore = null
let _asyncStore = null
let _asyncUnavailable = false

function openIndexedDbKV() {
  if (typeof indexedDB === 'undefined') return null
  let dbPromise = null
  const db = () => {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1)
        request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME)
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
        request.onblocked = () => reject(new Error('IndexedDB open blocked'))
      })
      dbPromise.catch(() => { _asyncUnavailable = true })
    }
    return dbPromise
  }
  const run = async (mode, fn) => {
    const database = await db()
    return new Promise((resolve, reject) => {
      const tx = database.transaction(STORE_NAME, mode)
      const store = tx.objectStore(STORE_NAME)
      const request = fn(store)
      tx.oncomplete = () => resolve(request?.result)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'))
    })
  }
  return {
    get: (key) => run('readonly', (s) => s.get(key)),
    set: (key, value) => run('readwrite', (s) => s.put(value, key)),
    delete: (key) => run('readwrite', (s) => s.delete(key)),
    keys: async () => (await run('readonly', (s) => s.getAllKeys())) || [],
  }
}

function getSyncStore() {
  if (!_syncStore) {
    _syncStore = createLocalSceneStore({
      storage: localStorage,
      compress: LZString.compressToUTF16,
      decompress: LZString.decompressFromUTF16,
      assetPrefix: ASSET_PREFIX,
    })
  }
  return _syncStore
}

function getAsyncStore() {
  if (_asyncUnavailable) return null
  if (!_asyncStore) {
    const kv = openIndexedDbKV()
    if (!kv) { _asyncUnavailable = true; return null }
    _asyncStore = createAsyncSceneStore({ kv })
  }
  return _asyncStore
}

function isQuotaError(err) {
  return err && (err.name === 'QuotaExceededError' || err.code === 22)
}

function setPointer(key, value) {
  try {
    localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

/**
 * Async save (normal autosave path). Returns { skipped, json, via }.
 * `json` must be JSON.stringify(scene) when supplied.
 */
export async function saveSceneLocal(key, scene, json = JSON.stringify(scene)) {
  const asyncStore = getAsyncStore()
  if (asyncStore) {
    const pointer = localStorage.getItem(key)
    // If the pointer is not ours (legacy body, or removed), we must write
    // even when the in-memory snapshot matches.
    if (!pointer || !pointer.startsWith(IDB_MARKER_PREFIX)) asyncStore.forget(key)
    try {
      const result = await asyncStore.write(key, scene, json)
      if (!result.skipped && !result.stale) {
        setPointer(key, `${IDB_MARKER_PREFIX}${result.savedAt}:${result.bytes}`)
      }
      return { ...result, via: 'indexeddb' }
    } catch (err) {
      console.warn('[AutoSave] IndexedDB write failed, using localStorage:', err)
      _asyncUnavailable = true
    }
  }
  return saveSceneLocalSync(key, scene, json)
}

/**
 * Synchronous save — used on pagehide/beforeunload (an async IndexedDB
 * write may never commit there) and when IndexedDB is unavailable.
 */
export function saveSceneLocalSync(key, scene, json = JSON.stringify(scene)) {
  const asyncStore = _asyncStore
  const pointer = localStorage.getItem(key)
  if (asyncStore && pointer?.startsWith(IDB_MARKER_PREFIX)
    && asyncStore.lastJSON(key) === comparableSceneJSON(json)) {
    return { skipped: true, json, via: 'indexeddb' }
  }
  // Any in-flight IndexedDB write is now older than this body; stop it from
  // re-pointing the key at IndexedDB when it completes.
  asyncStore?.bumpGeneration()
  asyncStore?.forget(key)
  const store = getSyncStore()
  if (!pointer || pointer.startsWith(IDB_MARKER_PREFIX)) store.forget(key)
  try {
    return { ...store.write(key, scene, json), via: 'localStorage' }
  } catch (err) {
    if (!isQuotaError(err)) throw err
    // Last resort: drop other sessions' buffers and retry once.
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k && k.startsWith('lixsketch-autosave') && !k.startsWith('lixsketch-autosave-meta') && k !== key) {
        localStorage.removeItem(k)
      }
    }
    store.forget(key)
    return { ...store.write(key, scene, json), via: 'localStorage' }
  }
}

/** Read the newest local copy. Resolves { scene, savedAt, source } or null. */
export async function readSceneLocal(key) {
  let pointer = null
  try { pointer = localStorage.getItem(key) } catch { return null }
  if (!pointer) return null
  if (pointer.startsWith(IDB_MARKER_PREFIX)) {
    const asyncStore = getAsyncStore()
    if (!asyncStore) return null
    try {
      const record = await asyncStore.read(key)
      if (!record) return null
      asyncStore.remember(key, JSON.stringify(record.scene))
      return { scene: record.scene, savedAt: record.savedAt, source: 'indexeddb' }
    } catch (err) {
      console.warn('[AutoSave] IndexedDB read failed:', err)
      return null
    }
  }
  const scene = getSyncStore().read(key)
  return scene ? { scene, savedAt: 0, source: 'localStorage' } : null
}

/** Approximate stored size for the properties modal. */
export function localSceneBytes(key) {
  try {
    const pointer = localStorage.getItem(key)
    if (!pointer) return 0
    if (pointer.startsWith(IDB_MARKER_PREFIX)) {
      const bytes = Number(pointer.slice(IDB_MARKER_PREFIX.length).split(':')[1])
      return Number.isFinite(bytes) ? bytes : 0
    }
    return pointer.length * 2
  } catch {
    return 0
  }
}

/**
 * Garbage-collect local storage: IndexedDB scenes whose localStorage
 * pointer is gone, and assets no surviving scene references.
 */
export async function gcLocalScenes() {
  const idbKeys = []
  const syncKeys = []
  let hasSyncAssets = false
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!k) continue
      if (k.startsWith(ASSET_PREFIX)) { hasSyncAssets = true; continue }
      if (!k.startsWith('lixsketch-autosave-') || k.startsWith('lixsketch-autosave-meta')) continue
      const value = localStorage.getItem(k)
      if (value?.startsWith(IDB_MARKER_PREFIX)) idbKeys.push(k)
      else if (value) syncKeys.push(k)
    }
    if (hasSyncAssets) {
      const store = getSyncStore()
      store.gcAssets(syncKeys.map((k) => store.read(k)).filter(Boolean))
    }
  } catch {}
  const asyncStore = getAsyncStore()
  if (!asyncStore) return
  try { await asyncStore.gc(idbKeys) } catch {}
}
