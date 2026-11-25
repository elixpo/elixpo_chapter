/**
 * Scene-level operational transformation for LixSketch rooms.
 *
 * The collaboration worker only sequences opaque (end-to-end encrypted)
 * payloads, so every client runs the transformation itself. The model is
 * the classic Jupiter / Google Wave client <-> server shape with a single
 * total order: the worker assigns each op a server sequence number and that
 * order is the canonical history.
 *
 * Document model (plain JSON, no DOM):
 *   doc = { shapes: { [shapeId]: record } }
 *   record = flat object of shape properties. Nested `options` keys are
 *   flattened to `options.<key>` so concurrent edits to different style
 *   properties merge. Z-order lives in the reserved key `@z` (fractional
 *   number; ties broken by shape id). Group / frame membership lives in the
 *   `groupId` / `parentFrame` keys.
 *
 * Records and values are treated as immutable: applyOp replaces a record
 * instead of mutating it, so two docs may share records safely.
 *
 * Operations:
 *   { t: 'noop' }
 *   { t: 'create', id, data }                 data = full record (incl. @z)
 *   { t: 'delete', id, data }                 data = snapshot for the inverse
 *   { t: 'update', id, set: {k: v}, prev: {k: v} }   v === null removes k
 *   { t: 'move',   id, z, prevZ }             z-order change
 *   { t: 'member', id, set, prev }            groupId / parentFrame only
 *
 * Conflict policy: the op that is LATER in server order wins on the same
 * target (same shape for create/delete, same property for update / move /
 * member). Applying the raw ops in server order is therefore the canonical
 * state; transform() is what lets a client that applied its own pending ops
 * first reach exactly that state.
 */

export const Z_KEY = '@z';
export const MEMBER_KEYS = Object.freeze(['groupId', 'parentFrame']);
export const PROTOCOL_VERSION = 2;

const NOOP = Object.freeze({ t: 'noop' });

export function noop() {
    return NOOP;
}

export function isNoop(op) {
    return !op || op.t === 'noop';
}

export function emptyDoc() {
    return { shapes: {} };
}

/** Shallow structural copy: records are shared (they are never mutated). */
export function cloneDoc(doc) {
    return { shapes: { ...(doc?.shapes || {}) } };
}

// ------------------------------------------------------------------
// Value helpers
// ------------------------------------------------------------------

export function stableStringify(value) {
    if (value === undefined) return 'null';
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

export function valuesEqual(a, b) {
    if (a === b) return true;
    if (a == null || b == null) return (a ?? null) === (b ?? null);
    if (typeof a !== 'object' || typeof b !== 'object') return false;
    return stableStringify(a) === stableStringify(b);
}

/** Canonical form for comparing docs in tests and debugging. */
export function canonicalDoc(doc) {
    const ids = Object.keys(doc?.shapes || {}).sort();
    const out = {};
    for (const id of ids) out[id] = JSON.parse(stableStringify(doc.shapes[id]));
    return stableStringify(out);
}

export function docsEqual(a, b) {
    return canonicalDoc(a) === canonicalDoc(b);
}

/** Shape ids in z-order (bottom first). */
export function orderedIds(doc) {
    return Object.keys(doc.shapes).sort((a, b) => compareZ(doc.shapes[a], a, doc.shapes[b], b));
}

export function compareZ(recA, idA, recB, idB) {
    const za = Number(recA?.[Z_KEY]) || 0;
    const zb = Number(recB?.[Z_KEY]) || 0;
    if (za !== zb) return za < zb ? -1 : 1;
    return idA < idB ? -1 : idA > idB ? 1 : 0;
}

// ------------------------------------------------------------------
// Op introspection
// ------------------------------------------------------------------

function isPropOp(op) {
    return op.t === 'update' || op.t === 'move' || op.t === 'member';
}

/** The property writes an update/move/member op performs. */
export function setOf(op) {
    if (op.t === 'move') return { [Z_KEY]: op.z };
    if (op.t === 'update' || op.t === 'member') return op.set || {};
    return {};
}

function withSet(op, set, prev) {
    const keys = Object.keys(set);
    if (keys.length === 0) return NOOP;
    if (op.t === 'move') {
        return { t: 'move', id: op.id, z: set[Z_KEY], prevZ: prev[Z_KEY] ?? null };
    }
    return { t: op.t, id: op.id, set, prev };
}

function prevOf(op) {
    if (op.t === 'move') return { [Z_KEY]: op.prevZ ?? null };
    return op.prev || {};
}

function patchRecord(record, set) {
    const next = { ...(record || {}) };
    for (const [key, value] of Object.entries(set)) {
        if (value === null || value === undefined) delete next[key];
        else next[key] = value;
    }
    return next;
}

// ------------------------------------------------------------------
// Apply
// ------------------------------------------------------------------

/**
 * Apply one op to `doc` (mutates doc.shapes, never a record). Ops are
 * tolerant: updating or deleting a missing shape is a no-op, create
 * overwrites. That tolerance is what makes "raw ops in server order" a
 * well-defined canonical state.
 */
export function applyOp(doc, op) {
    if (isNoop(op)) return doc;
    const shapes = doc.shapes;
    switch (op.t) {
        case 'create':
            shapes[op.id] = { ...(op.data || {}) };
            break;
        case 'delete':
            delete shapes[op.id];
            break;
        case 'update':
        case 'move':
        case 'member':
            if (shapes[op.id]) shapes[op.id] = patchRecord(shapes[op.id], setOf(op));
            break;
        default:
            throw new Error(`Unknown op type: ${op.t}`);
    }
    return doc;
}

export function applyOps(doc, ops) {
    for (const op of ops || []) applyOp(doc, op);
    return doc;
}

/**
 * Fill an op's inverse information (prev values / delete snapshot) from the
 * document it is about to be applied to. Ops targeting a missing shape
 * become no-ops (except create).
 */
export function materialize(doc, op) {
    if (isNoop(op)) return NOOP;
    const record = doc.shapes[op.id];
    switch (op.t) {
        case 'create':
            return { t: 'create', id: op.id, data: { ...(op.data || {}) } };
        case 'delete':
            if (!record) return NOOP;
            return { t: 'delete', id: op.id, data: record };
        case 'update':
        case 'member': {
            if (!record) return NOOP;
            const set = {};
            const prev = {};
            for (const [key, value] of Object.entries(op.set || {})) {
                if (op.t === 'member' && !MEMBER_KEYS.includes(key)) continue;
                const next = value === undefined ? null : value;
                const before = record[key] ?? null;
                if (valuesEqual(before, next)) continue;
                set[key] = next;
                prev[key] = before;
            }
            return withSet(op, set, prev);
        }
        case 'move': {
            if (!record) return NOOP;
            const before = record[Z_KEY] ?? null;
            if (before === op.z) return NOOP;
            return { t: 'move', id: op.id, z: op.z, prevZ: before };
        }
        default:
            throw new Error(`Unknown op type: ${op.t}`);
    }
}

/** Materialize a batch against `doc`, applying it as it goes. Returns the materialized ops (no-ops dropped). */
export function materializeAndApply(doc, ops) {
    const out = [];
    for (const op of ops || []) {
        const m = materialize(doc, op);
        if (isNoop(m)) continue;
        applyOp(doc, m);
        out.push(m);
    }
    return out;
}

// ------------------------------------------------------------------
// Invert
// ------------------------------------------------------------------

export function invert(op) {
    if (isNoop(op)) return NOOP;
    switch (op.t) {
        case 'create':
            return { t: 'delete', id: op.id, data: op.data };
        case 'delete':
            if (!op.data) return NOOP;
            return { t: 'create', id: op.id, data: op.data };
        case 'update':
        case 'member':
            return { t: op.t, id: op.id, set: { ...(op.prev || {}) }, prev: { ...(op.set || {}) } };
        case 'move':
            if (op.prevZ === null || op.prevZ === undefined) return NOOP;
            return { t: 'move', id: op.id, z: op.prevZ, prevZ: op.z };
        default:
            throw new Error(`Unknown op type: ${op.t}`);
    }
}

export function invertBatch(ops) {
    return (ops || []).slice().reverse().map(invert).filter((op) => !isNoop(op));
}

// ------------------------------------------------------------------
// Transform
// ------------------------------------------------------------------

/**
 * transform(a, b, aIsLater) -> a'
 *
 * a and b were produced against the same document state. Returns a' such
 * that applying b then a' has the effect of applying a and b in server
 * order (b before a when aIsLater, a before b otherwise).
 *
 * Pair table (same shape id; different ids never interact):
 *   create  vs create  : later wins (earlier -> noop; uuids make this rare)
 *   create  vs delete  : later wins
 *   create  vs prop op : later create keeps; earlier create absorbs b's writes
 *   delete  vs create  : later wins
 *   delete  vs delete  : noop (already gone)
 *   delete  vs prop op : delete stays; snapshot absorbs b's writes
 *   prop op vs create  : later prop op keeps; earlier one -> noop (overwritten)
 *   prop op vs delete  : noop (shape is gone in both orders)
 *   prop op vs prop op : per-property; disjoint keys both apply, shared keys
 *                        go to the later op (its prev becomes b's value)
 */
export function transform(a, b, aIsLater) {
    if (isNoop(a)) return NOOP;
    if (isNoop(b) || a.id !== b.id) return a;

    if (a.t === 'create') {
        if (b.t === 'create' || b.t === 'delete') return aIsLater ? a : NOOP;
        // b is a property write on the same id
        if (aIsLater) return a;
        return { t: 'create', id: a.id, data: patchRecord(a.data, setOf(b)) };
    }

    if (a.t === 'delete') {
        if (b.t === 'create') return aIsLater ? a : NOOP;
        if (b.t === 'delete') return NOOP;
        return { t: 'delete', id: a.id, data: a.data ? patchRecord(a.data, setOf(b)) : a.data };
    }

    if (isPropOp(a)) {
        if (b.t === 'delete') return NOOP;
        if (b.t === 'create') return aIsLater ? a : NOOP;
        const bSet = setOf(b);
        const aSet = setOf(a);
        const aPrev = prevOf(a);
        const set = {};
        const prev = {};
        for (const key of Object.keys(aSet)) {
            if (Object.prototype.hasOwnProperty.call(bSet, key)) {
                if (!aIsLater) continue; // b overwrites it later in server order
                set[key] = aSet[key];
                prev[key] = bSet[key] ?? null; // b ran first, so that's what a replaces
            } else {
                set[key] = aSet[key];
                prev[key] = aPrev[key] ?? null;
            }
        }
        return withSet(a, set, prev);
    }

    throw new Error(`Unknown op type: ${a.t}`);
}

/**
 * Transform two concurrent batches (classic OT grid).
 * `earlier` is ordered before `later` in server order.
 * Returns [earlier', later'] where earlier' applies after `later` and
 * later' applies after `earlier`.
 */
export function transformBatch(earlier, later) {
    let left = (earlier || []).slice();
    const laterOut = [];
    for (const original of later || []) {
        let right = original;
        const nextLeft = [];
        for (const x of left) {
            const x2 = transform(x, right, false);
            const r2 = transform(right, x, true);
            nextLeft.push(x2);
            right = r2;
        }
        left = nextLeft.filter((op) => !isNoop(op));
        if (!isNoop(right)) laterOut.push(right);
    }
    return [left, laterOut];
}

// ------------------------------------------------------------------
// Diff
// ------------------------------------------------------------------

/** Ops that turn doc `from` into doc `to` (materialized). */
export function diffDocs(from, to) {
    const ops = [];
    const a = from.shapes;
    const b = to.shapes;
    for (const id of Object.keys(a)) {
        if (!b[id]) ops.push({ t: 'delete', id, data: a[id] });
    }
    for (const id of Object.keys(b)) {
        if (!a[id]) {
            ops.push({ t: 'create', id, data: b[id] });
            continue;
        }
        ops.push(...diffRecords(id, a[id], b[id]));
    }
    return ops;
}

export function diffRecords(id, before, after) {
    const ops = [];
    const set = {};
    const prev = {};
    const memberSet = {};
    const memberPrev = {};
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of keys) {
        const x = before[key] ?? null;
        const y = after[key] ?? null;
        if (valuesEqual(x, y)) continue;
        if (key === Z_KEY) {
            ops.push({ t: 'move', id, z: y, prevZ: x });
        } else if (MEMBER_KEYS.includes(key)) {
            memberSet[key] = y;
            memberPrev[key] = x;
        } else {
            set[key] = y;
            prev[key] = x;
        }
    }
    if (Object.keys(set).length) ops.unshift({ t: 'update', id, set, prev });
    if (Object.keys(memberSet).length) ops.push({ t: 'member', id, set: memberSet, prev: memberPrev });
    return ops;
}
