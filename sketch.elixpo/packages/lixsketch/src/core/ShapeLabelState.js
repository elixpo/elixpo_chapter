/* eslint-disable */
// Plain-data form of the bound label + explicit size of container shapes
// (rectangle, circle). Shared by SceneSerializer (save/load, collaboration
// snapshots) and CopyPaste (copy/paste, duplicate).
//
// Older data only carried a label inside `options` (AI/mermaid renderers) and
// had no explicit user size, so every field is optional when applied.

// Default label colors follow the theme foreground; persisting them would
// freeze white/black text across theme switches.
const THEME_FOREGROUND_COLORS = new Set(['#ffffff', '#fff', '#000000', '#000']);

function finiteOr(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
}

/** Serialize label fields + explicit size for a rectangle or circle. */
export function serializeContainerLabel(shape) {
    const state = {
        label: typeof shape.label === 'string' ? shape.label : '',
        labelWrap: shape.labelWrap !== false,
    };
    if (shape.labelColor && !THEME_FOREGROUND_COLORS.has(String(shape.labelColor).toLowerCase())) {
        state.labelColor = shape.labelColor;
    }
    if (Number.isFinite(shape.labelFontSize)) state.labelFontSize = shape.labelFontSize;

    if (shape.shapeName === 'circle') {
        // Explicit radii; rx/ry may be grown to fit the label.
        state.userRx = finiteOr(shape.userRx, shape.rx);
        state.userRy = finiteOr(shape.userRy, shape.ry);
    } else {
        // Explicit size; width/height may be grown to fit the label.
        state.userWidth = finiteOr(shape.userWidth, shape.width);
        state.userHeight = finiteOr(shape.userHeight, shape.height);
    }
    return state;
}

/** Read label state from serialized data, falling back to legacy `options`. */
export function readContainerLabel(data) {
    const options = data.options || {};
    const state = {
        label: typeof data.label === 'string' ? data.label : (options.label || ''),
        labelWrap: data.labelWrap !== undefined ? data.labelWrap !== false : options.labelWrap !== false,
    };
    const labelColor = data.labelColor || options.labelColor;
    const labelFontSize = data.labelFontSize || options.labelFontSize;
    if (labelColor) state.labelColor = labelColor;
    if (labelFontSize) state.labelFontSize = labelFontSize;
    if (data.type === 'circle') {
        state.userRx = finiteOr(data.userRx, data.rx);
        state.userRy = finiteOr(data.userRy, data.ry);
    } else {
        state.userWidth = finiteOr(data.userWidth, data.width);
        state.userHeight = finiteOr(data.userHeight, data.height);
    }
    return state;
}

/** Apply serialized label state to a freshly constructed shape. */
export function applyContainerLabel(shape, data) {
    if (shape && typeof shape.applyLabelState === 'function') {
        shape.applyLabelState(readContainerLabel(data));
    }
    return shape;
}
