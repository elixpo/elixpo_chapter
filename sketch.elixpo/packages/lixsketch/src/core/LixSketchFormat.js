/**
 * LixSketchFormat — the `.lixsketch` text file format.
 *
 * A `.lixsketch` file is a LixScript document with a version header:
 *
 *     lixsketch 1
 *     @name "Auth flow"
 *     @background #15111f
 *
 *     rect login at 200, 60 size 200x65 {
 *       stroke: #4A90D9
 *       label: "Login"
 *     }
 *     arrow a1 from login.bottom to check.top
 *
 * Every documented LixScript construct (variables, `at`/`size`, relative
 * references, `from … to …`, property blocks) is valid here; the format
 * adds the properties needed to describe a whole scene losslessly
 * (bindings, groups, z-order, markup, assets, scene settings).
 *
 * Pipeline:  text ──parseLixSketch──▶ AST ──compile──▶ v1 scene JSON
 *            scene JSON ──sceneToLixSketch──▶ text
 *
 * The scene JSON is exactly what SceneSerializer.saveScene() produces and
 * loadScene() consumes, so loading a `.lixsketch` file goes through the
 * same code path as a cloud/local restore. For any scene produced by
 * saveScene(), `compile(sceneToLixSketch(scene))` deep-equals `scene`.
 *
 * The full grammar (EBNF) and property reference live in
 * src/content/docs/lixsketch-dsl.md (published at /docs/lixsketch-dsl).
 * This module has no DOM dependency.
 */

import { ASSET_REF_PREFIX, assetIdFor, inlineAssets } from './ScenePersistence.js';
import { ARROWHEAD_TYPES, normalizeArrowhead, readArrowheads } from './ArrowHeads.js';

export const LIXSKETCH_FORMAT_VERSION = 1;
export const LIXSKETCH_EXTENSION = '.lixsketch';
export const LIXSKETCH_MIME_TYPE = 'text/vnd.lixsketch';

// ============================================================
// Schema
// ============================================================

const KEYWORD_TYPES = {
    rect: 'rectangle', rectangle: 'rectangle',
    circle: 'circle', ellipse: 'circle',
    line: 'line', arrow: 'arrow',
    freehand: 'freehandStroke',
    text: 'text', code: 'code', image: 'image', icon: 'icon',
    frame: 'frame', embed: 'frame',
};
export const SHAPE_KEYWORDS = Object.keys(KEYWORD_TYPES);

const TYPE_KEYWORD = {
    rectangle: 'rect', circle: 'circle', line: 'line', arrow: 'arrow',
    freehandStroke: 'freehand', text: 'text', code: 'code', image: 'image',
    icon: 'icon', frame: 'frame',
};

export const LINE_STYLES = { solid: '', dashed: '10,10', dotted: '2,8' };
export const SIDES = ['top', 'bottom', 'left', 'right', 'center'];
const REF_PROPS = ['x', 'y', 'left', 'top', 'right', 'bottom', 'centerX', 'centerY', 'width', 'height'];

// Record-level fields per type: DSL name → { key, default, kind }.
// `default: undefined` means optional (key omitted when absent).
// Fields with a default are always present in compiled records and elided
// from exported text when equal to the default.
const COMMON_FIELDS = {
    group: { key: 'groupId', default: null },
    docBlocks: { key: 'docBlockIds', default: [], kind: 'idList' },
    locked: { key: 'locked', default: undefined, kind: 'boolean' },
    link: { key: 'link', default: undefined },
    // 0–1 (or a 0–100 percentage); omitted = fully opaque.
    opacity: { key: 'opacity', default: undefined, kind: 'opacity' },
};
const ROTATION = { rotation: { key: 'rotation', default: 0, kind: 'number' } };
// sharp | round; omitted = sharp. `roundness` is accepted as an alias.
const EDGES = { edges: { key: 'edges', default: undefined, kind: 'edges' } };

const TYPE_FIELDS = {
    rectangle: { ...ROTATION, ...EDGES },
    circle: { ...ROTATION },
    line: {
        control: { key: 'controlPoint', default: null, kind: 'point' },
        curved: { key: 'isCurved', default: false, kind: 'boolean' },
        // Optional heads; `none` is never stored for lines.
        startHead: { key: 'startArrowhead', default: undefined, kind: 'lineArrowhead' },
        endHead: { key: 'endArrowhead', default: undefined, kind: 'lineArrowhead' },
    },
    arrow: {
        style: { key: 'arrowOutlineStyle', default: 'solid' },
        // Independent heads (none, arrow, bar, dot, circle, triangle, …).
        // The pre-v2 single `head:` property is accepted and sets endHead.
        startHead: { key: 'startArrowhead', default: 'none', kind: 'arrowhead' },
        endHead: { key: 'endArrowhead', default: 'arrow', kind: 'arrowhead' },
        curve: { key: 'arrowCurved', default: 'straight' },
        curveAmount: { key: 'arrowCurveAmount', default: 50, kind: 'number' },
        control1: { key: 'controlPoint1', default: undefined, kind: 'point' },
        control2: { key: 'controlPoint2', default: undefined, kind: 'point' },
        bindStart: { key: 'startAttachmentID', default: undefined, kind: 'id' },
        bindEnd: { key: 'endAttachmentID', default: undefined, kind: 'id' },
    },
    freehandStroke: { ...ROTATION },
    frame: {
        ...ROTATION,
        ...EDGES,
        name: { key: 'frameName', default: undefined },
        fillStyle: { key: 'fillStyle', default: 'transparent' },
        fillColor: { key: 'fillColor', default: '#1e1e28' },
        gridSize: { key: 'gridSize', default: 20, kind: 'number' },
        gridColor: { key: 'gridColor', default: 'rgba(255,255,255,0.06)' },
        frameType: { key: 'frameType', default: null },
        url: { key: 'webEmbedURL', default: null },
        contains: { key: 'containedShapeIDs', default: [], kind: 'idList' },
    },
    text: { ...ROTATION, markup: { key: 'groupHTML', default: undefined } },
    code: { ...ROTATION, markup: { key: 'groupHTML', default: undefined } },
    image: {
        ...ROTATION,
        src: { key: 'href', default: '' },
        sizeBytes: { key: 'sizeBytes', default: 0, kind: 'number' },
        cloudinaryId: { key: 'cloudinaryId', default: null },
        storage: { key: 'storageProvider', default: 'platform_cloudinary' },
        storageCloudName: { key: 'storageCloudName', default: null },
        aiGenerated: { key: 'aiGenerated', default: false, kind: 'boolean' },
        aiModel: { key: 'aiModel', default: null },
        frameType: { key: 'frameType', default: null },
        graph: { key: 'graphData', default: null },
    },
    icon: {
        ...ROTATION,
        markup: { key: 'elementHTML', default: undefined },
        viewBoxWidth: { key: 'viewboxWidth', default: 24, kind: 'number' },
        viewBoxHeight: { key: 'viewboxHeight', default: 24, kind: 'number' },
    },
};

// Record keys written by the geometry clause (never emitted as properties).
const GEOMETRY_KEYS = {
    rectangle: ['x', 'y', 'width', 'height'],
    circle: ['x', 'y', 'rx', 'ry'],
    line: ['startPoint', 'endPoint'],
    arrow: ['startPoint', 'endPoint'],
    freehandStroke: ['points'],
    frame: ['x', 'y', 'width', 'height'],
    text: ['x', 'y'],
    code: ['x', 'y'],
    image: ['x', 'y', 'width', 'height'],
    icon: ['x', 'y', 'width', 'height'],
};

// Types whose records carry an `options` object.
const HAS_OPTIONS = new Set(['rectangle', 'circle', 'line', 'arrow', 'freehandStroke', 'frame']);

// Authoring-only properties: interpreted on compile, never part of the record.
const DERIVED_PROPS = {
    text: ['content', 'text', 'color', 'fontSize', 'fontFamily', 'align', 'anchor'],
    code: ['content', 'language', 'color', 'fontSize', 'fontFamily'],
    icon: ['svg', 'color', 'name'],
    arrow: ['bindStartSide', 'bindStartOffset', 'bindEndSide', 'bindEndOffset', 'headLength'],
    freehandStroke: ['points'],
    image: ['href', 'url'],
};

const RESERVED_COMMON = new Set(['parent', 'rotation', 'group', 'docBlocks', 'locked', 'link', 'options', 'data', 'opacity', 'edges', 'roundness']);

function fieldsFor(type) {
    return { ...COMMON_FIELDS, ...TYPE_FIELDS[type] };
}

// ============================================================
// Errors
// ============================================================

export class LixSketchError extends Error {
    constructor(errors) {
        const first = errors[0];
        super(first ? `${first.line}:${first.col}: ${first.message}` : 'Invalid .lixsketch document');
        this.name = 'LixSketchError';
        this.errors = errors;
    }
}

export function formatDiagnostic(d) {
    return `${d.line}:${d.col}: ${d.severity === 'warning' ? 'warning: ' : ''}${d.message}`;
}

class ParseFailure extends Error {
    constructor(message, loc) { super(message); this.loc = loc; }
}

// ============================================================
// Scanner
// ============================================================

const IDENT_START = /[A-Za-z_]/;
const IDENT_CHAR = /[A-Za-z0-9_]/;
const ID_CHAR = /[A-Za-z0-9_-]/;
const NUMBER_RE = /^-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

class Scanner {
    constructor(src) {
        this.src = src;
        this.pos = 0;
        this.line = 1;
        this.col = 1;
    }
    eof() { return this.pos >= this.src.length; }
    peek(o = 0) { return this.src[this.pos + o]; }
    startsWith(s) { return this.src.startsWith(s, this.pos); }
    next() {
        const ch = this.src[this.pos++];
        if (ch === '\n') { this.line += 1; this.col = 1; } else { this.col += 1; }
        return ch;
    }
    loc() { return { line: this.line, col: this.col, pos: this.pos }; }
    fail(message, loc = this.loc()) { throw new ParseFailure(message, loc); }

    skipSpaces() {
        while (!this.eof()) {
            const ch = this.peek();
            if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '﻿') this.next();
            else break;
        }
    }
    /** Skip spaces and comments without crossing a newline (except inside block comments). */
    skipInline() {
        for (;;) {
            this.skipSpaces();
            if (this.startsWith('//')) {
                while (!this.eof() && this.peek() !== '\n') this.next();
            } else if (this.startsWith('/*')) {
                const start = this.loc();
                this.next(); this.next();
                while (!this.eof() && !this.startsWith('*/')) this.next();
                if (this.eof()) this.fail("Unterminated block comment '/*'", start);
                this.next(); this.next();
            } else {
                return;
            }
        }
    }
    /** Skip spaces, comments and newlines. */
    skipBlank() {
        for (;;) {
            this.skipInline();
            if (this.peek() === '\n') this.next();
            else return;
        }
    }
    atLineEnd() { return this.eof() || this.peek() === '\n'; }
    expectLineEnd(what = 'statement') {
        this.skipInline();
        if (!this.atLineEnd()) this.fail(`Unexpected '${this.peek()}' after ${what}`);
    }
    skipToLineEnd() { while (!this.eof() && this.peek() !== '\n') this.next(); }

    readIdent() {
        if (!IDENT_START.test(this.peek() || '')) this.fail(`Expected a name, found ${describe(this.peek())}`);
        let s = '';
        while (!this.eof() && IDENT_CHAR.test(this.peek())) s += this.next();
        return s;
    }
    /** Shape id: identifier that may contain '-', or a quoted string. */
    readId() {
        const ch = this.peek();
        if (ch === '"' || ch === "'") return this.readString();
        if (!IDENT_START.test(ch || '')) this.fail(`Expected a shape id, found ${describe(ch)}`);
        let s = '';
        while (!this.eof() && ID_CHAR.test(this.peek())) {
            // A '-' only continues an id when followed by an id character.
            if (this.peek() === '-' && !IDENT_CHAR.test(this.peek(1) || '')) break;
            s += this.next();
        }
        return s;
    }
    readNumber() {
        const start = this.loc();
        let s = '';
        if (this.peek() === '-' || this.peek() === '+') s += this.next();
        while (!this.eof() && /[0-9]/.test(this.peek())) s += this.next();
        if (this.peek() === '.' && /[0-9]/.test(this.peek(1) || '')) {
            s += this.next();
            while (!this.eof() && /[0-9]/.test(this.peek())) s += this.next();
        }
        if ((this.peek() === 'e' || this.peek() === 'E') && /[0-9+-]/.test(this.peek(1) || '')) {
            const save = { pos: this.pos, line: this.line, col: this.col };
            let exp = this.next();
            if (this.peek() === '+' || this.peek() === '-') exp += this.next();
            if (/[0-9]/.test(this.peek() || '')) {
                while (!this.eof() && /[0-9]/.test(this.peek())) exp += this.next();
                s += exp;
            } else {
                Object.assign(this, save);
            }
        }
        if (!NUMBER_RE.test(s)) this.fail(`Expected a number, found ${describe(s || this.peek())}`, start);
        return Number(s);
    }
    readString() {
        const start = this.loc();
        const quote = this.next();
        let out = '';
        for (;;) {
            if (this.eof() || this.peek() === '\n') this.fail('Unterminated string', start);
            const ch = this.next();
            if (ch === quote) return out;
            if (ch !== '\\') { out += ch; continue; }
            const esc = this.next();
            switch (esc) {
                case 'n': out += '\n'; break;
                case 't': out += '\t'; break;
                case 'r': out += '\r'; break;
                case 'b': out += '\b'; break;
                case 'f': out += '\f'; break;
                case '0': out += '\0'; break;
                case 'u': {
                    const hex = this.src.slice(this.pos, this.pos + 4);
                    if (!/^[0-9a-fA-F]{4}$/.test(hex)) this.fail('Invalid \\u escape', start);
                    for (let i = 0; i < 4; i += 1) this.next();
                    out += String.fromCharCode(parseInt(hex, 16));
                    break;
                }
                default: out += esc;
            }
        }
    }
    /**
     * Heredoc: `<<<TAG` newline … newline `TAG`. The terminator's leading
     * whitespace is stripped from every content line.
     */
    readHeredoc() {
        const start = this.loc();
        this.next(); this.next(); this.next();
        let tag = '';
        while (!this.eof() && /[A-Za-z0-9_]/.test(this.peek())) tag += this.next();
        if (!tag) this.fail("Expected a heredoc tag after '<<<'", start);
        this.skipSpaces();
        if (this.peek() !== '\n') this.fail(`Expected a newline after '<<<${tag}'`);
        this.next();
        const lines = [];
        for (;;) {
            if (this.eof()) this.fail(`Unterminated heredoc '<<<${tag}' (missing closing '${tag}' line)`, start);
            let raw = '';
            while (!this.eof() && this.peek() !== '\n') raw += this.next();
            const body = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
            if (body.trim() === tag) {
                const indent = body.slice(0, body.indexOf(tag));
                return lines.map((l, i) => {
                    if (l === '') return l;
                    if (!l.startsWith(indent)) {
                        if (l.trim() === '') return '';
                        this.fail(`Heredoc line is indented less than its closing '${tag}'`, { line: start.line + 1 + i, col: 1 });
                    }
                    return l.slice(indent.length);
                }).join('\n');
            }
            lines.push(raw);
            if (!this.eof()) this.next();
        }
    }
}

function describe(ch) {
    if (ch === undefined || ch === '') return 'end of file';
    if (ch === '\n') return 'end of line';
    return `'${ch}'`;
}

// ============================================================
// Parser — text → AST
// ============================================================

/**
 * Parse `.lixsketch` / LixScript text.
 * Returns { ast, errors } where errors are { line, col, message }.
 * ast = { version, directives[], variables{}, assets[], shapes[] }
 */
export function parseLixSketch(source) {
    const errors = [];
    const ast = { version: null, header: null, directives: [], variables: {}, assets: [], shapes: [] };
    if (typeof source !== 'string') {
        errors.push({ line: 1, col: 1, message: 'Source must be a string', severity: 'error' });
        return { ast, errors };
    }
    const sc = new Scanner(source);
    const report = (err) => {
        const loc = err.loc || sc.loc();
        errors.push({ line: loc.line, col: loc.col, message: err.message, severity: 'error' });
    };

    // Header
    try {
        sc.skipBlank();
        if (sc.startsWith('lixsketch') && !IDENT_CHAR.test(sc.peek(9) || '')) {
            const loc = sc.loc();
            sc.readIdent();
            sc.skipSpaces();
            const vLoc = sc.loc();
            const version = sc.readNumber();
            if (!Number.isInteger(version) || version < 1) sc.fail(`Invalid format version '${version}'`, vLoc);
            if (version > LIXSKETCH_FORMAT_VERSION) {
                sc.fail(`Unsupported .lixsketch version ${version} (this build reads up to ${LIXSKETCH_FORMAT_VERSION})`, vLoc);
            }
            ast.version = version;
            ast.header = loc;
            sc.expectLineEnd('header');
        }
    } catch (err) {
        if (!(err instanceof ParseFailure)) throw err;
        report(err);
        sc.skipToLineEnd();
    }

    for (;;) {
        sc.skipBlank();
        if (sc.eof()) break;
        const stmtLoc = sc.loc();
        try {
            parseStatement(sc, ast, stmtLoc);
        } catch (err) {
            if (!(err instanceof ParseFailure)) throw err;
            report(err);
            recover(sc);
        }
    }
    return { ast, errors };
}

// Skip the rest of a broken statement (including a property block opened on it).
function recover(sc) {
    let depth = 0;
    let line = '';
    while (!sc.eof() && sc.peek() !== '\n') {
        const ch = sc.next();
        line += ch;
        if (ch === '{') depth += 1;
        if (ch === '}') depth -= 1;
    }
    if (depth <= 0) return;
    while (!sc.eof()) {
        const ch = sc.next();
        if (ch === '{') depth += 1;
        if (ch === '}') { depth -= 1; if (depth <= 0) return; }
    }
}

function parseStatement(sc, ast, loc) {
    const ch = sc.peek();
    if (ch === '@') {
        sc.next();
        const name = readKey(sc);
        sc.skipSpaces();
        const value = sc.atLineEnd() ? { value: true, loc: sc.loc() } : readValue(sc, ast.variables, { inline: false, directive: true });
        ast.directives.push({ name, value: value.value, raw: value.raw, loc, valueLoc: value.loc });
        sc.expectLineEnd(`@${name}`);
        return;
    }
    if (ch === '$') {
        sc.next();
        const name = sc.readIdent();
        sc.skipSpaces();
        if (sc.peek() !== '=') sc.fail(`Expected '=' after $${name}`);
        sc.next();
        sc.skipSpaces();
        const value = readValue(sc, ast.variables, { inline: false });
        ast.variables[name] = value.value;
        sc.expectLineEnd(`$${name}`);
        return;
    }
    if (!IDENT_START.test(ch || '')) sc.fail(`Unexpected ${describe(ch)}`);
    const kwLoc = sc.loc();
    const keyword = sc.readIdent();
    if (keyword === 'asset') {
        sc.skipSpaces();
        const id = sc.readId();
        sc.skipSpaces();
        if (sc.peek() !== '=') sc.fail(`Expected '=' after asset ${id}`);
        sc.next();
        sc.skipSpaces();
        const value = readValue(sc, ast.variables, { inline: false });
        if (typeof value.value !== 'string') sc.fail(`Asset '${id}' must be a string or heredoc`, value.loc);
        ast.assets.push({ id, value: value.value, loc });
        sc.expectLineEnd('asset');
        return;
    }
    if (!KEYWORD_TYPES[keyword]) {
        const suggestion = closest(keyword, [...SHAPE_KEYWORDS, 'asset']);
        sc.fail(`Unknown statement '${keyword}'${suggestion ? ` (did you mean '${suggestion}'?)` : ''}`, kwLoc);
    }
    parseShape(sc, ast, keyword, loc);
}

function parseShape(sc, ast, keyword, loc) {
    sc.skipSpaces();
    const idLoc = sc.loc();
    if (sc.atLineEnd() || sc.peek() === '{') sc.fail(`Expected a shape id after '${keyword}'`);
    const id = sc.readId();
    const shape = { keyword, type: KEYWORD_TYPES[keyword], id, loc, idLoc, geometry: {}, props: [] };
    const isConnection = keyword === 'arrow' || keyword === 'line';

    for (;;) {
        sc.skipInline();
        if (sc.atLineEnd() || sc.peek() === '{') break;
        const clauseLoc = sc.loc();
        if (!IDENT_START.test(sc.peek())) sc.fail(`Unexpected ${describe(sc.peek())} in ${keyword} declaration`);
        const word = sc.readIdent();
        sc.skipSpaces();
        if (shape.geometry[word]) sc.fail(`Duplicate '${word}' clause`, clauseLoc);
        if (isConnection && (word === 'from' || word === 'to')) {
            shape.geometry[word] = parseEndpoint(sc, ast.variables);
        } else if (!isConnection && word === 'at') {
            const x = parseExpr(sc, ast.variables);
            expectChar(sc, ',', "between X and Y in 'at X, Y'");
            const y = parseExpr(sc, ast.variables);
            shape.geometry.at = { x, y, loc: clauseLoc };
        } else if (!isConnection && word === 'center') {
            const x = parseExpr(sc, ast.variables);
            expectChar(sc, ',', "between X and Y in 'center X, Y'");
            const y = parseExpr(sc, ast.variables);
            shape.geometry.center = { x, y, loc: clauseLoc };
        } else if (!isConnection && word === 'size') {
            const w = parseExpr(sc, ast.variables);
            sc.skipSpaces();
            if (sc.peek() !== 'x') sc.fail(`Expected 'x' in 'size WIDTHxHEIGHT', found ${describe(sc.peek())}`);
            sc.next();
            const h = parseExpr(sc, ast.variables);
            shape.geometry.size = { w, h, loc: clauseLoc };
        } else if (!isConnection && word === 'radius') {
            const rx = parseExpr(sc, ast.variables);
            sc.skipSpaces();
            let ry = rx;
            if (sc.peek() === ',') { sc.next(); ry = parseExpr(sc, ast.variables); }
            shape.geometry.radius = { rx, ry, loc: clauseLoc };
        } else {
            const allowed = isConnection ? ['from', 'to'] : ['at', 'size', 'center', 'radius'];
            sc.fail(`Unknown clause '${word}' for ${keyword} (expected ${allowed.map(a => `'${a}'`).join(' or ')})`, clauseLoc);
        }
    }
    if (sc.peek() === '{') parseBlock(sc, ast.variables, shape.props);
    sc.expectLineEnd(`${keyword} ${id}`);
    ast.shapes.push(shape);
}

function expectChar(sc, ch, context) {
    sc.skipSpaces();
    if (sc.peek() !== ch) sc.fail(`Expected '${ch}' ${context}, found ${describe(sc.peek())}`);
    sc.next();
}

function parseBlock(sc, variables, props) {
    const open = sc.loc();
    sc.next(); // {
    sc.skipInline();
    const inline = !sc.atLineEnd();
    for (;;) {
        // separators + blank lines
        for (;;) {
            sc.skipBlank();
            if (sc.peek() === ',' || sc.peek() === ';') { sc.next(); continue; }
            break;
        }
        if (sc.eof()) sc.fail(`Unclosed '{' (opened at ${open.line}:${open.col})`, open);
        if (sc.peek() === '}') { sc.next(); return; }
        const keyLoc = sc.loc();
        const key = readKey(sc);
        sc.skipSpaces();
        if (sc.peek() !== ':') sc.fail(`Expected ':' after property '${key}', found ${describe(sc.peek())}`);
        sc.next();
        sc.skipSpaces();
        if (sc.atLineEnd() || sc.peek() === '}') sc.fail(`Missing value for property '${key}'`);
        const value = readValue(sc, variables, { inline });
        props.push({ key, value: value.value, raw: value.raw, loc: keyLoc, valueLoc: value.loc });
        sc.skipInline();
        const ch = sc.peek();
        if (!(sc.atLineEnd() || ch === '}' || ch === ',' || ch === ';')) {
            sc.fail(`Unexpected ${describe(ch)} after value of '${key}'`);
        }
    }
}

/** Property / directive key: segment { '.' segment }, segment = ident | string. */
function readKey(sc) {
    const parts = [];
    for (;;) {
        const ch = sc.peek();
        if (ch === '"' || ch === "'") parts.push(sc.readString());
        else parts.push(sc.readIdent());
        if (sc.peek() === '.' && (IDENT_START.test(sc.peek(1) || '') || sc.peek(1) === '"' || sc.peek(1) === "'")) {
            sc.next();
            continue;
        }
        return parts.join('.');
    }
}

// ── Values ──

function readValue(sc, variables, { inline, directive = false }) {
    const loc = sc.loc();
    const ch = sc.peek();
    if (ch === '"' || ch === "'") return { value: sc.readString(), loc, raw: 'string' };
    if (sc.startsWith('<<<')) return { value: sc.readHeredoc(), loc, raw: 'heredoc' };
    if (ch === '[' || ch === '{') return { value: readComposite(sc, variables), loc, raw: 'composite' };
    // Bare value: rest of the line (or up to a separator in inline blocks).
    let text = '';
    let depth = 0;
    while (!sc.eof()) {
        const c = sc.peek();
        if (c === '\n') break;
        if (c === '/' && sc.peek(1) === '/' && (text === '' || /\s$/.test(text))) break;
        if (c === '(') depth += 1;
        if (c === ')') depth = Math.max(0, depth - 1);
        if (depth === 0 && !directive && (c === '}' || (inline && (c === ',' || c === ';')))) break;
        text += sc.next();
    }
    text = text.replace(/\s+$/, '');
    return { value: interpretBare(text, variables, loc, sc), loc, raw: 'bare', text };
}

function interpretBare(text, variables, loc, sc) {
    if (/^\$\w+$/.test(text)) {
        const name = text.slice(1);
        if (!(name in variables)) sc.fail(`Undefined variable '$${name}'`, loc);
        return variables[name];
    }
    if (NUMBER_RE.test(text)) return Number(text);
    if (text === 'true') return true;
    if (text === 'false') return false;
    if (text === 'null') return null;
    return text.replace(/\$(\w+)/g, (match, name) => {
        if (!(name in variables)) sc.fail(`Undefined variable '$${name}'`, loc);
        return String(variables[name]);
    });
}

function readComposite(sc, variables) {
    const open = sc.loc();
    const ch = sc.next();
    if (ch === '[') {
        const out = [];
        for (;;) {
            sc.skipBlank();
            if (sc.eof()) sc.fail("Unclosed '['", open);
            if (sc.peek() === ']') { sc.next(); return out; }
            out.push(readCompositeItem(sc, variables));
            sc.skipBlank();
            if (sc.peek() === ',') { sc.next(); continue; }
            if (sc.peek() === ']') { sc.next(); return out; }
            sc.fail(`Expected ',' or ']' in list, found ${describe(sc.peek())}`);
        }
    }
    const out = {};
    for (;;) {
        sc.skipBlank();
        if (sc.eof()) sc.fail("Unclosed '{'", open);
        if (sc.peek() === '}') { sc.next(); return out; }
        const q = sc.peek();
        const key = q === '"' || q === "'" ? sc.readString() : sc.readIdent();
        sc.skipBlank();
        if (sc.peek() !== ':') sc.fail(`Expected ':' after key '${key}'`);
        sc.next();
        sc.skipBlank();
        out[key] = readCompositeItem(sc, variables);
        sc.skipBlank();
        if (sc.peek() === ',') { sc.next(); continue; }
        if (sc.peek() === '}') { sc.next(); return out; }
        sc.fail(`Expected ',' or '}' in object, found ${describe(sc.peek())}`);
    }
}

function readCompositeItem(sc, variables) {
    const loc = sc.loc();
    const ch = sc.peek();
    if (ch === '"' || ch === "'") return sc.readString();
    if (ch === '[' || ch === '{') return readComposite(sc, variables);
    let word = '';
    while (!sc.eof() && /[A-Za-z0-9_#.%+$-]/.test(sc.peek())) word += sc.next();
    if (!word) sc.fail(`Unexpected ${describe(ch)} in value`);
    return interpretBare(word, variables, loc, sc);
}

// ── Expressions (geometry) ──

function parseExpr(sc, variables) {
    let left = parseTerm(sc, variables);
    for (;;) {
        sc.skipSpaces();
        const ch = sc.peek();
        if ((ch === '+' || ch === '-') && !sc.startsWith('->')) {
            const loc = sc.loc();
            sc.next();
            const right = parseTerm(sc, variables);
            left = { kind: 'bin', op: ch, l: left, r: right, loc };
        } else {
            return left;
        }
    }
}

function parseTerm(sc, variables) {
    let left = parseFactor(sc, variables);
    for (;;) {
        sc.skipSpaces();
        const ch = sc.peek();
        if (ch === '*' || ch === '/') {
            if (ch === '/' && (sc.peek(1) === '/' || sc.peek(1) === '*')) return left;
            const loc = sc.loc();
            sc.next();
            const right = parseFactor(sc, variables);
            left = { kind: 'bin', op: ch, l: left, r: right, loc };
        } else {
            return left;
        }
    }
}

function parseFactor(sc, variables) {
    sc.skipSpaces();
    const loc = sc.loc();
    const ch = sc.peek();
    if (ch === '(') {
        sc.next();
        const inner = parseExpr(sc, variables);
        expectChar(sc, ')', 'to close the expression');
        return inner;
    }
    if (ch === '-') {
        sc.next();
        if (/[0-9.]/.test(sc.peek() || '')) return { kind: 'num', value: -sc.readNumber(), loc };
        return { kind: 'neg', e: parseFactor(sc, variables), loc };
    }
    if (/[0-9.]/.test(ch || '')) return { kind: 'num', value: sc.readNumber(), loc };
    if (ch === '$') {
        sc.next();
        const name = sc.readIdent();
        if (!(name in variables)) sc.fail(`Undefined variable '$${name}'`, loc);
        const value = Number(variables[name]);
        if (!Number.isFinite(value)) sc.fail(`Variable '$${name}' is not a number`, loc);
        return { kind: 'num', value, loc };
    }
    if (ch === '"' || ch === "'" || IDENT_START.test(ch || '')) {
        const id = sc.readId();
        if (sc.peek() === '.') {
            sc.next();
            const propLoc = sc.loc();
            const prop = sc.readIdent();
            return { kind: 'ref', id, prop, loc, propLoc };
        }
        return { kind: 'ref', id, prop: null, loc };
    }
    sc.fail(`Expected a number, $variable or shape reference, found ${describe(ch)}`);
    return null;
}

function parseEndpoint(sc, variables) {
    const loc = sc.loc();
    const first = parseExpr(sc, variables);
    sc.skipSpaces();
    if (sc.peek() === ',') {
        sc.next();
        const second = parseExpr(sc, variables);
        return { kind: 'point', x: first, y: second, loc };
    }
    // Shape reference: id | id.side | id.side ± number
    let node = first;
    let offset = 0;
    if (node.kind === 'bin' && (node.op === '+' || node.op === '-') && node.l.kind === 'ref' && node.r.kind === 'num') {
        offset = node.op === '-' ? -node.r.value : node.r.value;
        node = node.l;
    }
    if (node.kind !== 'ref') sc.fail("Expected 'X, Y' or a shape reference like 'box.right'", loc);
    const side = node.prop || 'center';
    if (!SIDES.includes(side)) {
        sc.fail(`'${side}' is not a connection side (use ${SIDES.join(', ')})`, node.propLoc || loc);
    }
    return { kind: 'ref', id: node.id, side, offset, loc };
}

function closest(word, candidates) {
    let best = null;
    let bestScore = Infinity;
    for (const c of candidates) {
        const d = levenshtein(word.toLowerCase(), c.toLowerCase());
        if (d < bestScore) { bestScore = d; best = c; }
    }
    return bestScore <= 2 ? best : null;
}

function levenshtein(a, b) {
    const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j += 1) dp[0][j] = j;
    for (let i = 1; i <= a.length; i += 1) {
        for (let j = 1; j <= b.length; j += 1) {
            dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        }
    }
    return dp[a.length][b.length];
}

// ============================================================
// Markup helpers (text / code / icon), string based — no DOM
// ============================================================

function escapeXml(value) {
    return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function unescapeXml(value) {
    return String(value).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&');
}
function attrOf(tag, name) {
    const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
    return m ? unescapeXml(m[1]) : undefined;
}
function setAttr(tag, name, value) {
    const re = new RegExp(`(\\s${name}=")[^"]*(")`);
    const escaped = escapeXml(value);
    if (re.test(tag)) return tag.replace(re, (_, a, b) => `${a}${escaped}${b}`);
    return tag.replace(/\s*(\/?)>$/, ` ${name}="${escaped}"$1>`);
}

const ALIGN_TO_ANCHOR = { left: 'start', center: 'middle', right: 'end', start: 'start', middle: 'middle', end: 'end' };
const ANCHOR_TO_ALIGN = { start: 'left', middle: 'center', end: 'right' };

function findElementTag(markup, tagName) {
    const m = markup.match(new RegExp(`<${tagName}\\b[^>]*>`));
    return m ? { tag: m[0], index: m.index } : null;
}

function extractLines(markup, tagName) {
    const open = findElementTag(markup, tagName);
    if (!open) return undefined;
    const close = markup.indexOf(`</${tagName}>`, open.index);
    if (close === -1) return undefined;
    const inner = markup.slice(open.index + open.tag.length, close);
    const tspans = [...inner.matchAll(/<tspan\b[^>]*>([\s\S]*?)<\/tspan>/g)].map(m => unescapeXml(m[1].replace(/<[^>]+>/g, '')));
    if (tspans.length) return tspans.join('\n');
    return unescapeXml(inner.replace(/<[^>]+>/g, ''));
}

function readTranslate(markup) {
    const root = markup.match(/^\s*<g\b[^>]*>/);
    if (!root) return null;
    const t = attrOf(root[0], 'transform') || '';
    const m = t.match(/translate\(\s*(-?[\d.e+-]+)[\s,]+(-?[\d.e+-]+)\s*\)/);
    return m ? { x: Number(m[1]), y: Number(m[2]) } : null;
}

/** Structured view of a text/code group's markup. */
export function extractTextProps(markup, kind = 'text') {
    const tagName = 'text';
    const el = findElementTag(markup, tagName);
    if (!el) return null;
    const props = {
        content: extractLines(markup, tagName) ?? '',
        color: attrOf(el.tag, 'fill'),
        fontSize: attrOf(el.tag, 'font-size') !== undefined ? Number(attrOf(el.tag, 'font-size')) : undefined,
        fontFamily: attrOf(el.tag, 'font-family'),
    };
    if (kind === 'text') {
        const anchor = attrOf(el.tag, 'text-anchor');
        props.align = anchor ? (ANCHOR_TO_ALIGN[anchor] || anchor) : undefined;
    } else {
        props.language = attrOf(el.tag, 'data-language');
    }
    for (const k of Object.keys(props)) if (props[k] === undefined || Number.isNaN(props[k])) delete props[k];
    return props;
}

function tspans(content) {
    return String(content).split('\n')
        .map((line, i) => `<tspan x="0" dy="${i === 0 ? '0' : '1.2em'}">${escapeXml(line || ' ')}</tspan>`).join('');
}

function generateTextMarkup(id, x, y, rotation, p) {
    const color = p.color ?? '#e8e3f3';
    const size = p.fontSize ?? 20;
    const family = p.fontFamily ?? 'lixFont';
    const anchor = ALIGN_TO_ANCHOR[p.align ?? p.anchor ?? 'left'] || 'start';
    const align = ANCHOR_TO_ALIGN[anchor];
    const transform = `translate(${x}, ${y})${rotation ? ` rotate(${rotation}, 0, 0)` : ''}`;
    return `<g id="${escapeXml(id)}" data-type="text-group" data-x="${x}" data-y="${y}" transform="${transform}">`
        + `<text id="${escapeXml(id)}-text" x="0" y="0" fill="${escapeXml(color)}" font-size="${size}" font-family="${escapeXml(family)}" text-anchor="${anchor}" dominant-baseline="hanging" white-space="pre" pointer-events="painted" data-type="text" data-initial-size="${size}" data-initial-font="${escapeXml(family)}" data-initial-color="${escapeXml(color)}" data-initial-align="${align}">`
        + `${tspans(p.content ?? p.text ?? '')}</text></g>`;
}

function generateCodeMarkup(id, x, y, rotation, p) {
    const color = p.color ?? '#e6edf3';
    const size = p.fontSize ?? 14;
    const family = p.fontFamily ?? 'lixCode';
    const content = String(p.content ?? '');
    const lines = content.split('\n');
    const width = Math.max(120, Math.ceil(Math.max(...lines.map(l => l.length)) * size * 0.62) + 20);
    const height = Math.ceil(lines.length * size * 1.2) + 20;
    const transform = `translate(${x}, ${y})${rotation ? ` rotate(${rotation}, 0, 0)` : ''}`;
    return `<g id="${escapeXml(id)}" data-type="code-group" data-x="${x}" data-y="${y}" transform="${transform}">`
        + `<rect class="code-background" x="-10" y="-10" width="${width}" height="${height}" fill="#161b22" stroke="#30363d" stroke-width="1" rx="6" ry="6"></rect>`
        + `<text id="${escapeXml(id)}-code" x="0" y="0" fill="${escapeXml(color)}" font-size="${size}" font-family="${escapeXml(family)}" text-anchor="start" white-space="pre" dominant-baseline="hanging" data-initial-size="${size}" data-initial-font="${escapeXml(family)}" data-initial-color="${escapeXml(color)}" data-initial-align="left" data-language="${escapeXml(p.language ?? 'plaintext')}" data-type="code">`
        + `${tspans(content)}</text></g>`;
}

function generateIconMarkup(id, x, y, size, rotation, p, vbw, vbh) {
    const color = p.color ?? '#ffffff';
    let inner = p.svg;
    if (!inner) {
        const letter = escapeXml(String(p.name || '?').charAt(0));
        inner = `<circle cx="12" cy="12" r="10" fill="none" stroke="${escapeXml(color)}" stroke-width="1.5"/><text x="12" y="16" text-anchor="middle" fill="${escapeXml(color)}" font-size="10" font-family="sans-serif">${letter}</text>`;
    } else {
        inner = String(inner).replace(/fill=(["'])(currentColor|#000|#000000|black)\1/g, `fill="${escapeXml(color)}"`)
            .replace(/stroke=(["'])(currentColor|#000|#000000|black)\1/g, `stroke="${escapeXml(color)}"`);
    }
    const scale = size / Math.max(vbw, vbh);
    const c = size / 2 / scale;
    return `<g id="${escapeXml(id)}" transform="translate(${x}, ${y}) scale(${scale}) rotate(${rotation || 0}, ${c}, ${c})" data-viewbox-width="${vbw}" data-viewbox-height="${vbh}" x="${x}" y="${y}" width="${size}" height="${size}" type="icon" data-shape-x="${x}" data-shape-y="${y}" data-shape-width="${size}" data-shape-height="${size}" data-shape-rotation="${rotation || 0}" style="cursor: pointer; pointer-events: all;">`
        + `<rect x="0" y="0" width="${vbw}" height="${vbh}" fill="transparent" stroke="none" style="pointer-events: all;"></rect>${inner}</g>`;
}

/** Apply edited structured props to existing text/code markup. */
function patchTextMarkup(markup, changes, kind) {
    let out = markup;
    const el = findElementTag(out, 'text');
    if (!el) return out;
    let tag = el.tag;
    if ('color' in changes) { tag = setAttr(tag, 'fill', changes.color); tag = setAttr(tag, 'data-initial-color', changes.color); }
    if ('fontSize' in changes) { tag = setAttr(tag, 'font-size', changes.fontSize); tag = setAttr(tag, 'data-initial-size', changes.fontSize); }
    if ('fontFamily' in changes) { tag = setAttr(tag, 'font-family', changes.fontFamily); tag = setAttr(tag, 'data-initial-font', changes.fontFamily); }
    if ('align' in changes && kind === 'text') {
        const anchor = ALIGN_TO_ANCHOR[changes.align] || 'start';
        tag = setAttr(tag, 'text-anchor', anchor);
        tag = setAttr(tag, 'data-initial-align', ANCHOR_TO_ALIGN[anchor]);
    }
    if ('language' in changes && kind === 'code') tag = setAttr(tag, 'data-language', changes.language);
    out = out.slice(0, el.index) + tag + out.slice(el.index + el.tag.length);
    if ('content' in changes) {
        const start = el.index + tag.length;
        const close = out.indexOf('</text>', start);
        if (close !== -1) out = out.slice(0, start) + tspans(changes.content) + out.slice(close);
    }
    return out;
}

function patchTranslate(markup, x, y) {
    const root = markup.match(/^\s*<g\b[^>]*>/);
    if (!root) return markup;
    let tag = root[0];
    const t = attrOf(tag, 'transform') || '';
    const next = /translate\(/.test(t)
        ? t.replace(/translate\([^)]*\)/, `translate(${x}, ${y})`)
        : `translate(${x}, ${y}) ${t}`.trim();
    tag = setAttr(tag, 'transform', next);
    if (attrOf(tag, 'data-x') !== undefined) tag = setAttr(tag, 'data-x', x);
    if (attrOf(tag, 'data-y') !== undefined) tag = setAttr(tag, 'data-y', y);
    return tag + markup.slice(root[0].length);
}

// ============================================================
// Compiler — AST → v1 scene JSON
// ============================================================

/**
 * Compile `.lixsketch` source (or a parsed AST) to a v1 scene object.
 * Returns { scene, errors, warnings }. `scene` is null when errors exist.
 */
export function compileLixSketch(source) {
    const { ast, errors } = typeof source === 'string' ? parseLixSketch(source) : { ast: source, errors: [] };
    const warnings = [];
    if (errors.length) return { scene: null, errors, warnings, ast };
    const err = (loc, message) => errors.push({ line: loc?.line || 1, col: loc?.col || 1, message, severity: 'error' });
    const warn = (loc, message) => warnings.push({ line: loc?.line || 1, col: loc?.col || 1, message, severity: 'warning' });
    const lixscriptMode = ast.version === null; // headerless LixScript document

    const scene = { format: 'lixsketch', version: 1 };
    compileDirectives(ast, scene, err, warn);

    // Assets
    const assets = new Map();
    for (const asset of ast.assets) {
        if (assets.has(asset.id)) err(asset.loc, `Duplicate asset '${asset.id}'`);
        assets.set(asset.id, asset.value);
    }

    // Ids
    const byId = new Map();
    for (const def of ast.shapes) {
        if (byId.has(def.id)) {
            const first = byId.get(def.id).loc;
            err(def.idLoc, `Duplicate shape id '${def.id}' (first declared at ${first.line}:${first.col})`);
        } else {
            byId.set(def.id, def);
        }
    }

    const ctx = { byId, boxes: new Map(), err, warn };
    resolveGeometry(ast.shapes, ctx);

    const records = [];
    for (const def of ast.shapes) {
        try {
            records.push(buildRecord(def, ctx, lixscriptMode));
        } catch (e) {
            if (!(e instanceof ParseFailure)) throw e;
            err(e.loc, e.message);
        }
    }
    if (errors.length) return { scene: null, errors, warnings, ast };

    // Frame containment → parentFrame (explicit `parent:` wins).
    const recById = new Map(records.map(r => [r.shapeID, r]));
    if (lixscriptMode) {
        for (const rec of records) {
            if (rec.type === 'frame' && rec.__containsImplicit) {
                rec.containedShapeIDs = records.filter(r => r.type !== 'frame').map(r => r.shapeID);
            }
        }
    }
    const derived = deriveParents(records);
    for (const rec of records) {
        if (rec.type === 'frame') {
            for (const childId of rec.containedShapeIDs) {
                if (!recById.has(childId)) warn(rec.__loc, `Frame '${rec.shapeID}' contains unknown shape '${childId}'`);
            }
        }
        if (!('parentFrame' in rec)) rec.parentFrame = derived.get(rec.shapeID) ?? null;
        else if (rec.parentFrame !== null && !recById.has(rec.parentFrame)) warn(rec.__loc, `Parent frame '${rec.parentFrame}' does not exist`);
        if (rec.type === 'arrow') {
            for (const key of ['startAttachmentID', 'endAttachmentID']) {
                if (rec[key] && !recById.has(rec[key])) warn(rec.__loc, `Arrow '${rec.shapeID}' is bound to unknown shape '${rec[key]}'`);
            }
        }
        delete rec.__loc;
        delete rec.__containsImplicit;
    }

    scene.shapes = records;
    // Inline asset refs.
    const { missing } = inlineAssets(scene, id => assets.get(id));
    for (const id of missing) err(ast.shapes.find(s => s.props.some(p => p.value === ASSET_REF_PREFIX + id))?.loc, `Unknown asset '${id}'`);
    if (errors.length) return { scene: null, errors, warnings, ast };
    return { scene, errors, warnings, ast };
}

function deriveParents(records) {
    const parents = new Map();
    for (const rec of records) {
        if (rec.type !== 'frame') continue;
        for (const childId of rec.containedShapeIDs || []) {
            if (!parents.has(childId) && childId !== rec.shapeID) parents.set(childId, rec.shapeID);
        }
    }
    return parents;
}

const DIRECTIVES = ['name', 'session', 'created', 'viewport', 'zoom', 'background', 'theme', 'grid'];

function compileDirectives(ast, scene, err) {
    const settings = {};
    const seen = new Set();
    for (const d of ast.directives) {
        if (seen.has(d.name)) err(d.loc, `Duplicate directive '@${d.name}'`);
        seen.add(d.name);
        const v = d.value;
        switch (d.name) {
            case 'name': scene.name = String(v); break;
            case 'session': scene.sessionID = String(v); break;
            case 'created': scene.createdAt = String(v); break;
            case 'zoom':
                if (typeof v !== 'number' || !(v > 0)) err(d.valueLoc, '@zoom must be a positive number');
                else scene.zoom = v;
                break;
            case 'viewport': {
                if (v === null) { scene.viewport = null; break; }
                const parts = String(v).trim().split(/[\s,]+/).map(Number);
                if (parts.length !== 4 || parts.some(n => !Number.isFinite(n))) err(d.valueLoc, '@viewport expects 4 numbers: x y width height');
                else scene.viewport = { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
                break;
            }
            case 'background': settings.background = v; break;
            case 'theme':
                if (!['dark', 'light', 'system'].includes(v)) err(d.valueLoc, '@theme must be dark, light or system');
                else settings.theme = v;
                break;
            case 'grid': settings.grid = v; break;
            default:
                if (d.name.startsWith('meta.') && d.name.length > 5) scene[d.name.slice(5)] = v;
                else {
                    const s = closest(d.name, DIRECTIVES);
                    err(d.loc, `Unknown directive '@${d.name}'${s ? ` (did you mean '@${s}'?)` : ''}`);
                }
        }
    }
    if (!('name' in scene)) scene.name = 'Untitled';
    if (!('viewport' in scene)) scene.viewport = null;
    if (!('zoom' in scene)) scene.zoom = 1;
    if (Object.keys(settings).length) scene.settings = settings;
}

// ── Geometry resolution (supports forward references) ──

function boxOf(type, g) {
    switch (type) {
        case 'circle': return { x: g.cx - g.rx, y: g.cy - g.ry, width: g.rx * 2, height: g.ry * 2, cx: g.cx, cy: g.cy, rx: g.rx, ry: g.ry, circle: true };
        case 'line':
        case 'arrow': {
            const x = Math.min(g.start.x, g.end.x);
            const y = Math.min(g.start.y, g.end.y);
            return { x, y, width: Math.abs(g.end.x - g.start.x), height: Math.abs(g.end.y - g.start.y) };
        }
        default: return { x: g.x, y: g.y, width: g.width || 0, height: g.height || 0 };
    }
}

class Unresolved extends Error {}

function evalExpr(node, ctx) {
    switch (node.kind) {
        case 'num': return node.value;
        case 'neg': return -evalExpr(node.e, ctx);
        case 'bin': {
            const a = evalExpr(node.l, ctx);
            const b = evalExpr(node.r, ctx);
            switch (node.op) {
                case '+': return a + b;
                case '-': return a - b;
                case '*': return a * b;
                default: return a / b;
            }
        }
        case 'ref': {
            if (!node.prop) throw new ParseFailure(`'${node.id}' needs a property here, e.g. '${node.id}.x'`, node.loc);
            if (!REF_PROPS.includes(node.prop)) {
                throw new ParseFailure(`Unknown reference property '${node.prop}' (use ${REF_PROPS.join(', ')})`, node.propLoc || node.loc);
            }
            if (!ctx.byId.has(node.id)) throw new ParseFailure(`Unknown shape '${node.id}'`, node.loc);
            const box = ctx.boxes.get(node.id);
            if (!box) throw new Unresolved(node.id);
            switch (node.prop) {
                case 'x': case 'left': return box.x;
                case 'y': case 'top': return box.y;
                case 'right': return box.x + box.width;
                case 'bottom': return box.y + box.height;
                case 'centerX': return box.x + box.width / 2;
                case 'centerY': return box.y + box.height / 2;
                case 'width': return box.width;
                default: return box.height;
            }
        }
        default: return NaN;
    }
}

function endpointPoint(ep, ctx) {
    if (ep.kind === 'point') return { x: evalExpr(ep.x, ctx), y: evalExpr(ep.y, ctx) };
    if (!ctx.byId.has(ep.id)) throw new ParseFailure(`Unknown shape '${ep.id}'`, ep.loc);
    const b = ctx.boxes.get(ep.id);
    if (!b) throw new Unresolved(ep.id);
    const o = ep.offset || 0;
    if (b.circle) {
        switch (ep.side) {
            case 'top': return { x: b.cx + o, y: b.cy - b.ry };
            case 'bottom': return { x: b.cx + o, y: b.cy + b.ry };
            case 'left': return { x: b.cx - b.rx, y: b.cy + o };
            case 'right': return { x: b.cx + b.rx, y: b.cy + o };
            default: return { x: b.cx + o, y: b.cy };
        }
    }
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    switch (ep.side) {
        case 'top': return { x: cx + o, y: b.y };
        case 'bottom': return { x: cx + o, y: b.y + b.height };
        case 'left': return { x: b.x, y: cy + o };
        case 'right': return { x: b.x + b.width, y: cy + o };
        default: return { x: cx + o, y: cy };
    }
}

const DEFAULT_SIZES = { rectangle: [160, 60], circle: [80, 80], frame: [600, 400], image: [200, 200], icon: [48, 48] };

function computeGeometry(def, ctx) {
    const g = def.geometry;
    const type = def.type;
    if (type === 'line' || type === 'arrow') {
        if (!g.from || !g.to) throw new ParseFailure(`${def.keyword} requires 'from … to …'`, def.loc);
        return { start: endpointPoint(g.from, ctx), end: endpointPoint(g.to, ctx) };
    }
    if (type === 'circle') {
        if (g.center) {
            if (g.at || g.size) throw new ParseFailure("Use either 'center … radius …' or 'at … size …', not both", def.loc);
            const rx = g.radius ? evalExpr(g.radius.rx, ctx) : 40;
            const ry = g.radius ? evalExpr(g.radius.ry, ctx) : rx;
            return { cx: evalExpr(g.center.x, ctx), cy: evalExpr(g.center.y, ctx), rx, ry };
        }
        if (!g.at) throw new ParseFailure(`${def.keyword} requires 'at X, Y' or 'center X, Y'`, def.loc);
        let w = DEFAULT_SIZES.circle[0];
        let h = DEFAULT_SIZES.circle[1];
        if (g.size) { w = evalExpr(g.size.w, ctx); h = evalExpr(g.size.h, ctx); }
        else if (g.radius) { w = evalExpr(g.radius.rx, ctx) * 2; h = evalExpr(g.radius.ry, ctx) * 2; }
        const x = evalExpr(g.at.x, ctx);
        const y = evalExpr(g.at.y, ctx);
        return { cx: x + w / 2, cy: y + h / 2, rx: w / 2, ry: h / 2 };
    }
    if (g.center || g.radius) throw new ParseFailure(`'center'/'radius' only apply to circle/ellipse`, (g.center || g.radius).loc);
    if (type === 'freehandStroke') {
        return { x: g.at ? evalExpr(g.at.x, ctx) : 0, y: g.at ? evalExpr(g.at.y, ctx) : 0 };
    }
    if (!g.at && type !== 'frame') throw new ParseFailure(`${def.keyword} requires 'at X, Y'`, def.loc);
    const x = g.at ? evalExpr(g.at.x, ctx) : 0;
    const y = g.at ? evalExpr(g.at.y, ctx) : 0;
    if (type === 'text' || type === 'code') {
        if (g.size) throw new ParseFailure(`${def.keyword} does not take 'size'`, g.size.loc);
        const wProp = def.props.find(p => p.key === 'width');
        const hProp = def.props.find(p => p.key === 'height');
        return { x, y, width: typeof wProp?.value === 'number' ? wProp.value : 0, height: typeof hProp?.value === 'number' ? hProp.value : 0 };
    }
    const [dw, dh] = DEFAULT_SIZES[type];
    const width = g.size ? evalExpr(g.size.w, ctx) : dw;
    const height = g.size ? evalExpr(g.size.h, ctx) : dh;
    return { x, y, width, height };
}

function resolveGeometry(defs, ctx) {
    const pending = new Set(defs);
    for (let pass = 0; pass <= defs.length && pending.size; pass += 1) {
        let progress = false;
        for (const def of [...pending]) {
            try {
                const geo = computeGeometry(def, ctx);
                def.resolved = geo;
                if (!ctx.boxes.has(def.id)) ctx.boxes.set(def.id, boxOf(def.type, geo));
                pending.delete(def);
                progress = true;
            } catch (e) {
                if (e instanceof Unresolved) continue;
                if (e instanceof ParseFailure) { ctx.err(e.loc, e.message); pending.delete(def); def.failed = true; continue; }
                throw e;
            }
        }
        if (!progress) break;
    }
    for (const def of pending) {
        def.failed = true;
        ctx.err(def.loc, `Cannot resolve the position of '${def.id}' (circular reference)`);
    }
}

// ── Record building ──

function checkKind(prop, kind, type) {
    const v = prop.value;
    const fail = (what) => { throw new ParseFailure(`Property '${prop.key}' on ${TYPE_KEYWORD[type]} expects ${what}`, prop.valueLoc || prop.loc); };
    switch (kind) {
        case 'number': if (typeof v !== 'number') fail('a number'); return v;
        case 'boolean': if (typeof v !== 'boolean') fail('true or false'); return v;
        case 'point': {
            if (v === null) return null;
            if (v && typeof v === 'object' && !Array.isArray(v)) return v;
            const m = typeof v === 'string' && v.match(/^\s*(-?[\d.e+-]+)\s*,\s*(-?[\d.e+-]+)\s*$/);
            if (m) return { x: Number(m[1]), y: Number(m[2]) };
            fail('{ x: …, y: … } or "X, Y"');
            return null;
        }
        case 'idList': {
            if (Array.isArray(v)) return v.map(String);
            if (typeof v === 'string') return v.split(',').map(s => s.trim()).filter(Boolean);
            if (v === null) return [];
            fail('a list of ids');
            return [];
        }
        case 'id': if (typeof v !== 'string') fail('a shape id'); return v;
        case 'opacity': {
            const n = typeof v === 'string' && v.trim().endsWith('%') ? parseFloat(v) / 100 : v;
            if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 100) fail('a number from 0 to 1 (or a percentage)');
            // Values above 1 are percentages (opacity: 50 → 0.5).
            const value = n > 1 ? n / 100 : n;
            // Fully opaque is the default and is not stored.
            return value === 1 ? undefined : Math.round(value * 100) / 100;
        }
        case 'lineArrowhead':
        case 'arrowhead': {
            const type = typeof v === 'string' ? normalizeArrowhead(v, null) : (v === null ? 'none' : null);
            if (!type) fail(`one of ${ARROWHEAD_TYPES.join(', ')}`);
            return type;
        }
        case 'edges': {
            if (v !== 'sharp' && v !== 'round') fail("'sharp' or 'round'");
            return v === 'round' ? 'round' : undefined;
        }
        default: return v;
    }
}

function buildRecord(def, ctx, lixscriptMode) {
    if (def.failed) throw new ParseFailure(`Shape '${def.id}' could not be positioned`, def.loc);
    const type = def.type;
    const fields = fieldsFor(type);
    const geo = def.resolved;
    const rec = { shapeID: def.id };
    Object.defineProperty(rec, '__loc', { value: def.loc, enumerable: false, configurable: true, writable: true });
    rec.type = type;
    const options = {};
    const derived = {};
    const data = {};
    const seen = new Map();

    for (const prop of def.props) {
        if (seen.has(prop.key)) {
            const first = seen.get(prop.key);
            throw new ParseFailure(`Duplicate property '${prop.key}' (first set at ${first.line}:${first.col})`, prop.loc);
        }
        seen.set(prop.key, prop.loc);
        const key = prop.key;
        if (key.startsWith('data.')) { data[key.slice(5)] = prop.value; continue; }
        if (key.startsWith('options.')) {
            if (!HAS_OPTIONS.has(type)) throw new ParseFailure(`${TYPE_KEYWORD[type]} has no options`, prop.loc);
            options[key.slice(8)] = prop.value;
            continue;
        }
        if (key === 'parent') {
            if (prop.value !== null && typeof prop.value !== 'string') throw new ParseFailure("'parent' expects a frame id or null", prop.valueLoc);
            rec.parentFrame = prop.value;
            continue;
        }
        if (key === 'head' && type === 'arrow') {
            // Legacy single head (default/outline/solid/square or a new type).
            if (!('endArrowhead' in rec)) rec.endArrowhead = checkKind({ ...prop, key: 'endHead' }, 'arrowhead', type);
            continue;
        }
        if (key === 'roundness' && fields.edges) {
            const value = checkKind({ ...prop, key: 'edges' }, 'edges', type);
            if (value !== undefined) rec.edges = value;
            continue;
        }
        if (fields[key]) {
            const value = checkKind(prop, fields[key].kind, type);
            // Appearance defaults (opacity 1, sharp edges) are never stored.
            if (value === undefined && (fields[key].kind === 'opacity' || fields[key].kind === 'edges')) continue;
            if (fields[key].kind === 'lineArrowhead' && value === 'none') continue;
            rec[fields[key].key] = value;
            continue;
        }
        if ((DERIVED_PROPS[type] || []).includes(key)) { derived[key] = prop.value; continue; }
        if ((key === 'width' || key === 'height') && (type === 'text' || type === 'code')) continue;
        // Authoring aliases.
        if (key === 'style' && (type === 'rectangle' || type === 'circle' || type === 'line')) {
            if (!(prop.value in LINE_STYLES)) throw new ParseFailure(`'style' must be one of ${Object.keys(LINE_STYLES).join(', ')}`, prop.valueLoc);
            if (!('strokeDasharray' in options)) options.strokeDasharray = LINE_STYLES[prop.value];
            continue;
        }
        if (key === 'style' && type === 'freehandStroke') { options.strokeStyle = prop.value; continue; }
        if (key === 'curve' && type === 'line') { rec.isCurved = prop.value === true || prop.value === 'true' || prop.value === 'curved'; continue; }
        if (HAS_OPTIONS.has(type)) { options[key] = prop.value; continue; }
        const allowed = [...Object.keys(fields), ...(DERIVED_PROPS[type] || [])];
        const s = closest(key, allowed);
        throw new ParseFailure(`Unknown property '${key}' for ${TYPE_KEYWORD[type]}${s ? ` (did you mean '${s}'?)` : ''}`, prop.loc);
    }

    // Common defaults
    if (!('docBlockIds' in rec)) rec.docBlockIds = [];
    if (!('groupId' in rec)) rec.groupId = null;

    switch (type) {
        case 'rectangle':
            Object.assign(rec, { x: geo.x, y: geo.y, width: geo.width, height: geo.height });
            break;
        case 'circle':
            Object.assign(rec, { x: geo.cx, y: geo.cy, rx: geo.rx, ry: geo.ry });
            break;
        case 'line':
            rec.startPoint = geo.start; rec.endPoint = geo.end;
            break;
        case 'arrow':
            rec.startPoint = geo.start; rec.endPoint = geo.end;
            if (derived.headLength !== undefined && !('arrowHeadLength' in options)) options.arrowHeadLength = derived.headLength;
            compileBindings(def, rec, derived, ctx);
            break;
        case 'freehandStroke':
            rec.points = compilePoints(def, derived, geo);
            break;
        case 'frame':
            Object.assign(rec, { x: geo.x, y: geo.y, width: geo.width, height: geo.height });
            if (!('frameName' in rec)) rec.frameName = def.id;
            if (def.keyword === 'embed') {
                rec.frameType = 'web-embed';
                if (!rec.webEmbedURL) throw new ParseFailure(`embed '${def.id}' requires a 'url' property`, def.loc);
            }
            if (!('containedShapeIDs' in rec)) {
                if (lixscriptMode) Object.defineProperty(rec, '__containsImplicit', { value: true, enumerable: false, configurable: true });
            }
            break;
        case 'text':
        case 'code':
            Object.assign(rec, { x: geo.x, y: geo.y });
            rec.groupHTML = compileTextMarkup(def, rec, derived, type);
            break;
        case 'image':
            Object.assign(rec, { x: geo.x, y: geo.y, width: geo.width, height: geo.height });
            if (!('href' in rec)) rec.href = derived.href ?? derived.url ?? '';
            if (!rec.href) throw new ParseFailure(`image '${def.id}' requires a 'src' property`, def.loc);
            break;
        case 'icon':
            Object.assign(rec, { x: geo.x, y: geo.y, width: geo.width, height: geo.height });
            if (!('viewboxWidth' in rec)) rec.viewboxWidth = 24;
            if (!('viewboxHeight' in rec)) rec.viewboxHeight = 24;
            if (!('elementHTML' in rec)) {
                if (!derived.svg && !derived.name) throw new ParseFailure(`icon '${def.id}' requires 'svg', 'name' or 'markup'`, def.loc);
                rec.elementHTML = generateIconMarkup(def.id, geo.x, geo.y, geo.width, rec.rotation || 0, derived, rec.viewboxWidth, rec.viewboxHeight);
            }
            break;
        default:
            break;
    }

    // Field defaults (present in every saveScene() record of this type).
    for (const f of Object.values(TYPE_FIELDS[type])) {
        if (f.default !== undefined && !(f.key in rec)) rec[f.key] = Array.isArray(f.default) ? [] : f.default;
    }
    if (HAS_OPTIONS.has(type)) rec.options = options;
    // `data.*` escape hatch: raw record fields, applied last.
    for (const [k, v] of Object.entries(data)) rec[k] = v;
    return rec;
}

function compileBindings(def, rec, derived, ctx) {
    for (const [end, epKey, idKey, bindingKey] of [['Start', 'from', 'startAttachmentID', 'startBinding'], ['End', 'to', 'endAttachmentID', 'endBinding']]) {
        const side = derived[`bind${end}Side`];
        const offset = derived[`bind${end}Offset`];
        const ep = def.geometry[epKey];
        if (!(idKey in rec) && ep.kind === 'ref') {
            // Authoring: `from box.right` binds the arrow to `box`, choosing
            // the side the endpoint sits on (same rule as the editor).
            rec[idKey] = ep.id;
            const box = ctx.boxes.get(ep.id);
            const point = end === 'Start' ? rec.startPoint : rec.endPoint;
            rec[bindingKey] = { shapeID: ep.id, side: inferSide(box, point), offset: { x: 0, y: 0 } };
        }
        if (side !== undefined || offset !== undefined) {
            if (!rec[idKey]) throw new ParseFailure(`'bind${end}Side'/'bind${end}Offset' need 'bind${end}'`, def.loc);
            rec[bindingKey] = { shapeID: rec[idKey], side: side ?? null, offset: offset ?? null };
        }
    }
}

function inferSide(box, point) {
    if (!box || !point) return 'bottom';
    const cx = box.circle ? box.cx : box.x + box.width / 2;
    const cy = box.circle ? box.cy : box.y + box.height / 2;
    const dx = point.x - cx;
    const dy = point.y - cy;
    if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
    return dy > 0 ? 'bottom' : 'top';
}

function compilePoints(def, derived, geo) {
    const v = derived.points;
    if (v === undefined) throw new ParseFailure(`freehand '${def.id}' requires a 'points' property`, def.loc);
    let points;
    if (Array.isArray(v)) {
        points = v;
    } else if (typeof v === 'string') {
        // LixScript form: "x1,y1;x2,y2,pressure;…"
        points = v.split(';').map(s => s.trim()).filter(Boolean).map((p) => {
            const [x, y, pressure] = p.split(',').map(Number);
            return [x || 0, y || 0, Number.isFinite(pressure) ? pressure : 0.5];
        });
    } else {
        throw new ParseFailure("'points' expects a list like [[x, y, pressure], …] or \"x,y;x,y\"", def.loc);
    }
    if (points.length < 2) throw new ParseFailure('freehand requires at least 2 points', def.loc);
    if (geo.x || geo.y) points = points.map(p => (Array.isArray(p) ? [p[0] + geo.x, p[1] + geo.y, ...p.slice(2)] : p));
    return points;
}

function compileTextMarkup(def, rec, derived, type) {
    const props = { ...derived };
    if (props.anchor !== undefined && props.align === undefined) props.align = props.anchor;
    delete props.anchor;
    if (props.text !== undefined && props.content === undefined) props.content = props.text;
    delete props.text;
    const rotation = rec.rotation || 0;
    if (rec.groupHTML === undefined) {
        return type === 'text'
            ? generateTextMarkup(def.id, rec.x, rec.y, rotation, props)
            : generateCodeMarkup(def.id, rec.x, rec.y, rotation, props);
    }
    // Markup present: keep it verbatim unless structured props were edited.
    let markup = rec.groupHTML;
    const current = extractTextProps(markup, type) || {};
    const changes = {};
    for (const [k, v] of Object.entries(props)) {
        if (String(current[k]) !== String(v)) changes[k] = v;
    }
    if (Object.keys(changes).length) markup = patchTextMarkup(markup, changes, type);
    // `at` mirrors the markup's translate(); a difference means it was edited.
    const t = readTranslate(markup);
    if (t && (t.x !== rec.x || t.y !== rec.y)) markup = patchTranslate(markup, rec.x, rec.y);
    return markup;
}

// ============================================================
// Serializer — scene JSON → `.lixsketch` text
// ============================================================

const SAFE_BARE = /^[A-Za-z_][A-Za-z0-9_.-]*$/;
const SAFE_COLOR = /^#[0-9a-fA-F]{3,8}$/;
const SAFE_ID = /^[A-Za-z_][A-Za-z0-9_]*(?:-[A-Za-z0-9_]+)*$/;

function isSafeBare(s) {
    if (SAFE_COLOR.test(s)) return true;
    return SAFE_BARE.test(s) && s !== 'true' && s !== 'false' && s !== 'null' && !NUMBER_RE.test(s) && !s.includes('..') && !s.endsWith('.');
}

function fmtNumber(n) {
    if (Object.is(n, -0)) return '0';
    return String(n);
}

function fmtScalar(v) {
    if (v === null) return 'null';
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (typeof v === 'number') return Number.isFinite(v) ? fmtNumber(v) : 'null';
    if (typeof v === 'string') return isSafeBare(v) ? v : JSON.stringify(v);
    return JSON.stringify(v);
}

function fmtComposite(v) {
    if (Array.isArray(v)) return `[${v.map(fmtComposite).join(', ')}]`;
    if (v && typeof v === 'object') {
        const entries = Object.entries(v).filter(([, x]) => x !== undefined);
        if (!entries.length) return '{}';
        return `{ ${entries.map(([k, x]) => `${SAFE_BARE.test(k) && !k.includes('.') ? k : JSON.stringify(k)}: ${fmtComposite(x)}`).join(', ')} }`;
    }
    return fmtScalar(v);
}

function chooseHeredocTag(s, preferred) {
    const lines = new Set(s.split('\n').map(l => l.trim()));
    for (const base of [preferred, 'END', 'EOF']) {
        if (!lines.has(base)) return base;
        for (let i = 1; i < 100; i += 1) if (!lines.has(`${base}${i}`)) return `${base}${i}`;
    }
    return null;
}

function fmtValue(v, indent, { heredoc = false } = {}) {
    if (typeof v === 'string' && (heredoc || v.includes('\n')) && v.length > 0 && !v.includes('\r') && !v.endsWith('\n')) {
        const tag = chooseHeredocTag(v, heredoc ? 'SVG' : 'TEXT');
        if (tag) {
            const body = v.split('\n').map(l => (l === '' ? '' : indent + l)).join('\n');
            return `<<<${tag}\n${body}\n${indent}${tag}`;
        }
    }
    if (Array.isArray(v) || (v && typeof v === 'object')) return fmtComposite(v);
    return fmtScalar(v);
}

function fmtId(id) {
    return SAFE_ID.test(id) && !SHAPE_KEYWORDS.includes(id) ? id : JSON.stringify(String(id));
}

function fmtKey(key) {
    return SAFE_BARE.test(key) && !key.includes('.') ? key : JSON.stringify(key);
}

function valuesEqual(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
}

function finite(n) { return typeof n === 'number' && Number.isFinite(n); }
function isPoint(p) { return p && finite(p.x) && finite(p.y); }

/**
 * Serialize a v1 scene to `.lixsketch` text.
 *  assets: 'embed' (default) moves inline data: images into `asset`
 *          statements at the end of the file; 'inline' keeps them in place.
 */
export function sceneToLixSketch(scene, { assets: assetMode = 'embed', assetMinLength = 1024 } = {}) {
    if (!scene || scene.format !== 'lixsketch' || !Array.isArray(scene.shapes)) {
        throw new Error('sceneToLixSketch expects a v1 LixSketch scene');
    }
    const out = [`lixsketch ${LIXSKETCH_FORMAT_VERSION}`];
    if (scene.name !== undefined && scene.name !== 'Untitled') out.push(`@name ${JSON.stringify(String(scene.name))}`);
    if (scene.sessionID !== undefined) out.push(`@session ${JSON.stringify(String(scene.sessionID))}`);
    if (scene.createdAt !== undefined) out.push(`@created ${JSON.stringify(String(scene.createdAt))}`);
    if (scene.viewport) {
        const v = scene.viewport;
        out.push(`@viewport ${[v.x, v.y, v.width, v.height].map(fmtNumber).join(' ')}`);
    }
    if (scene.zoom !== undefined && scene.zoom !== 1) out.push(`@zoom ${fmtScalar(scene.zoom)}`);
    const settings = scene.settings || {};
    for (const key of ['background', 'theme', 'grid']) {
        if (settings[key] !== undefined) out.push(`@${key} ${fmtValue(settings[key], '')}`);
    }
    const knownTop = new Set(['format', 'version', 'name', 'sessionID', 'createdAt', 'viewport', 'zoom', 'shapes', 'settings']);
    for (const [k, v] of Object.entries(scene)) {
        if (!knownTop.has(k) && v !== undefined && SAFE_BARE.test(k)) out.push(`@meta.${k} ${fmtValue(v, '')}`);
    }

    const assets = new Map();
    const derivedParents = deriveParents(scene.shapes.filter(Boolean));
    for (const shape of scene.shapes) {
        if (!shape) continue;
        out.push('');
        out.push(...emitShape(shape, derivedParents, assetMode === 'embed' ? { assets, assetMinLength } : null));
    }
    if (assets.size) {
        out.push('');
        out.push('// Embedded assets (inline images), referenced as lixasset:<id>');
        for (const [id, value] of assets) out.push(`asset ${fmtId(id)} = ${JSON.stringify(value)}`);
    }
    return `${out.join('\n')}\n`;
}

function emitShape(shape, derivedParents, assetCtx) {
    // Scenes saved before start/end heads carry `arrowHeadStyle`.
    if (shape.type === 'arrow' && 'arrowHeadStyle' in shape && !('endArrowhead' in shape)) {
        const { arrowHeadStyle, ...rest } = shape;
        shape = { ...rest, ...readArrowheads({ arrowHeadStyle, startArrowhead: shape.startArrowhead }) };
    }
    const type = shape.type;
    const keyword = type === 'frame' && shape.frameType === 'web-embed' ? 'embed' : TYPE_KEYWORD[type];
    const fields = fieldsFor(type);
    const props = [];
    const used = new Set(['shapeID', 'type', 'options', 'parentFrame']);
    const geomKeys = GEOMETRY_KEYS[type] || [];
    let geometry = '';
    const dataOverrides = [];

    const geoOk = (keys) => keys.every(k => finite(shape[k]));
    switch (type) {
        case 'rectangle': case 'frame': case 'image': case 'icon':
            if (geoOk(['x', 'y', 'width', 'height'])) {
                geometry = ` at ${fmtNumber(shape.x)}, ${fmtNumber(shape.y)} size ${fmtNumber(shape.width)}x${fmtNumber(shape.height)}`;
            } else {
                geometry = ' at 0, 0';
                for (const k of ['x', 'y', 'width', 'height']) dataOverrides.push([k, shape[k]]);
            }
            break;
        case 'circle':
            if (geoOk(['x', 'y', 'rx', 'ry'])) {
                geometry = ` center ${fmtNumber(shape.x)}, ${fmtNumber(shape.y)} radius ${fmtNumber(shape.rx)}, ${fmtNumber(shape.ry)}`;
            } else {
                geometry = ' center 0, 0';
                for (const k of ['x', 'y', 'rx', 'ry']) dataOverrides.push([k, shape[k]]);
            }
            break;
        case 'line': case 'arrow':
            if (isPoint(shape.startPoint) && isPoint(shape.endPoint)) {
                geometry = ` from ${fmtNumber(shape.startPoint.x)}, ${fmtNumber(shape.startPoint.y)} to ${fmtNumber(shape.endPoint.x)}, ${fmtNumber(shape.endPoint.y)}`;
            } else {
                geometry = ' from 0, 0 to 0, 0';
                dataOverrides.push(['startPoint', shape.startPoint], ['endPoint', shape.endPoint]);
            }
            break;
        case 'text': case 'code': {
            // `at` is the markup's translate() — the position the editor
            // renders. A differing saved x/y (e.g. rotated groups) is kept
            // through data.x / data.y so the record round-trips exactly.
            const t = typeof shape.groupHTML === 'string' ? readTranslate(shape.groupHTML) : null;
            const at = t || (geoOk(['x', 'y']) ? { x: shape.x, y: shape.y } : { x: 0, y: 0 });
            geometry = ` at ${fmtNumber(at.x)}, ${fmtNumber(at.y)}`;
            if (shape.x !== at.x) dataOverrides.push(['x', shape.x]);
            if (shape.y !== at.y) dataOverrides.push(['y', shape.y]);
            break;
        }
        default:
            break;
    }
    geomKeys.forEach(k => used.add(k));

    if (type === 'freehandStroke' && 'points' in shape) props.push(['points', shape.points]);

    // Structured text/code props (readable view of the markup).
    if ((type === 'text' || type === 'code') && typeof shape.groupHTML === 'string') {
        const view = extractTextProps(shape.groupHTML, type);
        if (view) for (const [k, v] of Object.entries(view)) props.push([k, v]);
    }

    for (const [name, f] of Object.entries(fields)) {
        if (!(f.key in shape)) continue;
        used.add(f.key);
        let value = shape[f.key];
        if (value === undefined) continue;
        if (f.default !== undefined && valuesEqual(value, f.default)) continue;
        if (type === 'frame' && name === 'name' && value === shape.shapeID) continue;
        if (type === 'frame' && name === 'frameType' && value === 'web-embed' && keyword === 'embed') continue;
        if (name === 'src' && assetCtx && typeof value === 'string' && value.startsWith('data:') && value.length >= assetCtx.assetMinLength) {
            const id = `img-${assetIdFor(value)}`;
            assetCtx.assets.set(id, value);
            value = ASSET_REF_PREFIX + id;
        }
        if (f.kind === 'idList' && Array.isArray(value) && value.every(id => typeof id === 'string' && SAFE_ID.test(id) && isSafeBare(id))) {
            props.push([name, { raw: value.join(', ') }]);
            continue;
        }
        props.push([name, value, name === 'markup']);
    }
    if (type === 'arrow') {
        for (const [end, key] of [['Start', 'startBinding'], ['End', 'endBinding']]) {
            if (!(key in shape)) continue;
            used.add(key);
            const b = shape[key];
            const idKey = end === 'Start' ? 'startAttachmentID' : 'endAttachmentID';
            if (b && typeof b === 'object' && b.shapeID === shape[idKey]) {
                props.push([`bind${end}Side`, b.side ?? null]);
                props.push([`bind${end}Offset`, b.offset ?? null]);
            } else {
                props.push([`data.${key}`, b]);
            }
        }
    }
    const expectedParent = derivedParents.get(shape.shapeID) ?? null;
    if ('parentFrame' in shape && (shape.parentFrame ?? null) !== expectedParent) props.push(['parent', shape.parentFrame ?? null]);

    // Record fields this schema does not know: `data.<key>`.
    for (const [k, v] of Object.entries(shape)) {
        if (used.has(k) || v === undefined) continue;
        if (Object.values(fields).some(f => f.key === k)) continue;
        props.push([`data.${k}`, v]);
    }
    for (const [k, v] of dataOverrides) if (v !== undefined) props.push([`data.${k}`, v]);

    // Options: plain keys unless they collide with a record field / alias.
    if (HAS_OPTIONS.has(type) && shape.options && typeof shape.options === 'object') {
        const taken = new Set([...Object.keys(fields), ...(DERIVED_PROPS[type] || []), ...RESERVED_COMMON, 'style', 'curve', 'width', 'height']);
        const opts = { ...shape.options };
        if ((type === 'rectangle' || type === 'circle' || type === 'line') && typeof opts.strokeDasharray === 'string' && !('style' in opts)) {
            const style = Object.keys(LINE_STYLES).find(s => LINE_STYLES[s] === opts.strokeDasharray);
            if (style) { props.push(['style', style]); delete opts.strokeDasharray; }
        }
        for (const [k, v] of Object.entries(opts)) {
            if (v === undefined) continue;
            const plain = SAFE_BARE.test(k) && !k.includes('.') && !taken.has(k) && !k.startsWith('data');
            props.push([plain ? k : `options.${fmtKey(k)}`, v]);
        }
    } else if (!HAS_OPTIONS.has(type) && shape.options !== undefined) {
        props.push(['data.options', shape.options]);
    }

    const head = `${keyword} ${fmtId(shape.shapeID)}${geometry}`;
    if (!props.length) return [head];
    const lines = [`${head} {`];
    for (const [k, v, heredoc] of props) {
        const key = k.startsWith('data.') || k.startsWith('options.') ? k : fmtKey(k);
        const value = v && typeof v === 'object' && 'raw' in v && Object.keys(v).length === 1 ? v.raw : fmtValue(v, '  ', { heredoc });
        lines.push(`  ${key}: ${value}`);
    }
    lines.push('}');
    return lines;
}

// ============================================================
// Convenience
// ============================================================

/** Parse + compile; throws LixSketchError (with .errors) on failure. */
export function lixSketchToScene(source) {
    const { scene, errors, warnings } = compileLixSketch(source);
    if (errors.length) throw new LixSketchError(errors);
    return { scene, warnings };
}

/**
 * Detect what an opened file contains: 'lixsketch' (DSL text), 'json'
 * (v1 scene JSON / legacy .lixjson) or 'unknown'.
 */
export function detectSceneText(text) {
    const head = String(text || '').replace(/^﻿/, '').trimStart();
    if (head.startsWith('{')) return 'json';
    if (/^lixsketch\s+\d+/.test(head)) return 'lixsketch';
    const firstStatement = head.split('\n').map(l => l.trim()).find(l => l && !l.startsWith('//'));
    if (firstStatement && (/^[@$]/.test(firstStatement) || SHAPE_KEYWORDS.includes(firstStatement.split(/\s+/)[0]))) return 'lixsketch';
    return 'unknown';
}

/**
 * Turn the text of an opened `.lixsketch`, `.lixjson` or `.json` file into
 * a v1 scene. Throws LixSketchError / Error with a readable message.
 */
export function sceneFromFileText(text) {
    const kind = detectSceneText(text);
    if (kind === 'json') {
        const data = JSON.parse(text);
        return { scene: data, warnings: [], kind };
    }
    if (kind === 'lixsketch') return { ...lixSketchToScene(text), kind };
    throw new Error('Not a LixSketch file (expected a "lixsketch 1" header or scene JSON)');
}
