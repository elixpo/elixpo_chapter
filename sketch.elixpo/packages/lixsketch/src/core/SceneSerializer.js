/* eslint-disable */
/**
 * SceneSerializer - Save and load .lixsketch scene files
 *
 * Format: JSON with metadata + serialized shapes array
 * File extension: .lixsketch (actually JSON)
 */

import { Rectangle } from '../shapes/Rectangle.js';
import { Circle } from '../shapes/Circle.js';
import { Line } from '../shapes/Line.js';
import { Arrow } from '../shapes/Arrow.js';
import { FreehandStroke } from '../shapes/FreehandStroke.js';
import { Frame } from '../shapes/Frame.js';
import { normalizeWebEmbedUrl } from './WebEmbedPolicy.js';
import { TextShape } from '../shapes/TextShape.js';
import { CodeShape } from '../shapes/CodeShape.js';
import { ImageShape } from '../shapes/ImageShape.js';
import { IconShape } from '../shapes/IconShape.js';
import { clearUndoHistory, pushCanvasResetAction } from './UndoRedo.js';
import { applyContainerLabel, serializeContainerLabel } from './ShapeLabelState.js';
import { applySerializedAppearance, serializeAppearance } from './ShapeAppearance.js';
import { readArrowheads, readLineArrowheads, serializeLineArrowheads } from './ArrowHeads.js';
import { LIXSKETCH_EXTENSION, LIXSKETCH_MIME_TYPE, formatDiagnostic, sceneFromFileText, sceneToLixSketch } from './LixSketchFormat.js';

const FORMAT_VERSION = 1;
const GZIP_MAGIC = [0x1f, 0x8b];
const SUPPORTED_SHAPE_TYPES = new Set([
    'rectangle', 'circle', 'line', 'arrow', 'freehandStroke',
    'frame', 'text', 'code', 'image', 'icon',
]);

// Generate a unique session ID for each scene
let _sessionID = null;
export function getSessionID() {
    if (!_sessionID) {
        _sessionID = `lx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    }
    return _sessionID;
}
export function resetSessionID() {
    _sessionID = null;
}

// Plain-data deep clone with JSON semantics (drops undefined/functions,
// non-finite numbers become null) but without building an intermediate
// string. Called once per shape on every save, so it is on the hot path.
function clonePlain(value) {
    if (value === null) return null;
    switch (typeof value) {
        case 'number': return Number.isFinite(value) ? value : null;
        case 'string':
        case 'boolean': return value;
        case 'object': {
            if (Array.isArray(value)) {
                const out = new Array(value.length);
                for (let i = 0; i < value.length; i += 1) {
                    const item = clonePlain(value[i]);
                    out[i] = item === undefined ? null : item;
                }
                return out;
            }
            if (typeof value.toJSON === 'function') return JSON.parse(JSON.stringify(value));
            const out = {};
            for (const key in value) {
                if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
                const item = clonePlain(value[key]);
                if (item !== undefined) out[key] = item;
            }
            return out;
        }
        default: return undefined;
    }
}

function cloneOptions(options) {
    return options == null ? {} : clonePlain(options);
}

// outerHTML of the live node is identical to outerHTML of a deep clone, so
// skip the clone (a full subtree copy per text/code/icon shape per save).
function nodeMarkup(node) {
    return node ? node.outerHTML : '';
}

function restoreShapeMetadata(shape, data) {
    if (data.locked) shape.locked = true;
    if (typeof data.link === 'string' && data.link) shape.link = data.link;
    // Opacity / edges; missing fields mean opacity 1 and sharp edges.
    applySerializedAppearance(shape, data);
}

function restoreDocBlockLinks(shape, data) {
    const ids = [...new Set((Array.isArray(data.docBlockIds)
        ? data.docBlockIds
        : (data.docBlockId ? [data.docBlockId] : [])).filter(Boolean))];
    shape.docBlockIds = ids;
    delete shape.docBlockId;
    if (ids.length) {
        (shape.group || shape.element)?.setAttribute('data-doc-block-ids', JSON.stringify(ids));
    }
}

function serializeBinding(attachment, legacyRef) {
    const target = attachment?.shape || legacyRef;
    if (!target || !target.shapeID) return null;
    if (!attachment) return { shapeID: target.shapeID };
    return {
        shapeID: target.shapeID,
        side: attachment.side ?? null,
        offset: attachment.offset ? clonePlain(attachment.offset) : null,
    };
}

// Scenes saved before bindings carried side/offset only stored the target
// id. Infer the side from the saved endpoint (same rule as LixScript's
// autoAttach) so the arrow keeps following the shape after load.
function inferBindingSide(shape, point) {
    if (!point) return 'bottom';
    const cx = shape.shapeName === 'circle' ? (shape.x || 0) : (shape.x || 0) + (shape.width || 0) / 2;
    const cy = shape.shapeName === 'circle' ? (shape.y || 0) : (shape.y || 0) + (shape.height || 0) / 2;
    const dx = point.x - cx;
    const dy = point.y - cy;
    if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
    return dy > 0 ? 'bottom' : 'top';
}

function restoreBinding(arrow, isStart, target, binding) {
    // Real Arrow instances: set the binding directly. The saved endpoint is
    // already the attached point, so no recompute/redraw is needed here —
    // that used to cost one extra arrow render per binding on load.
    if ('attachedToStart' in arrow || 'attachedToEnd' in arrow) {
        const point = isStart ? arrow.startPoint : arrow.endPoint;
        const value = {
            shape: target,
            side: binding?.side ?? inferBindingSide(target, point),
            offset: binding?.offset ? { ...binding.offset } : { x: 0, y: 0 },
        };
        if (isStart) arrow.attachedToStart = value; else arrow.attachedToEnd = value;
        return;
    }
    const setter = isStart ? arrow.setStartAttachment : arrow.setEndAttachment;
    if (typeof setter === 'function') setter.call(arrow, target);
}

// Label / shading / arrowhead state lives on the shape instance (set by
// setLabel(), the sidebars, LixScript), not in `options`, so it used to be
// dropped on save. The constructors read these keys back from `options`,
// so persisting them there restores them on load.
const INSTANCE_OPTION_KEYS = {
    label: (s) => (s.label ? s.label : undefined),
    labelColor: (s) => (s.label && s.labelColor ? s.labelColor : undefined),
    labelFontSize: (s) => (s.label && s.labelFontSize ? s.labelFontSize : undefined),
    labelBg: (s) => (s.labelBg === false ? false : undefined),
    labelOffsetY: (s) => (s.labelOffsetY ? s.labelOffsetY : undefined),
    shadeColor: (s) => (s.shadeColor ? s.shadeColor : undefined),
    shadeOpacity: (s) => (s.shadeColor && s.shadeOpacity !== undefined ? s.shadeOpacity : undefined),
    shadeDirection: (s) => (s.shadeColor && s.shadeDirection ? s.shadeDirection : undefined),
    arrowHeadLength: (s) => (s.shapeName === 'arrow' && Number.isFinite(s.arrowHeadLength) && s.arrowHeadLength !== 15 ? s.arrowHeadLength : undefined),
    arrowHeadAngleDeg: (s) => (s.shapeName === 'arrow' && Number.isFinite(s.arrowHeadAngleDeg) && s.arrowHeadAngleDeg !== 30 ? s.arrowHeadAngleDeg : undefined),
    elbowX: (s) => (s.shapeName === 'arrow' && s.elbowX !== null && s.elbowX !== undefined ? s.elbowX : undefined),
};

// Rectangle/circle labels are persisted top-level by serializeContainerLabel
// (ShapeLabelState.js), which also keeps theme-default label colors unfrozen.
const CONTAINER_LABEL_KEYS = new Set(['label', 'labelColor', 'labelFontSize']);

function shapeOptions(shape) {
    const options = cloneOptions(shape.options);
    const isContainer = shape.shapeName === 'rectangle' || shape.shapeName === 'circle';
    for (const key in INSTANCE_OPTION_KEYS) {
        if (isContainer && CONTAINER_LABEL_KEYS.has(key)) continue;
        const value = INSTANCE_OPTION_KEYS[key](shape);
        if (value !== undefined) options[key] = clonePlain(value);
    }
    return options;
}

// ============================================================
// SERIALIZE a single shape to plain data
// ============================================================
function serializeShape(shape) {
    const base = {
        shapeID: shape.shapeID,
        // Optional many-to-many connections to BlockNote document blocks.
        // Stored with the encrypted scene so navigation survives restore.
        docBlockIds: [...new Set((Array.isArray(shape.docBlockIds)
            ? shape.docBlockIds
            : (shape.docBlockId ? [shape.docBlockId] : [])).filter(Boolean))],
        parentFrame: shape.parentFrame ? shape.parentFrame.shapeID : null,
        // Group membership — null when the shape isn't part of a group.
        // All shapes sharing a non-null groupId move/resize/rotate as a
        // unit (see Selection.handleMultiSelectionMouseDown).
        groupId: shape.groupId || null,
    };
    // Optional editor metadata, persisted only when set.
    if (shape.locked) base.locked = true;
    if (typeof shape.link === 'string' && shape.link) base.link = shape.link;
    Object.assign(base, serializeAppearance(shape));

    switch (shape.shapeName) {
        case 'rectangle':
            return {
                ...base,
                type: 'rectangle',
                x: shape.x, y: shape.y,
                width: shape.width, height: shape.height,
                ...serializeContainerLabel(shape),
                rotation: shape.rotation,
                options: shapeOptions(shape),
            };

        case 'circle':
            return {
                ...base,
                type: 'circle',
                x: shape.x, y: shape.y,
                rx: shape.rx, ry: shape.ry,
                ...serializeContainerLabel(shape),
                rotation: shape.rotation,
                options: shapeOptions(shape),
            };

        case 'line':
            return {
                ...base,
                type: 'line',
                startPoint: { x: shape.startPoint.x, y: shape.startPoint.y },
                endPoint: { x: shape.endPoint.x, y: shape.endPoint.y },
                controlPoint: shape.controlPoint ? { x: shape.controlPoint.x, y: shape.controlPoint.y } : null,
                isCurved: shape.isCurved || false,
                options: shapeOptions(shape),
                ...serializeLineArrowheads(shape),
            };

        case 'arrow': {
            const data = {
                ...base,
                type: 'arrow',
                startPoint: { x: shape.startPoint.x, y: shape.startPoint.y },
                endPoint: { x: shape.endPoint.x, y: shape.endPoint.y },
                options: shapeOptions(shape),
                arrowOutlineStyle: shape.arrowOutlineStyle,
                startArrowhead: shape.startArrowhead || 'none',
                endArrowhead: shape.endArrowhead || 'arrow',
                arrowCurved: shape.arrowCurved,
                arrowCurveAmount: shape.arrowCurveAmount,
            };
            if (shape.controlPoint1) data.controlPoint1 = { x: shape.controlPoint1.x, y: shape.controlPoint1.y };
            if (shape.controlPoint2) data.controlPoint2 = { x: shape.controlPoint2.x, y: shape.controlPoint2.y };
            // Serialize bindings by shapeID. The Arrow class keeps them in
            // `attachedToStart/End` ({ shape, side, offset }); older code
            // paths used `startAttachment/endAttachment` (shape refs).
            const start = serializeBinding(shape.attachedToStart, shape.startAttachment);
            const end = serializeBinding(shape.attachedToEnd, shape.endAttachment);
            if (start) { data.startAttachmentID = start.shapeID; if (start.side != null) data.startBinding = start; }
            if (end) { data.endAttachmentID = end.shapeID; if (end.side != null) data.endBinding = end; }
            return data;
        }

        case 'freehandStroke':
            return {
                ...base,
                type: 'freehandStroke',
                points: clonePlain(shape.points),
                rotation: shape.rotation,
                options: cloneOptions(shape.options),
            };

        case 'frame':
            return {
                ...base,
                type: 'frame',
                x: shape.x, y: shape.y,
                width: shape.width, height: shape.height,
                rotation: shape.rotation,
                frameName: shape.frameName,
                fillStyle: shape.fillStyle || 'transparent',
                fillColor: shape.fillColor || '#1e1e28',
                gridSize: shape.gridSize || 20,
                gridColor: shape.gridColor || 'rgba(255,255,255,0.06)',
                frameType: shape._frameType || null,
                webEmbedURL: shape._frameType === 'web-embed' ? shape._webEmbedURL : null,
                options: cloneOptions(shape.options),
                // Issue #24 bug #10: filter out null / undefined / shapeID-less
                // children. A stale reference would serialize as `null` and the
                // load path would skip it (logging a misleading "missing shape"
                // warning) — but also previously skewed the order tracking.
                containedShapeIDs: shape.containedShapes
                    ? Array.from(shape.containedShapes)
                        .filter(s => s && s.shapeID)
                        .map(s => s.shapeID)
                    : [],
            };

        case 'text': {
            const group = shape.group;
            return {
                ...base,
                type: 'text',
                x: shape.x, y: shape.y,
                rotation: shape.rotation,
                groupHTML: nodeMarkup(group),
            };
        }

        case 'code': {
            const group = shape.group;
            return {
                ...base,
                type: 'code',
                x: shape.x, y: shape.y,
                rotation: shape.rotation,
                groupHTML: nodeMarkup(group),
            };
        }

        case 'image': {
            const el = shape.element;
            return {
                ...base,
                type: 'image',
                x: shape.x, y: shape.y,
                width: shape.width, height: shape.height,
                rotation: shape.rotation,
                href: el.getAttribute('href') || el.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || '',
                sizeBytes: Number(el.__fileSize || el.getAttribute('data-file-size')) || 0,
                cloudinaryId: el.getAttribute('data-cloudinary-id') || null,
                storageProvider: el.getAttribute('data-storage-provider') || 'platform_cloudinary',
                storageCloudName: el.getAttribute('data-storage-cloud-name') || null,
                aiGenerated: el.getAttribute('data-ai-generated') === 'true',
                aiModel: el.getAttribute('data-ai-model') || null,
                frameType: shape._frameType || null,
                graphData: shape._frameType === 'graph' && shape._graphData
                    ? cloneOptions(shape._graphData)
                    : null,
            };
        }

        case 'icon': {
            const el = shape.element;
            return {
                ...base,
                type: 'icon',
                x: shape.x, y: shape.y,
                width: shape.width, height: shape.height,
                rotation: shape.rotation,
                elementHTML: nodeMarkup(el),
                viewboxWidth: parseFloat(el.getAttribute('data-viewbox-width')) || 24,
                viewboxHeight: parseFloat(el.getAttribute('data-viewbox-height')) || 24,
            };
        }

        default:
            console.warn('[SceneSerializer] Unknown shape type:', shape.shapeName);
            return null;
    }
}

// ============================================================
// DESERIALIZE: Create a shape from saved data
// ============================================================
function deserializeShape(data) {
    const svgEl = window.svg;
    if (!svgEl) return null;
    const ns = 'http://www.w3.org/2000/svg';

    switch (data.type) {
        case 'rectangle': {
            const shape = new Rectangle(data.x, data.y, data.width, data.height, data.options || {});
            applyContainerLabel(shape, data);
            if (data.rotation) shape.rotation = data.rotation;
            if (data.shapeID) shape.shapeID = data.shapeID;
            return shape;
        }

        case 'circle': {
            const shape = new Circle(data.x, data.y, data.rx, data.ry, data.options || {});
            applyContainerLabel(shape, data);
            if (data.rotation) shape.rotation = data.rotation;
            if (data.shapeID) shape.shapeID = data.shapeID;
            return shape;
        }

        case 'line': {
            const shape = new Line(data.startPoint, data.endPoint, { ...(data.options || {}), ...readLineArrowheads(data) });
            if (data.controlPoint) shape.controlPoint = data.controlPoint;
            if (data.isCurved) shape.isCurved = data.isCurved;
            if (data.shapeID) shape.shapeID = data.shapeID;
            return shape;
        }

        case 'arrow': {
            // Heads: new start/end keys, or the legacy end-only arrowHeadStyle.
            // Outline style and curve mode go through the constructor: it
            // derives the dash pattern and default control points from them,
            // so scenes without a stored strokeDasharray / control points
            // (DSL, MCP, AI) still load dashed and curved.
            const arrowOpts = { ...(data.options || {}), ...readArrowheads(data) };
            for (const key of ['arrowOutlineStyle', 'arrowCurved', 'arrowCurveAmount', 'controlPoint1', 'controlPoint2']) {
                if (data[key] !== undefined && data[key] !== null) arrowOpts[key] = data[key];
            }
            const shape = new Arrow(data.startPoint, data.endPoint, arrowOpts);
            if (data.shapeID) shape.shapeID = data.shapeID;
            return shape;
        }

        case 'freehandStroke': {
            const shape = new FreehandStroke(data.points, data.options || {});
            if (data.rotation) shape.rotation = data.rotation;
            if (data.shapeID) shape.shapeID = data.shapeID;
            return shape;
        }

        case 'frame': {
            const frameOpts = { ...(data.options || {}), frameName: data.frameName || 'Frame' };
            if (data.fillStyle) frameOpts.fillStyle = data.fillStyle;
            if (data.fillColor) frameOpts.fillColor = data.fillColor;
            if (data.gridSize) frameOpts.gridSize = data.gridSize;
            if (data.gridColor) frameOpts.gridColor = data.gridColor;
            const embedURL = data.frameType === 'web-embed' ? normalizeWebEmbedUrl(data.webEmbedURL) : null;
            if (embedURL) { frameOpts.frameType = 'web-embed'; frameOpts.webEmbedURL = embedURL; }
            const shape = new Frame(data.x, data.y, data.width, data.height, frameOpts);
            if (data.rotation) shape.rotation = data.rotation;
            if (data.shapeID) shape.shapeID = data.shapeID;
            // Frames with an id are redrawn once in loadScene's
            // reconciliation pass after their children are attached;
            // drawing here too doubled the frame render cost on load.
            if (!data.shapeID) shape.draw();
            return shape;
        }

        case 'text': {
            if (!data.groupHTML) return null;
            const parser = new DOMParser();
            const doc = parser.parseFromString(`<svg xmlns="${ns}">${data.groupHTML}</svg>`, 'image/svg+xml');
            const group = doc.querySelector('g');
            if (!group) return null;
            const imported = svgEl.ownerDocument.importNode(group, true);
            svgEl.appendChild(imported);
            const shape = new TextShape(imported);
            if (data.shapeID) shape.shapeID = data.shapeID;
            return shape;
        }

        case 'code': {
            if (!data.groupHTML) return null;
            const parser = new DOMParser();
            const doc = parser.parseFromString(`<svg xmlns="${ns}">${data.groupHTML}</svg>`, 'image/svg+xml');
            const group = doc.querySelector('g');
            if (!group) return null;
            const imported = svgEl.ownerDocument.importNode(group, true);
            svgEl.appendChild(imported);
            const shape = new CodeShape(imported);
            if (data.shapeID) shape.shapeID = data.shapeID;
            return shape;
        }

        case 'image': {
            const imgEl = document.createElementNS(ns, 'image');
            imgEl.setAttribute('x', data.x);
            imgEl.setAttribute('y', data.y);
            imgEl.setAttribute('width', data.width);
            imgEl.setAttribute('height', data.height);
            imgEl.setAttribute('href', data.href);
            imgEl.setAttribute('preserveAspectRatio', 'none');
            if (data.sizeBytes) {
                imgEl.__fileSize = Number(data.sizeBytes) || 0;
                imgEl.setAttribute('data-file-size', String(imgEl.__fileSize));
                window.__roomImageBytesUsed = (window.__roomImageBytesUsed || 0) + imgEl.__fileSize;
            }
            if (data.cloudinaryId) imgEl.setAttribute('data-cloudinary-id', data.cloudinaryId);
            if (data.storageProvider) imgEl.setAttribute('data-storage-provider', data.storageProvider);
            if (data.storageCloudName) imgEl.setAttribute('data-storage-cloud-name', data.storageCloudName);
            if (data.aiGenerated) imgEl.setAttribute('data-ai-generated', 'true');
            if (data.aiModel) imgEl.setAttribute('data-ai-model', data.aiModel);
            svgEl.appendChild(imgEl);
            const shape = new ImageShape(imgEl);
            if (data.rotation) shape.rotation = data.rotation;
            if (data.shapeID) shape.shapeID = data.shapeID;
            if (data.frameType === 'graph' && data.graphData) {
                if (typeof window.__hydrateGraphShape === 'function') {
                    window.__hydrateGraphShape(shape, data.graphData);
                } else {
                    shape._frameType = 'graph';
                    shape._graphData = cloneOptions(data.graphData);
                    shape.element.setAttribute('data-graph-shape', 'true');
                }
            }
            return shape;
        }

        case 'icon': {
            if (!data.elementHTML) return null;
            const parser = new DOMParser();
            // Wrap in <svg> so the parser treats the <g> as a valid child, not a document root
            const doc = parser.parseFromString(`<svg xmlns="${ns}">${data.elementHTML}</svg>`, 'image/svg+xml');
            const iconGroup = doc.querySelector('g');
            if (!iconGroup) return null;
            const imported = svgEl.ownerDocument.importNode(iconGroup, true);
            svgEl.appendChild(imported);
            const shape = new IconShape(imported);
            if (data.shapeID) shape.shapeID = data.shapeID;
            return shape;
        }

        default:
            console.warn('[SceneSerializer] Unknown type:', data.type);
            return null;
    }
}

// ============================================================
// Per-shape API for incremental collaboration (core/collab/SceneApplier.js)
// ============================================================

/** Serialize one live shape (same data saveScene writes for it). */
export function serializeShapeData(shape) {
    return shape ? serializeShape(shape) : null;
}

/**
 * Construct one shape from serialized data, outside a full scene load.
 * Frame containment and arrow bindings are wired by the caller, because
 * they reference other live shapes.
 */
export function createShapeFromData(data) {
    const shape = deserializeShape(data);
    if (!shape) return null;
    if (data.groupId) shape.groupId = data.groupId;
    restoreDocBlockLinks(shape, data);
    restoreShapeMetadata(shape, data);
    // deserializeShape defers frame drawing to loadScene's reconciliation.
    if (shape.shapeName === 'frame' && typeof shape.draw === 'function') {
        try { shape.draw(); } catch (err) { console.warn('[SceneSerializer] frame draw failed:', err); }
    }
    return shape;
}

/** Bind (target) or unbind (target = null) one end of an arrow. */
export function setArrowBinding(arrow, isStart, target, binding = null) {
    if (!arrow) return;
    if (!target) {
        if (typeof arrow.detachFromShape === 'function') arrow.detachFromShape(isStart);
        else if (isStart) { arrow.attachedToStart = null; arrow.startAttachment = null; }
        else { arrow.attachedToEnd = null; arrow.endAttachment = null; }
        return;
    }
    restoreBinding(arrow, isStart, target, binding);
}

// ============================================================
// SAVE: Serialize entire scene to .lixsketch JSON
// ============================================================
export function saveScene(workspaceName = 'Untitled') {
    const allShapes = window.shapes || [];
    const serialized = [];

    // Issue #24 bug #10: rebuild containment from each shape's own
    // `parentFrame` ref before serialising. The `containedShapes` array
    // on the frame side drifts over time (eraser, partial deletes, drag
    // out + drag back, etc.), and a missing entry there means the child
    // gets serialised as a top-level shape and the frame restores empty.
    // Each shape knows its own parent, so we trust THAT and override the
    // frame's array at save time.
    const childrenByFrame = new Map();
    for (const s of allShapes) {
        if (s && s.parentFrame && s.shapeID && s !== s.parentFrame) {
            const arr = childrenByFrame.get(s.parentFrame.shapeID) || [];
            arr.push(s.shapeID);
            childrenByFrame.set(s.parentFrame.shapeID, arr);
        }
    }

    for (const shape of allShapes) {
        const data = serializeShape(shape);
        if (!data) continue;
        if (data.type === 'frame' && shape.shapeID && childrenByFrame.has(shape.shapeID)) {
            const merged = new Set(data.containedShapeIDs || []);
            for (const id of childrenByFrame.get(shape.shapeID)) merged.add(id);
            data.containedShapeIDs = Array.from(merged);
        }
        serialized.push(data);
    }

    const scene = {
        format: 'lixsketch',
        version: FORMAT_VERSION,
        sessionID: getSessionID(),
        name: workspaceName,
        createdAt: new Date().toISOString(),
        viewport: window.currentViewBox ? { ...window.currentViewBox } : null,
        zoom: window.currentZoom || 1,
        shapes: serialized,
    };

    return scene;
}

// ============================================================
// LOAD: Deserialize .lixsketch JSON and recreate scene
// ============================================================
// options.preserveViewport: keep this viewer's zoom/pan (collaboration
// applies peers' changes without moving anyone's camera).
export function loadScene(sceneData, options = {}) {
    const validation = validateScene(sceneData);
    if (!validation.valid) {
        console.error('[SceneSerializer] Invalid scene:', validation.error);
        return false;
    }

    // Clear current scene
    const svgEl = window.svg;
    if (!svgEl) return false;
    window.__roomImageBytesUsed = 0;

    // Remove all existing shape DOM elements
    const existingShapes = window.shapes || [];
    existingShapes.forEach(shape => {
        // For frames, clean up clipGroup and clipPath too
        if (shape.shapeName === 'frame') {
            if (shape.clipGroup && shape.clipGroup.parentNode) {
                shape.clipGroup.parentNode.removeChild(shape.clipGroup);
            }
            if (shape.clipPath && shape.clipPath.parentNode) {
                shape.clipPath.parentNode.removeChild(shape.clipPath);
            }
        }
        if (shape.group && shape.group.parentNode) {
            shape.group.parentNode.removeChild(shape.group);
        } else if (shape.element && shape.element.parentNode) {
            shape.element.parentNode.removeChild(shape.element);
        }
    });

    // Clear arrays IN PLACE — tool modules hold direct references to these
    // arrays from import-time, so replacing them breaks interactivity.
    if (window.shapes) window.shapes.length = 0; else window.shapes = [];
    window.currentShape = null;
    if (window.historyStack) window.historyStack.length = 0; else window.historyStack = [];
    if (window.redoStack) window.redoStack.length = 0; else window.redoStack = [];

    // Build ID -> shape map for frame containment and arrow attachments
    const idMap = new Map();

    // First pass: create all shapes (frames first to allow containment)
    const frameData = sceneData.shapes.filter(s => s.type === 'frame');
    const otherData = sceneData.shapes.filter(s => s.type !== 'frame');

    // Create frames first
    for (const data of frameData) {
        const shape = deserializeShape(data);
        if (shape) {
            // Restore group membership if present.
            if (data.groupId) shape.groupId = data.groupId;
            restoreDocBlockLinks(shape, data);
            restoreShapeMetadata(shape, data);
            window.shapes.push(shape);
            if (data.shapeID) idMap.set(data.shapeID, shape);
        }
    }

    // Create all other shapes
    for (const data of otherData) {
        const shape = deserializeShape(data);
        if (shape) {
            if (data.groupId) shape.groupId = data.groupId;
            restoreDocBlockLinks(shape, data);
            restoreShapeMetadata(shape, data);
            window.shapes.push(shape);
            if (data.shapeID) idMap.set(data.shapeID, shape);
        }
    }

    // Second pass: restore frame containment
    for (const data of frameData) {
        const frame = idMap.get(data.shapeID);
        if (frame && data.containedShapeIDs && data.containedShapeIDs.length > 0) {
            for (const childID of data.containedShapeIDs) {
                const child = idMap.get(childID);
                if (!child) {
                    console.warn(`[SceneSerializer] Frame "${data.frameName}" references missing shape: ${childID}`);
                    continue;
                }
                try {
                    if (typeof frame.addShapeToFrame === 'function') {
                        frame.addShapeToFrame(child);
                    } else {
                        // Fallback: manually set containment
                        frame.containedShapes.push(child);
                        child.parentFrame = frame;
                    }
                } catch (err) {
                    console.warn(`[SceneSerializer] Failed to restore containment for ${childID} in frame ${data.shapeID}:`, err);
                    // Fallback: at least set the reference
                    if (!frame.containedShapes.includes(child)) {
                        frame.containedShapes.push(child);
                    }
                    child.parentFrame = frame;
                }
            }
        }
    }

    // Third pass: restore arrow attachments
    for (const data of sceneData.shapes) {
        if (data.type === 'arrow') {
            const arrow = idMap.get(data.shapeID);
            if (!arrow) continue;
            if (data.startAttachmentID) {
                const target = idMap.get(data.startAttachmentID);
                if (target) restoreBinding(arrow, true, target, data.startBinding);
            }
            if (data.endAttachmentID) {
                const target = idMap.get(data.endAttachmentID);
                if (target) restoreBinding(arrow, false, target, data.endBinding);
            }
        }
    }

    // Shape-array order is the scene's z-order. Frames are constructed first
    // so their clip groups exist before children are attached, but that is an
    // implementation detail and must not change the saved stacking order.
    const restoredInSceneOrder = sceneData.shapes
        .map(data => data.shapeID && idMap.get(data.shapeID))
        .filter(Boolean);
    const restoredSet = new Set(restoredInSceneOrder);
    window.shapes.splice(
        0,
        window.shapes.length,
        ...restoredInSceneOrder,
        ...window.shapes.filter(shape => !restoredSet.has(shape)),
    );

    // ── Fourth pass: frame containment reconciliation (issue #24 bug #10) ──
    //
    // The pass above attaches each child via `frame.addShapeToFrame(child)`,
    // which is supposed to move the child's <g> into the frame's clipGroup.
    // In practice LixScript-rendered scenes were reloading with empty
    // frames — children present in the shapes array, frame box drawn, but
    // the children's <g> elements stranded at the svg root (so visually
    // they look orphaned). The cause varies (transient `isBeingMovedByFrame`
    // flag carried over from save time, ordering glitches when nested
    // frames are restored, etc.). Rather than chase the source, repair the
    // DOM state here from the authoritative `containedShapes` array.
    for (const data of frameData) {
        const frame = idMap.get(data.shapeID);
        if (!frame) continue;

        // Clear stale flags that suppress DOM mutation inside addShapeToFrame.
        delete frame.isBeingMovedByFrame;
        delete frame.isDraggedOutTemporarily;

        // Ensure the frame's own clipGroup is direct child of svg — sub-frames
        // that didn't get re-parented yet are handled in the next loop.
        if (frame.clipGroup && frame.clipGroup.parentNode !== svgEl) {
            svgEl.appendChild(frame.clipGroup);
        }

        for (const child of frame.containedShapes || []) {
            if (!child) continue;
            delete child.isBeingMovedByFrame;
            delete child.isDraggedOutTemporarily;

            const el = child.group || child.element;
            if (el && el.parentNode !== frame.clipGroup) {
                if (el.parentNode) el.parentNode.removeChild(el);
                frame.clipGroup.appendChild(el);
            }
            // Sub-frames also carry their own clipGroup — nest it.
            if (child.shapeName === 'frame' && child.clipGroup
                && child.clipGroup.parentNode !== frame.clipGroup) {
                if (child.clipGroup.parentNode) child.clipGroup.parentNode.removeChild(child.clipGroup);
                frame.clipGroup.appendChild(child.clipGroup);
            }
            // Authoritative parent ref — `addShapeToFrame` should already
            // have set this but the no-op early return when the child was
            // already in containedShapes skips it.
            child.parentFrame = frame;
        }

        // Force the clip rect + visual to match. Some saved frames came
        // through with a stale clipRect from before the resize that lost
        // the children visually.
        if (typeof frame.updateClipPath === 'function') frame.updateClipPath();
        if (typeof frame.draw === 'function') {
            try { frame.draw(); } catch (err) { console.warn('[SceneSerializer] frame redraw failed:', err); }
        }
    }

    // Restore viewport
    if (sceneData.viewport && svgEl && !options.preserveViewport) {
        const vb = sceneData.viewport;
        window.currentViewBox = { ...vb };
        svgEl.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.width} ${vb.height}`);
    }
    if (sceneData.zoom && !options.preserveViewport) {
        window.currentZoom = sceneData.zoom;
    }

    console.log(`[SceneSerializer] Loaded ${window.shapes.length} shapes from "${sceneData.name}"`);
    window.dispatchEvent(new CustomEvent('lix-doc-canvas-links-changed'));

    // Re-sync tool flags so shapes are interactable after restore
    if (window.__sketchEngine && typeof window.__sketchEngine.setActiveTool === 'function') {
        const store = window.__sketchStoreApi;
        const currentTool = store ? store.getState().activeTool : 'select';
        window.__sketchEngine.setActiveTool(currentTool);
    } else {
        // Fallback: ensure selection tool is active
        window.isSelectionToolActive = true;
    }

    return true;
}

// ============================================================
// DOWNLOAD: Trigger browser download of an optimized .lixjson file
// ============================================================
function sceneFileTimestamp(date = new Date()) {
    const iso = date.toISOString();
    return `${iso.slice(0, 10).replace(/-/g, '')}-${iso.slice(11, 19).replace(/:/g, '')}`;
}

function safeWorkspaceFileName(workspaceName) {
    const safe = String(workspaceName || 'Untitled')
        .trim()
        .replace(/[^a-zA-Z0-9_-]+/g, '_')
        .replace(/^_+|_+$/g, '');
    return safe || 'Untitled';
}

export async function encodeSceneFile(scene) {
    const json = JSON.stringify(scene);
    if (typeof CompressionStream === 'undefined') {
        return new Blob([json], { type: 'application/json' });
    }

    const compressed = new Blob([json])
        .stream()
        .pipeThrough(new CompressionStream('gzip'));
    const buffer = await new Response(compressed).arrayBuffer();
    return new Blob([buffer], { type: 'application/vnd.lixsketch.scene+gzip' });
}

export async function decodeSceneFile(buffer) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const isGzip = bytes[0] === GZIP_MAGIC[0] && bytes[1] === GZIP_MAGIC[1];
    if (!isGzip) return new TextDecoder().decode(bytes);
    if (typeof DecompressionStream === 'undefined') {
        throw new Error('This browser cannot open compressed .lixjson files.');
    }

    const decompressed = new Blob([bytes])
        .stream()
        .pipeThrough(new DecompressionStream('gzip'));
    return new Response(decompressed).text();
}

export async function downloadScene(workspaceName = 'Untitled') {
    const scene = saveScene(workspaceName);
    const blob = await encodeSceneFile(scene);
    const url = URL.createObjectURL(blob);
    const fileName = `${safeWorkspaceFileName(workspaceName)}-${sceneFileTimestamp()}.lixjson`;

    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 0);
    return { fileName, sizeBytes: blob.size, compressed: blob.type.includes('gzip') };
}

// ============================================================
// .lixsketch text export / import
// ============================================================

// Scene settings (background/theme/grid) live in the host app's stores; the
// app registers window.__lixsketchSceneSettings (getter) and
// window.__applyLixsketchSceneSettings (setter) to take part in export/import.
function currentSceneSettings() {
    try {
        const settings = typeof window.__lixsketchSceneSettings === 'function' ? window.__lixsketchSceneSettings() : null;
        return settings && typeof settings === 'object' ? settings : null;
    } catch {
        return null;
    }
}

/** Current canvas as `.lixsketch` text. */
export function saveSceneAsLixSketch(workspaceName = 'Untitled') {
    const scene = saveScene(workspaceName);
    const settings = currentSceneSettings();
    if (settings && Object.keys(settings).length) scene.settings = settings;
    return sceneToLixSketch(scene);
}

export function downloadLixSketch(workspaceName = 'Untitled') {
    const text = saveSceneAsLixSketch(workspaceName);
    const blob = new Blob([text], { type: LIXSKETCH_MIME_TYPE });
    const url = URL.createObjectURL(blob);
    const fileName = `${safeWorkspaceFileName(workspaceName)}-${sceneFileTimestamp()}${LIXSKETCH_EXTENSION}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 0);
    return { fileName, sizeBytes: blob.size };
}

export const SCENE_FILE_ACCEPT = '.lixsketch,.lixjson,.json';

export function isSceneFileName(name) {
    return /\.(lixsketch|lixjson|json)$/i.test(String(name || ''));
}

/**
 * Load a `.lixsketch` (DSL text), `.lixjson` (gzip/plain JSON) or `.json`
 * file onto the canvas. Resolves { success, error?, warnings?, validation?, kind? }.
 */
export async function openSceneFile(file) {
    try {
        const text = await decodeSceneFile(await file.arrayBuffer());
        let parsed;
        try {
            parsed = sceneFromFileText(text);
        } catch (err) {
            const message = err?.errors?.length
                ? `${file.name || 'file'}:${formatDiagnostic(err.errors[0])}`
                : (err.message || 'Could not read the file');
            return { success: false, error: message, errors: err?.errors || [] };
        }
        const { scene, warnings = [], kind } = parsed;
        const validation = validateScene(scene);
        if (!validation.valid) return { success: false, error: validation.error };
        resetSessionID(); // New session for loaded scene
        const result = loadScene(scene);
        if (result && scene.settings && typeof window.__applyLixsketchSceneSettings === 'function') {
            try { window.__applyLixsketchSceneSettings(scene.settings); } catch (err) { console.warn('[SceneSerializer] settings apply failed:', err); }
        }
        return { success: result, validation, warnings, kind };
    } catch (err) {
        console.error('[SceneSerializer] Failed to open file:', err);
        return { success: false, error: err.message || 'Failed to open scene file' };
    }
}

// ============================================================
// UPLOAD: Open file picker and load .lixsketch file
// ============================================================
// Validate scene JSON structure before loading
export function validateScene(data) {
    if (!data || typeof data !== 'object') return { valid: false, error: 'Not a valid JSON object' };
    if (data.format !== 'lixsketch') return { valid: false, error: 'Not a LixSketch scene file (missing format field)' };
    if (!data.version || data.version > FORMAT_VERSION) return { valid: false, error: `Unsupported version: ${data.version}` };
    if (!Array.isArray(data.shapes)) return { valid: false, error: 'Invalid scene: missing shapes array' };
    for (let index = 0; index < data.shapes.length; index += 1) {
        const shape = data.shapes[index];
        if (!shape || typeof shape !== 'object' || Array.isArray(shape)) {
            return { valid: false, error: `Invalid shape at index ${index}` };
        }
        if (!SUPPORTED_SHAPE_TYPES.has(shape.type)) {
            return { valid: false, error: `Unsupported shape type at index ${index}: ${String(shape.type)}` };
        }
    }
    return {
        valid: true,
        name: data.name || 'Untitled',
        shapeCount: data.shapes.length,
        sessionID: data.sessionID || null,
        createdAt: data.createdAt || null,
    };
}

export function uploadScene() {
    return new Promise((resolve, reject) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = SCENE_FILE_ACCEPT;
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return resolve(false);
            const result = await openSceneFile(file);
            if (!result.success && result.error) console.error('[SceneSerializer] Invalid file:', result.error);
            resolve(result);
        };
        input.click();
    });
}

// ============================================================
// EXPORT as PNG
// ============================================================
export function exportAsPNG() {
    const svgEl = window.svg;
    if (!svgEl) return;

    const clone = svgEl.cloneNode(true);
    // Remove selection UI elements
    const selectionEls = clone.querySelectorAll('[data-selection], .selection-handle, .resize-handle, .rotation-handle');
    selectionEls.forEach(el => el.remove());

    const svgData = new XMLSerializer().serializeToString(clone);
    const canvas = document.createElement('canvas');
    const vb = svgEl.viewBox.baseVal;
    canvas.width = vb.width * 2; // 2x for retina
    canvas.height = vb.height * 2;
    const ctx = canvas.getContext('2d');
    ctx.scale(2, 2);

    const img = new Image();
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
        // Draw dark background
        ctx.fillStyle = '#121212';
        ctx.fillRect(0, 0, vb.width, vb.height);
        ctx.drawImage(img, 0, 0, vb.width, vb.height);
        URL.revokeObjectURL(url);

        canvas.toBlob(blob => {
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'lixsketch-export.png';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        }, 'image/png');
    };
    img.src = url;
}

// ============================================================
// COPY to clipboard as PNG
// ============================================================
export function copyAsPNG() {
    const svgEl = window.svg;
    if (!svgEl) return;

    const clone = svgEl.cloneNode(true);
    const selectionEls = clone.querySelectorAll('[data-selection], .selection-handle, .resize-handle, .rotation-handle');
    selectionEls.forEach(el => el.remove());

    const svgData = new XMLSerializer().serializeToString(clone);
    const canvas = document.createElement('canvas');
    const vb = svgEl.viewBox.baseVal;
    canvas.width = vb.width * 2;
    canvas.height = vb.height * 2;
    const ctx = canvas.getContext('2d');
    ctx.scale(2, 2);

    const img = new Image();
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
        ctx.fillStyle = '#121212';
        ctx.fillRect(0, 0, vb.width, vb.height);
        ctx.drawImage(img, 0, 0, vb.width, vb.height);
        URL.revokeObjectURL(url);

        canvas.toBlob(blob => {
            if (!blob) return;
            navigator.clipboard.write([
                new ClipboardItem({ 'image/png': blob })
            ]).catch(err => console.warn('[SceneSerializer] Clipboard write failed:', err));
        }, 'image/png');
    };
    img.src = url;
}

// ============================================================
// COPY to clipboard as SVG
// ============================================================
export function copyAsSVG() {
    const svgEl = window.svg;
    if (!svgEl) return;

    const clone = svgEl.cloneNode(true);
    const selectionEls = clone.querySelectorAll('[data-selection], .selection-handle, .resize-handle, .rotation-handle');
    selectionEls.forEach(el => el.remove());

    const svgData = new XMLSerializer().serializeToString(clone);
    navigator.clipboard.writeText(svgData)
        .catch(err => console.warn('[SceneSerializer] Clipboard write failed:', err));
}

// ============================================================
// EXPORT as PDF (uses browser print)
// ============================================================
export function exportAsPDF() {
    const svgEl = window.svg;
    if (!svgEl) return;

    const clone = svgEl.cloneNode(true);
    const selectionEls = clone.querySelectorAll('[data-selection], .selection-handle, .resize-handle, .rotation-handle');
    selectionEls.forEach(el => el.remove());

    const svgData = new XMLSerializer().serializeToString(clone);
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head><title>LixSketch Export</title>
        <style>
            body { margin: 0; background: #121212; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
            svg { max-width: 100vw; max-height: 100vh; }
            @media print { body { background: white; } }
        </style>
        </head>
        <body>${svgData}</body>
        </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 500);
}

// ============================================================
// RESET: Clear the entire canvas
// ============================================================
export function resetCanvas({ undoable = true, clearStorage = true, clearHistory = true, workspaceName = 'Untitled' } = {}) {
    const svgEl = window.svg;
    if (!svgEl) return;

    // Remove all shape DOM elements + frame clipGroups/clipPaths
    const existingShapes = window.shapes || [];
    const resetSnapshot = undoable && existingShapes.length > 0
        ? saveScene(workspaceName)
        : null;
    existingShapes.forEach(shape => {
        if (shape.shapeName === 'frame') {
            if (shape.clipGroup && shape.clipGroup.parentNode) {
                shape.clipGroup.parentNode.removeChild(shape.clipGroup);
            }
            if (shape.clipPath && shape.clipPath.parentNode) {
                shape.clipPath.parentNode.removeChild(shape.clipPath);
            }
        }
        if (shape.group && shape.group.parentNode) {
            shape.group.parentNode.removeChild(shape.group);
        } else if (shape.element && shape.element.parentNode) {
            shape.element.parentNode.removeChild(shape.element);
        }
    });

    // Remove selection UI
    svgEl.querySelectorAll(
        '.selection-outline, .resize-anchor, .rotation-anchor, [data-selection]'
    ).forEach(el => el.remove());

    // Clear arrays IN PLACE (same reason as loadScene)
    if (window.shapes) window.shapes.length = 0; else window.shapes = [];
    window.currentShape = null;
    if (window.historyStack) window.historyStack.length = 0; else window.historyStack = [];
    if (window.redoStack) window.redoStack.length = 0; else window.redoStack = [];

    if (typeof window.clearAllSelections === 'function') {
        window.clearAllSelections();
    }
    if (typeof window.disableAllSideBars === 'function') {
        window.disableAllSideBars();
    }

    if (clearStorage) {
        // Clear auto-save (both legacy and session-scoped keys)
        try {
            localStorage.removeItem('lixsketch-autosave');
            localStorage.removeItem('lixsketch-autosave-meta');
            const sid = window.__sessionID;
            if (sid) {
                localStorage.removeItem(`lixsketch-autosave-${sid}`);
                localStorage.removeItem(`lixsketch-autosave-meta-${sid}`);
            }
        } catch (_) {}
    }

    if (resetSnapshot) {
        pushCanvasResetAction(
            resetSnapshot,
            (snapshot) => loadScene(snapshot),
            () => resetCanvas({ undoable: false, clearStorage: true, clearHistory: false, workspaceName }),
        );
    } else if (clearHistory) {
        clearUndoHistory();
    }

    console.log('[SceneSerializer] Canvas reset');
    if (typeof window.__collabSceneChanged === 'function') {
        window.__collabSceneChanged();
    }
}

// ============================================================
// FIND: Search for text content on the canvas
// ============================================================
export function findTextOnCanvas(query) {
    const allShapes = window.shapes || [];
    if (!query || query.trim() === '') return [];

    const lowerQuery = query.toLowerCase();
    const results = [];

    for (const shape of allShapes) {
        let textContent = '';

        if (shape.shapeName === 'text' || shape.shapeName === 'code') {
            const group = shape.group;
            if (group) {
                // Get all text content from SVG text/tspan elements
                const textEls = group.querySelectorAll('text, tspan');
                textEls.forEach(el => {
                    if (el.textContent) textContent += el.textContent + ' ';
                });
                // Also check foreignObject content
                const foreignEls = group.querySelectorAll('foreignObject *');
                foreignEls.forEach(el => {
                    if (el.textContent) textContent += el.textContent + ' ';
                });
            }
        } else if (shape.shapeName === 'frame') {
            textContent = shape.frameName || '';
        }

        textContent = textContent.trim();
        if (textContent && textContent.toLowerCase().includes(lowerQuery)) {
            results.push({
                shape,
                text: textContent,
                type: shape.shapeName,
                x: shape.x || 0,
                y: shape.y || 0,
            });
        }
    }

    return results;
}

// ============================================================
// Initialize bridge for React components
// ============================================================
export function initSceneSerializer() {
    window.__sceneSerializer = {
        save: saveScene,
        load: loadScene,
        download: downloadScene,
        downloadLixSketch,
        toLixSketch: saveSceneAsLixSketch,
        openFile: openSceneFile,
        isSceneFile: isSceneFileName,
        upload: uploadScene,
        exportPNG: exportAsPNG,
        exportPDF: exportAsPDF,
        copyAsPNG,
        copyAsSVG,
        resetCanvas,
        findText: findTextOnCanvas,
        // Per-shape API used by live collaboration's incremental applier.
        createShape: createShapeFromData,
        serializeShape: serializeShapeData,
        setArrowBinding,
    };
}
