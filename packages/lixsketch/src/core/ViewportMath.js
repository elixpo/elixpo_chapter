/**
 * Pure viewport math shared by ZoomPan.js and its unit tests.
 * Nothing here touches the DOM or engine globals.
 */

// WheelEvent.deltaMode: 0 = pixels, 1 = lines, 2 = pages.
const LINE_HEIGHT_PX = 16;
const PAGE_HEIGHT_PX = 800;

/** Normalize a wheel delta to screen pixels. */
export function wheelDeltaToPixels(delta, deltaMode = 0) {
    const value = Number(delta) || 0;
    if (deltaMode === 1) return value * LINE_HEIGHT_PX;
    if (deltaMode === 2) return value * PAGE_HEIGHT_PX;
    return value;
}

/**
 * World-space pan for a plain wheel / trackpad scroll (Excalidraw-style):
 * both axes follow the gesture, Shift turns vertical scrolling sideways,
 * and the distance is screen pixels divided by zoom so panning feels the
 * same at every zoom level.
 */
export function wheelPanDelta({ deltaX = 0, deltaY = 0, deltaMode = 0, shiftKey = false }, zoom = 1) {
    let dx = wheelDeltaToPixels(deltaX, deltaMode);
    let dy = wheelDeltaToPixels(deltaY, deltaMode);
    if (shiftKey && dx === 0) {
        dx = dy;
        dy = 0;
    }
    const scale = zoom > 0 ? zoom : 1;
    return { dx: dx / scale, dy: dy / scale };
}

/**
 * Multiplicative zoom factor for Ctrl/Cmd+wheel and trackpad pinch.
 * Pinch sends many small deltas, a mouse wheel a few large ones; an
 * exponential curve keeps both smooth. Each event is capped so one
 * notch (~100px, capped at 50) zooms ~18%.
 */
export function wheelZoomFactor(deltaY, deltaMode = 0) {
    const px = wheelDeltaToPixels(deltaY, deltaMode);
    const clamped = Math.max(-50, Math.min(50, px));
    return Math.exp(-clamped * 0.004);
}

export function clampZoom(zoom, minZoom, maxZoom) {
    return Math.max(minZoom, Math.min(maxZoom, zoom));
}

/**
 * New viewBox that keeps the world point under the cursor fixed while the
 * zoom changes. `rect` is the SVG element's client rect, `point` is the
 * cursor in client coordinates.
 */
export function zoomViewBoxAroundPoint(viewBox, rect, point, newZoom) {
    const width = rect.width || 1;
    const height = rect.height || 1;
    const fracX = (point.x - (rect.left || 0)) / width;
    const fracY = (point.y - (rect.top || 0)) / height;
    const anchorX = viewBox.x + fracX * viewBox.width;
    const anchorY = viewBox.y + fracY * viewBox.height;
    const nextWidth = width / newZoom;
    const nextHeight = height / newZoom;
    return {
        x: anchorX - fracX * nextWidth,
        y: anchorY - fracY * nextHeight,
        width: nextWidth,
        height: nextHeight,
    };
}

/** Union of finite {x, y, width, height} bounds (negative sizes allowed). */
export function unionBounds(boundsList) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const b of boundsList || []) {
        if (!b || ![b.x, b.y, b.width, b.height].every(Number.isFinite)) continue;
        minX = Math.min(minX, b.x, b.x + b.width);
        minY = Math.min(minY, b.y, b.y + b.height);
        maxX = Math.max(maxX, b.x, b.x + b.width);
        maxY = Math.max(maxY, b.y, b.y + b.height);
    }
    if (minX === Infinity) return null;
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Zoom + viewBox that frames `bounds` on a `screen` of {width, height}
 * with 10% (min 50 world units) padding, clamped to the zoom range.
 */
export function fitBoundsToViewport(bounds, screen, minZoom, maxZoom) {
    const paddingX = Math.max(50, bounds.width * 0.1);
    const paddingY = Math.max(50, bounds.height * 0.1);
    const zoom = clampZoom(
        Math.min(screen.width / (bounds.width + paddingX * 2), screen.height / (bounds.height + paddingY * 2)),
        minZoom,
        maxZoom,
    );
    const width = screen.width / zoom;
    const height = screen.height / zoom;
    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;
    return { zoom, viewBox: { x: cx - width / 2, y: cy - height / 2, width, height } };
}
