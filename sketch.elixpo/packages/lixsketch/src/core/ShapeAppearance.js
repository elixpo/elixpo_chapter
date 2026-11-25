/* eslint-disable */
/**
 * Shape appearance shared by every shape type: opacity (all shapes) and
 * edges (sharp / round, for rectangles and frames).
 *
 * Both live on the shape instance (`shape.opacity`, `shape.edges`) and are
 * persisted top-level in serialized data, omitted at their defaults so old
 * scenes and new scenes with default appearance stay identical:
 *   opacity: 1      (stored only when < 1)
 *   edges:  'sharp' (stored only when 'round')
 *
 * Used by SceneSerializer (save/load + collaboration snapshots), CopyPaste
 * (copy/paste/duplicate), UndoRedo (appearanceChange), CanvasCommands
 * (copy/paste styles) and the sidebars. Geometry helpers for rounded
 * rectangles live here too so rendering and arrow attachment agree.
 */

export const DEFAULT_OPACITY = 1;
export const EDGE_TYPES = ['sharp', 'round'];
export const ROUNDABLE_TYPES = new Set(['rectangle', 'frame']);

// Excalidraw's adaptive radius: 25% of the shorter side, capped at 32px.
export const ADAPTIVE_RADIUS = 32;
export const PROPORTIONAL_RADIUS = 0.25;

// Selection / editing chrome that lives inside a shape's group but must not
// fade with the shape.
const CONTROL_CLASSES = [
    'anchor', 'rotate-anchor', 'rotation-anchor', 'resize-anchor', 'resize-handle',
    'selection-outline', 'selection-sub-outline', 'attachment-indicator',
    'attachment-preview', 'upload-indicator', 'selection-box', 'ai-image-badge',
];

// Opacity for the next shape the user draws (last value picked in the
// properties panel, like Excalidraw). Applied when a new shape is committed.
let nextShapeOpacity = DEFAULT_OPACITY;

export function getNextShapeOpacity() {
    return nextShapeOpacity;
}

export function setNextShapeOpacity(value) {
    nextShapeOpacity = normalizeOpacity(value);
    return nextShapeOpacity;
}

/**
 * Give a newly created shape its appearance defaults. Shapes that already
 * carry an opacity (pasted, duplicated, scripted) keep it.
 */
export function initNewShapeAppearance(shape) {
    if (!shape || typeof shape !== 'object') return shape;
    if (shape.opacity === undefined) {
        return applyAppearance(shape, { opacity: nextShapeOpacity });
    }
    return applyAppearance(shape, {});
}

/** Opacity in [0, 1]. Accepts 0–1 or a 0–100 percentage; invalid → 1. */
export function normalizeOpacity(value) {
    let n = typeof value === 'string' && value.trim().endsWith('%')
        ? parseFloat(value) / 100
        : Number(value);
    if (value === null || value === undefined || value === '' || !Number.isFinite(n)) return DEFAULT_OPACITY;
    if (n > 1) n /= 100;
    n = Math.min(1, Math.max(0, n));
    return Math.round(n * 100) / 100;
}

export function normalizeEdges(value) {
    return value === 'round' || value === true ? 'round' : 'sharp';
}

export function supportsEdges(shapeOrType) {
    const type = typeof shapeOrType === 'string' ? shapeOrType : (shapeOrType?.shapeName || shapeOrType?.type);
    return ROUNDABLE_TYPES.has(type);
}

/** Current appearance of a live shape. */
export function captureAppearance(shape) {
    const state = { opacity: normalizeOpacity(shape?.opacity) };
    if (supportsEdges(shape)) state.edges = normalizeEdges(shape?.edges);
    return state;
}

/** Serialized fields (defaults omitted). */
export function serializeAppearance(shape) {
    const out = {};
    const opacity = normalizeOpacity(shape?.opacity);
    if (opacity !== DEFAULT_OPACITY) out.opacity = opacity;
    if (supportsEdges(shape) && normalizeEdges(shape?.edges) === 'round') out.edges = 'round';
    return out;
}

/** Appearance from serialized data; missing fields mean defaults. */
export function readAppearance(data) {
    const state = { opacity: normalizeOpacity(data?.opacity) };
    if (supportsEdges(data)) state.edges = normalizeEdges(data?.edges);
    return state;
}

function hasControlClass(el) {
    const cls = el.getAttribute ? (el.getAttribute('class') || '') : '';
    if (!cls) return false;
    return CONTROL_CLASSES.some((name) => cls.split(/\s+/).includes(name) || cls.startsWith('multi-selection'));
}

/**
 * Write the shape's opacity onto its rendered content. Applied per child of
 * the shape group (not on the group itself) so selection handles stay fully
 * visible; a MutationObserver re-applies it when draw() swaps elements.
 */
export function syncOpacityToDom(shape) {
    const group = shape?.group;
    if (!group || !group.children) return;
    const opacity = normalizeOpacity(shape.opacity);
    for (const child of Array.from(group.children)) {
        if (typeof child.getAttribute !== 'function' || typeof child.setAttribute !== 'function') continue;
        if (hasControlClass(child)) {
            if (child.getAttribute('data-lix-opacity') !== null) {
                child.removeAttribute('opacity');
                child.removeAttribute('data-lix-opacity');
            }
            continue;
        }
        if (opacity === DEFAULT_OPACITY) {
            // Only clear what we set; renderers may use their own opacity.
            if (child.getAttribute('data-lix-opacity') !== null) {
                const own = child.getAttribute('data-lix-own-opacity');
                if (own !== null) child.setAttribute('opacity', own);
                else child.removeAttribute('opacity');
                child.removeAttribute('data-lix-opacity');
                child.removeAttribute('data-lix-own-opacity');
            }
            continue;
        }
        if (child.getAttribute('data-lix-opacity') === null) {
            const own = child.getAttribute('opacity');
            if (own !== null) child.setAttribute('data-lix-own-opacity', own);
        }
        const own = Number(child.getAttribute('data-lix-own-opacity'));
        const base = child.getAttribute('data-lix-own-opacity') !== null && Number.isFinite(own) ? own : 1;
        const value = String(Math.round(base * opacity * 1000) / 1000);
        if (child.getAttribute('opacity') !== value) child.setAttribute('opacity', value);
        if (child.getAttribute('data-lix-opacity') !== String(opacity)) child.setAttribute('data-lix-opacity', String(opacity));
    }
}

function watchOpacity(shape) {
    if (typeof MutationObserver === 'undefined' || !shape?.group) return;
    const opacity = normalizeOpacity(shape.opacity);
    if (opacity === DEFAULT_OPACITY) {
        if (shape._opacityObserver) {
            shape._opacityObserver.disconnect();
            shape._opacityObserver = null;
        }
        return;
    }
    if (shape._opacityObserver) return;
    shape._opacityObserver = new MutationObserver(() => syncOpacityToDom(shape));
    shape._opacityObserver.observe(shape.group, { childList: true });
}

/**
 * Apply an appearance state to a live shape and re-render as needed.
 * Unknown / missing fields keep their current value.
 */
export function applyAppearance(shape, state = {}, { redraw = true } = {}) {
    if (!shape) return shape;
    let needsDraw = false;
    if (state.opacity !== undefined) shape.opacity = normalizeOpacity(state.opacity);
    else if (shape.opacity === undefined) shape.opacity = DEFAULT_OPACITY;
    if (supportsEdges(shape)) {
        const next = state.edges !== undefined ? normalizeEdges(state.edges) : normalizeEdges(shape.edges);
        if (next !== shape.edges) needsDraw = shape.edges !== undefined || next === 'round';
        shape.edges = next;
    }
    if (needsDraw && redraw && typeof shape.draw === 'function') shape.draw();
    syncOpacityToDom(shape);
    watchOpacity(shape);
    return shape;
}

/** Apply serialized appearance (missing fields reset to defaults). */
export function applySerializedAppearance(shape, data) {
    return applyAppearance(shape, readAppearance({ ...data, type: data?.type || shape?.shapeName }));
}

export function appearanceEquals(a, b) {
    return normalizeOpacity(a?.opacity) === normalizeOpacity(b?.opacity)
        && normalizeEdges(a?.edges) === normalizeEdges(b?.edges);
}

// ── Rounded rectangle geometry ───────────────────────────────────────

/** Corner radius for a w×h rectangle with round edges (Excalidraw adaptive). */
export function adaptiveRadius(width, height) {
    const side = Math.min(Math.abs(Number(width) || 0), Math.abs(Number(height) || 0));
    if (side <= 0) return 0;
    const cutoff = ADAPTIVE_RADIUS / PROPORTIONAL_RADIUS;
    return side <= cutoff ? side * PROPORTIONAL_RADIUS : ADAPTIVE_RADIUS;
}

export function cornerRadiusFor(shape) {
    if (!supportsEdges(shape) || normalizeEdges(shape?.edges) !== 'round') return 0;
    return adaptiveRadius(shape.width, shape.height);
}

const fmt = (n) => Number(n.toFixed(3));

/**
 * Closed SVG path for a rounded rectangle at the origin. Corners are
 * quadratic curves with the control point on the corner (as Excalidraw
 * draws them), which RoughJS renders and fills like any other path.
 */
export function roundedRectPath(width, height, radius = adaptiveRadius(width, height)) {
    const w = Math.abs(Number(width) || 0);
    const h = Math.abs(Number(height) || 0);
    const r = Math.max(0, Math.min(radius, w / 2, h / 2));
    if (r === 0) return `M 0 0 L ${fmt(w)} 0 L ${fmt(w)} ${fmt(h)} L 0 ${fmt(h)} Z`;
    return [
        `M ${fmt(r)} 0`,
        `L ${fmt(w - r)} 0`,
        `Q ${fmt(w)} 0, ${fmt(w)} ${fmt(r)}`,
        `L ${fmt(w)} ${fmt(h - r)}`,
        `Q ${fmt(w)} ${fmt(h)}, ${fmt(w - r)} ${fmt(h)}`,
        `L ${fmt(r)} ${fmt(h)}`,
        `Q 0 ${fmt(h)}, 0 ${fmt(h - r)}`,
        `L 0 ${fmt(r)}`,
        `Q 0 0, ${fmt(r)} 0`,
        'Z',
    ].join(' ');
}

/** RoughJS drawable for a rectangle honouring its edges. */
export function roughRectangle(rc, width, height, options, edges) {
    if (normalizeEdges(edges) === 'round') {
        const r = adaptiveRadius(width, height);
        if (r > 0) return rc.path(roundedRectPath(width, height, r), options);
    }
    return rc.rectangle(0, 0, width, height, options);
}

/**
 * Point on the outline of a (possibly rounded) w×h rectangle, local to its
 * top-left corner. `along` is the distance along the side from its start
 * (left end for top/bottom, top end for left/right) — the same `offset`
 * arrows store. Points inside a rounded corner are moved onto the curve so
 * bound arrows touch the visible outline.
 */
export function rectOutlinePoint(width, height, radius, side, along) {
    const w = width;
    const h = height;
    const r = Math.max(0, Math.min(radius || 0, Math.abs(w) / 2, Math.abs(h) / 2));
    const a = Number(along) || 0;
    // Top-left corner: B(t) = (1-t)²·(0, r) + 2t(1-t)·(0, 0) + t²·(r, 0)
    //                       = (t²r, (1-t)²r).
    // For a point d along the edge from the corner, t = sqrt(d / r) and the
    // curve sits (1-t)²r inside the edge line. Other corners are mirrors.
    const curve = (d) => {
        const t = Math.sqrt(Math.max(0, Math.min(1, d / r)));
        return r * (1 - t) * (1 - t);
    };
    switch (side) {
        case 'top':
        case 'bottom': {
            const y = side === 'top' ? 0 : h;
            const inward = side === 'top' ? 1 : -1;
            if (r > 0 && a < r) return { x: a, y: y + inward * curve(a) };
            if (r > 0 && a > w - r) return { x: a, y: y + inward * curve(w - a) };
            return { x: a, y };
        }
        case 'left':
        case 'right': {
            const x = side === 'left' ? 0 : w;
            const inward = side === 'left' ? 1 : -1;
            if (r > 0 && a < r) return { x: x + inward * curve(a), y: a };
            if (r > 0 && a > h - r) return { x: x + inward * curve(h - a), y: a };
            return { x, y: a };
        }
        default:
            return null;
    }
}
