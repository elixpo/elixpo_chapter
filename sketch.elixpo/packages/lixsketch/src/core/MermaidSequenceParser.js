/* eslint-disable */
/**
 * MermaidSequenceParser - Parses Mermaid sequenceDiagram syntax.
 *
 * Supports:
 * - participant / actor declarations, `as` aliases, quoted names
 * - create participant|actor X / destroy X
 * - box [color] [label] … end (participant groups)
 * - Message arrows: ->> -->> -> --> -x --x -) --) <<->> <<-->>
 * - Activations: activate/deactivate and the +/- shorthand (A->>+B, B-->>-A)
 * - Notes: Note left of / right of / over (one or two participants)
 * - Blocks: loop, alt/else, opt, par/and, critical/option, break, rect
 * - autonumber [start [step]] / autonumber off
 * - title (with or without colon), accTitle / accDescr / links ignored
 * - Unrecognised lines are reported as errors with their line number.
 */

// Message arrow types (longest first when matching)
const ARROW_TYPES = {
    '<<-->>': { solid: false, arrowHead: 'open', cross: false, bidirectional: true },
    '<<->>': { solid: true, arrowHead: 'open', cross: false, bidirectional: true },
    '-->>': { solid: false, arrowHead: 'open', cross: false },
    '->>': { solid: true, arrowHead: 'open', cross: false },
    '-->': { solid: false, arrowHead: 'none', cross: false },
    '->': { solid: true, arrowHead: 'none', cross: false },
    '--x': { solid: false, arrowHead: 'cross', cross: true },
    '-x': { solid: true, arrowHead: 'cross', cross: true },
    '--)': { solid: false, arrowHead: 'async', cross: false },
    '-)': { solid: true, arrowHead: 'async', cross: false },
};
const ARROW_PATTERNS = Object.keys(ARROW_TYPES).sort((a, b) => b.length - a.length);
const BLOCK_START = /^(loop|alt|opt|par|critical|break|rect)\b\s*(.*)$/i;
const BLOCK_SECTION = /^(else|and|option)\b\s*(.*)$/i;

function clean(text) {
    return String(text || '').trim().replace(/^"(.*)"$/, '$1').replace(/<br\s*\/?>/gi, '\n')
        .replace(/#quot;/g, '"').replace(/#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

/** Parse; returns the diagram or null (see parseSequenceDiagramWithErrors). */
export function parseSequenceDiagram(src) {
    const { diagram } = parseSequenceDiagramWithErrors(src);
    return diagram;
}

export function parseSequenceDiagramWithErrors(src) {
    const errors = [];
    if (typeof src !== 'string') return { diagram: null, errors: [{ line: 1, message: 'Source must be a string' }] };
    const rawLines = src.split('\n');
    let headerLine = -1;
    for (let i = 0; i < rawLines.length; i += 1) {
        const t = rawLines[i].trim();
        if (!t || t.startsWith('%%')) continue;
        headerLine = i;
        break;
    }
    if (headerLine < 0 || rawLines[headerLine].trim().toLowerCase() !== 'sequencediagram') {
        return { diagram: null, errors: [{ line: headerLine + 1 || 1, message: 'Expected "sequenceDiagram"' }] };
    }

    const participants = [];
    const byName = new Map();
    const aliases = new Map();
    const messages = [];
    const notes = [];
    const blocks = [];
    const blockStack = [];
    const boxes = [];
    let currentBox = null;
    const activations = [];
    const openActivations = new Map(); // name -> stack of activation objects
    let title = '';
    let autoNumber = false;
    let nextNumber = 1;
    let numberStep = 1;
    let pendingCreate = null;

    const resolveName = (name) => {
        const t = clean(name);
        return aliases.get(t) || t;
    };
    const addParticipant = (name, type = 'participant', extra = {}) => {
        if (!name) return null;
        if (byName.has(name)) return byName.get(name);
        const p = { name, type, ...extra };
        participants.push(p);
        byName.set(name, p);
        if (currentBox) currentBox.participants.push(name);
        return p;
    };
    const ensure = (name) => addParticipant(resolveName(name));
    const activate = (name, at) => {
        const stack = openActivations.get(name) || [];
        const a = { participant: name, start: at, end: null, depth: stack.length };
        stack.push(a);
        openActivations.set(name, stack);
        activations.push(a);
    };
    const deactivate = (name, at, lineNo) => {
        const stack = openActivations.get(name) || [];
        const a = stack.pop();
        if (!a) { errors.push({ line: lineNo, message: `Parse error on line ${lineNo}: "${name}" is not active` }); return; }
        a.end = Math.max(a.start, at);
    };
    const lastMsg = () => Math.max(0, messages.length - 1);

    for (let i = headerLine + 1; i < rawLines.length; i += 1) {
        const lineNo = i + 1;
        const line = rawLines[i].trim().replace(/;$/, '');
        if (!line || line.startsWith('%%')) continue;
        let m;

        if ((m = line.match(/^title(?:\s*:\s*|\s+)(.+)$/i))) { title = clean(m[1]); continue; }
        if (/^(accTitle|accDescr|links?|properties|details)\b/i.test(line)) continue;
        if ((m = line.match(/^autonumber(?:\s+(off|\d+)(?:\s+(\d+))?)?$/i))) {
            if (m[1] && m[1].toLowerCase() === 'off') { autoNumber = false; continue; }
            autoNumber = true;
            if (m[1]) nextNumber = Number(m[1]);
            if (m[2]) numberStep = Number(m[2]);
            continue;
        }
        if ((m = line.match(/^box\b\s*(.*)$/i))) {
            let rest = m[1].trim();
            let color = null;
            const colorMatch = rest.match(/^(rgba?\([^)]*\)|#[0-9a-f]{3,8}|transparent|[a-z]+)(?:\s+|$)(.*)$/i);
            if (colorMatch && (/^(rgba?\(|#|transparent$)/i.test(colorMatch[1]) || ['aqua', 'red', 'green', 'blue', 'yellow', 'purple', 'orange', 'gray', 'grey', 'pink'].includes(colorMatch[1].toLowerCase()))) {
                color = colorMatch[1];
                rest = colorMatch[2];
            }
            currentBox = { label: clean(rest), color, participants: [] };
            boxes.push(currentBox);
            blockStack.push({ kind: 'box' });
            continue;
        }
        if ((m = line.match(/^(create\s+)?(participant|actor)\s+(.+?)(?:\s+as\s+(.+))?$/i))) {
            const type = m[2].toLowerCase();
            const id = clean(m[3]);
            const name = m[4] ? clean(m[4]) : id;
            if (m[4]) aliases.set(id, name);
            const p = addParticipant(name, type);
            if (p && p.type !== type) p.type = type;
            if (m[1] && p) { p.createdAt = messages.length; pendingCreate = name; }
            continue;
        }
        if ((m = line.match(/^destroy\s+(.+)$/i))) {
            const p = ensure(m[1]);
            if (p) p.destroyedAt = messages.length;
            continue;
        }
        if ((m = line.match(/^note\s+(left of|right of|over)\s+([^:]+?)\s*:\s*(.*)$/i))) {
            const targets = m[2].split(',').map(s => resolveName(s)).filter(Boolean);
            targets.forEach(t => ensure(t));
            notes.push({ position: m[1].toLowerCase(), targets, text: clean(m[3]), atMessage: messages.length });
            continue;
        }
        if ((m = line.match(/^(activate|deactivate)\s+(.+)$/i))) {
            const name = resolveName(m[2]);
            ensure(name);
            if (m[1].toLowerCase() === 'activate') activate(name, messages.length ? lastMsg() : 0);
            else deactivate(name, lastMsg(), lineNo);
            continue;
        }
        if ((m = line.match(BLOCK_START))) {
            const type = m[1].toLowerCase();
            const label = clean(m[2]);
            const block = { type, label, startMsg: messages.length, sections: [{ label, startMsg: messages.length }], endMsg: messages.length, depth: blockStack.filter(b => b.kind === 'block').length };
            if (type === 'rect') { block.color = label; block.label = ''; block.sections[0].label = ''; }
            blockStack.push({ kind: 'block', block });
            continue;
        }
        if ((m = line.match(BLOCK_SECTION))) {
            const top = [...blockStack].reverse().find(b => b.kind === 'block');
            if (!top) { errors.push({ line: lineNo, message: `Parse error on line ${lineNo}: '${m[1]}' outside a block` }); continue; }
            top.block.sections.push({ label: clean(m[2]), startMsg: messages.length, keyword: m[1].toLowerCase() });
            continue;
        }
        if (/^end$/i.test(line)) {
            const top = blockStack.pop();
            if (!top) { errors.push({ line: lineNo, message: `Parse error on line ${lineNo}: unexpected 'end'` }); continue; }
            if (top.kind === 'box') currentBox = null;
            else { top.block.endMsg = messages.length; blocks.push(top.block); }
            continue;
        }

        // Message: From ARROW [+-]To: Text
        let found = null;
        for (const pattern of ARROW_PATTERNS) {
            const idx = line.indexOf(pattern);
            if (idx > 0 && (!found || idx < found.idx || (idx === found.idx && pattern.length > found.pattern.length))) found = { pattern, idx };
        }
        if (found) {
            const fromRaw = line.slice(0, found.idx);
            let rest = line.slice(found.idx + found.pattern.length);
            const colon = rest.indexOf(':');
            let text = '';
            if (colon >= 0) { text = clean(rest.slice(colon + 1)); rest = rest.slice(0, colon); }
            rest = rest.trim();
            let act = null;
            if (rest.startsWith('+')) { act = '+'; rest = rest.slice(1); }
            else if (rest.startsWith('-')) { act = '-'; rest = rest.slice(1); }
            const from = resolveName(fromRaw);
            const to = resolveName(rest);
            if (!from || !to) { errors.push({ line: lineNo, message: `Parse error on line ${lineNo}: message needs a sender and a receiver` }); continue; }
            ensure(from);
            ensure(to);
            const index = messages.length;
            const number = autoNumber ? nextNumber : null;
            if (autoNumber) nextNumber += numberStep;
            messages.push({ from, to, text, number, index, ...ARROW_TYPES[found.pattern], activate: act === '+', deactivate: act === '-', creates: pendingCreate && pendingCreate === to ? to : null });
            pendingCreate = null;
            if (act === '+') activate(to, index);
            if (act === '-') deactivate(from, index, lineNo);
            continue;
        }

        errors.push({ line: lineNo, message: `Parse error on line ${lineNo}: unrecognised statement "${line}"` });
    }

    for (const open of blockStack) {
        if (open.kind === 'block') { open.block.endMsg = messages.length; blocks.push(open.block); }
    }
    if (blockStack.some(b => b.kind === 'block')) errors.push({ line: rawLines.length, message: `Parse error: '${blockStack.find(b => b.kind === 'block').block.type}' block is missing 'end'` });
    for (const a of activations) if (a.end === null) a.end = Math.max(a.start, messages.length - 1);
    if (participants.length === 0 && !errors.length) errors.push({ line: headerLine + 1, message: 'Parse error: no participants or messages' });

    const diagram = participants.length ? {
        type: 'sequenceDiagram',
        title,
        participants,
        messages,
        notes,
        blocks,
        boxes,
        activations,
        autoNumber,
    } : null;
    return { diagram: errors.length ? null : diagram, errors, partial: diagram };
}
