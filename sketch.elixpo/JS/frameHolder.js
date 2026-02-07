import { pushCreateAction, pushDeleteAction, pushTransformAction, pushFrameAttachmentAction } from './undoAndRedo.js';
import { updateAttachedArrows } from './drawArrow.js';
let currentFrame = null;
let isResizing = false;
let isDragging = false;
let activeAnchor = null;
let isDrawingFrame = false;
let frameStrokeColor = "#888";
let frameStrokeThickness = 2;
let frameFillColor = "transparent";
let frameOpacity = 1;
let startX, startY;
let dragOldPosFrame = null;
let copiedFrameData = null;

function getSVGCoordsFromMouse(e) {
    const viewBox = svg.viewBox.baseVal;
    const rect = svg.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const svgX = viewBox.x + (mouseX / rect.width) * viewBox.width;
    const svgY = viewBox.y + (mouseY / rect.height) * viewBox.height;
    return { x: svgX, y: svgY };
}

class Frame {
    constructor(x, y, width, height, options = {}) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.rotation = options.rotation || 0;
        this.frameName = options.frameName || "Frame";
        this.options = {
            stroke: options.stroke || frameStrokeColor,
            strokeWidth: options.strokeWidth || frameStrokeThickness,
            fill: options.fill || frameFillColor,
            opacity: options.opacity || frameOpacity,
            ...options
        };

        this.element = null;
        this.group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        this.isSelected = false;
        this.anchors = [];
        this.shapeName = "frame";
        this.shapeID = `frame-${String(Date.now()).slice(0, 8)}-${Math.floor(Math.random() * 10000)}`;
        this.group.setAttribute('id', this.shapeID);

        // Create clipping group for contained shapes
        this.clipGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        this.clipPath = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
        this.clipRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        
        // Set up clipping
        this.clipId = `clip-${this.shapeID}`;
        this.clipPath.setAttribute('id', this.clipId);
        this.clipPath.appendChild(this.clipRect);
        this.clipGroup.setAttribute('clip-path', `url(#${this.clipId})`);
        
        // Add clip path to defs
        let defs = svg.querySelector('defs');
        if (!defs) {
            defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
            svg.appendChild(defs);
        }
        defs.appendChild(this.clipPath);

        // Array to hold shapes inside this frame
        this.containedShapes = [];

        svg.appendChild(this.group);
        svg.appendChild(this.clipGroup);
        this.draw();
        this.updateClipPath();
    }

    draw() {
        // Clear previous elements
        while (this.group.firstChild) {
            this.group.removeChild(this.group.firstChild);
        }
        this.anchors = [];

        // Create the frame rectangle
        const frameRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        frameRect.setAttribute("x", this.x);
        frameRect.setAttribute("y", this.y);
        frameRect.setAttribute("width", this.width);
        frameRect.setAttribute("height", this.height);
        frameRect.setAttribute("stroke", this.options.stroke);
        frameRect.setAttribute("stroke-width", this.options.strokeWidth);
        frameRect.setAttribute("fill", this.options.fill);
        frameRect.setAttribute("opacity", this.options.opacity);
        frameRect.setAttribute("stroke-dasharray", "5,5"); 
        frameRect.classList.add("frame-rect");

        // Apply rotation
        if (this.rotation !== 0) {
            const centerX = this.x + this.width / 2;
            const centerY = this.y + this.height / 2;
            frameRect.setAttribute("transform", `rotate(${this.rotation}, ${centerX}, ${centerY})`);
        }

        this.element = frameRect;
        this.group.appendChild(this.element);

        // Add label
        this.addFrameLabel();

        // Add selection anchors if selected
        if (this.isSelected) {
            this.addAnchors();
        }

        // Update clip path
        this.updateClipPath();
    }

    updateAttachedArrows() {
    if (typeof shapes !== 'undefined' && Array.isArray(shapes)) {
        shapes.forEach(shape => {
            if (shape.shapeName === 'arrow') {
                let needsUpdate = false;
                
                // Check if arrow is attached to this frame
                if (shape.attachedToStart && shape.attachedToStart.shape === this) {
                    needsUpdate = true;
                }
                if (shape.attachedToEnd && shape.attachedToEnd.shape === this) {
                    needsUpdate = true;
                }
                
                if (needsUpdate) {
                    shape.updateAttachments();
                }
            }
        });
    }
    }

    updateClipPath() {
        // Update the clipping rectangle to match frame dimensions
        this.clipRect.setAttribute("x", this.x);
        this.clipRect.setAttribute("y", this.y);
        this.clipRect.setAttribute("width", this.width);
        this.clipRect.setAttribute("height", this.height);
        
        if (this.rotation !== 0) {
            const centerX = this.x + this.width / 2;
            const centerY = this.y + this.height / 2;
            this.clipRect.setAttribute("transform", `rotate(${this.rotation}, ${centerX}, ${centerY})`);
        } else {
            this.clipRect.removeAttribute("transform");
        }
    }

    addShapeToFrame(shape) {
    if (shape && !this.containedShapes.includes(shape)) {
        const oldFrame = shape.parentFrame;
        
        // Remove from other frames first
        shapes.forEach(otherFrame => {
            if (otherFrame.shapeName === 'frame' && otherFrame !== this) {
                otherFrame.removeShapeFromFrame(shape);
            }
        });
        
        this.containedShapes.push(shape);
        shape.parentFrame = this;
        
        // Only move to clipped group if not currently being dragged
        if (shape.group && shape.group.parentNode && !shape.isDraggedOutTemporarily) {
            shape.group.parentNode.removeChild(shape.group);
            this.clipGroup.appendChild(shape.group);
        }
    }
}

    removeShapeFromFrame(shape) {
    const index = this.containedShapes.indexOf(shape);
    if (index > -1) {
        this.containedShapes.splice(index, 1);
        if (shape.parentFrame === this) {
            shape.parentFrame = null;
        }
        
        // Move shape's group back to main SVG if it's in the clipped group
        if (shape.group && shape.group.parentNode === this.clipGroup) {
            this.clipGroup.removeChild(shape.group);
            svg.appendChild(shape.group);
        }
        
        delete shape.isDraggedOutTemporarily;
    }
}

    // Check if a point is inside the frame bounds
    isPointInFrame(x, y) {
        // Simple bounding box check (can be enhanced for rotation)
        return x >= this.x && x <= this.x + this.width &&
               y >= this.y && y <= this.y + this.height;
    }

    // Check if a shape overlaps with this frame
    isShapeInFrame(shape) {
    if (!shape || shape === this) return false;
    
    const shapeX = shape.x || 0;
    const shapeY = shape.y || 0;
    const shapeWidth = shape.width || 0;
    const shapeHeight = shape.height || 0;
    
    // Check if the center of the shape is inside the frame (for better UX)
    const shapeCenterX = shapeX + shapeWidth / 2;
    const shapeCenterY = shapeY + shapeHeight / 2;
    
    return shapeCenterX >= this.x && shapeCenterX <= this.x + this.width &&
           shapeCenterY >= this.y && shapeCenterY <= this.y + this.height;
}

updateContainedShapes(applyClipping = true) {
    // Check all shapes to see if they should be in this frame
    shapes.forEach(shape => {
        if (shape !== this && shape.shapeName !== 'frame') {
            const isInFrame = this.isShapeInFrame(shape);
            const isAlreadyContained = this.containedShapes.includes(shape);
            
            if (isInFrame && !isAlreadyContained) {
                this.addShapeToFrame(shape);
                // Don't apply clipping if we're not supposed to
                if (!applyClipping && shape.group && shape.group.parentNode === this.clipGroup) {
                    this.clipGroup.removeChild(shape.group);
                    svg.appendChild(shape.group);
                    shape.isDraggedOutTemporarily = true;
                }
            } else if (!isInFrame && isAlreadyContained) {
                this.removeShapeFromFrame(shape);
            }
        }
    });
    
    // Update clip path
    this.updateClipPath();
}

highlightFrame() {
    if (this.element) {
        this.element.setAttribute('stroke', '#5B57D1');
        this.element.setAttribute('stroke-width', '3');
        this.element.setAttribute('opacity', '0.7');
    }
}

// Remove frame highlight
removeHighlight() {
    if (this.element) {
        this.element.setAttribute('stroke', this.options.stroke);
        this.element.setAttribute('stroke-width', this.options.strokeWidth);
        this.element.setAttribute('opacity', this.options.opacity);
    }
}
    

move(dx, dy) {
    this.x += dx;
    this.y += dy;
    
    // Move all contained shapes with the frame
    this.containedShapes.forEach(shape => {
        if (shape) {
            // Mark shape as being moved by frame to prevent frame containment updates
            shape.isBeingMovedByFrame = true;
            
            // Move the shape
            shape.x += dx;
            shape.y += dy;
            
            // Update arrows if the shape has them
            if (typeof shape.updateAttachedArrows === 'function') {
                shape.updateAttachedArrows();
            }
            
            // Force redraw the shape
            if (typeof shape.draw === 'function') {
                shape.draw();
            }
            
            // Remove the flag after movement
            delete shape.isBeingMovedByFrame;
        }
    });
    
    // Update arrows attached to this frame
    this.updateAttachedArrows();
    
    this.draw();
    this.updateClipPath();
}

    handleResize(anchorIndex, currentPos, startPos, initialFrame) {
    const dx = currentPos.x - startPos.x;
    const dy = currentPos.y - startPos.y;

    switch (anchorIndex) {
        case 0: // Top-left
            this.x = initialFrame.x + dx;
            this.y = initialFrame.y + dy;
            this.width = Math.max(10, initialFrame.width - dx);
            this.height = Math.max(10, initialFrame.height - dy);
            break;
        case 1: // Top-middle
            this.y = initialFrame.y + dy;
            this.height = Math.max(10, initialFrame.height - dy);
            break;
        case 2: // Top-right
            this.y = initialFrame.y + dy;
            this.width = Math.max(10, initialFrame.width + dx);
            this.height = Math.max(10, initialFrame.height - dy);
            break;
        case 3: // Right-middle
            this.width = Math.max(10, initialFrame.width + dx);
            break;
        case 4: // Bottom-right
            this.width = Math.max(10, initialFrame.width + dx);
            this.height = Math.max(10, initialFrame.height + dy);
            break;
        case 5: // Bottom-middle
            this.height = Math.max(10, initialFrame.height + dy);
            break;
        case 6: // Bottom-left
            this.x = initialFrame.x + dx;
            this.width = Math.max(10, initialFrame.width - dx);
            this.height = Math.max(10, initialFrame.height + dy);
            break;
        case 7: // Left-middle
            this.x = initialFrame.x + dx;
            this.width = Math.max(10, initialFrame.width - dx);
            break;
    }
    
    // Update arrows attached to this frame when resizing
    this.updateAttachedArrows();
    
    // Update contained shapes visibility
    this.updateContainedShapes();
}
    destroy() {
        // Remove all contained shapes from frame and move back to main SVG
        [...this.containedShapes].forEach(shape => {
            this.removeShapeFromFrame(shape);
        });

        // Remove clip path
        if (this.clipPath && this.clipPath.parentNode) {
            this.clipPath.parentNode.removeChild(this.clipPath);
        }

        // Remove groups
        if (this.clipGroup && this.clipGroup.parentNode) {
            this.clipGroup.parentNode.removeChild(this.clipGroup);
        }
        
        if (this.group && this.group.parentNode) {
            this.group.parentNode.removeChild(this.group);
        }

        const index = shapes.indexOf(this);
        if (index > -1) {
            shapes.splice(index, 1);
        }
        if (currentShape === this) {
            currentShape = null;
        }
    }

    addFrameLabel() {
    const labelText = document.createElementNS("http://www.w3.org/2000/svg", "text");
    labelText.setAttribute("x", this.x + 5);
    labelText.setAttribute("y", this.y - 5);
    labelText.setAttribute("font-size", `${12 / currentZoom}px`);
    labelText.setAttribute("fill", this.options.stroke);
    labelText.setAttribute("font-family", "lixFont");
    labelText.textContent = this.frameName || "Frame";
    labelText.style.cursor = "pointer";
    labelText.style.userSelect = "none";
    
    if (this.rotation !== 0) {
        const centerX = this.x + this.width / 2;
        const centerY = this.y + this.height / 2;
        labelText.setAttribute("transform", `rotate(${this.rotation}, ${centerX}, ${centerY})`);
    }
    
    // Add double-click event for renaming
    labelText.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        this.startLabelEdit(labelText);
    });
    
    this.group.appendChild(labelText);
    this.labelElement = labelText;
}

startLabelEdit(labelElement) {
    // Create a foreignObject to hold an HTML input
    const foreignObject = document.createElementNS("http://www.w3.org/2000/svg", "foreignObject");
    foreignObject.setAttribute("x", this.x + 5);
    foreignObject.setAttribute("y", this.y - 20);
    foreignObject.setAttribute("width", Math.max(100, this.width - 10));
    foreignObject.setAttribute("height", 20);
    
    if (this.rotation !== 0) {
        const centerX = this.x + this.width / 2;
        const centerY = this.y + this.height / 2;
        foreignObject.setAttribute("transform", `rotate(${this.rotation}, ${centerX}, ${centerY})`);
    }
    
    // Create input element
    const input = document.createElement("input");
    input.type = "text";
    input.value = this.frameName || "Frame";
    const oldName = this.frameName; // Store old name for undo
    
    input.style.cssText = `
        position: absolute;
        width: 100%;
        height: 20px;
        border: 1px solid #5B57D1;
        background: transparent;
        color: ${this.options.stroke};
        font-family: "lixFont";
        font-size: ${15 / currentZoom}px;
        padding: 2px 10px;
        margin: 0;
        outline: none;
        border-radius: 2px;
        box-sizing: border-box;
    `;
    
    foreignObject.appendChild(input);
    this.group.appendChild(foreignObject);
    
    // Hide the original label
    labelElement.style.display = "none";
    
    // Focus and select the text
    setTimeout(() => {
        input.focus();
        input.select();
    }, 10);
    
    const finishEdit = () => {
        const newName = input.value.trim() || "Frame";
        
        // Track name change in undo system if it actually changed
        if (newName !== oldName) {
            pushTransformAction(this, 
                { 
                    x: this.x, 
                    y: this.y, 
                    width: this.width, 
                    height: this.height, 
                    rotation: this.rotation,
                    frameName: oldName 
                },
                { 
                    x: this.x, 
                    y: this.y, 
                    width: this.width, 
                    height: this.height, 
                    rotation: this.rotation,
                    frameName: newName 
                }
            );
        }
        
        this.frameName = newName;
        
        // Remove the input
        this.group.removeChild(foreignObject);
        
        // Show and update the label
        labelElement.style.display = "block";
        labelElement.textContent = this.frameName;
        
        this.labelElement = labelElement;
    };
    
    // Handle input events
    input.addEventListener('blur', finishEdit);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            finishEdit();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            // Cancel edit - restore original name
            this.group.removeChild(foreignObject);
            labelElement.style.display = "block";
        }
    });
    
    // Prevent the input from interfering with other interactions
    input.addEventListener('mousedown', (e) => e.stopPropagation());
    input.addEventListener('mousemove', (e) => e.stopPropagation());
    input.addEventListener('mouseup', (e) => e.stopPropagation());
}
    selectFrame() {
        this.isSelected = true;
        this.draw();
    }

    removeSelection() {
        this.anchors.forEach(anchor => {
            if (anchor.parentNode) {
                anchor.parentNode.removeChild(anchor);
            }
        });
        this.anchors = [];
        this.isSelected = false;
        this.draw();
    }

    addAnchors() {
    const anchorSize = 8 / currentZoom;
    const anchorStrokeWidth = 2 / currentZoom;

    // Calculate anchor positions (corners + midpoints + rotation handle)
    const anchorPositions = [
        { x: this.x, y: this.y, cursor: 'nw-resize', type: 'corner' }, // Top-left
        { x: this.x + this.width / 2, y: this.y, cursor: 'n-resize', type: 'edge' }, // Top-middle
        { x: this.x + this.width, y: this.y, cursor: 'ne-resize', type: 'corner' }, // Top-right
        { x: this.x + this.width, y: this.y + this.height / 2, cursor: 'e-resize', type: 'edge' }, // Right-middle
        { x: this.x + this.width, y: this.y + this.height, cursor: 'se-resize', type: 'corner' }, // Bottom-right
        { x: this.x + this.width / 2, y: this.y + this.height, cursor: 's-resize', type: 'edge' }, // Bottom-middle
        { x: this.x, y: this.y + this.height, cursor: 'sw-resize', type: 'corner' }, // Bottom-left
        { x: this.x, y: this.y + this.height / 2, cursor: 'w-resize', type: 'edge' }, // Left-middle
    ];

    // Add rotation handle
    const rotationHandleDistance = 30 / currentZoom;
    const rotationHandle = {
        x: this.x + this.width / 2,
        y: this.y - rotationHandleDistance,
        cursor: 'grab',
        type: 'rotation'
    };
    anchorPositions.push(rotationHandle);

    // Create selection outline first (behind anchors)
    const outline = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    outline.setAttribute('x', this.x);
    outline.setAttribute('y', this.y);
    outline.setAttribute('width', this.width);
    outline.setAttribute('height', this.height);
    outline.setAttribute('fill', 'none');
    outline.setAttribute('stroke', '#5B57D1');
    outline.setAttribute('stroke-width', 1.5);
    outline.setAttribute('stroke-dasharray', '4 2');
    outline.setAttribute('style', 'pointer-events: none;');

    // Apply rotation to outline if needed
    if (this.rotation !== 0) {
        const centerX = this.x + this.width / 2;
        const centerY = this.y + this.height / 2;
        outline.setAttribute('transform', `rotate(${this.rotation}, ${centerX}, ${centerY})`);
    }

    this.group.appendChild(outline);
    this.selectionOutline = outline;

    anchorPositions.forEach((position, index) => {
        let anchor;
        
        if (position.type === 'rotation') {
            // Create rotation handle (circle)
            anchor = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            anchor.setAttribute("cx", position.x);
            anchor.setAttribute("cy", position.y);
            anchor.setAttribute("r", anchorSize);
            anchor.setAttribute("fill", "#121212");  
            anchor.setAttribute("stroke", "#5B57D1"); 
            anchor.setAttribute("stroke-width", anchorStrokeWidth);
            
            // Add rotation line
            const rotationLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
            rotationLine.setAttribute("x1", this.x + this.width / 2);
            rotationLine.setAttribute("y1", this.y);
            rotationLine.setAttribute("x2", position.x);
            rotationLine.setAttribute("y2", position.y);
            rotationLine.setAttribute("stroke", "#5B57D1"); 
            rotationLine.setAttribute("stroke-width", anchorStrokeWidth);
            
            // Apply rotation to rotation line if needed
            if (this.rotation !== 0) {
                const centerX = this.x + this.width / 2;
                const centerY = this.y + this.height / 2;
                rotationLine.setAttribute('transform', `rotate(${this.rotation}, ${centerX}, ${centerY})`);
            }
            
            this.group.appendChild(rotationLine);
        } else {
            // Create resize handle (rectangle)
            anchor = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            anchor.setAttribute("x", position.x - anchorSize / 2);
            anchor.setAttribute("y", position.y - anchorSize / 2);
            anchor.setAttribute("width", anchorSize);
            anchor.setAttribute("height", anchorSize);
            anchor.setAttribute("fill", "#121212");  
            anchor.setAttribute("stroke", "#5B57D1"); 
            anchor.setAttribute("stroke-width", anchorStrokeWidth);
        }

        // Apply rotation to anchor if needed
        if (this.rotation !== 0) {
            const centerX = this.x + this.width / 2;
            const centerY = this.y + this.height / 2;
            anchor.setAttribute('transform', `rotate(${this.rotation}, ${centerX}, ${centerY})`);
        }

        anchor.style.cursor = position.cursor;
        anchor.addEventListener('mousedown', (e) => this.startAnchorDrag(e, index));
        
        this.anchors.push(anchor);
        this.group.appendChild(anchor);
    });
    }

    startAnchorDrag(e, index) {
        e.stopPropagation();
        e.preventDefault();

        // Store initial state for undo
        dragOldPosFrame = {
            x: this.x,
            y: this.y,
            width: this.width,
            height: this.height,
            rotation: this.rotation
        };

        const startMousePos = getSVGCoordsFromMouse(e);
        const initialFrame = {
            x: this.x,
            y: this.y,
            width: this.width,
            height: this.height,
            rotation: this.rotation
        };

        const onPointerMove = (event) => {
            const currentMousePos = getSVGCoordsFromMouse(event);
            
            if (index === 8) { // Rotation handle
                this.handleRotation(currentMousePos, initialFrame);
            } else {
                this.handleResize(index, currentMousePos, startMousePos, initialFrame);
            }
            
            this.draw();
            this.updateContainedShapes();
        };

        const onPointerUp = () => {
            if (dragOldPosFrame) {
                const newPos = {
                    x: this.x,
                    y: this.y,
                    width: this.width,
                    height: this.height,
                    rotation: this.rotation
                };
                pushTransformAction(this, dragOldPosFrame, newPos);
                dragOldPosFrame = null;
            }
            
            svg.removeEventListener('pointermove', onPointerMove);
            svg.removeEventListener('pointerup', onPointerUp);
            svg.style.cursor = 'default';
        };

        svg.addEventListener('pointermove', onPointerMove);
        svg.addEventListener('pointerup', onPointerUp);
    }

    handleRotation(mousePos, initialFrame) {
        const centerX = initialFrame.x + initialFrame.width / 2;
        const centerY = initialFrame.y + initialFrame.height / 2;
        
        const angle = Math.atan2(mousePos.y - centerY, mousePos.x - centerX);
        const newRotation = (angle * 180 / Math.PI + 90) % 360;
        const angleDiff = newRotation - this.rotation;
        const angleRad = angleDiff * Math.PI / 180;
        const cosAngle = Math.cos(angleRad);
        const sinAngle = Math.sin(angleRad);
        
        // Store the rotation center for contained shapes
        const rotationCenter = { x: centerX, y: centerY };
        
        // Rotate all contained shapes around the frame's center
        this.containedShapes.forEach(shape => {
            if (!shape) return;
            
            // Mark shape as being moved by frame to prevent frame containment updates
            shape.isBeingMovedByFrame = true;
            
            switch (shape.shapeName) {
                case 'rectangle':
                case 'frame':
                case 'image':
                case 'icon':
                    // Get shape's current center
                    const shapeCenterX = shape.x + shape.width / 2;
                    const shapeCenterY = shape.y + shape.height / 2;
                    
                    // Calculate relative position from rotation center
                    const relativeX = shapeCenterX - rotationCenter.x;
                    const relativeY = shapeCenterY - rotationCenter.y;
                    
                    // Apply rotation to get new center position
                    const newCenterX = rotationCenter.x + (relativeX * cosAngle - relativeY * sinAngle);
                    const newCenterY = rotationCenter.y + (relativeX * sinAngle + relativeY * cosAngle);
                    
                    // Update shape position
                    shape.x = newCenterX - shape.width / 2;
                    shape.y = newCenterY - shape.height / 2;
                    shape.rotation = (shape.rotation || 0) + angleDiff;
                    
                    if (typeof shape.draw === 'function') {
                        shape.draw();
                    }
                    break;
                    
                case 'circle':
                    // Get circle's center
                    const circleCenterX = shape.x;
                    const circleCenterY = shape.y;
                    
                    // Calculate relative position from rotation center
                    const relativeCircleX = circleCenterX - rotationCenter.x;
                    const relativeCircleY = circleCenterY - rotationCenter.y;
                    
                    // Apply rotation
                    const newCircleCenterX = rotationCenter.x + (relativeCircleX * cosAngle - relativeCircleY * sinAngle);
                    const newCircleCenterY = rotationCenter.y + (relativeCircleX * sinAngle + relativeCircleY * cosAngle);
                    
                    shape.x = newCircleCenterX;
                    shape.y = newCircleCenterY;
                    shape.rotation = (shape.rotation || 0) + angleDiff;
                    
                    if (typeof shape.draw === 'function') {
                        shape.draw();
                    }
                    break;
                    
                case 'line':
                case 'arrow':
                    // Calculate relative positions for start and end points
                    const relativeStartX = shape.startPoint.x - rotationCenter.x;
                    const relativeStartY = shape.startPoint.y - rotationCenter.y;
                    const relativeEndX = shape.endPoint.x - rotationCenter.x;
                    const relativeEndY = shape.endPoint.y - rotationCenter.y;
                    
                    // Apply rotation to both points
                    const newStartX = rotationCenter.x + (relativeStartX * cosAngle - relativeStartY * sinAngle);
                    const newStartY = rotationCenter.y + (relativeStartX * sinAngle + relativeStartY * cosAngle);
                    const newEndX = rotationCenter.x + (relativeEndX * cosAngle - relativeEndY * sinAngle);
                    const newEndY = rotationCenter.y + (relativeEndX * sinAngle + relativeEndY * cosAngle);
                    
                    shape.startPoint.x = newStartX;
                    shape.startPoint.y = newStartY;
                    shape.endPoint.x = newEndX;
                    shape.endPoint.y = newEndY;
                    
                    if (shape.shapeName === 'arrow' && shape.arrowCurved && typeof shape.initializeCurveControlPoints === 'function') {
                        shape.initializeCurveControlPoints();
                    }
                    if (typeof shape.draw === 'function') {
                        shape.draw();
                    }
                    break;
                    
                case 'text':
                    // Get text bounds for center calculation
                    const textElement = shape.group ? shape.group.querySelector('text') : null;
                    if (textElement) {
                        const bbox = textElement.getBBox();
                        const transform = shape.group.transform.baseVal.consolidate();
                        const matrix = transform ? transform.matrix : { e: 0, f: 0 };
                        
                        const textCenterX = bbox.x + matrix.e + bbox.width / 2;
                        const textCenterY = bbox.y + matrix.f + bbox.height / 2;
                        
                        // Calculate relative position
                        const relativeTextX = textCenterX - rotationCenter.x;
                        const relativeTextY = textCenterY - rotationCenter.y;
                        
                        // Apply rotation
                        const newTextCenterX = rotationCenter.x + (relativeTextX * cosAngle - relativeTextY * sinAngle);
                        const newTextCenterY = rotationCenter.y + (relativeTextX * sinAngle + relativeTextY * cosAngle);
                        
                        // Update text position
                        const newTransformX = newTextCenterX - bbox.width / 2;
                        const newTransformY = newTextCenterY - bbox.height / 2;
                        const newRotation = (shape.rotation || 0) + angleDiff;
                        
                        const textCenterRelativeX = bbox.width / 2;
                        const textCenterRelativeY = bbox.height / 2;
                        
                        shape.group.setAttribute('transform',
                            `translate(${newTransformX}, ${newTransformY}) rotate(${newRotation}, ${textCenterRelativeX}, ${textCenterRelativeY})`
                        );
                        
                        shape.x = newTransformX;
                        shape.y = newTransformY;
                        shape.rotation = newRotation;
                    }
                    break;
                    
                case 'freehandStroke':
                    if (shape.points && Array.isArray(shape.points)) {
                        // Rotate each point in the stroke
                        shape.points = shape.points.map(point => {
                            if (!Array.isArray(point) || point.length < 2) return point;
                            
                            const relativePointX = point[0] - rotationCenter.x;
                            const relativePointY = point[1] - rotationCenter.y;
                            
                            const newPointX = rotationCenter.x + (relativePointX * cosAngle - relativePointY * sinAngle);
                            const newPointY = rotationCenter.y + (relativePointX * sinAngle + relativePointY * cosAngle);
                            
                            return [newPointX, newPointY, point[2] || 0.5];
                        });
                        
                        if (typeof shape.updateBoundingBox === 'function') {
                            shape.updateBoundingBox();
                        }
                        if (typeof shape.draw === 'function') {
                            shape.draw();
                        }
                    }
                    break;
            }
            
            // Update arrows attached to the contained shape
            if (typeof shape.updateAttachedArrows === 'function') {
                shape.updateAttachedArrows();
            }
            
            // Remove the flag after rotation
            delete shape.isBeingMovedByFrame;
        });
        
        // Update the frame's rotation
        this.rotation = newRotation;
        
        // Update arrows attached to this frame
        this.updateAttachedArrows();
    }

    handleResize(anchorIndex, currentPos, startPos, initialFrame) {
        const dx = currentPos.x - startPos.x;
        const dy = currentPos.y - startPos.y;

        switch (anchorIndex) {
            case 0: // Top-left
                this.x = initialFrame.x + dx;
                this.y = initialFrame.y + dy;
                this.width = Math.max(10, initialFrame.width - dx);
                this.height = Math.max(10, initialFrame.height - dy);
                break;
            case 1: // Top-middle
                this.y = initialFrame.y + dy;
                this.height = Math.max(10, initialFrame.height - dy);
                break;
            case 2: // Top-right
                this.y = initialFrame.y + dy;
                this.width = Math.max(10, initialFrame.width + dx);
                this.height = Math.max(10, initialFrame.height - dy);
                break;
            case 3: // Right-middle
                this.width = Math.max(10, initialFrame.width + dx);
                break;
            case 4: // Bottom-right
                this.width = Math.max(10, initialFrame.width + dx);
                this.height = Math.max(10, initialFrame.height + dy);
                break;
            case 5: // Bottom-middle
                this.height = Math.max(10, initialFrame.height + dy);
                break;
            case 6: // Bottom-left
                this.x = initialFrame.x + dx;
                this.width = Math.max(10, initialFrame.width - dx);
                this.height = Math.max(10, initialFrame.height + dy);
                break;
            case 7: // Left-middle
                this.x = initialFrame.x + dx;
                this.width = Math.max(10, initialFrame.width - dx);
                break;
        }
        
        // Update contained shapes visibility
        this.updateContainedShapes();
    }
    
    temporarilyRemoveFromFrame(shape) {
    if (shape && shape.parentFrame === this) {
        // Move shape back to main SVG temporarily (without removing from containedShapes array)
        if (shape.group && shape.group.parentNode === this.clipGroup) {
            this.clipGroup.removeChild(shape.group);
            svg.appendChild(shape.group);
        }
        shape.isDraggedOutTemporarily = true;
    }
}

// Add a method to restore clipping for a shape after drag
restoreToFrame(shape) {
    if (shape && shape.parentFrame === this && shape.isDraggedOutTemporarily) {
        // Move shape back to clipped group
        if (shape.group && shape.group.parentNode === svg) {
            svg.removeChild(shape.group);
            this.clipGroup.appendChild(shape.group);
        }
        delete shape.isDraggedOutTemporarily;
    }
}


    contains(viewBoxX, viewBoxY) {
        // Simple point-in-rectangle test (without rotation for now)
        return viewBoxX >= this.x && viewBoxX <= this.x + this.width &&
               viewBoxY >= this.y && viewBoxY <= this.y + this.height;
    }

    // Arrow attachment support (similar to other shapes)
    getAttachmentPoint(point, tolerance = 20) {
        const rect = {
            left: this.x,
            right: this.x + this.width,
            top: this.y,
            bottom: this.y + this.height
        };

        const distances = {
            top: Math.abs(point.y - rect.top),
            bottom: Math.abs(point.y - rect.bottom),
            left: Math.abs(point.x - rect.left),
            right: Math.abs(point.x - rect.right)
        };

        let closestSide = null;
        let minDistance = tolerance;

        for (let side in distances) {
            if (distances[side] < minDistance &&
                ((side === 'top' || side === 'bottom') && point.x >= rect.left && point.x <= rect.right) ||
                ((side === 'left' || side === 'right') && point.y >= rect.top && point.y <= rect.bottom)) {
                minDistance = distances[side];
                closestSide = side;
            }
        }

        if (closestSide) {
            let attachPoint;
            const offset = { x: 0, y: 0 };

            switch (closestSide) {
                case 'top':
                    attachPoint = { x: point.x, y: rect.top };
                    offset.x = point.x - (rect.left + this.width / 2);
                    break;
                case 'bottom':
                    attachPoint = { x: point.x, y: rect.bottom };
                    offset.x = point.x - (rect.left + this.width / 2);
                    break;
                case 'left':
                    attachPoint = { x: rect.left, y: point.y };
                    offset.y = point.y - (rect.top + this.height / 2);
                    break;
                case 'right':
                    attachPoint = { x: rect.right, y: point.y };
                    offset.y = point.y - (rect.top + this.height / 2);
                    break;
            }

            return { point: attachPoint, side: closestSide, offset, shape: this };
        }

        return null;
    }

    updateStyle(newOptions) {
        Object.keys(newOptions).forEach(key => newOptions[key] === undefined && delete newOptions[key]);
        this.options = { ...this.options, ...newOptions };
        this.draw();
    }

    destroy() {
        // Remove all contained shapes from frame and move back to main SVG
        [...this.containedShapes].forEach(shape => {
            this.removeShapeFromFrame(shape);
        });

        // Remove clip path
        if (this.clipPath && this.clipPath.parentNode) {
            this.clipPath.parentNode.removeChild(this.clipPath);
        }

        // Remove groups
        if (this.clipGroup && this.clipGroup.parentNode) {
            this.clipGroup.parentNode.removeChild(this.clipGroup);
        }
        
        if (this.group && this.group.parentNode) {
            this.group.parentNode.removeChild(this.group);
        }

        const index = shapes.indexOf(this);
        if (index > -1) {
            shapes.splice(index, 1);
        }
        if (currentShape === this) {
            currentShape = null;
        }
    }
}

// Event handlers for frame tool
const handleMouseDown = (e) => {
    if (!isFrameToolActive && !isSelectionToolActive) return;

    const { x, y } = getSVGCoordsFromMouse(e);

    if (isFrameToolActive) {
        isDrawingFrame = true;
        startX = x;
        startY = y;
        currentFrame = new Frame(x, y, 0, 0, {
            stroke: frameStrokeColor,
            strokeWidth: frameStrokeThickness,
            fill: frameFillColor,
            opacity: frameOpacity
        });
        shapes.push(currentFrame);
        currentShape = currentFrame;
    } else if (isSelectionToolActive) {
        // Handle frame selection
        for (let i = shapes.length - 1; i >= 0; i--) {
            if (shapes[i].shapeName === 'frame' && shapes[i].contains(x, y)) {
                if (currentShape && currentShape !== shapes[i]) {
                    currentShape.removeSelection();
                }
                currentShape = shapes[i];
                currentShape.selectFrame();
                
                // Check for anchor interaction
                const anchorIndex = currentShape.isNearAnchor(x, y);
                if (anchorIndex !== null) {
                    activeAnchor = anchorIndex;
                    isResizing = true;
                } else {
                    isDragging = true;
                    startX = x;
                    startY = y;
                    dragOldPosFrame = {
                        x: currentShape.x,
                        y: currentShape.y,
                        width: currentShape.width,
                        height: currentShape.height,
                        rotation: currentShape.rotation
                    };
                }
                return;
            }
        }
        
        // If no frame was clicked, deselect current
        if (currentShape && currentShape.shapeName === 'frame') {
            currentShape.removeSelection();
            currentShape = null;
        }
    }
};

    const handleMouseMove = (e) => {
    const { x, y } = getSVGCoordsFromMouse(e);

    if (isDrawingFrame && currentFrame) {
        const width = Math.abs(x - startX);
        const height = Math.abs(y - startY);
        currentFrame.x = Math.min(startX, x);
        currentFrame.y = Math.min(startY, y);
        currentFrame.width = width;
        currentFrame.height = height;
        currentFrame.draw();
    } else if (isDragging && currentShape && currentShape.shapeName === 'frame') {
        const dx = x - startX;
        const dy = y - startY;
        
        // Use the frame's move method which properly handles contained shapes
        currentShape.move(dx, dy);
        
        startX = x;
        startY = y;
    }
};

    const handleMouseUp = (e) => {
    if (isDrawingFrame && currentFrame) {
        // Check if frame is too small
        if (currentFrame.width < 10 || currentFrame.height < 10) {
            currentFrame.destroy();
            currentFrame = null;
            currentShape = null;
        } else {
            pushCreateAction(currentFrame);
            // Check for shapes that should be contained in the new frame
            currentFrame.updateContainedShapes(true); // Apply clipping immediately for new frames
        }
        isDrawingFrame = false;
    }

    if (isDragging && dragOldPosFrame && currentShape) {
        const newPos = {
            x: currentShape.x,
            y: currentShape.y,
            width: currentShape.width,
            height: currentShape.height,
            rotation: currentShape.rotation
        };
        pushTransformAction(currentShape, dragOldPosFrame, newPos);
        dragOldPosFrame = null;
        
        // Update frame containment after moving frame (but don't re-move contained shapes)
        if (currentShape.shapeName === 'frame') {
            currentShape.updateClipPath();
        }
    }

    // Only check frame containment for shapes that aren't already in frames
    if (!isDragging) {
        shapes.forEach(shape => {
            if (shape.shapeName !== 'frame' && !shape.parentFrame) {
                shapes.forEach(frame => {
                    if (frame.shapeName === 'frame') {
                        if (frame.isShapeInFrame(shape)) {
                            frame.addShapeToFrame(shape);
                        }
                    }
                });
            }
        });
    }

    isDrawingFrame = false;
    isDragging = false;
    isResizing = false;
    activeAnchor = null;
    svg.style.cursor = 'default';
};

Frame.prototype.isNearAnchor = function(x, y) {
    const anchorSize = 10 / currentZoom;
    
    // Define anchor positions
    const anchorPositions = [
        { x: this.x, y: this.y },
        { x: this.x + this.width / 2, y: this.y },
        { x: this.x + this.width, y: this.y },
        { x: this.x + this.width, y: this.y + this.height / 2 },
        { x: this.x + this.width, y: this.y + this.height },
        { x: this.x + this.width / 2, y: this.y + this.height },
        { x: this.x, y: this.y + this.height },
        { x: this.x, y: this.y + this.height / 2 },
        { x: this.x + this.width / 2, y: this.y - 30 / currentZoom } // Rotation handle
    ];

    for (let i = 0; i < anchorPositions.length; i++) {
        const pos = anchorPositions[i];
        const distance = Math.sqrt((x - pos.x) ** 2 + (y - pos.y) ** 2);
        if (distance <= anchorSize) {
            return i;
        }
    }
    return null;
};

// Delete functionality
function deleteCurrentFrame() {
    if (currentShape && currentShape.shapeName === 'frame') {
        const idx = shapes.indexOf(currentShape);
        if (idx !== -1) shapes.splice(idx, 1);
        if (currentShape.group.parentNode) {
            currentShape.group.parentNode.removeChild(currentShape.group);
        }
        pushDeleteAction(currentShape);
        currentShape = null;
    }
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Delete' && currentShape && currentShape.shapeName === 'frame') {
        deleteCurrentFrame();
    }
});

// Copy/Paste functionality
function cloneFrameData(frame) {
    return {
        x: frame.x,
        y: frame.y,
        width: frame.width,
        height: frame.height,
        rotation: frame.rotation,
        options: JSON.parse(JSON.stringify(frame.options))
    };
}

document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        if (currentShape && currentShape.shapeName === 'frame') {
            copiedFrameData = cloneFrameData(currentShape);
        }
    }
});

document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        if (copiedFrameData) {
            const newFrame = new Frame(
                copiedFrameData.x + 20,
                copiedFrameData.y + 20,
                copiedFrameData.width,
                copiedFrameData.height,
                copiedFrameData.options
            );
            newFrame.rotation = copiedFrameData.rotation;
            shapes.push(newFrame);
            pushCreateAction(newFrame);
            
            if (currentShape) currentShape.removeSelection();
            currentShape = newFrame;
            newFrame.selectFrame();
        }
    }
});

export {
    handleMouseDown as handleMouseDownFrame,
    handleMouseMove as handleMouseMoveFrame,
    handleMouseUp as handleMouseUpFrame
};