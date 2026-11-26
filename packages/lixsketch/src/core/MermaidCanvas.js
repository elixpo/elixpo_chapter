/* eslint-disable */
/**
 * MermaidCanvas — shared helpers for placing native Mermaid diagrams on the
 * canvas as ordinary, editable engine shapes inside a wrapper Frame.
 */

let _groupSeq = 0;
export function nextGroupId(prefix = 'mermaid') {
    _groupSeq += 1;
    return `${prefix}-${Date.now().toString(36)}-${_groupSeq}`;
}

/**
 * Start a diagram placement centred on the current viewport.
 * Returns { ox, oy, frame, add(shape, parentFrame?), makeFrame(...), bind(...), finish(first) }.
 */
export function beginDiagram({ width, height, title, diagramType, padding = 90, frameOptions = {} }) {
    const vb = window.currentViewBox || { x: 0, y: 0, width: window.innerWidth || 1200, height: window.innerHeight || 800 };
    const ox = vb.x + vb.width / 2 - width / 2;
    const oy = vb.y + vb.height / 2 - height / 2;
    const undoBatch = window.beginUndoBatch?.();
    const frame = new window.Frame(ox - padding, oy - padding, width + padding * 2, height + padding * 2, {
        stroke: '#888',
        strokeWidth: 1,
        fill: 'transparent',
        opacity: 0.7,
        frameName: title,
        ...frameOptions,
    });
    frame._diagramType = diagramType;
    window.shapes.push(frame);
    window.pushCreateAction?.(frame, { frameCreation: true, containedShapes: [] });

    const api = {
        ox,
        oy,
        frame,
        created: [],
        add(shape, parentFrame = frame) {
            if (!shape) return shape;
            window.shapes.push(shape);
            (parentFrame || frame).addShapeToFrame(shape);
            window.pushCreateAction?.(shape);
            api.created.push(shape);
            return shape;
        },
        makeFrame(x, y, w, h, name, parentFrame = frame, options = {}) {
            const sub = new window.Frame(x, y, w, h, {
                stroke: '#888', strokeWidth: 1, fill: 'transparent', frameName: name || ' ', ...options,
            });
            sub._diagramType = `${diagramType}-group`;
            window.shapes.push(sub);
            window.pushCreateAction?.(sub, { frameCreation: true, containedShapes: [] });
            (parentFrame || frame).addShapeToFrame(sub);
            return sub;
        },
        bind(arrow, shape, isStart, point) {
            if (!arrow || arrow.shapeName !== 'arrow' || typeof window.__autoAttach !== 'function') return;
            try { window.__autoAttach(arrow, shape, isStart, point); } catch (err) { console.warn('[Mermaid] autoAttach failed:', err); }
        },
        finish(first, label) {
            if (first) {
                window.currentShape = first;
                if (typeof first.selectShape === 'function') first.selectShape();
            }
            window.endUndoBatch?.(undoBatch, label || `${diagramType}-create`);
            return true;
        },
    };
    return api;
}

/**
 * Turn a Mermaid edge route (layout pass: diagram laid out by Mermaid) into
 * one curve LixSketch can draw: straight, quadratic or cubic. Mermaid draws
 * the route as a basis spline through the points; a single quadratic (3
 * points) or cubic through the inner points follows it closely.
 */
export function routeCurve(points) {
    if (!Array.isArray(points) || points.length < 2) return null;
    const start = points[0];
    const end = points[points.length - 1];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const len = Math.hypot(dx, dy) || 1;
    const off = (p) => Math.abs((p.x - start.x) * dy - (p.y - start.y) * dx) / len;
    const inner = points.slice(1, -1);
    if (!inner.length || inner.every(p => off(p) < 2)) return { kind: 'straight', start, end };
    if (inner.length === 1) {
        const c = inner[0];
        return {
            kind: 'quad', start, end, control: c,
            c1: { x: start.x + (2 / 3) * (c.x - start.x), y: start.y + (2 / 3) * (c.y - start.y) },
            c2: { x: end.x + (2 / 3) * (c.x - end.x), y: end.y + (2 / 3) * (c.y - end.y) },
        };
    }
    const c1 = inner[0];
    const c2 = inner[inner.length - 1];
    // Closest single quadratic to this cubic, for Line (which is quadratic).
    const control = { x: (3 * (c1.x + c2.x) - (start.x + end.x)) / 4, y: (3 * (c1.y + c2.y) - (start.y + end.y)) / 4 };
    return { kind: 'cubic', start, end, c1, c2, control };
}

/** Point halfway along a route curve (for edge labels). */
export function curveMidpoint(curve) {
    if (curve.kind === 'straight') return { x: (curve.start.x + curve.end.x) / 2, y: (curve.start.y + curve.end.y) / 2 };
    const { start: p0, c1, c2, end: p3 } = curve;
    return { x: (p0.x + 3 * c1.x + 3 * c2.x + p3.x) / 8, y: (p0.y + 3 * c1.y + 3 * c2.y + p3.y) / 8 };
}

export function contrastText(fill, fallback = '#f0f0f0') {
    const raw = String(fill || '').replace('#', '');
    const hex = raw.length === 3 ? raw.split('').map(c => c + c).join('') : raw.slice(0, 6);
    if (!/^[0-9a-f]{6}$/i.test(hex)) return fallback;
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return 0.299 * r + 0.587 * g + 0.114 * b > 140 ? '#1a1a2e' : '#f0f0f0';
}

export function escapeXml(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
