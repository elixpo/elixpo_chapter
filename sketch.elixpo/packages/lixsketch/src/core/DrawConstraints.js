/**
 * Shift-key drawing constraints (Excalidraw behaviour):
 *   - rectangles / ellipses become squares / circles
 *   - lines and arrows snap to 45° steps
 * Pure functions: points in, points out.
 */

/** Move `point` so the box from `start` is square, keeping the drag direction. */
export function constrainToSquare(start, point, enabled = true) {
    if (!enabled) return { x: point.x, y: point.y };
    const dx = point.x - start.x;
    const dy = point.y - start.y;
    const size = Math.max(Math.abs(dx), Math.abs(dy));
    return {
        x: start.x + (dx < 0 ? -size : size),
        y: start.y + (dy < 0 ? -size : size),
    };
}

/** Snap the segment start → point to the nearest multiple of `stepRadians`. */
export function snapToAngle(start, point, enabled = true, stepRadians = Math.PI / 4) {
    if (!enabled) return { x: point.x, y: point.y };
    const dx = point.x - start.x;
    const dy = point.y - start.y;
    const dist = Math.hypot(dx, dy);
    if (dist === 0) return { x: start.x, y: start.y };
    const angle = Math.round(Math.atan2(dy, dx) / stepRadians) * stepRadians;
    return { x: start.x + dist * Math.cos(angle), y: start.y + dist * Math.sin(angle) };
}
