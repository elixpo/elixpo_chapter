/**
 * Incremental application of remote (already transformed) OT ops to the
 * live canvas. Only the shapes an op names are touched: other shape
 * instances, their DOM nodes, the selection, an open label editor, the
 * active tool and the camera are left alone.
 *
 * Engine access goes through an `env` object (see engineSceneEnv.js for the
 * browser implementation) so this module stays testable without the DOM:
 *
 *   shapes                         live shape array (window.shapes), mutated in place
 *   createShape(data)              construct one shape from serialized data
 *   removeShapeDom(shape)          detach the shape's DOM (incl. frame clip groups)
 *   placeBefore(shape, nextShape)  move the shape's node before nextShape's (or to the end)
 *   sameLayer(a, b)                a and b's nodes share a parent (svg root / frame clip group)
 *   attachToFrame(shape, frame) / detachFromFrame(shape)
 *   setArrowBinding(arrow, isStart, target|null, binding)
 *   detachArrowsFrom(shape)        arrows bound to a removed shape let go
 *   updateAttachedArrows(shape)
 *   isSelected(shape) / select(shape) / deselect(shape) / refreshSelection(shape)
 *   isEditing(shape) / closeEditor(shape)
 *   isInGesture(shape)             my pointer gesture is moving/resizing/drawing it
 *   redraw(shape, draw)            optional: run `draw` with engine flags set (e.g. multi-selection)
 */

import { orderedIds } from './OT.js';
import { unflattenRecord } from './SceneDoc.js';
import { applyAppearance, readAppearance, syncOpacityToDom } from '../ShapeAppearance.js';
import { readArrowheads, readLineArrowheads } from '../ArrowHeads.js';

// Keys the serializer stores in `options` that constructors copy onto the
// instance (SceneSerializer INSTANCE_OPTION_KEYS). Defaults mirror the
// constructors.
const INSTANCE_OPTION_DEFAULTS = {
    label: '',
    labelColor: undefined,
    labelFontSize: undefined,
    labelBg: true,
    labelOffsetY: 0,
    labelWrap: true,
    shadeColor: null,
    shadeOpacity: 0.15,
    shadeDirection: 'bottom',
    arrowHeadLength: 15,
    arrowHeadAngleDeg: 30,
    elbowX: null,
};

// opacity / edges are top-level appearance keys (ShapeAppearance.js).
const COMMON_KEYS = new Set(['locked', 'link', 'docBlockIds', 'groupId', 'parentFrame', 'type', 'opacity', 'edges']);
const CONTAINER_LABEL_KEYS = new Set(['label', 'labelWrap', 'labelColor', 'labelFontSize', 'width', 'height', 'userWidth', 'userHeight', 'rx', 'ry', 'userRx', 'userRy']);

// Properties each shape type can patch in place. Anything else (e.g. text
// markup, icon markup, image rotation) rebuilds just that one shape.
const PATCHABLE = {
    rectangle: new Set(['x', 'y', 'rotation', ...CONTAINER_LABEL_KEYS]),
    circle: new Set(['x', 'y', 'rotation', ...CONTAINER_LABEL_KEYS]),
    line: new Set(['startPoint', 'endPoint', 'controlPoint', 'isCurved', 'startArrowhead', 'endArrowhead']),
    arrow: new Set([
        'startPoint', 'endPoint', 'controlPoint1', 'controlPoint2',
        'arrowOutlineStyle', 'arrowHeadStyle', 'startArrowhead', 'endArrowhead', 'arrowCurved', 'arrowCurveAmount',
        'startAttachmentID', 'startBinding', 'endAttachmentID', 'endBinding',
    ]),
    freehandStroke: new Set(['points', 'rotation']),
    frame: new Set(['x', 'y', 'width', 'height', 'rotation', 'frameName', 'fillStyle', 'fillColor', 'gridSize', 'gridColor']),
    image: new Set(['x', 'y', 'width', 'height', 'href']),
};

const IMAGE_ATTRS = new Set(['x', 'y', 'width', 'height', 'href']);

function clone(value) {
    return value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value;
}

function liveIndex(env) {
    const map = new Map();
    for (const shape of env.shapes) if (shape?.shapeID) map.set(shape.shapeID, shape);
    return map;
}

function shapeData(id, doc) {
    const record = doc.shapes[id];
    return record ? unflattenRecord(id, record) : null;
}

/** Keys an op writes (flat record keys). */
function writtenKeys(op) {
    if (op.t === 'move') return [];
    return Object.keys(op.set || {});
}

function canPatch(shape, keys) {
    const allowed = PATCHABLE[shape.shapeName] || new Set();
    return keys.every((key) => COMMON_KEYS.has(key) || allowed.has(key) || key.startsWith('options.'));
}

function boundArrows(env, shape) {
    return env.shapes.filter((s) => s && s.shapeName === 'arrow'
        && ((s.attachedToStart && s.attachedToStart.shape === shape)
            || (s.attachedToEnd && s.attachedToEnd.shape === shape)
            || s.startAttachment === shape || s.endAttachment === shape));
}

function readContainerState(shape, data) {
    const state = {
        label: typeof data.label === 'string' ? data.label : '',
        labelWrap: data.labelWrap !== false,
    };
    if (data.labelColor) state.labelColor = data.labelColor;
    if (data.labelFontSize) state.labelFontSize = data.labelFontSize;
    if (shape.shapeName === 'circle') {
        state.userRx = Number.isFinite(data.userRx) ? data.userRx : data.rx;
        state.userRy = Number.isFinite(data.userRy) ? data.userRy : data.ry;
    } else {
        state.userWidth = Number.isFinite(data.userWidth) ? data.userWidth : data.width;
        state.userHeight = Number.isFinite(data.userHeight) ? data.userHeight : data.height;
    }
    return state;
}

export function createSceneApplier(env) {
    /**
     * Apply transformed remote ops (CollabClient.receive().ops) in order.
     * `doc` is the client's local doc AFTER those ops (used for full shape
     * data, z-order and cross-shape references).
     * Returns { affected, deferred, removed }:
     *   affected - ids whose live state changed (re-snapshot them)
     *   deferred - ids skipped because my gesture/editor owns them right now
     *   removed  - ids deleted from the canvas
     */
    function apply(ops, doc) {
        const live = liveIndex(env);
        const affected = new Set();
        const deferred = new Set();
        const removed = new Set();
        const reorder = new Set();

        for (const op of ops || []) {
            if (!op || op.t === 'noop') continue;
            const shape = live.get(op.id);
            switch (op.t) {
                case 'create': {
                    const data = shapeData(op.id, doc) || unflattenRecord(op.id, op.data);
                    const created = shape ? replaceShape(shape, data, live) : createShape(data, live, doc);
                    if (created) {
                        affected.add(op.id);
                        reorder.add(op.id);
                        if (!shape) wireIncomingReferences(created, live, doc, affected);
                    }
                    break;
                }
                case 'delete':
                    if (!shape) break;
                    deleteShape(shape, live, affected);
                    removed.add(op.id);
                    affected.delete(op.id);
                    break;
                case 'move':
                    if (!shape) break;
                    if (env.isInGesture(shape)) { deferred.add(op.id); break; }
                    reorder.add(op.id);
                    affected.add(op.id);
                    break;
                case 'update':
                case 'member': {
                    if (!shape) break;
                    if (env.isInGesture(shape) || env.isEditing(shape)) { deferred.add(op.id); break; }
                    const data = shapeData(op.id, doc);
                    if (!data) break;
                    const keys = writtenKeys(op);
                    if (canPatch(shape, keys)) {
                        patchShape(shape, keys, data, live);
                    } else {
                        replaceShape(shape, data, live);
                        reorder.add(op.id);
                    }
                    affected.add(op.id);
                    break;
                }
                default:
                    break;
            }
        }

        if (reorder.size) applyZOrder(reorder, doc, live);
        for (const id of deferred) affected.delete(id);
        return { affected, deferred, removed };
    }

    function createShape(data, live) {
        const shape = env.createShape(data);
        if (!shape) return null;
        if (!shape.shapeID) shape.shapeID = data.shapeID;
        env.shapes.push(shape);
        live.set(data.shapeID, shape);
        const frame = data.parentFrame && live.get(data.parentFrame);
        if (frame && frame.shapeName === 'frame' && frame !== shape) env.attachToFrame(shape, frame);
        if (shape.shapeName === 'arrow') bindArrowFromData(shape, data, live);
        return shape;
    }

    /** A new shape may be referenced by existing arrows / be a frame with children. */
    function wireIncomingReferences(shape, live, doc, affected) {
        const id = shape.shapeID;
        for (const other of env.shapes) {
            if (!other || other === shape) continue;
            const record = doc.shapes[other.shapeID];
            if (!record) continue;
            if (other.shapeName === 'arrow') {
                if (record.startAttachmentID === id && !(other.attachedToStart && other.attachedToStart.shape === shape)) {
                    env.setArrowBinding(other, true, shape, record.startBinding || null);
                    affected.add(other.shapeID);
                }
                if (record.endAttachmentID === id && !(other.attachedToEnd && other.attachedToEnd.shape === shape)) {
                    env.setArrowBinding(other, false, shape, record.endBinding || null);
                    affected.add(other.shapeID);
                }
            }
            if (shape.shapeName === 'frame' && record.parentFrame === id && other.parentFrame !== shape) {
                env.attachToFrame(other, shape);
                affected.add(other.shapeID);
            }
        }
        if (shape.shapeName === 'arrow' || boundArrows(env, shape).length) env.updateAttachedArrows(shape);
    }

    function bindArrowFromData(arrow, data, live) {
        const start = data.startAttachmentID ? live.get(data.startAttachmentID) : null;
        const end = data.endAttachmentID ? live.get(data.endAttachmentID) : null;
        const currentStart = arrow.attachedToStart?.shape || arrow.startAttachment || null;
        const currentEnd = arrow.attachedToEnd?.shape || arrow.endAttachment || null;
        if (start !== currentStart || (start && data.startBinding)) env.setArrowBinding(arrow, true, start || null, data.startBinding || null);
        if (end !== currentEnd || (end && data.endBinding)) env.setArrowBinding(arrow, false, end || null, data.endBinding || null);
    }

    function deleteShape(shape, live, affected) {
        if (env.isEditing(shape)) env.closeEditor(shape);
        if (env.isSelected(shape)) env.deselect(shape);
        if (shape.shapeName === 'frame') {
            // Children outlive their frame (their parentFrame dangles in the doc).
            for (const child of env.shapes.filter((s) => s && s !== shape && s.parentFrame === shape)) {
                env.detachFromFrame(child);
                affected.add(child.shapeID);
            }
        }
        if (shape.parentFrame) env.detachFromFrame(shape);
        for (const arrow of boundArrows(env, shape)) affected.add(arrow.shapeID);
        env.detachArrowsFrom(shape);
        env.removeShapeDom(shape);
        const index = env.shapes.indexOf(shape);
        if (index >= 0) env.shapes.splice(index, 1);
        live.delete(shape.shapeID);
    }

    /** Rebuild one shape (for properties that can't be patched), keeping its identity in the scene. */
    function replaceShape(old, data, live) {
        const wasSelected = env.isSelected(old);
        if (env.isEditing(old)) env.closeEditor(old);
        if (wasSelected) env.deselect(old);
        const frame = old.parentFrame;
        if (frame) env.detachFromFrame(old);
        const children = old.shapeName === 'frame' ? env.shapes.filter((s) => s && s !== old && s.parentFrame === old) : [];
        for (const child of children) env.detachFromFrame(child);
        const arrows = boundArrows(env, old);

        const fresh = env.createShape(data);
        if (!fresh) return null;
        if (!fresh.shapeID) fresh.shapeID = data.shapeID;
        const index = env.shapes.indexOf(old);
        env.removeShapeDom(old);
        if (index >= 0) env.shapes.splice(index, 1, fresh);
        else env.shapes.push(fresh);
        live.set(data.shapeID, fresh);

        const parent = data.parentFrame ? live.get(data.parentFrame) : frame;
        if (parent && parent.shapeName === 'frame' && parent !== fresh) env.attachToFrame(fresh, parent);
        for (const child of children) env.attachToFrame(child, fresh);
        for (const arrow of arrows) {
            if (arrow.attachedToStart?.shape === old || arrow.startAttachment === old) env.setArrowBinding(arrow, true, fresh, arrow.attachedToStart ? { side: arrow.attachedToStart.side, offset: arrow.attachedToStart.offset } : null);
            if (arrow.attachedToEnd?.shape === old || arrow.endAttachment === old) env.setArrowBinding(arrow, false, fresh, arrow.attachedToEnd ? { side: arrow.attachedToEnd.side, offset: arrow.attachedToEnd.offset } : null);
        }
        if (fresh.shapeName === 'arrow') bindArrowFromData(fresh, data, live);
        env.updateAttachedArrows(fresh);
        if (wasSelected) env.select(fresh);
        return fresh;
    }

    function patchShape(shape, keys, data, live) {
        const type = shape.shapeName;
        let containerLabel = false;
        let bindings = false;
        let appearance = false;
        for (const key of keys) {
            if (key.startsWith('options.')) {
                const name = key.slice(8);
                const value = data.options ? data.options[name] : undefined;
                shape.options = shape.options || {};
                if (value === undefined) delete shape.options[name];
                else shape.options[name] = clone(value);
                if (Object.prototype.hasOwnProperty.call(INSTANCE_OPTION_DEFAULTS, name)
                    && !((type === 'rectangle' || type === 'circle') && (name === 'label' || name === 'labelColor' || name === 'labelFontSize'))) {
                    const fallback = INSTANCE_OPTION_DEFAULTS[name];
                    if (value !== undefined) shape[name] = clone(value);
                    else if (fallback !== undefined) shape[name] = fallback;
                }
                continue;
            }
            switch (key) {
                case 'groupId':
                    shape.groupId = data.groupId || null;
                    break;
                case 'parentFrame': {
                    const target = data.parentFrame ? live.get(data.parentFrame) : null;
                    if (shape.parentFrame && shape.parentFrame !== target) env.detachFromFrame(shape);
                    if (target && target.shapeName === 'frame' && target !== shape && shape.parentFrame !== target) env.attachToFrame(shape, target);
                    break;
                }
                case 'locked':
                    shape.locked = !!data.locked;
                    break;
                case 'link':
                    if (data.link) shape.link = data.link; else delete shape.link;
                    break;
                case 'docBlockIds':
                    shape.docBlockIds = Array.isArray(data.docBlockIds) ? [...data.docBlockIds] : [];
                    break;
                case 'type':
                    break;
                case 'opacity':
                case 'edges':
                    appearance = true;
                    break;
                case 'startArrowhead':
                case 'endArrowhead':
                case 'arrowHeadStyle': {
                    // Patched in place; missing keys fall back like on load
                    // (arrows: none/arrow, lines: none/none).
                    const heads = type === 'line' ? readLineArrowheads(data) : readArrowheads(data);
                    shape.startArrowhead = heads.startArrowhead;
                    shape.endArrowhead = heads.endArrowhead;
                    break;
                }
                case 'startAttachmentID':
                case 'startBinding':
                case 'endAttachmentID':
                case 'endBinding':
                    bindings = true;
                    break;
                default:
                    if (CONTAINER_LABEL_KEYS.has(key) && (type === 'rectangle' || type === 'circle')) {
                        containerLabel = true;
                    } else if (type === 'image' && IMAGE_ATTRS.has(key)) {
                        if (shape.element?.setAttribute) shape.element.setAttribute(key, data[key]);
                        if (key !== 'href') shape[key] = data[key];
                    } else {
                        shape[key] = clone(data[key]);
                    }
            }
        }
        // Set before the redraw so round edges draw with the new outline;
        // missing keys mean the default (opacity 1, sharp).
        if (appearance) applyAppearance(shape, readAppearance({ ...data, type: type }), { redraw: false });
        const redraw = typeof env.redraw === 'function' ? env.redraw : (_shape, draw) => draw();
        redraw(shape, () => {
            if (containerLabel && typeof shape.applyLabelState === 'function') {
                shape.applyLabelState(readContainerState(shape, data)); // redraws
            } else if (typeof shape.draw === 'function') {
                shape.draw();
            }
        });
        if (appearance) syncOpacityToDom(shape);
        if (bindings) bindArrowFromData(shape, data, live);
        if (type === 'frame' && typeof shape.updateClipPath === 'function') shape.updateClipPath();
        env.updateAttachedArrows(shape);
        if (env.isSelected(shape)) env.refreshSelection(shape);
    }

    /** Reorder the shape array and move only the listed shapes' nodes. */
    function applyZOrder(ids, doc, live) {
        const order = orderedIds(doc);
        const rank = new Map(order.map((id, index) => [id, index]));
        const position = (shape) => (rank.has(shape?.shapeID) ? rank.get(shape.shapeID) : Number.MAX_SAFE_INTEGER);
        env.shapes.sort((a, b) => position(a) - position(b));
        for (const id of ids) {
            const shape = live.get(id);
            if (!shape) continue;
            const index = env.shapes.indexOf(shape);
            const next = env.shapes.slice(index + 1).find((other) => env.sameLayer(shape, other)) || null;
            env.placeBefore(shape, next);
        }
    }

    return { apply };
}
