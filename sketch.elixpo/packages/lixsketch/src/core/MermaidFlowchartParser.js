/* eslint-disable */

import { layeredLayout } from './MermaidLayout.js';
/**
 * MermaidFlowchartParser — Mermaid `graph` / `flowchart` syntax → graph model.
 *
 * Covers the syntax Excalidraw's "Mermaid to Excalidraw" handles natively:
 *  - header `graph|flowchart` + TB/TD/BT/LR/RL, YAML front matter `title`
 *  - every node shape: [] () ([]) [[]] [()] (()) ((())) > ] {} {{}} [//] [\\]
 *    [/\] [\/] and the `A@{ shape: …, label: … }` form
 *  - chained edges `A --> B --> C`, `&` fan-out/fan-in
 *  - edge labels `-->|text|` and `-- text -->` (also `== text ==>`, `-. text .->`)
 *  - arrows --> --- -.-> -.- ==> === ~~~ --o --x <--> o--o x--x and longer
 *    variants (`--->`, `-..->`, `===>`) which add rank length
 *  - subgraphs (nested, `subgraph id [title]`, `subgraph "title"`, direction)
 *  - classDef / class / `:::class` / style / linkStyle (incl. `default`)
 *  - markdown strings "`**bold**`", `<br>`, entity codes (#quot; #35;)
 *  - `%%` comments; click / href / call / accTitle / accDescr ignored
 *
 * parseFlowchart(src) → { diagram, errors[] }  (errors carry 1-based `line`)
 */

const SHAPE_OPENERS = [
    // [open, close, shape] — longest openers first
    ['(((', ')))', 'doublecircle'],
    ['((', '))', 'circle'],
    ['([', '])', 'stadium'],
    ['[[', ']]', 'subroutine'],
    ['[(', ')]', 'cylinder'],
    ['{{', '}}', 'hexagon'],
    ['[/', '/]', 'parallelogram'],
    ['[/', '\\]', 'trapezoid'],
    ['[\\', '\\]', 'parallelogram_alt'],
    ['[\\', '/]', 'trapezoid_alt'],
    ['(', ')', 'round'],
    ['[', ']', 'rect'],
    ['{', '}', 'diamond'],
    ['>', ']', 'asymmetric'],
];

// `A@{ shape: … }` names (Mermaid 11) → our shape names.
const NEW_SHAPE_NAMES = {
    rect: 'rect', rectangle: 'rect', proc: 'rect', process: 'rect',
    rounded: 'round', event: 'round',
    stadium: 'stadium', pill: 'stadium', terminal: 'stadium',
    subproc: 'subroutine', subroutine: 'subroutine', 'framed-rectangle': 'subroutine', 'fr-rect': 'subroutine',
    cyl: 'cylinder', cylinder: 'cylinder', database: 'cylinder', db: 'cylinder',
    circle: 'circle', circ: 'circle', 'sm-circ': 'circle', 'small-circle': 'circle', 'double-circle': 'doublecircle', 'dbl-circ': 'doublecircle', 'fr-circ': 'doublecircle',
    diam: 'diamond', diamond: 'diamond', decision: 'diamond', question: 'diamond',
    hex: 'hexagon', hexagon: 'hexagon', prepare: 'hexagon',
    'lean-r': 'parallelogram', 'lean-right': 'parallelogram', 'in-out': 'parallelogram',
    'lean-l': 'parallelogram_alt', 'lean-left': 'parallelogram_alt', 'out-in': 'parallelogram_alt',
    'trap-b': 'trapezoid', trapezoid: 'trapezoid', priority: 'trapezoid',
    'trap-t': 'trapezoid_alt', 'inv-trapezoid': 'trapezoid_alt', manual: 'trapezoid_alt',
    odd: 'asymmetric',
};

export const FLOWCHART_SHAPES = ['rect', 'round', 'stadium', 'subroutine', 'cylinder', 'circle', 'doublecircle', 'diamond', 'hexagon', 'parallelogram', 'parallelogram_alt', 'trapezoid', 'trapezoid_alt', 'asymmetric'];

const ID_CHAR = /[\p{L}\p{N}_]/u;

export function decodeMermaidText(raw) {
    let s = String(raw ?? '');
    let markdown = false;
    if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1);
    if (s.length >= 2 && s.startsWith('`') && s.endsWith('`')) { s = s.slice(1, -1); markdown = true; }
    s = s.replace(/<br\s*\/?>/gi, '\n');
    s = s.replace(/#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
        .replace(/#quot;/g, '"').replace(/#amp;/g, '&').replace(/#lt;/g, '<').replace(/#gt;/g, '>').replace(/#nbsp;/g, ' ');
    s = s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    if (markdown) {
        s = s.replace(/\\n/g, '\n').replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1').replace(/\*(.+?)\*/g, '$1').replace(/_(.+?)_/g, '$1');
        s = s.split('\n').map(l => l.trim()).join('\n');
    }
    s = s.replace(/<\/?(b|i|em|strong|u|span|small|sub|sup)[^>]*>/gi, '');
    return s;
}

/** Split off YAML front matter (`---\n…\n---`). Returns { body, title, lineOffset }. */
export function stripFrontMatter(src) {
    const lines = String(src).split('\n');
    let i = 0;
    while (i < lines.length && !lines[i].trim()) i += 1;
    if (lines[i]?.trim() !== '---') return { body: String(src), title: null, lineOffset: 0 };
    let j = i + 1;
    let title = null;
    while (j < lines.length && lines[j].trim() !== '---') {
        const m = lines[j].match(/^\s*title\s*:\s*(.+?)\s*$/);
        if (m) title = m[1].replace(/^["']|["']$/g, '');
        j += 1;
    }
    if (j >= lines.length) return { body: String(src), title: null, lineOffset: 0 };
    const kept = lines.map((l, k) => (k <= j ? '' : l));
    return { body: kept.join('\n'), title, lineOffset: 0 };
}

export function parseStyleList(value) {
    const props = {};
    for (const part of String(value).split(/,(?![^(]*\))/)) {
        const sep = part.indexOf(':');
        if (sep < 0) continue;
        const key = part.slice(0, sep).trim().toLowerCase();
        const val = part.slice(sep + 1).trim().replace(/;$/, '');
        if (!val) continue;
        if (key === 'fill') props.fill = val;
        else if (key === 'stroke') props.stroke = val;
        else if (key === 'stroke-width') props.strokeWidth = parseFloat(val);
        else if (key === 'color') props.labelColor = val;
        else if (key === 'stroke-dasharray') props.strokeDasharray = val.replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
        else if (key === 'font-size') props.fontSize = parseFloat(val);
    }
    return props;
}

// Split a line into statements on `;` outside quotes and brackets.
function splitStatements(line) {
    const out = [];
    let depth = 0;
    let quote = null;
    let cur = '';
    for (const ch of line) {
        if (quote) { cur += ch; if (ch === quote) quote = null; continue; }
        if (ch === '"' || ch === '`') { quote = ch; cur += ch; continue; }
        if ('[({'.includes(ch)) depth += 1;
        if (')]}'.includes(ch)) depth = Math.max(0, depth - 1);
        if (ch === ';' && depth === 0) { out.push(cur); cur = ''; continue; }
        cur += ch;
    }
    out.push(cur);
    return out.map(s => s.trim()).filter(Boolean);
}

class StatementError extends Error {}

class Cursor {
    constructor(text) { this.s = text; this.i = 0; }
    eof() { return this.i >= this.s.length; }
    peek(n = 0) { return this.s[this.i + n]; }
    rest() { return this.s.slice(this.i); }
    ws() { while (!this.eof() && /\s/.test(this.peek())) this.i += 1; }
    startsWith(t) { return this.s.startsWith(t, this.i); }
}

function readQuotedOrUntil(cur, closer) {
    // Label inside a shape: quoted ("…" possibly with `markdown`) or plain up to closer.
    cur.ws();
    if (cur.peek() === '"') {
        const start = cur.i;
        cur.i += 1;
        while (!cur.eof() && cur.peek() !== '"') cur.i += 1;
        if (cur.eof()) throw new StatementError('Unterminated "…" label');
        cur.i += 1;
        const text = cur.s.slice(start, cur.i);
        cur.ws();
        if (!cur.startsWith(closer)) throw new StatementError(`Expected '${closer}' after label ${text}`);
        cur.i += closer.length;
        return text;
    }
    const end = cur.s.indexOf(closer, cur.i);
    if (end === -1) throw new StatementError(`Unclosed node shape: missing '${closer}'`);
    const text = cur.s.slice(cur.i, end);
    cur.i = end + closer.length;
    return text.trim();
}

function readId(cur) {
    let id = '';
    while (!cur.eof()) {
        const ch = cur.peek();
        if (ID_CHAR.test(ch)) { id += ch; cur.i += 1; continue; }
        // hyphen / dot inside an id (`api-gateway`, `v1.2`) — not an edge start
        if ((ch === '-' || ch === '.') && id && ID_CHAR.test(cur.peek(1) || '') && !/[-.=>]/.test(cur.peek(1))) { id += ch; cur.i += 1; continue; }
        break;
    }
    return id;
}

function parseNewShapeAttrs(text) {
    const attrs = {};
    const re = /(\w+)\s*:\s*("([^"]*)"|[^,}]+)/g;
    let m;
    while ((m = re.exec(text))) attrs[m[1]] = (m[3] !== undefined ? m[3] : m[2]).trim();
    return attrs;
}

/** Parse one node reference (id + optional shape + optional :::class). */
function parseNode(cur, ctx) {
    cur.ws();
    const id = readId(cur);
    if (!id) throw new StatementError(`Expected a node id, found '${cur.rest().slice(0, 12) || 'end of line'}'`);
    let shape = null;
    let label = null;
    if (cur.startsWith('@{')) {
        const end = cur.s.indexOf('}', cur.i);
        if (end === -1) throw new StatementError(`Unclosed '@{' on node ${id}`);
        const attrs = parseNewShapeAttrs(cur.s.slice(cur.i + 2, end));
        cur.i = end + 1;
        shape = NEW_SHAPE_NAMES[String(attrs.shape || 'rect').toLowerCase().replace(/_/g, '-')] || 'rect';
        if (attrs.label !== undefined) label = attrs.label;
    } else {
        for (const [open, close, name] of SHAPE_OPENERS) {
            if (!cur.startsWith(open)) continue;
            if (open === '[/' || open === '[\\') {
                // trapezoid / parallelogram share openers — choose by closer
                const save = cur.i;
                cur.i += open.length;
                const body = cur.rest();
                const closeIdx = body.search(/[/\\]\]/);
                if (closeIdx === -1) { cur.i = save; continue; }
                if (body.slice(closeIdx, closeIdx + 2) !== close) { cur.i = save; continue; }
                label = body.slice(0, closeIdx);
                cur.i += closeIdx + 2;
                shape = name;
                break;
            }
            cur.i += open.length;
            label = readQuotedOrUntil(cur, close);
            shape = name;
            break;
        }
    }
    let className = null;
    if (cur.startsWith(':::')) {
        cur.i += 3;
        className = readId(cur);
    }
    return ctx.touchNode(id, shape, label, className);
}

function parseNodeGroup(cur, ctx) {
    const ids = [parseNode(cur, ctx)];
    for (;;) {
        cur.ws();
        if (cur.peek() !== '&') return ids;
        cur.i += 1;
        ids.push(parseNode(cur, ctx));
    }
}

// `-- text -->`, `== text ==>`, `-. text .->` closers (text must be non-empty).
const LABEL_FORMS = {
    '--': /^\s+(.*?\S)\s*(-{2,})([>ox])?(?=\s|$|[\p{L}\p{N}_"])/u,
    '==': /^\s+(.*?\S)\s*(={2,})([>ox])?(?=\s|$|[\p{L}\p{N}_"])/u,
    '-.': /^\s+(.*?\S)\s*(\.+-+)([>ox])?(?=\s|$|[\p{L}\p{N}_"])/u,
};
const HEADS = { '>': 'arrow', o: 'circle', x: 'cross' };

/** Parse an edge operator at the cursor. Returns null when none. */
function parseEdge(cur) {
    cur.ws();
    const start = cur.i;
    let startHead = null;
    const c0 = cur.peek();
    if (c0 === '<' && /[-=.]/.test(cur.peek(1) || '')) { startHead = 'arrow'; cur.i += 1; }
    else if ((c0 === 'o' || c0 === 'x') && /[-=.]/.test(cur.peek(1) || '') && (start === 0 || /\s/.test(cur.s[start - 1]))) { startHead = HEADS[c0]; cur.i += 1; }
    let body = '';
    while (!cur.eof() && /[-=.~]/.test(cur.peek())) { body += cur.peek(); cur.i += 1; }
    if (body.length < 2) { cur.i = start; return null; }
    let endHead = null;
    const h = cur.peek();
    if (h === '>') { endHead = 'arrow'; cur.i += 1; }
    else if ((h === 'o' || h === 'x') && (cur.i + 1 >= cur.s.length || /[\s|]/.test(cur.peek(1)))) { endHead = HEADS[h]; cur.i += 1; }

    let label = null;
    let lengthPart = body;
    if (!endHead && LABEL_FORMS[body] && /\s/.test(cur.peek() || '')) {
        const m = cur.rest().match(LABEL_FORMS[body]);
        if (m) {
            label = m[1];
            lengthPart = m[2];
            body += m[2];
            endHead = m[3] ? HEADS[m[3]] : null;
            cur.i += m[0].length;
        }
    }

    let stroke = 'normal';
    if (body.includes('~')) stroke = 'invisible';
    else if (body.includes('=')) stroke = 'thick';
    else if (body.includes('.')) stroke = 'dotted';
    // Extra dashes / dots / equals lengthen the edge (Mermaid "length").
    let minlen;
    if (stroke === 'dotted') minlen = (lengthPart.match(/\./g) || []).length;
    else {
        const n = lengthPart.replace(/[^-=~]/g, '').length;
        minlen = endHead ? n - 1 : n - 2;
    }
    minlen = Math.max(1, minlen);

    cur.ws();
    if (label === null && cur.peek() === '|') {
        const end = cur.s.indexOf('|', cur.i + 1);
        if (end === -1) throw new StatementError("Unclosed '|' edge label");
        label = cur.s.slice(cur.i + 1, end).trim();
        cur.i = end + 1;
    }
    return { startHead, endHead, stroke, minlen, label: label === null ? null : decodeMermaidText(label) };
}

/**
 * Parse flowchart source. Returns { diagram, errors }.
 * diagram = { direction, title, nodes[], edges[], subgraphs[], classDefs }
 */
export function parseFlowchart(src) {
    const errors = [];
    const { body, title } = stripFrontMatter(String(src ?? ''));
    const rawLines = body.split('\n');
    const nodes = new Map();
    const order = [];
    const edges = [];
    const subgraphs = new Map();
    const subgraphOrder = [];
    const classDefs = new Map();
    const classAssign = [];
    const styles = [];
    const linkStyles = [];
    const stack = [];
    let direction = 'TB';
    let headerSeen = false;
    let autoSg = 0;

    const currentSg = () => (stack.length ? stack[stack.length - 1] : null);
    const ctx = {
        touchNode(id, shape, label, className) {
            if (subgraphs.has(id) && !nodes.has(id) && !shape) return id; // edge to a subgraph id
            let n = nodes.get(id);
            if (!n) {
                n = { id, shape: shape || 'rect', label: id, classes: [], subgraph: null };
                nodes.set(id, n);
                order.push(id);
            }
            if (shape) n.shape = shape;
            if (label !== null && label !== undefined) n.label = decodeMermaidText(label);
            if (className) n.classes.push(className);
            const sg = currentSg();
            if (sg && !n.subgraph) { n.subgraph = sg.id; sg.nodes.push(id); }
            return id;
        },
    };

    for (let li = 0; li < rawLines.length; li += 1) {
        const lineNo = li + 1;
        const raw = rawLines[li].trim();
        if (!raw || raw.startsWith('%%')) continue;
        if (!headerSeen) {
            const header = raw.match(/^(graph|flowchart(?:-elk)?)\b\s*(TB|TD|BT|LR|RL)?\s*;?\s*(.*)$/i);
            headerSeen = true;
            if (header) {
                if (header[2]) direction = header[2].toUpperCase() === 'TD' ? 'TB' : header[2].toUpperCase();
                if (!header[3]) continue;
                rawLines[li] = header[3];
                li -= 1;
                continue;
            }
        }
        for (const stmt of splitStatements(raw)) {
            try {
                parseStatement(stmt, lineNo);
            } catch (err) {
                if (!(err instanceof StatementError)) throw err;
                errors.push({ line: lineNo, message: `Parse error on line ${lineNo}: ${err.message} in "${stmt}"` });
            }
        }
    }
    if (stack.length) errors.push({ line: rawLines.length, message: `Parse error: subgraph "${stack[stack.length - 1].label}" is missing 'end'` });

    function parseStatement(stmt, lineNo) {
        let m;
        if (/^(click|href|call|accTitle|accDescr|callback)\b/i.test(stmt) || /^accDescr\s*\{/.test(stmt)) return;
        if ((m = stmt.match(/^direction\s+(TB|TD|BT|LR|RL)$/i))) {
            const sg = currentSg();
            const d = m[1].toUpperCase() === 'TD' ? 'TB' : m[1].toUpperCase();
            if (sg) sg.direction = d; else direction = d;
            return;
        }
        if ((m = stmt.match(/^subgraph\b\s*(.*)$/i))) {
            const rest = m[1].trim();
            let id;
            let label;
            const withTitle = rest.match(/^([\p{L}\p{N}_-]+)\s*\[\s*(.*?)\s*\]$/u);
            if (withTitle) { id = withTitle[1]; label = withTitle[2]; }
            else if (/^".*"$/.test(rest)) { id = `subgraph_${++autoSg}`; label = rest; }
            else if (/^[\p{L}\p{N}_-]+$/u.test(rest)) { id = rest; label = rest; }
            else if (rest) { id = `subgraph_${++autoSg}`; label = rest; }
            else { id = `subgraph_${++autoSg}`; label = ''; }
            const parent = currentSg();
            const sg = { id, label: decodeMermaidText(label), nodes: [], parent: parent ? parent.id : null, direction: null };
            subgraphs.set(id, sg);
            subgraphOrder.push(id);
            stack.push(sg);
            return;
        }
        if (/^end$/i.test(stmt)) {
            if (!stack.length) throw new StatementError("Unexpected 'end' (no open subgraph)");
            stack.pop();
            return;
        }
        if ((m = stmt.match(/^classDef\s+([\w,\s-]+?)\s+(.+)$/i))) {
            const props = parseStyleList(m[2]);
            m[1].split(',').map(s => s.trim()).filter(Boolean).forEach(name => classDefs.set(name, props));
            return;
        }
        if ((m = stmt.match(/^class\s+(.+?)\s+([\w-]+)$/i))) {
            classAssign.push({ ids: m[1].split(',').map(s => s.trim()).filter(Boolean), className: m[2] });
            return;
        }
        if ((m = stmt.match(/^style\s+([^\s]+)\s+(.+)$/i))) {
            styles.push({ ids: m[1].split(',').map(s => s.trim()), props: parseStyleList(m[2]) });
            return;
        }
        if ((m = stmt.match(/^linkStyle\s+([\d,\s]+|default)\s+(.+)$/i))) {
            const which = m[1].trim() === 'default' ? 'default' : m[1].split(',').map(s => parseInt(s.trim(), 10)).filter(n => Number.isInteger(n));
            linkStyles.push({ which, props: parseStyleList(m[2]) });
            return;
        }
        // Chain: group (edge group)*
        const cur = new Cursor(stmt);
        let left = parseNodeGroup(cur, ctx);
        for (;;) {
            cur.ws();
            if (cur.eof()) break;
            const edge = parseEdge(cur);
            if (!edge) throw new StatementError(`Unexpected '${cur.rest().slice(0, 16)}'`);
            const right = parseNodeGroup(cur, ctx);
            for (const from of left) {
                for (const to of right) {
                    edges.push({ from, to, ...edge, index: edges.length, line: lineNo });
                }
            }
            left = right;
        }
    }

    // ── styles ──
    const defaultClass = classDefs.get('default');
    for (const { ids, className } of classAssign) {
        for (const id of ids) {
            if (nodes.has(id)) nodes.get(id).classes.push(className);
            else if (subgraphs.has(id)) (subgraphs.get(id).classes ||= []).push(className);
        }
    }
    for (const n of nodes.values()) {
        n.style = {};
        if (defaultClass) Object.assign(n.style, defaultClass);
        for (const c of n.classes) if (classDefs.has(c)) Object.assign(n.style, classDefs.get(c));
    }
    for (const sg of subgraphs.values()) {
        sg.style = {};
        for (const c of sg.classes || []) if (classDefs.has(c)) Object.assign(sg.style, classDefs.get(c));
    }
    for (const { ids, props } of styles) {
        for (const id of ids) {
            if (nodes.has(id)) Object.assign(nodes.get(id).style, props);
            else if (subgraphs.has(id)) Object.assign(subgraphs.get(id).style, props);
        }
    }
    for (const e of edges) e.style = {};
    for (const { which, props } of linkStyles) {
        const targets = which === 'default' ? edges : which.map(i => edges[i]).filter(Boolean);
        for (const e of targets) Object.assign(e.style, props);
    }

    // Subgraph ids used as edge endpoints: connect to the subgraph's first node.
    const resolveEnd = (id) => {
        if (nodes.has(id)) return id;
        const sg = subgraphs.get(id);
        if (!sg) return id;
        const first = sg.nodes[0] || subgraphOrder.map(s => subgraphs.get(s)).find(s => s.parent === id)?.nodes[0];
        return first || id;
    };
    const finalEdges = edges.map(e => ({ ...e, from: resolveEnd(e.from), to: resolveEnd(e.to), fromSubgraph: subgraphs.has(e.from) && !nodes.has(e.from) ? e.from : null, toSubgraph: subgraphs.has(e.to) && !nodes.has(e.to) ? e.to : null }))
        .filter(e => nodes.has(e.from) && nodes.has(e.to));

    if (!headerSeen && !errors.length) errors.push({ line: 1, message: 'Parse error: empty flowchart' });
    if (!nodes.size && !errors.length) errors.push({ line: 1, message: 'Parse error: the flowchart has no nodes' });

    return {
        diagram: {
            type: 'flowchart',
            direction,
            title,
            nodes: order.map(id => nodes.get(id)),
            edges: finalEdges,
            subgraphs: subgraphOrder.map(id => subgraphs.get(id)),
            classDefs: Object.fromEntries(classDefs),
        },
        errors,
    };
}

// ─────────────────────────────────────────────────────────────────────
// Layout: parsed flowchart → positioned diagram for the renderers
// ─────────────────────────────────────────────────────────────────────

const NODE_W = 150;
const NODE_H = 50;

function isDarkTheme() {
    if (typeof document === 'undefined') return true;
    if (document.body) {
        if (document.body.classList.contains('theme-dark')) return true;
        if (document.body.classList.contains('theme-light')) return false;
    }
    return !document.documentElement || document.documentElement.classList.contains('dark');
}

export function flowchartPalette() {
    return isDarkTheme()
        ? [
            { fill: '#352b52', stroke: '#9d86df' },
            { fill: '#403260', stroke: '#ad92ed' },
            { fill: '#2f2948', stroke: '#927fd1' },
            { fill: '#493568', stroke: '#b195e8' },
            { fill: '#322747', stroke: '#9b83d7' },
            { fill: '#3d2e58', stroke: '#a88add' },
        ]
        : [
            { fill: '#eee9f7', stroke: '#7667a8' },
            { fill: '#e6def2', stroke: '#8875b5' },
            { fill: '#ddd2eb', stroke: '#6f5f9c' },
            { fill: '#f2edf8', stroke: '#9a88bf' },
            { fill: '#e2daf0', stroke: '#806cab' },
            { fill: '#ebe4f5', stroke: '#705d9c' },
        ];
}

/** Footprint (layout box) of a node from its label and shape. */
export function flowchartNodeSize(shape, label) {
    const lines = String(label || '').split('\n');
    const longest = Math.max(1, ...lines.map(l => l.length));
    const w = Math.max(NODE_W, longest * 9 + 40);
    const h = Math.max(NODE_H, lines.length * 20 + 20);
    switch (shape) {
        case 'circle':
        case 'doublecircle': {
            const d = Math.max(70, longest * 9 + 30, h + 10) + (shape === 'doublecircle' ? 12 : 0);
            return { width: d, height: d };
        }
        case 'diamond': {
            // drawn as a square rotated 45°; the footprint is its diagonal
            const side = Math.max(w, h) * 0.75;
            const diag = Math.round(side * Math.SQRT2);
            return { width: diag, height: diag };
        }
        case 'cylinder': return { width: w, height: h + 20 };
        case 'stadium': return { width: w + 20, height: h };
        case 'subroutine': return { width: w + 16, height: h };
        default: return { width: w, height: h };
    }
}

/**
 * Parse + lay out. Returns the positioned diagram consumed by
 * MermaidFlowchartRenderer, always with an `errors` array.
 */
export function parseMermaidFlowchart(src) {
    const { diagram, errors } = parseFlowchart(src);
    if (errors.length || !diagram.nodes.length) return { ...diagram, nodes: [], edges: [], subgraphs: [], errors };
    const palette = flowchartPalette();
    const sizes = new Map(diagram.nodes.map(n => [n.id, flowchartNodeSize(n.shape, n.label)]));
    const layout = layeredLayout({
        direction: diagram.direction,
        nodes: diagram.nodes.map(n => ({ id: n.id, ...sizes.get(n.id), cluster: n.subgraph })),
        edges: diagram.edges.map(e => ({ from: e.from, to: e.to, minlen: e.minlen })),
        clusters: diagram.subgraphs.map(s => ({ id: s.id, parent: s.parent })),
    }, { nodeSep: 50, clusterPad: 24, clusterTitle: 28 });

    const nodes = diagram.nodes.map((n, i) => {
        const p = layout.nodes.get(n.id);
        const color = palette[i % palette.length];
        const s = n.style || {};
        return {
            id: n.id,
            type: n.shape,
            label: n.label,
            subgraph: n.subgraph,
            x: p.x, y: p.y, width: p.width, height: p.height,
            fill: s.fill || color.fill,
            stroke: s.stroke || color.stroke,
            strokeWidth: s.strokeWidth,
            strokeDasharray: s.strokeDasharray,
            labelColor: s.labelColor,
            classes: n.classes,
        };
    });
    const edges = diagram.edges.map(e => ({
        from: e.from,
        to: e.to,
        label: e.label || undefined,
        directed: Boolean(e.endHead || e.startHead),
        style: e.stroke,
        startHead: e.startHead,
        endHead: e.endHead,
        minlen: e.minlen,
        stroke: e.style?.stroke,
        strokeWidth: e.style?.strokeWidth,
        strokeDasharray: e.style?.strokeDasharray,
        labelColor: e.style?.labelColor,
    }));
    const subgraphs = diagram.subgraphs
        .filter(sg => layout.clusters.has(sg.id))
        .map(sg => ({ id: sg.id, label: sg.label, parent: sg.parent, nodes: sg.nodes, style: sg.style, ...layout.clusters.get(sg.id) }));
    return {
        type: 'flowchart',
        title: diagram.title || 'Mermaid Diagram',
        direction: diagram.direction,
        nodes,
        edges,
        subgraphs: subgraphs.length ? subgraphs : undefined,
        width: layout.width,
        height: layout.height,
        errors: [],
    };
}
