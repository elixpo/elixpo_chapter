import type { Env } from './index';

const CURSOR_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
  '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#F1948A',
];

const MAX_WORKSPACE_NAME_LENGTH = 20;
const ABSOLUTE_MAX_USERS = 5;
const PRESENCE_MIN_INTERVAL_MS = 30;
const MAX_OP_PAYLOAD = 900_000;

// Protocol v2 (OT): the room is a sequencer for opaque, end-to-end encrypted
// ops. It assigns serverSeq, acks the sender, and keeps a bounded log tail
// so reconnecting clients can catch up by seq. v1 full-scene ops are still
// sequenced and relayed unchanged.
const PROTOCOL_VERSION = 2;
const LOG_MAX_ENTRIES = 2000;
const LOG_MAX_BYTES = 8 * 1024 * 1024;
// Durable Object storage values are capped at 128 KiB; long payloads are
// split across several keys.
const LOG_PART_CHARS = 100_000;

// Join rejections are delivered over an accepted socket so the browser can
// read the reason (a failed upgrade only surfaces as close code 1006).
const REJECT_CLOSE_CODES: Record<string, number> = {
  ROOM_FULL: 4429,
  ROOM_EXPIRED: 4410,
  ROOM_LIMIT_REACHED: 4429,
  ROOM_SHARING_DISABLED: 4403,
  INVALID_INVITE: 4403,
  INVALID_SESSION: 4401,
};

interface LogIndexEntry {
  seq: number;
  parts: number;
  bytes: number;
}

type RoomRole = 'editor' | 'viewer';

interface UserInfo {
  userId: string;
  connectionId: string;
  displayName: string;
  avatar: string;
  color: string;
  role: RoomRole;
  isAdmin: boolean;
  joinedAt: string;
  lastActivity: string;
}

interface RoomState {
  roomId?: string;
  ownerId: string | null;
  ownerIp: string | null;
  createdAt: string;
  expiresAt: string;
  status: string;
  tier?: 'guest' | 'free' | 'pro';
  maxUsers?: number;
  sharingEnabled?: boolean;
  inviteToken?: string;
  inviteVersion?: number;
  adminToken?: string;
  access?: Record<string, RoomRole>;
}

interface AuthSession {
  userId: string;
  displayName: string;
  avatar: string | null;
}

export class RoomDurableObject {
  private state: DurableObjectState;
  private env: Env;
  private sessions: Map<WebSocket, UserInfo> = new Map();
  private serverSeq = 0;
  private roomState: RoomState | null = null;
  private lastActivityAt = Date.now();
  private availableColors: string[] = [...CURSOR_COLORS];
  private lastPresenceAt: Map<string, number> = new Map();
  private logIndex: LogIndexEntry[] = [];
  /** Catch-up is possible for any `since >= logFloor`. */
  private logFloor = 0;
  private clientSeqs: Map<string, number> = new Map();

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;

    // serverSeq and the log index must survive hibernation / eviction,
    // otherwise sequence numbers would restart and clients would ignore ops.
    this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get(['opSeq', 'logFloor', 'logIndex']);
      this.serverSeq = Number(stored.get('opSeq') || 0);
      this.logFloor = Number(stored.get('logFloor') ?? this.serverSeq);
      this.logIndex = (stored.get('logIndex') as LogIndexEntry[] | undefined) || [];
    });

    // Durable Objects may hibernate between messages. Rebuild the in-memory
    // session index from WebSocket attachments so live rooms keep relaying
    // operations after wake-up.
    for (const ws of this.state.getWebSockets()) {
      const user = ws.deserializeAttachment() as UserInfo | null;
      if (!user?.userId) continue;
      this.sessions.set(ws, user);
      this.availableColors = this.availableColors.filter((color) => color !== user.color);
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const upgradeHeader = request.headers.get('Upgrade');

    if (request.method === 'POST' && url.pathname.endsWith('/agent-op')) {
      if (!this.env.MCP_RELAY_SECRET || request.headers.get('X-LixSketch-Relay') !== this.env.MCP_RELAY_SECRET) {
        return new Response('Not authorized', { status: 401 });
      }
      const message = await request.json() as { payload?: string; revision?: number; agent?: { id?: string; label?: string } };
      if (typeof message.payload !== 'string' || message.payload.length > 900_000) {
        return new Response('Invalid operation', { status: 400 });
      }
      await this.sequence(null, {
        type: 'agent-op',
        from: `agent:${message.agent?.id || 'mcp'}`,
        displayName: message.agent?.label || 'MCP agent',
        revision: Number(message.revision || 0),
        payload: message.payload,
      });
      return new Response(null, { status: 204 });
    }

    if (upgradeHeader !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }

    if (!isAllowedOrigin(request.headers.get('Origin'), this.env)) {
      return new Response('Origin not allowed', { status: 403 });
    }

    // Extract user info from query params
    const authToken = url.searchParams.get('authToken');
    let authSession = authToken
      ? await this.env.KV.get(`session:${authToken}`, 'json') as AuthSession | null
      : null;
    // The Next.js OAuth callback stores the Elixpo access token client-side,
    // while the worker callback stores its own KV session. Accept either by
    // validating unknown bearer tokens directly with Accounts.
    if (authToken && !authSession) {
      try {
        const response = await fetch(`${this.env.ELIXPO_AUTH_URL}/api/auth/me`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        if (response.ok) {
          const profile = await response.json() as {
            id?: string;
            userId?: string;
            displayName?: string;
            avatar?: string | null;
          };
          const verifiedUserId = profile.id || profile.userId;
          if (verifiedUserId) {
            authSession = {
              userId: verifiedUserId,
              displayName: profile.displayName || 'User',
              avatar: profile.avatar || null,
            };
          }
        }
      } catch {}
    }
    if (authToken && !authSession) {
      return rejectSocket('INVALID_SESSION');
    }

    const userId = authSession?.userId
      || url.searchParams.get('userId')
      || `guest-${crypto.randomUUID().slice(0, 8)}`;
    const connectionId = url.searchParams.get('clientId') || crypto.randomUUID();
    const suppliedInviteToken = url.searchParams.get('invite') || '';
    const suppliedAdminToken = url.searchParams.get('adminToken') || '';
    const displayName = authSession?.displayName
      || decodeParam(url.searchParams.get('displayName') || '');
    const avatar = authSession?.avatar || url.searchParams.get('avatar') || '';
    const workspaceName = decodeParam(url.searchParams.get('workspaceName') || 'Untitled')
      .slice(0, MAX_WORKSPACE_NAME_LENGTH);
    const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';

    // Get or initialize room
    const roomId = url.pathname.split('/room/')[1];
    const roomCreated = await this.ensureRoomState(roomId, userId, authSession?.userId || null, clientIp, workspaceName);

    // Check room status
    if (this.roomState!.status !== 'active') {
      return rejectSocket('ROOM_EXPIRED');
    }

    // The room owner's plan controls total room occupancy (owner included).
    // Never trust a client-provided tier.
    const maxUsers = Math.min(this.roomState!.maxUsers || 1, ABSOLUTE_MAX_USERS);

    const isAdmin = roomCreated
      || (!!authSession && authSession.userId === this.roomState!.ownerId)
      || (!!suppliedAdminToken && suppliedAdminToken === this.roomState!.adminToken);
    if (!isAdmin) {
      if (!this.roomState!.sharingEnabled) {
        return rejectSocket('ROOM_SHARING_DISABLED');
      }
      if (!suppliedInviteToken || suppliedInviteToken !== this.roomState!.inviteToken) {
        return rejectSocket('INVALID_INVITE');
      }
    }

    // A stable per-tab connection ID lets reconnects replace their stale
    // socket instead of consuming another seat in the room. Only done after
    // the caller is authorized and only for the same user, so a guessed
    // clientId cannot evict anyone.
    this.replaceStaleConnection(connectionId, userId);

    if (this.sessions.size >= maxUsers) {
      return rejectSocket('ROOM_FULL', maxUsers);
    }

    // 1 room per user (guest or authenticated)
    const isGuest = !authToken;
    if (roomCreated) {
      // First connection = room creation. Check if this user already has a room
      const limitKey = isGuest ? `ip-rooms:${clientIp}` : `user-rooms:${userId}`;
      const existingRoom = await this.env.KV.get(limitKey);
      if (existingRoom && existingRoom !== roomId) {
        // The room record is initialized before its ownership quota can be
        // checked. Expire a rejected record so a retry cannot bypass the
        // one-live-room rule through the already-created Durable Object.
        this.roomState!.status = 'expired';
        await this.persistRoomState();
        try {
          await this.env.DB.prepare(`UPDATE rooms SET status = 'expired' WHERE id = ?`).bind(roomId).run();
        } catch {}
        return rejectSocket('ROOM_LIMIT_REACHED');
      }
      // Reserve this slot
      const ttlSeconds = parseInt(this.env.ROOM_TTL_HOURS || '3') * 3600;
      await this.env.KV.put(limitKey, roomId, { expirationTtl: ttlSeconds });
    }

    // Re-check occupancy: the awaits above let other joins interleave.
    this.replaceStaleConnection(connectionId, userId);
    if (this.sessions.size >= maxUsers) {
      return rejectSocket('ROOM_FULL', maxUsers);
    }

    // Assign color
    const color = this.availableColors.shift() || CURSOR_COLORS[this.sessions.size % CURSOR_COLORS.length];

    // Create WebSocket pair
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    const userInfo: UserInfo = {
      userId,
      connectionId,
      displayName: displayName || `User ${this.sessions.size + 1}`,
      avatar,
      color,
      role: isAdmin ? 'editor' : (this.roomState!.access?.[userId] || 'editor'),
      isAdmin,
      joinedAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
    };

    this.state.acceptWebSocket(server);
    server.serializeAttachment(userInfo);
    this.sessions.set(server, userInfo);

    // Send room-info to the new user
    this.sendTo(server, {
      type: 'room-info',
      roomId,
      connectionId,
      adminUserId: this.roomState!.ownerId,
      isAdmin,
      role: userInfo.role,
      adminToken: isAdmin ? this.roomState!.adminToken : undefined,
      inviteToken: isAdmin ? this.roomState!.inviteToken : undefined,
      inviteVersion: this.roomState!.inviteVersion,
      sharingEnabled: this.roomState!.sharingEnabled,
      maxUsers,
      expiresAt: this.roomState!.expiresAt,
      yourColor: color,
      users: Array.from(this.sessions.values()),
      protocol: PROTOCOL_VERSION,
      seq: this.serverSeq,
      logFloor: this.logFloor,
    });

    // Broadcast join to everyone else
    this.broadcast(server, {
      type: 'join',
      from: userId,
      connectionId,
      displayName: userInfo.displayName,
      avatar: userInfo.avatar,
      color,
      role: userInfo.role,
      isAdmin,
      // Membership events are not ops; they report the current op seq only.
      serverSeq: this.serverSeq,
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    await this.loadRoomState();
    const user = this.getUser(ws);
    if (!user) return;

    let msg: any;
    try {
      msg = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw));
    } catch {
      this.sendTo(ws, { type: 'error', code: 'INVALID_MESSAGE' });
      return;
    }

    switch (msg.type) {
      case 'op':
        if (user.role !== 'editor') {
          this.sendTo(ws, { type: 'error', code: 'READ_ONLY' });
          break;
        }
        if (typeof msg.payload !== 'string' || msg.payload.length > MAX_OP_PAYLOAD) {
          this.sendTo(ws, { type: 'error', code: 'INVALID_OPERATION' });
          break;
        }
        this.lastActivityAt = Date.now();
        user.lastActivity = new Date().toISOString();
        ws.serializeAttachment(user);
        if (msg.v === PROTOCOL_VERSION) {
          const clientSeq = Number(msg.clientSeq);
          if (!Number.isSafeInteger(clientSeq) || clientSeq < 1) {
            this.sendTo(ws, { type: 'error', code: 'INVALID_OPERATION' });
            break;
          }
          // Resends after a reconnect must not be sequenced twice.
          const lastClientSeq = await this.getLastClientSeq(user.connectionId);
          if (clientSeq <= lastClientSeq) {
            this.sendTo(ws, { type: 'ack', clientSeq, duplicate: true, seq: this.serverSeq });
            break;
          }
          await this.setLastClientSeq(user.connectionId, clientSeq);
          const serverSeq = await this.sequence(ws, {
            type: 'op',
            v: PROTOCOL_VERSION,
            from: user.userId,
            connectionId: user.connectionId,
            clientSeq,
            baseSeq: Number(msg.baseSeq) || 0,
            payload: msg.payload,
          });
          this.sendTo(ws, { type: 'ack', clientSeq, serverSeq });
          break;
        }
        // v1: full-scene snapshot op.
        await this.sequence(ws, {
          type: 'op',
          from: user.userId,
          connectionId: user.connectionId,
          seq: msg.seq,
          payload: msg.payload,
        });
        break;

      case 'catch-up':
        await this.sendCatchUp(ws, user, Number(msg.since));
        break;

      case 'presence':
        // cursor: null hides this user's cursor (pointer left / idle).
        if (msg.cursor !== null && !isValidCursor(msg.cursor)) break;
        {
          const now = Date.now();
          const previous = this.lastPresenceAt.get(user.connectionId) || 0;
          if (now - previous < PRESENCE_MIN_INTERVAL_MS) break;
          this.lastPresenceAt.set(user.connectionId, now);
        }
        this.broadcast(ws, {
          type: 'presence',
          from: user.userId,
          connectionId: user.connectionId,
          cursor: msg.cursor,
          displayName: user.displayName,
          color: user.color,
        });
        break;

      case 'sync-request':
        // Ask the first other connected client to provide a full sync
        for (const [otherWs, otherUser] of this.sessions) {
          if (otherWs !== ws) {
            this.sendTo(otherWs, {
              type: 'sync-needed',
              requestedBy: user.connectionId,
              lastServerSeq: msg.lastServerSeq || 0,
            });
            break;
          }
        }
        break;

      case 'sync-response':
        if (typeof msg.payload !== 'string' || msg.payload.length > MAX_OP_PAYLOAD) {
          this.sendTo(ws, { type: 'error', code: 'INVALID_OPERATION' });
          break;
        }
        // Relay full sync to the requesting user
        for (const [otherWs, otherUser] of this.sessions) {
          if (otherUser.connectionId === (msg.targetConnectionId || msg.targetUserId)) {
            // v2 responders send the seq their snapshot reflects; the
            // requester catches up from there through the log.
            const snapshotSeq = Number(msg.seq);
            this.sendTo(otherWs, {
              type: 'sync-response',
              serverSeq: Number.isSafeInteger(snapshotSeq) && snapshotSeq >= 0 && snapshotSeq <= this.serverSeq
                ? snapshotSeq
                : this.serverSeq,
              v: msg.v === PROTOCOL_VERSION ? PROTOCOL_VERSION : undefined,
              payload: msg.payload,
            });
            break;
          }
        }
        break;

      case 'kick':
        if (!user.isAdmin) {
          this.sendTo(ws, { type: 'error', code: 'NOT_AUTHORIZED' });
          break;
        }
        for (const [targetWs, targetUser] of this.sessions) {
          if (!targetUser.isAdmin && (targetUser.connectionId === msg.connectionId || targetUser.userId === msg.userId)) {
            this.sendTo(targetWs, { type: 'kicked', reason: 'Removed by admin' });
            try { targetWs.close(1000, 'kicked'); } catch {}
            this.handleDisconnect(targetWs);
            break;
          }
        }
        break;

      case 'access-update': {
        if (!user.isAdmin) {
          this.sendTo(ws, { type: 'error', code: 'NOT_AUTHORIZED' });
          break;
        }
        const role: RoomRole = msg.role === 'viewer' ? 'viewer' : 'editor';
        let targetUserId = typeof msg.userId === 'string' ? msg.userId : '';
        for (const [targetWs, targetUser] of this.sessions) {
          if (targetUser.isAdmin) continue;
          if (targetUser.connectionId === msg.connectionId || (!!targetUserId && targetUser.userId === targetUserId)) {
            targetUserId = targetUser.userId;
            targetUser.role = role;
            targetWs.serializeAttachment(targetUser);
          }
        }
        if (!targetUserId) {
          this.sendTo(ws, { type: 'error', code: 'USER_NOT_FOUND' });
          break;
        }
        this.roomState!.access = { ...(this.roomState!.access || {}), [targetUserId]: role };
        await this.persistRoomState();
        this.broadcast(null, { type: 'access-updated', userId: targetUserId, role });
        break;
      }

      case 'sharing-update': {
        if (!user.isAdmin) {
          this.sendTo(ws, { type: 'error', code: 'NOT_AUTHORIZED' });
          break;
        }
        this.roomState!.sharingEnabled = msg.enabled !== false;
        await this.persistRoomState();
        this.broadcast(null, {
          type: 'room-settings',
          sharingEnabled: this.roomState!.sharingEnabled,
          inviteVersion: this.roomState!.inviteVersion,
        });
        if (!this.roomState!.sharingEnabled) {
          for (const [targetWs, targetUser] of Array.from(this.sessions)) {
            if (targetUser.isAdmin) continue;
            this.sendTo(targetWs, { type: 'sharing-disabled' });
            try { targetWs.close(1000, 'sharing-disabled'); } catch {}
            this.handleDisconnect(targetWs);
          }
        }
        break;
      }

      case 'rotate-invite':
        if (!user.isAdmin) {
          this.sendTo(ws, { type: 'error', code: 'NOT_AUTHORIZED' });
          break;
        }
        this.roomState!.inviteToken = createCapability();
        this.roomState!.inviteVersion = (this.roomState!.inviteVersion || 1) + 1;
        await this.persistRoomState();
        this.sendTo(ws, {
          type: 'invite-rotated',
          inviteToken: this.roomState!.inviteToken,
          inviteVersion: this.roomState!.inviteVersion,
        });
        this.broadcast(ws, {
          type: 'invite-invalidated',
          inviteVersion: this.roomState!.inviteVersion,
        });
        break;

      case 'ping':
        this.sendTo(ws, { type: 'pong' });
        break;

      default:
        this.sendTo(ws, { type: 'error', code: 'INVALID_MESSAGE' });
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    this.handleDisconnect(ws);
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    this.handleDisconnect(ws);
  }

  async alarm(): Promise<void> {
    await this.loadRoomState();
    if (!this.roomState) return;

    const now = Date.now();
    const expiresAt = new Date(this.roomState.expiresAt).getTime();
    const idleTimeoutMs = parseInt(this.env.IDLE_TIMEOUT_MINS || '40') * 60 * 1000;

    // Check session expiry (3h)
    if (now >= expiresAt) {
      await this.closeRoom('ROOM_EXPIRED');
      return;
    }

    // Check idle timeout (40min)
    if (now - this.lastActivityAt >= idleTimeoutMs && this.sessions.size > 0) {
      await this.closeRoom('ROOM_IDLE_TIMEOUT');
      return;
    }

    // Schedule next check in 5 minutes (or at expiry, whichever is sooner)
    const nextCheck = Math.min(5 * 60 * 1000, expiresAt - now);
    this.state.storage.setAlarm(Date.now() + nextCheck);
  }

  // --- Private helpers ---

  private replaceStaleConnection(connectionId: string, userId: string): void {
    for (const [existingWs, existingUser] of Array.from(this.sessions)) {
      if (existingUser.connectionId === connectionId && existingUser.userId === userId) {
        try { existingWs.close(1000, 'reconnected'); } catch {}
        this.handleDisconnect(existingWs, false);
      }
    }
  }

  /**
   * Assign the next serverSeq to an op, append it to the log tail and relay
   * it to every other session. Returns the assigned seq.
   */
  private async sequence(sender: WebSocket | null, message: Record<string, unknown>): Promise<number> {
    const serverSeq = ++this.serverSeq;
    const data = JSON.stringify({ ...message, serverSeq });
    const entries: Record<string, unknown> = { opSeq: serverSeq };
    const parts = Math.max(1, Math.ceil(data.length / LOG_PART_CHARS));
    for (let i = 0; i < parts; i += 1) {
      entries[logKey(serverSeq, i)] = data.slice(i * LOG_PART_CHARS, (i + 1) * LOG_PART_CHARS);
    }
    this.logIndex.push({ seq: serverSeq, parts, bytes: data.length });

    const stale: string[] = [];
    let total = this.logIndex.reduce((sum, entry) => sum + entry.bytes, 0);
    while (this.logIndex.length > 1 && (this.logIndex.length > LOG_MAX_ENTRIES || total > LOG_MAX_BYTES)) {
      const oldest = this.logIndex.shift()!;
      total -= oldest.bytes;
      this.logFloor = oldest.seq;
      for (let i = 0; i < oldest.parts; i += 1) stale.push(logKey(oldest.seq, i));
    }
    entries.logIndex = this.logIndex;
    entries.logFloor = this.logFloor;
    await this.state.storage.put(entries);
    for (let i = 0; i < stale.length; i += 128) {
      await this.state.storage.delete(stale.slice(i, i + 128));
    }

    for (const [ws] of this.sessions) {
      if (ws === sender) continue;
      try { ws.send(data); } catch {}
    }
    return serverSeq;
  }

  /** Replay logged ops after `since`, or tell the client to fall back to a snapshot. */
  private async sendCatchUp(ws: WebSocket, user: UserInfo, since: number): Promise<void> {
    const yourLastClientSeq = await this.getLastClientSeq(user.connectionId);
    const done = (ok: boolean) => this.sendTo(ws, {
      type: 'catch-up-done', ok, since, seq: this.serverSeq, logFloor: this.logFloor, yourLastClientSeq,
    });
    const covered = Number.isSafeInteger(since) && since >= this.logFloor && since <= this.serverSeq;
    if (!covered) {
      done(false);
      return;
    }
    for (const entry of this.logIndex) {
      if (entry.seq <= since) continue;
      const keys = Array.from({ length: entry.parts }, (_, i) => logKey(entry.seq, i));
      const stored = await this.state.storage.get<string>(keys);
      const data = keys.map((key) => stored.get(key) || '').join('');
      if (!data) {
        done(false);
        return;
      }
      try { ws.send(data); } catch { return; }
    }
    done(true);
  }

  private async getLastClientSeq(connectionId: string): Promise<number> {
    const cached = this.clientSeqs.get(connectionId);
    if (cached !== undefined) return cached;
    const stored = Number(await this.state.storage.get(`cseq:${connectionId}`) || 0);
    this.clientSeqs.set(connectionId, stored);
    return stored;
  }

  private async setLastClientSeq(connectionId: string, clientSeq: number): Promise<void> {
    this.clientSeqs.set(connectionId, clientSeq);
    await this.state.storage.put(`cseq:${connectionId}`, clientSeq);
  }

  private async ensureRoomState(roomId: string, ownerId: string, authenticatedOwnerId: string | null, ownerIp: string, workspaceName: string): Promise<boolean> {
    if (this.roomState) return false;
    const stored = await this.state.storage.get<RoomState>('roomState');
    if (stored) {
      this.roomState = stored;
      let changed = false;
      const claimedLegacyRoom = !stored.ownerId;
      if (claimedLegacyRoom) { stored.ownerId = ownerId; changed = true; }
      if (!stored.maxUsers) {
        const tier = await this.getOwnerTier(authenticatedOwnerId);
        stored.tier = tier;
        stored.maxUsers = this.getCollaboratorLimit(tier);
        changed = true;
      }
      if (!stored.inviteToken) { stored.inviteToken = createCapability(); changed = true; }
      if (!stored.adminToken) { stored.adminToken = createCapability(); changed = true; }
      if (!stored.inviteVersion) { stored.inviteVersion = 1; changed = true; }
      if (stored.sharingEnabled === undefined) { stored.sharingEnabled = true; changed = true; }
      if (!stored.access) { stored.access = {}; changed = true; }
      if (!stored.roomId) { stored.roomId = roomId; changed = true; }
      stored.maxUsers = Math.min(stored.maxUsers || 1, ABSOLUTE_MAX_USERS);
      if (changed) await this.persistRoomState();
      return claimedLegacyRoom;
    }
    await this.initRoom(roomId, ownerId, authenticatedOwnerId, ownerIp, workspaceName);
    return true;
  }

  private async initRoom(roomId: string, ownerId: string, authenticatedOwnerId: string | null, ownerIp: string, workspaceName: string = 'Untitled'): Promise<void> {
    const ttlHours = parseInt(this.env.ROOM_TTL_HOURS || '3');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlHours * 3600 * 1000);

    const tier = await this.getOwnerTier(authenticatedOwnerId);
    const maxUsers = this.getCollaboratorLimit(tier);
    this.roomState = {
      roomId,
      ownerId,
      ownerIp,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      status: 'active',
      tier,
      maxUsers,
      sharingEnabled: true,
      inviteToken: createCapability(),
      inviteVersion: 1,
      adminToken: createCapability(),
      access: {},
    };
    await this.state.storage.put('roomState', this.roomState);

    // Persist to D1
    try {
      await this.env.DB.prepare(
        `INSERT OR IGNORE INTO rooms (id, owner_user_id, owner_ip, workspace_name, created_at, expires_at, max_users, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`
      ).bind(roomId, ownerId, ownerIp, workspaceName, now.toISOString(), expiresAt.toISOString(), maxUsers).run();
    } catch {
      // Room may already exist from a previous session
    }

    // Persist to KV
    const kvTtl = ttlHours * 3600;
    await this.env.KV.put(`room:${roomId}:state`, JSON.stringify(this.roomState), {
      expirationTtl: kvTtl,
    });

    // Set first alarm check
    this.state.storage.setAlarm(Date.now() + 5 * 60 * 1000);
  }

  private getCollaboratorLimit(tier: 'guest' | 'free' | 'pro'): number {
    if (tier === 'pro') return ABSOLUTE_MAX_USERS;
    if (tier === 'free') return 3;
    return 1;
  }

  private async getOwnerTier(ownerId: string | null): Promise<'guest' | 'free' | 'pro'> {
    if (!ownerId) return 'guest';
    try {
      const user = await this.env.DB.prepare(`SELECT tier FROM users WHERE id = ?`)
        .bind(ownerId).first<{ tier: string }>();
      return user?.tier === 'pro' || user?.tier === 'team' ? 'pro' : 'free';
    } catch {
      return 'free';
    }
  }

  private handleDisconnect(ws: WebSocket, announce = true): void {
    const user = this.sessions.get(ws);
    if (!user) return;

    // Recycle color
    this.availableColors.push(user.color);
    this.sessions.delete(ws);
    this.lastPresenceAt.delete(user.connectionId);

    // Broadcast leave
    if (announce) {
      this.broadcast(null, {
        type: 'leave',
        from: user.userId,
        connectionId: user.connectionId,
        serverSeq: this.serverSeq,
      });
    }

    // If room is empty, we let it expire naturally via alarm
  }

  private async closeRoom(reason: string): Promise<void> {
    // Broadcast to all connected clients
    for (const [ws] of this.sessions) {
      try {
        this.sendTo(ws, { type: 'error', code: reason });
        ws.close(1000, reason);
      } catch {}
    }
    this.sessions.clear();

    if (this.roomState) {
      this.roomState.status = 'expired';
      await this.state.storage.put('roomState', this.roomState);
    }
  }

  private async persistRoomState(): Promise<void> {
    if (!this.roomState) return;
    await this.state.storage.put('roomState', this.roomState);
    const ttlSeconds = Math.max(60, Math.floor((new Date(this.roomState.expiresAt).getTime() - Date.now()) / 1000));
    const roomId = this.roomState.roomId;
    if (!roomId) return;
    await this.env.KV.put(`room:${roomId}:state`, JSON.stringify(this.roomState), { expirationTtl: ttlSeconds });
  }

  private async loadRoomState(): Promise<void> {
    if (!this.roomState) {
      this.roomState = await this.state.storage.get<RoomState>('roomState') || null;
    }
  }

  private getUser(ws: WebSocket): UserInfo | null {
    const existing = this.sessions.get(ws);
    if (existing) return existing;
    const attached = ws.deserializeAttachment() as UserInfo | null;
    if (!attached?.userId) return null;
    this.sessions.set(ws, attached);
    return attached;
  }

  private broadcast(sender: WebSocket | null, message: object): void {
    const data = JSON.stringify(message);
    for (const [ws] of this.sessions) {
      if (ws !== sender) {
        try {
          ws.send(data);
        } catch {
          // Dead socket, will be cleaned up on close event
        }
      }
    }
  }

  private sendTo(ws: WebSocket, message: object): void {
    try {
      ws.send(JSON.stringify(message));
    } catch {}
  }
}

function decodeParam(value: string): string {
  try {
    return decodeURIComponent(atob(value));
  } catch {
    try { return decodeURIComponent(value); } catch { return value; }
  }
}

function createCapability(): string {
  return `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll('-', '');
}

function isValidCursor(cursor: unknown): cursor is { x: number; y: number } {
  if (!cursor || typeof cursor !== 'object') return false;
  const value = cursor as { x?: unknown; y?: unknown };
  return typeof value.x === 'number' && Number.isFinite(value.x)
    && typeof value.y === 'number' && Number.isFinite(value.y)
    && Math.abs(value.x) < 10_000_000 && Math.abs(value.y) < 10_000_000;
}

function logKey(seq: number, part: number): string {
  return `log:${String(seq).padStart(12, '0')}:${part}`;
}

/**
 * Accept the upgrade only to report why the join was refused, then close.
 * The socket is never registered as a session, so it takes no seat.
 */
function rejectSocket(code: string, maxUsers?: number): Response {
  const pair = new WebSocketPair();
  const [client, server] = [pair[0], pair[1]];
  server.accept();
  try {
    server.send(JSON.stringify({ type: 'error', code, maxUsers }));
    server.close(REJECT_CLOSE_CODES[code] || 4400, code);
  } catch {}
  return new Response(null, { status: 101, webSocket: client });
}

function isAllowedOrigin(origin: string | null, env: Env): boolean {
  if (!origin) return false;
  try {
    const url = new URL(origin);
    const host = url.hostname;
    const local = host === 'localhost' || host === '127.0.0.1' || host === '::1'
      || host.startsWith('10.') || host.startsWith('192.168.')
      || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
    if (local) return true;
    return origin === env.APP_ORIGIN;
  } catch {
    return false;
  }
}
