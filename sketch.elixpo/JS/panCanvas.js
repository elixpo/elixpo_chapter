let currentY = 0;
const scrollRate = 50;


// --- Panning Tool ---
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
