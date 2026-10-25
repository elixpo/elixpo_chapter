/* eslint-disable */
/**
 * MermaidFlowchartRenderer — draws a positioned flowchart (from
 * parseMermaidFlowchart) as preview SVG and as native canvas shapes.
 *
 * Preview and canvas use the same geometry and the same shape mapping, so
 * what the DSL Studio shows is what lands on the canvas.
 *
 * Node shape → canvas shape (closest LixSketch primitive, Excalidraw-style
 * fallback to a rectangle for geometry LixSketch has no primitive for):
 *   rect, hexagon, parallelogram(_alt), trapezoid(_alt), asymmetric → Rectangle
 *   round, stadium → Rectangle with round edges (adaptive radius, like Excalidraw)
 *   subroutine → Rectangle + two inner vertical Lines (grouped)
 *   cylinder → Rectangle + elliptical top cap Circle (grouped)
 *   circle → Circle; doublecircle → two concentric Circles (grouped)
 *   diamond → square Rectangle rotated 45°
 * Subgraphs → nested Frames that contain their nodes.
 */

import { beginDiagram, contrastText, escapeXml, nextGroupId } from './MermaidCanvas.js';

const FONT_FAMILY = 'lixFont, sans-serif';
const PREVIEW_MARGIN = 40;

function isThemeDark() {
    if (typeof document === 'undefined') return true;
    if (document.body) {
        if (document.body.classList.contains('theme-dark')) return true;
        if (document.body.classList.contains('theme-light')) return false;
    }
    return !document.documentElement || document.documentElement.classList.contains('dark');
}

const DARK_THEME = {
    bg: '#1e1e28', nodeText: '#e0e0e0', edgeStroke: '#888', edgeText: '#a0a0b0',
    subgraphBg: 'rgba(80,80,120,0.08)', subgraphBorder: '#666', subgraphLabel: '#9a9ab0',
};
const LIGHT_THEME = {
    bg: '#fbfaf6', nodeText: '#343832', edgeStroke: '#6e746c', edgeText: '#4f554e',
    subgraphBg: 'rgba(117,135,119,0.06)', subgraphBorder: '#aaa99f', subgraphLabel: '#666b64',
};
function theme() { return isThemeDark() ? DARK_THEME : LIGHT_THEME; }
function nodeStrokeColor() { return isThemeDark() ? '#fff' : '#1a1a2e'; }
function edgeStrokeColor() { return isThemeDark() ? '#888' : '#444'; }

function measureText(text, fontSize) { return String(text).length * fontSize * 0.55; }

// ── geometry ──

const isRound = (type) => type === 'circle' || type === 'doublecircle';

/** Point on `node`'s outline facing `target` (centres + sizes). */
function getEdgePoint(node, target) {
    const dx = target.cx - node.cx;
    const dy = target.cy - node.cy;
    if (isRound(node.type)) {
        const r = Math.min(node.w, node.h) / 2;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        return { x: node.cx + (dx / dist) * r, y: node.cy + (dy / dist) * r };
    }
    if (node.type === 'diamond') {
        const hw = node.w / 2;
        const hh = node.h / 2;
        const adx = Math.abs(dx) || 0.0001;
        const ady = Math.abs(dy) || 0.0001;
        const t = 1 / (adx / hw + ady / hh);
        return { x: node.cx + dx * t, y: node.cy + dy * t };
    }
    const hw = node.w / 2;
    const hh = node.h / 2;
    if (Math.abs(dx) < 0.001 || Math.abs(dy) * hw > Math.abs(dx) * hh) {
        return dy > 0 ? { x: node.cx, y: node.y + node.h } : { x: node.cx, y: node.y };
    }
    return dx > 0 ? { x: node.x + node.w, y: node.cy } : { x: node.x, y: node.cy };
}

/**
 * Resolve canvas connector endpoints on the sides facing the other node.
 */
export function getCanvasFlowchartEdgePoints(fromNode, toNode) {
    const normalize = node => ({
        x: node.x, y: node.y, w: node.width, h: node.height,
        cx: node.centerX ?? node.x + node.width / 2, cy: node.centerY ?? node.y + node.height / 2, type: node.type,
    });
    const from = normalize(fromNode);
    const to = normalize(toNode);
    return { start: getEdgePoint(from, to), end: getEdgePoint(to, from) };
}

/** Self-loop: leave the right side, come back on the top. */
function selfLoopPoints(n) {
    return {
        start: { x: n.x + n.width, y: n.y + n.height / 2 },
        end: { x: n.x + n.width / 2, y: n.y },
        control: { x: n.x + n.width + 40, y: n.y - 40 },
    };
}

function edgeVisual(e) {
    const thick = e.style === 'thick';
    const dotted = e.style === 'dotted';
    return {
        stroke: e.stroke || edgeStrokeColor(),
        strokeWidth: e.strokeWidth ?? (thick ? 3 : 1.5),
        dash: e.strokeDasharray || (dotted ? '5 3' : ''),
    };
}

// LixSketch arrowheads: default (open V), square, outline (hollow triangle), solid.
// Mermaid edge ends → LixSketch arrowhead types (core/ArrowHeads.js).
export const ARROWHEAD_FOR = { arrow: 'arrow', circle: 'circle', cross: 'cross' };

// ── preview SVG ──

export function renderFlowchartSVG(diagram, opts = {}) {
    if (!diagram || !diagram.nodes || diagram.nodes.length === 0) return '';
    const T = theme();
    const dw = Math.max(1, diagram.width || Math.max(...diagram.nodes.map(n => n.x + n.width)));
    const dh = Math.max(1, diagram.height || Math.max(...diagram.nodes.map(n => n.y + n.height)));
    let scale = 1;
    let offX = PREVIEW_MARGIN;
    let offY = PREVIEW_MARGIN;
    let totalW = Math.round(dw + PREVIEW_MARGIN * 2);
    let totalH = Math.round(dh + PREVIEW_MARGIN * 2);
    if (opts.width || opts.height) {
        totalW = opts.width || totalW;
        totalH = opts.height || totalH;
        scale = Math.min((totalW - PREVIEW_MARGIN * 2) / dw, (totalH - PREVIEW_MARGIN * 2) / dh, 1.8);
        offX = (totalW - dw * scale) / 2;
        offY = (totalH - dh * scale) / 2;
    }
    const X = (v) => v * scale + offX;
    const Y = (v) => v * scale + offY;

    const byId = new Map();
    for (const n of diagram.nodes) {
        byId.set(n.id, { ...n, x: X(n.x), y: Y(n.y), w: n.width * scale, h: n.height * scale, cx: X(n.x + n.width / 2), cy: Y(n.y + n.height / 2) });
    }

    let svg = `<rect x="0" y="0" width="${totalW}" height="${totalH}" fill="${T.bg}" rx="8" />`;
    const defs = [];
    const marker = (id, color, kind) => {
        if (defs.some(d => d.includes(`id="${id}"`))) return;
        if (kind === 'circle') defs.push(`<marker id="${id}" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto-start-reverse"><circle cx="4.5" cy="4.5" r="3.5" fill="${T.bg}" stroke="${color}" stroke-width="1.2"/></marker>`);
        else if (kind === 'cross') defs.push(`<marker id="${id}" markerWidth="9" markerHeight="9" refX="6" refY="4.5" orient="auto-start-reverse"><path d="M2,1 L8,8 M8,1 L2,8" fill="none" stroke="${color}" stroke-width="1.4" stroke-linecap="round"/></marker>`);
        else defs.push(`<marker id="${id}" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto-start-reverse"><path d="M1,1 L9,3.5 L1,6" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round"/></marker>`);
    };

    // subgraphs (outermost first)
    const sgs = (diagram.subgraphs || []).slice().sort((a, b) => (a.depth || 0) - (b.depth || 0));
    for (const sg of sgs) {
        const fill = sg.style?.fill || T.subgraphBg;
        const stroke = sg.style?.stroke || T.subgraphBorder;
        svg += `<g data-fc-type="subgraph" data-fc-id="${escapeXml(sg.id)}"><rect x="${X(sg.x)}" y="${Y(sg.y)}" width="${sg.width * scale}" height="${sg.height * scale}" rx="6" fill="${fill}" stroke="${stroke}" stroke-width="1" stroke-dasharray="4 2" />`;
        if (sg.label) svg += `<text x="${X(sg.x) + 8}" y="${Y(sg.y) + 16 * scale}" fill="${sg.style?.labelColor || T.subgraphLabel}" font-size="${Math.max(9, 12 * scale)}" font-family="${FONT_FAMILY}">${escapeXml(sg.label)}</text>`;
        svg += '</g>';
    }

    // edges
    diagram.edges.forEach((e, ei) => {
        if (e.style === 'invisible') return;
        const f = byId.get(e.from);
        const t = byId.get(e.to);
        if (!f || !t) return;
        const v = edgeVisual(e);
        const color = v.stroke;
        const endKind = e.endHead ? ARROWHEAD_FOR[e.endHead] : null;
        const startKind = e.startHead ? ARROWHEAD_FOR[e.startHead] : null;
        const endId = endKind ? `fc-${endKind}-${ei}` : null;
        const startId = startKind ? `fc-${startKind}-${ei}-s` : null;
        if (endId) marker(endId, color, endKind);
        if (startId) marker(startId, color, startKind);
        const dash = v.dash ? ` stroke-dasharray="${v.dash}"` : '';
        const me = endId ? ` marker-end="url(#${endId})"` : '';
        const ms = startId ? ` marker-start="url(#${startId})"` : '';
        let mx;
        let my;
        svg += `<g data-fc-type="edge" data-fc-from="${escapeXml(e.from)}" data-fc-to="${escapeXml(e.to)}">`;
        if (e.from === e.to) {
            const loop = selfLoopPoints({ x: f.x, y: f.y, width: f.w, height: f.h });
            svg += `<path d="M ${loop.start.x} ${loop.start.y} Q ${loop.control.x} ${loop.control.y} ${loop.end.x} ${loop.end.y}" fill="none" stroke="${color}" stroke-width="${v.strokeWidth * scale}"${dash}${me}${ms} />`;
            mx = loop.control.x - 10; my = loop.control.y + 10;
        } else {
            const sp = getEdgePoint(f, t);
            const ep = getEdgePoint(t, f);
            svg += `<line x1="${sp.x}" y1="${sp.y}" x2="${ep.x}" y2="${ep.y}" stroke="${color}" stroke-width="${v.strokeWidth * scale}"${dash}${me}${ms} />`;
            mx = (sp.x + ep.x) / 2; my = (sp.y + ep.y) / 2;
        }
        if (e.label) {
            const fs = Math.max(8, 11 * scale);
            const lines = e.label.split('\n');
            const lw = Math.max(...lines.map(l => measureText(l, fs))) + 12;
            const lh = lines.length * (fs + 3) + 6;
            svg += `<rect x="${mx - lw / 2}" y="${my - lh / 2}" width="${lw}" height="${lh}" rx="3" fill="${T.bg}" opacity="0.9" />`;
            lines.forEach((ln, i) => {
                svg += `<text x="${mx}" y="${my - ((lines.length - 1) * (fs + 3)) / 2 + i * (fs + 3)}" text-anchor="middle" dominant-baseline="central" fill="${e.labelColor || T.edgeText}" font-size="${fs}" font-family="${FONT_FAMILY}">${escapeXml(ln)}</text>`;
            });
        }
        svg += '</g>';
    });

    // nodes
    for (const n of diagram.nodes) {
        const d = byId.get(n.id);
        const fill = n.fill || 'transparent';
        const stroke = n.stroke || nodeStrokeColor();
        const sw = (n.strokeWidth || 1.5) * scale;
        const dash = n.strokeDasharray ? ` stroke-dasharray="${n.strokeDasharray}"` : '';
        const common = `fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${dash}`;
        svg += `<g data-fc-type="node" data-fc-id="${escapeXml(n.id)}" data-fc-shape="${n.type}">`;
        switch (n.type) {
            case 'circle':
                svg += `<circle cx="${d.cx}" cy="${d.cy}" r="${Math.min(d.w, d.h) / 2}" ${common} />`;
                break;
            case 'doublecircle': {
                const r = Math.min(d.w, d.h) / 2;
                svg += `<circle cx="${d.cx}" cy="${d.cy}" r="${r}" ${common} /><circle cx="${d.cx}" cy="${d.cy}" r="${r - 6 * scale}" fill="none" stroke="${stroke}" stroke-width="${sw}" />`;
                break;
            }
            case 'diamond':
                svg += `<polygon points="${d.cx},${d.y} ${d.x + d.w},${d.cy} ${d.cx},${d.y + d.h} ${d.x},${d.cy}" ${common} />`;
                break;
            case 'round':
                svg += `<rect x="${d.x}" y="${d.y}" width="${d.w}" height="${d.h}" rx="${Math.min(d.w, d.h) * 0.2}" ${common} />`;
                break;
            case 'stadium':
                svg += `<rect x="${d.x}" y="${d.y}" width="${d.w}" height="${d.h}" rx="${d.h / 2}" ${common} />`;
                break;
            case 'subroutine':
                svg += `<rect x="${d.x}" y="${d.y}" width="${d.w}" height="${d.h}" ${common} /><line x1="${d.x + 8 * scale}" y1="${d.y}" x2="${d.x + 8 * scale}" y2="${d.y + d.h}" stroke="${stroke}" stroke-width="${sw}" /><line x1="${d.x + d.w - 8 * scale}" y1="${d.y}" x2="${d.x + d.w - 8 * scale}" y2="${d.y + d.h}" stroke="${stroke}" stroke-width="${sw}" />`;
                break;
            case 'cylinder': {
                const ry = 10 * scale;
                svg += `<rect x="${d.x}" y="${d.y + ry}" width="${d.w}" height="${d.h - ry}" ${common} /><ellipse cx="${d.cx}" cy="${d.y + ry}" rx="${d.w / 2}" ry="${ry}" ${common} />`;
                break;
            }
            default:
                svg += `<rect x="${d.x}" y="${d.y}" width="${d.w}" height="${d.h}" rx="${3 * scale}" ${common} />`;
        }
        if (n.label) {
            const fs = Math.max(9, Math.min(14, 12 * scale));
            const hasFill = fill && fill !== 'transparent' && fill !== 'none';
            const color = n.labelColor || (hasFill ? contrastText(fill) : theme().nodeText);
            const lines = n.label.split('\n');
            const lh = fs + 3;
            const cy = d.cy + (n.type === 'cylinder' ? 5 * scale : 0);
            lines.forEach((ln, i) => {
                svg += `<text x="${d.cx}" y="${cy - ((lines.length - 1) * lh) / 2 + i * lh}" text-anchor="middle" dominant-baseline="central" fill="${color}" font-size="${fs}" font-family="${FONT_FAMILY}" font-weight="500">${escapeXml(ln)}</text>`;
            });
        }
        svg += '</g>';
    }
    const defsStr = defs.length ? `<defs>${defs.join('')}</defs>` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}">${defsStr}${svg}</svg>`;
}

export function renderFlowchartPreviewSVG(diagram) {
    return renderFlowchartSVG(diagram, { width: 600, height: 450 });
}

// ── canvas ──

/** Create the canvas shape(s) for one node. Returns { main, extras[] }. */
function createNodeShapes(n, x, y) {
    const w = n.width;
    const h = n.height;
    const cx = x + w / 2;
    const cy = y + h / 2;
    const hasFill = n.fill && n.fill !== 'transparent';
    const opts = {
        stroke: n.stroke || nodeStrokeColor(),
        strokeWidth: n.strokeWidth ?? 1.5,
        fill: n.fill || 'transparent',
        fillStyle: hasFill ? 'solid' : 'none',
        roughness: 1,
        label: n.label || '',
        labelColor: n.labelColor || (hasFill ? contrastText(n.fill) : nodeStrokeColor()),
    };
    if (n.strokeDasharray) opts.strokeDasharray = n.strokeDasharray;
    const plain = { ...opts, label: '', fill: 'transparent', fillStyle: 'none' };
    switch (n.type) {
        case 'circle':
            return { main: new window.Circle(cx, cy, Math.min(w, h) / 2, Math.min(w, h) / 2, opts), extras: [] };
        case 'doublecircle': {
            const r = Math.min(w, h) / 2;
            const outer = new window.Circle(cx, cy, r, r, opts);
            const inner = new window.Circle(cx, cy, r - 6, r - 6, plain);
            return { main: outer, extras: [inner] };
        }
        case 'diamond': {
            const side = w / Math.SQRT2;
            const shape = new window.Rectangle(cx - side / 2, cy - side / 2, side, side, opts);
            shape.rotation = 45;
            if (typeof shape.draw === 'function') shape.draw();
            return { main: shape, extras: [] };
        }
        case 'round':
            return { main: new window.Rectangle(x, y, w, h, { ...opts, edges: 'round' }), extras: [] };
        case 'stadium':
            return { main: new window.Rectangle(x, y, w, h, { ...opts, edges: 'round' }), extras: [] };
        case 'subroutine': {
            const main = new window.Rectangle(x, y, w, h, opts);
            const lines = window.Line ? [
                new window.Line({ x: x + 8, y }, { x: x + 8, y: y + h }, { stroke: opts.stroke, strokeWidth: opts.strokeWidth, roughness: 1 }),
                new window.Line({ x: x + w - 8, y }, { x: x + w - 8, y: y + h }, { stroke: opts.stroke, strokeWidth: opts.strokeWidth, roughness: 1 }),
            ] : [];
            return { main, extras: lines };
        }
        case 'cylinder': {
            const ry = 10;
            const main = new window.Rectangle(x, y + ry, w, h - ry, opts);
            const cap = window.Circle ? new window.Circle(cx, y + ry, w / 2, ry, { ...opts, label: '' }) : null;
            return { main, extras: cap ? [cap] : [] };
        }
        default:
            return { main: new window.Rectangle(x, y, w, h, opts), extras: [] };
    }
}

export function renderFlowchartOnCanvas(diagram) {
    if (!diagram || !diagram.nodes || diagram.nodes.length === 0) return false;
    if (!window.svg || !window.Rectangle || !window.Frame) {
        console.error('[FlowchartRenderer] Engine not initialized');
        return false;
    }
    const width = diagram.width || Math.max(...diagram.nodes.map(n => n.x + n.width));
    const height = diagram.height || Math.max(...diagram.nodes.map(n => n.y + n.height));
    const placement = beginDiagram({ width, height, title: diagram.title || 'Mermaid diagram', diagramType: 'mermaid-flowchart' });
    const { ox, oy } = placement;

    // Subgraph frames, parents first so children nest inside them.
    const frames = new Map();
    const sgs = (diagram.subgraphs || []).slice().sort((a, b) => (a.depth || 0) - (b.depth || 0));
    const sgById = new Map(sgs.map(s => [s.id, s]));
    for (const sg of sgs) {
        const parent = sg.parent && frames.get(sg.parent) || placement.frame;
        const options = {};
        if (sg.style?.stroke) options.stroke = sg.style.stroke;
        if (sg.style?.fill) { options.fillStyle = 'solid'; options.fillColor = sg.style.fill; }
        frames.set(sg.id, placement.makeFrame(sg.x + ox, sg.y + oy, sg.width, sg.height, sg.label || sg.id, parent, options));
    }
    const frameFor = (sgId) => (sgId && frames.get(sgId)) || placement.frame;
    const chain = (sgId) => { const c = []; let s = sgId; while (s) { c.unshift(s); s = sgById.get(s)?.parent || null; } return c; };
    const lca = (a, b) => {
        const ca = chain(a);
        const cb = chain(b);
        let i = 0;
        while (i < ca.length && i < cb.length && ca[i] === cb[i]) i += 1;
        return i ? ca[i - 1] : null;
    };

    const placed = new Map();
    for (const n of diagram.nodes) {
        const x = n.x + ox;
        const y = n.y + oy;
        let shapes;
        try { shapes = createNodeShapes(n, x, y); } catch (err) { console.warn('[FlowchartRenderer] Node creation failed:', n.id, err); continue; }
        const parent = frameFor(n.subgraph);
        placement.add(shapes.main, parent);
        if (shapes.extras.length) {
            const groupId = nextGroupId(`mermaid-${n.id}`);
            shapes.main.groupId = groupId;
            for (const extra of shapes.extras) { extra.groupId = groupId; placement.add(extra, parent); }
        }
        placed.set(n.id, { shape: shapes.main, node: { ...n, x, y, centerX: x + n.width / 2, centerY: y + n.height / 2 } });
    }

    for (const e of diagram.edges) {
        if (e.style === 'invisible') continue;
        const from = placed.get(e.from);
        const to = placed.get(e.to);
        if (!from || !to) continue;
        const v = edgeVisual(e);
        const opts = {
            stroke: v.stroke,
            strokeWidth: v.strokeWidth,
            roughness: 1,
            strokeDasharray: v.dash,
            label: e.label || '',
            labelColor: e.labelColor || edgeStrokeColor(),
        };
        const parent = frameFor(lca(from.node.subgraph, to.node.subgraph));
        try {
            if (e.from === e.to) {
                const loop = selfLoopPoints(from.node);
                const arrow = new window.Arrow(loop.start, loop.end, {
                    ...opts,
                    arrowCurved: 'curved',
                    startArrowhead: ARROWHEAD_FOR[e.startHead] || 'none',
                    endArrowhead: ARROWHEAD_FOR[e.endHead] || (e.startHead ? 'none' : 'arrow'),
                });
                placement.add(arrow, parent);
                placement.bind(arrow, from.shape, true, loop.start);
                placement.bind(arrow, from.shape, false, loop.end);
                continue;
            }
            const { start, end } = getCanvasFlowchartEdgePoints(from.node, to.node);
            if (!e.endHead && !e.startHead) {
                placement.add(new window.Line(start, end, opts), parent);
                continue;
            }
            // One arrow with independent heads covers -->, <--, <-->, o--o, x--x.
            const arrow = new window.Arrow(start, end, {
                ...opts,
                startArrowhead: e.startHead ? (ARROWHEAD_FOR[e.startHead] || 'arrow') : 'none',
                endArrowhead: e.endHead ? (ARROWHEAD_FOR[e.endHead] || 'arrow') : 'none',
            });
            placement.add(arrow, parent);
            placement.bind(arrow, from.shape, true, start);
            placement.bind(arrow, to.shape, false, end);
        } catch (err) {
            console.warn('[FlowchartRenderer] Edge creation failed:', e, err);
        }
    }

    const first = placed.values().next().value;
    return placement.finish(first?.shape, 'mermaid-flowchart-create');
}
