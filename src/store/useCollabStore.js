"use client"

import { create } from 'zustand'

const useCollabStore = create((set, get) => ({
  // Connection state
  connected: false,
  connecting: false,
  error: null,
  activeRoomId: null,
  roomId: null,
  connectionId: null,
  myColor: null,
  myRole: 'editor',
  isAdmin: false,
  users: [],       // [{ userId, displayName, avatar, color }]
  presence: {},    // { [connectionId]: { x, y, lastSeen } }
  expiresAt: null,
  adminUserId: null,
  sharingEnabled: true,
  inviteToken: null,
  inviteVersion: 1,
  maxUsers: 5,

  // WebSocket ref (not reactive, just stored)
  ws: null,

  setConnected: (connected) => set({ connected, connecting: false }),
  setConnecting: (connecting) => set({ connecting }),
  setError: (error) => set({ error, connecting: false }),
  startRoom: (roomId) => set({ activeRoomId: roomId, error: null }),
  stopRoom: () => set({ activeRoomId: null, connected: false, connecting: false, ws: null }),
  setRoomInfo: (info) => set({
    roomId: info.roomId,
    connectionId: info.connectionId,
    myColor: info.yourColor,
    myRole: info.role || 'editor',
    isAdmin: !!info.isAdmin,
    users: info.users || [],
    presence: {},
    expiresAt: info.expiresAt,
    adminUserId: info.adminUserId,
    sharingEnabled: info.sharingEnabled !== false,
    inviteToken: info.inviteToken || null,
    inviteVersion: info.inviteVersion || 1,
    maxUsers: Math.min(info.maxUsers || 5, 5),
  }),

  addUser: (user) => set((s) => ({
    users: [...s.users.filter((u) => (u.connectionId || u.userId) !== (user.connectionId || user.userId)), user],
  })),

  removeUser: (connectionId) => set((s) => {
    const presence = { ...s.presence }
    delete presence[connectionId]
    return {
      users: s.users.filter((u) => (u.connectionId || u.userId) !== connectionId),
      presence,
    }
  }),

  // Live cursors (canvas coordinates) keyed by connectionId. Kept apart
  // from `users` so 30 Hz pointer updates don't re-render the user list.
  updatePresence: (connectionId, cursor) => set((s) => {
    const presence = { ...s.presence }
    if (cursor) presence[connectionId] = { x: cursor.x, y: cursor.y, lastSeen: Date.now() }
    else delete presence[connectionId]
    return { presence }
  }),

  updateUserAccess: (userId, role) => set((s) => ({
    users: s.users.map((u) => u.userId === userId ? { ...u, role } : u),
    myRole: s.users.some((u) => u.userId === userId && (u.connectionId || u.userId) === s.connectionId)
      ? role
      : s.myRole,
  })),

  setRoomSettings: (settings) => set((s) => ({
    sharingEnabled: settings.sharingEnabled ?? s.sharingEnabled,
    inviteVersion: settings.inviteVersion ?? s.inviteVersion,
  })),

  setInviteToken: (inviteToken, inviteVersion) => set({ inviteToken, inviteVersion }),

  setWs: (ws) => set({ ws }),

  reset: () => set({
    connected: false,
    connecting: false,
    error: null,
    activeRoomId: null,
    roomId: null,
    connectionId: null,
    myColor: null,
    myRole: 'editor',
    isAdmin: false,
    users: [],
    presence: {},
    expiresAt: null,
    adminUserId: null,
    sharingEnabled: true,
    inviteToken: null,
    inviteVersion: 1,
    maxUsers: 5,
    ws: null,
  }),
}))

export default useCollabStore
