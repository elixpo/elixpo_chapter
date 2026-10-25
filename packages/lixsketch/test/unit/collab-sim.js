// Test harness: a simulated room sequencer + network for CollabClient.
// Mirrors the worker protocol (RoomDurableObject): sequence ops, ack the
// sender, broadcast to peers, keep a bounded log for catch-up, dedupe
// resent ops by (clientId, clientSeq).

import { CollabClient } from '../../src/core/collab/CollabClient.js';
import { applyOps, cloneDoc, emptyDoc, Z_KEY } from '../../src/core/collab/OT.js';

export function rng(seed) {
    let s = seed >>> 0 || 1;
    return () => {
        s ^= s << 13; s >>>= 0;
        s ^= s >>> 17;
        s ^= s << 5; s >>>= 0;
        return s / 4294967296;
    };
}

export class Sequencer {
    constructor({ logLimit = Infinity } = {}) {
        this.seq = 0;
        this.log = []; // { serverSeq, clientId, clientSeq, ops }
        this.logLimit = logLimit;
        this.lastClientSeq = new Map();
        this.canonical = emptyDoc(); // raw ops folded in server order
        this.sessions = new Map(); // clientId -> deliver(msg)
    }

    get logFloor() {
        return this.log.length ? this.log[0].serverSeq - 1 : this.seq;
    }

    connect(clientId, deliver) {
        this.sessions.set(clientId, deliver);
    }

    disconnect(clientId) {
        this.sessions.delete(clientId);
    }

    receiveOp(message) {
        const last = this.lastClientSeq.get(message.clientId) || 0;
        if (message.clientSeq <= last) return; // duplicate resend
        this.lastClientSeq.set(message.clientId, message.clientSeq);
        const entry = {
            serverSeq: ++this.seq,
            clientId: message.clientId,
            clientSeq: message.clientSeq,
            ops: JSON.parse(JSON.stringify(message.ops)), // opaque on the wire
        };
        applyOps(this.canonical, entry.ops);
        this.log.push(entry);
        while (this.log.length > this.logLimit) this.log.shift();
        for (const [id, deliver] of this.sessions) {
            if (id === message.clientId) deliver({ kind: 'ack', serverSeq: entry.serverSeq, clientSeq: entry.clientSeq });
            else deliver({ kind: 'op', ...entry });
        }
    }

    catchUp(clientId, since) {
        const last = this.lastClientSeq.get(clientId) || 0;
        if (since < this.logFloor) return { ok: false, seq: this.seq, yourLastClientSeq: last };
        return { ok: true, ops: this.log.filter((e) => e.serverSeq > since), seq: this.seq, yourLastClientSeq: last };
    }
}

/**
 * A client attached to the sequencer through two FIFO queues (up / down)
 * whose delivery is driven by the test (random interleavings).
 */
export class SimClient {
    constructor(id, server, doc = emptyDoc(), seq = 0) {
        this.id = id;
        this.server = server;
        this.client = new CollabClient({ clientId: id, doc, seq });
        this.up = [];
        this.down = [];
        this.online = true;
        server.connect(id, (msg) => this.down.push(msg));
    }

    send(messages) {
        if (this.online) this.up.push(...messages);
    }

    edit(ops) {
        this.send(this.client.submit(ops));
    }

    undo() {
        this.send(this.client.undo());
    }

    redo() {
        this.send(this.client.redo());
    }

    deliverUp() {
        const msg = this.up.shift();
        if (msg) this.server.receiveOp(msg);
        return !!msg;
    }

    deliverDown() {
        const msg = this.down.shift();
        if (!msg) return false;
        const result = msg.kind === 'ack'
            ? this.client.receive({ serverSeq: msg.serverSeq, clientSeq: msg.clientSeq, ack: true })
            : this.client.receive(msg);
        if (result.gap) this.catchUp();
        return true;
    }

    goOffline({ dropUnsent = true } = {}) {
        this.online = false;
        if (dropUnsent) this.up.length = 0;
        this.down.length = 0;
        this.server.disconnect(this.id);
    }

    /** Reconnect: catch up from the log (or snapshot from `peer`), then resend pending. */
    reconnect(peer) {
        // Whatever the old socket still carried arrives before the new connection.
        while (this.up.length) this.deliverUp();
        this.online = true;
        this.server.connect(this.id, (msg) => this.down.push(msg));
        this.catchUp(peer);
        this.send(this.client.pendingMessages());
    }

    catchUp(peer) {
        const res = this.server.catchUp(this.id, this.client.lastSeq);
        if (res.ok) {
            for (const entry of res.ops) this.client.receive({ ...entry });
            return;
        }
        if (!peer) throw new Error('log gap without a peer to snapshot from');
        const snap = cloneDoc(peer.client.confirmed);
        this.client.snapshot(snap, peer.client.lastSeq, res.yourLastClientSeq);
        const again = this.server.catchUp(this.id, this.client.lastSeq);
        if (!again.ok) throw new Error('peer snapshot older than log floor');
        for (const entry of again.ops) this.client.receive({ ...entry });
    }

    idle() {
        return this.up.length === 0 && this.down.length === 0;
    }
}

export function drain(clients, random = Math.random) {
    let guard = 0;
    while (clients.some((c) => !c.idle())) {
        const busy = clients.filter((c) => !c.idle());
        const c = busy[Math.floor(random() * busy.length)];
        if (c.up.length && (random() < 0.5 || !c.down.length)) c.deliverUp();
        else c.deliverDown();
        if (++guard > 1e6) throw new Error('drain did not terminate');
    }
}

const PROP_KEYS = ['x', 'y', 'width', 'options.stroke', 'options.fill', 'options.strokeWidth', 'text'];

/** Random op batch valid against `doc` (as the user would produce through the canvas). */
export function randomOps(doc, random, idPrefix, counter) {
    const ids = Object.keys(doc.shapes);
    const frames = ids.filter((id) => doc.shapes[id].type === 'frame');
    const pick = (list) => list[Math.floor(random() * list.length)];
    const batch = [];
    const count = 1 + Math.floor(random() * 3);
    for (let i = 0; i < count; i += 1) {
        const r = random();
        if (ids.length === 0 || r < 0.2) {
            const id = `${idPrefix}-${counter.n++}`;
            const type = random() < 0.2 ? 'frame' : 'rectangle';
            batch.push({ t: 'create', id, data: { type, x: Math.floor(random() * 100), y: 0, 'options.stroke': '#000', [Z_KEY]: Math.floor(random() * 10) * 1024 } });
            ids.push(id);
            if (type === 'frame') frames.push(id);
        } else if (r < 0.3) {
            batch.push({ t: 'delete', id: pick(ids) });
        } else if (r < 0.75) {
            const set = {};
            const n = 1 + Math.floor(random() * 2);
            for (let k = 0; k < n; k += 1) set[pick(PROP_KEYS)] = random() < 0.1 ? null : Math.floor(random() * 50);
            batch.push({ t: 'update', id: pick(ids), set });
        } else if (r < 0.88) {
            batch.push({ t: 'move', id: pick(ids), z: Math.floor(random() * 20) * 512 });
        } else {
            const set = random() < 0.5
                ? { groupId: random() < 0.3 ? null : `g${Math.floor(random() * 3)}` }
                : { parentFrame: frames.length && random() < 0.7 ? pick(frames) : null };
            batch.push({ t: 'member', id: pick(ids), set });
        }
    }
    return batch;
}

export function seedDoc(n = 4) {
    const doc = emptyDoc();
    for (let i = 0; i < n; i += 1) {
        doc.shapes[`s${i}`] = { type: i === 0 ? 'frame' : 'rectangle', x: i * 10, y: 0, 'options.stroke': '#000', [Z_KEY]: (i + 1) * 1024 };
    }
    return doc;
}
