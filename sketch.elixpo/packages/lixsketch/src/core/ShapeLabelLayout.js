export const DEFAULT_SHAPE_LABEL_FONT_SIZE = 18;

// Inner padding between a container's edge and its bound label.
export const SHAPE_LABEL_PADDING_X = 16;
export const SHAPE_LABEL_PADDING_Y = 12;
export const SHAPE_LABEL_LINE_HEIGHT = 1.3;

// Largest axis-aligned rectangle inscribed in an ellipse covers 1/sqrt(2)
// of each axis. Labels in ellipses wrap inside that box.
export const ELLIPSE_INSET = Math.SQRT1_2;

function fallbackWidth(text, fontSize) {
    return [...text].reduce((width, character) => {
        if (/\s/.test(character)) return width + fontSize * 0.34;
        if (/[ilI1.,'`]/.test(character)) return width + fontSize * 0.32;
        if (/[MW@#%]/.test(character)) return width + fontSize * 0.88;
        return width + fontSize * 0.59;
    }, 0);
}

function browserTextWidth(text, fontSize) {
    if (typeof document === 'undefined') return null;
    try {
        const canvas = browserTextWidth.canvas || (browserTextWidth.canvas = document.createElement('canvas'));
        const context = canvas.getContext?.('2d');
        if (!context) return null;
        context.font = `${fontSize}px lixFont, sans-serif`;
        return context.measureText(text).width;
    } catch {
        return null;
    }
}

function defaultMeasurer(text, fontSize) {
    return browserTextWidth(text, fontSize) ?? fallbackWidth(text, fontSize);
}

let activeMeasurer = defaultMeasurer;

/**
 * Replace the text measurer used for shape labels. `measure(text, fontSize)`
 * must return a width in canvas units. Pass null to restore the default
 * (canvas measureText in browsers, a character-width heuristic elsewhere).
 */
export function setShapeLabelMeasurer(measure) {
    activeMeasurer = typeof measure === 'function' ? measure : defaultMeasurer;
}

function measureWith(measure, text, fontSize) {
    const width = (measure || activeMeasurer)(text, fontSize);
    return Number.isFinite(width) ? width : fallbackWidth(text, fontSize);
}

function splitParagraphs(label) {
    const lines = String(label ?? '').replace(/\r\n?/g, '\n').split('\n');
    return lines.length ? lines : [''];
}

/**
 * Wrap a label at `maxWidth`. Explicit newlines are kept. Words wider than
 * `maxWidth` are not broken; they stay on their own line and the caller
 * grows the container instead.
 */
export function wrapShapeLabel(label, { fontSize = DEFAULT_SHAPE_LABEL_FONT_SIZE, maxWidth = Infinity, measure } = {}) {
    const result = [];
    for (const paragraph of splitParagraphs(label)) {
        if (!Number.isFinite(maxWidth) || measureWith(measure, paragraph, fontSize) <= maxWidth) {
            result.push(paragraph);
            continue;
        }
        const words = paragraph.split(/\s+/).filter(Boolean);
        if (!words.length) {
            result.push('');
            continue;
        }
        let current = '';
        for (const word of words) {
            const candidate = current ? `${current} ${word}` : word;
            if (!current || measureWith(measure, candidate, fontSize) <= maxWidth) {
                current = candidate;
            } else {
                result.push(current);
                current = word;
            }
        }
        result.push(current);
    }
    return result.length ? result : [''];
}

/** Width of the widest single word (the narrowest a wrapped label can be). */
export function longestShapeLabelWord(label, { fontSize = DEFAULT_SHAPE_LABEL_FONT_SIZE, measure } = {}) {
    let widest = 0;
    for (const paragraph of splitParagraphs(label)) {
        for (const word of paragraph.split(/\s+/)) {
            if (word) widest = Math.max(widest, measureWith(measure, word, fontSize));
        }
    }
    return widest;
}

/** Measure label lines (wrapped when `maxWidth` is finite). */
export function measureShapeLabel(label, fontSize = DEFAULT_SHAPE_LABEL_FONT_SIZE, { maxWidth = Infinity, measure } = {}) {
    const safeLines = wrapShapeLabel(label, { fontSize, maxWidth, measure });
    const widths = safeLines.map((line) => measureWith(measure, line, fontSize));
    const lineHeight = fontSize * SHAPE_LABEL_LINE_HEIGHT;
    const contentWidth = Math.max(0, ...widths);
    const contentHeight = Math.max(lineHeight, safeLines.length * lineHeight);

    return {
        lines: safeLines,
        widths,
        lineHeight,
        contentWidth,
        contentHeight,
        requiredWidth: Math.ceil(contentWidth + SHAPE_LABEL_PADDING_X * 2),
        requiredHeight: Math.ceil(contentHeight + SHAPE_LABEL_PADDING_Y * 2),
    };
}

/**
 * Fit a container to its bound label (Excalidraw-style).
 *
 * The user's explicit size is the floor: the container never renders smaller
 * than `userWidth` x `userHeight`. With `wrap` on (the default) the label wraps
 * at the inner width; height grows when wrapped lines overflow and width grows
 * only when a single unbreakable word is wider than the inner width. With
 * `wrap` off the label keeps its explicit lines and both axes grow to fit.
 *
 * `inset` is the fraction of each axis usable for text (1 for rectangles,
 * ELLIPSE_INSET for ellipses).
 *
 * Returns `{ width, height, layout, minWidth, minHeight }`, where `minWidth` /
 * `minHeight` are the smallest container size the label permits at the
 * returned width.
 */
export function fitShapeToLabel({
    label,
    fontSize = DEFAULT_SHAPE_LABEL_FONT_SIZE,
    wrap = true,
    userWidth = 0,
    userHeight = 0,
    inset = 1,
    paddingX = SHAPE_LABEL_PADDING_X,
    paddingY = SHAPE_LABEL_PADDING_Y,
    measure,
} = {}) {
    const baseWidth = Math.max(0, Number(userWidth) || 0);
    const baseHeight = Math.max(0, Number(userHeight) || 0);
    if (!label) {
        return { width: baseWidth, height: baseHeight, layout: null, minWidth: 0, minHeight: 0 };
    }
    const scale = inset > 0 ? inset : 1;
    const toOuter = (inner) => Math.ceil(inner / scale);

    let minWidth;
    let maxWidth = Infinity;
    if (wrap) {
        minWidth = toOuter(longestShapeLabelWord(label, { fontSize, measure }) + paddingX * 2);
    } else {
        const unwrapped = measureShapeLabel(label, fontSize, { measure });
        minWidth = toOuter(unwrapped.contentWidth + paddingX * 2);
    }
    const width = Math.max(baseWidth, minWidth);
    if (wrap) maxWidth = Math.max(0, width * scale - paddingX * 2);

    const measured = measureShapeLabel(label, fontSize, { maxWidth, measure });
    const minHeight = toOuter(measured.contentHeight + paddingY * 2);
    const height = Math.max(baseHeight, minHeight);

    return { width, height, layout: measured, minWidth, minHeight };
}
