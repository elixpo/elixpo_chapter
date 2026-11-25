"use client"

import { useEffect, useRef } from 'react'
import useCollabStore from '@/store/useCollabStore'
import useAuthStore from '@/store/useAuthStore'
import { useProfileStore } from '@/hooks/useGuestProfile'
import useUIStore from '@/store/useUIStore'
import { encrypt, decrypt } from '@/utils/encryption'
import {
  CollabClient,
  PROTOCOL_VERSION,
  Z_KEY,
  applyOps,
  cloneDoc,
  createEngineSceneEnv,
  createSceneApplier,
  diffRecords,
  diffSceneAgainstDoc,
  docFromScene,
  docToScene,
  flattenShape,
} from '@elixpo/lixsketch/src/core/collab/index.js'

import { COLLAB_URL } from '@/lib/env'
const PING_INTERVAL = 25000
const RECONNECT_BASE = 1000
const RECONNECT_MAX = 30000
const SCENE_SYNC_DEBOUNCE = 80
const SNAPSHOT_TIMEOUT = 6000
const PRESENCE_BUFFER_LIMIT = 64 * 1024
// Plaintext budget per op message: AES-GCM + base64url stays under the
// worker's 900 KB payload cap.
const MAX_OP_PLAINTEXT = 600 * 1024
const MAX_OP_PAYLOAD = 900_000
const CURSOR_IDLE_MS = 15000
const CURSOR_TICK_MS = 250

// Join rejections and room shutdowns that must not trigger a reconnect loop.
const TERMINAL_ERRORS = new Set([
  'ROOM_FULL', 'ROOM_LIMIT_REACHED', 'INVALID_INVITE', 'ROOM_SHARING_DISABLED',
  'INVALID_SESSION', 'ROOM_EXPIRED', 'ROOM_IDLE_TIMEOUT', 'ROOM_CLOSED',
])
const CLOSE_CODE_ERRORS = {
  4429: 'ROOM_FULL',
  4403: 'INVALID_INVITE',
  4401: 'INVALID_SESSION',
  4410: 'ROOM_EXPIRED',
}

/**
 * Live collaboration over the room Durable Object.
 *
 * Protocol v2 (worker advertises `protocol: 2` in room-info):
 *   client -> server  { type: 'op', v: 2, clientSeq, baseSeq, payload }
 *   server -> sender  { type: 'ack', clientSeq, serverSeq }
 *   server -> peers   { type: 'op', v: 2, connectionId, clientSeq, baseSeq, serverSeq, payload }
 *   client -> server  { type: 'catch-up', since }
 *   server -> client  logged ops with serverSeq > since, then
 *                     { type: 'catch-up-done', ok, seq, yourLastClientSeq }
 *   sync-response     payload = E2E({ v: 2, doc, seq }) of the responder's confirmed doc
 * payload = E2E-encrypted JSON { ops } (scene-level OT ops, see core/collab/OT.js).
 * The server only orders payloads; all transformation happens in CollabClient.
 * Against an older worker (no protocol field) the hook falls back to the v1
 * full-scene snapshot behavior.
 */
export default function useCollaboration(roomId) {
  const wsRef = useRef(null)
  const pingRef = useRef(null)
  const reconnectRef = useRef(null)
  const reconnectDelay = useRef(RECONNECT_BASE)
  const intentionalClose = useRef(false)
  const syncTimerRef = useRef(null)
  const snapshotInFlightRef = useRef(false)
  const snapshotQueuedRef = useRef(false)
  const applyingRemoteRef = useRef(false)
  const clientSeqRef = useRef(0)
  const lastServerSeqRef = useRef(0)
  const messageChainRef = useRef(Promise.resolve())
  const sendChainRef = useRef(Promise.resolve())
  const anonymousIdRef = useRef(null)
  const clientIdRef = useRef(null)
  // OT state (survives reconnects within this room)
  const otRef = useRef(null)
  const initializedRef = useRef(false)
  const renderedDocRef = useRef(null)
  // Shapes whose remote changes wait for my gesture / editor to finish.
  const deferredIdsRef = useRef(new Set())
  const protocolRef = useRef(1)
  const catchUpInFlightRef = useRef(false)
  const serverLastClientSeqRef = useRef(0)
  const snapshotTimerRef = useRef(null)
  const roomSeqRef = useRef(0)

  if (!anonymousIdRef.current && typeof crypto !== 'undefined') {
    anonymousIdRef.current = `anon-${crypto.randomUUID().slice(0, 12)}`
  }
  if (!clientIdRef.current && typeof window !== 'undefined') {
    // Stable for reconnects in this tab, unique across tabs so one browser can
    // join twice without one socket replacing the other.
    clientIdRef.current = crypto.randomUUID()
  }

  useEffect(() => {
    if (!roomId) return
    intentionalClose.current = false
    let disposed = false
    let engineWaitTimer = null
    let pointerDown = false
    let gestureEndTimer = null
    // Remote ops are applied shape by shape; the full scene load is only
    // used for the initial join / log-gap snapshot.
    const applier = createSceneApplier(createEngineSceneEnv({ isPointerDown: () => pointerDown }))

    otRef.current = null
    initializedRef.current = false
    renderedDocRef.current = null
    deferredIdsRef.current = new Set()

    function getRoomKey() {
      let key = useUIStore.getState().sessionEncryptionKey
      if (!key) {
        const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
        key = hash.get('key') || useUIStore.getState().loadEncryptionKeyForSession(roomId)
      }
      if (key) useUIStore.getState().setSessionEncryptionKey(key, roomId)
      return key
    }

    // Wait for engine to be ready
    const waitForEngine = () => {
      if (disposed) return
      if (window.__sketchStoreApi) {
        connect()
      } else {
        engineWaitTimer = setTimeout(waitForEngine, 200)
      }
    }

    function getIdentity() {
      const authUser = useAuthStore.getState().user
      const profile = useProfileStore.getState().profile
      return {
        userId: authUser?.id || profile?.id || anonymousIdRef.current || 'anonymous',
        displayName: authUser?.displayName || profile?.displayName || 'Anonymous',
        avatar: authUser?.avatar || profile?.avatar || '',
        authToken: useAuthStore.getState().sessionToken || '',
      }
    }

    const isV2 = () => protocolRef.current >= PROTOCOL_VERSION

    function connect() {
      if (wsRef.current?.readyState === WebSocket.OPEN
        || wsRef.current?.readyState === WebSocket.CONNECTING) return

      const roomKey = getRoomKey()
      if (!roomKey) {
        useCollabStore.getState().setError('This collaboration link is missing its encryption key.')
        return
      }

      const { userId, displayName, avatar, authToken } = getIdentity()
      const workspaceName = useUIStore.getState().workspaceName || 'Untitled'

      const params = new URLSearchParams({
        userId,
        clientId: clientIdRef.current,
        displayName: btoa(encodeURIComponent(displayName)),
        avatar: avatar || '',
        workspaceName: btoa(encodeURIComponent(workspaceName)),
      })
      if (authToken) params.set('authToken', authToken)
      const invite = new URLSearchParams(window.location.search).get('invite')
      const adminToken = sessionStorage.getItem(`lixsketch-collab-admin:${roomId}`)
      if (invite) params.set('invite', invite)
      if (adminToken) params.set('adminToken', adminToken)

      const wsUrl = `${COLLAB_URL.replace(/\/$/, '')}/room/${encodeURIComponent(roomId)}?${params}`
      console.log('[Collab] Connecting to room', roomId)

      const ws = new WebSocket(wsUrl)
      wsRef.current = ws
      const collabStore = useCollabStore.getState()
      collabStore.setConnecting(true)
      collabStore.setWs(ws)

      ws.onopen = () => {
        // The socket may still be a join rejection; room-info confirms the seat.
        reconnectDelay.current = RECONNECT_BASE

        // Start ping keepalive
        pingRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }))
          }
        }, PING_INTERVAL)
      }

      ws.onmessage = (event) => {
        let msg
        try {
          msg = JSON.parse(event.data)
        } catch {
          return
        }
        // Keep encrypted scene updates in server order even when decrypting
        // one payload takes longer than the next.
        messageChainRef.current = messageChainRef.current
          .then(() => handleMessage(msg, ws))
          .catch((error) => {
            console.error('[Collab] Failed to process message:', error)
            useCollabStore.getState().setError('Could not apply a collaboration update.')
          })
      }

      ws.onclose = (event) => {
        console.log('[Collab] Disconnected:', event.code, event.reason)
        cleanup()
        clearAllCursors()
        catchUpInFlightRef.current = false
        useCollabStore.getState().setConnected(false)
        if (wsRef.current === ws) {
          wsRef.current = null
          useCollabStore.getState().setWs(null)
        }

        const rejection = CLOSE_CODE_ERRORS[event.code] || (TERMINAL_ERRORS.has(event.reason) ? event.reason : null)
        if (rejection) {
          intentionalClose.current = true
          if (!useCollabStore.getState().error) {
            useCollabStore.getState().setError(humanizeServerError(rejection))
          }
        }

        if (!intentionalClose.current) {
          scheduleReconnect()
        }
      }

      ws.onerror = () => {
        // onclose will fire after this
      }
    }

    function send(ws, message) {
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message))
    }

    async function handleMessage(msg, ws) {
      const store = useCollabStore.getState()

      switch (msg.type) {
        case 'room-info':
          store.setRoomInfo(msg)
          store.setConnected(true)
          store.setError(null)
          if (msg.adminToken) {
            sessionStorage.setItem(`lixsketch-collab-admin:${roomId}`, msg.adminToken)
          }
          // Store session ID for the room
          window.__sessionID = roomId
          protocolRef.current = Number(msg.protocol) || 1
          roomSeqRef.current = Number(msg.seq) || 0
          pruneCursors(msg.users || [])

          if (!isV2()) {
            // Legacy worker: full-scene snapshots.
            if (msg.users.length > 1) send(ws, { type: 'sync-request', lastServerSeq: 0 })
            break
          }

          if (!otRef.current) {
            otRef.current = new CollabClient({ clientId: clientIdRef.current, maxMessageBytes: MAX_OP_PLAINTEXT })
          }
          if (initializedRef.current) {
            // Reconnect: replay what we missed, then resend unacked ops.
            flushLocalChanges()
            sendCatchUp(ws)
          } else if ((msg.users || []).length > 1) {
            requestSnapshot(ws)
          } else {
            initFromLocalScene(roomSeqRef.current)
          }
          break

        case 'join':
          store.addUser({
            userId: msg.from,
            connectionId: msg.connectionId,
            displayName: msg.displayName,
            avatar: msg.avatar,
            color: msg.color,
            role: msg.role || 'editor',
            isAdmin: !!msg.isAdmin,
          })
          break

        case 'leave':
          store.removeUser(msg.connectionId || msg.from)
          removeCursor(msg.connectionId || msg.from)
          break

        case 'presence': {
          const id = msg.connectionId || msg.from
          if (msg.cursor) {
            store.updatePresence(id, msg.cursor)
            renderCursor(id, msg.cursor, msg.displayName, msg.color)
          } else {
            store.updatePresence(id, null)
            hideCursor(id)
          }
          break
        }

        case 'op':
          if (!isV2()) {
            if (msg.serverSeq && msg.serverSeq <= lastServerSeqRef.current) break
            lastServerSeqRef.current = msg.serverSeq || lastServerSeqRef.current
            await applyScenePayload(msg.payload)
            break
          }
          if (!otRef.current || !initializedRef.current) {
            // Not synced yet: keep it so the snapshot + buffer can drain it.
            if (otRef.current && Number.isInteger(msg.serverSeq)) {
              otRef.current.buffer.set(msg.serverSeq, await decodeOpMessage(msg))
            }
            break
          }
          {
            const decoded = await decodeOpMessage(msg)
            // Submit my unsent canvas edits first so the remote op is
            // transformed against them (and can't overwrite them on screen).
            flushLocalChanges({ atBoundary: false })
            handleResult(otRef.current.receive(decoded), ws)
          }
          break

        case 'ack':
          if (!isV2() || !otRef.current || msg.duplicate || !Number.isInteger(msg.serverSeq)) break
          handleResult(otRef.current.receive({ serverSeq: msg.serverSeq, clientSeq: msg.clientSeq, ack: true }), ws)
          break

        case 'agent-op':
          if (!isV2()) {
            if (msg.serverSeq && msg.serverSeq <= lastServerSeqRef.current) break
            lastServerSeqRef.current = msg.serverSeq || lastServerSeqRef.current
            await applyScenePayload(msg.payload)
          } else if (otRef.current) {
            const scene = JSON.parse(await decrypt(msg.payload, getRoomKey()))
            const message = { serverSeq: msg.serverSeq, scene }
            if (initializedRef.current) {
              flushLocalChanges({ atBoundary: false })
              handleResult(otRef.current.receive(message), ws)
            } else otRef.current.buffer.set(msg.serverSeq, message)
          }
          if (Number.isInteger(msg.revision)) {
            window.__cloudSceneRevisionSession = roomId
            window.__cloudSceneRevision = msg.revision
          }
          showAgentEditToast(msg.displayName || 'MCP agent')
          window.dispatchEvent(new CustomEvent('lix-agent-scene-applied', { detail: { agent: msg.displayName, revision: msg.revision } }))
          break

        case 'catch-up-done':
          catchUpInFlightRef.current = false
          serverLastClientSeqRef.current = Number(msg.yourLastClientSeq) || 0
          if (!msg.ok) {
            // The log tail no longer covers our gap: full snapshot.
            requestSnapshot(ws)
            break
          }
          resendPending(ws)
          if (otRef.current?.buffer.size) sendCatchUp(ws)
          break

        case 'sync-needed': {
          // Another user needs our scene state
          if (isV2() && otRef.current && initializedRef.current) {
            const client = otRef.current
            const payload = await encrypt(JSON.stringify({ v: PROTOCOL_VERSION, doc: client.confirmed, seq: client.lastSeq }), getRoomKey())
            send(ws, {
              type: 'sync-response',
              v: PROTOCOL_VERSION,
              seq: client.lastSeq,
              targetConnectionId: msg.requestedBy,
              payload,
            })
            break
          }
          const serializer = window.__sceneSerializer
          if (serializer && !isV2()) {
            const sceneData = serializer.save()
            const payload = await encrypt(JSON.stringify(sceneData), getRoomKey())
            send(ws, {
              type: 'sync-response',
              targetConnectionId: msg.requestedBy,
              payload,
            })
          }
          break
        }

        case 'sync-response': {
          if (!msg.payload) break
          if (!isV2()) {
            try {
              await applyScenePayload(msg.payload)
              lastServerSeqRef.current = Math.max(lastServerSeqRef.current, msg.serverSeq || 0)
              console.log('[Collab] Scene synced from peer')
            } catch (e) {
              console.error('[Collab] Failed to load synced scene:', e)
            }
            break
          }
          const parsed = JSON.parse(await decrypt(msg.payload, getRoomKey()))
          const doc = parsed?.v === PROTOCOL_VERSION ? parsed.doc : docFromScene(parsed)
          const seq = parsed?.v === PROTOCOL_VERSION ? Number(parsed.seq) || 0 : Number(msg.serverSeq) || 0
          if (snapshotTimerRef.current) clearTimeout(snapshotTimerRef.current)
          snapshotTimerRef.current = null
          if (!otRef.current) break
          // Local edits made before the first sync are discarded with the
          // scene they were made on; after that, unsent edits are kept.
          if (initializedRef.current) flushLocalChanges()
          otRef.current.snapshot(doc, seq, serverLastClientSeqRef.current)
          initializedRef.current = true
          renderFullScene()
          console.log('[Collab] Scene synced from peer at seq', seq)
          // The responder may lag the room: fetch the rest from the log
          // (catch-up-done then resends our unacknowledged ops).
          catchUpInFlightRef.current = false
          sendCatchUp(ws)
          break
        }

        case 'kicked':
          console.warn('[Collab] Kicked from room:', msg.reason)
          intentionalClose.current = true
          ws.close()
          store.reset()
          showToast('<i class="bx bx-block text-red-400 mr-1.5"></i>You were removed from the session', 4000)
          break

        case 'access-updated':
          store.updateUserAccess(msg.userId, msg.role)
          break

        case 'room-settings':
          store.setRoomSettings(msg)
          break

        case 'invite-rotated':
          store.setInviteToken(msg.inviteToken, msg.inviteVersion)
          break

        case 'invite-invalidated':
          store.setRoomSettings({ inviteVersion: msg.inviteVersion })
          break

        case 'sharing-disabled':
          intentionalClose.current = true
          store.setRoomSettings({ sharingEnabled: false })
          store.setError('The workspace owner stopped live sharing.')
          ws.close(1000, 'sharing-disabled')
          break

        case 'room-expired':
        case 'room-closed':
          console.warn('[Collab] Room closed:', msg.type)
          intentionalClose.current = true
          ws.close()
          break

        case 'error':
          console.warn('[Collab] Server error:', msg.code)
          store.setError(humanizeServerError(msg.code, msg))
          if (TERMINAL_ERRORS.has(msg.code)) {
            intentionalClose.current = true
            if (msg.code === 'ROOM_FULL') {
              showToast(`<i class="bx bx-group text-red-400 mr-1.5"></i>${humanizeServerError(msg.code, msg)}`, 6000)
            }
            try { ws.close(1000, msg.code) } catch {}
          }
          break

        case 'pong':
          break
      }
    }

    // --- OT plumbing ---

    async function decodeOpMessage(msg) {
      const body = JSON.parse(await decrypt(msg.payload, getRoomKey()))
      if (msg.v === PROTOCOL_VERSION) {
        return { serverSeq: msg.serverSeq, clientId: msg.connectionId, clientSeq: msg.clientSeq, ops: body.ops || [] }
      }
      // v1 peer: the payload is a full scene.
      return { serverSeq: msg.serverSeq, scene: body }
    }

    function handleResult(result, ws) {
      if (result.ops.length) applyToCanvas(result.ops)
      if (result.gap) sendCatchUp(ws)
    }

    function sendCatchUp(ws) {
      if (catchUpInFlightRef.current || !otRef.current) return
      if (!ws || ws.readyState !== WebSocket.OPEN) return
      catchUpInFlightRef.current = true
      send(ws, { type: 'catch-up', since: otRef.current.lastSeq })
    }

    function requestSnapshot(ws) {
      send(ws, { type: 'sync-request', lastServerSeq: otRef.current?.lastSeq || 0 })
      if (snapshotTimerRef.current) clearTimeout(snapshotTimerRef.current)
      snapshotTimerRef.current = setTimeout(() => {
        snapshotTimerRef.current = null
        if (disposed || initializedRef.current) return
        // No peer answered: this client's scene becomes the room state.
        console.warn('[Collab] No snapshot from peers; continuing from the local scene')
        initFromLocalScene(roomSeqRef.current)
        sendCatchUp(wsRef.current)
      }, SNAPSHOT_TIMEOUT)
    }

    function initFromLocalScene(seq) {
      const serializer = window.__sceneSerializer
      if (!serializer || !otRef.current) return
      const doc = docFromScene(serializer.save(useUIStore.getState().workspaceName || 'Untitled'))
      otRef.current.reset(doc, seq)
      renderedDocRef.current = cloneDoc(doc)
      initializedRef.current = true
      deferredIdsRef.current.clear()
    }

    function sendOps(messages) {
      for (const message of messages) {
        sendChainRef.current = sendChainRef.current.then(async () => {
          const ws = wsRef.current
          if (!ws || ws.readyState !== WebSocket.OPEN || catchUpInFlightRef.current) return // resent after reconnect / catch-up
          const payload = await encrypt(JSON.stringify({ ops: message.ops }), getRoomKey())
          if (payload.length > MAX_OP_PAYLOAD) {
            // The worker would reject it and it would stay pending forever.
            if (otRef.current?.discardPending(message.clientSeq)) {
              resyncShapes(new Set(message.ops.map((op) => op.id)))
            }
            useCollabStore.getState().setError('That change is too large to share live (try a smaller image).')
            return
          }
          if (ws.readyState !== WebSocket.OPEN) return
          ws.send(JSON.stringify({
            type: 'op',
            v: PROTOCOL_VERSION,
            clientSeq: message.clientSeq,
            baseSeq: message.baseSeq,
            payload,
          }))
        }).catch((error) => {
          console.error('[Collab] Failed to publish an operation:', error)
          useCollabStore.getState().setError('Could not publish the latest canvas update.')
        })
      }
    }

    function resendPending(ws) {
      if (!otRef.current || !ws || ws.readyState !== WebSocket.OPEN) return
      const messages = otRef.current.pendingMessages()
      if (messages.length) sendOps(messages)
    }

    /** Diff the canvas against what we last rendered and submit the user's edits. */
    function localInteractionActive() {
      if (pointerDown) return true
      if (document.querySelector('.shape-label-editor')) return true
      const active = document.activeElement
      return !!(active && window.svg?.contains(active)
        && (active.isContentEditable || active.tagName === 'TEXTAREA' || active.tagName === 'INPUT'))
    }

    // `atBoundary`: called at the end of a user action (undo push, pointerup,
    // editor close, Ctrl+Z). Before applying a remote op we only flush when
    // no gesture is in flight, so a half-finished drag or label isn't
    // published as its own undo step (those shapes are deferred instead).
    function flushLocalChanges({ atBoundary = true } = {}) {
      if (!isV2() || !initializedRef.current || !otRef.current || applyingRemoteRef.current) return
      if (!atBoundary && localInteractionActive()) return
      const serializer = window.__sceneSerializer
      if (!serializer || !renderedDocRef.current) return
      const scene = serializer.save(useUIStore.getState().workspaceName || 'Untitled')
      const ops = diffSceneAgainstDoc(renderedDocRef.current, scene)
      if (!ops.length) return
      applyOps(renderedDocRef.current, ops)
      if (useCollabStore.getState().myRole !== 'editor') {
        // Viewers cannot publish: put the touched shapes back to the room state.
        resyncShapes(new Set(ops.map((op) => op.id)))
        return
      }
      sendOps(otRef.current.submit(ops))
    }

    function liveShape(id) {
      return (window.shapes || []).find((shape) => shape?.shapeID === id) || null
    }

    /** What the canvas currently shows for one shape, as an OT record. */
    function canvasRecord(id) {
      const shape = liveShape(id)
      const serialize = window.__sceneSerializer?.serializeShape
      if (!shape || typeof serialize !== 'function') return null
      const data = serialize(shape)
      if (!data) return null
      const z = otRef.current?.local.shapes[id]?.[Z_KEY] ?? renderedDocRef.current?.shapes[id]?.[Z_KEY]
      return { ...flattenShape(data), [Z_KEY]: z }
    }

    /**
     * Apply transformed remote ops to just the shapes they name, then
     * re-snapshot those shapes so the next local diff only sees the user's
     * own edits.
     */
    function applyToCanvas(ops) {
      if (!ops.length || !otRef.current || !window.__sceneSerializer) return
      let result
      applyingRemoteRef.current = true
      try {
        result = applier.apply(ops, otRef.current.local)
      } catch (error) {
        console.error('[Collab] Incremental apply failed; reloading the scene:', error)
        applyingRemoteRef.current = false
        renderFullScene()
        return
      } finally {
        applyingRemoteRef.current = false
      }
      const rendered = renderedDocRef.current
      for (const id of result.removed) delete rendered.shapes[id]
      for (const id of result.affected) {
        const record = canvasRecord(id)
        if (record) rendered.shapes[id] = record
        else delete rendered.shapes[id]
      }
      for (const id of result.deferred) deferredIdsRef.current.add(id)
      if (result.removed.size || result.affected.size) {
        window.dispatchEvent(new CustomEvent('lix-doc-canvas-links-changed'))
      }
    }

    /** Bring the listed shapes on the canvas to the client's local doc state. */
    function resyncShapes(ids) {
      if (!otRef.current || !ids.size) return
      const ops = []
      for (const id of ids) {
        const target = otRef.current.local.shapes[id]
        const current = canvasRecord(id)
        if (!target && current) ops.push({ t: 'delete', id })
        else if (target && !current) ops.push({ t: 'create', id, data: target })
        else if (target && current) ops.push(...diffRecords(id, current, target))
      }
      applyToCanvas(ops)
    }

    /** After my gesture / label edit ends: publish it, then catch the shapes up. */
    function finishGesture() {
      flushLocalChanges()
      if (!deferredIdsRef.current.size) return
      const ids = new Set(deferredIdsRef.current)
      deferredIdsRef.current.clear()
      resyncShapes(ids)
    }

    /** Full scene load from the OT doc: initial join and snapshot fallback only. */
    function renderFullScene() {
      if (!otRef.current) return
      const serializer = window.__sceneSerializer
      if (!serializer) return
      const doc = otRef.current.local
      applyingRemoteRef.current = true
      try {
        serializer.load(docToScene(doc, { name: useUIStore.getState().workspaceName || 'Untitled' }), { preserveViewport: true })
        window.rebindUndoHistory?.(window.shapes || [])
      } finally {
        applyingRemoteRef.current = false
      }
      renderedDocRef.current = cloneDoc(doc)
      deferredIdsRef.current.clear()
    }

    // Per-client OT undo/redo while in a v2 room (UndoRedo.js calls this).
    window.__collabHistory = (kind) => {
      if (!isV2() || !otRef.current || !initializedRef.current) return false
      if (useCollabStore.getState().myRole !== 'editor') return true
      flushLocalChanges()
      const messages = kind === 'redo' ? otRef.current.redo() : otRef.current.undo()
      if (messages.length) {
        sendOps(messages)
        applyToCanvas(messages.flatMap((message) => message.ops))
      }
      return true
    }

    // --- Legacy (v1) full-scene path ---

    async function applyScenePayload(payload) {
      if (!payload || !window.__sceneSerializer) return
      const plaintext = await decrypt(payload, getRoomKey())
      const sceneData = JSON.parse(plaintext)
      applyingRemoteRef.current = true
      try {
        window.__sceneSerializer.load(sceneData, { preserveViewport: true })
        window.rebindUndoHistory?.(window.shapes || [])
      } finally {
        applyingRemoteRef.current = false
      }
    }

    async function sendSceneSnapshot() {
      const ws = wsRef.current
      const serializer = window.__sceneSerializer
      if (!ws || ws.readyState !== WebSocket.OPEN || !serializer || applyingRemoteRef.current) return
      if (useCollabStore.getState().myRole !== 'editor') return
      if (snapshotInFlightRef.current) {
        snapshotQueuedRef.current = true
        return
      }
      snapshotInFlightRef.current = true
      try {
        const sceneData = serializer.save(useUIStore.getState().workspaceName || 'Untitled')
        const payload = await encrypt(JSON.stringify(sceneData), getRoomKey())
        ws.send(JSON.stringify({
          type: 'op',
          seq: ++clientSeqRef.current,
          payload,
        }))
      } catch (error) {
        console.error('[Collab] Failed to publish scene update:', error)
        useCollabStore.getState().setError('Could not publish the latest canvas update.')
      } finally {
        snapshotInFlightRef.current = false
        if (snapshotQueuedRef.current) {
          snapshotQueuedRef.current = false
          queueMicrotask(sendSceneSnapshot)
        }
      }
    }

    function scheduleSceneSnapshot() {
      if (applyingRemoteRef.current) return
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
      syncTimerRef.current = setTimeout(() => {
        syncTimerRef.current = null
        if (isV2()) flushLocalChanges()
        else sendSceneSnapshot()
      }, SCENE_SYNC_DEBOUNCE)
    }

    window.__collabSceneChanged = scheduleSceneSnapshot
    window.__applyRemoteOp = (sceneData) => {
      if (!sceneData || !window.__sceneSerializer) return
      applyingRemoteRef.current = true
      try {
        window.__sceneSerializer.load(sceneData, { preserveViewport: true })
        window.rebindUndoHistory?.(window.shapes || [])
      }
      finally { applyingRemoteRef.current = false }
    }

    // --- Cursor rendering ---
    // Cursors live in canvas (SVG user) coordinates, so they stay attached
    // to the same spot under every viewer's own zoom/pan; only the glyph is
    // counter-scaled to keep a constant on-screen size.

    const cursors = new Map() // connectionId -> { el, x, y, lastSeen, zoom }

    function currentZoom() {
      return Math.max(0.05, Number(window.currentZoom) || 1)
    }

    function placeCursor(entry) {
      const zoom = currentZoom()
      entry.zoom = zoom
      entry.el.setAttribute('transform', `translate(${entry.x}, ${entry.y}) scale(${1 / zoom})`)
    }

    function renderCursor(connectionId, cursor, displayName, color) {
      if (!cursor || !window.svg) return

      let entry = cursors.get(connectionId)
      if (!entry || !entry.el.isConnected) {
        entry?.el.remove()
        const el = document.createElementNS('http://www.w3.org/2000/svg', 'g')
        el.setAttribute('class', 'remote-cursor')
        el.setAttribute('data-user', connectionId)
        el.style.pointerEvents = 'none'

        // Cursor arrow
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
        path.setAttribute('d', 'M0,0 L0,14 L4,11 L7,17 L9,16 L6,10 L11,10 Z')
        path.setAttribute('fill', color || '#5B57D1')
        path.setAttribute('stroke', '#000')
        path.setAttribute('stroke-width', '0.5')
        el.appendChild(path)

        // Name tag
        const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
        bg.setAttribute('rx', '3')
        bg.setAttribute('fill', color || '#5B57D1')
        bg.setAttribute('y', '18')
        bg.setAttribute('x', '2')
        el.appendChild(bg)

        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text')
        text.setAttribute('fill', '#fff')
        text.setAttribute('font-size', '9')
        text.setAttribute('font-family', 'lixFont, sans-serif')
        text.setAttribute('y', '27')
        text.setAttribute('x', '5')
        text.textContent = displayName || connectionId.slice(0, 8)
        el.appendChild(text)

        // Size the bg after text is measurable
        requestAnimationFrame(() => {
          const bbox = text.getBBox?.()
          if (bbox) {
            bg.setAttribute('width', bbox.width + 6)
            bg.setAttribute('height', bbox.height + 4)
          }
        })

        entry = { el, x: 0, y: 0, lastSeen: 0, zoom: 0 }
        cursors.set(connectionId, entry)
      }

      // Keep cursors above shapes added since (scene reloads re-append shapes).
      if (entry.el.parentNode !== window.svg || window.svg.lastElementChild !== entry.el) {
        window.svg.appendChild(entry.el)
      }
      entry.x = cursor.x
      entry.y = cursor.y
      entry.lastSeen = Date.now()
      entry.el.style.display = ''
      placeCursor(entry)
    }

    function hideCursor(connectionId) {
      const entry = cursors.get(connectionId)
      if (entry) entry.el.style.display = 'none'
    }

    function removeCursor(connectionId) {
      const entry = cursors.get(connectionId)
      if (entry) {
        entry.el.remove()
        cursors.delete(connectionId)
      }
    }

    function clearAllCursors() {
      cursors.forEach((entry) => entry.el.remove())
      cursors.clear()
    }

    function pruneCursors(users) {
      const live = new Set(users.map((u) => u.connectionId || u.userId))
      for (const id of [...cursors.keys()]) if (!live.has(id)) removeCursor(id)
    }

    // Idle peers fade out; zoom changes re-scale the labels.
    const cursorTick = setInterval(() => {
      const now = Date.now()
      const zoom = currentZoom()
      cursors.forEach((entry) => {
        if (now - entry.lastSeen > CURSOR_IDLE_MS) entry.el.style.display = 'none'
        else if (entry.zoom !== zoom) placeCursor(entry)
      })
    }, CURSOR_TICK_MS)

    // --- Presence broadcasting ---

    let lastPointer = null
    let presenceFrame = 0
    let presenceHidden = false
    function flushPresence() {
      presenceFrame = 0
      const e = lastPointer
      if (!e) return
      const ws = wsRef.current
      if (!ws || ws.readyState !== WebSocket.OPEN || ws.bufferedAmount > PRESENCE_BUFFER_LIMIT) return

      // Convert screen coords to SVG viewBox (canvas) coords
      const svg = window.svg
      const ctm = svg?.getScreenCTM?.()
      if (!svg || !ctm) return
      const pt = svg.createSVGPoint()
      pt.x = e.clientX
      pt.y = e.clientY
      const svgPt = pt.matrixTransform(ctm.inverse())

      presenceHidden = false
      ws.send(JSON.stringify({
        type: 'presence',
        cursor: { x: Math.round(svgPt.x * 10) / 10, y: Math.round(svgPt.y * 10) / 10 },
      }))
    }

    function queuePresence() {
      if (!presenceFrame) presenceFrame = requestAnimationFrame(flushPresence)
    }

    function onPointerMove(e) {
      lastPointer = { clientX: e.clientX, clientY: e.clientY }
      queuePresence()
    }

    // Panning/zooming moves the canvas under a still pointer.
    function onViewportChange() {
      if (lastPointer) queuePresence()
    }

    function sendHidePresence() {
      lastPointer = null
      const ws = wsRef.current
      if (presenceHidden || !ws || ws.readyState !== WebSocket.OPEN) return
      presenceHidden = true
      ws.send(JSON.stringify({ type: 'presence', cursor: null }))
    }

    function onPointerOut(e) {
      if (!e.relatedTarget) sendHidePresence()
    }

    function onVisibility() {
      if (document.visibilityState === 'hidden') sendHidePresence()
    }

    function onPointerDown() {
      pointerDown = true
      if (gestureEndTimer) { clearTimeout(gestureEndTimer); gestureEndTimer = null }
    }
    function onPointerUp() {
      // Let the engine's own pointerup handlers finalize the gesture first.
      if (gestureEndTimer) clearTimeout(gestureEndTimer)
      gestureEndTimer = setTimeout(() => {
        gestureEndTimer = null
        pointerDown = false
        finishGesture()
      }, 0)
    }
    function onFocusOut() {
      setTimeout(() => {
        if (!pointerDown) finishGesture()
      }, 0)
    }

    document.addEventListener('pointermove', onPointerMove, { passive: true })
    document.addEventListener('wheel', onViewportChange, { passive: true })
    document.addEventListener('pointerout', onPointerOut, { passive: true })
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('blur', sendHidePresence)
    document.addEventListener('pointerdown', onPointerDown, { passive: true, capture: true })
    document.addEventListener('pointerup', onPointerUp, { passive: true, capture: true })
    document.addEventListener('pointercancel', onPointerUp, { passive: true, capture: true })
    document.addEventListener('focusout', onFocusOut)

    // --- Reconnection ---

    function scheduleReconnect() {
      if (intentionalClose.current || reconnectRef.current) return
      const delay = reconnectDelay.current
      console.log(`[Collab] Reconnecting in ${delay}ms...`)
      reconnectRef.current = setTimeout(() => {
        reconnectRef.current = null
        reconnectDelay.current = Math.min(delay * 2, RECONNECT_MAX)
        connect()
      }, delay)
    }

    function cleanup() {
      if (pingRef.current) {
        clearInterval(pingRef.current)
        pingRef.current = null
      }
    }

    waitForEngine()

    window.__disconnectCollaboration = () => {
      intentionalClose.current = true
      if (reconnectRef.current) clearTimeout(reconnectRef.current)
      reconnectRef.current = null
      if (wsRef.current) wsRef.current.close(1000, 'session-ended')
    }

    return () => {
      disposed = true
      intentionalClose.current = true
      document.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('wheel', onViewportChange)
      document.removeEventListener('pointerout', onPointerOut)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('blur', sendHidePresence)
      document.removeEventListener('pointerdown', onPointerDown, { capture: true })
      document.removeEventListener('pointerup', onPointerUp, { capture: true })
      document.removeEventListener('pointercancel', onPointerUp, { capture: true })
      document.removeEventListener('focusout', onFocusOut)
      if (presenceFrame) cancelAnimationFrame(presenceFrame)
      clearInterval(cursorTick)
      cleanup()
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
      if (reconnectRef.current) clearTimeout(reconnectRef.current)
      if (snapshotTimerRef.current) clearTimeout(snapshotTimerRef.current)
      if (gestureEndTimer) clearTimeout(gestureEndTimer)
      if (engineWaitTimer) clearTimeout(engineWaitTimer)
      clearAllCursors()
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
      useCollabStore.getState().reset()
      otRef.current = null
      initializedRef.current = false
      delete window.__collabSceneChanged
      delete window.__applyRemoteOp
      delete window.__disconnectCollaboration
      delete window.__collabHistory
    }
  }, [roomId])
}

function showToast(html, ms) {
  if (typeof document === 'undefined') return
  const toast = document.getElementById('save-toast')
  if (!toast) return
  toast.innerHTML = html
  toast.classList.remove('hidden')
  clearTimeout(toast._hideTimer)
  toast._hideTimer = setTimeout(() => toast.classList.add('hidden'), ms)
}

function showAgentEditToast(agent) {
  const toast = document.getElementById('save-toast')
  if (!toast) return
  toast.textContent = `${agent} updated the canvas`
  toast.classList.remove('hidden')
  clearTimeout(toast._hideTimer)
  toast._hideTimer = setTimeout(() => toast.classList.add('hidden'), 3500)
}

function humanizeServerError(code, msg = {}) {
  switch (code) {
    case 'ROOM_EXPIRED': return 'This collaboration room has expired.'
    case 'ROOM_IDLE_TIMEOUT': return 'This collaboration room closed after being idle.'
    case 'ROOM_FULL': {
      const max = Number(msg.maxUsers) || 5
      return `This room is full (${max} of ${max} people). Try again when someone leaves.`
    }
    case 'ROOM_LIMIT_REACHED': return 'You already have a live room open. Close it before starting another.'
    case 'INVALID_SESSION': return 'Your sign-in expired. Sign in again to join this room.'
    case 'NOT_AUTHORIZED': return 'You are not allowed to perform that action.'
    case 'INVALID_OPERATION': return 'A collaboration update was rejected.'
    case 'READ_ONLY': return 'You have view-only access to this workspace.'
    case 'ROOM_SHARING_DISABLED': return 'Live sharing is disabled for this workspace.'
    case 'INVALID_INVITE': return 'This collaboration invite is no longer valid.'
    default: return 'The collaboration server reported an error.'
  }
}
