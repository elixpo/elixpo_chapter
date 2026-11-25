/**
 * Browser `env` for SceneApplier, built on the engine's window globals
 * (window.shapes, window.__sceneSerializer, window.multiSelection,
 * window.currentShape, arrow helpers). Kept separate from the applier so
 * the applier can be unit-tested with a mock env.
 */

function nodeOf(shape) {
    return shape?.group || shape?.element || null;
}

function svgRoot() {
    return window.svg;
}

function closeLabelEditorDom() {
    const input = document.querySelector('.shape-label-editor [contenteditable]');
    if (!input) return false;
    // Escape = cancel: the editor restores the original label and closes.
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    if (typeof input.blur === 'function') input.blur();
    const overlay = input.closest('.shape-label-editor');
    if (overlay?.parentNode) overlay.parentNode.removeChild(overlay);
    return true;
}

/**
 * @param {object} opts
 * @param {() => boolean} opts.isPointerDown - a local pointer gesture is in progress
 */
export function createEngineSceneEnv({ isPointerDown = () => false } = {}) {
    const serializer = () => window.__sceneSerializer || {};

    const env = {
        get shapes() {
            if (!Array.isArray(window.shapes)) window.shapes = [];
            return window.shapes;
        },

        createShape(data) {
            const create = serializer().createShape;
            return typeof create === 'function' ? create(data) : null;
        },

        removeShapeDom(shape) {
            if (shape.shapeName === 'frame') {
                if (shape.clipGroup?.parentNode) shape.clipGroup.parentNode.removeChild(shape.clipGroup);
                if (shape.clipPath?.parentNode) shape.clipPath.parentNode.removeChild(shape.clipPath);
                if (shape._frameType === 'web-embed' && typeof shape.destroy === 'function') {
                    try { shape.destroy(); } catch {}
                }
            }
            const node = nodeOf(shape);
            if (node?.parentNode) node.parentNode.removeChild(node);
            if (shape.element && shape.element !== node && shape.element.parentNode && !shape.group) {
                shape.element.parentNode.removeChild(shape.element);
            }
            if (typeof shape.removeSelection === 'function') {
                try { shape.removeSelection(); } catch {}
            }
        },

        sameLayer(a, b) {
            const na = nodeOf(a);
            const nb = nodeOf(b);
            return !!na && !!nb && na.parentNode === nb.parentNode;
        },

        placeBefore(shape, next) {
            const node = nodeOf(shape);
            const parent = node?.parentNode || svgRoot();
            if (!node || !parent) return;
            const anchor = next ? nodeOf(next) : null;
            if (anchor && anchor.parentNode === parent) parent.insertBefore(node, anchor);
            else if (next === null && node.parentNode === parent) {
                // Topmost in its layer: after the last shape node in this parent.
                const shapeNodes = new Set(window.shapes.map(nodeOf).filter(Boolean));
                let last = null;
                for (const child of parent.childNodes) if (shapeNodes.has(child) && child !== node) last = child;
                if (last) parent.insertBefore(node, last.nextSibling);
            }
            if (shape.shapeName === 'frame' && shape.clipGroup && shape.clipGroup.parentNode === parent) {
                parent.insertBefore(shape.clipGroup, node.nextSibling);
            }
        },

        attachToFrame(shape, frame) {
            if (typeof frame.addShapeToFrame === 'function') frame.addShapeToFrame(shape);
            else {
                frame.containedShapes = frame.containedShapes || [];
                if (!frame.containedShapes.includes(shape)) frame.containedShapes.push(shape);
                shape.parentFrame = frame;
            }
        },

        detachFromFrame(shape) {
            const frame = shape.parentFrame;
            if (!frame) return;
            if (typeof frame.removeShapeFromFrame === 'function') frame.removeShapeFromFrame(shape);
            const node = nodeOf(shape);
            if (node && frame.clipGroup && node.parentNode === frame.clipGroup) {
                frame.clipGroup.removeChild(node);
                svgRoot()?.appendChild(node);
            }
            shape.parentFrame = null;
        },

        setArrowBinding(arrow, isStart, target, binding) {
            const bind = serializer().setArrowBinding;
            if (typeof bind === 'function') bind(arrow, isStart, target, binding);
            if (typeof arrow.updateAttachments === 'function') arrow.updateAttachments();
            else if (typeof arrow.draw === 'function') arrow.draw();
        },

        detachArrowsFrom(shape) {
            if (typeof window.cleanupAttachments === 'function') window.cleanupAttachments(shape);
        },

        updateAttachedArrows(shape) {
            if (typeof window.updateAttachedArrows === 'function') window.updateAttachedArrows(shape);
            else if (typeof shape.updateAttachedArrows === 'function') shape.updateAttachedArrows();
        },

        isSelected(shape) {
            return !!shape && (shape.isSelected === true
                || window.currentShape === shape
                || !!window.multiSelection?.selectedShapes?.has(shape));
        },

        select(shape) {
            const multi = window.multiSelection;
            if (multi?.selectedShapes && multi.selectedShapes.size > 0) {
                multi.addShape(shape);
                return;
            }
            window.currentShape = shape;
            shape.isSelected = true;
            if (typeof shape.addAnchors === 'function') {
                try { shape.addAnchors(); } catch {}
            }
        },

        deselect(shape) {
            const multi = window.multiSelection;
            if (multi?.selectedShapes?.has(shape)) {
                multi.removeShape(shape);
            }
            if (typeof shape.removeSelection === 'function') {
                try { shape.removeSelection(); } catch {}
            }
            shape.isSelected = false;
            if (window.currentShape === shape) window.currentShape = null;
        },

        redraw(shape, draw) {
            // Multi-selected shapes show one shared selection box, not their
            // own anchors (Selection.js sets _skipAnchors the same way).
            const multi = window.multiSelection;
            const inMulti = multi?.selectedShapes?.has(shape) && multi.selectedShapes.size > 1;
            if (!inMulti) { draw(); return; }
            const previous = shape._skipAnchors;
            shape._skipAnchors = true;
            try { draw(); } finally { shape._skipAnchors = previous; }
        },

        refreshSelection(shape) {
            const multi = window.multiSelection;
            if (multi?.selectedShapes?.has(shape) && multi.selectedShapes.size > 1) {
                multi.updateControls();
                return;
            }
            if (typeof shape.updateSelectionControls === 'function') {
                try { shape.updateSelectionControls(); return; } catch {}
            }
            if (typeof shape.removeSelection === 'function' && typeof shape.addAnchors === 'function') {
                try { shape.removeSelection(); shape.addAnchors(); shape.isSelected = true; } catch {}
            }
            if (multi?.selectedShapes?.has(shape)) multi.updateControls();
        },

        isEditing(shape) {
            if (!shape) return false;
            if (shape._isEditingLabel) return true;
            const active = document.activeElement;
            const node = nodeOf(shape);
            return !!(active && node && typeof node.contains === 'function' && node.contains(active)
                && (active.isContentEditable || active.tagName === 'TEXTAREA' || active.tagName === 'INPUT'));
        },

        closeEditor(shape) {
            if (shape._isEditingLabel) {
                closeLabelEditorDom();
                shape._isEditingLabel = false;
                return;
            }
            const active = document.activeElement;
            if (active && typeof active.blur === 'function') active.blur();
        },

        isInGesture(shape) {
            if (!shape) return false;
            if (shape.isBeingDrawn || shape.isDrawing) return true;
            if (!isPointerDown()) return false;
            return env.isSelected(shape);
        },
    };
    return env;
}
