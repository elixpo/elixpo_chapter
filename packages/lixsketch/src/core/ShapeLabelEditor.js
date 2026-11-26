/* eslint-disable */
// Inline HTML editor for labels bound to container shapes (rectangle, circle).
// The shape owns layout: every keystroke updates `shape.label` and redraws, so
// the container grows (and arrows follow) while the user types.

import { pushLabelChangeAction } from './UndoRedo.js';

export function readLabelEditorText(input) {
    const raw = input.innerText ?? input.textContent ?? '';
    return String(raw).replace(/ /g, '').trim();
}

function screenBox(shape, localBounds) {
    const ctm = shape.group.getScreenCTM?.();
    if (!ctm) return null;
    const svgEl = (typeof svg !== 'undefined' && svg) || window.svg;
    const pt1 = svgEl.createSVGPoint();
    pt1.x = localBounds.x0; pt1.y = localBounds.y0;
    const a = pt1.matrixTransform(ctm);
    const pt2 = svgEl.createSVGPoint();
    pt2.x = localBounds.x1; pt2.y = localBounds.y1;
    const b = pt2.matrixTransform(ctm);
    return {
        x: Math.min(a.x, b.x),
        y: Math.min(a.y, b.y),
        width: Math.abs(b.x - a.x),
        height: Math.abs(b.y - a.y),
        scale: Math.abs(b.x - a.x) / Math.max(localBounds.x1 - localBounds.x0, 1),
    };
}

/**
 * Open the label editor for `shape`.
 * @param {object} shape - shape with label/labelColor/labelFontSize/draw()
 * @param {() => {x0:number,y0:number,x1:number,y1:number}} getLocalBounds -
 *   the shape's box in its local (group) coordinates; re-read after each
 *   keystroke because the box grows with the label.
 */
export function openShapeLabelEditor(shape, getLocalBounds) {
    if (shape._isEditingLabel) return;
    const initial = screenBox(shape, getLocalBounds());
    if (!initial) return;
    shape._isEditingLabel = true;
    if (shape.labelElement) shape.labelElement.setAttribute('visibility', 'hidden');
    if (shape._labelBg) shape._labelBg.setAttribute('visibility', 'hidden');

    const originalLabel = shape.label || '';
    const svgEl = (typeof svg !== 'undefined' && svg) || window.svg;
    const canvasBg = window.getComputedStyle(svgEl).backgroundColor || '#000';

    const overlay = document.createElement('div');
    overlay.className = 'shape-label-editor';
    const input = document.createElement('div');
    input.setAttribute('contenteditable', 'true');

    const place = (box) => {
        overlay.style.cssText = `
            position: fixed; z-index: 10000;
            left: ${box.x}px; top: ${box.y}px;
            width: ${box.width}px; height: ${box.height}px;
            display: flex; align-items: center; justify-content: center;
            pointer-events: auto;
        `;
        input.style.cssText = `
            max-width: ${Math.max(box.width - 8, 30)}px; min-width: 30px; min-height: 20px;
            background: ${canvasBg}; border: none;
            outline: none; padding: 2px 6px;
            color: ${shape.labelColor}; font-size: ${Math.max(12, shape.labelFontSize * box.scale)}px;
            font-family: lixFont, sans-serif; text-align: center;
            white-space: pre-wrap; word-break: break-word;
            cursor: text;
        `;
    };
    place(initial);

    if (originalLabel) {
        input.textContent = originalLabel;
    } else {
        input.innerHTML = '&nbsp;';
    }
    overlay.appendChild(input);
    document.body.appendChild(overlay);

    setTimeout(() => {
        input.focus();
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(input);
        sel.removeAllRanges();
        sel.addRange(range);
    }, 10);

    // Live: grow the container as the user types.
    input.addEventListener('input', () => {
        shape.label = readLabelEditorText(input);
        shape.draw();
        const box = screenBox(shape, getLocalBounds());
        if (box) place(box);
    });

    let finished = false;
    let cancelled = false;
    const finishEdit = () => {
        if (finished) return;
        finished = true;
        const newText = cancelled ? originalLabel : readLabelEditorText(input);
        shape.label = newText;
        shape._isEditingLabel = false;
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        shape.draw();
        if (newText !== originalLabel) {
            pushLabelChangeAction(shape, { label: originalLabel }, { label: newText });
        }
    };

    input.addEventListener('blur', finishEdit);
    input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); input.blur(); }
        if (e.key === 'Escape') { cancelled = true; input.textContent = originalLabel; input.blur(); }
    });
    input.addEventListener('pointerdown', (e) => e.stopPropagation());
    input.addEventListener('pointermove', (e) => e.stopPropagation());
    input.addEventListener('pointerup', (e) => e.stopPropagation());
}
