/**
 * Client half of the Jupiter-style protocol plus a per-client undo manager.
 *
 * State:
 *   confirmed  - doc after every op the server has sequenced up to lastSeq
 *                (raw ops applied in server order = canonical state)
 *   pending    - this client's ops that are sent but not yet sequenced
 *   local      - what the user sees: confirmed + pending
 *
 * Incoming server ops are transformed against the raw pending ops (they
 * are earlier in server order than anything still pending), so `local`
 * always equals `confirmed + pending` and every client converges once its
 * pending queue drains. Pending ops themselves are never rewritten: they
 * are already on the wire and every peer applies them verbatim.
 *
 * Undo/redo only ever contain this client's own changes. Each stack entry
 * holds the inverse ops; every remote op that is applied afterwards is
 * transformed into those entries, so undo never reverts a peer's change:
 * a property a peer overwrote later is dropped from my inverse, and edits
 * to a shape a peer deleted become no-ops.
 */

import {
    applyOp,
    applyOps,
    cloneDoc,
    diffDocs,
    emptyDoc,
    invertBatch,
    isNoop,
    materialize,
    materializeAndApply,
    transform,
    transformBatch,
} from './OT.js';
import { diffSceneAgainstDoc } from './SceneDoc.js';

const DEFAULT_MAX_UNDO = 200;
const DEFAULT_MAX_BUFFER = 5000;

function opBytes(op) {
    return JSON.stringify(op).length;
}

/** Split a batch into chunks whose JSON stays under maxBytes (single oversize ops are kept alone). */
export function chunkOps(ops, maxBytes) {
    if (!maxBytes || !Number.isFinite(maxBytes)) return [ops];
    const chunks = [];
    let current = [];
    let size = 2;
    for (const op of ops) {
        const bytes = opBytes(op) + 1;
        if (current.length && size + bytes > maxBytes) {
            chunks.push(current);
            current = [];
            size = 2;
        }
        current.push(op);
        size += bytes;
    }
    if (current.length) chunks.push(current);
    return chunks;
}

export class CollabClient {
    constructor({ clientId, doc = emptyDoc(), seq = 0, maxUndo = DEFAULT_MAX_UNDO, maxMessageBytes = Infinity } = {}) {
        if (!clientId) throw new Error('CollabClient requires a clientId');
        this.clientId = clientId;
        this.maxUndo = maxUndo;
        this.maxMessageBytes = maxMessageBytes;
        this.nextClientSeq = 1;
        this.undoStack = [];
        this.redoStack = [];
        this.reset(doc, seq);
    }

    /** Replace all document state (keeps the clientSeq counter and history). */
    reset(doc = emptyDoc(), seq = 0) {
        this.confirmed = cloneDoc(doc);
        this.local = cloneDoc(doc);
        this.lastSeq = seq;
        this.pending = [];
        this.buffer = new Map();
    }

    get hasPending() {
        return this.pending.length > 0;
    }

    canUndo() {
        return this.undoStack.length > 0;
    }

    canRedo() {
        return this.redoStack.length > 0;
    }

    // --------------------------------------------------------------
    // Local edits
    // --------------------------------------------------------------

    /**
     * Apply a local batch. Returns the wire messages to send (possibly
     * several when the batch is chunked), [] if nothing changed.
     * history: 'record' (normal edit), 'undo', 'redo', or 'none'.
     */
    submit(ops, { history = 'record' } = {}) {
        const applied = materializeAndApply(this.local, ops);
        if (applied.length === 0) return [];
        const inverse = invertBatch(applied);
        if (history === 'record') {
            this.undoStack.push(inverse);
            if (this.undoStack.length > this.maxUndo) this.undoStack.shift();
            this.redoStack.length = 0;
        } else if (history === 'undo') {
            this.redoStack.push(inverse);
        } else if (history === 'redo') {
            this.undoStack.push(inverse);
        }
        const messages = [];
        for (const chunk of chunkOps(applied, this.maxMessageBytes)) {
            const entry = { clientSeq: this.nextClientSeq++, ops: chunk };
            this.pending.push(entry);
            messages.push({ clientId: this.clientId, clientSeq: entry.clientSeq, baseSeq: this.lastSeq, ops: chunk });
        }
        return messages;
    }

    undo() {
        return this._history(this.undoStack, 'undo');
    }

    redo() {
        return this._history(this.redoStack, 'redo');
    }

    _history(stack, kind) {
        while (stack.length) {
            const entry = stack.pop();
            const messages = this.submit(entry, { history: kind });
            if (messages.length) return messages;
            // Entry was emptied by concurrent remote edits; skip it.
        }
        return [];
    }

    /**
     * Drop a pending message that can never be sent (e.g. over the size
     * cap) and rebuild `local` without it. Returns true if it was pending.
     */
    discardPending(clientSeq) {
        const index = this.pending.findIndex((entry) => entry.clientSeq === clientSeq);
        if (index < 0) return false;
        const before = this.local;
        this.pending.splice(index, 1);
        this.local = cloneDoc(this.confirmed);
        for (const entry of this.pending) applyOps(this.local, entry.ops);
        this._transformHistory(diffDocs(before, this.local));
        return true;
    }

    /** Pending ops to (re)send after a reconnect, rebased on lastSeq. */
    pendingMessages() {
        return this.pending.map((entry) => ({
            clientId: this.clientId,
            clientSeq: entry.clientSeq,
            baseSeq: this.lastSeq,
            ops: entry.ops,
        }));
    }

    // --------------------------------------------------------------
    // Server messages
    // --------------------------------------------------------------

    /**
     * Process a sequenced message:
     *   { serverSeq, clientId, clientSeq, ops }        op (mine or a peer's)
     *   { serverSeq, clientSeq, ack: true }            ack of my op
     *   { serverSeq, scene }                           full-scene op (legacy v1 / MCP agent)
     * Out-of-order messages are buffered.
     * Returns { changed, gap, ops } where ops are the transformed ops applied to `local`.
     */
    receive(message) {
        const seq = message?.serverSeq;
        if (!Number.isInteger(seq)) return { changed: false, gap: false, ops: [] };
        if (seq <= this.lastSeq) return { changed: false, gap: false, ops: [] };
        if (seq > this.lastSeq + 1) {
            if (this.buffer.size < DEFAULT_MAX_BUFFER) this.buffer.set(seq, message);
            return { changed: false, gap: true, ops: [] };
        }
        const result = this._process(message);
        if (result.gap) return result;
        // Drain any buffered successors.
        while (this.buffer.has(this.lastSeq + 1)) {
            const next = this.buffer.get(this.lastSeq + 1);
            this.buffer.delete(this.lastSeq + 1);
            const more = this._process(next);
            if (more.gap) return { changed: result.changed || more.changed, gap: true, ops: result.ops.concat(more.ops) };
            result.changed = result.changed || more.changed;
            result.ops = result.ops.concat(more.ops);
        }
        for (const key of this.buffer.keys()) if (key <= this.lastSeq) this.buffer.delete(key);
        return { ...result, gap: this.buffer.size > 0 };
    }

    _process(message) {
        const seq = message.serverSeq;
        const mine = message.ack || (message.clientId === this.clientId && message.clientId);
        if (mine) {
            const head = this.pending[0];
            if (head && head.clientSeq === message.clientSeq) {
                applyOps(this.confirmed, head.ops);
                this.pending.shift();
                this.lastSeq = seq;
                return { changed: false, gap: false, ops: [] };
            }
            if (message.ack) {
                // Ack for an op we no longer track (dropped by a snapshot):
                // its content must come from the server log.
                return { changed: false, gap: true, ops: [] };
            }
            // Our own op from the log that isn't pending any more: apply as remote.
        }

        let ops = message.ops || [];
        if (message.scene) ops = diffSceneAgainstDoc(this.confirmed, message.scene);
        else if (message.doc) ops = diffDocs(this.confirmed, message.doc);
        applyOps(this.confirmed, ops);

        // The remote op is earlier in server order than every pending op.
        // Fold each remote op across the RAW pending ops: those exact ops
        // were sent and will be applied verbatim at their server position,
        // so they must never be rewritten (TP1 then gives
        // confirmed + S + pending == confirmed + pending + S').
        const applied = [];
        for (const remote of ops) {
            let op = remote;
            for (const entry of this.pending) {
                for (const mine of entry.ops) {
                    op = transform(op, mine, false);
                    if (isNoop(op)) break;
                }
                if (isNoop(op)) break;
            }
            const m = materialize(this.local, op);
            if (isNoop(m)) continue;
            applyOp(this.local, m);
            applied.push(m);
        }
        this._transformHistory(applied);
        this.lastSeq = seq;
        return { changed: applied.length > 0, gap: false, ops: applied };
    }

    _transformHistory(remoteOps) {
        if (!remoteOps.length) return;
        // History entries lose any conflict with a peer's newer write.
        const rebase = (stack) => {
            for (let i = 0; i < stack.length; i += 1) {
                stack[i] = transformBatch(stack[i], remoteOps)[0];
            }
        };
        rebase(this.undoStack);
        rebase(this.redoStack);
    }

    /**
     * Install a full snapshot of the confirmed state at `seq` (sync-response
     * fallback). Pending ops the server already sequenced (clientSeq <=
     * serverLastClientSeq) are dropped; the rest are re-applied on top.
     */
    snapshot(doc, seq, serverLastClientSeq = 0) {
        const before = this.local;
        this.confirmed = cloneDoc(doc);
        this.lastSeq = seq;
        this.pending = this.pending.filter((entry) => entry.clientSeq > serverLastClientSeq);
        this.local = cloneDoc(this.confirmed);
        // Unsequenced ops stay byte-for-byte what we will resend.
        for (const entry of this.pending) applyOps(this.local, entry.ops);
        this._transformHistory(diffDocs(before, this.local).filter((op) => !isNoop(op)));
        for (const key of [...this.buffer.keys()]) if (key <= seq) this.buffer.delete(key);
        if (this.buffer.has(this.lastSeq + 1)) {
            const next = this.buffer.get(this.lastSeq + 1);
            this.buffer.delete(this.lastSeq + 1);
            const result = this.receive(next);
            return { ...result, changed: true };
        }
        return { changed: true, gap: this.buffer.size > 0, ops: [] };
    }
}
