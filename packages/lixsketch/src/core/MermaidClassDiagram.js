/* eslint-disable */
/**
 * MermaidClassDiagram — native `classDiagram` support.
 *
 * Parses classes (block and `Class : member` forms), members with
 * visibility (+ - # ~), static `$` / abstract `*` classifiers, generics
 * `~T~`, annotations (`<<interface>>` inside or `<<abstract>> Name`),
 * labels `class A["Label"]`, relationships (inheritance, realization,
 * composition, aggregation, association, dependency, link solid/dashed,
 * two-way) with cardinalities and labels, `namespace` groups, notes
 * (`note for X "…"`, `note "…"`), `direction`, cssClass/style/classDef.
 *
 * Layout reuses the layered layout (parents above children); canvas output
 * is native shapes: each class is a grouped stack of Rectangles (outline,
 * name, attributes, methods), relations are bound Arrows/Lines, namespaces
 * are Frames.
 */

import { layeredLayout } from './MermaidLayout.js';
import { parseStyleList } from './MermaidFlowchartParser.js';
import { beginDiagram, contrastText, escapeXml, nextGroupId } from './MermaidCanvas.js';

const REL_RE = /^([\p{L}\p{N}_.~-]+)\s*(?:"([^"]*)"\s*)?(<\||\*|o|<)?(--|\.\.)(\|>|\*|o|>)?\s*(?:"([^"]*)"\s*)?([\p{L}\p{N}_.~-]+)\s*(?::\s*(.*))?$/u;

function generic(name) {
    return String(name).replace(/~([^~]*)~/g, '<$1>');
}

export function parseMember(raw) {
    let text = raw.trim();
    let classifier = null;
    if (/[$*]$/.test(text)) { classifier = text.endsWith('$') ? 'static' : 'abstract'; text = text.slice(0, -1).trim(); }
    let visibility = null;
    if (/^[+\-#~]/.test(text)) { visibility = text[0]; text = text.slice(1).trim(); }
    const isMethod = text.includes('(');
    if (isMethod) {
        const m = text.match(/^(.*?\))\s*([$*])?\s*(.*)$/);
        if (m) {
            if (m[2]) classifier = m[2] === '$' ? 'static' : 'abstract';
            text = m[1] + (m[3] ? ` ${m[3]}` : '');
        }
    }
    return { visibility, name: generic(text), kind: isMethod ? 'method' : 'attribute', classifier, text: `${visibility || ''}${generic(text)}${classifier === 'static' ? '$' : classifier === 'abstract' ? '*' : ''}` };
}

const RELATION_KIND = (left, line, right) => {
    const dashed = line === '..';
    const mark = left || right;
    if (mark === '<|' || mark === '|>') return dashed ? 'realization' : 'inheritance';
    if (mark === '*') return 'composition';
    if (mark === 'o') return 'aggregation';
    if (mark === '<' || mark === '>') return dashed ? 'dependency' : 'association';
    return dashed ? 'link-dashed' : 'link';
};

export function parseClassDiagram(src) {
    const errors = [];
    const lines = String(src ?? '').split('\n');
    const classes = new Map();
    const order = [];
    const relations = [];
    const namespaces = [];
    const notes = [];
    const classDefs = new Map();
    let direction = 'TB';
    let header = -1;
    let current = null;
    let currentNs = null;

    const ensure = (rawName) => {
        const id = String(rawName).replace(/~[^~]*~/g, '').trim();
        let c = classes.get(id);
        if (!c) {
            c = { id, name: generic(rawName), label: null, annotations: [], attributes: [], methods: [], namespace: currentNs ? currentNs.id : null, classes: [], style: {} };
            classes.set(id, c);
            order.push(id);
            if (currentNs) currentNs.classes.push(id);
        } else if (/~/.test(rawName)) c.name = generic(rawName);
        if (currentNs && !c.namespace) { c.namespace = currentNs.id; currentNs.classes.push(id); }
        return c;
    };
    const addMember = (c, raw) => {
        const t = raw.trim();
        if (!t) return;
        const ann = t.match(/^<<(.+)>>$/);
        if (ann) { c.annotations.push(ann[1].trim()); return; }
        const m = parseMember(t);
        (m.kind === 'method' ? c.methods : c.attributes).push(m);
    };

    for (let i = 0; i < lines.length; i += 1) {
        const lineNo = i + 1;
        const line = lines[i].trim().replace(/;$/, '');
        if (!line || line.startsWith('%%')) continue;
        if (header < 0) {
            if (!/^classDiagram(-v2)?\b/i.test(line)) return { diagram: null, errors: [{ line: lineNo, message: 'Expected "classDiagram"' }] };
            header = i;
            continue;
        }
        let m;
        if (current) {
            if (line === '}') { current = null; continue; }
            addMember(current, line);
            continue;
        }
        if ((m = line.match(/^direction\s+(TB|TD|BT|LR|RL)$/i))) { direction = m[1].toUpperCase() === 'TD' ? 'TB' : m[1].toUpperCase(); continue; }
        if (/^(click|link|callback|accTitle|accDescr)\b/i.test(line)) continue;
        if ((m = line.match(/^namespace\s+([\p{L}\p{N}_.-]+)\s*\{$/u))) {
            currentNs = { id: m[1], label: m[1], classes: [] };
            namespaces.push(currentNs);
            continue;
        }
        if (line === '}' && currentNs) { currentNs = null; continue; }
        if ((m = line.match(/^class\s+([\p{L}\p{N}_.~-]+)(?:\["([^"]*)"\])?(?::::([\w-]+))?\s*(\{)?\s*(.*?)\s*(\})?$/u))) {
            const c = ensure(m[1]);
            if (m[2]) c.label = m[2];
            if (m[3]) c.classes.push(m[3]);
            if (m[4] && !m[6]) { current = c; if (m[5]) addMember(c, m[5]); }
            else if (m[4] && m[6] && m[5]) m[5].split(/;|\n/).forEach(part => addMember(c, part));
            continue;
        }
        if ((m = line.match(/^<<(.+)>>\s+([\p{L}\p{N}_.~-]+)$/u))) { ensure(m[2]).annotations.push(m[1].trim()); continue; }
        if ((m = line.match(/^note\s+for\s+([\p{L}\p{N}_.~-]+)\s+"(.*)"$/u))) { ensure(m[1]); notes.push({ for: m[1], text: m[2].replace(/\\n|<br\s*\/?>/gi, '\n') }); continue; }
        if ((m = line.match(/^note\s+"(.*)"$/))) { notes.push({ for: null, text: m[1].replace(/\\n|<br\s*\/?>/gi, '\n') }); continue; }
        if ((m = line.match(/^classDef\s+([\w,-]+)\s+(.+)$/))) { m[1].split(',').forEach(n => classDefs.set(n.trim(), parseStyleList(m[2]))); continue; }
        if ((m = line.match(/^cssClass\s+"([^"]+)"\s+([\w-]+)$/))) { m[1].split(',').forEach(id => ensure(id.trim()).classes.push(m[2])); continue; }
        if ((m = line.match(/^style\s+([\p{L}\p{N}_-]+)\s+(.+)$/u))) { Object.assign(ensure(m[1]).style, parseStyleList(m[2])); continue; }
        if ((m = line.match(REL_RE))) {
            const [, a, cardA, left, lineKind, right, cardB, b, label] = m;
            ensure(a);
            ensure(b);
            relations.push({
                from: a.replace(/~[^~]*~/g, ''), to: b.replace(/~[^~]*~/g, ''),
                kind: RELATION_KIND(left, lineKind, right), leftMarker: left || null, rightMarker: right || null,
                dashed: lineKind === '..', fromCardinality: cardA ?? null, toCardinality: cardB ?? null, label: label ? label.trim() : null, line: lineNo,
            });
            continue;
        }
        if ((m = line.match(/^([\p{L}\p{N}_.~-]+)\s*:\s*(.+)$/u))) { addMember(ensure(m[1]), m[2]); continue; }
        if ((m = line.match(/^([\p{L}\p{N}_.~-]+)$/u))) { ensure(m[1]); continue; }
        errors.push({ line: lineNo, message: `Parse error on line ${lineNo}: unrecognised statement "${line}"` });
    }
    if (current) errors.push({ line: lines.length, message: `Parse error: class "${current.id}" is missing '}'` });
    if (currentNs) errors.push({ line: lines.length, message: `Parse error: namespace "${currentNs.id}" is missing '}'` });
    if (header < 0) errors.push({ line: 1, message: 'Expected "classDiagram"' });
    for (const c of classes.values()) {
        const merged = {};
        for (const k of c.classes) Object.assign(merged, classDefs.get(k) || {});
        c.style = { ...merged, ...c.style };
    }
    if (!classes.size && !errors.length) errors.push({ line: header + 1, message: 'Parse error: the class diagram has no classes' });
    const diagram = { type: 'classDiagram', direction, classes: order.map(id => classes.get(id)), relations, namespaces, notes };
    return { diagram: errors.length ? null : diagram, errors };
}

// ── layout ──

const HEADER_H = 30;
const ANN_H = 16;
const ROW_H = 18;
const SECTION_PAD = 8;

export function classBoxSize(c) {
    const title = c.label || c.name;
    const texts = [title, ...c.annotations.map(a => `«${a}»`), ...c.attributes.map(m => m.text), ...c.methods.map(m => m.text)];
    const width = Math.max(140, Math.max(...texts.map(t => t.length)) * 7.4 + 28);
    const header = HEADER_H + c.annotations.length * ANN_H;
    const attrs = Math.max(1, c.attributes.length) * ROW_H + SECTION_PAD;
    const methods = Math.max(1, c.methods.length) * ROW_H + SECTION_PAD;
    return { width: Math.round(width), height: header + attrs + methods, headerH: header, attrsH: attrs, methodsH: methods };
}

/** Parent/whole/source on top: rank edges point from the marker side. */
function rankEdge(r) {
    const rightParent = r.rightMarker === '|>' || r.rightMarker === '*' || r.rightMarker === 'o';
    return rightParent ? { from: r.to, to: r.from } : { from: r.from, to: r.to };
}

export function layoutClassDiagram(diagram) {
    const sizes = new Map(diagram.classes.map(c => [c.id, classBoxSize(c)]));
    const noteNodes = diagram.notes.map((n, i) => ({ id: `__note_${i}`, ...n, width: Math.max(120, Math.max(...n.text.split('\n').map(l => l.length)) * 7 + 24), height: n.text.split('\n').length * 16 + 20 }));
    const layout = layeredLayout({
        direction: diagram.direction,
        nodes: [
            ...diagram.classes.map(c => ({ id: c.id, width: sizes.get(c.id).width, height: sizes.get(c.id).height, cluster: c.namespace })),
            ...noteNodes.map(n => ({ id: n.id, width: n.width, height: n.height, cluster: n.for ? diagram.classes.find(c => c.id === n.for)?.namespace : null })),
        ],
        edges: [...diagram.relations.map(rankEdge), ...noteNodes.filter(n => n.for).map(n => ({ from: n.id, to: n.for }))],
        clusters: diagram.namespaces.map(ns => ({ id: ns.id })),
    }, { nodeSep: 60, rankSep: 90, clusterPad: 24, clusterTitle: 28 });
    return {
        width: layout.width,
        height: layout.height,
        classes: diagram.classes.map(c => ({ ...c, ...sizes.get(c.id), ...layout.nodes.get(c.id) })),
        notes: noteNodes.map(n => ({ ...n, ...layout.nodes.get(n.id) })),
        namespaces: diagram.namespaces.filter(ns => layout.clusters.has(ns.id)).map(ns => ({ ...ns, ...layout.clusters.get(ns.id) })),
        relations: diagram.relations,
    };
}

// LixSketch arrowheads standing in for UML markers.
// UML markers → LixSketch arrowheads: inheritance/realization = hollow
// triangle, composition = filled diamond, aggregation = hollow diamond,
// association/dependency = open arrow.
export const CLASS_MARKER_HEAD = { '<|': 'triangle_outline', '|>': 'triangle_outline', '*': 'diamond', o: 'diamond_outline', '<': 'arrow', '>': 'arrow' };

function themeColors() {
    const dark = typeof document === 'undefined' || !(document.body?.classList.contains('theme-light'));
    return dark
        ? { bg: '#1e1e28', box: '#2a2438', header: '#3d2e58', stroke: '#9d86df', text: '#ece8f6', muted: '#b8b0cc', line: '#a0a0b0', note: '#3a3520', noteText: '#d4c870', ns: '#777' }
        : { bg: '#fbfaf6', box: '#ffffff', header: '#eee9f7', stroke: '#7667a8', text: '#343046', muted: '#5f5a70', line: '#62627a', note: '#fffce0', noteText: '#5e5230', ns: '#aaa99f' };
}

const memberLabel = (list) => (list.length ? list.map(m => m.text).join('\n') : ' ');
const headerLabel = (c) => [...c.annotations.map(a => `«${a}»`), c.label || c.name].join('\n');

function boundary(box, toward) {
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const dx = toward.x - cx;
    const dy = toward.y - cy;
    if (!dx && !dy) return { x: cx, y: cy };
    const s = 1 / Math.max(Math.abs(dx) / (box.width / 2), Math.abs(dy) / (box.height / 2));
    return { x: cx + dx * s, y: cy + dy * s };
}

export function renderClassPreviewSVG(diagram, opts = { width: 620, height: 450 }) {
    if (!diagram?.classes?.length) return '';
    const T = themeColors();
    const L = layoutClassDiagram(diagram);
    const M = 40;
    const W = opts.width || L.width + M * 2;
    const H = opts.height || L.height + M * 2;
    const scale = Math.min((W - M * 2) / Math.max(1, L.width), (H - M * 2) / Math.max(1, L.height), 1.5);
    const ox = (W - L.width * scale) / 2;
    const oy = (H - L.height * scale) / 2;
    const X = (v) => v * scale + ox;
    const Y = (v) => v * scale + oy;
    let s = `<rect width="${W}" height="${H}" fill="${T.bg}" rx="8"/>`;
    const defs = `<defs>
<marker id="cd-tri" markerWidth="12" markerHeight="10" refX="11" refY="5" orient="auto-start-reverse"><polygon points="1,1 11,5 1,9" fill="${T.bg}" stroke="${T.line}"/></marker>
<marker id="cd-dia-f" markerWidth="14" markerHeight="8" refX="13" refY="4" orient="auto-start-reverse"><polygon points="1,4 7,1 13,4 7,7" fill="${T.line}" stroke="${T.line}"/></marker>
<marker id="cd-dia-o" markerWidth="14" markerHeight="8" refX="13" refY="4" orient="auto-start-reverse"><polygon points="1,4 7,1 13,4 7,7" fill="${T.bg}" stroke="${T.line}"/></marker>
<marker id="cd-arrow" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto-start-reverse"><polyline points="1,1 9,4 1,7" fill="none" stroke="${T.line}" stroke-width="1.3"/></marker></defs>`;
    const markerId = { '<|': 'cd-tri', '|>': 'cd-tri', '*': 'cd-dia-f', o: 'cd-dia-o', '<': 'cd-arrow', '>': 'cd-arrow' };
    for (const ns of L.namespaces) {
        s += `<g data-cd-type="namespace"><rect x="${X(ns.x)}" y="${Y(ns.y)}" width="${ns.width * scale}" height="${ns.height * scale}" rx="6" fill="none" stroke="${T.ns}" stroke-dasharray="4 2"/><text x="${X(ns.x) + 8}" y="${Y(ns.y) + 16 * scale}" fill="${T.muted}" font-size="${11 * scale}" font-family="lixFont">${escapeXml(ns.label)}</text></g>`;
    }
    const byId = new Map(L.classes.map(c => [c.id, c]));
    for (const n of L.notes) byId.set(n.id, n);
    for (const r of L.relations) {
        const a = byId.get(r.from);
        const b = byId.get(r.to);
        if (!a || !b) continue;
        const ac = { x: a.x + a.width / 2, y: a.y + a.height / 2 };
        const bc = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
        const p1 = boundary(a, bc);
        const p2 = boundary(b, ac);
        const ms = r.leftMarker ? ` marker-start="url(#${markerId[r.leftMarker]})"` : '';
        const me = r.rightMarker ? ` marker-end="url(#${markerId[r.rightMarker]})"` : '';
        s += `<g data-cd-type="relation" data-cd-kind="${r.kind}"><line x1="${X(p1.x)}" y1="${Y(p1.y)}" x2="${X(p2.x)}" y2="${Y(p2.y)}" stroke="${T.line}" stroke-width="1.3"${r.dashed ? ' stroke-dasharray="5 3"' : ''}${ms}${me}/>`;
        const fs = 10 * scale;
        if (r.label) s += `<text x="${X((p1.x + p2.x) / 2)}" y="${Y((p1.y + p2.y) / 2) - 4}" text-anchor="middle" fill="${T.muted}" font-size="${fs}" font-family="lixFont">${escapeXml(r.label)}</text>`;
        const near = (p, q, t) => ({ x: p.x + (q.x - p.x) * t + 8, y: p.y + (q.y - p.y) * t - 6 });
        if (r.fromCardinality) { const p = near(p1, p2, 0.12); s += `<text x="${X(p.x)}" y="${Y(p.y)}" fill="${T.muted}" font-size="${fs}" font-family="lixFont">${escapeXml(r.fromCardinality)}</text>`; }
        if (r.toCardinality) { const p = near(p2, p1, 0.12); s += `<text x="${X(p.x)}" y="${Y(p.y)}" fill="${T.muted}" font-size="${fs}" font-family="lixFont">${escapeXml(r.toCardinality)}</text>`; }
        s += '</g>';
    }
    for (const n of L.notes) {
        const target = n.for ? byId.get(n.for) : null;
        if (target) s += `<line x1="${X(n.x + n.width / 2)}" y1="${Y(n.y + n.height)}" x2="${X(target.x + target.width / 2)}" y2="${Y(target.y)}" stroke="${T.line}" stroke-dasharray="3 3"/>`;
        s += `<g data-cd-type="note"><rect x="${X(n.x)}" y="${Y(n.y)}" width="${n.width * scale}" height="${n.height * scale}" fill="${T.note}" stroke="${T.line}"/>`;
        n.text.split('\n').forEach((l, i) => { s += `<text x="${X(n.x) + 8}" y="${Y(n.y) + (16 + i * 16) * scale}" fill="${T.noteText}" font-size="${11 * scale}" font-family="lixFont">${escapeXml(l)}</text>`; });
        s += '</g>';
    }
    for (const c of L.classes) {
        const fill = c.style.fill || T.box;
        const stroke = c.style.stroke || T.stroke;
        const text = c.style.labelColor || (c.style.fill ? contrastText(c.style.fill) : T.text);
        s += `<g data-cd-type="class" data-cd-id="${escapeXml(c.id)}"><rect x="${X(c.x)}" y="${Y(c.y)}" width="${c.width * scale}" height="${c.height * scale}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`;
        s += `<rect x="${X(c.x)}" y="${Y(c.y)}" width="${c.width * scale}" height="${c.headerH * scale}" fill="${c.style.fill || T.header}" stroke="${stroke}" stroke-width="1.5"/>`;
        headerLabel(c).split('\n').forEach((l, i, all) => {
            const isName = i === all.length - 1;
            s += `<text x="${X(c.x + c.width / 2)}" y="${Y(c.y + 19 + i * ANN_H)}" text-anchor="middle" fill="${text}" font-size="${(isName ? 13 : 10) * scale}" font-family="lixFont" ${isName ? 'font-weight="600"' : 'font-style="italic"'}>${escapeXml(l)}</text>`;
        });
        const ay = c.y + c.headerH;
        s += `<line x1="${X(c.x)}" y1="${Y(ay + c.attrsH)}" x2="${X(c.x + c.width)}" y2="${Y(ay + c.attrsH)}" stroke="${stroke}"/>`;
        c.attributes.forEach((m, i) => { s += `<text x="${X(c.x + 10)}" y="${Y(ay + 15 + i * ROW_H)}" fill="${text}" font-size="${11 * scale}" font-family="lixCode, monospace"${m.classifier === 'static' ? ' text-decoration="underline"' : ''}>${escapeXml(m.text)}</text>`; });
        c.methods.forEach((m, i) => { s += `<text x="${X(c.x + 10)}" y="${Y(ay + c.attrsH + 15 + i * ROW_H)}" fill="${text}" font-size="${11 * scale}" font-family="lixCode, monospace"${m.classifier === 'abstract' ? ' font-style="italic"' : ''}${m.classifier === 'static' ? ' text-decoration="underline"' : ''}>${escapeXml(m.text)}</text>`; });
        s += '</g>';
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${defs}${s}</svg>`;
}

export function renderClassOnCanvas(diagram) {
    if (!diagram?.classes?.length || !window.Rectangle || !window.Arrow || !window.Line || !window.Frame) return false;
    const T = themeColors();
    const L = layoutClassDiagram(diagram);
    const placement = beginDiagram({ width: L.width, height: L.height, title: 'Class diagram', diagramType: 'mermaid-class' });
    const { ox, oy } = placement;
    const frames = new Map(L.namespaces.map(ns => [ns.id, placement.makeFrame(ns.x + ox, ns.y + oy, ns.width, ns.height, ns.label)]));
    const outlines = new Map();
    let first = null;
    for (const c of L.classes) {
        const parent = (c.namespace && frames.get(c.namespace)) || placement.frame;
        const x = c.x + ox;
        const y = c.y + oy;
        const stroke = c.style.stroke || T.stroke;
        const text = c.style.labelColor || (c.style.fill ? contrastText(c.style.fill) : T.text);
        const base = { stroke, strokeWidth: 1.5, roughness: 0.6, labelColor: text, labelBg: false };
        const groupId = nextGroupId(`mermaid-class-${c.id}`);
        const outline = placement.add(new window.Rectangle(x, y, c.width, c.height, { ...base, fill: c.style.fill || T.box, fillStyle: 'solid', label: '' }), parent);
        const head = placement.add(new window.Rectangle(x, y, c.width, c.headerH, { ...base, fill: c.style.fill || T.header, fillStyle: 'solid', label: headerLabel(c), labelFontSize: 14 }), parent);
        const attrs = placement.add(new window.Rectangle(x, y + c.headerH, c.width, c.attrsH, { ...base, fill: 'transparent', fillStyle: 'none', label: memberLabel(c.attributes), labelFontSize: 12 }), parent);
        const methods = placement.add(new window.Rectangle(x, y + c.headerH + c.attrsH, c.width, c.methodsH, { ...base, fill: 'transparent', fillStyle: 'none', label: memberLabel(c.methods), labelFontSize: 12 }), parent);
        [outline, head, attrs, methods].forEach(s => { s.groupId = groupId; });
        outlines.set(c.id, { shape: outline, box: { x, y, width: c.width, height: c.height }, ns: c.namespace });
        if (!first) first = head;
    }
    for (const n of L.notes) {
        const x = n.x + ox;
        const y = n.y + oy;
        const note = placement.add(new window.Rectangle(x, y, n.width, n.height, { stroke: T.line, strokeWidth: 1, fill: T.note, fillStyle: 'solid', roughness: 0.6, label: n.text, labelColor: T.noteText, labelFontSize: 12 }));
        const target = n.for && outlines.get(n.for);
        if (target) {
            const p1 = boundary({ x, y, width: n.width, height: n.height }, { x: target.box.x + target.box.width / 2, y: target.box.y + target.box.height / 2 });
            const p2 = boundary(target.box, { x: x + n.width / 2, y: y + n.height / 2 });
            placement.add(new window.Line(p1, p2, { stroke: T.line, strokeWidth: 1, strokeDasharray: '3 3', roughness: 0 }));
        }
        if (!first) first = note;
    }
    for (const r of L.relations) {
        const a = outlines.get(r.from);
        const b = outlines.get(r.to);
        if (!a || !b) continue;
        const ac = { x: a.box.x + a.box.width / 2, y: a.box.y + a.box.height / 2 };
        const bc = { x: b.box.x + b.box.width / 2, y: b.box.y + b.box.height / 2 };
        const pa = boundary(a.box, bc);
        const pb = boundary(b.box, ac);
        const label = [r.fromCardinality, r.label, r.toCardinality].filter(Boolean).join('   ');
        const opts = { stroke: T.line, strokeWidth: 1.5, roughness: 0.6, strokeDasharray: r.dashed ? '5 3' : '', label, labelColor: T.muted, labelBg: false };
        const parent = a.ns && a.ns === b.ns ? frames.get(a.ns) : placement.frame;
        try {
            if (r.leftMarker || r.rightMarker) {
                // One arrow from `from` to `to`; each end carries its own marker.
                const arrow = placement.add(new window.Arrow(pa, pb, {
                    ...opts,
                    startArrowhead: r.leftMarker ? (CLASS_MARKER_HEAD[r.leftMarker] || 'arrow') : 'none',
                    endArrowhead: r.rightMarker ? (CLASS_MARKER_HEAD[r.rightMarker] || 'arrow') : 'none',
                }), parent);
                placement.bind(arrow, a.shape, true, pa);
                placement.bind(arrow, b.shape, false, pb);
            } else {
                placement.add(new window.Line(pa, pb, opts), parent);
            }
        } catch (err) {
            console.warn('[ClassDiagram] relation failed:', r, err);
        }
    }
    return placement.finish(first, 'mermaid-class-create');
}
