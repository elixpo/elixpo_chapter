/* eslint-disable */
/**
 * MermaidNativeLayout — lay native Mermaid diagrams out with Mermaid itself.
 *
 * This is how Excalidraw's "Mermaid to Excalidraw" matches mermaid.live: the
 * real mermaid library renders the source (dagre layout, its own spacing and
 * edge routing), the geometry is read back from the rendered SVG, and the
 * editable shapes are placed there. Our parsers still decide what each node,
 * edge and marker *is*; only positions, sizes and edge routes come from
 * Mermaid.
 *
 * Mermaid 11 SVG contract used here (ids are prefixed with the render id):
 *   g.node#<rid>-flowchart-<id>-<n> | -classId-<id>-<n> | -entity-<id>-<n> | -note<k>
 *       transform="translate(cx, cy)", content box from getBBox()
 *   g.cluster#<rid>-<subgraphId> > rect[x,y,width,height]
 *   path[data-id] with data-points = base64(JSON [{x,y}, ...]) for edges:
 *       flowchart  L_<from>_<to>_<k>          (k: per-pair occurrence)
 *                  <id>-cyclic-special-1|mid|2 (self loop, three segments)
 *       class      id_<a>_<b>_<counter>, edgeNote<k>
 *       er         id_entity-<a>-<i>_entity-<b>-<j>_<k>
 *
 * Everything degrades: without a browser DOM, a mermaid loader, or when the
 * SVG does not contain what we need, the diagram keeps the built-in layout.
 */

import { DEFAULT_SHAPE_LABEL_FONT_SIZE, SHAPE_LABEL_PADDING_X } from './ShapeLabelLayout.js';

const NODE_PREFIXES = [
    { re: /^flowchart-(.+)-\d+$/, kind: 'node' },
    { re: /^classId-(.+)-\d+$/, kind: 'node' },
    { re: /^entity-(.+)-\d+$/, kind: 'node' },
    { re: /^note(\d+)$/, kind: 'note' },
];

let _layoutSeq = 0;

function stripPrefix(id, renderId) {
    const prefix = `${renderId}-`;
    return id && id.startsWith(prefix) ? id.slice(prefix.length) : id || '';
}

function decodePoints(attr) {
    if (!attr) return null;
    try {
        const json = typeof atob === 'function' ? atob(attr) : Buffer.from(attr, 'base64').toString('utf8');
        const points = JSON.parse(json);
        return Array.isArray(points) && points.every(p => Number.isFinite(p?.x) && Number.isFinite(p?.y))
            ? points.map(p => ({ x: p.x, y: p.y }))
            : null;
    } catch {
        return null;
    }
}

function parseTranslate(transform) {
    const m = /translate\(\s*([-\d.e]+)[\s,]+([-\d.e]+)\s*\)/.exec(transform || '');
    return m ? { x: Number(m[1]), y: Number(m[2]) } : null;
}

/**
 * Read node boxes, cluster boxes and edge routes from a *live* rendered SVG
 * element (getBBox needs layout). Pure DOM reading; no engine access.
 */
export function extractMermaidGeometry(svgEl, renderId) {
    const viewBox = (svgEl.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
    const geometry = {
        width: Number.isFinite(viewBox[2]) ? viewBox[2] : 0,
        height: Number.isFinite(viewBox[3]) ? viewBox[3] : 0,
        nodes: new Map(),
        notes: new Map(),
        clusters: new Map(),
        edges: new Map(),
    };
    for (const g of svgEl.querySelectorAll('g.node')) {
        const local = stripPrefix(g.id, renderId);
        const hit = NODE_PREFIXES.map(p => ({ ...p, m: p.re.exec(local) })).find(p => p.m);
        const at = parseTranslate(g.getAttribute('transform'));
        if (!hit || !at || typeof g.getBBox !== 'function') continue;
        const b = g.getBBox();
        if (!(b.width > 0 && b.height > 0)) continue;
        const box = { x: at.x + b.x, y: at.y + b.y, width: b.width, height: b.height };
        if (hit.kind === 'note') geometry.notes.set(`__note_${hit.m[1]}`, box);
        else geometry.nodes.set(hit.m[1], box);
    }
    for (const g of svgEl.querySelectorAll('g.cluster')) {
        const rect = g.querySelector(':scope > rect') || g.querySelector('rect');
        if (!rect) continue;
        const box = ['x', 'y', 'width', 'height'].map(k => Number(rect.getAttribute(k)));
        if (box.every(Number.isFinite) && box[2] > 0 && box[3] > 0) {
            geometry.clusters.set(stripPrefix(g.id, renderId), { x: box[0], y: box[1], width: box[2], height: box[3] });
        }
    }
    for (const path of svgEl.querySelectorAll('path[data-points]')) {
        const key = path.getAttribute('data-id') || stripPrefix(path.id, renderId);
        const points = decodePoints(path.getAttribute('data-points'));
        if (key && points && points.length >= 2) geometry.edges.set(key, points);
    }
    return geometry;
}

// ── applying geometry (pure; unit-tested) ──

/** A self loop is drawn as three segments around a dummy node; join them. */
function selfLoopRoute(edges, id) {
    const parts = ['1', 'mid', '2'].map(s => edges.get(`${id}-cyclic-special-${s}`));
    if (parts.some(p => !p)) return null;
    const route = [...parts[0]];
    for (const part of parts.slice(1)) route.push(...part.slice(1));
    return route;
}

/** Flowchart edges are keyed L_<from>_<to>_<k> with k counting repeats of the pair. */
function flowchartEdgeRoutes(edges, geometryEdges) {
    const seen = new Map();
    return edges.map((e) => {
        if (e.from === e.to) return selfLoopRoute(geometryEdges, e.from);
        const pair = `${e.from}\u0000${e.to}`;
        const k = seen.get(pair) || 0;
        seen.set(pair, k + 1);
        return geometryEdges.get(`L_${e.from}_${e.to}_${k}`) || null;
    });
}

/** Class relations are numbered in source order: id_<a>_<b>_<1..n>. */
function classRelationRoutes(relations, geometryEdges) {
    const numbered = [...geometryEdges.entries()]
        .map(([key, points]) => ({ m: /^id_(.+)_(\d+)$/.exec(key), points }))
        .filter(x => x.m)
        .sort((a, b) => Number(a.m[2]) - Number(b.m[2]));
    return relations.map((r, i) => {
        const hit = numbered[i];
        if (!hit) return null;
        const names = hit.m[1];
        // Mermaid may store either orientation; confirm both ends belong to this relation.
        const ok = names === `${r.from}_${r.to}` || names === `${r.to}_${r.from}`;
        if (!ok) return null;
        return names === `${r.from}_${r.to}` ? hit.points : [...hit.points].reverse();
    });
}

function finiteBox(b) {
    return b && [b.x, b.y, b.width, b.height].every(Number.isFinite) && b.width > 0 && b.height > 0;
}

/**
 * Return a copy of a parsed flowchart positioned by Mermaid's geometry.
 * Falls back to the original diagram unless every node has a Mermaid box.
 */
export function applyFlowchartGeometry(diagram, geometry) {
    if (!diagram?.nodes?.length || !geometry) return diagram;
    if (!diagram.nodes.every(n => finiteBox(geometry.nodes.get(n.id)))) return diagram;
    const nodes = diagram.nodes.map(n => ({ ...n, ...pickBox(geometry.nodes.get(n.id)) }));
    const routes = flowchartEdgeRoutes(diagram.edges || [], geometry.edges);
    const edges = (diagram.edges || []).map((e, i) => (routes[i] ? { ...e, points: routes[i] } : { ...e }));
    const subgraphs = diagram.subgraphs?.map(sg => {
        const box = geometry.clusters.get(sg.id);
        return finiteBox(box) ? { ...sg, ...pickBox(box) } : sg;
    });
    return {
        ...diagram,
        nodes,
        edges,
        ...(subgraphs ? { subgraphs } : {}),
        width: Math.max(geometry.width, ...nodes.map(n => n.x + n.width)),
        height: Math.max(geometry.height, ...nodes.map(n => n.y + n.height)),
        layout: 'mermaid',
    };
}

/**
 * Attach Mermaid geometry to a parsed class diagram. The class renderer's
 * layout step reads `diagram.mermaidGeometry` and uses it instead of the
 * built-in layered layout.
 */
export function applyClassGeometry(diagram, geometry) {
    if (!diagram?.classes?.length || !geometry) return diagram;
    if (!diagram.classes.every(c => finiteBox(geometry.nodes.get(c.id)))) return diagram;
    const relationRoutes = classRelationRoutes(diagram.relations || [], geometry.edges);
    const noteRoutes = (diagram.notes || []).map((_, i) => geometry.edges.get(`edgeNote${i}`) || null);
    return {
        ...diagram,
        mermaidGeometry: {
            width: geometry.width,
            height: geometry.height,
            classes: new Map(diagram.classes.map(c => [c.id, pickBox(geometry.nodes.get(c.id))])),
            notes: new Map([...geometry.notes.entries()].map(([id, box]) => [id, pickBox(box)])),
            namespaces: new Map([...geometry.clusters.entries()].map(([id, box]) => [id, pickBox(box)])),
            relationRoutes,
            noteRoutes,
        },
    };
}

function pickBox(b) {
    return { x: b.x, y: b.y, width: b.width, height: b.height };
}

// ── browser entry point ──

const LAYOUT_TYPES = new Set(['flowchart', 'class']);

export function supportsMermaidLayout(type) {
    return LAYOUT_TYPES.has(type);
}

/**
 * Render `src` with Mermaid, read its geometry, and return the diagram
 * positioned like mermaid.live. Resolves to the unchanged diagram whenever
 * that is not possible (no DOM, no mermaid, render error, missing nodes).
 * `restoreConfig` is called afterwards so the caller can re-apply its own
 * mermaid.initialize settings.
 */
export async function layoutWithMermaid(src, type, diagram, mermaid, restoreConfig) {
    if (!supportsMermaidLayout(type) || !diagram) return diagram;
    if (typeof document === 'undefined' || !document.body) return diagram;
    if (!mermaid || typeof mermaid.render !== 'function' || typeof mermaid.initialize !== 'function') return diagram;

    _layoutSeq += 1;
    const renderId = `lixsketch-layout-${Date.now().toString(36)}-${_layoutSeq}`;
    const host = document.createElement('div');
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText = 'position:absolute;left:-100000px;top:0;visibility:hidden;pointer-events:none;';
    try {
        // Measure text the way canvas labels draw it: lixFont at the label
        // size, with the label padding, so Mermaid's boxes fit our labels.
        mermaid.initialize({
            startOnLoad: false,
            securityLevel: 'strict',
            theme: 'default',
            fontFamily: 'lixFont, sans-serif',
            themeVariables: { fontFamily: 'lixFont, sans-serif', fontSize: `${DEFAULT_SHAPE_LABEL_FONT_SIZE}px` },
            flowchart: { padding: SHAPE_LABEL_PADDING_X, htmlLabels: true },
            class: { padding: SHAPE_LABEL_PADDING_X },
        });
        const { svg } = await mermaid.render(renderId, src);
        host.innerHTML = svg;
        document.body.appendChild(host);
        const svgEl = host.querySelector('svg');
        if (!svgEl) return diagram;
        const geometry = extractMermaidGeometry(svgEl, renderId);
        return type === 'flowchart' ? applyFlowchartGeometry(diagram, geometry) : applyClassGeometry(diagram, geometry);
    } catch (err) {
        console.warn('[Mermaid] layout pass failed; using built-in layout:', err?.message || err);
        return diagram;
    } finally {
        host.remove();
        restoreConfig?.();
    }
}
