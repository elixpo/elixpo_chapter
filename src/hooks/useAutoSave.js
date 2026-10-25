"use client"

import { useEffect, useRef } from 'react'
import LZString from 'lz-string'
import useCollabStore from '@/store/useCollabStore'
import useUIStore, { normalizeSceneColorsForTheme } from '@/store/useUIStore'
import { WORKER_URL } from '@/store/useAuthStore'
import useAuthStore from '@/store/useAuthStore'
import { getSessionID } from '@/hooks/useSessionID'
import { encrypt, generateKey } from '@/utils/encryption'
import { useProfileStore } from '@/hooks/useGuestProfile'
import {
  gcLocalScenes,
  readSceneLocal,
  saveSceneLocal,
  saveSceneLocalSync,
} from '@/utils/sceneLocalStore'
import {
  createDirtyTracker,
  createSaveScheduler,
  sceneFingerprint,
} from '@elixpo/lixsketch/src/core/ScenePersistence.js'

const LOCAL_SAVE_KEY_PREFIX = 'lixsketch-autosave'
const LOCAL_SAVE_META_KEY_PREFIX = 'lixsketch-autosave-meta'

// Legacy synchronous localStorage codec (`lzs:` + LZ, or raw JSON). Kept
// exported for callers that still need a sync write; the autosave path
// uses src/utils/sceneLocalStore.js (IndexedDB first, see there).
const COMPRESSED_PREFIX = 'lzs:'

export function writeLocalScene(key, sceneData) {
  try {
    saveSceneLocalSync(key, sceneData)
    return true
  } catch (err) {
    console.warn('[AutoSave] Local write failed:', err)
    return false
  }
}

export function readLocalScene(key) {
  const raw = localStorage.getItem(key)
  if (!raw) return null
  try {
    if (raw.startsWith(COMPRESSED_PREFIX)) {
      const decompressed = LZString.decompressFromUTF16(raw.slice(COMPRESSED_PREFIX.length))
      if (!decompressed) return null
      return JSON.parse(decompressed)
    }
    return JSON.parse(raw)
  } catch (err) {
    console.warn('[AutoSave] Local read parse failed:', err)
    return null
  }
}

// ── Change tracking ──
// Every canvas mutation bumps the tracker; saves run only when dirty, and
// the scheduler coalesces bursts into one idle-time save.
const _tracker = createDirtyTracker()
let _lastSnapshot = null          // { json, version } of the last local save
let _localWriteInFlight = false
let _canvasObserver = null
const _lastCloudFingerprint = new Map() // sessionId -> fingerprint of last uploaded JSON

/** Call right after serializer.load(): the load itself is not an edit. */
export function markSceneLoaded() {
  _canvasObserver?.takeRecords()
  _tracker.markClean()
  _lastSnapshot = null
  // The loaded scene may differ from what this tab last uploaded (remote
  // agent edit, cloud reconcile), so the next cloud save must not be skipped.
  _lastCloudFingerprint.clear()
}

function markCanvasDirty() {
  _tracker.markDirty()
}

function takeSnapshot() {
  const serializer = window.__sceneSerializer
  if (!serializer || !Array.isArray(window.shapes)) return null
  const version = _tracker.version
  const workspaceName = useUIStore.getState().workspaceName || 'Untitled'
  const scene = serializer.save(workspaceName)
  return { scene, json: JSON.stringify(scene), version, workspaceName }
}

function getLocalSaveKey() {
  // Issue #24 bug #8: previously fell back to a sessionless `lixsketch-
  // autosave` key when __sessionID hadn't been set yet, leaving an
  // orphan that the cleanup pass explicitly skipped. Return null so the
  // caller waits for a real session instead of writing garbage.
  const sessionId = window.__sessionID
  return sessionId ? `${LOCAL_SAVE_KEY_PREFIX}-${sessionId}` : null
}
function getLocalSaveMetaKey() {
  const sessionId = window.__sessionID
  return sessionId ? `${LOCAL_SAVE_META_KEY_PREFIX}-${sessionId}` : null
}

function getCloudSceneRevision(sessionId) {
  if (!sessionId || window.__cloudSceneRevisionSession !== sessionId) return undefined
  return Number.isInteger(window.__cloudSceneRevision) ? window.__cloudSceneRevision : undefined
}

function setCloudSceneRevision(sessionId, revision) {
  if (!sessionId || !Number.isInteger(revision)) return
  window.__cloudSceneRevisionSession = sessionId
  window.__cloudSceneRevision = revision
}

// ── Intervals ──
const LOCAL_BUFFER_INTERVAL = 3_000    // safety net: save if still dirty every 3 seconds
const LOCAL_SAVE_DEBOUNCE = 400        // quiet period before an idle-time save
const LOCAL_SAVE_MAX_WAIT = 2_000      // never delay a save longer than this during continuous edits
const KEEPALIVE_MAX_BYTES = 60_000
const CLOUD_SYNC_INTERVAL = 5 * 60_000 // DB sync: every 5 minutes

// ── Rate limiting: max 2 DB saves per minute ──
const RATE_LIMIT_WINDOW = 60_000
const RATE_LIMIT_MAX = 2
const _dbSaveTimestamps = []
// Sessions confirmed missing from cloud should remain local until the user
// explicitly requests a cloud save. This prevents an automatic 404 → POST
// → workspace-limit loop for guest canvases restored from the browser.
const _automaticCloudSyncBlocked = new Set()
let _workspaceDeletionInProgress = false

export function beginWorkspaceDeletion() {
  _workspaceDeletionInProgress = true
  const sessionId = getSessionID()
  if (sessionId) _automaticCloudSyncBlocked.add(sessionId)
}

function isRateLimited() {
  const now = Date.now()
  // Remove timestamps older than the window
  while (_dbSaveTimestamps.length > 0 && now - _dbSaveTimestamps[0] > RATE_LIMIT_WINDOW) {
    _dbSaveTimestamps.shift()
  }
  return _dbSaveTimestamps.length >= RATE_LIMIT_MAX
}

function recordDbSave() {
  _dbSaveTimestamps.push(Date.now())
}

async function getOrCreateSessionEncryptionKey(sessionId) {
  const store = useUIStore.getState()
  // Resolve by session ID first. A global in-memory key may belong to the
  // canvas visited immediately before this one during SPA navigation.
  const existingKey = store.loadEncryptionKeyForSession?.(sessionId)
  if (existingKey) return existingKey

  const key = await generateKey()
  store.setSessionEncryptionKey?.(key, sessionId)
  return key
}

// ── Save to the local buffer (IndexedDB, localStorage fallback) ──
// `sync: true` is the unload path: IndexedDB writes may not commit during
// pagehide, so write a localStorage body synchronously instead.
function writeLocalMeta(metaKey, snapshot) {
  try {
    localStorage.setItem(metaKey, JSON.stringify({
      workspaceName: snapshot.workspaceName,
      savedAt: Date.now(),
      shapeCount: snapshot.scene.shapes.length,
    }))
  } catch {}
}

function afterLocalSave(snapshot) {
  _tracker.markClean(snapshot.version)
  _lastSnapshot = { json: snapshot.json, version: snapshot.version }
  if (typeof window.__onLocalSave === 'function') window.__onLocalSave()
  const status = useUIStore.getState().saveStatus
  if (status !== 'local' && status !== 'cloud') {
    useUIStore.getState().setSaveStatus('local')
  }
}

function saveToLocalStorage({ sync = false, force = false } = {}) {
  if (_workspaceDeletionInProgress) return false
  const key = getLocalSaveKey()
  const metaKey = getLocalSaveMetaKey()
  if (!key || !metaKey) return false
  // Nothing changed since the last save: skip serialization entirely.
  if (!force && !_tracker.isDirty() && !(sync && _localWriteInFlight)) return true

  const snapshot = takeSnapshot()
  if (!snapshot) return false
  try {
    if (sync) {
      const result = saveSceneLocalSync(key, snapshot.scene, snapshot.json)
      if (!result.skipped) writeLocalMeta(metaKey, snapshot)
      afterLocalSave(snapshot)
      return true
    }
    _localWriteInFlight = true
    return saveSceneLocal(key, snapshot.scene, snapshot.json).then((result) => {
      if (!result.skipped) writeLocalMeta(metaKey, snapshot)
      afterLocalSave(snapshot)
      return true
    }).catch((err) => {
      console.warn('[AutoSave] Local buffer save failed:', err)
      return false
    }).finally(() => { _localWriteInFlight = false })
  } catch (err) {
    console.warn('[AutoSave] Local buffer save failed:', err)
    return false
  }
}

// ── Show quick-save toast ──
function showSaveToast() {
  const toast = document.getElementById('save-toast')
  if (!toast) return
  toast.classList.remove('hidden')
  clearTimeout(toast._hideTimer)
  toast._hideTimer = setTimeout(() => toast.classList.add('hidden'), 2000)
}

// ── Save to DB (from localStorage buffer) ──
async function saveToDb({ force = false, keepalive = false } = {}) {
  if (_workspaceDeletionInProgress) return false
  if (!WORKER_URL) return false

  const sessionId = getSessionID()
  if (!sessionId) return false
  if (!force && _automaticCloudSyncBlocked.has(sessionId)) return false

  if (isRateLimited()) {
    console.log('[AutoSave] Rate limited — skipping DB save')
    return false
  }

  const serializer = window.__sceneSerializer
  if (!serializer) return false

  try {
    const authState = useAuthStore.getState()
    const workspaceName = useUIStore.getState().workspaceName || 'Untitled'

    // Use the in-memory JSON of the last local save when the canvas has
    // not changed since; previously this re-read and LZ-decompressed the
    // whole localStorage buffer on every cloud sync.
    let sceneJSON
    if (_lastSnapshot && !_tracker.isDirty()) {
      sceneJSON = _lastSnapshot.json
    } else {
      const snapshot = takeSnapshot()
      if (!snapshot) return false
      sceneJSON = snapshot.json
    }

    // Skip the encrypt + upload when the cloud already has this exact scene.
    const fingerprint = sceneFingerprint(sceneJSON)
    if (_lastCloudFingerprint.get(sessionId) === fingerprint
      && Number.isInteger(getCloudSceneRevision(sessionId))) {
      useUIStore.getState().setSaveStatus('cloud')
      return true
    }

    // Reuse the session key so existing encrypted canvas links remain valid
    // after subsequent saves. Generate it only for the first cloud write.
    const key = await getOrCreateSessionEncryptionKey(sessionId)
    const encryptedData = await encrypt(sceneJSON, key)

    const createdBy = authState.isAuthenticated
      ? (authState.user?.id || 'anonymous')
      : (useProfileStore.getState().profile?.id || localStorage.getItem('lixsketch-guest-session') || 'anonymous')

    const body = JSON.stringify({
      sessionId,
      encryptedData,
      permission: 'edit',
      workspaceName,
      createdBy,
      ownerType: authState.isAuthenticated ? 'user' : 'guest',
      expectedRevision: getCloudSceneRevision(sessionId),
    })
    const res = await fetch(`${WORKER_URL}/api/scenes/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      // keepalive lets the request outlive a closing tab; browsers cap
      // keepalive bodies at 64 KiB, so only use it for small scenes.
      keepalive: keepalive && body.length < KEEPALIVE_MAX_BYTES,
    })

    if (res.ok) {
      const saved = await res.json().catch(() => ({}))
      setCloudSceneRevision(sessionId, saved.revision)
      _lastCloudFingerprint.set(sessionId, fingerprint)
      _automaticCloudSyncBlocked.delete(sessionId)
      recordDbSave()
      useUIStore.getState().setSaveStatus('cloud')
      // Store encryption key for this session
      useUIStore.getState().setSessionEncryptionKey?.(key, sessionId)
      window.invalidateCanvasResetUndo?.()
      console.log('[AutoSave] Synced to cloud')
      return true
    } else if (res.status === 409) {
      const data = await res.json().catch(() => ({}))
      window.__remoteSceneConflict = data
      console.warn('[AutoSave] Remote edit conflict — cloud save paused', data)
      useUIStore.getState().setSaveStatus('failed')
      window.dispatchEvent(new CustomEvent('lix-remote-scene-conflict', { detail: data }))
      showRemoteSceneToast('Remote edit conflict — reload before saving')
      return false
    } else if (res.status === 429) {
      _automaticCloudSyncBlocked.add(sessionId)
      const data = await res.json().catch(() => ({}))
      console.warn(`[AutoSave] Workspace limit reached (${data.currentCount}/${data.maxWorkspaces}). ${data.message || ''}`)
      useUIStore.getState().setSaveStatus('local')
      return false
    } else {
      console.warn('[AutoSave] DB save failed:', res.status)
      useUIStore.getState().setSaveStatus('failed')
      return false
    }
  } catch (err) {
    console.warn('[AutoSave] DB save failed:', err)
    useUIStore.getState().setSaveStatus('failed')
    return false
  }
}

/**
 * Trigger an immediate cloud sync from anywhere (e.g. Ctrl+S).
 * Saves to localStorage first, then pushes to DB.
 */
export async function triggerCloudSync() {
  await saveToLocalStorage()
  const ok = await saveToDb({ force: true })
  if (ok) showSaveToast()
  return ok
}

/**
 * Auto-saves the scene using localStorage as a constant buffer.
 *
 * Flow:
 *   1. Page load → render local buffer immediately; use cloud when no cache exists
 *   2. Continuous: localStorage updates every 3s (+ on every SVG mutation)
 *   3. DB sync: every 5 min, on back/close/canvas-switch
 *   4. Rate limit: max 2 DB saves per minute
 *   5. Status: green=cloud, yellow=local buffer, red=DB failed
 *   6. Toast on successful DB save
 */
export default function useAutoSave() {
  const roomId = useCollabStore((s) => s.roomId)
  const connected = useCollabStore((s) => s.connected)
  const hasRestored = useRef(false)

  const isInRoom = !!(roomId && connected)

  // ──────────────────────────────────────────────────────
  // 1. RESTORE: localStorage fast path → cloud fallback
  // ──────────────────────────────────────────────────────
  useEffect(() => {
    if (hasRestored.current) return
    if (isInRoom) return

    let cancelled = false
    let restoreFrame = null
    let backgroundTimer = null
    const restoreStartedAt = performance.now()

    const isLocalhost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    if (!isLocalhost) {
      useUIStore.getState().setCanvasLoading(true, 'Restoring canvas...')
    }

    const makeRestoredSceneInteractive = () => {
        // Clear any selection that might have been set during deserialization
        window.currentShape = null
        if (typeof window.__deselectTextElement === 'function') window.__deselectTextElement()
        if (typeof window.disableAllSideBars === 'function') window.disableAllSideBars()

        // Force selection tool active so shapes are clickable/draggable
        if (window.__sketchEngine && typeof window.__sketchEngine.setActiveTool === 'function') {
          window.__sketchEngine.setActiveTool('select')
        } else {
          window.isSelectionToolActive = true
        }
        // Sync Zustand store too so toolbar reflects correct tool
        try {
          const store = window.__sketchStoreApi
          if (store && store.setActiveTool) store.setActiveTool('select')
        } catch {}
    }

    const finishRestore = (source, shapeCount = 0) => {
      if (cancelled) return
      if (source !== 'blank') makeRestoredSceneInteractive()
      hasRestored.current = true
      useUIStore.getState().setCanvasLoading(false)
      const durationMs = Math.round(performance.now() - restoreStartedAt)
      window.__canvasRestoreMetrics = { source, shapeCount, durationMs }
      window.dispatchEvent(new CustomEvent('lix-canvas-restored', {
        detail: window.__canvasRestoreMetrics,
      }))
      console.log(`[AutoSave] Canvas ready from ${source} in ${durationMs}ms (${shapeCount} shapes)`)
    }

    const cleanupStaleCaches = (currentKey, currentMetaKey) => {
      try {
        const keysToRemove = []
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)
          if (!key || !key.startsWith(LOCAL_SAVE_KEY_PREFIX)) continue
          if (key === currentKey || key === currentMetaKey) continue
          keysToRemove.push(key)
        }
        keysToRemove.forEach((key) => localStorage.removeItem(key))
      } catch {}
      // IndexedDB bodies/assets whose pointer was just removed.
      void gcLocalScenes()
    }

    const parseCloudTimestamp = (value) => {
      if (!value || typeof value !== 'string') return 0
      // SQLite datetime('now') omits the timezone marker even though the
      // value is UTC. Add it before parsing so comparisons work outside UTC.
      const iso = /(?:z|[+-]\d\d:\d\d)$/i.test(value)
        ? value
        : `${value.replace(' ', 'T')}Z`
      return Date.parse(iso) || 0
    }

    const fetchCloudScene = async (showLoading = false) => {
      if (!WORKER_URL) return { status: 'unavailable' }
      try {
        if (showLoading) useUIStore.getState().setCanvasLoading(true, 'Fetching from cloud...')
        const sessionId = getSessionID()
        const res = await fetch(`${WORKER_URL}/api/scenes/load?sessionId=${sessionId}`)
        if (!res.ok || cancelled) return { status: 'unavailable' }
        const data = await res.json()
        setCloudSceneRevision(sessionId, data.revision)
        if (data.missing || !data.encryptedData) {
          _automaticCloudSyncBlocked.add(sessionId)
          return { status: 'missing', metadata: data }
        }

        const encKey = useUIStore.getState().loadEncryptionKeyForSession(sessionId)
        if (!encKey) return { status: 'locked', metadata: data }
        const { decrypt } = await import('@/utils/encryption')
        const decrypted = await decrypt(data.encryptedData, encKey)
        const sceneData = JSON.parse(decrypted)
        if (cancelled || sceneData?.format !== 'lixsketch' || !Array.isArray(sceneData.shapes)) {
          return { status: 'invalid' }
        }

        _automaticCloudSyncBlocked.delete(sessionId)
        normalizeSceneColorsForTheme(sceneData, useUIStore.getState().resolvedTheme)
        return { status: 'found', sceneData, metadata: data }
      } catch (err) {
        console.warn('[AutoSave] Cloud fetch failed:', err)
        return { status: 'unavailable' }
      }
    }

    const restoreFromCloud = async (serializer, currentKey) => {
      const cloud = await fetchCloudScene(true)
      if (cloud.status !== 'found' || cancelled) return false
      serializer.load(cloud.sceneData)
      markSceneLoaded()
      if (currentKey) void saveSceneLocal(currentKey, cloud.sceneData).catch(() => {})
      if (cloud.metadata.workspaceName) {
        useUIStore.getState().setWorkspaceName(cloud.metadata.workspaceName)
      }
      if (cloud.metadata.templateSlug) {
        useUIStore.getState().setTemplateInfo(cloud.metadata.templateSlug, cloud.metadata.templateStatus)
      }
      useUIStore.getState().setSaveStatus('cloud')
      finishRestore('cloud', cloud.sceneData.shapes.length)
      return true
    }

    const tryRestore = async () => {
      if (cancelled) return

      // Never expose the canvas before its pointer dispatcher is bound. This
      // applies to blank canvases too: drawing immediately after navigation
      // must work just as reliably as dragging a restored shape.
      const serializer = window.__sceneSerializer
      if (!serializer || !window.svg || !window.__sketchInteractionReady) {
        // Poll on the next paint instead of sleeping for 500–800 ms. This
        // makes engine initialization, not an arbitrary timer, the fast-path
        // boundary.
        restoreFrame = requestAnimationFrame(tryRestore)
        return
      }

      if (window.__isNewWorkspace) {
        console.log('[AutoSave] New workspace — starting with blank canvas')
        finishRestore('blank')
        return
      }
      if (window.shapes?.length > 0) {
        finishRestore('existing', window.shapes.length)
        return
      }

      const currentKey = getLocalSaveKey()
      const currentMetaKey = getLocalSaveMetaKey()

      // localStorage is the presentation fast path. It is already the
      // continuously updated save buffer, so render it before any network
      // request and reconcile it back to the cloud in the background.
      if (currentKey) {
        const local = await readSceneLocal(currentKey)
        if (cancelled) return
        const sceneData = local?.scene
        if (sceneData?.format === 'lixsketch' && Array.isArray(sceneData.shapes)) {
          try {
            normalizeSceneColorsForTheme(sceneData, useUIStore.getState().resolvedTheme)
            serializer.load(sceneData)
            markSceneLoaded()
            const meta = currentMetaKey ? localStorage.getItem(currentMetaKey) : null
            let localSavedAt = local.savedAt || Date.parse(sceneData.createdAt) || 0
            if (meta) {
              try {
                const { workspaceName, savedAt } = JSON.parse(meta)
                if (workspaceName) useUIStore.getState().setWorkspaceName(workspaceName)
                if (Number.isFinite(savedAt)) localSavedAt = savedAt
              } catch {}
            }
            useUIStore.getState().setSaveStatus('local')
            // Treat a restored browser buffer as local-only until the
            // background lookup proves that its cloud row exists.
            _automaticCloudSyncBlocked.add(getSessionID())
            finishRestore('local', sceneData.shapes.length)
            backgroundTimer = setTimeout(async () => {
              cleanupStaleCaches(currentKey, currentMetaKey)
              const cloud = await fetchCloudScene()
              if (cancelled) return
              if (cloud.status !== 'found') return
              const cloudUpdatedAt = parseCloudTimestamp(cloud.metadata.updatedAt)
              // Never clobber edits made since the instant local render.
              if (cloudUpdatedAt > localSavedAt && !_tracker.isDirty()) {
                serializer.load(cloud.sceneData)
                markSceneLoaded()
                void saveSceneLocal(currentKey, cloud.sceneData).catch(() => {})
                makeRestoredSceneInteractive()
                if (cloud.metadata.workspaceName) {
                  useUIStore.getState().setWorkspaceName(cloud.metadata.workspaceName)
                }
                useUIStore.getState().setSaveStatus('cloud')
                window.__canvasRestoreMetrics.reconciledFrom = 'cloud'
              } else {
                // The row exists and local edits are newer, so reconcile the
                // browser buffer up to that same cloud workspace.
                saveToDb()
              }
            }, 1000)
            return
          } catch (err) {
            console.warn('[AutoSave] Failed to restore from local:', err)
          }
        }
      }

      const restoredFromCloud = await restoreFromCloud(serializer, currentKey)
      if (!restoredFromCloud) finishRestore('blank')
      backgroundTimer = setTimeout(() => cleanupStaleCaches(currentKey, currentMetaKey), 0)
    }

    // Start immediately. The previous 800 ms delay consumed most of the
    // sub-second restore budget before any storage was read.
    tryRestore()

    return () => {
      cancelled = true
      if (restoreFrame !== null) cancelAnimationFrame(restoreFrame)
      if (backgroundTimer !== null) clearTimeout(backgroundTimer)
    }
  }, [isInRoom])

  // ──────────────────────────────────────────────────────
  // 2. AUTO-SAVE ON EVERY CANVAS CHANGE (debounced)
  //    MutationObserver catches all DOM changes; mouseup catches
  //    the end of draw/move/resize operations.
  // ──────────────────────────────────────────────────────
  useEffect(() => {
    if (isInRoom) return

    let hasWarnedAboutEditingPublished = false
    const runSave = () => {
      const ui = useUIStore.getState()
      if (ui.templateSlug && !hasWarnedAboutEditingPublished) {
        hasWarnedAboutEditingPublished = true
        const proceed = window.confirm(
          "This workspace is published as a public template. Any edits you make will update the source template, but existing forks and clones of this template will not receive these updates. Do you want to proceed?"
        )
        if (!proceed) {
          window.location.reload()
          return
        }
      }

      saveToLocalStorage()
      // Mark dirty relative to cloud
      if (useUIStore.getState().saveStatus === 'cloud') {
        useUIStore.getState().setSaveStatus('local')
      }
    }
    // Debounced + idle-scheduled: a burst of mutations (drag, draw,
    // load) becomes one save in the next idle period.
    const scheduler = createSaveScheduler({
      run: runSave,
      delay: LOCAL_SAVE_DEBOUNCE,
      maxWait: LOCAL_SAVE_MAX_WAIT,
    })
    window.__flushLocalSave = () => scheduler.flush()

    const onMutations = () => {
      if (window.__applyingAgentScene) return
      markCanvasDirty()
      scheduler.schedule()
    }

    let waitTimer = null
    const observerRef = { current: null }
    const waitForSvg = () => {
      const svg = window.svg
      if (!svg) { waitTimer = setTimeout(waitForSvg, 500); return }

      const observer = new MutationObserver(onMutations)
      observer.observe(svg, { childList: true, subtree: true, attributes: true })
      _canvasObserver = observer
      svg.addEventListener('mouseup', onMutations)

      observerRef.current = { observer, svg }
    }

    waitForSvg()

    return () => {
      clearTimeout(waitTimer)
      scheduler.flush()
      if (window.__flushLocalSave) delete window.__flushLocalSave
      if (observerRef.current) {
        observerRef.current.observer.disconnect()
        observerRef.current.svg.removeEventListener('mouseup', onMutations)
        if (_canvasObserver === observerRef.current.observer) _canvasObserver = null
      }
    }
  }, [isInRoom])

  // ──────────────────────────────────────────────────────
  // 3. LOCALSTORAGE BUFFER: constant updates (every 3s + beforeunload)
  //    Includes zoom level and canvas pan state
  // ──────────────────────────────────────────────────────
  useEffect(() => {
    if (isInRoom) return

    // Safety net only: saveToLocalStorage() returns immediately when the
    // canvas is clean, so an idle canvas costs nothing here.
    const interval = setInterval(() => saveToLocalStorage(), LOCAL_BUFFER_INTERVAL)

    // pagehide fires on tab close, navigation and bfcache entry; unlike
    // beforeunload it also fires on mobile. Both use the sync path.
    const handleUnload = () => saveToLocalStorage({ sync: true })
    window.addEventListener('beforeunload', handleUnload)
    window.addEventListener('pagehide', handleUnload)

    return () => {
      clearInterval(interval)
      window.removeEventListener('beforeunload', handleUnload)
      window.removeEventListener('pagehide', handleUnload)
      saveToLocalStorage({ sync: true }) // final save on cleanup (SPA navigation)
    }
  }, [isInRoom])

  // ──────────────────────────────────────────────────────
  // 4. DB SYNC: every 5 min + back button + page close + canvas switch
  //    Rate limited to 2 saves per minute
  // ──────────────────────────────────────────────────────
  useEffect(() => {
    if (isInRoom) return
    if (!WORKER_URL) return

    // Periodic sync every 5 minutes
    const interval = setInterval(() => {
      const shapes = window.shapes
      if (!shapes || shapes.length === 0) return
      saveToDb()
    }, CLOUD_SYNC_INTERVAL)

    // Page close: encryption is async, so the cloud copy is pushed on
    // `visibilitychange -> hidden` (which precedes unload and still lets
    // async work run) with a keepalive request. The local buffer is
    // flushed synchronously by the pagehide handler above.

    // Save on back/forward navigation (popstate)
    const handlePopState = () => {
      saveToLocalStorage({ sync: true })
      saveToDb()
    }
    window.addEventListener('popstate', handlePopState)

    // Save on visibility change (user switches tab/minimizes/closes)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        saveToLocalStorage()
        saveToDb({ keepalive: true })
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      clearInterval(interval)
      window.removeEventListener('popstate', handlePopState)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [isInRoom])

  // ──────────────────────────────────────────────────────
  // 5. NEW WORKSPACE: save immediately on creation
  // ──────────────────────────────────────────────────────
  useEffect(() => {
    if (isInRoom) return
    if (!WORKER_URL) return
    if (!window.__isNewWorkspace) return

    const saveNewWorkspace = async () => {
      const serializer = window.__sceneSerializer
      if (!serializer || !window.svg) {
        setTimeout(saveNewWorkspace, 1000)
        return
      }

      try {
        const authState = useAuthStore.getState()
        const workspaceName = useUIStore.getState().workspaceName || 'Untitled'
        const sceneData = serializer.save(workspaceName)
        const sceneJSON = JSON.stringify(sceneData)

        const sessionId = getSessionID()
        const key = await getOrCreateSessionEncryptionKey(sessionId)
        const encryptedData = await encrypt(sceneJSON, key)
        const createdBy = authState.isAuthenticated
          ? (authState.user?.id || 'anonymous')
          : (useProfileStore.getState().profile?.id || localStorage.getItem('lixsketch-guest-session') || 'anonymous')

        const res = await fetch(`${WORKER_URL}/api/scenes/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            encryptedData,
            permission: 'edit',
            workspaceName,
            createdBy,
            ownerType: authState.isAuthenticated ? 'user' : 'guest',
          }),
        })

        if (res.ok) {
          const saved = await res.json().catch(() => ({}))
          setCloudSceneRevision(sessionId, saved.revision)
          _lastCloudFingerprint.set(sessionId, sceneFingerprint(sceneJSON))
          useUIStore.getState().setSaveStatus('cloud')
          useUIStore.getState().setSessionEncryptionKey?.(key, sessionId)
          console.log('[AutoSave] New workspace saved to cloud')
        } else if (res.status === 429) {
          const data = await res.json().catch(() => ({}))
          console.warn(`[AutoSave] Workspace limit reached (${data.currentCount}/${data.maxWorkspaces}). ${data.message || ''}`)
        }
      } catch (err) {
        console.warn('[AutoSave] Failed to save new workspace:', err)
      }

      window.__isNewWorkspace = false
    }

    setTimeout(saveNewWorkspace, 2000)
  }, [isInRoom])

  // ──────────────────────────────────────────────────────
  // 6. REMOTE AGENT REFRESH: active collaboration relays immediately;
  //    otherwise poll the encrypted cloud revision without touching recency.
  // ──────────────────────────────────────────────────────
  useEffect(() => {
    if (isInRoom || !WORKER_URL) return
    let applying = false
    let warnedRevision = null

    const checkRemoteRevision = async () => {
      if (applying || document.visibilityState === 'hidden') return
      const sessionId = getSessionID()
      const serializer = window.__sceneSerializer
      if (!sessionId || !serializer) return
      try {
        const response = await fetch(`${WORKER_URL}/api/scenes/load?sessionId=${encodeURIComponent(sessionId)}&touch=0&meta=1`, { cache: 'no-store' })
        if (!response.ok) return
        const data = await response.json()
        const revision = Number(data.revision)
        if (!Number.isInteger(revision)) return
        const localRevision = getCloudSceneRevision(sessionId)
        if (!Number.isInteger(localRevision)) {
          setCloudSceneRevision(sessionId, revision)
          return
        }
        if (revision <= localRevision) return
        if (useUIStore.getState().saveStatus !== 'cloud') {
          if (warnedRevision !== revision) {
            warnedRevision = revision
            window.__remoteSceneConflict = { currentRevision: revision, localRevision }
            window.dispatchEvent(new CustomEvent('lix-remote-scene-conflict', { detail: window.__remoteSceneConflict }))
            showRemoteSceneToast('A remote edit is waiting — reload to avoid overwriting it')
          }
          return
        }
        const key = useUIStore.getState().loadEncryptionKeyForSession(sessionId)
        if (!key) return
        applying = true
        const sceneResponse = await fetch(`${WORKER_URL}/api/scenes/load?sessionId=${encodeURIComponent(sessionId)}&touch=0`, { cache: 'no-store' })
        if (!sceneResponse.ok) return
        const scenePayload = await sceneResponse.json()
        if (Number(scenePayload.revision) !== revision || !scenePayload.encryptedData) return
        const { decrypt } = await import('@/utils/encryption')
        const sceneData = JSON.parse(await decrypt(scenePayload.encryptedData, key))
        normalizeSceneColorsForTheme(sceneData, useUIStore.getState().resolvedTheme)
        window.__applyingAgentScene = true
        serializer.load(sceneData)
        markSceneLoaded()
        const localKey = getLocalSaveKey()
        if (localKey) void saveSceneLocal(localKey, sceneData).catch(() => {})
        if (scenePayload.workspaceName) useUIStore.getState().setWorkspaceName(scenePayload.workspaceName)
        setCloudSceneRevision(sessionId, revision)
        useUIStore.getState().setSaveStatus('cloud')
        showRemoteSceneToast('MCP agent updated the canvas')
        window.dispatchEvent(new CustomEvent('lix-agent-scene-applied', { detail: { revision } }))
        setTimeout(() => { window.__applyingAgentScene = false }, 0)
      } catch (error) {
        console.warn('[AutoSave] Remote revision check failed:', error)
      } finally {
        applying = false
      }
    }

    const interval = setInterval(checkRemoteRevision, 4000)
    return () => clearInterval(interval)
  }, [isInRoom])
}

function showRemoteSceneToast(message) {
  const toast = document.getElementById('save-toast')
  if (!toast) return
  toast.textContent = message
  toast.classList.remove('hidden')
  clearTimeout(toast._hideTimer)
  toast._hideTimer = setTimeout(() => toast.classList.add('hidden'), 3500)
}
