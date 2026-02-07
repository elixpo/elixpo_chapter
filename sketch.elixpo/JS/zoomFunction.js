let currentY = 0;
const scrollRate = 50;

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

freehandCanvas.addEventListener("wheel", function(e) {
  if (!e.ctrlKey) return;
  e.preventDefault();

  // Determine the zoom delta
  const delta = e.deltaY > 0 ? -0.1 : 0.1;
  let newZoom = currentZoom + delta;
  if (newZoom < minScale) newZoom = minScale;
  if (newZoom > maxScale) newZoom = maxScale;

  // Get canvas bounding rect (in case canvas doesn't fill the window exactly)
  const rect = freehandCanvas.getBoundingClientRect();
  
  // Calculate mouse position relative to the canvas in pixels
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;
  
  // Determine what fraction of the canvas the mouse is at
  const mouseFracX = mouseX / rect.width;
  const mouseFracY = mouseY / rect.height;
  
  // Compute the current viewBox coordinate under the mouse.
  // currentViewBox.width and .height represent the current viewBox dimensions.
  const anchorViewBoxX = currentViewBox.x + mouseFracX * currentViewBox.width;
  const anchorViewBoxY = currentViewBox.y + mouseFracY * currentViewBox.height;
  
  // Now compute the new viewBox dimensions based on the new zoom level.
  // We assume the canvas pixel size stays the same.
  const newViewBoxWidth = window.innerWidth / newZoom;
  const newViewBoxHeight = window.innerHeight / newZoom;
  
  // Compute the new viewBox's x and y so that the anchor remains at the same screen fraction.
  // That means:
  //   newViewBox.x + mouseFracX * newViewBoxWidth === anchorViewBoxX
  // Solve for newViewBox.x:
  const newViewBoxX = anchorViewBoxX - mouseFracX * newViewBoxWidth;
  const newViewBoxY = anchorViewBoxY - mouseFracY * newViewBoxHeight;
  
  // Update the viewBox attribute with the new values.
  freehandCanvas.setAttribute(
    "viewBox",
    `${newViewBoxX} ${newViewBoxY} ${newViewBoxWidth} ${newViewBoxHeight}`
  );
  
  // Update our state
  currentZoom = newZoom;
  currentViewBox = {
    x: newViewBoxX,
    y: newViewBoxY,
    width: newViewBoxWidth,
    height: newViewBoxHeight
  };
  
  updateZoomDisplay();
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



freehandCanvas.addEventListener("mousedown", function (e) {
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

freehandCanvas.addEventListener("mouseup", () => {
  if(isPanningToolActive)
  {
      isPanning = false;
      freehandCanvas.style.cursor = 'grab';
  }
  
});

freehandCanvas.addEventListener("mouseleave", () => {
  if(isPanningToolActive)
  {
      isPanning = false;
      freehandCanvas.style.cursor = 'grab';
  }

});


svg.addEventListener("wheel", (e) => {
  e.preventDefault();
  if (e.ctrlKey) return; // Ignore zoom gestures

  if (e.shiftKey) {
      // Pan sideways when Shift is held
      currentViewBox.x += e.deltaY > 0 ? scrollRate : -scrollRate;
  } else {
      // Pan vertically
      currentViewBox.y += e.deltaY > 0 ? scrollRate : -scrollRate;
  }

  svg.setAttribute(
      "viewBox",
      `${currentViewBox.x} ${currentViewBox.y} ${currentViewBox.width} ${currentViewBox.height}`
  );
});