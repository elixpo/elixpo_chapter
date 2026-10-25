/* eslint-disable */
/**
 * MermaidSequenceRenderer — lays out a parsed sequence diagram once
 * (layoutSequence) and draws it as preview SVG and as native canvas shapes.
 *
 * Canvas output (all independently editable, inside one Frame):
 *  participant → labelled Rectangle (top, and bottom unless destroyed)
 *  actor       → stick figure (Circle + Lines) with a label, grouped
 *  lifeline    → dashed Line; activation → narrow filled Rectangle
 *  message     → Arrow (->> -->> -) --)), Line (-> -->), Line + X (-x --x),
 *                one arrow with both heads (<<->>), 3-segment loop (self)
 *  note        → filled Rectangle; block → dashed Rectangle + section Lines
 *  box         → filled Rectangle behind its participants' columns
 */

import { parseSequenceDiagram } from './MermaidSequenceParser.js';
import { beginDiagram, escapeXml, nextGroupId } from './MermaidCanvas.js';

const BOX_H = 38;
const MIN_BOX_W = 100;
const MIN_GAP = 150;
const ROW_H = 46;
const NOTE_PAD = 10;
const NOTE_MAX_W = 180;
const TOP = 30;
const SIDE = 40;
const ACT_W = 12;
const FONT_FAMILY = 'lixFont, sans-serif';

function isDark() {
    if (typeof document === 'undefined') return true;
    if (document.body) {
        if (document.body.classList.contains('theme-dark')) return true;
        if (document.body.classList.contains('theme-light')) return false;
    }
    return !document.documentElement || document.documentElement.classList.contains('dark');
}

const DARK_THEME = {
    bg: '#1e1e28', participantBg: '#232329', participantBorder: '#666', participantText: '#e8e8ee',
    lifeline: '#555', messageLine: '#999', messageText: '#e0e0e0', noteBg: '#3a3520', noteBorder: '#665e30',
    noteText: '#d4c870', blockBg: 'rgba(80,80,120,0.12)', blockBorder: '#666', blockLabel: '#a0a0b0',
    crossColor: '#e74c3c', activationBg: '#34344a', boxBg: 'rgba(120,120,180,0.10)',
};
const LIGHT_THEME = {
    bg: '#fbfaf6', participantBg: '#ffffff', participantBorder: '#9c9c9c', participantText: '#38384e',
    lifeline: '#b0b0b8', messageLine: '#62627a', messageText: '#38384e', noteBg: '#fffce0', noteBorder: '#c0b870',
    noteText: '#5e5230', blockBg: 'rgba(80,80,120,0.06)', blockBorder: '#9c9c9c', blockLabel: '#62627a',
    crossColor: '#c2483a', activationBg: '#ececf4', boxBg: 'rgba(120,120,180,0.08)',
};
function themeColors() { return isDark() ? DARK_THEME : LIGHT_THEME; }

const textWidth = (text, size) => String(text || '').split('\n').reduce((m, l) => Math.max(m, l.length * size * 0.58), 0);

function wrapText(text, fontSize, maxWidth) {
    const lines = [];
    for (const segment of String(text || '').split('\n')) {
        let current = '';
        for (const word of segment.split(/\s+/)) {
            const test = current ? `${current} ${word}` : word;
            if (textWidth(test, fontSize) > maxWidth && current) { lines.push(current); current = word; } else current = test;
        }
        lines.push(current);
    }
    return lines.length ? lines : [''];
}

/** Compute every position once; both renderers draw from this. */
export function layoutSequence(diagram) {
    const participants = diagram.participants || [];
    const messages = diagram.messages || [];
    const notes = diagram.notes || [];
    const blocks = diagram.blocks || [];
    const index = new Map(participants.map((p, i) => [p.name, i]));
    const widths = participants.map(p => Math.max(MIN_BOX_W, textWidth(p.name, 13) + 28));

    // column spacing grows with the widest label between neighbours
    const need = participants.map(() => MIN_GAP);
    for (const m of messages) {
        const a = index.get(m.from);
        const b = index.get(m.to);
        if (a === undefined || b === undefined) continue;
        const label = (m.number ? `${m.number}. ` : '') + m.text;
        if (a === b) { need[a] = Math.max(need[a], textWidth(label, 12) + 70); continue; }
        const lo = Math.min(a, b);
        const span = Math.abs(a - b);
        const perGap = (textWidth(label, 12) + 40) / span;
        for (let k = lo; k < lo + span; k += 1) need[k] = Math.max(need[k], perGap);
    }
    for (const n of notes) {
        const ids = n.targets.map(t => index.get(t)).filter(i => i !== undefined);
        if (ids.length === 2) {
            const lo = Math.min(...ids);
            need[lo] = Math.max(need[lo], Math.min(NOTE_MAX_W, textWidth(n.text, 11) + 2 * NOTE_PAD) - 20);
        } else if (ids.length === 1 && n.position !== 'over') {
            const k = n.position === 'left of' ? ids[0] - 1 : ids[0];
            if (k >= 0 && k < need.length) need[k] = Math.max(need[k], Math.min(NOTE_MAX_W, textWidth(n.text, 11) + 2 * NOTE_PAD) + widths[ids[0]] / 2 + 20);
        }
    }
    const centers = [];
    participants.forEach((p, i) => {
        if (i === 0) centers.push(SIDE + widths[0] / 2 + (notes.some(n => n.position === 'left of' && index.get(n.targets[0]) === 0) ? NOTE_MAX_W : 0));
        else centers.push(centers[i - 1] + Math.max((widths[i - 1] + widths[i]) / 2 + 40, need[i - 1]));
    });

    // rows
    const notesAt = new Map();
    for (const n of notes) {
        const lines = wrapText(n.text, 11, NOTE_MAX_W - NOTE_PAD * 2);
        const height = lines.length * 15 + NOTE_PAD * 2;
        if (!notesAt.has(n.atMessage)) notesAt.set(n.atMessage, []);
        notesAt.get(n.atMessage).push({ ...n, lines, height });
    }
    const createdAt = new Map(participants.filter(p => Number.isInteger(p.createdAt)).map(p => [p.createdAt, p.name]));
    let y = TOP + BOX_H + 30;
    const msgY = [];
    const noteBoxes = [];
    const blockTop = new Map();
    const sectionY = new Map();
    const createdY = new Map();
    const placeNotes = (at) => {
        const group = notesAt.get(at);
        if (!group) return;
        for (const n of group) {
            const ids = n.targets.map(t => index.get(t)).filter(i => i !== undefined);
            if (!ids.length) continue;
            let width = Math.min(NOTE_MAX_W, Math.max(80, ...n.lines.map(l => textWidth(l, 11))) + NOTE_PAD * 2);
            let x;
            if (n.position === 'over') {
                const lo = Math.min(...ids);
                const hi = Math.max(...ids);
                if (hi > lo) width = Math.max(width, centers[hi] - centers[lo] + 40);
                x = (centers[lo] + centers[hi]) / 2 - width / 2;
            } else if (n.position === 'left of') x = centers[ids[0]] - widths[ids[0]] / 2 - 10 - width;
            else x = centers[ids[0]] + widths[ids[0]] / 2 + 10;
            noteBoxes.push({ ...n, x, y, width, height: n.height });
            y += n.height + 10;
        }
    };
    const blocksByDepth = blocks.slice().sort((a, b) => (a.depth || 0) - (b.depth || 0));
    for (let mi = 0; mi <= messages.length; mi += 1) {
        for (const b of blocks) {
            if (b.endMsg === mi && b.startMsg < mi) y += 14;
        }
        for (const b of blocksByDepth) {
            if (b.startMsg === mi) { blockTop.set(b, y); y += 30; }
            b.sections.forEach((s, si) => { if (si > 0 && s.startMsg === mi) { sectionY.set(s, y); y += 26; } });
        }
        placeNotes(mi);
        if (mi === messages.length) break;
        if (createdAt.has(mi)) { createdY.set(createdAt.get(mi), y + BOX_H / 2); y += BOX_H / 2 + 6; }
        const m = messages[mi];
        const labelLines = String((m.number ? `${m.number}. ` : '') + m.text).split('\n').length;
        y += (labelLines - 1) * 14;
        msgY.push(y);
        y += ROW_H + (m.from === m.to ? 26 : 0);
    }
    const bottomY = y + 16;

    // participants
    const columns = participants.map((p, i) => {
        const cx = centers[i];
        const created = createdY.get(p.name);
        const topY = created !== undefined ? created - BOX_H / 2 : TOP;
        const destroyedAt = Number.isInteger(p.destroyedAt) ? Math.min(p.destroyedAt, msgY.length - 1) : null;
        const endY = destroyedAt !== null && destroyedAt >= 0 ? msgY[destroyedAt] : bottomY;
        return {
            name: p.name, type: p.type, cx, width: widths[i],
            top: { x: cx - widths[i] / 2, y: topY, width: widths[i], height: BOX_H },
            bottom: destroyedAt !== null ? null : { x: cx - widths[i] / 2, y: bottomY, width: widths[i], height: BOX_H },
            lifeline: { x: cx, y1: topY + BOX_H, y2: endY },
            destroyedY: destroyedAt !== null && destroyedAt >= 0 ? endY : null,
        };
    });

    // activations
    const activationBars = (diagram.activations || []).map((a) => {
        const i = index.get(a.participant);
        if (i === undefined || !msgY.length) return null;
        const y1 = msgY[Math.min(a.start, msgY.length - 1)] - 6;
        const y2 = msgY[Math.min(a.end ?? a.start, msgY.length - 1)] + 8;
        return { participant: a.participant, depth: a.depth, x: centers[i] - ACT_W / 2 + a.depth * 5, y: y1, width: ACT_W, height: Math.max(16, y2 - y1) };
    }).filter(Boolean);
    const activeOffset = (name, mi, towardRight) => {
        const bars = activationBars.filter(b => b.participant === name && msgY[mi] >= b.y && msgY[mi] <= b.y + b.height);
        if (!bars.length) return 0;
        const deepest = Math.max(...bars.map(b => b.depth));
        return (towardRight ? ACT_W / 2 : -ACT_W / 2) + deepest * 5;
    };

    const msgs = messages.map((m, mi) => {
        const a = index.get(m.from);
        const b = index.get(m.to);
        if (a === undefined || b === undefined) return null;
        const yy = msgY[mi];
        const label = (m.number ? `${m.number}. ` : '') + m.text;
        if (a === b) {
            const x = centers[a] + activeOffset(m.from, mi, true);
            return { ...m, self: true, label, points: [{ x, y: yy }, { x: x + 40, y: yy }, { x: x + 40, y: yy + 26 }, { x: x + 4, y: yy + 26 }] };
        }
        const right = b > a;
        let x1 = centers[a] + activeOffset(m.from, mi, right);
        let x2 = centers[b] + activeOffset(m.to, mi, !right);
        if (m.creates && createdY.has(m.to)) x2 = centers[b] + (right ? -1 : 1) * widths[b] / 2;
        return { ...m, self: false, label, x1, x2, y: yy };
    }).filter(Boolean);

    // blocks: span the participants they involve
    const blockBoxes = blocks.map((b) => {
        const involved = new Set();
        messages.slice(b.startMsg, Math.max(b.startMsg + 1, b.endMsg)).forEach(m => { involved.add(index.get(m.from)); involved.add(index.get(m.to)); });
        noteBoxes.filter(n => n.atMessage >= b.startMsg && n.atMessage < b.endMsg).forEach(n => n.targets.forEach(t => involved.add(index.get(t))));
        const cols = [...involved].filter(i => i !== undefined);
        if (!cols.length) cols.push(0);
        const lo = Math.min(...cols);
        const hi = Math.max(...cols);
        const inset = (b.depth || 0) * 8;
        const x = centers[lo] - widths[lo] / 2 - 14 + inset;
        const x2 = centers[hi] + widths[hi] / 2 + 14 - inset + (cols.length === 1 ? 40 : 0);
        const top = blockTop.get(b) ?? TOP + BOX_H + 10;
        const endIdx = Math.min(b.endMsg, msgY.length) - 1;
        const bottom = (endIdx >= 0 ? msgY[endIdx] + ROW_H - 18 : top + 40) + (messages[endIdx]?.from === messages[endIdx]?.to ? 26 : 0);
        return {
            type: b.type, label: b.label, color: b.color, depth: b.depth || 0,
            x, y: top, width: x2 - x, height: Math.max(36, bottom - top),
            sections: b.sections.slice(1).map(s => ({ label: s.label, keyword: s.keyword || 'else', y: sectionY.get(s) ?? top })),
        };
    });

    const boxBoxes = (diagram.boxes || []).map((bx) => {
        const cols = bx.participants.map(n => index.get(n)).filter(i => i !== undefined);
        if (!cols.length) return null;
        const lo = Math.min(...cols);
        const hi = Math.max(...cols);
        return { label: bx.label, color: bx.color, x: centers[lo] - widths[lo] / 2 - 16, y: TOP - 22, width: centers[hi] - centers[lo] + (widths[lo] + widths[hi]) / 2 + 32, height: bottomY + BOX_H + 30 - TOP };
    }).filter(Boolean);

    const minX = Math.min(0, ...noteBoxes.map(n => n.x - 20), ...boxBoxes.map(b => b.x - 10));
    const maxX = Math.max(...columns.map(c => c.cx + c.width / 2), ...noteBoxes.map(n => n.x + n.width), ...blockBoxes.map(b => b.x + b.width), ...msgs.filter(m => m.self).map(m => m.points[1].x + textWidth(m.label, 12) + 10), ...boxBoxes.map(b => b.x + b.width)) + SIDE;
    return {
        title: diagram.title,
        shiftX: -minX,
        width: maxX - minX,
        height: bottomY + BOX_H + TOP,
        columns,
        messages: msgs,
        notes: noteBoxes,
        blocks: blockBoxes,
        activations: activationBars,
        boxes: boxBoxes,
    };
}

// ── preview ──

export function renderSequenceSVG(diagram, opts = {}) {
    if (!diagram || diagram.type !== 'sequenceDiagram' || !diagram.participants?.length) return '';
    const T = themeColors();
    const L = layoutSequence(diagram);
    const scale = opts.width ? Math.min(1, opts.width / L.width) : 1;
    const W = Math.round(L.width * scale);
    const H = Math.round(L.height * scale);
    const sx = (x) => (x + L.shiftX) * scale;
    const sy = (y) => y * scale;
    let s = `<rect x="0" y="0" width="${W}" height="${H}" fill="${T.bg}" rx="8" />`;
    const defs = `<defs><marker id="seq-open" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto-start-reverse"><polyline points="1,1 9,3.5 1,6" fill="none" stroke="${T.messageLine}" stroke-width="1.5"/></marker></defs>`;
    if (L.title) s += `<text x="${W / 2}" y="${sy(TOP - 10)}" text-anchor="middle" fill="${T.participantText}" font-size="${14 * scale}" font-family="${FONT_FAMILY}" font-weight="600">${escapeXml(L.title)}</text>`;
    for (const b of L.boxes) {
        s += `<g data-seq-type="box"><rect x="${sx(b.x)}" y="${sy(b.y)}" width="${b.width * scale}" height="${b.height * scale}" rx="6" fill="${b.color || T.boxBg}" opacity="0.5" stroke="${T.blockBorder}" stroke-width="1"/>`;
        if (b.label) s += `<text x="${sx(b.x) + 8}" y="${sy(b.y) + 14 * scale}" fill="${T.blockLabel}" font-size="${11 * scale}" font-family="${FONT_FAMILY}">${escapeXml(b.label)}</text>`;
        s += '</g>';
    }
    for (const b of L.blocks) {
        const head = b.type === 'rect' ? '' : `${b.type}${b.label ? ` [${b.label}]` : ''}`;
        s += `<g data-seq-type="block" data-block-type="${b.type}"><rect x="${sx(b.x)}" y="${sy(b.y)}" width="${b.width * scale}" height="${b.height * scale}" rx="4" fill="${b.type === 'rect' ? (b.color || T.blockBg) : T.blockBg}" stroke="${T.blockBorder}" stroke-width="1" stroke-dasharray="${b.type === 'rect' ? '0' : '4 2'}"/>`;
        if (head) s += `<text x="${sx(b.x) + 6}" y="${sy(b.y) + 14 * scale}" fill="${T.blockLabel}" font-size="${10 * scale}" font-family="${FONT_FAMILY}" font-weight="600">${escapeXml(head)}</text>`;
        for (const sec of b.sections) {
            s += `<line x1="${sx(b.x)}" y1="${sy(sec.y)}" x2="${sx(b.x + b.width)}" y2="${sy(sec.y)}" stroke="${T.blockBorder}" stroke-width="1" stroke-dasharray="4 2"/>`;
            if (sec.label) s += `<text x="${sx(b.x) + 8}" y="${sy(sec.y) + 14 * scale}" fill="${T.blockLabel}" font-size="${10 * scale}" font-family="${FONT_FAMILY}" font-style="italic">[${escapeXml(sec.label)}]</text>`;
        }
        s += '</g>';
    }
    for (const c of L.columns) {
        s += `<line x1="${sx(c.lifeline.x)}" y1="${sy(c.lifeline.y1)}" x2="${sx(c.lifeline.x)}" y2="${sy(c.lifeline.y2)}" stroke="${T.lifeline}" stroke-width="1" stroke-dasharray="6 4"/>`;
        for (const [box, pos] of [[c.top, 'top'], [c.bottom, 'bottom']]) {
            if (!box) continue;
            s += `<g data-seq-type="participant" data-seq-id="${escapeXml(c.name)}" data-seq-pos="${pos}">`;
            if (c.type === 'actor') {
                const cx = sx(c.cx);
                const y0 = sy(box.y);
                s += `<circle cx="${cx}" cy="${y0 + 6 * scale}" r="${5 * scale}" fill="none" stroke="${T.participantBorder}"/><line x1="${cx}" y1="${y0 + 11 * scale}" x2="${cx}" y2="${y0 + 22 * scale}" stroke="${T.participantBorder}"/><line x1="${cx - 8 * scale}" y1="${y0 + 15 * scale}" x2="${cx + 8 * scale}" y2="${y0 + 15 * scale}" stroke="${T.participantBorder}"/><line x1="${cx}" y1="${y0 + 22 * scale}" x2="${cx - 6 * scale}" y2="${y0 + 30 * scale}" stroke="${T.participantBorder}"/><line x1="${cx}" y1="${y0 + 22 * scale}" x2="${cx + 6 * scale}" y2="${y0 + 30 * scale}" stroke="${T.participantBorder}"/>`;
                s += `<text x="${cx}" y="${y0 + 38 * scale}" text-anchor="middle" fill="${T.participantText}" font-size="${12 * scale}" font-family="${FONT_FAMILY}">${escapeXml(c.name)}</text>`;
            } else {
                s += `<rect x="${sx(box.x)}" y="${sy(box.y)}" width="${box.width * scale}" height="${box.height * scale}" rx="4" fill="${T.participantBg}" stroke="${T.participantBorder}" stroke-width="1.5"/>`;
                s += `<text x="${sx(c.cx)}" y="${sy(box.y + box.height / 2)}" text-anchor="middle" dominant-baseline="central" fill="${T.participantText}" font-size="${13 * scale}" font-family="${FONT_FAMILY}">${escapeXml(c.name)}</text>`;
            }
            s += '</g>';
        }
        if (c.destroyedY !== null) {
            const x = sx(c.cx);
            const y = sy(c.destroyedY);
            s += `<g data-seq-type="destroy"><line x1="${x - 7}" y1="${y - 7}" x2="${x + 7}" y2="${y + 7}" stroke="${T.crossColor}" stroke-width="2"/><line x1="${x + 7}" y1="${y - 7}" x2="${x - 7}" y2="${y + 7}" stroke="${T.crossColor}" stroke-width="2"/></g>`;
        }
    }
    for (const a of L.activations) {
        s += `<rect data-seq-type="activation" x="${sx(a.x)}" y="${sy(a.y)}" width="${a.width * scale}" height="${a.height * scale}" fill="${T.activationBg}" stroke="${T.participantBorder}" stroke-width="1"/>`;
    }
    for (const m of L.messages) {
        const dash = m.solid ? '' : ' stroke-dasharray="6 3"';
        const head = m.arrowHead === 'open' || m.arrowHead === 'async' ? ' marker-end="url(#seq-open)"' : '';
        const tail = m.bidirectional ? ' marker-start="url(#seq-open)"' : '';
        s += `<g data-seq-type="message" data-seq-idx="${m.index}">`;
        if (m.self) {
            const p = m.points.map(pt => `${sx(pt.x)},${sy(pt.y)}`);
            s += `<polyline points="${p.join(' ')}" fill="none" stroke="${T.messageLine}" stroke-width="1.5"${dash}${head}/>`;
            if (m.label) s += `<text x="${sx(m.points[1].x) + 6}" y="${sy(m.points[1].y + 13)}" dominant-baseline="central" fill="${T.messageText}" font-size="${12 * scale}" font-family="${FONT_FAMILY}">${escapeXml(m.label)}</text>`;
        } else {
            s += `<line x1="${sx(m.x1)}" y1="${sy(m.y)}" x2="${sx(m.x2)}" y2="${sy(m.y)}" stroke="${T.messageLine}" stroke-width="1.5"${dash}${head}${tail}/>`;
            if (m.cross) {
                const x = sx(m.x2);
                const y = sy(m.y);
                s += `<line x1="${x - 6}" y1="${y - 6}" x2="${x + 6}" y2="${y + 6}" stroke="${T.crossColor}" stroke-width="2"/><line x1="${x + 6}" y1="${y - 6}" x2="${x - 6}" y2="${y + 6}" stroke="${T.crossColor}" stroke-width="2"/>`;
            }
            if (m.label) {
                const lines = m.label.split('\n');
                lines.forEach((ln, i) => {
                    s += `<text x="${sx((m.x1 + m.x2) / 2)}" y="${sy(m.y - 8 - (lines.length - 1 - i) * 14)}" text-anchor="middle" fill="${T.messageText}" font-size="${12 * scale}" font-family="${FONT_FAMILY}">${escapeXml(ln)}</text>`;
                });
            }
        }
        s += '</g>';
    }
    for (const n of L.notes) {
        s += `<g data-seq-type="note"><rect x="${sx(n.x)}" y="${sy(n.y)}" width="${n.width * scale}" height="${n.height * scale}" rx="3" fill="${T.noteBg}" stroke="${T.noteBorder}" stroke-width="1"/>`;
        n.lines.forEach((ln, i) => { s += `<text x="${sx(n.x + NOTE_PAD)}" y="${sy(n.y + NOTE_PAD + 11 + i * 15)}" fill="${T.noteText}" font-size="${11 * scale}" font-family="${FONT_FAMILY}">${escapeXml(ln)}</text>`; });
        s += '</g>';
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${defs}${s}</svg>`;
}

export function renderSequencePreviewSVG(diagram) {
    return renderSequenceSVG(diagram, { width: 620 });
}

export function parseAndRenderSequence(src) {
    const diagram = parseSequenceDiagram(src);
    return diagram ? renderSequenceSVG(diagram) : '';
}

// ── canvas ──

export function renderSequenceOnCanvas(diagram) {
    if (!diagram || diagram.type !== 'sequenceDiagram' || !diagram.participants?.length) return false;
    if (!window.svg || !window.Rectangle || !window.Line || !window.Arrow || !window.Frame) {
        console.error('[SequenceRenderer] Engine not initialized');
        return false;
    }
    const T = themeColors();
    const L = layoutSequence(diagram);
    const placement = beginDiagram({ width: L.width, height: L.height, title: L.title || 'Sequence diagram', diagramType: 'mermaid-sequence', padding: 60, frameOptions: { stroke: T.blockBorder } });
    const X = (x) => x + L.shiftX + placement.ox;
    const Y = (y) => y + placement.oy;
    const add = (s) => placement.add(s);
    const group = (shapes) => { const id = nextGroupId('mermaid-seq'); shapes.forEach(s => { if (s) s.groupId = id; }); };
    const lineOpts = { stroke: T.messageLine, strokeWidth: 1.5, roughness: 0 };
    let first = null;

    for (const b of L.boxes) {
        add(new window.Rectangle(X(b.x), Y(b.y), b.width, b.height, { stroke: T.blockBorder, strokeWidth: 1, fill: b.color || T.participantBg, fillStyle: b.color ? 'solid' : 'none', roughness: 0.5, label: b.label || '', labelColor: T.blockLabel, labelFontSize: 11 }));
    }
    for (const b of L.blocks) {
        const head = b.type === 'rect' ? '' : [b.type, b.label].filter(Boolean).join(': ');
        add(new window.Rectangle(X(b.x), Y(b.y), b.width, b.height, {
            stroke: T.blockBorder, strokeWidth: 1, strokeDasharray: b.type === 'rect' ? '' : '5 3',
            fill: b.type === 'rect' && b.color ? b.color : 'transparent', fillStyle: b.type === 'rect' && b.color ? 'solid' : 'none',
            roughness: 0.5, label: head, labelColor: T.blockLabel, labelFontSize: 10,
        }));
        for (const sec of b.sections) {
            add(new window.Line({ x: X(b.x), y: Y(sec.y) }, { x: X(b.x + b.width), y: Y(sec.y) }, { stroke: T.blockBorder, strokeWidth: 1, strokeDasharray: '5 3', roughness: 0, label: sec.label ? `[${sec.label}]` : '', labelColor: T.blockLabel }));
        }
    }
    for (const c of L.columns) {
        add(new window.Line({ x: X(c.lifeline.x), y: Y(c.lifeline.y1) }, { x: X(c.lifeline.x), y: Y(c.lifeline.y2) }, { stroke: T.lifeline, strokeWidth: 1, strokeDasharray: '6 4', roughness: 0 }));
        for (const box of [c.top, c.bottom]) {
            if (!box) continue;
            if (c.type === 'actor' && window.Circle) {
                const cx = X(c.cx);
                const y0 = Y(box.y);
                const parts = [
                    add(new window.Circle(cx, y0 + 6, 5, 5, { ...lineOpts, stroke: T.participantBorder })),
                    add(new window.Line({ x: cx, y: y0 + 11 }, { x: cx, y: y0 + 22 }, { ...lineOpts, stroke: T.participantBorder })),
                    add(new window.Line({ x: cx - 8, y: y0 + 15 }, { x: cx + 8, y: y0 + 15 }, { ...lineOpts, stroke: T.participantBorder })),
                    add(new window.Line({ x: cx, y: y0 + 22 }, { x: cx - 6, y: y0 + 30 }, { ...lineOpts, stroke: T.participantBorder })),
                    add(new window.Line({ x: cx, y: y0 + 22 }, { x: cx + 6, y: y0 + 30 }, { ...lineOpts, stroke: T.participantBorder })),
                    add(new window.Rectangle(X(box.x), y0 + 30, box.width, 18, { stroke: 'transparent', strokeWidth: 0, fill: 'transparent', fillStyle: 'none', roughness: 0, label: c.name, labelColor: T.participantText, labelBg: false })),
                ];
                group(parts);
                if (!first) first = parts[5];
            } else {
                const r = add(new window.Rectangle(X(box.x), Y(box.y), box.width, box.height, { stroke: T.participantBorder, strokeWidth: 1.5, fill: T.participantBg, fillStyle: 'solid', roughness: 1, label: c.name, labelColor: T.participantText }));
                if (!first) first = r;
            }
        }
        if (c.destroyedY !== null) {
            const x = X(c.cx);
            const y = Y(c.destroyedY);
            group([
                add(new window.Line({ x: x - 7, y: y - 7 }, { x: x + 7, y: y + 7 }, { stroke: T.crossColor, strokeWidth: 2, roughness: 0 })),
                add(new window.Line({ x: x + 7, y: y - 7 }, { x: x - 7, y: y + 7 }, { stroke: T.crossColor, strokeWidth: 2, roughness: 0 })),
            ]);
        }
    }
    for (const a of L.activations) {
        add(new window.Rectangle(X(a.x), Y(a.y), a.width, a.height, { stroke: T.participantBorder, strokeWidth: 1, fill: T.activationBg, fillStyle: 'solid', roughness: 0 }));
    }
    for (const m of L.messages) {
        const opts = { ...lineOpts, strokeDasharray: m.solid ? '' : '6 4', label: m.label || '', labelColor: T.messageText };
        try {
            if (m.self) {
                const [a, b, c, d] = m.points.map(p => ({ x: X(p.x), y: Y(p.y) }));
                const segs = [add(new window.Line(a, b, opts)), add(new window.Line(b, c, { ...opts, label: '' })),
                    add(m.arrowHead === 'open' || m.arrowHead === 'async' ? new window.Arrow(c, d, { ...opts, label: '' }) : new window.Line(c, d, { ...opts, label: '' }))];
                group(segs);
                continue;
            }
            const sp = { x: X(m.x1), y: Y(m.y) };
            const ep = { x: X(m.x2), y: Y(m.y) };
            if (m.bidirectional) {
                // One arrow with heads at both ends (<<->>, <<-->>).
                add(new window.Arrow(sp, ep, { ...opts, startArrowhead: 'arrow', endArrowhead: 'arrow' }));
            } else if (m.arrowHead === 'open' || m.arrowHead === 'async') {
                add(new window.Arrow(sp, ep, { ...opts, startArrowhead: 'none', endArrowhead: 'arrow' }));
            } else if (m.cross) {
                add(new window.Arrow(sp, ep, { ...opts, startArrowhead: 'none', endArrowhead: 'cross' }));
            } else {
                add(new window.Line(sp, ep, opts));
            }
        } catch (err) {
            console.warn('[SequenceRenderer] Message creation failed:', m, err);
        }
    }
    for (const n of L.notes) {
        add(new window.Rectangle(X(n.x), Y(n.y), n.width, n.height, { stroke: T.noteBorder, strokeWidth: 1, fill: T.noteBg, fillStyle: 'solid', roughness: 0.7, label: n.text, labelColor: T.noteText, labelFontSize: 11 }));
    }
    return placement.finish(first, 'mermaid-sequence-create');
}
