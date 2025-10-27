const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const rc = rough.canvas(canvas, {
    options: {
        roughness: 0.5,
        bowing: 0.5,
        stroke: '#ffffff',
        strokeWidth: 2,
        fillStyle: 'solid',
        fillWeight: 0.5,
        curveFitting: 1,
        simplification: 0.5
    }
});
const angleInfo = document.getElementById('angleInfo');
const sidebar = document.getElementById('sidebar');
const textInput = document.getElementById('textInput');
const zoomPercentage = document.getElementById('zoom-percentage');
const zoomIn = document.getElementById('zoom-in');
const zoomOut = document.getElementById('zoom-out');
let currentZoom = 100;

let isDrawing = false;
let isWriting = false;
let hoveredElement = null;
let selectedStrokeWidth = 3;
let lastX = 0;
let lastY = 0;
let elements = [];
let selectedTool = 'pencil';
let selectedColor = '#ffffff';
let currentOpacity = 1; // Add this line
let currentElement = null;
let selectedElement = null;
let offsetX = 0;
let offsetY = 0;
let isPanning = false;
let startPanX = 0;
let startPanY = 0;
let scale = 1;
const scaleFactor = 0.1;
let startX, startY;

let undoStack = [];
let redoStack = [];
const maxHistorySize = 10;

let isTeamCodePopupOpen = false;

let isDragging = false;
let dragOffsetX = 0;
let dragOffsetY = 0;

let animationFrameId = null;
let lastTimestamp = 0;
const ANIMATION_DURATION = 100; // in milliseconds
let startDragPos = { x: 0, y: 0 };
let targetPos = { x: 0, y: 0 };
let isAnimating = false;

const floatingTab = document.getElementById('floating-tab');
const colorPalatebtn = document.getElementById('colorpalatebtn');
let isFloatingTabVisible = false;

// Add these variables at the top with other declarations
let mouseX = 0;
let mouseY = 0;

function drawGrid() {
    const gridSize = 20; // Size of grid squares
    const dotSize = 1; // Size of dots

    // Check if light theme is active
    const isLightTheme = document.body.classList.contains('light-theme');

    // Draw the base grid dots
    ctx.fillStyle = isLightTheme ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.1)';

    for (let x = gridSize; x < canvas.width / 2; x += gridSize) {
        for (let y = gridSize; y < canvas.height / 2; y += gridSize) {
            // Calculate distance from cursor
            const distance = Math.sqrt(
                Math.pow(x - mouseX, 2) +
                Math.pow(y - mouseY, 2)
            );

            // Only change color for dots near the cursor (within 100 pixels)
            if (distance < 100) {
                // Use a darker blue with alpha based on distance
                ctx.fillStyle = '#1a4f8c'; // Darker blue color
                ctx.globalAlpha = 1 - (distance / 100);
            } else {
                ctx.fillStyle = isLightTheme ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.1)';
                ctx.globalAlpha = 1;
            }

            ctx.beginPath();
            ctx.arc(x, y, dotSize, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // Reset global alpha
    ctx.globalAlpha = 1;
}

// Add this event listener to track mouse movement
canvas.addEventListener('mousemove', (e) => {
    mouseX = e.offsetX;
    mouseY = e.offsetY;
    redrawCanvas();
});

function resizeCanvas() {
    canvas.width = window.innerWidth * 2;
    canvas.height = window.innerHeight * 2;
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    ctx.scale(2, 2);
    drawGrid(); // Draw grid first
    redrawCanvas(); // Then draw user content
}

window.addEventListener('resize', handleResize);

// Touch event handlers starts here
canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
        e.preventDefault();
        const touch = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        const mouseEvent = new MouseEvent('mousedown', {
            clientX: touch.clientX - rect.left,
            clientY: touch.clientY - rect.top
        });

        if (selectedTool === 'arrow') {
            isDrawing = true;
            startX = touch.clientX - rect.left;
            startY = touch.clientY - rect.top;
        }

        handleMouseDown(mouseEvent);
    } else if (e.touches.length === 2) {
        e.preventDefault();
        // Get initial distance between two fingers
        initialDistance = getTouchDistance(e.touches);
        initialZoom = currentZoom;
    }
});

canvas.addEventListener('touchmove', (e) => {
    if (e.touches.length === 1) {
        e.preventDefault();
        const touch = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        const mouseEvent = new MouseEvent('mousemove', {
            clientX: touch.clientX - rect.left,
            clientY: touch.clientY - rect.top
        });

        if (selectedTool === 'arrow' && isDrawing) {
            redrawCanvas();
            drawArrow(ctx, startX, startY, touch.clientX - rect.left, touch.clientY - rect.top);
        } else if (isPanning) {
            pan(mouseEvent);
        } else {
            handleMouseMove(mouseEvent);
        }
    } else if (e.touches.length === 2) {
        e.preventDefault();
        // Calculate new zoom level based on finger distance
        const currentDistance = getTouchDistance(e.touches);
        const zoomDelta = (currentDistance / initialDistance - 1) * 50;
        let newZoom = Math.min(Math.max(initialZoom + zoomDelta, 70), 200);

        if (newZoom !== currentZoom) {
            // Get center point between fingers
            const touchCenter = getTouchCenter(e.touches);
            const rect = canvas.getBoundingClientRect();
            const centerX = (touchCenter.x - rect.left);
            const centerY = (touchCenter.y - rect.top);

            // Apply zoom
            const zoomFactor = newZoom / currentZoom;
            currentZoom = newZoom;
            scale *= zoomFactor;

            // Transform elements around touch center
            elements.forEach(element => {
                element.x1 = centerX + (element.x1 - centerX) * zoomFactor;
                element.y1 = centerY + (element.y1 - centerY) * zoomFactor;
                if (element.x2 !== undefined) element.x2 = centerX + (element.x2 - centerX) * zoomFactor;
                if (element.y2 !== undefined) element.y2 = centerY + (element.y2 - centerY) * zoomFactor;
            });

            // Update zoom display and redraw
            zoomPercentage.textContent = Math.round(currentZoom) + '%';
            redrawCanvas();
        }
    }
});

canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();

    if (selectedTool === 'arrow' && isDrawing) {
        const lastTouch = e.changedTouches[0];
        isDrawing = false;
        elements.push({
            type: 'arrow',
            x1: startX,
            y1: startY,
            x2: lastTouch.clientX - rect.left,
            y2: lastTouch.clientY - rect.top,
            color: selectedColor,
            strokeWidth: selectedStrokeWidth
        });
        saveState();
        redrawCanvas();
    }

    const mouseEvent = new MouseEvent('mouseup', {});
    handleMouseUp(mouseEvent);
});

// Prevent all zooming gestures
canvas.addEventListener('gesturestart', (e) => {
    e.preventDefault();
});

canvas.addEventListener('gesturechange', (e) => {
    e.preventDefault();
});

canvas.addEventListener('gestureend', (e) => {
    e.preventDefault();
});
// Touch event handlers up to here

// Pinch zoom variables
let initialDistance = 0;
let initialZoom = 1;

zoomIn.addEventListener('click', () => {
    if (currentZoom >= 200) return; // Prevent zooming beyond 200%
    currentZoom = Math.min(currentZoom + 10, 200); // Limit zoom to 200%
    zoomPercentage.textContent = currentZoom + '%';

    const zoom = 1 + scaleFactor;
    scale *= zoom;

    // Get center of canvas
    const centerX = canvas.width / 4; // Divide by 4 because canvas is scaled 2x
    const centerY = canvas.height / 4;

    elements.forEach(element => {
        element.x1 = centerX + (element.x1 - centerX) * zoom;
        element.y1 = centerY + (element.y1 - centerY) * zoom;
        if (element.x2 !== undefined) element.x2 = centerX + (element.x2 - centerX) * zoom;
        if (element.y2 !== undefined) element.y2 = centerY + (element.y2 - centerY) * zoom;
    });
    redrawCanvas();
});

zoomOut.addEventListener('click', () => {
    if (currentZoom <= 70) return; // Prevent zooming below 70%
    currentZoom = Math.max(currentZoom - 10, 70); // Limit zoom to minimum 70%
    zoomPercentage.textContent = currentZoom + '%';

    const zoom = 1 - scaleFactor;
    scale *= zoom;

    // Get center of canvas
    const centerX = canvas.width / 4; // Divide by 4 because canvas is scaled 2x
    const centerY = canvas.height / 4;

    elements.forEach(element => {
        element.x1 = centerX + (element.x1 - centerX) * zoom;
        element.y1 = centerY + (element.y1 - centerY) * zoom;
        if (element.x2 !== undefined) element.x2 = centerX + (element.x2 - centerX) * zoom;
        if (element.y2 !== undefined) element.y2 = centerY + (element.y2 - centerY) * zoom;
    });
    redrawCanvas();
});

canvas.addEventListener('wheel', (e) => {
    if (e.ctrlKey) {
        e.preventDefault();
        const mouseX = e.offsetX;
        const mouseY = e.offsetY;
        const zoomingIn = e.deltaY < 0;

        // Check zoom limits
        if ((zoomingIn && currentZoom >= 200) || (!zoomingIn && currentZoom <= 70)) {
            return;
        }

        // Update current zoom
        currentZoom = zoomingIn ?
            Math.min(currentZoom + 10, 200) :
            Math.max(currentZoom - 10, 70);
        zoomPercentage.textContent = currentZoom + '%';

        const zoom = zoomingIn ? 1 + scaleFactor : 1 - scaleFactor;
        scale *= zoom;

        elements.forEach(element => {
            element.x1 = mouseX + (element.x1 - mouseX) * zoom;
            element.y1 = mouseY + (element.y1 - mouseY) * zoom;
            if (element.x2 !== undefined) element.x2 = mouseX + (element.x2 - mouseX) * zoom;
            if (element.y2 !== undefined) element.y2 = mouseY + (element.y2 - mouseY) * zoom;
        });

        redrawCanvas();
    }
});

canvas.addEventListener('mousedown', (e) => {
    handleMouseDown(e);
});

canvas.addEventListener('mousemove', (e) => {
    if (isPanning) {
        pan(e);
    } else {
        handleMouseMove(e);
    }
});

canvas.addEventListener('mouseup', (e) => {
    handleMouseUp(e);
});

// Replace the existing tool event listener section with this updated one
document.querySelectorAll('.tool, .undo-btn, .redo-btn, .delete-btn').forEach(tool => {
    tool.addEventListener('click', () => {
        if (tool.classList.contains('undo-btn')) {
            undo();
            return;
        }
        if (tool.classList.contains('redo-btn')) {
            redo();
            return;
        }
        if (tool.id === 'clear' || tool.classList.contains('delete-btn')) {
            elements = [];
            textInput.style.display = 'none';
            textInput.value = '';
            isWriting = false;
            redrawCanvas();
            selectTool('pointer');
            document.getElementById('pointer').click();
            saveState();
        } else if (tool.id === 'save') {
            saveWork();
        } else if (tool.id === 'open-sidebar') {
            sidebar.classList.toggle('open');
        } else if (tool.id === 'select') {
            selectedTool = 'select';
            document.querySelector('.tool.active')?.classList.remove('active');
            tool.classList.add('active');
        } else {
            document.querySelector('.tool.active')?.classList.remove('active');
            tool.classList.add('active');
            selectedTool = tool.id;
            updateCursorStyle();
        }
    });
});

// Update the undo/redo keyboard shortcut
window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'z') {
        e.preventDefault();
        document.querySelector('.undo-btn').click();
    } else if (e.ctrlKey && e.key === 'y') {
        e.preventDefault();
        document.querySelector('.redo-btn').click();
    } else if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        saveWork();
    } else if (e.ctrlKey && e.key === '+') {
        e.preventDefault();
        if (currentZoom < 200) {
            document.getElementById('zoom-in').click();
        }
    } else if (e.ctrlKey && e.key === '-') {
        e.preventDefault();
        if (currentZoom > 70) {
            document.getElementById('zoom-out').click();
        }
    }
});

canvas.addEventListener('mousemove', (e) => {
    if (selectedTool === 'eraser') {
        hoveredElement = elements.find(element =>
            element.type === 'pencil' &&
            isWithinEraserRadius(e.offsetX, e.offsetY, element)
        );
        redrawCanvas();
    } else {
        hoveredElement = null;
        redrawCanvas();
    }
});

canvas.addEventListener('mouseup', (e) => {
    if (selectedTool === 'eraser' && hoveredElement && hoveredElement.type === 'pencil') {
        elements = elements.filter(element => element !== hoveredElement);
        hoveredElement = null;
        redrawCanvas();
    }
});

function isWithinEraserRadius(x, y, element) {
    const eraserRadius = 20;
    const distance = Math.sqrt(
        Math.pow((element.x1 + element.x2) / 2 - x, 2) +
        Math.pow((element.y1 + element.y2) / 2 - y, 2)
    );
    return distance <= eraserRadius;
}

function handleMouseDown(e) {
    if (selectedTool === 'pointer') {
        const clickedX = e.offsetX;
        const clickedY = e.offsetY;
        selectedElement = getElementAtPosition(clickedX, clickedY);

        if (selectedElement) {
            isDragging = true;
            dragOffsetX = clickedX - selectedElement.x1;
            dragOffsetY = clickedY - selectedElement.y1;
            canvas.style.cursor = 'move';
            return;
        }
    }
    if (selectedTool === 'select') {
        const clickedX = e.offsetX;
        const clickedY = e.offsetY;
        selectedElement = getElementAtPosition(clickedX, clickedY);

        if (selectedElement) {
            offsetX = clickedX - selectedElement.x1;
            offsetY = clickedY - selectedElement.y1;
        } else {
            isPanning = true;
            startPanX = e.clientX;
            startPanY = e.clientY;
        }
    } else if (selectedTool === 'pointer') {
        const clickedX = e.offsetX;
        const clickedY = e.offsetY;
        selectedElement = getElementAtPosition(clickedX, clickedY);

        if (selectedElement && (selectedElement.type === 'rectangle' || selectedElement.type === 'circle' || selectedElement.type === 'triangle' || selectedElement.type === 'pentagon' || selectedElement.type === 'hexagon' || selectedElement.type === 'star' || selectedElement.type === 'line' || selectedElement.type === 'diamond')) {
            isDragging = true;
            dragOffsetX = clickedX - selectedElement.x1;
            dragOffsetY = clickedY - selectedElement.y1;
        }
    } else if (selectedTool === 'arrow') {
        isDrawing = true;
        startX = e.offsetX;
        startY = e.offsetY;
    } else if (selectedTool === 'fill-color') {
        const clickedX = e.offsetX;
        const clickedY = e.offsetY;
        const elementToFill = getElementAtPosition(clickedX, clickedY);

        if (elementToFill) {
            elementToFill.fillColor = selectedColor;
            saveState();
            redrawCanvas();
            // Switch to pointer tool after filling
            selectTool('pointer');
            document.getElementById('pointer').click();
        }
        return;
    } else {
        startDrawing(e);
    }
    if (selectedTool === 'clear') {
        clearStickyNotes();
    }
}

function handleMouseMove(e) {
    if (isDragging && selectedTool === 'pointer' && selectedElement) {
        const newX = e.offsetX;
        const newY = e.offsetY;

        // Calculate the movement delta
        const dx = newX - dragOffsetX - selectedElement.x1;
        const dy = newY - dragOffsetY - selectedElement.y1;

        // Move both points for all shape types
        selectedElement.x1 += dx;
        selectedElement.y1 += dy;
        selectedElement.x2 += dx;
        selectedElement.y2 += dy;

        redrawCanvas();
        return;
    }
    if (selectedElement) {
        const newX = e.offsetX;
        const newY = e.offsetY;

        if (selectedTool === 'pointer' && isDragging) {
            // Calculate the movement delta
            const dx = newX - dragOffsetX - selectedElement.x1;
            const dy = newY - dragOffsetY - selectedElement.y1;

            // Set target position for smooth animation
            targetPos = {
                x: selectedElement.x1 + dx,
                y: selectedElement.y1 + dy
            };

            if (!isAnimating) {
                isAnimating = true;
                lastTimestamp = performance.now();
                animateMove();
            }
        } else {
            // ...existing mouse move handling...
        }
    } else if (isPanning) {
        pan(e);
    } else if (isDragging && selectedTool === 'pointer') {
        const newX = e.offsetX;
        const newY = e.offsetY;

        const moveX = newX - dragOffsetX;
        const moveY = newY - dragOffsetY;

        selectedElement.x1 = moveX;
        selectedElement.y1 = moveY;
        selectedElement.x2 = moveX + (selectedElement.x2 - selectedElement.x1);
        selectedElement.y2 = moveY + (selectedElement.y2 - selectedElement.y1);

        redrawCanvas();
    } else if (isDrawing && selectedTool === 'arrow') {
        redrawCanvas();
        const context = canvas.getContext('2d');
        drawArrow(context, startX, startY, e.offsetX, e.offsetY);
    } else {
        draw(e);
    }
}

function animateMove() {
    const currentTime = performance.now();
    const elapsed = currentTime - lastTimestamp;
    const progress = Math.min(elapsed / ANIMATION_DURATION, 1);

    // Calculate intermediate position
    const currentX = selectedElement.x1 + (targetPos.x - selectedElement.x1) * progress;
    const currentY = selectedElement.y1 + (targetPos.y - selectedElement.y1) * progress;

    // Move the element
    const dx = currentX - selectedElement.x1;
    const dy = currentY - selectedElement.y1;

    selectedElement.x1 = currentX;
    selectedElement.y1 = currentY;
    if (selectedElement.x2 !== undefined) selectedElement.x2 += dx;
    if (selectedElement.y2 !== undefined) selectedElement.y2 += dy;

    redrawCanvas();

    if (progress < 1) {
        animationFrameId = requestAnimationFrame(animateMove);
    } else {
        isAnimating = false;
        cancelAnimationFrame(animationFrameId);
    }
}

function handleMouseUp(e) {
    if (isDragging && selectedTool === 'pointer') {
        isDragging = false;
        selectedElement = null;
        saveState();
        updateCursorStyle();
        return;
    }
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        isAnimating = false;
    }

    if (selectedElement) {
        selectedElement = null;
    } else if (isPanning) {
        isPanning = false;
    } else if (isDragging && selectedTool === 'pointer') {
        isDragging = false;
        saveState(); // Save state after dragging completes
    } else if (isDrawing && selectedTool === 'arrow') {
        isDrawing = false;
        elements.push({
            type: 'arrow',
            x1: startX,
            y1: startY,
            x2: e.offsetX,
            y2: e.offsetY,
            color: selectedColor,
            strokeWidth: selectedStrokeWidth  // Add strokeWidth here
        });
        saveState();
        redrawCanvas();

        // Switch to pointer tool after drawing arrow
        selectTool('pointer');
    } else if (selectedTool !== 'eraser') { // Add this condition to prevent switching from eraser
        stopDrawing();
        saveState();
    } else {
        stopDrawing();
        saveState();
    }
}

function startDrawing(e) {
    isDrawing = true;
    [lastX, lastY] = [e.offsetX, e.offsetY];
    if ((selectedTool === 'text') && !isWriting) {
        showTextInput(e.offsetX, e.offsetY);
    } else {
        currentElement = {
            type: selectedTool,
            x1: lastX,
            y1: lastY,
            color: selectedColor,
            roughness: 0.5,
            strokeWidth: selectedStrokeWidth,
            fillStyle: 'solid',
            fillWeight: 0.5,
            opacity: currentOpacity // Add this line
        };
    }
}

function draw(e) {
    if (!isDrawing) return;

    const currentX = e.offsetX;
    const currentY = e.offsetY; // Define currentY

    if (selectedTool === 'pencil') {
        // Use quadratic curves for smoother lines
        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.quadraticCurveTo(lastX, lastY, currentX, currentY);
        ctx.strokeStyle = selectedColor;
        ctx.lineWidth = selectedStrokeWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();

        elements.push({
            type: 'pencil',
            x1: lastX,
            y1: lastY,
            x2: currentX,
            y2: currentY,
            color: selectedColor,
            strokeWidth: selectedStrokeWidth,
            roughness: 0.3
        });

        [lastX, lastY] = [currentX, currentY];
    } else if (selectedTool === 'eraser') {
        const eraserRadius = 20;
        elements = elements.filter(element => {
            if (element.type !== 'pencil') return true;

            const distance = Math.sqrt(
                Math.pow((element.x1 + element.x2) / 2 - currentX, 2) +
                Math.pow((element.y1 + element.y2) / 2 - currentY, 2)
            );
            return distance > eraserRadius;
        });
    } else if (currentElement) {
        currentElement.x2 = currentX;
        currentElement.y2 = currentY;
    }

    if (selectedTool === 'line') {
        showAngle(lastX, lastY, currentX, currentY);
    }

    if (selectedTool === 'rectangle') {
        // Update only x2 and y2 for the current element
        if (currentElement) {
            currentElement.x2 = currentX;
            currentElement.y2 = currentY;
        }
        redrawCanvas();
        return;
    }

    redrawCanvas();
}

function stopDrawing() {
    if (!isDrawing) return;
    isDrawing = false;
    angleInfo.style.display = 'none';

    if (currentElement && selectedTool !== 'pencil' && selectedTool !== 'eraser' && selectedTool !== 'text') {
        elements.push(currentElement);
    }
    currentElement = null;
    saveState();
    redrawCanvas();

    // Switch to pointer tool after drawing, except for pencil, eraser and colorPicker
    if (selectedTool !== 'pencil' && selectedTool !== 'eraser' && selectedTool !== 'colorPicker') {
        selectTool('pointer');
    }
}

function redrawCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawGrid(); // This will handle the animation

    elements.forEach(element => {
        if (element === hoveredElement && element.type === 'pencil') {
            ctx.globalAlpha = 0.3;
            drawElement(element);
            ctx.globalAlpha = 1;
        } else {
            drawElement(element);
        }
    });

    if (currentElement) {
        drawElement(currentElement);
    }
}

function showEraserRadius(e) {
    redrawCanvas();
    const eraserRadius = 20;
    ctx.beginPath();
    ctx.arc(e.offsetX, e.offsetY, eraserRadius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(69, 69, 69, 0.5)';
    ctx.fillStyle = 'rgba(69, 69, 69, 0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fill();
}

function drawElement(element) {
    const options = {
        stroke: element.color,
        roughness: element.roughness || 0.5,
        strokeWidth: element.strokeWidth || selectedStrokeWidth, // Use element's strokeWidth if available
        fillStyle: 'solid',
        fillWeight: 0.5,
        bowing: 0.5,
        curveFitting: 1,
        simplification: 0.5,
        fill: element.fillColor || 'transparent' // Add this line
    };

    // Set global alpha for opacity
    ctx.globalAlpha = element.opacity || 1;

    switch (element.type) {
        case 'pencil':
            drawSmoothLine(ctx, element.x1, element.y1, element.x2, element.y2, options);
            break;
        case 'line':
            drawFluidLine(ctx, element.x1, element.y1, element.x2, element.y2, options);
            break;
        case 'rectangle':
            const width = element.x2 - element.x1;
            const height = element.y2 - element.y1;
            drawRoundedRectangle(ctx, element.x1, element.y1, width, height, 10, options);
            if (element.fillColor) {
                ctx.fillStyle = element.fillColor;
                ctx.fill();
            }
            return;
        case 'circle':
            drawSmoothCircle(ctx, element.x1, element.y1, element.x2, element.y2, options);
            if (element.fillColor) {
                ctx.fillStyle = element.fillColor;
                ctx.fill();
            }
            break;
        case 'text':
            const scaledFontSize = Math.round(25 * (element.textWidth || 1) * (currentZoom / 100));
            ctx.font = `${scaledFontSize}px lato, sans-serif`;
            ctx.fillStyle = element.color;
            if (element.text !== undefined) {
                const lines = element.text.split('\n');
                const lineHeight = scaledFontSize * 1.2;
                lines.forEach((line, index) => {
                    ctx.fillText(
                        line,
                        element.x1 * (currentZoom / 100),
                        (element.y1 + index * lineHeight) * (currentZoom / 100)
                    );
                });
            }
            break;
        case 'triangle':
            drawPolygon(ctx, element.x1, element.y1, element.x2, element.y2, 3, options);
            break;
        case 'pentagon':
            drawPolygon(ctx, element.x1, element.y1, element.x2, element.y2, 5, options);
            break;
        case 'star':
            drawStar(ctx, element.x1, element.y1, element.x2, element.y2, options);
            break;
        case 'diamond':
            drawDiamond(ctx, element.x1, element.y1, element.x2, element.y2, options);
            break;
        case 'hexagon':
            drawPolygon(ctx, element.x1, element.y1, element.x2, element.y2, 6, options);
            break;
        case 'heart':
            drawHeart(ctx, element.x1, element.y1, element.x2, element.y2, options);
            break;
        case 'parallelogram':
            drawParallelogram(ctx, element.x1, element.y1, element.x2, element.y2, options);
            break;
        case 'arrowhead':
            drawArrowhead(ctx, element.x1, element.y1, element.x2, element.y2, options);
            break;
        case 'plus':
            drawPlus(ctx, element.x1, element.y1, element.x2, element.y2, options);
            break;
        case 'cross':
            drawCross(ctx, element.x1, element.y1, element.x2, element.y2, options);
            break;
        case 'chevron':
            drawChevron(ctx, element.x1, element.y1, element.x2, element.y2, options);
            break;
        case 'octagon':
            drawPolygon(ctx, element.x1, element.y1, element.x2, element.y2, 8, options);
            break;
    }

    // Reset global alpha
    ctx.globalAlpha = 1;
}

// New function to draw fluid lines with rounded ends
function drawFluidLine(ctx, x1, y1, x2, y2, options) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = options.stroke;
    ctx.lineWidth = options.strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
}

function drawSmoothLine(ctx, x1, y1, x2, y2, options) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo(x1, y1, x2, y2);
    ctx.strokeStyle = options.stroke;
    ctx.lineWidth = options.strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
}

function drawPolygon(ctx, x1, y1, x2, y2, sides, options) {
    const radius = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)) / 2;
    const centerX = (x1 + x2) / 2;
    const centerY = (y1 + y2) / 2;
    const angle = (2 * Math.PI) / sides;

    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
        const x = centerX + radius * Math.cos(i * angle);
        const y = centerY + radius * Math.sin(i * angle);
        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    }
    ctx.closePath();
    if (options.fill !== 'transparent') {
        ctx.fillStyle = options.fill;
        ctx.fill();
    }
    ctx.strokeStyle = options.stroke;
    ctx.lineWidth = options.strokeWidth;
    ctx.stroke();
}

function drawStar(ctx, x1, y1, x2, y2, options) {
    const outerRadius = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)) / 2;
    const innerRadius = outerRadius / 2.5;
    const centerX = (x1 + x2) / 2;
    const centerY = (y1 + y2) / 2;
    const angle = Math.PI / 5;

    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
        const radius = i % 2 === 0 ? outerRadius : innerRadius;
        const x = centerX + radius * Math.cos(i * angle);
        const y = centerY + radius * Math.sin(i * angle);
        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    }
    ctx.closePath();
    if (options.fill !== 'transparent') {
        ctx.fillStyle = options.fill;
        ctx.fill();
    }
    ctx.strokeStyle = options.stroke;
    ctx.lineWidth = options.strokeWidth;
    ctx.stroke();
}

function drawDiamond(ctx, x1, y1, x2, y2, options) {
    const width = Math.abs(x2 - x1);
    const height = Math.abs(y2 - y1);
    const centerX = (x1 + x2) / 2;
    const centerY = (y1 + y2) / 2;

    ctx.beginPath();
    ctx.moveTo(centerX, y1);
    ctx.lineTo(x2, centerY);
    ctx.lineTo(centerX, y2);
    ctx.lineTo(x1, centerY);
    ctx.closePath();
    if (options.fill !== 'transparent') {
        ctx.fillStyle = options.fill;
        ctx.fill();
    }
    ctx.strokeStyle = options.stroke;
    ctx.lineWidth = options.strokeWidth;
    ctx.stroke();
}

function drawRoundedRectangle(ctx, x, y, width, height, radius, options) {
    // Calculate actual coordinates for any direction
    const startX = Math.min(x, x + width);
    const startY = Math.min(y, y + height);
    const rectWidth = Math.abs(width);
    const rectHeight = Math.abs(height);

    // Ensure radius doesn't exceed half of smallest dimension
    const maxRadius = Math.min(rectWidth, rectHeight) / 2;
    const cornerRadius = Math.min(radius, maxRadius);

    ctx.beginPath();
    ctx.moveTo(startX + cornerRadius, startY);

    // Top edge
    ctx.lineTo(startX + rectWidth - cornerRadius, startY);
    ctx.quadraticCurveTo(startX + rectWidth, startY, startX + rectWidth, startY + cornerRadius);

    // Right edge
    ctx.lineTo(startX + rectWidth, startY + rectHeight - cornerRadius);
    ctx.quadraticCurveTo(startX + rectWidth, startY + rectHeight, startX + rectWidth - cornerRadius, startY + rectHeight);

    // Bottom edge
    ctx.lineTo(startX + cornerRadius, startY + rectHeight);
    ctx.quadraticCurveTo(startX, startY + rectHeight, startX, startY + rectHeight - cornerRadius);

    // Left edge
    ctx.lineTo(startX, startY + cornerRadius);
    ctx.quadraticCurveTo(startX, startY, startX + cornerRadius, startY);

    ctx.closePath();
    ctx.strokeStyle = options.stroke;
    ctx.lineWidth = options.strokeWidth;
    ctx.lineCap = 'square';
    ctx.lineJoin = 'miter';
    ctx.miterLimit = 2;
    ctx.stroke();
}

function drawSmoothCircle(ctx, x1, y1, x2, y2, options) {
    const width = Math.abs(x2 - x1);
    const height = Math.abs(y2 - y1);
    const diameter = Math.max(width, height);
    const centerX = x1 + width / 2;
    const centerY = y1 + height / 2;

    ctx.beginPath();
    ctx.arc(centerX, centerY, diameter / 2, 0, Math.PI * 2);
    ctx.strokeStyle = options.stroke;
    ctx.lineWidth = options.strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
}

function pan(e) {
    const dx = (e.clientX - startPanX) / 2;
    const dy = (e.clientY - startPanY) / 2;
    elements.forEach(element => {
        element.x1 += dx;
        element.y1 += dy;
        if (element.x2 !== undefined) element.x2 += dx;
        if (element.y2 !== undefined) element.y2 += dy;
    });
    startPanX = e.clientX;
    startPanY = e.clientY;
    redrawCanvas();
}

function showAngle(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    let angle = Math.atan2(dy, dx) * 180 / Math.PI;
    angle = (angle + 360) % 360;
    angleInfo.textContent = `Angle: ${angle.toFixed(1)}°`;
    angleInfo.style.display = 'block';
}

function showTextInput(x, y) {
    isWriting = true;
    textInput.value = '';
    textInput.style.display = 'block';
    // Scale font size with zoom and selected width
    const baseSize = 25;
    const widthMultiplier = selectedStrokeWidth / 4; // 4px is our base width
    const scaledFontSize = Math.round(baseSize * widthMultiplier * (currentZoom / 100));
    textInput.style.fontSize = `${scaledFontSize}px`;
    textInput.style.color = selectedColor;
    textInput.style.backgroundColor = 'transparent';
    textInput.style.fontFamily = 'lato, sans-serif';
    textInput.style.caretColor = selectedColor;
    textInput.style.left = `${x * (currentZoom / 100)}px`;
    textInput.style.top = `${(y - 20) * (currentZoom / 100)}px`;
    textInput.style.transform = `scale(${currentZoom / 100})`;
    textInput.style.transformOrigin = 'top left';
    setTimeout(() => textInput.focus(), 0);
}

canvas.addEventListener('click', (e) => {
    if (isWriting) {
        const text = textInput.value;
        if (text && text.trim() !== '') {
            elements.push({
                type: 'text',
                x1: parseInt(textInput.style.left) / (currentZoom / 100),
                y1: (parseInt(textInput.style.top) + 20) / (currentZoom / 100),
                text: text,
                color: selectedColor,
                zoom: currentZoom // Store the zoom level when text was created
            });
            redrawCanvas();
        } else {
            textInput.value = '';
        }
        textInput.style.display = 'none';
        isWriting = false;
    }
});

// Add after the existing canvas click event listener
canvas.addEventListener('dblclick', (e) => {
    const clickedX = e.offsetX;
    const clickedY = e.offsetY;
    const clickedElement = elements.find(element =>
        element.type === 'text' &&
        clickedX >= element.x1 * (currentZoom / 100) - 5 &&
        clickedX <= element.x1 * (currentZoom / 100) + getTextWidth(element.text) + 5 &&
        clickedY >= element.y1 * (currentZoom / 100) - 25 &&
        clickedY <= element.y1 * (currentZoom / 100) + 5
    );

    if (clickedElement) {
        // Show text input at the clicked text element's position
        isWriting = true;
        textInput.value = clickedElement.text;
        textInput.style.display = 'block';
        const scaledFontSize = Math.round(25 * (currentZoom / 100));
        textInput.style.fontSize = `${scaledFontSize}px`;
        textInput.style.color = clickedElement.color;
        textInput.style.backgroundColor = 'transparent';
        textInput.style.fontFamily = 'lato, sans-serif';
        textInput.style.caretColor = clickedElement.color;
        textInput.style.left = `${clickedElement.x1 * (currentZoom / 100)}px`;
        textInput.style.top = `${(clickedElement.y1 - 20) * (currentZoom / 100)}px`;
        textInput.style.transform = `scale(${currentZoom / 100})`;
        textInput.style.transformOrigin = 'top left';

        // Remove the old text element
        elements = elements.filter(el => el !== clickedElement);
        redrawCanvas();

        // Focus the text input
        setTimeout(() => {
            textInput.focus();
            // Place cursor at the end of text
            textInput.setSelectionRange(textInput.value.length, textInput.value.length);
        }, 0);
    }
});

// Add this helper function to calculate text width
function getTextWidth(text) {
    ctx.font = `25px lato, sans-serif`;
    return ctx.measureText(text).width;
}

// Update the existing click handler for text input
canvas.addEventListener('click', (e) => {
    if (isWriting) {
        const text = textInput.value;
        if (text && text.trim() !== '') {
            elements.push({
                type: 'text',
                x1: parseInt(textInput.style.left) / (currentZoom / 100),
                y1: (parseInt(textInput.style.top) + 20) / (currentZoom / 100),
                text: text,
                color: selectedColor,
                zoom: currentZoom,
                textWidth: selectedStrokeWidth / 4 // Store the text width multiplier
            });
            redrawCanvas();
        }
        textInput.style.display = 'none';
        isWriting = false;
        // Switch back to pointer tool after editing
        selectTool('pointer');
    }
});

function adjustSize() {
    textInput.style.width = 'auto';
    textInput.style.height = 'auto';
    textInput.style.height = `${textInput.scrollHeight}px`;
    textInput.style.width = `${textInput.scrollWidth}px`;
}

textInput.addEventListener('input', adjustSize);

function saveWork() {
    const name = prompt("Enter a name for this work:");
    if (name) {
        const savedWorks = JSON.parse(localStorage.getItem('savedWorks') || '[]');
        savedWorks.push({ name, elements: JSON.parse(JSON.stringify(elements)) });
        localStorage.setItem('savedWorks', JSON.stringify(savedWorks));
    }
}

function loadWork(index) {
    const savedWorks = JSON.parse(localStorage.getItem('savedWorks') || '[]');
    if (savedWorks[index]) {
        elements = JSON.parse(JSON.stringify(savedWorks[index].elements));
        redrawCanvas();
        sidebar.classList.remove('open');
    }
}

function deleteWork(index) {
    const savedWorks = JSON.parse(localStorage.getItem('savedWorks') || '[]');
    savedWorks.splice(index, 1);
    localStorage.setItem('savedWorks', JSON.stringify(savedWorks));
}

function handleResize() {
    resizeCanvas();
}

function updateCursorStyle() {
    if (selectedTool === 'select') {
        canvas.style.cursor = 'grab';
    } else if (selectedTool === 'text') {
        canvas.style.cursor = 'text';
    } else if (selectedTool === 'pointer') {
        canvas.style.cursor = 'move';
    } else if (selectedTool === 'fill-color') {
        canvas.style.cursor = 'crosshair';
    } else {
        canvas.style.cursor = 'crosshair';
    }
}

function drawArrow(context, fromX, fromY, toX, toY, strokeWidth = selectedStrokeWidth, color = selectedColor) {
    const headLength = Math.min(20, Math.sqrt(Math.pow(toX - fromX, 2) + Math.pow(toY - fromY, 2)) / 3);
    const dx = toX - fromX;
    const dy = toY - fromY;
    const angle = Math.atan2(dy, dx);

    // Draw the shaft
    context.beginPath();
    context.moveTo(fromX, fromY);
    context.lineTo(toX, toY);
    context.strokeStyle = color;
    context.lineWidth = strokeWidth;
    context.lineCap = 'round';
    context.stroke();

    // Draw the arrowhead
    context.beginPath();
    context.moveTo(toX, toY);
    context.lineTo(toX - headLength * Math.cos(angle - Math.PI / 6),
        toY - headLength * Math.sin(angle - Math.PI / 6));
    context.moveTo(toX, toY);
    context.lineTo(toX - headLength * Math.cos(angle + Math.PI / 6),
        toY - headLength * Math.sin(angle + Math.PI / 6));
    context.strokeStyle = color;
    context.lineWidth = strokeWidth;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.stroke();
}

function getElementAtPosition(x, y) {
    for (let i = elements.length - 1; i >= 0; i--) {
        const element = elements[i];
        if (isWithinBounds(element, x, y)) {
            canvas.style.cursor = 'move';
            return element;
        }
    }
    if (selectedTool === 'pointer') {
        canvas.style.cursor = 'move';
    }
    return null;
}

function isWithinBounds(element, x, y) {
    const tolerance = 5;
    switch (element.type) {
        case 'line':
        case 'arrow':
        case 'pencil':
            return pointToLineDistance(element.x1, element.y1, element.x2, element.y2, x, y) < tolerance;
        case 'rectangle':
            const minX = Math.min(element.x1, element.x2);
            const maxX = Math.max(element.x1, element.x2);
            const minY = Math.min(element.y1, element.y2);
            const maxY = Math.max(element.y1, element.y2);
            return x >= minX && x <= maxX && y >= minY && y <= maxY;
        case 'circle':
            const radius = Math.abs(element.x2 - element.x1) / 2;
            const centerX = element.x1 + (element.x2 - element.x1) / 2;
            const centerY = element.y1 + (element.y2 - element.y1) / 2;
            const distFromCenter = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));
            return distFromCenter <= radius;
        case 'triangle':
        case 'pentagon':
        case 'hexagon':
        case 'star':
        case 'diamond':
            const boundingRadius = Math.max(
                Math.abs(element.x2 - element.x1),
                Math.abs(element.y2 - element.y1)
            ) / 2;
            const shapeCenterX = (element.x1 + element.x2) / 2;
            const shapeCenterY = (element.y1 + element.y2) / 2;
            return Math.sqrt(Math.pow(x - shapeCenterX, 2) + Math.pow(y - shapeCenterY, 2)) <= boundingRadius;
        case 'text':
            return x >= element.x1 && x <= element.x1 + 100 && y >= element.y1 - 20 && y <= element.y1;
        case 'heart':
        case 'parallelogram':
        case 'arrowhead':
        case 'plus':
        case 'cross':
        case 'octagon':
            const boundingBox = {
                minX: Math.min(element.x1, element.x2),
                maxX: Math.max(element.x1, element.x2),
                minY: Math.min(element.y1, element.y2),
                maxY: Math.max(element.y1, element.y2)
            };
            // Add padding for easier selection
            boundingBox.minX -= tolerance;
            boundingBox.maxX += tolerance;
            boundingBox.minY -= tolerance;
            boundingBox.maxY += tolerance;
            return x >= boundingBox.minX && x <= boundingBox.maxX && y >= boundingBox.minY && y <= boundingBox.maxY;
        default:
            return false;
    }
}

function pointToLineDistance(x1, y1, x2, y2, px, py) {
    const A = px - x1;
    const B = py - y1;
    const C = x2 - x1;
    const D = y2 - y1;
    const dot = A * C + B * D;
    const len_sq = C * C + D * D;
    const param = len_sq !== 0 ? dot / len_sq : -1;
    let xx, yy;

    if (param < 0) {
        xx = x1;
        yy = y1;
    } else if (param > 1) {
        xx = x2;
        yy = y2;
    } else {
        xx = x1 + param * C;
        yy = y1 + param * D;
    }

    const dx = px - xx;
    const dy = py - yy;
    return Math.sqrt(dx * dx + dy * dy);
}

function saveState() {
    if (undoStack.length >= maxHistorySize) {
        undoStack.shift(); // Remove the oldest state if max size is reached
    }
    undoStack.push([...elements]);
    redoStack = [];
}

function undo() {
    if (undoStack.length > 0) {
        redoStack.push([...elements]);
        elements = undoStack.pop();
        redrawCanvas();
    }
}

function redo() {
    if (redoStack.length > 0) {
        undoStack.push([...elements]);
        elements = redoStack.pop();
        redrawCanvas();
    }
}

window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'z') {
        e.preventDefault();
        undo();
    } else if (e.ctrlKey && e.key === 'y') {
        e.preventDefault();
        redo();
    } else if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        saveWork();
    } else if (e.ctrlKey && e.key === '+') {
        e.preventDefault();
        if (currentZoom < 200) {
            document.getElementById('zoom-in').click();
        }
    } else if (e.ctrlKey && e.key === '-') {
        e.preventDefault();
        if (currentZoom > 70) {
            document.getElementById('zoom-out').click();
        }
    }
});

const themeBtn = document.getElementById('theme-btn');
const themeIcon = themeBtn.querySelector('ion-icon');

// Check for saved theme preference
const currentTheme = localStorage.getItem('theme') || 'dark';
if (currentTheme === 'light') {
    document.body.classList.add('light-theme');
    themeIcon.setAttribute('name', 'sunny-outline');
    selectedColor = '#000000';
} else {
    themeIcon.setAttribute('name', 'moon-outline');
    selectedColor = '#ffffff';
}

// Theme toggle functionality
themeBtn.addEventListener('click', () => {
    document.body.classList.toggle('light-theme');

    if (document.body.classList.contains('light-theme')) {
        localStorage.setItem('theme', 'light');
        themeIcon.setAttribute('name', 'sunny-outline');
        selectedColor = '#000000';
        switchElementColors();
    } else {
        localStorage.setItem('theme', 'dark');
        themeIcon.setAttribute('name', 'moon-outline');
        selectedColor = '#ffffff';
        switchElementColors();
    }

    redrawCanvas(); // This will redraw the grid with the new theme color
});

// Modify the invertColor function to only handle black and white
function invertColor(color) {
    if (color.toLowerCase() === '#ffffff' || color === 'rgb(255, 255, 255)') {
        return '#000000';
    } else if (color.toLowerCase() === '#000000' || color === 'rgb(0, 0, 0)') {
        return '#ffffff';
    }
    return color; // Leave other colors unchanged
}

// Update the switchElementColors function to only switch black/white colors
function switchElementColors() {
    elements.forEach(element => {
        if (element.color === '#000000' || element.color === '#ffffff' ||
            element.color === 'rgb(0, 0, 0)' || element.color === 'rgb(255, 255, 255)') {
            element.color = invertColor(element.color);
        }
        if (element.fillColor === '#000000' || element.fillColor === '#ffffff' ||
            element.fillColor === 'rgb(0, 0, 0)' || element.fillColor === 'rgb(255, 255, 255)') {
            element.fillColor = invertColor(element.fillColor);
        }
    });
    redrawCanvas();
}

window.addEventListener('resize', handleResize);

handleResize();
updateCursorStyle();


//more tools trigger toolbar open and close
function toggleMainToolbar2() {
    const toolbar2 = document.getElementById('main-toolbar2');
    toolbar2.style.display = toolbar2.style.display === 'none' ? 'block' : 'none';
}

// Save all data to local storage
function saveAllData() {
    const data = {
        elements,
        selectedTool,
        selectedColor,
        selectedStrokeWidth,
        currentZoom,
        scale
    };
    localStorage.setItem('inkFlowData', JSON.stringify(data));
}

// Load all data from local storage
function loadAllData() {
    const data = JSON.parse(localStorage.getItem('inkFlowData'));
    if (data) {
        elements = data.elements || [];
        selectedTool = data.selectedTool || 'pencil';
        selectedColor = data.selectedColor || '#ffffff';
        // selectedStrokeWidth = data.selectedStrokeWidth || 3;
        currentZoom = data.currentZoom || 100;
        scale = data.scale || 1;

        redrawCanvas();
        updateCursorStyle();
        zoomPercentage.textContent = currentZoom + '%';
    }
}

//KEYBOARD MAPPING FOR ALL TOOLS
document.addEventListener('keydown', handleKeyDown);

function handleKeyDown(event) {
    // If text input is visible or text tool is active, don't handle keyboard shortcuts
    if (textInput.style.display === 'block' || isWriting || selectedTool === 'text') {
        return;
    }

    // Convert key to lowercase for case-insensitive comparison
    const key = event.key.toLowerCase();

    // Mapping of keys to tools
    if (key === 'x' || key === '1') {
        selectTool('select');
        document.getElementById('select').click();
    }
    if (key === 'y' || key === '2') {
        selectTool('pointer');
        document.getElementById('pointer').click();
    }
    if (key === 'r' || key === '3') {
        selectTool('rectangle');
        document.getElementById('rectangle').click();
    }
    if (key === 'c' || key === '4') {
        selectTool('circle');
        document.getElementById('circle').click();
    }
    if (key === 'a' || key === '5') {
        selectTool('arrowhead');
        document.getElementById('arrowhead').click();
    }
    if (key === 'p' || key === '6') {
        selectTool('pencil');
        document.getElementById('pencil').click();
    }
    if (key === 'e' || key === '7') {
        selectTool('eraser');
        document.getElementById('eraser').click();
    }
    if (key === 't' || key === '8') {
        selectTool('text');
        document.getElementById('text').click();
    }
    // Theme toggle
    if (event.key === 'q' || event.key === 'Q' || event.key === '*') {
        document.getElementById('theme-btn').click();
    }

    // Undo/Redo
    if (event.ctrlKey && (event.key === 'z' || event.key === 'Z')) {
        event.preventDefault();
        document.getElementById('undo').click();
    }
    if (event.ctrlKey && (event.key === 'y' || event.key === 'Y')) {
        event.preventDefault();
        document.getElementById('redo').click();
    }

    // Clear all
    if (event.ctrlKey && (event.key === 'd' || event.key === 'D')) {
        event.preventDefault();
        document.getElementById('clear').click();
    }

    if (key === 'm' || key === '0') toggleMainToolbar2();

    // Add search and image shortcuts
    if (key === '/') {
        event.preventDefault(); // Prevent browser's find feature
        document.getElementById('search').click();
    }
    if (key === 'i' || key === '9') {
        document.getElementById('image').click();
    }
}

function selectTool(toolId) {
    // Remove active class from all tools
    document.querySelectorAll('.tool').forEach(tool => tool.classList.remove('active'));

    // Try to find the tool in main toolbar first
    let toolElement = document.getElementById(toolId);

    // If not found in main toolbar, look in shape grid
    if (!toolElement) {
        toolElement = document.querySelector(`.shape-grid .tool[id="${toolId}"]`);
    }

    if (toolElement) {
        toolElement.classList.add('active');
    }

    selectedTool = toolId;

    if (toolId !== 'text') {
        document.addEventListener('keydown', handleKeyDown);
    } else {
        document.removeEventListener('keydown', handleKeyDown);
    }
}

// Save data on window unload
window.addEventListener('beforeunload', saveAllData);

// Load data on window load
window.addEventListener('load', () => {
    loadAllData();

    // Add width button event listeners
    document.querySelectorAll('.width-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove active class from all width buttons
            document.querySelectorAll('.width-btn').forEach(b => b.classList.remove('active'));
            // Add active class to clicked button
            btn.classList.add('active');
            // Update stroke width
            selectedStrokeWidth = parseInt(btn.dataset.width);

            // Update text input size if it's visible
            if (textInput.style.display === 'block') {
                const baseSize = 25;
                const widthMultiplier = selectedStrokeWidth / 4;
                const scaledFontSize = Math.round(baseSize * widthMultiplier * (currentZoom / 100));
                textInput.style.fontSize = `${scaledFontSize}px`;
            }
        });
    });

    // Remove all collapse tab related event listeners and localStorage handling

    // Save opacity state
    const opacitySlider = document.getElementById('opacity-slider');

    opacitySlider.addEventListener('input', (e) => {
        currentOpacity = e.target.value / 100;

        // Update the opacity of the most recently drawn element
        if (elements.length > 0) {
            const lastElement = elements[elements.length - 1];
            lastElement.opacity = currentOpacity;
            redrawCanvas();
        }
    });

    // Add color button event listeners
    document.querySelectorAll('.color-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            selectedColor = btn.style.backgroundColor;
            // Remove active class from all color buttons
            document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
            // Add active class to clicked button
            btn.classList.add('active');

            // Update text input color if it's visible
            if (textInput.style.display === 'block') {
                textInput.style.color = selectedColor;
                textInput.style.caretColor = selectedColor;
            }

            // If there's a selected element, update its color
            if (selectedElement) {
                selectedElement.color = selectedColor;
                redrawCanvas();
            }
        });
    });

    // Add floating tab collapse functionality
    const floatingTab = document.getElementById('floating-tab');
    const collapseButton = document.getElementById('collapse-tab');

    collapseButton.addEventListener('click', () => {
        floatingTab.classList.toggle('collapsed');
    });

    // Save collapse state
    const savedCollapseState = localStorage.getItem('floatingTabCollapsed');
    if (savedCollapseState === 'true') {
        floatingTab.classList.add('collapsed');
    }

    // Update collapse state in storage when changed
    const observer = new MutationObserver(() => {
        localStorage.setItem('floatingTabCollapsed', floatingTab.classList.contains('collapsed'));
    });

    observer.observe(floatingTab, {
        attributes: true,
        attributeFilter: ['class']
    });
});

// Search functionality
const searchDropdown = document.getElementById('search-dropdown');
const searchInput = document.getElementById('search-input');
const searchResults = document.querySelector('.search-results');
const closeSearch = document.getElementById('close-search');
const searchBtn = document.getElementById('search');

// Extract tools and colors from HTML
function extractSearchableItems() {
    const toolButtons = document.querySelectorAll('#main-toolbar .tool');
    const colorButtons = document.querySelectorAll('.color-grid .color-btn');

    const items = [];

    // Extract tools
    toolButtons.forEach(button => {
        if (button.id && button.id !== 'search') {
            items.push({
                type: 'tool',
                id: button.id,
                name: button.title?.split('--')[0]?.trim() || button.id,
                icon: button.innerHTML.split('<span')[0],
                shortcut: button.title?.split('--')[1]?.trim() || ''
            });
        }
    });

    // Extract colors
    colorButtons.forEach(button => {
        const color = button.style.backgroundColor;
        const colorName = getColorName(color);
        items.push({
            type: 'color',
            name: colorName,
            value: rgb2hex(color)
        });
    });

    return items;
}

// Helper function to convert RGB to HEX
function rgb2hex(rgb) {
    if (rgb.startsWith('#')) return rgb;
    return '#' + rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/)
        .slice(1)
        .map(n => parseInt(n, 10).toString(16).padStart(2, '0'))
        .join('');
}

// Helper function to get color names
function getColorName(color) {
    const colorMap = {
        '#ff0000': 'Red',
        '#00ff00': 'Green',
        '#ffff00': 'Yellow',
        '#ff00ff': 'Magenta',
        '#00ffff': 'Cyan',
        '#ff8800': 'Orange',
        '#8800ff': 'Purple',
        '#ff0088': 'Pink',
        '#00ff88': 'Spring Green',
        '#0088ff': 'Sky Blue',
        '#88ff00': 'Lime',
        '#ffffff': 'White',
        '#000000': 'Black',
        '#808080': 'Gray',
        '#c0c0c0': 'Silver',
        '#800000': 'Maroon',
        '#808000': 'Olive',
        '#008000': 'Dark Green',
        '#800080': 'Purple',
        '#008080': 'Teal',
        '#000080': 'Navy',
        '#ffa500': 'Orange',
        '#8b0000': 'Dark Red',
        '#ff4500': 'Orange Red',
        '#ff1493': 'Deep Pink',
        '#00ced1': 'Dark Turquoise',
        '#9400d3': 'Dark Violet',
        '#ff6347': 'Tomato',
        '#40e0d0': 'Turquoise',
        '#ee82ee': 'Violet',
        '#f5deb3': 'Wheat',
        '#9acd32': 'Yellow Green'
    };

    const hex = rgb2hex(color);
    return colorMap[hex] || hex;
}

const searchableItems = extractSearchableItems();

searchBtn.addEventListener('click', () => {
    searchDropdown.classList.add('active');
    searchInput.focus();
    searchInput.value = '';
    searchResults.innerHTML = '';
    // Disable keyboard shortcuts when search is active
    document.removeEventListener('keydown', handleKeyDown);
});

closeSearch.addEventListener('click', () => {
    searchDropdown.classList.remove('active');
    // Re-enable keyboard shortcuts when search is closed
    if (selectedTool !== 'text') {
        document.addEventListener('keydown', handleKeyDown);
    }
});

searchInput.addEventListener('focus', () => {
    document.removeEventListener('keydown', handleKeyDown);
});

searchInput.addEventListener('blur', () => {
    if (!searchDropdown.classList.contains('active') && selectedTool !== 'text') {
        document.addEventListener('keydown', handleKeyDown);
    }
});

searchInput.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();

    if (searchTerm === '') {
        searchResults.innerHTML = '';
        return;
    }

    const filteredItems = searchableItems.filter(item =>
        item.name.toLowerCase().includes(searchTerm) ||
        (item.shortcut && item.shortcut.toLowerCase().includes(searchTerm))
    );

    displaySearchResults(filteredItems);
});

function displaySearchResults(items) {
    searchResults.innerHTML = '';

    if (items.length === 0) {
        const noResults = document.createElement('div');
        noResults.className = 'search-item';
        noResults.innerHTML = '<span>No matching tools or colors found</span>';
        searchResults.appendChild(noResults);
        return;
    }

    // Group items by type
    const tools = items.filter(item => item.type === 'tool');
    const colors = items.filter(item => item.type === 'color');

    // Display tools first
    if (tools.length > 0) {
        const toolsHeader = document.createElement('div');
        toolsHeader.className = 'search-category';
        toolsHeader.textContent = 'Tools';
        searchResults.appendChild(toolsHeader);

        tools.forEach(item => {
            const resultItem = document.createElement('div');
            resultItem.className = 'search-item';
            resultItem.innerHTML = `
                ${item.icon}
                <span>${item.name}${item.shortcut ? ` (${item.shortcut})` : ''}</span>
            `;
            resultItem.addEventListener('click', () => {
                selectTool(item.id);
                document.getElementById(item.id).click();
                searchDropdown.classList.remove('active');
            });
            searchResults.appendChild(resultItem);
        });
    }

    // Then display colors
    if (colors.length > 0) {
        const colorsHeader = document.createElement('div');
        colorsHeader.className = 'search-category';
        colorsHeader.textContent = 'Colors';
        searchResults.appendChild(colorsHeader);

        colors.forEach(item => {
            const resultItem = document.createElement('div');
            resultItem.className = 'search-item';
            resultItem.innerHTML = `
                <div class="color-preview" style="background: ${item.value}"></div>
                <span>${item.name}</span>
            `;
            resultItem.addEventListener('click', () => {
                selectedColor = item.value;
                searchDropdown.classList.remove('active');
            });
            searchResults.appendChild(resultItem);
        });
    }
}

// Update the click outside handler
document.addEventListener('click', (e) => {
    if (!searchDropdown.contains(e.target) && !searchBtn.contains(e.target)) {
        searchDropdown.classList.remove('active');
        // Re-enable keyboard shortcuts when clicking outside
        if (selectedTool !== 'text') {
            document.addEventListener('keydown', handleKeyDown);
        }
    }
});

function drawHeart(ctx, x1, y1, x2, y2, options) {
    const width = Math.abs(x2 - x1);
    const height = Math.abs(y2 - y1);
    const topX = x1 + width / 2;
    const topY = y1 + height * 0.3;

    ctx.beginPath();
    ctx.moveTo(topX, topY);

    // Left curve
    ctx.bezierCurveTo(
        x1, y1,
        x1, y1 + height / 2,
        topX, y1 + height
    );

    // Right curve
    ctx.bezierCurveTo(
        x2, y1 + height / 2,
        x2, y1,
        topX, topY
    );

    ctx.strokeStyle = options.stroke;
    ctx.lineWidth = options.strokeWidth;
    ctx.stroke();
    ctx.closePath();
    if (options.fill !== 'transparent') {
        ctx.fillStyle = options.fill;
        ctx.fill();
    }
}

function drawParallelogram(ctx, x1, y1, x2, y2, options) {
    const offset = Math.abs(x2 - x1) / 4;
    ctx.beginPath();
    ctx.moveTo(x1 + offset, y1);
    ctx.lineTo(x2, y1);
    ctx.lineTo(x2 - offset, y2);
    ctx.lineTo(x1, y2);
    ctx.closePath();
    if (options.fill !== 'transparent') {
        ctx.fillStyle = options.fill;
        ctx.fill();
    }
    ctx.strokeStyle = options.stroke;
    ctx.lineWidth = options.strokeWidth;
    ctx.stroke();
}

function drawArrowhead(ctx, x1, y1, x2, y2, options) {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const length = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
    const width = length / 3;

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x2 - width * Math.cos(angle - Math.PI / 6), y2 - width * Math.sin(angle - Math.PI / 6));
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - width * Math.cos(angle + Math.PI / 6), y2 - width * Math.sin(angle + Math.PI / 6));
    ctx.strokeStyle = options.stroke;
    ctx.lineWidth = options.strokeWidth;
    ctx.stroke();
}

function drawPlus(ctx, x1, y1, x2, y2, options) {
    const centerX = (x1 + x2) / 2;
    const centerY = (y1 + y2) / 2;
    const size = Math.min(Math.abs(x2 - x1), Math.abs(y2 - y1));
    const thickness = size / 4;

    ctx.beginPath();
    // Horizontal line of the plus
    ctx.moveTo(centerX - size / 2, centerY - thickness / 2);
    ctx.lineTo(centerX + size / 2, centerY - thickness / 2);
    ctx.lineTo(centerX + size / 2, centerY + thickness / 2);
    ctx.lineTo(centerX - size / 2, centerY + thickness / 2);
    ctx.closePath();

    if (options.fill !== 'transparent') {
        ctx.fillStyle = options.fill;
        ctx.fill();
    }
    ctx.strokeStyle = options.stroke;
    ctx.lineWidth = options.strokeWidth;
    ctx.stroke();

    // Vertical line of the plus
    ctx.beginPath();
    ctx.moveTo(centerX - thickness / 2, centerY - size / 2);
    ctx.lineTo(centerX + thickness / 2, centerY - size / 2);
    ctx.lineTo(centerX + thickness / 2, centerY + size / 2);
    ctx.lineTo(centerX - thickness / 2, centerY + size / 2);
    ctx.closePath();

    if (options.fill !== 'transparent') {
        ctx.fillStyle = options.fill;
        ctx.fill();
    }
    ctx.stroke();
}

function drawCross(ctx, x1, y1, x2, y2, options) {
    const size = Math.min(Math.abs(x2 - x1), Math.abs(y2 - y1));
    const centerX = (x1 + x2) / 2;
    const centerY = (y1 + y2) / 2;
    const thickness = size / 4;

    ctx.beginPath();
    // First diagonal
    ctx.moveTo(centerX - size / 2, centerY - size / 2);
    ctx.lineTo(centerX - size / 2 + thickness, centerY - size / 2);
    ctx.lineTo(centerX + size / 2, centerY + size / 2 - thickness);
    ctx.lineTo(centerX + size / 2, centerY + size / 2);
    ctx.lineTo(centerX + size / 2 - thickness, centerY + size / 2);
    ctx.lineTo(centerX - size / 2, centerY - size / 2 + thickness);
    ctx.closePath();

    if (options.fill !== 'transparent') {
        ctx.fillStyle = options.fill;
        ctx.fill();
    }
    ctx.strokeStyle = options.stroke;
    ctx.lineWidth = options.strokeWidth;
    ctx.stroke();

    // Second diagonal
    ctx.beginPath();
    ctx.moveTo(centerX + size / 2, centerY - size / 2);
    ctx.lineTo(centerX + size / 2, centerY - size / 2 + thickness);
    ctx.lineTo(centerX - size / 2 + thickness, centerY + size / 2);

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('service worker registered', reg))
            .catch(err => console.log('service worker not registered', err));
    }
    ctx.lineTo(centerX - size / 2, centerY + size / 2);
    ctx.lineTo(centerX - size / 2, centerY + size / 2 - thickness);
    ctx.lineTo(centerX + size / 2 - thickness, centerY - size / 2);
    ctx.closePath();

    if (options.fill !== 'transparent') {
        ctx.fillStyle = options.fill;
        ctx.fill();
    }
    ctx.stroke();
}

function extractSearchableItems() {
    const toolButtons = document.querySelectorAll('#main-toolbar .tool');
    const colorButtons = document.querySelectorAll('.color-grid .color-btn');

    const items = [];

    // Extract tools from main toolbar and shape grid
    const allTools = [
        ...Array.from(document.querySelectorAll('#main-toolbar .tool')),
        ...Array.from(document.querySelectorAll('.shape-grid .tool'))
    ];

    allTools.forEach(button => {
        if (button.id && button.id !== 'search') {
            items.push({
                type: 'tool',
                id: button.id,
                name: button.title || button.id,
                icon: button.innerHTML.split('<span')[0],
                shortcut: button.title?.split('--')[1]?.trim() || ''
            });
        }
    });

    // Extract colors
    colorButtons.forEach(button => {
        const color = button.style.backgroundColor;
        const colorName = getColorName(color);
        items.push({
            type: 'color',
            name: colorName,
            value: rgb2hex(color)
        });
    });

    return items;
}

// Sidebar functionality
const sidebarBtn = document.querySelector('#sidebar');
const sidebarDropdown = document.querySelector('.sidebar-dropdown');
const closeSidebarBtn = document.querySelector('#close-sidebar');
let isSidebarOpen = false;

function toggleSidebar() {
    isSidebarOpen = !isSidebarOpen;
    sidebarDropdown.classList.toggle('active');

    // Disable keyboard shortcuts when sidebar is open
    if (isSidebarOpen) {
        document.removeEventListener('keydown', handleKeyDown);
    } else {
        if (selectedTool !== 'text') {
            document.addEventListener('keydown', handleKeyDown);
        }
    }
}

sidebarBtn.addEventListener('click', toggleSidebar);
closeSidebarBtn.addEventListener('click', toggleSidebar);

// Close all dropdowns when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.menu-item') && !e.target.closest('.sidebar-dropdown')) {
        document.querySelectorAll('.view-dropdown, .edit-dropdown, .export-dropdown, .layout-dropdown, .language-dropdown').forEach(dropdown => {
            dropdown.style.opacity = '0';
            dropdown.style.visibility = 'hidden';
        });
    }
});

// Helper function to calculate distance between two touch points
function getTouchDistance(touches) {
    const dx = touches[1].clientX - touches[0].clientX;
    const dy = touches[1].clientY - touches[0].clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

// Helper function to calculate center point between two touches
function getTouchCenter(touches) {
    return {
        x: (touches[0].clientX + touches[1].clientX) / 2,
        y: (touches[0].clientY + touches[1].clientY) / 2
    };
}

function toggleFloatingTab() {
    isFloatingTabVisible = !isFloatingTabVisible;
    floatingTab.classList.toggle('active');
    colorPalatebtn.classList.toggle('active');
}

// Update click outside handler
document.addEventListener('click', (e) => {
    if (isFloatingTabVisible &&
        !floatingTab.contains(e.target) &&
        !colorPalatebtn.contains(e.target)) {
        isFloatingTabVisible = false;
        floatingTab.classList.remove('active');
        colorPalatebtn.classList.remove('active');
    }
});

// Close floating tab when clicking outside
document.addEventListener('click', (e) => {
    if (isFloatingTabVisible &&
        !floatingTab.contains(e.target) &&
        !colorPalatebtn.contains(e.target)) {
        toggleFloatingTab();
    }
});

// Prevent clicks inside floating tab from closing it
floatingTab.addEventListener('click', (e) => {
    e.stopPropagation();
});

function handleLayout(event) {
    // Prevent the click from closing the dropdown
    if (event) {
        event.stopPropagation();
    }
}


// Add global variables for menu integration
window.currentZoom = 100;
window.elements = elements;
window.redrawCanvas = redrawCanvas;

function toggleSidebar() {
    isSidebarOpen = !isSidebarOpen;
    sidebarDropdown.classList.toggle('active');

    if (isSidebarOpen) {
        document.removeEventListener('keydown', handleKeyDown);
    } else {
        if (selectedTool !== 'text') {
            document.addEventListener('keydown', handleKeyDown);
        }
    }
}