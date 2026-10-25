/* eslint-disable */
import { installScreenSpaceControlSync } from './ScreenSpaceControls.js';
import { clampZoom, fitBoundsToViewport, unionBounds, wheelPanDelta, wheelZoomFactor, zoomViewBoxAroundPoint } from './ViewportMath.js';
// Zoom and Pan controls - combined from zoomFunction.js + panCanvas.js
// Depends on globals: svg, freehandCanvas, currentZoom, currentViewBox, isPanningToolActive, isPanning
// Depends on globals: minScale, maxScale, zoomInBtn, zoomOutBtn, zoomPercentSpan, panStart, startCanvasX, startCanvasY

installScreenSpaceControlSync(freehandCanvas);

// === Zoom Functions ===
let currentY = 0;

function updateZoomDisplay() {
  zoomPercentSpan.innerText = Math.round(currentZoom * 100) + "%";
}

function updateViewBox(anchorX = null, anchorY = null) {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const scaledWidth = width / currentZoom;
  const scaledHeight = height / currentZoom;

  let centerX, centerY;

  if (anchorX === null || anchorY === null) {
    centerX = currentViewBox.x + (currentViewBox.width / 2);
    centerY = currentViewBox.y + (currentViewBox.height / 2);
  } else {

    centerX = anchorX;
    centerY = anchorY;
  }

  const viewBoxX = centerX - (scaledWidth / 2);
  const viewBoxY = centerY - (scaledHeight / 2);

  freehandCanvas.setAttribute(
    "viewBox",
    `${viewBoxX} ${viewBoxY} ${scaledWidth} ${scaledHeight}`
  );

  currentViewBox.x = viewBoxX;
  currentViewBox.y = viewBoxY;
  currentViewBox.width = scaledWidth;
  currentViewBox.height = scaledHeight;
}

zoomInBtn.addEventListener("click", function() {
  currentZoom *= 1.1;
  if (currentZoom > maxScale) currentZoom = maxScale;
  updateViewBox();
  updateZoomDisplay();
});

zoomOutBtn.addEventListener("click", function() {
  currentZoom /= 1.1;
  if (currentZoom < minScale) currentZoom = minScale;
  updateViewBox();
  updateZoomDisplay();
});

// Exposed for React Footer buttons — zoom from center of canvas
window.zoomFromCenter = function(direction) {
  if (direction > 0) {
    currentZoom *= 1.1;
    if (currentZoom > maxScale) currentZoom = maxScale;
  } else {
    currentZoom /= 1.1;
    if (currentZoom < minScale) currentZoom = minScale;
  }
  updateViewBox(); // null anchors = zoom from center
  updateZoomDisplay();
  // Sync React zoom state
  if (window.__sketchStoreApi && window.__sketchStoreApi.setZoom) {
    window.__sketchStoreApi.setZoom(currentZoom);
  }
};

window.zoomReset = function() {
  // Issue #24 bug #5: reset zoom in place around the current viewport
  // centre — do NOT recenter to (0, 0). Recentering used to make whatever
  // the user had on screen vanish until they panned back to it.
  const cx = currentViewBox.x + currentViewBox.width / 2;
  const cy = currentViewBox.y + currentViewBox.height / 2;

  currentZoom = 1;
  const rect = freehandCanvas.getBoundingClientRect();
  const vbW = rect.width || window.innerWidth;
  const vbH = rect.height || window.innerHeight;

  currentViewBox.x = cx - vbW / 2;
  currentViewBox.y = cy - vbH / 2;
  currentViewBox.width = vbW;
  currentViewBox.height = vbH;
  freehandCanvas.setAttribute(
    "viewBox",
    `${currentViewBox.x} ${currentViewBox.y} ${vbW} ${vbH}`
  );
  updateZoomDisplay();
  if (window.__sketchStoreApi && window.__sketchStoreApi.setZoom) {
    window.__sketchStoreApi.setZoom(1);
  }
};

function getShapeBoundsForFit(shape) {
  if (!shape) return null;

  const selection = window.multiSelection;
  if (selection && typeof selection.getShapeBounds === "function") {
    try {
      const bounds = selection.getShapeBounds(shape);
      if (bounds && [bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)) {
        return bounds;
      }
    } catch {}
  }

  // Fall back to the common shape interface when selection is unavailable.
  // Accessing x/y instead of boundingBox preserves freehand move offsets.
  const bounds = {
    x: Number(shape.x),
    y: Number(shape.y),
    width: Number(shape.width),
    height: Number(shape.height),
  };
  return Object.values(bounds).every(Number.isFinite) ? bounds : null;
}

function applyViewport(zoom, viewBox) {
  currentZoom = zoom;
  currentViewBox.x = viewBox.x;
  currentViewBox.y = viewBox.y;
  currentViewBox.width = viewBox.width;
  currentViewBox.height = viewBox.height;
  freehandCanvas.setAttribute(
    "viewBox",
    `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`
  );
  updateZoomDisplay();
  if (window.__sketchStoreApi && window.__sketchStoreApi.setZoom) {
    window.__sketchStoreApi.setZoom(currentZoom);
  }
}

function zoomToShapes(shapeList) {
  const bounds = unionBounds((shapeList || []).map(getShapeBoundsForFit));
  if (!bounds) return false;
  const rect = freehandCanvas.getBoundingClientRect();
  const screen = { width: rect.width || window.innerWidth, height: rect.height || window.innerHeight };
  const { zoom, viewBox } = fitBoundsToViewport(bounds, screen, minScale, maxScale);
  applyViewport(zoom, viewBox);
  return true;
}

// Shift+1: frame every shape on the canvas.
window.zoomFit = function() {
  if (!zoomToShapes(window.shapes) && window.zoomReset) window.zoomReset();
};

// Shift+2: frame the current selection (falls back to fit-all).
window.zoomToSelection = function() {
  const selected = window.multiSelection?.selectedShapes;
  const targets = selected && selected.size > 0
    ? Array.from(selected)
    : (window.currentShape ? [window.currentShape] : []);
  if (!zoomToShapes(targets)) window.zoomFit();
};

freehandCanvas.addEventListener("wheel", function(e) {
  // Ctrl/Cmd+wheel and trackpad pinch (which browsers report as ctrl+wheel)
  // zoom around the cursor.
  if (!e.ctrlKey && !e.metaKey) return;
  e.preventDefault();

  const newZoom = clampZoom(currentZoom * wheelZoomFactor(e.deltaY, e.deltaMode), minScale, maxScale);
  if (newZoom === currentZoom) return;

  // Use the SVG element's rect, not the window: in split mode the canvas
  // pane is narrower and a window-sized viewBox would distort shapes.
  const rect = freehandCanvas.getBoundingClientRect();
  const next = zoomViewBoxAroundPoint(currentViewBox, rect, { x: e.clientX, y: e.clientY }, newZoom);
  applyViewport(newZoom, next);
});

// Function to resize the canvas to fill the screen (initial setup)
function resizeCanvas() {
  const width = window.innerWidth;
  const height = window.innerHeight;

  freehandCanvas.style.width = `${width}px`;
  freehandCanvas.style.height = `${height}px`;

  // Set initial viewBox based on initial zoom
  updateViewBox(); // Initial center anchor
}



let isMiddleMousePanning = false;
let isSpaceMousePanning = false;

freehandCanvas.addEventListener("mousedown", function (e) {
  // Space + primary button temporarily owns the pointer, regardless of the
  // active drawing tool. EventDispatcher yields while this flag is active.
  if (e.button === 0 && window.__spacePanActive) {
      e.preventDefault();
      isSpaceMousePanning = true;
      window.__spacePanPointerActive = true;
      isPanning = true;
      startCanvasX = e.clientX;
      startCanvasY = e.clientY;
      panStart = { x: e.clientX, y: e.clientY };
      freehandCanvas.style.cursor = 'grabbing';
      return;
  }
  // Middle mouse button panning
  if (e.button === 1) {
      e.preventDefault();
      isMiddleMousePanning = true;
      isPanning = true;
      startCanvasX = e.clientX;
      startCanvasY = e.clientY;
      panStart = { x: e.clientX, y: e.clientY };
      freehandCanvas.style.cursor = 'grabbing';
      return;
  }
  if (isPanningToolActive) {
      isPanning = true;
      startCanvasX = e.clientX;
      startCanvasY = e.clientY;
      panStart = { x: e.clientX, y: e.clientY };
      freehandCanvas.style.cursor = 'grabbing';
  }
});

freehandCanvas.addEventListener("mousemove", (e) => {
  if (!isPanning) return;

  const dx = e.clientX - panStart.x;
  const dy = e.clientY - panStart.y;
  const dxViewBox = dx / currentZoom;
  const dyViewBox = dy / currentZoom;

  currentViewBox.x -= dxViewBox;
  currentViewBox.y -= dyViewBox;

  freehandCanvas.setAttribute(
      "viewBox",
      `${currentViewBox.x} ${currentViewBox.y} ${currentViewBox.width} ${currentViewBox.height}`
  );

  panStart = { x: e.clientX, y: e.clientY };
});

freehandCanvas.addEventListener("mouseup", (e) => {
  if (isSpaceMousePanning) {
      isSpaceMousePanning = false;
      window.__spacePanPointerActive = false;
      isPanning = false;
      freehandCanvas.style.cursor = window.__spacePanActive ? 'grab' : '';
      return;
  }
  if (isMiddleMousePanning) {
      isMiddleMousePanning = false;
      isPanning = false;
      freehandCanvas.style.cursor = '';
      return;
  }
  if(isPanningToolActive)
  {
      isPanning = false;
      freehandCanvas.style.cursor = 'grab';
  }
});

freehandCanvas.addEventListener("mouseleave", () => {
  if (isSpaceMousePanning) {
      isSpaceMousePanning = false;
      window.__spacePanPointerActive = false;
      isPanning = false;
      freehandCanvas.style.cursor = window.__spacePanActive ? 'grab' : '';
      return;
  }
  if (isMiddleMousePanning) {
      isMiddleMousePanning = false;
      isPanning = false;
      freehandCanvas.style.cursor = '';
      return;
  }
  if(isPanningToolActive)
  {
      isPanning = false;
      freehandCanvas.style.cursor = 'grab';
  }
});

window.addEventListener("blur", () => {
  if (!isSpaceMousePanning) return;
  isSpaceMousePanning = false;
  window.__spacePanPointerActive = false;
  isPanning = false;
  freehandCanvas.style.cursor = '';
});

// Prevent default middle-click auto-scroll behavior
freehandCanvas.addEventListener("auxclick", (e) => {
  if (e.button === 1) e.preventDefault();
});


svg.addEventListener("wheel", (e) => {
  e.preventDefault();
  if (e.ctrlKey || e.metaKey) return; // Zoom gestures are handled above

  // Plain wheel / two-finger trackpad scroll pans in both axes; Shift turns
  // a vertical wheel into a horizontal pan.
  const { dx, dy } = wheelPanDelta(e, currentZoom);
  currentViewBox.x += dx;
  currentViewBox.y += dy;

  svg.setAttribute(
      "viewBox",
      `${currentViewBox.x} ${currentViewBox.y} ${currentViewBox.width} ${currentViewBox.height}`
  );
});
