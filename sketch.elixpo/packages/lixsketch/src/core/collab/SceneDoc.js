/**
 * Bridge between serialized .lixsketch scenes (SceneSerializer.saveScene)
 * and the flat OT document model in OT.js. Pure: no DOM access.
 */

import {
    Z_KEY,
    applyOps,
    compareZ,
    diffRecords,
    emptyDoc,
    orderedIds,
} from './OT.js';

/** Nested objects flattened one level so their keys merge independently. */
const FLATTEN_KEYS = new Set(['options']);
/** Derived on load from the children's `parentFrame`; never stored. */
const DERIVED_KEYS = new Set(['shapeID', 'containedShapeIDs']);

export const Z_STEP = 1024;
const MIN_GAP = 1e-7;

function normalizeValue(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

/** Serialized shape -> flat record (without @z). */
export function flattenShape(shape) {
    const record = {};
    for (const [key, raw] of Object.entries(shape || {})) {
        if (DERIVED_KEYS.has(key)) continue;
        if (raw === null || raw === undefined) continue;
        if (FLATTEN_KEYS.has(key) && typeof raw === 'object' && !Array.isArray(raw)) {
            for (const [sub, subRaw] of Object.entries(raw)) {
                if (subRaw === null || subRaw === undefined) continue;
                const value = normalizeValue(subRaw);
                if (value === undefined) continue;
                record[`${key}.${sub}`] = value;
            }
            continue;
        }
        if (Array.isArray(raw) && raw.length === 0 && key === 'docBlockIds') continue;
        const value = normalizeValue(raw);
        if (value === undefined || value === null) continue;
        record[key] = value;
    }
    return record;
}

/** Flat record -> serialized shape data accepted by SceneSerializer.loadScene. */
export function unflattenRecord(id, record) {
    const shape = { shapeID: id };
    for (const [key, value] of Object.entries(record || {})) {
        if (key === Z_KEY) continue;
        const dot = key.indexOf('.');
        if (dot > 0 && FLATTEN_KEYS.has(key.slice(0, dot))) {
            const outer = key.slice(0, dot);
            shape[outer] = shape[outer] || {};
            shape[outer][key.slice(dot + 1)] = value;
            continue;
        }
        shape[key] = value;
    }
    for (const outer of FLATTEN_KEYS) {
        if (shape[outer] === undefined && (shape.type && outer === 'options')) shape[outer] = {};
    }
    if (!Array.isArray(shape.docBlockIds)) shape.docBlockIds = [];
    if (shape.parentFrame === undefined) shape.parentFrame = null;
    if (shape.groupId === undefined) shape.groupId = null;
    return shape;
}

/** Scene -> { order: [id], records: {id: record} } with membership normalized. */
export function sceneRecords(scene) {
    const order = [];
    const records = {};
    const shapes = Array.isArray(scene?.shapes) ? scene.shapes : [];
    for (const shape of shapes) {
        const id = shape?.shapeID;
        if (!id || records[id]) continue;
        order.push(id);
        records[id] = flattenShape(shape);
    }
    // Frame containment is stored on both sides in the legacy format; the
    // child's parentFrame is the single source of truth in the OT doc.
    for (const shape of shapes) {
        if (shape?.type !== 'frame' || !Array.isArray(shape.containedShapeIDs)) continue;
        for (const childId of shape.containedShapeIDs) {
            const child = records[childId];
            if (child && !child.parentFrame && childId !== shape.shapeID) {
                records[childId] = { ...child, parentFrame: shape.shapeID };
            }
        }
    }
    return { order, records };
}

/** Longest strictly increasing subsequence (by z then id) of existing ids. */
function stableAnchors(order, doc) {
    const candidates = order.filter((id) => doc.shapes[id]);
    const tails = [];
    const tailIdx = [];
    const parent = new Array(candidates.length).fill(-1);
    const less = (i, j) => compareZ(doc.shapes[candidates[i]], candidates[i], doc.shapes[candidates[j]], candidates[j]) < 0;
    for (let i = 0; i < candidates.length; i += 1) {
        let lo = 0;
        let hi = tails.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (less(tailIdx[mid], i)) lo = mid + 1;
            else hi = mid;
        }
        if (lo > 0) parent[i] = tailIdx[lo - 1];
        tails[lo] = candidates[i];
        tailIdx[lo] = i;
    }
    const keep = new Set();
    let k = tailIdx[tails.length - 1];
    while (k !== undefined && k >= 0) {
        keep.add(candidates[k]);
        k = parent[k];
    }
    return keep;
}

function zOf(doc, id) {
    return Number(doc.shapes[id]?.[Z_KEY]) || 0;
}

/**
 * Assign z values so that sorting by (z, id) reproduces `order`, moving as
 * few existing shapes as possible. Returns { [id]: z } for every id.
 */
export function assignZ(order, doc) {
    const keep = stableAnchors(order, doc);
    const z = {};
    let ok = true;
    let i = 0;
    let lo = null;
    while (i < order.length) {
        const id = order[i];
        if (keep.has(id)) {
            z[id] = zOf(doc, id);
            lo = z[id];
            i += 1;
            continue;
        }
        let j = i;
        while (j < order.length && !keep.has(order[j])) j += 1;
        const hi = j < order.length ? zOf(doc, order[j]) : null;
        const count = j - i;
        for (let n = 0; n < count; n += 1) {
            let value;
            if (lo === null && hi === null) value = (n + 1) * Z_STEP;
            else if (lo === null) value = hi - (count - n) * Z_STEP;
            else if (hi === null) value = lo + (n + 1) * Z_STEP;
            else {
                const gap = (hi - lo) / (count + 1);
                if (!(gap > MIN_GAP)) ok = false;
                value = lo + gap * (n + 1);
            }
            z[order[i + n]] = value;
        }
        lo = z[order[j - 1]];
        i = j;
    }
    if (!ok) {
        // Fractional space exhausted: renumber everything.
        order.forEach((id, index) => { z[id] = (index + 1) * Z_STEP; });
    }
    return z;
}

/**
 * Ops that turn `doc` into the state described by a serialized scene.
 * Per-property updates, z-order moves and membership changes are separate
 * ops so they merge with concurrent edits.
 */
export function diffSceneAgainstDoc(doc, scene) {
    const { order, records } = sceneRecords(scene);
    const z = assignZ(order, doc);
    const ops = [];
    for (const id of Object.keys(doc.shapes)) {
        if (!records[id]) ops.push({ t: 'delete', id, data: doc.shapes[id] });
    }
    for (const id of order) {
        const next = { ...records[id], [Z_KEY]: z[id] };
        const current = doc.shapes[id];
        if (!current) ops.push({ t: 'create', id, data: next });
        else ops.push(...diffRecords(id, current, next));
    }
    return ops;
}

export function docFromScene(scene) {
    return applyOps(emptyDoc(), diffSceneAgainstDoc(emptyDoc(), scene));
}

/** OT doc -> scene object for SceneSerializer.loadScene. */
export function docToScene(doc, meta = {}) {
    const ids = orderedIds(doc);
    const present = new Set(ids);
    const children = new Map();
    for (const id of ids) {
        const parent = doc.shapes[id].parentFrame;
        if (parent && parent !== id && present.has(parent) && doc.shapes[parent].type === 'frame') {
            if (!children.has(parent)) children.set(parent, []);
            children.get(parent).push(id);
        }
    }
    const shapes = ids.map((id) => {
        const shape = unflattenRecord(id, doc.shapes[id]);
        // Dangling membership (e.g. frame deleted concurrently) renders top-level.
        if (shape.parentFrame && !children.get(shape.parentFrame)?.includes(id)) shape.parentFrame = null;
        if (shape.type === 'frame') shape.containedShapeIDs = children.get(id) || [];
        return shape;
    });
    return {
        format: 'lixsketch',
        version: 1,
        name: meta.name || 'Untitled',
        createdAt: meta.createdAt || new Date(0).toISOString(),
        viewport: meta.viewport || null,
        zoom: meta.zoom || 1,
        shapes,
    };
}
