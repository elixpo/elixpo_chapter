/* eslint-disable */
/**
 * Arrowheads (Excalidraw model): independent start and end heads, each one
 * of ARROWHEAD_TYPES. Pure geometry + a RoughJS renderer; no globals.
 *
 * Conventions
 *   - `tip` is the arrow endpoint the head sits on.
 *   - `angle` is the direction the head points (radians), i.e. outward
 *     along the shaft: the forward tangent at the end, the reversed
 *     tangent at the start.
 *   - `trim` is how far the shaft must stop short of the tip so closed
 *     heads (triangle, diamond, circle, dot) don't have the line poking
 *     through them.
 */

export const ARROWHEAD_TYPES = [
    'none', 'arrow', 'bar', 'dot', 'circle', 'triangle', 'triangle_outline',
    'diamond', 'diamond_outline', 'crowfoot_one', 'crowfoot_many', 'crowfoot_one_or_many', 'cross',
];

export const DEFAULT_START_ARROWHEAD = 'none';
export const DEFAULT_END_ARROWHEAD = 'arrow';

// Pre-v2 `arrowHeadStyle` values (end head only).
export const LEGACY_HEAD_MAP = {
    default: 'arrow',
    outline: 'triangle_outline',
    solid: 'triangle',
    square: 'bar',
    none: 'none',
};

const ALIASES = {
    open: 'arrow', v: 'arrow', line: 'bar', filled_circle: 'dot', circle_outline: 'circle',
    'triangle-outline': 'triangle_outline', 'diamond-outline': 'diamond_outline',
    'crowfoot-one': 'crowfoot_one', 'crowfoot-many': 'crowfoot_many', 'crowfoot-one-or-many': 'crowfoot_one_or_many',
    x: 'cross', null: 'none', false: 'none',
};

/** Normalize any head value (new, legacy or alias); unknown → fallback. */
export function normalizeArrowhead(value, fallback = DEFAULT_END_ARROWHEAD) {
    if (value === null || value === false) return 'none';
    if (typeof value !== 'string' || !value) return fallback;
    const key = value.trim().toLowerCase();
    if (ARROWHEAD_TYPES.includes(key)) return key;
    if (LEGACY_HEAD_MAP[key]) return LEGACY_HEAD_MAP[key];
    if (ALIASES[key]) return ALIASES[key];
    return fallback;
}

/**
 * Start/end heads from serialized data or constructor options. New keys
 * win; otherwise the legacy single `arrowHeadStyle` becomes the end head
 * and the start head defaults to none.
 */
export function readArrowheads(data = {}) {
    const end = data.endArrowhead !== undefined
        ? normalizeArrowhead(data.endArrowhead)
        : normalizeArrowhead(data.arrowHeadStyle, DEFAULT_END_ARROWHEAD);
    const start = data.startArrowhead !== undefined
        ? normalizeArrowhead(data.startArrowhead, DEFAULT_START_ARROWHEAD)
        : DEFAULT_START_ARROWHEAD;
    return { startArrowhead: start, endArrowhead: end };
}

/** Line heads from data: both default to none. */
export function readLineArrowheads(data = {}) {
    return {
        startArrowhead: normalizeArrowhead(data.startArrowhead, 'none'),
        endArrowhead: normalizeArrowhead(data.endArrowhead, 'none'),
    };
}

/** Serialized line heads; `none` is omitted so headless lines stay unchanged. */
export function serializeLineArrowheads(shape) {
    const out = {};
    const { startArrowhead, endArrowhead } = readLineArrowheads(shape || {});
    if (startArrowhead !== 'none') out.startArrowhead = startArrowhead;
    if (endArrowhead !== 'none') out.endArrowhead = endArrowhead;
    return out;
}

// Base head length (px at stroke width 2), tuned to Excalidraw's sizes.
const BASE_SIZE = {
    arrow: 18, bar: 14, dot: 11, circle: 12, triangle: 16, triangle_outline: 16,
    diamond: 16, diamond_outline: 16, crowfoot_one: 14, crowfoot_many: 16, crowfoot_one_or_many: 18, cross: 12,
};

/**
 * Head length for a type: grows with stroke width (thicker strokes need
 * bigger heads, as in Excalidraw) and never exceeds a fraction of the
 * shaft so short arrows still show their line.
 */
export function arrowheadSize(type, strokeWidth = 2, shaftLength = Infinity) {
    const base = BASE_SIZE[type];
    if (!base) return 0;
    const sw = Math.max(0.5, Number(strokeWidth) || 2);
    const scale = Math.min(2, Math.max(0.8, 0.75 + sw / 8));
    const cap = type === 'diamond' || type === 'diamond_outline' ? 0.35 : 0.5;
    const limit = Number.isFinite(shaftLength) ? Math.max(4, shaftLength * cap) : Infinity;
    return Math.min(base * scale, limit);
}

const HALF_ANGLE = (30 * Math.PI) / 180;

/**
 * Plain geometry for one head.
 * Returns { trim, parts: [{ kind: 'polyline'|'polygon'|'circle', points?, center?, diameter?, filled }] }.
 */
export function arrowheadGeometry(type, tip, angle, size) {
    const t = normalizeArrowhead(type, 'none');
    if (t === 'none' || !(size > 0)) return { trim: 0, parts: [] };
    const d = { x: Math.cos(angle), y: Math.sin(angle) };
    const n = { x: -d.y, y: d.x };
    const at = (back, side = 0) => ({ x: tip.x - d.x * back + n.x * side, y: tip.y - d.y * back + n.y * side });
    const wing = (sign) => ({
        x: tip.x - size * Math.cos(angle + sign * HALF_ANGLE),
        y: tip.y - size * Math.sin(angle + sign * HALF_ANGLE),
    });

    switch (t) {
        case 'arrow':
            return { trim: 0, parts: [{ kind: 'polyline', points: [wing(1), { ...tip }, wing(-1)], filled: false }] };
        case 'triangle':
        case 'triangle_outline':
            return {
                trim: size * Math.cos(HALF_ANGLE),
                parts: [{ kind: 'polygon', points: [{ ...tip }, wing(1), wing(-1)], filled: t === 'triangle' }],
            };
        case 'bar':
            return { trim: 0, parts: [{ kind: 'polyline', points: [at(0, size / 2), at(0, -size / 2)], filled: false }] };
        case 'dot':
        case 'circle': {
            const diameter = size;
            return {
                trim: diameter,
                parts: [{ kind: 'circle', center: at(diameter / 2), diameter, filled: t === 'dot' }],
            };
        }
        case 'diamond':
        case 'diamond_outline':
            return {
                trim: size,
                parts: [{
                    kind: 'polygon',
                    points: [{ ...tip }, at(size / 2, size / 3), at(size), at(size / 2, -size / 3)],
                    filled: t === 'diamond',
                }],
            };
        case 'crowfoot_many':
            // Fork opens toward the tip (the entity edge).
            return {
                trim: 0,
                parts: [
                    { kind: 'polyline', points: [at(0, size / 2), at(size), at(0, -size / 2)], filled: false },
                ],
            };
        case 'crowfoot_one':
            // "Exactly one": a bar across the shaft just behind the tip.
            return { trim: 0, parts: [{ kind: 'polyline', points: [at(size * 0.6, size / 2), at(size * 0.6, -size / 2)], filled: false }] };
        case 'crowfoot_one_or_many': {
            const fork = size * 0.75;
            return {
                trim: 0,
                parts: [
                    { kind: 'polyline', points: [at(0, fork / 2), at(fork), at(0, -fork / 2)], filled: false },
                    { kind: 'polyline', points: [at(size, size / 2), at(size, -size / 2)], filled: false },
                ],
            };
        }
        case 'cross': {
            const c = size / 2;
            return {
                trim: 0,
                parts: [
                    { kind: 'polyline', points: [at(c - c / 1.4, c / 1.4), at(c + c / 1.4, -c / 1.4)], filled: false },
                    { kind: 'polyline', points: [at(c - c / 1.4, -c / 1.4), at(c + c / 1.4, c / 1.4)], filled: false },
                ],
            };
        }
        default:
            return { trim: 0, parts: [] };
    }
}

/**
 * Render a head with RoughJS. Heads are always drawn with a solid stroke
 * (dash patterns belong to the shaft only); filled heads use the stroke
 * colour as fill. `opts.seed` should be the shaft's seed so the hand-drawn
 * wobble is stable across redraws.
 */
export function renderArrowhead(rc, geometry, { stroke, strokeWidth, roughness = 1, seed } = {}) {
    const base = {
        stroke,
        strokeWidth,
        roughness,
        seed,
        preserveVertices: true,
        disableMultiStroke: roughness === 0,
    };
    const nodes = [];
    for (const part of geometry.parts) {
        const fillOpts = part.filled
            ? { ...base, fill: stroke, fillStyle: 'solid' }
            : { ...base, fill: undefined };
        let node;
        if (part.kind === 'circle') {
            node = rc.circle(part.center.x, part.center.y, part.diameter, fillOpts);
        } else if (part.kind === 'polygon') {
            node = rc.polygon(part.points.map((p) => [p.x, p.y]), fillOpts);
        } else {
            node = rc.linearPath(part.points.map((p) => [p.x, p.y]), base);
        }
        if (node) nodes.push(node);
    }
    return nodes;
}

// ── Shaft tangents and trimming ─────────────────────────────────────

const len = (v) => Math.hypot(v.x, v.y);

function cubicPoint(p0, p1, p2, p3, t) {
    const mt = 1 - t;
    return {
        x: mt * mt * mt * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t * t * t * p3.x,
        y: mt * mt * mt * p0.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t * t * t * p3.y,
    };
}

/** de Casteljau split of a cubic at t → [left, right] control polygons. */
export function splitCubic(p0, p1, p2, p3, t) {
    const lerp = (a, b) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    const a = lerp(p0, p1), b = lerp(p1, p2), c = lerp(p2, p3);
    const d = lerp(a, b), e = lerp(b, c);
    const f = lerp(d, e);
    return [[p0, a, d, f], [f, e, c, p3]];
}

/** Parameter t on the cubic whose point is `distance` (chord) from the end/start. */
function cubicParamAtDistance(p0, p1, p2, p3, distance, fromEnd) {
    const anchor = fromEnd ? p3 : p0;
    let lo = fromEnd ? 0 : 0;
    let hi = 1;
    // Distance from the anchor is monotonic near the anchor; bisect.
    for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2;
        const p = cubicPoint(p0, p1, p2, p3, mid);
        const dist = Math.hypot(p.x - anchor.x, p.y - anchor.y);
        if (fromEnd) {
            if (dist > distance) lo = mid; else hi = mid;
        } else if (dist < distance) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
}

/**
 * Direction angles for the heads of an arrow shape description:
 *   { kind: 'straight'|'curved'|'elbow', start, end, c1?, c2?, elbowX? }
 * Returns { startAngle, endAngle } (outward directions).
 */
export function arrowEndAngles(shaft) {
    const { start: s, end: e } = shaft;
    if (shaft.kind === 'curved' && shaft.c1 && shaft.c2) {
        // B'(1) = 3(P3 - P2); fall back when control points coincide.
        let endDir = { x: e.x - shaft.c2.x, y: e.y - shaft.c2.y };
        if (len(endDir) < 1e-6) endDir = { x: e.x - shaft.c1.x, y: e.y - shaft.c1.y };
        if (len(endDir) < 1e-6) endDir = { x: e.x - s.x, y: e.y - s.y };
        let startDir = { x: s.x - shaft.c1.x, y: s.y - shaft.c1.y };
        if (len(startDir) < 1e-6) startDir = { x: s.x - shaft.c2.x, y: s.y - shaft.c2.y };
        if (len(startDir) < 1e-6) startDir = { x: s.x - e.x, y: s.y - e.y };
        return { startAngle: Math.atan2(startDir.y, startDir.x), endAngle: Math.atan2(endDir.y, endDir.x) };
    }
    if (shaft.kind === 'elbow') {
        const ex = Number.isFinite(shaft.elbowX) ? shaft.elbowX : (s.x + e.x) / 2;
        // Horizontal end legs; degenerate legs fall back to the vertical run.
        const endAngle = Math.abs(e.x - ex) > 1e-6
            ? (e.x > ex ? 0 : Math.PI)
            : (e.y >= s.y ? Math.PI / 2 : -Math.PI / 2);
        const startAngle = Math.abs(s.x - ex) > 1e-6
            ? (s.x > ex ? 0 : Math.PI)
            : (s.y >= e.y ? Math.PI / 2 : -Math.PI / 2);
        return { startAngle, endAngle };
    }
    return {
        startAngle: Math.atan2(s.y - e.y, s.x - e.x),
        endAngle: Math.atan2(e.y - s.y, e.x - s.x),
    };
}

/**
 * Shaft geometry with each end pulled back by its trim distance.
 * Returns the same shape description with new start/end (and control
 * points for curves).
 */
export function trimShaft(shaft, startTrim = 0, endTrim = 0) {
    const out = { ...shaft, start: { ...shaft.start }, end: { ...shaft.end } };
    if (!(startTrim > 0) && !(endTrim > 0)) return out;
    if (shaft.kind === 'curved' && shaft.c1 && shaft.c2) {
        let p = [shaft.start, shaft.c1, shaft.c2, shaft.end];
        const chord = Math.hypot(shaft.end.x - shaft.start.x, shaft.end.y - shaft.start.y);
        if (endTrim > 0 && endTrim < chord) {
            const t = cubicParamAtDistance(...p, endTrim, true);
            p = splitCubic(...p, t)[0];
        }
        if (startTrim > 0 && startTrim < chord) {
            const t = cubicParamAtDistance(...p, startTrim, false);
            p = splitCubic(...p, t)[1];
        }
        return { ...out, start: p[0], c1: p[1], c2: p[2], end: p[3] };
    }
    if (shaft.kind === 'elbow') {
        const ex = Number.isFinite(shaft.elbowX) ? shaft.elbowX : (shaft.start.x + shaft.end.x) / 2;
        const endLeg = shaft.end.x - ex;
        if (endTrim > 0 && Math.abs(endLeg) > endTrim) out.end.x -= Math.sign(endLeg) * endTrim;
        const startLeg = shaft.start.x - ex;
        if (startTrim > 0 && Math.abs(startLeg) > startTrim) out.start.x -= Math.sign(startLeg) * startTrim;
        return { ...out, elbowX: ex };
    }
    const dx = shaft.end.x - shaft.start.x;
    const dy = shaft.end.y - shaft.start.y;
    const length = Math.hypot(dx, dy);
    if (length === 0 || startTrim + endTrim >= length) return out;
    const ux = dx / length, uy = dy / length;
    out.end = { x: shaft.end.x - ux * endTrim, y: shaft.end.y - uy * endTrim };
    out.start = { x: shaft.start.x + ux * startTrim, y: shaft.start.y + uy * startTrim };
    return out;
}

/** Rough length of the shaft, used to cap head sizes on short arrows. */
export function shaftLength(shaft) {
    const { start: s, end: e } = shaft;
    if (shaft.kind === 'curved' && shaft.c1 && shaft.c2) {
        let total = 0;
        let prev = s;
        for (let i = 1; i <= 16; i++) {
            const p = cubicPoint(s, shaft.c1, shaft.c2, e, i / 16);
            total += Math.hypot(p.x - prev.x, p.y - prev.y);
            prev = p;
        }
        return total;
    }
    if (shaft.kind === 'elbow') {
        const ex = Number.isFinite(shaft.elbowX) ? shaft.elbowX : (s.x + e.x) / 2;
        return Math.abs(ex - s.x) + Math.abs(e.y - s.y) + Math.abs(e.x - ex);
    }
    return Math.hypot(e.x - s.x, e.y - s.y);
}

/**
 * Everything needed to draw an arrow's heads: per end the type, size,
 * outward angle and geometry, plus the trimmed shaft.
 */
export function layoutArrowheads(shaft, { startArrowhead = 'none', endArrowhead = 'arrow', strokeWidth = 2 } = {}) {
    const total = shaftLength(shaft);
    const { startAngle, endAngle } = arrowEndAngles(shaft);
    const startType = normalizeArrowhead(startArrowhead, 'none');
    const endType = normalizeArrowhead(endArrowhead, 'arrow');
    // Both heads share the shaft; each may use at most half of it.
    const share = startType !== 'none' && endType !== 'none' ? total / 2 : total;
    const startSize = arrowheadSize(startType, strokeWidth, share);
    const endSize = arrowheadSize(endType, strokeWidth, share);
    const start = arrowheadGeometry(startType, shaft.start, startAngle, startSize);
    const end = arrowheadGeometry(endType, shaft.end, endAngle, endSize);
    return {
        start: { type: startType, angle: startAngle, size: startSize, ...start },
        end: { type: endType, angle: endAngle, size: endSize, ...end },
        shaft: trimShaft(shaft, start.trim, end.trim),
    };
}

/** SVG path data for a shaft description (crisp; RoughJS roughens it). */
export function shaftPathData(shaft, curveRadius = 0) {
    const { start: s, end: e } = shaft;
    if (shaft.kind === 'curved' && shaft.c1 && shaft.c2) {
        return `M ${s.x} ${s.y} C ${shaft.c1.x} ${shaft.c1.y}, ${shaft.c2.x} ${shaft.c2.y}, ${e.x} ${e.y}`;
    }
    if (shaft.kind === 'elbow') {
        const ex = Number.isFinite(shaft.elbowX) ? shaft.elbowX : (s.x + e.x) / 2;
        const r = Math.min(Math.abs(curveRadius), Math.abs(ex - s.x) / 2, Math.abs(e.x - ex) / 2, Math.abs(e.y - s.y) / 2);
        const dx = ex >= s.x ? 1 : -1;
        const ex2 = e.x >= ex ? 1 : -1;
        const dy = e.y >= s.y ? 1 : -1;
        if (r > 2) {
            return `M ${s.x} ${s.y} H ${ex - dx * r} Q ${ex} ${s.y} ${ex} ${s.y + dy * r} V ${e.y - dy * r} Q ${ex} ${e.y} ${ex + ex2 * r} ${e.y} H ${e.x}`;
        }
        return `M ${s.x} ${s.y} H ${ex} V ${e.y} H ${e.x}`;
    }
    return `M ${s.x} ${s.y} L ${e.x} ${e.y}`;
}
