import { pushCreateAction, pushDeleteAction, pushTransformAction, pushFrameAttachmentAction } from './undoAndRedo.js';
import { updateAttachedArrows, cleanupAttachments } from './drawArrow.js';

let isDraggingImage = false;
let imageToPlace = null;
let imageX = 0;
let imageY = 0;
let scaleFactor = 0.2; 
let currentImageElement = null; 

let selectedImage = null;
let originalX, originalY, originalWidth, originalHeight;
let currentAnchor = null; 
let isDragging = false;
let isRotatingImage = false;
let dragOffsetX, dragOffsetY;
let startRotationMouseAngle = null;
let startImageRotation = null;
let imageRotation = 0;
let aspect_ratio_lock = true;
const minImageSize = 20; 

// Frame attachment variables
let draggedShapeInitialFrameImage = null;
let hoveredFrameImage = null;

// Image class to make it consistent with other shapes
class ImageShape {
    constructor(element) {
        this.element = element;
        this.shapeName = 'image';
        this.shapeID = element.shapeID || `image-${String(Date.now()).slice(0, 8)}-${Math.floor(Math.random() * 10000)}`;
        
        // Frame attachment properties
        this.parentFrame = null;
        
        // Update element attributes
        this.element.setAttribute('type', 'image');
        this.element.shapeID = this.shapeID;
        
        // Create a group wrapper for the image to work with frames properly
        this.group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        this.group.setAttribute('id', this.shapeID);
        
        // Move the image element into the group
        if (this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
        this.group.appendChild(this.element);
        svg.appendChild(this.group);
    }
    
    // Position and dimension properties for frame compatibility
    get x() {
        return parseFloat(this.element.getAttribute('x'));
    }
    
    set x(value) {
        this.element.setAttribute('x', value);
        this.element.setAttribute('data-shape-x', value);
    }
    
    get y() {
        return parseFloat(this.element.getAttribute('y'));
    }
    
    set y(value) {
        this.element.setAttribute('y', value);
        this.element.setAttribute('data-shape-y', value);
    }
    
    get width() {
        return parseFloat(this.element.getAttribute('width'));
    }
    
    set width(value) {
        this.element.setAttribute('width', value);
        this.element.setAttribute('data-shape-width', value);
    }
    
    get height() {
        return parseFloat(this.element.getAttribute('height'));
    }
    
    set height(value) {
        this.element.setAttribute('height', value);
        this.element.setAttribute('data-shape-height', value);
    }
    
    get rotation() {
        const transform = this.element.getAttribute('transform');
        if (transform) {
            const rotateMatch = transform.match(/rotate\(([^,]+)/);
            if (rotateMatch) {
                return parseFloat(rotateMatch[1]);
            }
        }
        return 0;
    }
    
    set rotation(value) {
        const centerX = this.x + this.width / 2;
        const centerY = this.y + this.height / 2;
        this.element.setAttribute('transform', `rotate(${value}, ${centerX}, ${centerY})`);
        this.element.setAttribute('data-shape-rotation', value);
    }

    move(dx, dy) {
        this.x += dx;
        this.y += dy;
        
        // Update transform for rotation
        const centerX = this.x + this.width / 2;
        const centerY = this.y + this.height / 2;
        this.element.setAttribute('transform', `rotate(${this.rotation}, ${centerX}, ${centerY})`);
        
        // Only update frame containment if we're actively dragging the shape itself
        // and not being moved by a parent frame
        if (isDragging && !this.isBeingMovedByFrame) {
            this.updateFrameContainment();
        }
        
        // Update attached arrows
        if (typeof updateAttachedArrows === 'function') {
            updateAttachedArrows(this.element);
        }
    }

    updateFrameContainment() {
        // Don't update if we're being moved by a frame
        if (this.isBeingMovedByFrame) return;
        
        let targetFrame = null;
        
        // Find which frame this shape is over
        if (typeof shapes !== 'undefined' && Array.isArray(shapes)) {
            shapes.forEach(shape => {
                if (shape.shapeName === 'frame' && shape.isShapeInFrame(this)) {
                    targetFrame = shape;
                }
            });
        }
        
        // If we have a parent frame and we're being dragged, temporarily remove clipping
        if (this.parentFrame && isDragging) {
            this.parentFrame.temporarilyRemoveFromFrame(this);
        }
        
        // Update frame highlighting
        if (hoveredFrameImage && hoveredFrameImage !== targetFrame) {
            hoveredFrameImage.removeHighlight();
        }
        
        if (targetFrame && targetFrame !== hoveredFrameImage) {
            targetFrame.highlightFrame();
        }
        
        hoveredFrameImage = targetFrame;
    }

    contains(x, y) {
        const imgX = this.x;
        const imgY = this.y;
        const imgWidth = this.width;
        const imgHeight = this.height;
        
        // Simple bounding box check (could be enhanced for rotation)
        return x >= imgX && x <= imgX + imgWidth && y >= imgY && y <= imgY + imgHeight;
    }

    // Add draw method for consistency with other shapes
    draw() {
        // Images don't need redrawing like other shapes, but we need this method for consistency
        // Update any visual state if needed
    }

    // Add methods for frame compatibility
    removeSelection() {
        // Remove any selection UI if needed
        removeSelectionOutline();
    }

    selectShape() {
        // Select the image
        selectImage({ target: this.element, stopPropagation: () => {} });
    }
}

// Convert SVG element to our ImageShape class
function wrapImageElement(element) {
    const imageShape = new ImageShape(element);
    return imageShape;
}

document.getElementById("importImage").addEventListener('click', () => {
    console.log('Import image clicked');
    isImageToolActive = true;
    console.log('isImageToolActive set to:', isImageToolActive);

    // Create a file input element
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*'; // Accept all image types
    fileInput.style.display = 'none'; // Hide the input element
    
    // Add the input to the document temporarily
    document.body.appendChild(fileInput);
    
    // Handle file selection
    fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            handleImageUpload(file);
        }
        
        // Clean up - remove the input element
        document.body.removeChild(fileInput);
    });
    
    // Trigger the file picker
    fileInput.click();
});


const loadHardcodedImage = (imagePath) => {
    console.log('Loading hardcoded image:', imagePath);
    const img = new Image();
    img.onload = () => {
        console.log('Image loaded successfully');
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        imageToPlace = canvas.toDataURL();
        isDraggingImage = true;
        console.log('Image ready to place, isDraggingImage:', isDraggingImage);
    };
    img.onerror = (error) => {
        console.error('Failed to load the hardcoded image:', error);
        console.error('Image path:', imagePath);
    };
    img.src = imagePath;
};

const handleImageUpload = (file) => {
    if (!file || !isImageToolActive) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
        console.error('Selected file is not an image');
        alert('Please select a valid image file.');
        return;
    }

    
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (file.size > maxSize) {
        console.error('File size too large');
        alert('Image file is too large. Please select an image smaller than 10MB.');
        return;
    }

    console.log('Processing image file:', file.name, 'Size:', file.size, 'Type:', file.type);

    const reader = new FileReader();
    
    reader.onload = (e) => {
        imageToPlace = e.target.result; 
        isDraggingImage = true;
        console.log('Image loaded and ready to place');
    };
    
    reader.onerror = (error) => {
        console.error('Error reading file:', error);
        alert('Error reading the image file. Please try again.');
        isImageToolActive = false;
    };
    
    reader.readAsDataURL(file);
};

// Add coordinate conversion function like in other tools
function getSVGCoordsFromMouse(e) {
    const viewBox = svg.viewBox.baseVal;
    const rect = svg.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const svgX = viewBox.x + (mouseX / rect.width) * viewBox.width;
    const svgY = viewBox.y + (mouseY / rect.height) * viewBox.height;
    return { x: svgX, y: svgY };
}

// Event handler for mousemove on the SVG
const handleMouseMoveImage = (e) => {
    if (!isDraggingImage || !imageToPlace || !isImageToolActive) return; // Also check isImageToolActive

    // Get mouse coordinates relative to the SVG element
    const { x, y } = getSVGCoordsFromMouse(e);
    imageX = x;
    imageY = y;

    drawMiniatureImage();
    
    // Check for frame containment while placing image (but don't apply clipping yet)
    if (typeof shapes !== 'undefined' && Array.isArray(shapes)) {
        shapes.forEach(frame => {
            if (frame.shapeName === 'frame') {
                // Create temporary image bounds for frame checking
                const tempImageBounds = {
                    x: imageX - 50, // Half of miniature width
                    y: imageY - 50, // Approximate half height
                    width: 100,
                    height: 100
                };
                
                if (frame.isShapeInFrame(tempImageBounds)) {
                    frame.highlightFrame();
                    hoveredFrameImage = frame;
                } else if (hoveredFrameImage === frame) {
                    frame.removeHighlight();
                    hoveredFrameImage = null;
                }
            }
        });
    }
};

const drawMiniatureImage = () => {
    if (!isDraggingImage || !imageToPlace || !isImageToolActive) return; // Also check isImageToolActive

    const miniatureWidth = 100; // Fixed width for miniature (adjust as needed)
    getImageAspectRatio(imageToPlace)
        .then(aspectRatio => {
            const miniatureHeight = miniatureWidth * aspectRatio;  // Maintain aspect ratio

            // Remove the previous miniature image, if it exists
            if (currentImageElement) {
                svg.removeChild(currentImageElement);
                currentImageElement = null; // Important: clear the reference
            }

            // Create an SVG image element for the miniature
            currentImageElement = document.createElementNS("http://www.w3.org/2000/svg", "image");
            currentImageElement.setAttribute("href", imageToPlace);
            currentImageElement.setAttribute("x", imageX - miniatureWidth / 2); 
            currentImageElement.setAttribute("y", imageY - miniatureHeight / 2);
            currentImageElement.setAttribute("width", miniatureWidth);
            currentImageElement.setAttribute("height", miniatureHeight);
            currentImageElement.setAttribute("preserveAspectRatio", "xMidYMid meet");

            svg.appendChild(currentImageElement);
        })
        .catch(error => {
            console.error("Error getting aspect ratio:", error);
            
        });
};

function getImageAspectRatio(dataUrl) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            resolve(img.height / img.width);
        };
        img.onerror = () => {
            reject(new Error('Failed to load image for aspect ratio calculation.'));
        };
        img.src = dataUrl;
    });
}

// Update the handleMouseDownImage function to create proper group structure
const handleMouseDownImage = async (e) => {
    if (!isDraggingImage || !imageToPlace || !isImageToolActive) {
        // Handle image selection if selection tool is active
        if (isSelectionToolActive) {
            const clickedImage = e.target.closest('image');
            if (clickedImage) {
                selectImage({ target: clickedImage, stopPropagation: () => e.stopPropagation() });
                return;
            }
        }
        return;
    }

    try {
        //Get aspect ratio before we clear the temporary image data.
        let aspectRatio = await getImageAspectRatio(imageToPlace);

        // Remove the miniature
        if (currentImageElement) {
            svg.removeChild(currentImageElement);
            currentImageElement = null;
        }

        // Calculate actual dimensions of the placed image
        const placedImageWidth = 200; // Adjust as needed
        const placedImageHeight = placedImageWidth * aspectRatio;

        // Get SVG coordinates
        const { x: placedX, y: placedY } = getSVGCoordsFromMouse(e);

        // Create a new SVG image element for the final image
        const finalImage = document.createElementNS("http://www.w3.org/2000/svg", "image");
        finalImage.setAttribute("href", imageToPlace);
        finalImage.setAttribute("x", placedX - placedImageWidth / 2);
        finalImage.setAttribute("y", placedY - placedImageHeight / 2);
        finalImage.setAttribute("width", placedImageWidth);
        finalImage.setAttribute("height", placedImageHeight);
        finalImage.setAttribute("preserveAspectRatio", "xMidYMid meet");

        // Store data for undo/redo
        finalImage.setAttribute('data-href', imageToPlace);
        finalImage.setAttribute('data-x', placedX - placedImageWidth / 2);
        finalImage.setAttribute('data-y', placedY - placedImageHeight / 2);
        finalImage.setAttribute('data-width', placedImageWidth);
        finalImage.setAttribute('data-height', placedImageHeight);
        
        // Add arrow attachment support data attributes
        finalImage.setAttribute('type', 'image');
        finalImage.setAttribute('data-shape-x', placedX - placedImageWidth / 2);
        finalImage.setAttribute('data-shape-y', placedY - placedImageHeight / 2);
        finalImage.setAttribute('data-shape-width', placedImageWidth);
        finalImage.setAttribute('data-shape-height', placedImageHeight);
        finalImage.setAttribute('data-shape-rotation', 0);
        finalImage.shapeID = `image-${String(Date.now()).slice(0, 8)}-${Math.floor(Math.random() * 10000)}`;

        // Don't add to SVG directly - let ImageShape wrapper handle it
        // svg.appendChild(finalImage);

        // Create ImageShape wrapper for frame functionality
        const imageShape = wrapImageElement(finalImage);

        // Add to shapes array for arrow attachment and frame functionality
        if (typeof shapes !== 'undefined' && Array.isArray(shapes)) {
            shapes.push(imageShape);
            console.log('Image added to shapes array for arrow attachment and frame functionality');
        } else {
            console.warn('shapes array not found - arrows and frames may not work with images');
        }

        // Check for frame containment and track attachment
        const finalFrame = hoveredFrameImage;
        if (finalFrame) {
            finalFrame.addShapeToFrame(imageShape);
            // Track the attachment for undo
            pushFrameAttachmentAction(finalFrame, imageShape, 'attach', null);
        }

        // Add to undo stack for image creation
        pushCreateAction({
            type: 'image',
            element: imageShape,
            remove: () => {
                if (imageShape.group && imageShape.group.parentNode) {
                    imageShape.group.parentNode.removeChild(imageShape.group);
                }
                // Remove from shapes array
                if (typeof shapes !== 'undefined' && Array.isArray(shapes)) {
                    const idx = shapes.indexOf(imageShape);
                    if (idx !== -1) shapes.splice(idx, 1);
                }
                // Clean up arrow attachments when image is removed
                if (typeof cleanupAttachments === 'function') {
                    cleanupAttachments(finalImage);
                }
            },
            restore: () => {
                svg.appendChild(imageShape.group);
                // Add back to shapes array
                if (typeof shapes !== 'undefined' && Array.isArray(shapes)) {
                    if (shapes.indexOf(imageShape) === -1) {
                        shapes.push(imageShape);
                    }
                }
            }
        });

        // Add click event to the newly added image
        finalImage.addEventListener('click', selectImage);

        // Clear frame highlighting
        if (hoveredFrameImage) {
            hoveredFrameImage.removeHighlight();
            hoveredFrameImage = null;
        }

    } catch (error) {
        console.error("Error placing image:", error);
        isDraggingImage = false;
        imageToPlace = null;
        isImageToolActive = false; // Important: Reset the tool state.
    } finally {
        isDraggingImage = false;
        imageToPlace = null;
        isImageToolActive = false; // Important: Reset the tool state.
    }
};

const handleMouseUpImage = (e) => {
    // Handle image deselection when clicking outside
    if (isSelectionToolActive) {
        // Check if we clicked on an image or image-related element
        const clickedElement = e.target;
        const isImageElement = clickedElement.tagName === 'image';
        const isAnchorElement = clickedElement.classList.contains('resize-anchor') || 
                               clickedElement.classList.contains('rotation-anchor') ||
                               clickedElement.classList.contains('selection-outline');
        
        // If we didn't click on an image or its controls, deselect
        if (!isImageElement && !isAnchorElement && selectedImage) {
            removeSelectionOutline();
            selectedImage = null;
        }
    }
    
    // Clear frame highlighting if placing image
    if (hoveredFrameImage) {
        hoveredFrameImage.removeHighlight();
        hoveredFrameImage = null;
    }
};

function selectImage(event) {
    if (!isSelectionToolActive) return;

    event.stopPropagation(); // Prevent click from propagating to the SVG

    if (selectedImage) {
        removeSelectionOutline();
    }

    selectedImage = event.target;
    
    // Get the current rotation from the image transform attribute
    const transform = selectedImage.getAttribute('transform');
    if (transform) {
        const rotateMatch = transform.match(/rotate\(([^,]+)/);
        if (rotateMatch) {
            imageRotation = parseFloat(rotateMatch[1]);
        }
    } else {
        imageRotation = 0;
    }
    
    addSelectionOutline();

    // Store original dimensions for resizing
    originalX = parseFloat(selectedImage.getAttribute('x'));
    originalY = parseFloat(selectedImage.getAttribute('y'));
    originalWidth = parseFloat(selectedImage.getAttribute('width'));
    originalHeight = parseFloat(selectedImage.getAttribute('height'));

     // Add drag event listeners to the selected image
     selectedImage.addEventListener('mousedown', startDrag);
     selectedImage.addEventListener('mouseup', stopDrag);
     selectedImage.addEventListener('mouseleave', stopDrag); //Stop drag if mouse leaves the image
}

function addSelectionOutline() {
    if (!selectedImage) return;

    const x = parseFloat(selectedImage.getAttribute('x'));
    const y = parseFloat(selectedImage.getAttribute('y'));
    const width = parseFloat(selectedImage.getAttribute('width'));
    const height = parseFloat(selectedImage.getAttribute('height'));

    const selectionPadding = 8; // Padding around the selection
    const expandedX = x - selectionPadding;
    const expandedY = y - selectionPadding;
    const expandedWidth = width + 2 * selectionPadding;
    const expandedHeight = height + 2 * selectionPadding;

    // Create a dashed outline
    const outlinePoints = [
        [expandedX, expandedY],
        [expandedX + expandedWidth, expandedY],
        [expandedX + expandedWidth, expandedY + expandedHeight],
        [expandedX, expandedY + expandedHeight],
        [expandedX, expandedY]
    ];
    const pointsAttr = outlinePoints.map(p => p.join(',')).join(' ');
    const outline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    outline.setAttribute("points", pointsAttr);
    outline.setAttribute("fill", "none");
    outline.setAttribute("stroke", "#5B57D1");
    outline.setAttribute("stroke-width", 1.5);
    outline.setAttribute("stroke-dasharray", "4 2");
    outline.setAttribute("style", "pointer-events: none;");
    outline.setAttribute("class", "selection-outline");

    // Apply the same rotation as the image
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    outline.setAttribute('transform', `rotate(${imageRotation}, ${centerX}, ${centerY})`);

    svg.appendChild(outline);

    // Add resize anchors
    addResizeAnchors(expandedX, expandedY, expandedWidth, expandedHeight, centerX, centerY);
    
    // Add rotation anchor
    addRotationAnchor(expandedX, expandedY, expandedWidth, expandedHeight, centerX, centerY);
}

function removeSelectionOutline() {
    // Remove the selection outline
    const outline = svg.querySelector(".selection-outline");
    if (outline) {
        svg.removeChild(outline);
    }

    // Remove resize anchors
    removeResizeAnchors();
    
    // Remove rotation anchor
    removeRotationAnchor();

    // Remove drag event listeners
    if (selectedImage) {
        selectedImage.removeEventListener('mousedown', startDrag);
        selectedImage.removeEventListener('mouseup', stopDrag);
        selectedImage.removeEventListener('mouseleave', stopDrag);
    }
}

function addResizeAnchors(x, y, width, height, centerX, centerY) {
    const anchorSize = 10; // Size of the resize anchors
    const anchorStrokeWidth = 2;

    const positions = [
        { x: x, y: y }, // Top-left
        { x: x + width, y: y }, // Top-right
        { x: x, y: y + height }, // Bottom-left
        { x: x + width, y: y + height } // Bottom-right
    ];

    positions.forEach((pos, i) => {
        const anchor = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        anchor.setAttribute("x", pos.x - anchorSize / 2);
        anchor.setAttribute("y", pos.y - anchorSize / 2);
        anchor.setAttribute("width", anchorSize);
        anchor.setAttribute("height", anchorSize);
        anchor.setAttribute("fill", "#121212");
        anchor.setAttribute("stroke", "#5B57D1");
        anchor.setAttribute("stroke-width", anchorStrokeWidth);
        anchor.setAttribute("class", "resize-anchor");
        anchor.style.cursor = ["nw-resize", "ne-resize", "sw-resize", "se-resize"][i];

        // Apply the same rotation as the image
        anchor.setAttribute('transform', `rotate(${imageRotation}, ${centerX}, ${centerY})`);

        svg.appendChild(anchor);

        // Add event listeners for resizing
        anchor.addEventListener('mousedown', startResize);
        anchor.addEventListener('mouseup', stopResize);
    });
}

function addRotationAnchor(x, y, width, height, centerX, centerY) {
    const anchorStrokeWidth = 2;
    const rotationAnchorPos = { x: x + width / 2, y: y - 30 };
    
    const rotationAnchor = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    rotationAnchor.setAttribute('cx', rotationAnchorPos.x);
    rotationAnchor.setAttribute('cy', rotationAnchorPos.y);
    rotationAnchor.setAttribute('r', 8);
    rotationAnchor.setAttribute('class', 'rotation-anchor');
    rotationAnchor.setAttribute('fill', '#121212');
    rotationAnchor.setAttribute('stroke', '#5B57D1');
    rotationAnchor.setAttribute('stroke-width', anchorStrokeWidth);
    rotationAnchor.setAttribute('style', 'pointer-events: all;');
    
    // Apply the same rotation as the image
    rotationAnchor.setAttribute('transform', `rotate(${imageRotation}, ${centerX}, ${centerY})`);
    
    svg.appendChild(rotationAnchor);

    // Add event listeners for rotation
    rotationAnchor.addEventListener('mousedown', startRotation);
    rotationAnchor.addEventListener('mouseup', stopRotation);
    
    rotationAnchor.addEventListener('mouseover', function () {
        if (!isRotatingImage && !isDragging) {
            rotationAnchor.style.cursor = 'grab';
        }
    });
    
    rotationAnchor.addEventListener('mouseout', function () {
        if (!isRotatingImage && !isDragging) {
            rotationAnchor.style.cursor = 'default';
        }
    });
}

function removeRotationAnchor() {
    const rotationAnchor = svg.querySelector(".rotation-anchor");
    if (rotationAnchor) {
        svg.removeChild(rotationAnchor);
    }
}

function addAnchor(x, y, cursor) {
    const anchorSize = 8;
    const anchor = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    anchor.setAttribute("x", x);
    anchor.setAttribute("y", y);
    anchor.setAttribute("width", anchorSize);
    anchor.setAttribute("height", anchorSize);
    anchor.setAttribute("fill", "white");
    anchor.setAttribute("stroke", "black");
    anchor.setAttribute("stroke-width", "1");
    anchor.setAttribute("class", "resize-anchor"); // For easy removal
    anchor.style.cursor = cursor;

    svg.appendChild(anchor);

    // Add event listeners for dragging
    anchor.addEventListener('mousedown', startResize);
    anchor.addEventListener('mouseup', stopResize);

}

function removeResizeAnchors() {
    const anchors = svg.querySelectorAll(".resize-anchor");
    anchors.forEach(anchor => svg.removeChild(anchor));
}

function startResize(event) {
    event.preventDefault();
    event.stopPropagation();

    currentAnchor = event.target;
    
    // Store original values at the start of resize
    originalX = parseFloat(selectedImage.getAttribute('x'));
    originalY = parseFloat(selectedImage.getAttribute('y'));
    originalWidth = parseFloat(selectedImage.getAttribute('width'));
    originalHeight = parseFloat(selectedImage.getAttribute('height'));
    
    // Store original rotation
    const transform = selectedImage.getAttribute('transform');
    if (transform) {
        const rotateMatch = transform.match(/rotate\(([^,]+)/);
        if (rotateMatch) {
            imageRotation = parseFloat(rotateMatch[1]);
        }
    }
    
    svg.addEventListener('mousemove', resizeImage);
    document.addEventListener('mouseup', stopResize);
}

function stopResize(event) {
    stopInteracting(); // Call the combined stop function
    document.removeEventListener('mouseup', stopResize); // Remove the global mouseup listener
}

function resizeImage(event) {
    if (!selectedImage || !currentAnchor) return;

    const { x: globalX, y: globalY } = getSVGCoordsFromMouse(event);

    // Get the current image center for rotation calculations
    const imgX = parseFloat(selectedImage.getAttribute('x'));
    const imgY = parseFloat(selectedImage.getAttribute('y'));
    const imgWidth = parseFloat(selectedImage.getAttribute("width"));
    const imgHeight = parseFloat(selectedImage.getAttribute('height'));
    const centerX = imgX + imgWidth / 2;
    const centerY = imgY + imgHeight / 2;

    // Convert mouse position to local coordinates accounting for rotation
    let localX = globalX;
    let localY = globalY;
    
    if (imageRotation !== 0) {
        // Convert rotation to radians
        const rotationRad = (imageRotation * Math.PI) / 180;
        
        // Translate to origin (center of image)
        const translatedX = globalX - centerX;
        const translatedY = globalY - centerY;
        
        // Apply inverse rotation
        localX = translatedX * Math.cos(-rotationRad) - translatedY * Math.sin(-rotationRad) + centerX;
        localY = translatedX * Math.sin(-rotationRad) + translatedY * Math.cos(-rotationRad) + centerY;
    }

    // Calculate resize deltas in local coordinate space
    let dx = localX - originalX;
    let dy = localY - originalY;

    let newWidth = originalWidth;
    let newHeight = originalHeight;
    let newX = originalX;
    let newY = originalY;
    const aspectRatio = originalHeight / originalWidth;

    switch (currentAnchor.style.cursor) {
        case "nw-resize":
            newWidth = originalWidth - dx;
            newHeight = originalHeight - dy;
            if (aspect_ratio_lock) {
                newHeight = newWidth * aspectRatio;
                // Adjust dy to maintain aspect ratio
                dy = originalHeight - newHeight;
            }
            newX = originalX + (originalWidth - newWidth);
            newY = originalY + (originalHeight - newHeight);
            break;
        case "ne-resize":
            newWidth = dx;
            newHeight = originalHeight - dy;
            if (aspect_ratio_lock) {
                newHeight = newWidth * aspectRatio;
                // Adjust dy to maintain aspect ratio
                dy = originalHeight - newHeight;
            }
            newX = originalX;
            newY = originalY + (originalHeight - newHeight);
            break;
        case "sw-resize":
            newWidth = originalWidth - dx;
            newHeight = dy;
            if (aspect_ratio_lock) {
                newHeight = newWidth * aspectRatio;
                // Adjust dy to maintain aspect ratio
                dy = newHeight;
            }
            newX = originalX + (originalWidth - newWidth);
            newY = originalY;
            break;
        case "se-resize":
            newWidth = dx;
            newHeight = dy;
            if (aspect_ratio_lock) {
                newHeight = newWidth * aspectRatio;
            }
            newX = originalX;
            newY = originalY;
            break;
    }

    // Ensure minimum size
    newWidth = Math.max(minImageSize, newWidth);
    newHeight = Math.max(minImageSize, newHeight);

    // Apply the new dimensions and position
    selectedImage.setAttribute('width', newWidth);
    selectedImage.setAttribute('height', newHeight);
    selectedImage.setAttribute('x', newX);
    selectedImage.setAttribute('y', newY);

    // Update data attributes for arrow attachment
    selectedImage.setAttribute('data-shape-x', newX);
    selectedImage.setAttribute('data-shape-y', newY);
    selectedImage.setAttribute('data-shape-width', newWidth);
    selectedImage.setAttribute('data-shape-height', newHeight);

    // Reapply the rotation transform with the new center
    const newCenterX = newX + newWidth / 2;
    const newCenterY = newY + newHeight / 2;
    selectedImage.setAttribute('transform', `rotate(${imageRotation}, ${newCenterX}, ${newCenterY})`);

    // Update attached arrows during resize
    if (typeof updateAttachedArrows === 'function') {
        updateAttachedArrows(selectedImage);
    }

    // Update the selection outline and anchors
    removeSelectionOutline();
    addSelectionOutline();
}

function stopRotation(event) {
    if (!isRotatingImage) return;
    stopInteracting();
    isRotatingImage = false;
    startRotationMouseAngle = null;
    startImageRotation = null;
    svg.removeEventListener('mousemove', rotateImage);
    document.removeEventListener('mouseup', stopRotation);
    svg.style.cursor = 'default';
}

function startDrag(event) {
    if (!isSelectionToolActive || !selectedImage) return;

    event.preventDefault();
    event.stopPropagation();

    isDragging = true;
    
    // Store original values at the start of drag
    originalX = parseFloat(selectedImage.getAttribute('x'));
    originalY = parseFloat(selectedImage.getAttribute('y'));
    originalWidth = parseFloat(selectedImage.getAttribute('width'));
    originalHeight = parseFloat(selectedImage.getAttribute('height'));
    
    // Store original rotation
    const transform = selectedImage.getAttribute('transform');
    if (transform) {
        const rotateMatch = transform.match(/rotate\(([^,]+)/);
        if (rotateMatch) {
            imageRotation = parseFloat(rotateMatch[1]);
        }
    }

    // Find the ImageShape wrapper for frame functionality
    let imageShape = null;
    if (typeof shapes !== 'undefined' && Array.isArray(shapes)) {
        imageShape = shapes.find(shape => shape.shapeName === 'image' && shape.element === selectedImage);
    }

    if (imageShape) {
        // Store initial frame state
        draggedShapeInitialFrameImage = imageShape.parentFrame || null;
        
        // Temporarily remove from frame clipping if dragging
        if (imageShape.parentFrame) {
            imageShape.parentFrame.temporarilyRemoveFromFrame(imageShape);
        }
    }

    const { x, y } = getSVGCoordsFromMouse(event);
    dragOffsetX = x - parseFloat(selectedImage.getAttribute('x'));
    dragOffsetY = y - parseFloat(selectedImage.getAttribute('y'));

    svg.addEventListener('mousemove', dragImage);
    document.addEventListener('mouseup', stopDrag);
}

function dragImage(event) {
    if (!isDragging || !selectedImage) return;

    const { x, y } = getSVGCoordsFromMouse(event);
    let newX = x - dragOffsetX;
    let newY = y - dragOffsetY;

    selectedImage.setAttribute('x', newX);
    selectedImage.setAttribute('y', newY);

    // Update data attributes for arrow attachment
    selectedImage.setAttribute('data-shape-x', newX);
    selectedImage.setAttribute('data-shape-y', newY);

    // Reapply the rotation transform with the new position
    const newCenterX = newX + parseFloat(selectedImage.getAttribute('width')) / 2;
    const newCenterY = newY + parseFloat(selectedImage.getAttribute('height')) / 2;
    selectedImage.setAttribute('transform', `rotate(${imageRotation}, ${newCenterX}, ${newCenterY})`);

    // Update frame containment for ImageShape wrapper
    if (typeof shapes !== 'undefined' && Array.isArray(shapes)) {
        const imageShape = shapes.find(shape => shape.shapeName === 'image' && shape.element === selectedImage);
        if (imageShape) {
            imageShape.updateFrameContainment();
        }
    }

    // Update attached arrows during drag
    if (typeof updateAttachedArrows === 'function') {
        updateAttachedArrows(selectedImage);
    }

    // Update the selection outline and anchors
    removeSelectionOutline();
    addSelectionOutline();
}

function stopDrag(event) {
    stopInteracting(); // Call the combined stop function
    document.removeEventListener('mouseup', stopDrag); // Remove the global mouseup listener
}

function startRotation(event) {
    event.preventDefault();
    event.stopPropagation();

    if (!selectedImage) return;

    isRotatingImage = true;
    
    // Get image center
    const imgX = parseFloat(selectedImage.getAttribute('x'));
    const imgY = parseFloat(selectedImage.getAttribute('y'));
    const imgWidth = parseFloat(selectedImage.getAttribute('width'));
    const imgHeight = parseFloat(selectedImage.getAttribute('height'));
    
    const centerX = imgX + imgWidth / 2;
    const centerY = imgY + imgHeight / 2;

    // Calculate initial mouse angle relative to image center
    const { x: mouseX, y: mouseY } = getSVGCoordsFromMouse(event);
    
    startRotationMouseAngle = Math.atan2(mouseY - centerY, mouseX - centerX) * 180 / Math.PI;
    startImageRotation = imageRotation;

    svg.addEventListener('mousemove', rotateImage);
    document.addEventListener('mouseup', stopRotation);
    
    svg.style.cursor = 'grabbing';
}

function rotateImage(event) {
    if (!isRotatingImage || !selectedImage) return;

    // Get image center
    const imgX = parseFloat(selectedImage.getAttribute('x'));
    const imgY = parseFloat(selectedImage.getAttribute('y'));
    const imgWidth = parseFloat(selectedImage.getAttribute('width'));
    const imgHeight = parseFloat(selectedImage.getAttribute('height'));
    
    const centerX = imgX + imgWidth / 2;
    const centerY = imgY + imgHeight / 2;

    // Calculate current mouse angle
    const { x: mouseX, y: mouseY } = getSVGCoordsFromMouse(event);
    
    const currentMouseAngle = Math.atan2(mouseY - centerY, mouseX - centerX) * 180 / Math.PI;
    const angleDiff = currentMouseAngle - startRotationMouseAngle;
    
    imageRotation = startImageRotation + angleDiff;
    imageRotation = imageRotation % 360;
    if (imageRotation < 0) imageRotation += 360;

    // Apply rotation transform
    selectedImage.setAttribute('transform', `rotate(${imageRotation}, ${centerX}, ${centerY})`);
    
    // Update data attribute for arrow attachment
    selectedImage.setAttribute('data-shape-rotation', imageRotation);

    // Update attached arrows during rotation
    if (typeof updateAttachedArrows === 'function') {
        updateAttachedArrows(selectedImage);
    }

    // Update the selection outline and anchors
    removeSelectionOutline();
    addSelectionOutline();
}

function stopInteracting() {
    // Store transform data before stopping interaction
    if (selectedImage && (isDragging || isRotatingImage || currentAnchor)) {
        const newPos = {
            x: parseFloat(selectedImage.getAttribute('x')),
            y: parseFloat(selectedImage.getAttribute('y')),
            width: parseFloat(selectedImage.getAttribute('width')),
            height: parseFloat(selectedImage.getAttribute('height')),
            rotation: imageRotation
        };
        
        // Get the original rotation from the stored start rotation or current rotation
        let originalRotation = imageRotation;
        if (isRotatingImage && startImageRotation !== null) {
            originalRotation = startImageRotation;
        }
        
        const oldPos = {
            x: originalX,
            y: originalY,
            width: originalWidth,
            height: originalHeight,
            rotation: originalRotation
        };

        // Find the ImageShape wrapper for frame tracking
        let imageShape = null;
        if (typeof shapes !== 'undefined' && Array.isArray(shapes)) {
            imageShape = shapes.find(shape => shape.shapeName === 'image' && shape.element === selectedImage);
        }

        // Add frame information for undo tracking
        const oldPosWithFrame = {
            ...oldPos,
            parentFrame: draggedShapeInitialFrameImage
        };
        const newPosWithFrame = {
            ...newPos,
            parentFrame: imageShape ? imageShape.parentFrame : null
        };

        // Only push transform action if something actually changed
        const stateChanged = newPos.x !== oldPos.x || newPos.y !== oldPos.y || 
                           newPos.width !== oldPos.width || newPos.height !== oldPos.height ||
                           newPos.rotation !== oldPos.rotation;
        const frameChanged = oldPosWithFrame.parentFrame !== newPosWithFrame.parentFrame;

        if (stateChanged || frameChanged) {
            pushTransformAction({
                type: 'image',
                element: selectedImage,
                restore: (pos) => {
                    selectedImage.setAttribute('x', pos.x);
                    selectedImage.setAttribute('y', pos.y);
                    selectedImage.setAttribute('width', pos.width);
                    selectedImage.setAttribute('height', pos.height);
                    const centerX = pos.x + pos.width / 2;
                    const centerY = pos.y + pos.height / 2;
                    selectedImage.setAttribute('transform', `rotate(${pos.rotation}, ${centerX}, ${centerY})`);
                    imageRotation = pos.rotation;
                    
                    // Update selection outline if image is selected
                    if (selectedImage) {
                        removeSelectionOutline();
                        addSelectionOutline();
                    }
                    
                    // Update data attributes for arrow attachment consistency
                    selectedImage.setAttribute('data-shape-x', pos.x);
                    selectedImage.setAttribute('data-shape-y', pos.y);
                    selectedImage.setAttribute('data-shape-width', pos.width);
                    selectedImage.setAttribute('data-shape-height', pos.height);
                    selectedImage.setAttribute('data-shape-rotation', pos.rotation);
                    
                    // Update attached arrows
                    if (typeof updateAttachedArrows === 'function') {
                        updateAttachedArrows(selectedImage);
                    }
                }
            }, oldPosWithFrame, newPosWithFrame);
        }

        // Handle frame containment changes after drag
        if (isDragging && imageShape) {
            const finalFrame = hoveredFrameImage;
            
            // If shape moved to a different frame
            if (draggedShapeInitialFrameImage !== finalFrame) {
                // Remove from initial frame
                if (draggedShapeInitialFrameImage) {
                    draggedShapeInitialFrameImage.removeShapeFromFrame(imageShape);
                }
                
                // Add to new frame
                if (finalFrame) {
                    finalFrame.addShapeToFrame(imageShape);
                }
                
                // Track the frame change for undo
                if (frameChanged) {
                    pushFrameAttachmentAction(finalFrame || draggedShapeInitialFrameImage, imageShape, 
                        finalFrame ? 'attach' : 'detach', draggedShapeInitialFrameImage);
                }
            } else if (draggedShapeInitialFrameImage) {
                // Shape stayed in same frame, restore clipping
                draggedShapeInitialFrameImage.restoreToFrame(imageShape);
            }
        }
        
        draggedShapeInitialFrameImage = null;
    }

    // Clear frame highlighting
    if (hoveredFrameImage) {
        hoveredFrameImage.removeHighlight();
        hoveredFrameImage = null;
    }

    isDragging = false;
    isRotatingImage = false;
    svg.removeEventListener('mousemove', dragImage);
    svg.removeEventListener('mousemove', resizeImage);
    svg.removeEventListener('mousemove', rotateImage);
    currentAnchor = null;
    startRotationMouseAngle = null;
    startImageRotation = null;

    // Update originalX, originalY, originalWidth and originalHeight after dragging/resizing is complete
    if (selectedImage) {
        originalX = parseFloat(selectedImage.getAttribute('x'));
        originalY = parseFloat(selectedImage.getAttribute('y'));
        originalWidth = parseFloat(selectedImage.getAttribute('width'));
        originalHeight = parseFloat(selectedImage.getAttribute('height'));
        
        // Update the current rotation from the image transform
        const transform = selectedImage.getAttribute('transform');
        if (transform) {
            const rotateMatch = transform.match(/rotate\(([^,]+)/);
            if (rotateMatch) {
                imageRotation = parseFloat(rotateMatch[1]);
            }
        }
        
        // Update data attributes for arrow attachment consistency
        selectedImage.setAttribute('data-shape-x', originalX);
        selectedImage.setAttribute('data-shape-y', originalY);
        selectedImage.setAttribute('data-shape-width', originalWidth);
        selectedImage.setAttribute('data-shape-height', originalHeight);
        selectedImage.setAttribute('data-shape-rotation', imageRotation);
        
        // Update attached arrows after interaction ends
        if (typeof updateAttachedArrows === 'function') {
            updateAttachedArrows(selectedImage);
        }
    }
}

// Add delete functionality for images
function deleteCurrentImage() {
    if (selectedImage) {
        // Find the ImageShape wrapper
        let imageShape = null;
        if (typeof shapes !== 'undefined' && Array.isArray(shapes)) {
            imageShape = shapes.find(shape => shape.shapeName === 'image' && shape.element === selectedImage);
            if (imageShape) {
                const idx = shapes.indexOf(imageShape);
                if (idx !== -1) shapes.splice(idx, 1);
                
                // Remove the group (which contains the image)
                if (imageShape.group && imageShape.group.parentNode) {
                    imageShape.group.parentNode.removeChild(imageShape.group);
                }
            }
        }
        
        // Fallback: if no ImageShape wrapper found, remove the image directly
        if (!imageShape && selectedImage.parentNode) {
            selectedImage.parentNode.removeChild(selectedImage);
        }
        
        // Clean up any arrow attachments before deleting
        if (typeof cleanupAttachments === 'function') {
            cleanupAttachments(selectedImage);
        }
        
        // Push delete action for undo
        if (imageShape) {
            pushDeleteAction(imageShape);
        }
        
        // Clean up selection
        removeSelectionOutline();
        selectedImage = null;
    }
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Delete' && selectedImage) {
        deleteCurrentImage();
    }
});

export { handleMouseDownImage, handleMouseMoveImage, handleMouseUpImage };