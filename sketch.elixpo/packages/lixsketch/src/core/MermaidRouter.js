/* eslint-disable */
/**
 * MermaidRouter — one entry point for Mermaid import, mirroring
 * Excalidraw's "Mermaid to Excalidraw":
 *
 *   native (editable LixSketch shapes): flowchart/graph, sequenceDiagram,
 *     classDiagram, erDiagram, pie, xychart
 *   image (rendered by the real mermaid library, inserted as one image):
 *     every other Mermaid type (state, gantt, journey, mindmap, timeline,
 *     gitGraph, quadrant, sankey, requirement, C4, block, packet,
 *     architecture, kanban, radar, treemap, zenuml, …) — and any native
 *     type whose source our parser cannot read but mermaid can.
 *
 * The mermaid library is never bundled with the engine. Hosts provide it
 * lazily: setMermaidLoader(() => import('mermaid')) or
 * window.__lixsketchMermaidLoader. Without a loader the image path and
 * mermaid's own syntax errors are unavailable; native types still work.
 */

import { parseMermaidFlowchart, stripFrontMatter } from './MermaidFlowchartParser.js';
import { renderFlowchartOnCanvas, renderFlowchartPreviewSVG } from './MermaidFlowchartRenderer.js';
import { parseSequenceDiagramWithErrors } from './MermaidSequenceParser.js';
import { renderSequenceOnCanvas, renderSequencePreviewSVG } from './MermaidSequenceRenderer.js';
import { parseClassDiagram, renderClassOnCanvas, renderClassPreviewSVG } from './MermaidClassDiagram.js';
import {
    parseChartDiagram,
    parseERDiagram,
    renderChartOnCanvas,
    renderChartPreviewSVG,
    renderEROnCanvas,
    renderERPreviewSVG,
} from './MermaidStructuredRenderer.js';

/** Mermaid diagram keywords and the path LixSketch takes for each. */
export const MERMAID_TYPES = [
    { keyword: 'flowchart', type: 'flowchart', path: 'native' },
    { keyword: 'flowchart-elk', type: 'flowchart', path: 'native' },
    { keyword: 'graph', type: 'flowchart', path: 'native' },
    { keyword: 'sequenceDiagram', type: 'sequence', path: 'native' },
    { keyword: 'classDiagram', type: 'class', path: 'native' },
    { keyword: 'classDiagram-v2', type: 'class', path: 'native' },
    { keyword: 'erDiagram', type: 'er', path: 'native' },
    { keyword: 'pie', type: 'pie', path: 'native' },
    { keyword: 'xychart-beta', type: 'xychart', path: 'native' },
    { keyword: 'xychart', type: 'xychart', path: 'native' },
    { keyword: 'stateDiagram', type: 'state', path: 'image' },
    { keyword: 'stateDiagram-v2', type: 'state', path: 'image' },
    { keyword: 'gantt', type: 'gantt', path: 'image' },
    { keyword: 'journey', type: 'journey', path: 'image' },
    { keyword: 'mindmap', type: 'mindmap', path: 'image' },
    { keyword: 'timeline', type: 'timeline', path: 'image' },
    { keyword: 'gitGraph', type: 'gitGraph', path: 'image' },
    { keyword: 'quadrantChart', type: 'quadrant', path: 'image' },
    { keyword: 'sankey-beta', type: 'sankey', path: 'image' },
    { keyword: 'requirementDiagram', type: 'requirement', path: 'image' },
    { keyword: 'C4Context', type: 'c4', path: 'image' },
    { keyword: 'C4Container', type: 'c4', path: 'image' },
    { keyword: 'C4Component', type: 'c4', path: 'image' },
    { keyword: 'C4Dynamic', type: 'c4', path: 'image' },
    { keyword: 'C4Deployment', type: 'c4', path: 'image' },
    { keyword: 'block-beta', type: 'block', path: 'image' },
    { keyword: 'packet-beta', type: 'packet', path: 'image' },
    { keyword: 'architecture-beta', type: 'architecture', path: 'image' },
    { keyword: 'kanban', type: 'kanban', path: 'image' },
    { keyword: 'radar-beta', type: 'radar', path: 'image' },
    { keyword: 'treemap-beta', type: 'treemap', path: 'image' },
    { keyword: 'zenuml', type: 'zenuml', path: 'image' },
];
const BY_KEYWORD = new Map(MERMAID_TYPES.map(t => [t.keyword.toLowerCase(), t]));

/** First meaningful line, skipping front matter, %% comments and %%{init}%%. */
function headerLine(src) {
    const { body } = stripFrontMatter(String(src ?? ''));
    for (const raw of body.split('\n')) {
        const line = raw.trim();
        if (!line || line.startsWith('%%')) continue;
        return line;
    }
    return '';
}

export function detectMermaidType(src) {
    const line = headerLine(src);
    if (!line) return { type: null, path: null, keyword: null };
    const keyword = line.split(/[\s;:{]/)[0].toLowerCase();
    const hit = BY_KEYWORD.get(keyword);
    if (hit) return { ...hit };
    // Header-less input is read as flowchart statements (Mermaid itself
    // requires a header; we stay lenient like before).
    return { type: 'flowchart', path: 'native', keyword: null, headerless: true };
}

// ── mermaid library (lazy, host provided) ──

let _loader = null;
let _mermaid = null;
let _initTheme = null;
let _renderSeq = 0;

export function setMermaidLoader(loader) {
    _loader = typeof loader === 'function' ? loader : null;
    _mermaid = null;
}

function themeIsDark() {
    if (typeof document === 'undefined') return true;
    if (document.body?.classList.contains('theme-light')) return false;
    if (document.body?.classList.contains('theme-dark')) return true;
    return document.documentElement?.classList.contains('dark') ?? true;
}

export async function getMermaid() {
    const loader = _loader || (typeof window !== 'undefined' ? window.__lixsketchMermaidLoader : null);
    if (!loader) return null;
    if (!_mermaid) {
        const mod = await loader();
        _mermaid = mod?.default || mod;
    }
    const theme = themeIsDark() ? 'dark' : 'default';
    if (_initTheme !== theme && typeof _mermaid?.initialize === 'function') {
        _mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme, fontFamily: 'lixFont, sans-serif' });
        _initTheme = theme;
    }
    return _mermaid;
}

/** Normalise a mermaid parse/render error to { line, message }. */
export function mermaidError(err) {
    const message = String(err?.message || err?.str || err || 'Invalid Mermaid syntax').trim();
    const hashLine = err?.hash?.loc?.first_line ?? (Number.isInteger(err?.hash?.line) ? err.hash.line + 1 : null);
    const line = hashLine;
    const fromText = message.match(/line (\d+)/i);
    return { line: Number.isFinite(line) ? line : fromText ? Number(fromText[1]) : null, message };
}

/** mermaid.parse — { ok: true } | { ok: false, error } | { ok: null } when no library. */
export async function validateWithMermaid(src) {
    const mermaid = await getMermaid().catch(() => null);
    if (!mermaid || typeof mermaid.parse !== 'function') return { ok: null };
    try {
        const result = await mermaid.parse(src);
        if (result === false) return { ok: false, error: { line: null, message: 'Invalid Mermaid syntax' } };
        return { ok: true };
    } catch (err) {
        return { ok: false, error: mermaidError(err) };
    }
}

export async function renderMermaidSVG(src) {
    const mermaid = await getMermaid();
    if (!mermaid) throw new Error('Mermaid renderer is not available in this host');
    _renderSeq += 1;
    const { svg } = await mermaid.render(`lixsketch-mermaid-${Date.now().toString(36)}-${_renderSeq}`, src);
    return svg;
}

// ── native parsing ──

/** Parse with the native parser for the detected type. */
export function parseNative(src) {
    const detected = detectMermaidType(src);
    switch (detected.type) {
        case 'flowchart': {
            const diagram = parseMermaidFlowchart(src);
            return { ...detected, diagram: diagram.errors.length || !diagram.nodes.length ? null : diagram, errors: diagram.errors };
        }
        case 'sequence': {
            const { diagram, errors } = parseSequenceDiagramWithErrors(src);
            return { ...detected, diagram, errors };
        }
        case 'class': {
            const { diagram, errors } = parseClassDiagram(src);
            return { ...detected, diagram, errors };
        }
        case 'er': {
            const diagram = parseERDiagram(src);
            return { ...detected, diagram, errors: diagram ? [] : [{ line: 1, message: 'Could not read the ER diagram (no entities)' }] };
        }
        case 'pie':
        case 'xychart': {
            const diagram = parseChartDiagram(src);
            return { ...detected, diagram, errors: diagram ? [] : [{ line: 1, message: 'Could not read the chart (no data series)' }] };
        }
        default:
            return { ...detected, diagram: null, errors: [] };
    }
}

const NATIVE_PREVIEW = {
    flowchart: renderFlowchartPreviewSVG,
    sequence: renderSequencePreviewSVG,
    class: (d) => renderClassPreviewSVG(d),
    er: renderERPreviewSVG,
    pie: renderChartPreviewSVG,
    xychart: renderChartPreviewSVG,
};
const NATIVE_CANVAS = {
    flowchart: renderFlowchartOnCanvas,
    sequence: renderSequenceOnCanvas,
    class: renderClassOnCanvas,
    er: renderEROnCanvas,
    pie: renderChartOnCanvas,
    xychart: renderChartOnCanvas,
};

function formatErrors(errors) {
    return errors.map(e => ({ line: e.line ?? null, message: e.message }));
}

/**
 * Decide how a source will be imported. Resolves:
 *   { ok, path: 'native'|'image', type, diagram?, errors[] , fallback? }
 */
export async function planMermaid(src) {
    if (!String(src ?? '').trim()) return { ok: false, path: null, type: null, errors: [{ line: null, message: 'Empty Mermaid source' }] };
    const native = parseNative(src);
    if (native.path === 'native' && native.diagram) {
        return { ok: true, path: 'native', type: native.type, diagram: native.diagram, errors: [] };
    }
    const check = await validateWithMermaid(src);
    if (check.ok === true) {
        return { ok: true, path: 'image', type: native.type, fallback: native.path === 'native', errors: [] };
    }
    if (check.ok === false) return { ok: false, path: native.path, type: native.type, errors: [check.error] };
    // no mermaid library available
    if (native.path === 'image') {
        return { ok: false, path: 'image', type: native.type, errors: [{ line: null, message: `"${native.keyword}" diagrams are rendered by the Mermaid library, which is not available here` }] };
    }
    return { ok: false, path: 'native', type: native.type, errors: formatErrors(native.errors.length ? native.errors : [{ line: null, message: 'Invalid Mermaid syntax' }]) };
}

/** Preview: { ok, svg, path, type, errors }. */
export async function previewMermaid(src) {
    const plan = await planMermaid(src);
    if (!plan.ok) return { ...plan, svg: '' };
    try {
        const svg = plan.path === 'native' ? NATIVE_PREVIEW[plan.type](plan.diagram) : await renderMermaidSVG(src);
        return { ...plan, svg };
    } catch (err) {
        return { ...plan, ok: false, svg: '', errors: [mermaidError(err)] };
    }
}

// ── image placement ──

function svgSize(svg) {
    const viewBox = svg.match(/viewBox="\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*"/);
    if (viewBox) return { width: Number(viewBox[1]), height: Number(viewBox[2]) };
    const w = svg.match(/<svg[^>]*\swidth="([\d.]+)/);
    const h = svg.match(/<svg[^>]*\sheight="([\d.]+)/);
    return { width: w ? Number(w[1]) : 600, height: h ? Number(h[1]) : 400 };
}

function toBase64(text) {
    if (typeof btoa === 'function') {
        const bytes = new TextEncoder().encode(text);
        let binary = '';
        for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        return btoa(binary);
    }
    return Buffer.from(text, 'utf8').toString('base64');
}

export function svgToDataUrl(svg) {
    return `data:image/svg+xml;base64,${toBase64(svg)}`;
}

/** Insert an SVG string as one image shape centred on the viewport. */
export function placeSvgImage(svg, { source = '', type = 'mermaid' } = {}) {
    if (!window.svg || !window.ImageShape) return false;
    const { width: w0, height: h0 } = svgSize(svg);
    const maxW = 1200;
    const scale = w0 > maxW ? maxW / w0 : 1;
    const width = Math.round(w0 * scale);
    const height = Math.round(h0 * scale);
    const vb = window.currentViewBox || { x: 0, y: 0, width: window.innerWidth || 1200, height: window.innerHeight || 800 };
    const x = vb.x + vb.width / 2 - width / 2;
    const y = vb.y + vb.height / 2 - height / 2;
    const ns = 'http://www.w3.org/2000/svg';
    const el = document.createElementNS(ns, 'image');
    const href = svgToDataUrl(svg);
    el.setAttribute('href', href);
    el.setAttribute('x', x);
    el.setAttribute('y', y);
    el.setAttribute('width', width);
    el.setAttribute('height', height);
    el.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    el.setAttribute('data-file-size', String(href.length));
    el.setAttribute('data-mermaid-type', type);
    if (source) el.setAttribute('data-mermaid-source', source.slice(0, 20000));
    window.svg.appendChild(el);
    const undoBatch = window.beginUndoBatch?.();
    const shape = new window.ImageShape(el);
    window.shapes.push(shape);
    window.pushCreateAction?.(shape);
    window.endUndoBatch?.(undoBatch, 'mermaid-image-create');
    window.currentShape = shape;
    if (typeof shape.selectImage === 'function') shape.selectImage();
    return true;
}

/** Place on canvas: { ok, path, type, errors }. */
export async function renderMermaidOnCanvas(src) {
    const plan = await planMermaid(src);
    if (!plan.ok) return plan;
    try {
        if (plan.path === 'native') {
            const ok = NATIVE_CANVAS[plan.type](plan.diagram);
            return { ...plan, ok: !!ok, errors: ok ? [] : [{ line: null, message: 'Could not place the diagram' }] };
        }
        const svg = await renderMermaidSVG(src);
        const ok = placeSvgImage(svg, { source: src, type: plan.type });
        return { ...plan, ok, errors: ok ? [] : [{ line: null, message: 'Could not insert the rendered diagram' }] };
    } catch (err) {
        return { ...plan, ok: false, errors: [mermaidError(err)] };
    }
}
