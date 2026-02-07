import { pushCreateAction, pushDeleteAction, pushOptionsChangeAction, pushTransformAction, pushFrameAttachmentAction } from './undoAndRedo.js';

// Update event handlers to use the Line class
let isDrawingLine = false;
let currentLine = null;
let lineStartX = 0;      
let lineStartY = 0;      
let currentLineGroup = null;    
let lineColor = "#fff";
let lineStrokeWidth = 3;
let lineStrokeStyle = "solid";
let lineEdgeType = 1;
let lineSktetchRate = 3;

let isDraggingLine = false;
let dragOldPosLine = null;
let copiedShapeData = null;

// Frame attachment variables
let draggedShapeInitialFrameLine = null;
let hoveredFrameLine = null;

let startX, startY;

let lineColorOptions = document.querySelectorAll(".lineColor > span");
let lineThicknessOptions = document.querySelectorAll(".lineThicknessSpan");
let lineOutlineOptions = document.querySelectorAll(".lineStyleSpan");
let lineSlopeOptions = document.querySelectorAll(".lineSlopeSpan");
let lineEdgeOptions = document.querySelectorAll(".lineEdgeSpan");


function getSVGCoordsFromMouse(e) {
    const viewBox = svg.viewBox.baseVal;
    const rect = svg.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const svgX = viewBox.x + (mouseX / rect.width) * viewBox.width;
    const svgY = viewBox.y + (mouseY / rect.height) * viewBox.height;
    return { x: svgX, y: svgY };
}

class Line {
    constructor(startPoint, endPoint, options = {}) {
        this.startPoint = startPoint;
        this.endPoint = endPoint;
        this.options = { ...options };
        this.group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        this.isSelected = false;
        this.anchors = [];
        this.selectionOutline = null;
        this.shapeName = "line"; 
        this.shapeID = `line-${String(Date.now()).slice(0, 8)}-${Math.floor(Math.random() * 10000)}`; 
        this.group.setAttribute('id', this.shapeID);
        
        // Curve properties
        this.isCurved = false;
        this.controlPoint = null;
        
        // Frame attachment properties
        this.parentFrame = null;
        
        svg.appendChild(this.group);
        this.draw();
    }

    // Add position and dimension properties for frame compatibility
    get x() {
        return Math.min(this.startPoint.x, this.endPoint.x);
    }
    
    set x(value) {
        const currentX = this.x;
        const dx = value - currentX;
        this.startPoint.x += dx;
        this.endPoint.x += dx;
        if (this.controlPoint) {
            this.controlPoint.x += dx;
        }
    }
    
    get y() {
        return Math.min(this.startPoint.y, this.endPoint.y);
    }
    
    set y(value) {
        const currentY = this.y;
        const dy = value - currentY;
        this.startPoint.y += dy;
        this.endPoint.y += dy;
        if (this.controlPoint) {
            this.controlPoint.y += dy;
        }
    }
    
    get width() {
        return Math.abs(this.endPoint.x - this.startPoint.x);
    }
    
    set width(value) {
        const centerX = (this.startPoint.x + this.endPoint.x) / 2;
        this.startPoint.x = centerX - value / 2;
        this.endPoint.x = centerX + value / 2;
    }
    
    get height() {
        return Math.abs(this.endPoint.y - this.startPoint.y);
    }
    
    set height(value) {
        const centerY = (this.startPoint.y + this.endPoint.y) / 2;
        this.startPoint.y = centerY - value / 2;
        this.endPoint.y = centerY + value / 2;
    }

    initializeCurveControlPoint() {
        const midX = (this.startPoint.x + this.endPoint.x) / 2;
        const midY = (this.startPoint.y + this.endPoint.y) / 2;
        
        // Calculate perpendicular offset for curve
        const dx = this.endPoint.x - this.startPoint.x;
        const dy = this.endPoint.y - this.startPoint.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        
        if (length === 0) {
            this.controlPoint = { x: midX, y: midY - 20 };
            return;
        }
        
        // Perpendicular vector
        const perpX = -dy / length;
        const perpY = dx / length;
        const curveOffset = 30; // Default curve amount
        
        this.controlPoint = {
            x: midX + perpX * curveOffset,
            y: midY + perpY * curveOffset
        };
    }

    draw() {
        // Clear existing elements but preserve structure to avoid jitter
        while (this.group.firstChild) {
            this.group.removeChild(this.group.firstChild);
        }

        const rc = rough.svg(svg);
        let lineElement;
        
        if (this.isCurved && this.controlPoint) {
            // Draw curved line using quadratic bezier
            const pathData = `M ${this.startPoint.x} ${this.startPoint.y} Q ${this.controlPoint.x} ${this.controlPoint.y} ${this.endPoint.x} ${this.endPoint.y}`;
            lineElement = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            lineElement.setAttribute('d', pathData);
            lineElement.setAttribute('stroke', this.options.stroke || lineColor);
            lineElement.setAttribute('stroke-width', this.options.strokeWidth || lineStrokeWidth);
            lineElement.setAttribute('fill', 'none');
            lineElement.setAttribute('stroke-linecap', 'round');
            if (this.options.strokeDasharray) {
                lineElement.setAttribute('stroke-dasharray', this.options.strokeDasharray);
            }
        } else {
            // Draw straight line
            lineElement = rc.line(
                this.startPoint.x, this.startPoint.y,
                this.endPoint.x, this.endPoint.y,
                this.options
            );
        }
        
        this.element = lineElement;
        this.group.appendChild(lineElement);

        if (this.isSelected) {
            this.addAnchors();
        }
    }

    selectLine() {
    this.isSelected = true;
    this.addAnchors();
    // Show line sidebar when selected
    disableAllSideBars();
    lineSideBar.classList.remove("hidden");
    this.updateSidebar();
}

deselectLine() {
    this.isSelected = false;
    this.removeSelection();
}

// Update the complete removeSelection method
removeSelection() {
    // Remove anchors
    this.anchors.forEach(anchor => {
        if (anchor && anchor.parentNode === this.group) {
            this.group.removeChild(anchor);
        }
    });
    this.anchors = [];
    this.isSelected = false; // Only set to false when actually deselecting
}

    addAnchors() {
    // Only remove existing anchors if they exist, don't call full removeSelection
    this.anchors.forEach(anchor => {
        if (anchor && anchor.parentNode === this.group) {
            this.group.removeChild(anchor);
        }
    });
    this.anchors = [];
    
    const anchorSize = 10 / (currentZoom || 1);
    const anchorStrokeWidth = 2 / (currentZoom || 1);
    
    // Start point anchor
    const startAnchor = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    startAnchor.setAttribute('cx', this.startPoint.x);
    startAnchor.setAttribute('cy', this.startPoint.y);
    startAnchor.setAttribute('r', anchorSize / 2);
    startAnchor.setAttribute('fill', '#121212');
    startAnchor.setAttribute('stroke', '#5B57D1');
    startAnchor.setAttribute('stroke-width', anchorStrokeWidth);
    startAnchor.setAttribute('class', 'anchor line-anchor');
    startAnchor.style.cursor = 'grab';
    startAnchor.style.pointerEvents = 'all';
    startAnchor.dataset.index = 0;
    this.group.appendChild(startAnchor);
    this.anchors[0] = startAnchor;

    // End point anchor
    const endAnchor = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    endAnchor.setAttribute('cx', this.endPoint.x);
    endAnchor.setAttribute('cy', this.endPoint.y);
    endAnchor.setAttribute('r', anchorSize / 2);
    endAnchor.setAttribute('fill', '#121212');
    endAnchor.setAttribute('stroke', '#5B57D1');
    endAnchor.setAttribute('stroke-width', anchorStrokeWidth);
    endAnchor.setAttribute('class', 'anchor line-anchor');
    endAnchor.style.cursor = 'grab';
    endAnchor.style.pointerEvents = 'all';
    endAnchor.dataset.index = 1;
    this.group.appendChild(endAnchor);
    this.anchors[1] = endAnchor;

    // Middle anchor for curving
    const midX = (this.startPoint.x + this.endPoint.x) / 2;
    const midY = (this.startPoint.y + this.endPoint.y) / 2;
    
    const middleAnchor = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    middleAnchor.setAttribute('cx', this.isCurved && this.controlPoint ? this.controlPoint.x : midX);
    middleAnchor.setAttribute('cy', this.isCurved && this.controlPoint ? this.controlPoint.y : midY);
    middleAnchor.setAttribute('r', anchorSize / 2);
    middleAnchor.setAttribute('fill', this.isCurved ? '#5B57D1' : '#121212');
    middleAnchor.setAttribute('stroke', '#5B57D1');
    middleAnchor.setAttribute('stroke-width', anchorStrokeWidth);
    middleAnchor.setAttribute('class', 'anchor line-middle-anchor');
    middleAnchor.style.cursor = 'grab';
    middleAnchor.style.pointerEvents = 'all';
    middleAnchor.dataset.index = 2;
    this.group.appendChild(middleAnchor);
    this.anchors[2] = middleAnchor;
    }

    isNearAnchor(x, y) {
        if (!this.isSelected) return null;
        const buffer = 15; // Increased buffer for easier selection
        const anchorSize = 10 / (currentZoom || 1);

        // Check anchors
        for (let i = 0; i < this.anchors.length; i++) {
            const anchor = this.anchors[i];
            if (anchor) {
                const anchorX = parseFloat(anchor.getAttribute('cx'));
                const anchorY = parseFloat(anchor.getAttribute('cy'));
                const distance = Math.sqrt(Math.pow(x - anchorX, 2) + Math.pow(y - anchorY, 2));
                if (distance <= anchorSize / 2 + buffer) {
                    return { type: 'anchor', index: i };
                }
            }
        }
        
        return null;
    }

    updatePosition(anchorIndex, newX, newY) {
        if (anchorIndex === 0) {
            // Start point
            this.startPoint.x = newX;
            this.startPoint.y = newY;
            // Don't auto-update control point to prevent jitter
        } else if (anchorIndex === 1) {
            // End point
            this.endPoint.x = newX;
            this.endPoint.y = newY;
            // Don't auto-update control point to prevent jitter
        } else if (anchorIndex === 2) {
            // Middle anchor - curve control
            if (!this.isCurved) {
                // First time dragging middle anchor - enable curve
                this.isCurved = true;
                this.initializeCurveControlPoint();
            }
            this.controlPoint = { x: newX, y: newY };
        }
        
        // Only redraw the line, not the entire structure
        this.updateLineElement();
        this.updateAnchorPositions();
    }

    updateLineElement() {
        // Update just the line element without rebuilding entire structure
        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }

        const rc = rough.svg(svg);
        let lineElement;
        
        if (this.isCurved && this.controlPoint) {
            const pathData = `M ${this.startPoint.x} ${this.startPoint.y} Q ${this.controlPoint.x} ${this.controlPoint.y} ${this.endPoint.x} ${this.endPoint.y}`;
            lineElement = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            lineElement.setAttribute('d', pathData);
            lineElement.setAttribute('stroke', this.options.stroke || lineColor);
            lineElement.setAttribute('stroke-width', this.options.strokeWidth || lineStrokeWidth);
            lineElement.setAttribute('fill', 'none');
            lineElement.setAttribute('stroke-linecap', 'round');
            if (this.options.strokeDasharray) {
                lineElement.setAttribute('stroke-dasharray', this.options.strokeDasharray);
            }
        } else {
            lineElement = rc.line(
                this.startPoint.x, this.startPoint.y,
                this.endPoint.x, this.endPoint.y,
                this.options
            );
        }
        
        this.element = lineElement;
        this.group.insertBefore(lineElement, this.group.firstChild);
    }

    updateAnchorPositions() {
        // Update anchor positions without rebuilding them
        if (this.anchors[0]) {
            this.anchors[0].setAttribute('cx', this.startPoint.x);
            this.anchors[0].setAttribute('cy', this.startPoint.y);
        }
        if (this.anchors[1]) {
            this.anchors[1].setAttribute('cx', this.endPoint.x);
            this.anchors[1].setAttribute('cy', this.endPoint.y);
        }
        if (this.anchors[2]) {
            const midX = (this.startPoint.x + this.endPoint.x) / 2;
            const midY = (this.startPoint.y + this.endPoint.y) / 2;
            this.anchors[2].setAttribute('cx', this.isCurved && this.controlPoint ? this.controlPoint.x : midX);
            this.anchors[2].setAttribute('cy', this.isCurved && this.controlPoint ? this.controlPoint.y : midY);
            this.anchors[2].setAttribute('fill', this.isCurved ? '#5B57D1' : '#121212');
        }
    }

    // Add move method for dragging the entire line
    move(dx, dy) {
        this.startPoint.x += dx;
        this.startPoint.y += dy;
        this.endPoint.x += dx;
        this.endPoint.y += dy;
        if (this.controlPoint) {
            this.controlPoint.x += dx;
            this.controlPoint.y += dy;
        }
        
        // Update without full redraw to prevent jitter
        this.updateLineElement();
        this.updateAnchorPositions();
        
        // Only update frame containment if we're actively dragging the shape itself
        if (isDraggingLine && !this.isBeingMovedByFrame) {
            this.updateFrameContainment();
        }
    }

    updateFrameContainment() {
        // Don't update if we're being moved by a frame
        if (this.isBeingMovedByFrame) return;
        
        let targetFrame = null;
        
        // Find which frame this shape is over
        shapes.forEach(shape => {
            if (shape.shapeName === 'frame' && shape.isShapeInFrame(this)) {
                targetFrame = shape;
            }
        });
        
        // If we have a parent frame and we're being dragged, temporarily remove clipping
        if (this.parentFrame && isDraggingLine) {
            this.parentFrame.temporarilyRemoveFromFrame(this);
        }
        
        // Update frame highlighting
        if (hoveredFrameLine && hoveredFrameLine !== targetFrame) {
            hoveredFrameLine.removeHighlight();
        }
        
        if (targetFrame && targetFrame !== hoveredFrameLine) {
            targetFrame.highlightFrame();
        }
        
        hoveredFrameLine = targetFrame;
    }

    contains(x, y) {
        const tolerance = 8 / (currentZoom || 1); // Slightly larger tolerance for easier selection
        
        if (this.isCurved && this.controlPoint) {
            return this.pointToQuadraticBezierDistance(x, y) <= tolerance;
        } else {
            return this.pointToLineDistance(x, y, this.startPoint.x, this.startPoint.y, this.endPoint.x, this.endPoint.y) <= tolerance;
        }
    }

    pointToQuadraticBezierDistance(x, y) {
        let minDistance = Infinity;
        const steps = 50; // Reduced steps for better performance

        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const point = this.getQuadraticBezierPoint(t);
            const distance = Math.sqrt(Math.pow(x - point.x, 2) + Math.pow(y - point.y, 2));
            minDistance = Math.min(minDistance, distance);
        }

        return minDistance;
    }

    getQuadraticBezierPoint(t) {
        if (!this.controlPoint) return this.startPoint;
        
        const mt = 1 - t;
        return {
            x: mt * mt * this.startPoint.x + 2 * mt * t * this.controlPoint.x + t * t * this.endPoint.x,
            y: mt * mt * this.startPoint.y + 2 * mt * t * this.controlPoint.y + t * t * this.endPoint.y
        };
    }

    pointToLineDistance(x, y, x1, y1, x2, y2) {
        const A = x - x1;
        const B = y - y1;
        const C = x2 - x1;
        const D = y2 - y1;
        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        let param = -1;
        if (lenSq !== 0) param = dot / lenSq;
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
        const dx = x - xx;
        const dy = y - yy;
        return Math.sqrt(dx * dx + dy * dy);
    }

    updateSidebar() {
        // Update sidebar to reflect current line properties
        if (typeof updateLineSidebar === 'function') {
            updateLineSidebar(this);
        }
    }
}

// Add delete functionality
function deleteCurrentShape() {
    if (currentShape && currentShape.shapeName === 'line') {
        const idx = shapes.indexOf(currentShape);
        if (idx !== -1) shapes.splice(idx, 1);
        if (currentShape.group.parentNode) {
            currentShape.group.parentNode.removeChild(currentShape.group);
        }
        pushDeleteAction(currentShape);
        currentShape = null;
        disableAllSideBars();
    }
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Delete' && currentShape && currentShape.shapeName === 'line') {
        deleteCurrentShape();
    }
});

const handleMouseDown = (e) => {
    if (!isLineToolActive && !isSelectionToolActive) return;

    const { x, y } = getSVGCoordsFromMouse(e);

    if (isLineToolActive) {
        isDrawingLine = true;
        currentLine = new Line(
            { x, y },
            { x, y },
            {
                stroke: lineColor,
                strokeWidth: lineStrokeWidth,
                roughness: lineSktetchRate,
                bowing: lineEdgeType,
                strokeDasharray: lineStrokeStyle === "dashed" ? "5,5" : (lineStrokeStyle === "dotted" ? "2,12" : "")
            }
        );
        shapes.push(currentLine);
        currentShape = currentLine;
    } else if (isSelectionToolActive) {
        let clickedOnShape = false;
        
        // Check if clicking on current selected line
        if (currentShape && currentShape.shapeName === 'line' && currentShape.isSelected) {
            const anchorInfo = currentShape.isNearAnchor(x, y);
            console.log('Anchor info:', anchorInfo); // Debug log
            
            if (anchorInfo && anchorInfo.type === 'anchor') {
                clickedOnShape = true;
                // Start anchor drag
                dragOldPosLine = {
                    startPoint: { x: currentShape.startPoint.x, y: currentShape.startPoint.y },
                    endPoint: { x: currentShape.endPoint.x, y: currentShape.endPoint.y },
                    controlPoint: currentShape.controlPoint ? { x: currentShape.controlPoint.x, y: currentShape.controlPoint.y } : null,
                    isCurved: currentShape.isCurved,
                    parentFrame: currentShape.parentFrame
                };
                
                const anchorIndex = anchorInfo.index;
                console.log('Dragging anchor index:', anchorIndex); // Debug log
                
                const onPointerMove = (event) => {
                    const { x: newX, y: newY } = getSVGCoordsFromMouse(event);
                    currentShape.updatePosition(anchorIndex, newX, newY);
                };
                
                const onPointerUp = () => {
                    console.log('Anchor drag ended'); // Debug log
                    if (dragOldPosLine) {
                        const newPos = {
                            startPoint: { x: currentShape.startPoint.x, y: currentShape.startPoint.y },
                            endPoint: { x: currentShape.endPoint.x, y: currentShape.endPoint.y },
                            controlPoint: currentShape.controlPoint ? { x: currentShape.controlPoint.x, y: currentShape.controlPoint.y } : null,
                            isCurved: currentShape.isCurved,
                            parentFrame: currentShape.parentFrame
                        };
                        pushTransformAction(currentShape, dragOldPosLine, newPos);
                        dragOldPosLine = null;
                    }
                    svg.removeEventListener('pointermove', onPointerMove);
                    svg.removeEventListener('pointerup', onPointerUp);
                };
                
                svg.addEventListener('pointermove', onPointerMove);
                svg.addEventListener('pointerup', onPointerUp);
                
                // Prevent default to stop any other drag behavior
                e.preventDefault();
                e.stopPropagation();
                
            } else if (currentShape.contains(x, y)) {
                // Dragging the line itself (not anchors)
                console.log('Dragging line body'); // Debug log
                isDraggingLine = true;
                dragOldPosLine = {
                    startPoint: { x: currentShape.startPoint.x, y: currentShape.startPoint.y },
                    endPoint: { x: currentShape.endPoint.x, y: currentShape.endPoint.y },
                    controlPoint: currentShape.controlPoint ? { x: currentShape.controlPoint.x, y: currentShape.controlPoint.y } : null,
                    isCurved: currentShape.isCurved,
                    parentFrame: currentShape.parentFrame
                };
                
                // Store initial frame state
                draggedShapeInitialFrameLine = currentShape.parentFrame || null;
                
                // Temporarily remove from frame clipping if dragging
                if (currentShape.parentFrame) {
                    currentShape.parentFrame.temporarilyRemoveFromFrame(currentShape);
                }
                
                startX = x;
                startY = y;
                clickedOnShape = true;
            }
        }

        // If not clicking on selected shape, check for other shapes
        if (!clickedOnShape) {
            let shapeToSelect = null;
            for (let i = shapes.length - 1; i >= 0; i--) {
                const shape = shapes[i];
                if (shape instanceof Line && shape.contains(x, y)) {
                    shapeToSelect = shape;
                    break;
                }
            }

            if (currentShape && currentShape !== shapeToSelect) {
                currentShape.removeSelection();
                currentShape = null;
            }

            if (shapeToSelect) {
                currentShape = shapeToSelect;
                currentShape.selectLine();
                console.log('Selected new line, anchors count:', currentShape.anchors.length); // Debug log
                clickedOnShape = true;
            }
        }

        if (!clickedOnShape && currentShape) {
            currentShape.removeSelection();
            currentShape = null;
        }
    }
};
// Update clone function to remove rotation property
function cloneLineData(line) {
    return {
        startPoint: { x: line.startPoint.x, y: line.startPoint.y },
        endPoint: { x: line.endPoint.x, y: line.endPoint.y },
        controlPoint: line.controlPoint ? { x: line.controlPoint.x, y: line.controlPoint.y } : null,
        isCurved: line.isCurved || false,
        parentFrame: line.parentFrame,
        options: cloneOptions(line.options)
    };
}

const handleMouseMove = (e) => {
    const { x, y } = getSVGCoordsFromMouse(e);
    
    // Keep lastMousePos in screen coordinates for other functions
    const svgRect = svg.getBoundingClientRect();
    lastMousePos = {
        x: e.clientX - svgRect.left, 
        y: e.clientY - svgRect.top
    };
    
    if (isDrawingLine && currentLine) {
        currentLine.endPoint = { x, y };
        currentLine.draw();
        
        // Check for frame containment while drawing (but don't apply clipping yet)
        shapes.forEach(frame => {
            if (frame.shapeName === 'frame') {
                if (frame.isShapeInFrame(currentLine)) {
                    frame.highlightFrame();
                    hoveredFrameLine = frame;
                } else if (hoveredFrameLine === frame) {
                    frame.removeHighlight();
                    hoveredFrameLine = null;
                }
            }
        });
    } else if (isDraggingLine && currentShape && currentShape.isSelected) {
        const dx = x - startX;
        const dy = y - startY;
        currentShape.move(dx, dy);
        startX = x;
        startY = y;
        currentShape.draw();
    }
};

const handleMouseUp = (e) => {
    if (isDrawingLine) {
        isDrawingLine = false;
        
        // Check if line is too small
        const dx = currentLine.endPoint.x - currentLine.startPoint.x;
        const dy = currentLine.endPoint.y - currentLine.startPoint.y;
        const lengthSq = dx * dx + dy * dy;
        
        if (lengthSq < (5 / currentZoom) ** 2) {
            shapes.pop();
            if (currentLine.group.parentNode) {
                currentLine.group.parentNode.removeChild(currentLine.group);
            }
            currentLine = null;
            currentShape = null;
        } else {
            // Push create action for undo/redo
            pushCreateAction(currentLine);
            
            // Check for frame containment and track attachment
            const finalFrame = hoveredFrameLine;
            if (finalFrame) {
                finalFrame.addShapeToFrame(currentLine);
                // Track the attachment for undo
                pushFrameAttachmentAction(finalFrame, currentLine, 'attach', null);
            }
        }
        
        // Clear frame highlighting
        if (hoveredFrameLine) {
            hoveredFrameLine.removeHighlight();
            hoveredFrameLine = null;
        }
        
        currentLine = null;
    }
    
    if (isDraggingLine && dragOldPosLine && currentShape) {
        const newPos = {
            startPoint: { x: currentShape.startPoint.x, y: currentShape.startPoint.y },
            endPoint: { x: currentShape.endPoint.x, y: currentShape.endPoint.y },
            controlPoint: currentShape.controlPoint ? { x: currentShape.controlPoint.x, y: currentShape.controlPoint.y } : null,
            parentFrame: currentShape.parentFrame
        };
        const oldPos = {
            ...dragOldPosLine,
            parentFrame: draggedShapeInitialFrameLine
        };
        
        const stateChanged = dragOldPosLine.startPoint.x !== newPos.startPoint.x || 
                           dragOldPosLine.startPoint.y !== newPos.startPoint.y ||
                           dragOldPosLine.endPoint.x !== newPos.endPoint.x || 
                           dragOldPosLine.endPoint.y !== newPos.endPoint.y;

        const frameChanged = oldPos.parentFrame !== newPos.parentFrame;
        
        if (stateChanged || frameChanged) {
            pushTransformAction(currentShape, oldPos, newPos);
        }
        
        // Handle frame containment changes after drag
        if (isDraggingLine) {
            const finalFrame = hoveredFrameLine;
            
            // If shape moved to a different frame
            if (draggedShapeInitialFrameLine !== finalFrame) {
                // Remove from initial frame
                if (draggedShapeInitialFrameLine) {
                    draggedShapeInitialFrameLine.removeShapeFromFrame(currentShape);
                }
                
                // Add to new frame
                if (finalFrame) {
                    finalFrame.addShapeToFrame(currentShape);
                }
                
                // Track the frame change for undo
                if (frameChanged) {
                    pushFrameAttachmentAction(finalFrame || draggedShapeInitialFrameLine, currentShape, 
                        finalFrame ? 'attach' : 'detach', draggedShapeInitialFrameLine);
                }
            } else if (draggedShapeInitialFrameLine) {
                // Shape stayed in same frame, restore clipping
                draggedShapeInitialFrameLine.restoreToFrame(currentShape);
            }
        }
        
        dragOldPosLine = null;
        draggedShapeInitialFrameLine = null;
    }
    
    // Clear frame highlighting
    if (hoveredFrameLine) {
        hoveredFrameLine.removeHighlight();
        hoveredFrameLine = null;
    }
    
    isDraggingLine = false;
};

// --- Event Handlers ---

// --- Style Option Event Listeners ---
lineColorOptions.forEach((span) => {
    span.addEventListener("click", (event) => {
        event.stopPropagation();
        lineColorOptions.forEach((el) => el.classList.remove("selected"));
        span.classList.add("selected");
        
        if (currentShape instanceof Line && currentShape.isSelected) {
            const oldOptions = {...currentShape.options};
            currentShape.options.stroke = span.getAttribute("data-id");
            currentShape.draw();
            pushOptionsChangeAction(currentShape, oldOptions);
        } else {
            lineColor = span.getAttribute("data-id");
        }
    });
});

lineThicknessOptions.forEach((span) => {
    span.addEventListener("click", (event) => {
        event.stopPropagation();
        lineThicknessOptions.forEach((el) => el.classList.remove("selected"));
        span.classList.add("selected");
        
        if (currentShape instanceof Line && currentShape.isSelected) {
            const oldOptions = {...currentShape.options};
            currentShape.options.strokeWidth = parseInt(span.getAttribute("data-id"));
            currentShape.draw();
            pushOptionsChangeAction(currentShape, oldOptions);
        } else {
            lineStrokeWidth = parseInt(span.getAttribute("data-id"));
        }
    });
});

lineOutlineOptions.forEach((span) => {
    span.addEventListener("click", (event) => {
        event.stopPropagation();
        lineOutlineOptions.forEach((el) => el.classList.remove("selected"));
        span.classList.add("selected");
        
        if (currentShape instanceof Line && currentShape.isSelected) {
            const oldOptions = {...currentShape.options};
            const style = span.getAttribute("data-id");
            currentShape.options.strokeDasharray = 
                style === "dashed" ? "5,5" : 
                (style === "dotted" ? "2,12" : "");
            currentShape.draw();
            pushOptionsChangeAction(currentShape, oldOptions);
        } else {
            lineStrokeStyle = span.getAttribute("data-id");
        }
    });
});

lineSlopeOptions.forEach((span) => {
    span.addEventListener("click", (event) => {
        event.stopPropagation();
        lineSlopeOptions.forEach((el) => el.classList.remove("selected"));
        span.classList.add("selected");
        
        if (currentShape instanceof Line && currentShape.isSelected) {
            const oldOptions = {...currentShape.options};
            currentShape.options.roughness = parseFloat(span.getAttribute("data-id"));
            currentShape.draw();
            pushOptionsChangeAction(currentShape, oldOptions);
        } else {
            lineSktetchRate = parseFloat(span.getAttribute("data-id"));
        }
    });
});

lineEdgeOptions.forEach((span) => {
    span.addEventListener("click", (event) => {
        event.stopPropagation();
        lineEdgeOptions.forEach((el) => el.classList.remove("selected"));
        span.classList.add("selected");
        
        if (currentShape instanceof Line && currentShape.isSelected) {
            const oldOptions = {...currentShape.options};
            currentShape.options.bowing = parseFloat(span.getAttribute("data-id"));
            currentShape.draw();
            pushOptionsChangeAction(currentShape, oldOptions);
        } else {
            lineEdgeType = parseFloat(span.getAttribute("data-id"));
        }
    });
});

// Add copy/paste functionality
function cloneOptions(options) {
    return JSON.parse(JSON.stringify(options));
}

export {
    handleMouseDown as handleMouseDownLine,
    handleMouseMove as handleMouseMoveLine,
    handleMouseUp as handleMouseUpLine,
}