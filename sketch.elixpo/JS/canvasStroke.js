import { pushCreateAction, pushDeleteAction, pushOptionsChangeAction, pushTransformAction, pushFrameAttachmentAction } from './undoAndRedo.js';

const strokeColors = document.querySelectorAll(".strokeColors span");
const strokeThicknesses = document.querySelectorAll(".strokeThickness span");
let strokeColor = "#fff";
let strokeThickness = 2;
let points = [];
let isDrawingStroke = false;
let currentStroke = null;
let strokeOpacity = 1; 


let isDraggingStroke = false;
let isResizingStroke = false;
let isRotatingStroke = false;
let dragOldPosStroke = null;
let resizingAnchorIndex = null;
let startRotationMouseAngle = null;
let startShapeRotation = null;
let copiedShapeData = null;
let startX, startY;

// Frame attachment variables
let draggedShapeInitialFrameStroke = null;
let hoveredFrameStroke = null;

// Enhanced mouse tracking with better point collection
let lastPoint = null;
let lastTime = 0;
const minDistance = 2; // Minimum distance between points
const maxDistance = 15; // Maximum distance for interpolation
let isdraggingOpacity = false;


function getSvgCoordinates(event) {
    const rect = svg.getBoundingClientRect();
    const scaleX = currentViewBox.width / rect.width;
    const scaleY = currentViewBox.height / rect.height;

    const svgX = currentViewBox.x + (event.clientX - rect.left) * scaleX;
    const svgY = currentViewBox.y + (event.clientY - rect.top) * scaleY;

    return { x: svgX, y: svgY };
}

function getSvgPathFromStroke(stroke) {
    if (!stroke.length) return '';
    
    // Use more sophisticated curve fitting
    const pathData = [];
    pathData.push('M', stroke[0][0], stroke[0][1]);
    
    for (let i = 1; i < stroke.length - 1; i++) {
        const curr = stroke[i];
        const next = stroke[i + 1];
        
        // Calculate control points for smoother curves
        const cpX = curr[0] + (next[0] - curr[0]) * 0.5;
        const cpY = curr[1] + (next[1] - curr[1]) * 0.5;
        
        pathData.push('Q', curr[0], curr[1], cpX, cpY);
    }
    
    // Add final point
    if (stroke.length > 1) {
        const lastPoint = stroke[stroke.length - 1];
        pathData.push('L', lastPoint[0], lastPoint[1]);
    }
    
    return pathData.join(' ');
}

class FreehandStroke {
    constructor(points = [], options = {}) {
        this.points = points;
        this.rawPoints = []; 
        this.options = {
            stroke: strokeColor,
            strokeWidth: strokeThickness,
            fill: "none",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeOpacity: strokeOpacity,
            ...options
        };
        this.element = null;
        this.isSelected = false;
        this.rotation = 0;
        this.group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        this.anchors = [];
        this.rotationAnchor = null;
        this.selectionPadding = 8;
        this.selectionOutline = null;
        this.boundingBox = { x: 0, y: 0, width: 0, height: 0 };
        this.shapeName = "freehandStroke";
        
        // Frame attachment properties
        this.parentFrame = null;
        
        svg.appendChild(this.group);
        this.draw();
    }

    // Add position and dimension properties for frame compatibility
    get x() {
        return this.boundingBox.x;
    }
    
    set x(value) {
        const dx = value - this.boundingBox.x;
        const dy = 0;
        this.points = this.points.map(point => [point[0] + dx, point[1] + dy, point[2] || 0.5]);
        this.boundingBox.x = value;
    }
    
    get y() {
        return this.boundingBox.y;
    }
    
    set y(value) {
        const dy = value - this.boundingBox.y;
        this.points = this.points.map(point => [point[0], point[1] + dy, point[2] || 0.5]);
        this.boundingBox.y = value;
    }
    
    get width() {
        return this.boundingBox.width;
    }
    
    set width(value) {
        if (this.boundingBox.width === 0) return;
        const scaleX = value / this.boundingBox.width;
        const centerX = this.boundingBox.x + this.boundingBox.width / 2;
        this.points = this.points.map(point => [
            centerX + (point[0] - centerX) * scaleX,
            point[1],
            point[2] || 0.5
        ]);
        this.boundingBox.width = value;
    }
    
    get height() {
        return this.boundingBox.height;
    }
    
    set height(value) {
        if (this.boundingBox.height === 0) return;
        const scaleY = value / this.boundingBox.height;
        const centerY = this.boundingBox.y + this.boundingBox.height / 2;
        this.points = this.points.map(point => [
            point[0],
            centerY + (point[1] - centerY) * scaleY,
            point[2] || 0.5
        ]);
        this.boundingBox.height = value;
    }

    // Enhanced smoothing algorithm
    smoothPoints(points, factor = 0.8) {
        if (points.length < 3) return points;
        
        const smoothed = [points[0]]; // Keep first point
        
        for (let i = 1; i < points.length - 1; i++) {
            const prev = points[i - 1];
            const curr = points[i];
            const next = points[i + 1];
            
            // Apply weighted average smoothing
            const smoothedX = curr[0] * (1 - factor) + (prev[0] + next[0]) * factor * 0.5;
            const smoothedY = curr[1] * (1 - factor) + (prev[1] + next[1]) * factor * 0.5;
            const pressure = curr[2] || 0.5;
            
            smoothed.push([smoothedX, smoothedY, pressure]);
        }
        
        smoothed.push(points[points.length - 1]); // Keep last point
        return smoothed;
    }

    // Interpolate points for smoother curves
    interpolatePoints(points, steps = 2) {
        if (points.length < 2) return points;
        
        const interpolated = [points[0]];
        
        for (let i = 0; i < points.length - 1; i++) {
            const curr = points[i];
            const next = points[i + 1];
            
            for (let j = 1; j <= steps; j++) {
                const t = j / (steps + 1);
                const x = curr[0] + (next[0] - curr[0]) * t;
                const y = curr[1] + (next[1] - curr[1]) * t;
                const pressure = curr[2] + (next[2] - curr[2]) * t;
                interpolated.push([x, y, pressure]);
            }
            
            if (i < points.length - 2) {
                interpolated.push(next);
            }
        }
        
        interpolated.push(points[points.length - 1]);
        return interpolated;
    }

    // Enhanced path generation with better curve fitting
    getPathData() {
        if (this.points.length < 2) return '';
        
        // Apply multiple smoothing passes for ultra-smooth results
        let smoothedPoints = this.interpolatePoints(this.points, 1);
        smoothedPoints = this.smoothPoints(smoothedPoints, 0.6);
        smoothedPoints = this.smoothPoints(smoothedPoints, 0.4);
        
        const stroke = getStroke(smoothedPoints, {
            size: this.options.strokeWidth,
            thinning: 0.3, // Reduced for more consistent width
            smoothing: 0.9, // Increased for smoother curves
            streamline: 0.4, // Increased for better flow
            easing: (t) => Math.sin(t * Math.PI * 0.5), // Smoother easing
            start: { 
                taper: 5, // Subtle taper for natural start
                easing: (t) => t * t, 
                cap: true 
            },
            end: { 
                taper: 5, // Subtle taper for natural end
                easing: (t) => --t * t * t + 1, 
                cap: true 
            },
            simulatePressure: true
        });
        
        return getSvgPathFromStroke(stroke);
    }

    // Calculate the bounding box of the stroke
    calculateBoundingBox() {
        if (this.points.length === 0) {
            return { x: 0, y: 0, width: 0, height: 0 };
        }
        
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;
        
        this.points.forEach(point => {
            minX = Math.min(minX, point[0]);
            minY = Math.min(minY, point[1]);
            maxX = Math.max(maxX, point[0]);
            maxY = Math.max(maxY, point[1]);
        });
        
        // Ensure we have valid dimensions
        if (minX === Infinity || minY === Infinity) {
            return { x: 0, y: 0, width: 0, height: 0 };
        }
        
        // Add padding for stroke width
        const padding = this.options.strokeWidth / 2;
        return {
            x: minX - padding,
            y: minY - padding,
            width: Math.max(0, (maxX - minX) + padding * 2),
            height: Math.max(0, (maxY - minY) + padding * 2)
        };
    }

    draw() {
        while (this.group.firstChild) {
            this.group.removeChild(this.group.firstChild);
        }

        if (this.selectionOutline && this.selectionOutline.parentNode === this.group) {
            this.group.removeChild(this.selectionOutline);
            this.selectionOutline = null;
        }

        // Create the path element
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', this.getPathData());
        path.setAttribute('stroke', this.options.stroke);
        path.setAttribute('stroke-width', this.options.strokeWidth);
        path.setAttribute('fill', this.options.fill);
        path.setAttribute('stroke-linecap', this.options.strokeLinecap);
        path.setAttribute('stroke-linejoin', this.options.strokeLinejoin);
        path.setAttribute('stroke-opacity', this.options.strokeOpacity);
        this.element = path;
        this.group.appendChild(path);

        // Calculate and store bounding box
        this.boundingBox = this.calculateBoundingBox();

        // Apply rotation
        const centerX = this.boundingBox.x + this.boundingBox.width / 2;
        const centerY = this.boundingBox.y + this.boundingBox.height / 2;

        // Ensure centerX and centerY are valid numbers
        if (!isNaN(centerX) && !isNaN(centerY)) {
            this.group.setAttribute('transform', `rotate(${this.rotation} ${centerX} ${centerY})`);
        }

        if (this.isSelected) {
            this.addAnchors();
        }
    }

    move(dx, dy) {
        this.points = this.points.map(point => [point[0] + dx, point[1] + dy, point[2] || 0.5]);
        
        // Only update frame containment if we're actively dragging the shape itself
        // and not being moved by a parent frame
        if (isDraggingStroke && !this.isBeingMovedByFrame) {
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
        if (this.parentFrame && isDraggingStroke) {
            this.parentFrame.temporarilyRemoveFromFrame(this);
        }
        
        // Update frame highlighting
        if (hoveredFrameStroke && hoveredFrameStroke !== targetFrame) {
            hoveredFrameStroke.removeHighlight();
        }
        
        if (targetFrame && targetFrame !== hoveredFrameStroke) {
            targetFrame.highlightFrame();
        }
        
        hoveredFrameStroke = targetFrame;
    }

    selectStroke() {
        this.isSelected = true;
        this.draw();
        // Show sidebar and update it with current stroke properties
        disableAllSideBars();
        paintBrushSideBar.classList.remove("hidden");
        this.updateSidebar();
    }

    deselectStroke() {
        this.isSelected = false;
        this.anchors = [];
        this.rotationAnchor = null;
        this.draw();
    }

    removeSelection() {
        this.anchors.forEach(anchor => {
            if (anchor.parentNode === this.group) {
                this.group.removeChild(anchor);
            }
        });
        if (this.rotationAnchor && this.rotationAnchor.parentNode === this.group) {
            this.group.removeChild(this.rotationAnchor);
        }
        if (this.selectionOutline && this.selectionOutline.parentNode === this.group) {
            this.group.removeChild(this.selectionOutline);
        }
        this.anchors = [];
        this.rotationAnchor = null;
        this.selectionOutline = null;
        this.isSelected = false;
    }

    // Add updateSidebar method similar to Circle class
    updateSidebar() {
        // Update color selection
        strokeColors.forEach(span => {
            const color = span.getAttribute('data-id');
            if (color === this.options.stroke) {
                span.classList.add('selected');
            } else {
                span.classList.remove('selected');
            }
        });

        // Update thickness selection
        strokeThicknesses.forEach(span => {
            const thickness = parseInt(span.getAttribute('data-id'), 10);
            if (thickness === this.options.strokeWidth) {
                span.classList.add('selected');
            } else {
                span.classList.remove('selected');
            }
        });

        const opacitySlider = document.getElementById("strokeOpacity");
        const opacityValue = document.getElementById("opacityContainerValue");
        if (opacitySlider && opacityValue) {
            opacitySlider.value = (this.options.strokeOpacity * 100).toFixed(0);
            opacityValue.textContent = (this.options.strokeOpacity * 100).toFixed(0);
        }
    }

    contains(x, y) {
        // Simple bounding box check
        const centerX = this.boundingBox.x + this.boundingBox.width / 2;
        const centerY = this.boundingBox.y + this.boundingBox.height / 2;
        
        // Adjust for rotation
        const dx = x - centerX;
        const dy = y - centerY;
        
        const angleRad = -this.rotation * Math.PI / 180;
        const rotatedX = dx * Math.cos(angleRad) - dy * Math.sin(angleRad) + centerX;
        const rotatedY = dx * Math.sin(angleRad) + dy * Math.cos(angleRad) + centerY;
        
        return rotatedX >= this.boundingBox.x && 
               rotatedX <= this.boundingBox.x + this.boundingBox.width &&
               rotatedY >= this.boundingBox.y && 
               rotatedY <= this.boundingBox.y + this.boundingBox.height;
    }

  isNearAnchor(x, y) {
    if (!this.isSelected) return null;
    const buffer = 10;
    const anchorSize = 10 / currentZoom;

    // Transform the input coordinates to account for rotation
    const centerX = this.boundingBox.x + this.boundingBox.width / 2;
    const centerY = this.boundingBox.y + this.boundingBox.height / 2;
    
    // Rotate the mouse coordinates to the shape's local coordinate system
    const angleRad = -this.rotation * Math.PI / 180;
    const dx = x - centerX;
    const dy = y - centerY;
    const localX = dx * Math.cos(angleRad) - dy * Math.sin(angleRad) + centerX;
    const localY = dx * Math.sin(angleRad) + dy * Math.cos(angleRad) + centerY;

    // Check resize anchors in local space
    const expandedX = this.boundingBox.x - this.selectionPadding;
    const expandedY = this.boundingBox.y - this.selectionPadding;
    const expandedWidth = this.boundingBox.width + 2 * this.selectionPadding;
    const expandedHeight = this.boundingBox.height + 2 * this.selectionPadding;
    
    const anchorPositions = [
        { x: expandedX, y: expandedY }, // top-left
        { x: expandedX + expandedWidth, y: expandedY }, // top-right
        { x: expandedX, y: expandedY + expandedHeight }, // bottom-left
        { x: expandedX + expandedWidth, y: expandedY + expandedHeight }, // bottom-right
        { x: expandedX + expandedWidth / 2, y: expandedY }, // top-center
        { x: expandedX + expandedWidth / 2, y: expandedY + expandedHeight }, // bottom-center
        { x: expandedX, y: expandedY + expandedHeight / 2 }, // left-center
        { x: expandedX + expandedWidth, y: expandedY + expandedHeight / 2 } // right-center
    ];

    for (let i = 0; i < anchorPositions.length; i++) {
        const anchor = anchorPositions[i];
        const distance = Math.sqrt(Math.pow(localX - anchor.x, 2) + Math.pow(localY - anchor.y, 2));
        if (distance <= anchorSize / 2 + buffer) {
            return { type: 'resize', index: i };
        }
    }
    
    // Check rotation anchor (this one stays in world coordinates)
    if (this.rotationAnchor) {
        const rotationX = parseFloat(this.rotationAnchor.getAttribute('cx'));
        const rotationY = parseFloat(this.rotationAnchor.getAttribute('cy'));
        const distance = Math.sqrt(Math.pow(x - rotationX, 2) + Math.pow(y - rotationY, 2));
        if (distance <= anchorSize / 2 + buffer) {
            return { type: 'rotate' };
        }
    }
    
    return null;
}

   rotate(angle) {
    this.rotation = angle;
    // If anchors exist, update their cursors for the new rotation
    if (this.isSelected && this.anchors.length > 0) {
        const cursors = ['nw-resize', 'ne-resize', 'sw-resize', 'se-resize', 'n-resize', 's-resize', 'w-resize', 'e-resize'];
        this.anchors.forEach((anchor, i) => {
            if (anchor) {
                const originalCursor = cursors[i];
                const rotatedCursor = this.getRotatedCursor(originalCursor, this.rotation);
                anchor.style.cursor = rotatedCursor;
            }
        });
    }
}

    addAnchors() {
    const anchorSize = 10 / currentZoom;
    const anchorStrokeWidth = 2 / currentZoom;
    
    const expandedX = this.boundingBox.x - this.selectionPadding;
    const expandedY = this.boundingBox.y - this.selectionPadding;
    const expandedWidth = this.boundingBox.width + 2 * this.selectionPadding;
    const expandedHeight = this.boundingBox.height + 2 * this.selectionPadding;
    
    const positions = [
        { x: expandedX, y: expandedY, cursor: 'nw-resize' }, // top-left
        { x: expandedX + expandedWidth, y: expandedY, cursor: 'ne-resize' }, // top-right
        { x: expandedX, y: expandedY + expandedHeight, cursor: 'sw-resize' }, // bottom-left
        { x: expandedX + expandedWidth, y: expandedY + expandedHeight, cursor: 'se-resize' }, // bottom-right
        { x: expandedX + expandedWidth / 2, y: expandedY, cursor: 'n-resize' }, // top-center
        { x: expandedX + expandedWidth / 2, y: expandedY + expandedHeight, cursor: 's-resize' }, // bottom-center
        { x: expandedX, y: expandedY + expandedHeight / 2, cursor: 'w-resize' }, // left-center
        { x: expandedX + expandedWidth, y: expandedY + expandedHeight / 2, cursor: 'e-resize' } // right-center
    ];
    
    // Create resize anchors
    positions.forEach((pos, i) => {
        const anchor = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        anchor.setAttribute('x', pos.x - anchorSize / 2);
        anchor.setAttribute('y', pos.y - anchorSize / 2);
        anchor.setAttribute('width', anchorSize);
        anchor.setAttribute('height', anchorSize);
        anchor.setAttribute('class', 'anchor');
        anchor.setAttribute('data-index', i);
        anchor.setAttribute('fill', '#121212');
        anchor.setAttribute('stroke', '#5B57D1');
        anchor.setAttribute('stroke-width', anchorStrokeWidth);
        
        // Set proper cursor for each anchor direction, accounting for rotation
        const rotatedCursor = this.getRotatedCursor(pos.cursor, this.rotation);
        anchor.style.cursor = rotatedCursor;
        anchor.style.pointerEvents = 'all';
        
        this.group.appendChild(anchor);
        this.anchors[i] = anchor;
    });

    // Create rotation anchor
    const rotationAnchorDistance = 30 / currentZoom;
    const rotationX = expandedX + expandedWidth / 2;
    const rotationY = expandedY - rotationAnchorDistance;
    
    const rotationAnchor = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    rotationAnchor.setAttribute('cx', rotationX);
    rotationAnchor.setAttribute('cy', rotationY);
    rotationAnchor.setAttribute('r', anchorSize / 2);
    rotationAnchor.setAttribute('fill', '#121212');
    rotationAnchor.setAttribute('stroke', '#5B57D1');
    rotationAnchor.setAttribute('stroke-width', anchorStrokeWidth);
    rotationAnchor.setAttribute('class', 'rotation-anchor');
    rotationAnchor.style.cursor = 'grab';
    rotationAnchor.style.pointerEvents = 'all';
    
    this.group.appendChild(rotationAnchor);
    this.rotationAnchor = rotationAnchor;

    // Create selection outline
    const outlinePoints = [
        [expandedX, expandedY],
        [expandedX + expandedWidth, expandedY],
        [expandedX + expandedWidth, expandedY + expandedHeight],
        [expandedX, expandedY + expandedHeight],
        [expandedX, expandedY]
    ];
    
    const outline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    outline.setAttribute('points', outlinePoints.map(p => p.join(',')).join(' '));
    outline.setAttribute('fill', 'none');
    outline.setAttribute('stroke', '#5B57D1');
    outline.setAttribute('stroke-width', 1.5);
    outline.setAttribute('stroke-dasharray', '4 2');
    outline.setAttribute('style', 'pointer-events: none;');
    this.group.appendChild(outline);
    this.selectionOutline = outline;

    // Add line from rotation anchor to shape
    const rotationLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    rotationLine.setAttribute('x1', rotationX);
    rotationLine.setAttribute('y1', rotationY);
    rotationLine.setAttribute('x2', expandedX + expandedWidth / 2);
    rotationLine.setAttribute('y2', expandedY);
    rotationLine.setAttribute('stroke', '#5B57D1');
    rotationLine.setAttribute('stroke-width', 1);
    rotationLine.setAttribute('stroke-dasharray', '2 2');
    rotationLine.setAttribute('style', 'pointer-events: none;');
    this.group.appendChild(rotationLine);

    // Show sidebar when anchors are added (when shape is selected)
    disableAllSideBars();
    paintBrushSideBar.classList.remove("hidden");
    this.updateSidebar();
}

getRotatedCursor(direction, angle) {
    // Normalize angle to 0-360
    const normalizedAngle = ((angle % 360) + 360) % 360;
    
    // Map of cursor directions
    const cursors = ['n-resize', 'ne-resize', 'e-resize', 'se-resize', 's-resize', 'sw-resize', 'w-resize', 'nw-resize'];
    const directionMap = {
        'n-resize': 0,
        'ne-resize': 1,
        'e-resize': 2,
        'se-resize': 3,
        's-resize': 4,
        'sw-resize': 5,
        'w-resize': 6,
        'nw-resize': 7
    };
    
    if (!(direction in directionMap)) return direction;
    
    // Calculate how many 45-degree increments to rotate
    const rotationSteps = Math.round(normalizedAngle / 45);
    const currentIndex = directionMap[direction];
    const newIndex = (currentIndex + rotationSteps) % 8;
    
    return cursors[newIndex];
}

    updatePosition(anchorIndex, newX, newY) {
    const centerX = this.boundingBox.x + this.boundingBox.width / 2;
    const centerY = this.boundingBox.y + this.boundingBox.height / 2;
    
    // Transform new coordinates to local space (accounting for rotation)
    const angleRad = -this.rotation * Math.PI / 180;
    const dx = newX - centerX;
    const dy = newY - centerY;
    const localX = dx * Math.cos(angleRad) - dy * Math.sin(angleRad) + centerX;
    const localY = dx * Math.sin(angleRad) + dy * Math.cos(angleRad) + centerY;
    
    // Calculate scale factors based on anchor movement in local space
    const expandedX = this.boundingBox.x - this.selectionPadding;
    const expandedY = this.boundingBox.y - this.selectionPadding;
    const expandedWidth = this.boundingBox.width + 2 * this.selectionPadding;
    const expandedHeight = this.boundingBox.height + 2 * this.selectionPadding;
    
    let scaleX = 1, scaleY = 1;
    switch(anchorIndex) {
        case 0: // top-left
            scaleX = (centerX - localX) / (centerX - expandedX);
            scaleY = (centerY - localY) / (centerY - expandedY);
            break;
        case 1: // top-right
            scaleX = (localX - centerX) / (expandedX + expandedWidth - centerX);
            scaleY = (centerY - localY) / (centerY - expandedY);
            break;
        case 2: // bottom-left
            scaleX = (centerX - localX) / (centerX - expandedX);
            scaleY = (localY - centerY) / (expandedY + expandedHeight - centerY);
            break;
        case 3: // bottom-right
            scaleX = (localX - centerX) / (expandedX + expandedWidth - centerX);
            scaleY = (localY - centerY) / (expandedY + expandedHeight - centerY);
            break;
        case 4: // top-center
            scaleY = (centerY - localY) / (centerY - expandedY);
            break;
        case 5: // bottom-center
            scaleY = (localY - centerY) / (expandedY + expandedHeight - centerY);
            break;
        case 6: // left-center
            scaleX = (centerX - localX) / (centerX - expandedX);
            break;
        case 7: // right-center
            scaleX = (localX - centerX) / (expandedX + expandedWidth - centerX);
            break;
    }
    
    // Prevent negative scaling
    scaleX = Math.max(0.1, Math.abs(scaleX));
    scaleY = Math.max(0.1, Math.abs(scaleY));
    
    // Apply scaling to all points relative to center
    this.points = this.points.map(point => {
        const relX = point[0] - centerX;
        const relY = point[1] - centerY;
        return [
            centerX + relX * scaleX,
            centerY + relY * scaleY,
            point[2] || 0.5
        ];
    });
    
    this.draw();
}
}

// Delete functionality
function deleteCurrentShape() {
    if (currentShape && currentShape.shapeName === 'freehandStroke') {
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
    if (e.key === 'Delete' && currentShape && currentShape.shapeName === 'freehandStroke') {
        deleteCurrentShape();
    }
});

// Event handlers
function handleMouseDown(e) {
    const { x, y } = getSvgCoordinates(e);
    
    if (isPaintToolActive) {
        isDrawingStroke = true;
        const pressure = e.pressure || 0.5;
        points = [[x, y, pressure]];
        lastPoint = [x, y, pressure];
        lastTime = Date.now();

        currentStroke = new FreehandStroke(points, {
            stroke: strokeColor,
            strokeWidth: strokeThickness
        });

        shapes.push(currentStroke);
        currentShape = currentStroke;
    } else if (isSelectionToolActive) {
        let clickedOnShape = false;
        
        // Check if clicking on current selected stroke
        if (currentShape && currentShape.shapeName === 'freehandStroke' && currentShape.isSelected) {
            const anchorInfo = currentShape.isNearAnchor(x, y);
            if (anchorInfo) {
                if (anchorInfo.type === 'resize') {
                    isResizingStroke = true;
                    resizingAnchorIndex = anchorInfo.index;
                    dragOldPosStroke = cloneStrokeData(currentShape);
                } else if (anchorInfo.type === 'rotate') {
                    isRotatingStroke = true;
                    const centerX = currentShape.boundingBox.x + currentShape.boundingBox.width / 2;
                    const centerY = currentShape.boundingBox.y + currentShape.boundingBox.height / 2;
                    startRotationMouseAngle = Math.atan2(y - centerY, x - centerX) * 180 / Math.PI;
                    startShapeRotation = currentShape.rotation;
                    dragOldPosStroke = cloneStrokeData(currentShape);
                }
                clickedOnShape = true;
            } else if (currentShape.contains(x, y)) {
                isDraggingStroke = true;
                dragOldPosStroke = cloneStrokeData(currentShape);
                
                // Store initial frame state
                draggedShapeInitialFrameStroke = currentShape.parentFrame || null;
                
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
                if (shape instanceof FreehandStroke && shape.contains(x, y)) {
                    shapeToSelect = shape;
                    break;
                }
            }

            if (currentShape && currentShape !== shapeToSelect) {
                currentShape.deselectStroke();
                currentShape = null;
            }

            if (shapeToSelect) {
                currentShape = shapeToSelect;
                currentShape.selectStroke(); // This will show the sidebar
                
                const anchorInfo = currentShape.isNearAnchor(x, y);
                if (anchorInfo) {
                    if (anchorInfo.type === 'resize') {
                        isResizingStroke = true;
                        resizingAnchorIndex = anchorInfo.index;
                        dragOldPosStroke = cloneStrokeData(currentShape);
                    } else if (anchorInfo.type === 'rotate') {
                        isRotatingStroke = true;
                        const centerX = currentShape.boundingBox.x + currentShape.boundingBox.width / 2;
                        const centerY = currentShape.boundingBox.y + currentShape.boundingBox.height / 2;
                        startRotationMouseAngle = Math.atan2(y - centerY, x - centerX) * 180 / Math.PI;
                        startShapeRotation = currentShape.rotation;
                        dragOldPosStroke = cloneStrokeData(currentShape);
                    }
                } else {
                    isDraggingStroke = true;
                    dragOldPosStroke = cloneStrokeData(currentShape);
                    
                    // Store initial frame state
                    draggedShapeInitialFrameStroke = currentShape.parentFrame || null;
                    
                    // Temporarily remove from frame clipping if dragging
                    if (currentShape.parentFrame) {
                        currentShape.parentFrame.temporarilyRemoveFromFrame(currentShape);
                    }
                    
                    startX = x;
                    startY = y;
                }
                clickedOnShape = true;
            }
        }

        if (!clickedOnShape && currentShape) {
            currentShape.deselectStroke();
            currentShape = null;
            disableAllSideBars(); // Hide sidebar when deselecting
        }
    }
}

function handleMouseMove(e) {
    const { x, y } = getSvgCoordinates(e);
    const currentTime = Date.now();
    
    // Keep lastMousePos in screen coordinates for other functions
    const svgRect = svg.getBoundingClientRect();
    lastMousePos = {
        x: e.clientX - svgRect.left, 
        y: e.clientY - svgRect.top
    };
    
    if (isDrawingStroke && isPaintToolActive) {
        const pressure = e.pressure || 0.5;
        
        if (lastPoint) {
            const dx = x - lastPoint[0];
            const dy = y - lastPoint[1];
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // Only add point if it's far enough from the last one
            if (distance >= minDistance) {
                // If distance is too large, interpolate points
                if (distance > maxDistance) {
                    const steps = Math.ceil(distance / maxDistance);
                    for (let i = 1; i < steps; i++) {
                        const t = i / steps;
                        const interpX = lastPoint[0] + dx * t;
                        const interpY = lastPoint[1] + dy * t;
                        const interpPressure = lastPoint[2] + (pressure - lastPoint[2]) * t;
                        points.push([interpX, interpY, interpPressure]);
                    }
                }
                
                // Calculate velocity-based pressure
                const timeDelta = currentTime - lastTime;
                const velocity = distance / Math.max(timeDelta, 1);
                const velocityPressure = Math.min(1, Math.max(0.1, 1 - velocity * 0.02));
                const finalPressure = (pressure + velocityPressure) * 0.5;
                
                points.push([x, y, finalPressure]);
                currentStroke.points = points;
                currentStroke.draw();
                
                lastPoint = [x, y, finalPressure];
                lastTime = currentTime;
            }
        } else {
            lastPoint = [x, y, pressure];
            lastTime = currentTime;
        }
        
        // Check for frame containment while drawing (but don't apply clipping yet)
        shapes.forEach(frame => {
            if (frame.shapeName === 'frame') {
                if (frame.isShapeInFrame(currentStroke)) {
                    frame.highlightFrame();
                    hoveredFrameStroke = frame;
                } else if (hoveredFrameStroke === frame) {
                    frame.removeHighlight();
                    hoveredFrameStroke = null;
                }
            }
        });
    } else if (isDraggingStroke && currentShape && currentShape.isSelected) {
        const dx = x - startX;
        const dy = y - startY;
        currentShape.move(dx, dy);
        startX = x;
        startY = y;
        currentShape.draw();
    } else if (isResizingStroke && currentShape && currentShape.isSelected) {
        currentShape.updatePosition(resizingAnchorIndex, x, y);
    } else if (isRotatingStroke && currentShape && currentShape.isSelected) {
        const centerX = currentShape.boundingBox.x + currentShape.boundingBox.width / 2;
        const centerY = currentShape.boundingBox.y + currentShape.boundingBox.height / 2;
        const currentMouseAngle = Math.atan2(y - centerY, x - centerX) * 180 / Math.PI;
        const angleDiff = currentMouseAngle - startRotationMouseAngle;
        currentShape.rotate(startShapeRotation + angleDiff);
        currentShape.draw();
    }
}

function handleMouseUp(e) {
    if (isDrawingStroke) {
        isDrawingStroke = false;
        lastPoint = null;
        
        // Final smoothing pass after drawing is complete
        if (currentStroke && currentStroke.points.length >= 2) {
            currentStroke.draw(); // Redraw with final smoothing
            pushCreateAction(currentStroke);
            
            // Check for frame containment and track attachment
            const finalFrame = hoveredFrameStroke;
            if (finalFrame) {
                finalFrame.addShapeToFrame(currentStroke);
                // Track the attachment for undo
                pushFrameAttachmentAction(finalFrame, currentStroke, 'attach', null);
            }
        } else if (currentStroke) {
            // Remove strokes that are too small
            shapes.pop();
            if (currentStroke.group.parentNode) {
                currentStroke.group.parentNode.removeChild(currentStroke.group);
            }
        }
        
        // Clear frame highlighting
        if (hoveredFrameStroke) {
            hoveredFrameStroke.removeHighlight();
            hoveredFrameStroke = null;
        }
        
        currentStroke = null;
    }
    
    if ((isDraggingStroke || isResizingStroke || isRotatingStroke) && dragOldPosStroke && currentShape) {
        const newPos = cloneStrokeData(currentShape);
        const stateChanged = 
            JSON.stringify(dragOldPosStroke.points) !== JSON.stringify(newPos.points) ||
            dragOldPosStroke.rotation !== newPos.rotation;
        
        const oldPos = {
            ...dragOldPosStroke,
            parentFrame: draggedShapeInitialFrameStroke
        };
        const newPosForUndo = {
            ...newPos,
            parentFrame: currentShape.parentFrame
        };
        
        const frameChanged = oldPos.parentFrame !== newPosForUndo.parentFrame;
        
        if (stateChanged || frameChanged) {
            pushTransformAction(currentShape, oldPos, newPosForUndo);
        }
        
        // Handle frame containment changes after drag
        if (isDraggingStroke) {
            const finalFrame = hoveredFrameStroke;
            
            // If shape moved to a different frame
            if (draggedShapeInitialFrameStroke !== finalFrame) {
                // Remove from initial frame
                if (draggedShapeInitialFrameStroke) {
                    draggedShapeInitialFrameStroke.removeShapeFromFrame(currentShape);
                }
                
                // Add to new frame
                if (finalFrame) {
                    finalFrame.addShapeToFrame(currentShape);
                }
                
                // Track the frame change for undo
                if (frameChanged) {
                    pushFrameAttachmentAction(finalFrame || draggedShapeInitialFrameStroke, currentShape, 
                        finalFrame ? 'attach' : 'detach', draggedShapeInitialFrameStroke);
                }
            } else if (draggedShapeInitialFrameStroke) {
                // Shape stayed in same frame, restore clipping
                draggedShapeInitialFrameStroke.restoreToFrame(currentShape);
            }
        }
        
        dragOldPosStroke = null;
        draggedShapeInitialFrameStroke = null;
    }
    
    // Clear frame highlighting
    if (hoveredFrameStroke) {
        hoveredFrameStroke.removeHighlight();
        hoveredFrameStroke = null;
    }
    
    isDraggingStroke = false;
    isResizingStroke = false;
    isRotatingStroke = false;
    resizingAnchorIndex = null;
    startRotationMouseAngle = null;
    startShapeRotation = null;
    svg.style.cursor = 'default';
}

// Color and thickness selection
strokeColors.forEach(span => {
    span.addEventListener("click", (event) => {
        strokeColors.forEach(el => el.classList.remove("selected"));
        span.classList.add("selected");
        
        if (currentShape instanceof FreehandStroke && currentShape.isSelected) {
            const oldOptions = {...currentShape.options};
            currentShape.options.stroke = span.getAttribute("data-id");
            currentShape.draw();
            pushOptionsChangeAction(currentShape, oldOptions);
        } else {
            strokeColor = span.getAttribute("data-id");
        }
    });
});

strokeThicknesses.forEach(span => {
    span.addEventListener("click", (event) => {
        strokeThicknesses.forEach(el => el.classList.remove("selected"));
        span.classList.add("selected");
        
        if (currentShape instanceof FreehandStroke && currentShape.isSelected) {
            const oldOptions = {...currentShape.options};
            currentShape.options.strokeWidth = parseInt(span.getAttribute("data-id"));
            currentShape.draw();
            pushOptionsChangeAction(currentShape, oldOptions);
        } else {
            strokeThickness = parseInt(span.getAttribute("data-id"));
        }
    });
});


document.getElementById("strokeOpacity").addEventListener("mousedown", (event) => {
    isdraggingOpacity = true;
});

document.getElementById("strokeOpacity").addEventListener("mousemove", (event) => {
    if(isdraggingOpacity) 
    {
        const slider = document.getElementById("strokeOpacity");
        const rect = slider.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const percent = Math.max(0, Math.min(100, (mouseX / rect.width) * 100));
        document.getElementById("opacityContainerValue").textContent = percent.toFixed(0);
        const opacity = percent / 100; 
        if (currentShape instanceof FreehandStroke && currentShape.isSelected) {
            const oldOptions = {...currentShape.options};
            currentShape.options.strokeOpacity = opacity; 
            currentShape.draw();
            pushOptionsChangeAction(currentShape, oldOptions);
        } else {
            strokeOpacity = opacity; 
        }
    }
});

document.getElementById("strokeOpacity").addEventListener("mouseup", (event) => {
    isdraggingOpacity = false;
});

function cloneOptions(options) {
    return JSON.parse(JSON.stringify(options));
}

function cloneStrokeData(stroke) {
    return {
        points: JSON.parse(JSON.stringify(stroke.points)),
        rotation: stroke.rotation,
        options: cloneOptions(stroke.options)
    };
}

// Copy/paste functionality
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        if (currentShape && currentShape.shapeName === 'freehandStroke' && currentShape.isSelected) {
            copiedShapeData = cloneStrokeData(currentShape);
        }
    }
});

document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        if (copiedShapeData) {
            e.preventDefault();
            let pasteX, pasteY;
            if (lastMousePos && typeof lastMousePos.x === 'number' && typeof lastMousePos.y === 'number') {
                const svgPoint = svg.createSVGPoint();
                svgPoint.x = lastMousePos.x;
                svgPoint.y = lastMousePos.y;
                const CTM = svg.getScreenCTM().inverse();
                const userPoint = svgPoint.matrixTransform(CTM);
                pasteX = userPoint.x;
                pasteY = userPoint.y;
            } else {
                const svgRect = svg.getBoundingClientRect();
                pasteX = svgRect.width / 2;
                pasteY = svgRect.height / 2;
                const svgPoint = svg.createSVGPoint();
                svgPoint.x = pasteX;
                svgPoint.y = pasteY;
                const CTM = svg.getScreenCTM().inverse();
                const userPoint = svgPoint.matrixTransform(CTM);
                pasteX = userPoint.x;
                pasteY = userPoint.y;
            }

            shapes.forEach(shape => {
                if (shape.isSelected) {
                    shape.removeSelection();
                }
            });

            currentShape = null;
            disableAllSideBars();
            
            const offset = 20;
            const offsetPoints = copiedShapeData.points.map(point => [
                point[0] + offset, 
                point[1] + offset, 
                point[2] || 0.5
            ]);
            
            const newStroke = new FreehandStroke(offsetPoints, cloneOptions(copiedShapeData.options));
            newStroke.rotation = copiedShapeData.rotation;
            
            shapes.push(newStroke);
            newStroke.isSelected = true;
            currentShape = newStroke;
            newStroke.draw();
            pushCreateAction(newStroke);
        }
    }
});

// Event listeners
// svg.addEventListener('mousedown', handleMouseDown);
// svg.addEventListener('mousemove', handleMouseMove);
// svg.addEventListener('mouseup', handleMouseUp);

export 
{
    handleMouseDown as handleFreehandMouseDown,
    handleMouseMove as handleFreehandMouseMove,
    handleMouseUp as handleFreehandMouseUp,
}