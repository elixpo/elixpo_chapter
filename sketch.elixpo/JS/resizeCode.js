




// Start Resize
function startResize(event, handle) {
    isResizing = true;
    startDragX = screenToSVGCoords(event.clientX, event.clientY).x;
    startDragY = screenToSVGCoords(event.clientX, event.clientY).y;
    currentHandle = handle;
    originalBBox = getCombinedBBox(); // Store combined bbox
    // Find common ancestor and the rect/path elements within
    let commonAncestor = findCommonAncestor(Array.from(selectedElements));
    rectElement = commonAncestor.querySelectorAll("rect, path"); // Assuming you want to transform all rects and paths within the selected elements


    svgCanvas.addEventListener("mousemove", resizeElement);
    svgCanvas.addEventListener("mouseup", stopResize);
    event.stopPropagation(); // Prevent selection changes during resize
}

// Resize Logic
function resizeElement(event) {
    if (!isResizing) return;

    const currentX = screenToSVGCoords(event.clientX, event.clientY).x;
    const currentY = screenToSVGCoords(event.clientX, event.clientY).y;

    let newX = originalBBox.x;
    let newY = originalBBox.y;
    let newWidth = originalBBox.width;
    let newHeight = originalBBox.height;

    switch (currentHandle.dataset.resizeType) {
        case "se":
            newWidth = currentX - originalBBox.x;
            newHeight = currentY - originalBBox.y;
            break;
        case "nw":
            newWidth = originalBBox.x + originalBBox.width - currentX;
            newHeight = originalBBox.y + originalBBox.height - currentY;
            newX = currentX;
            newY = currentY;
            break;
        case "ne":
            newWidth = currentX - originalBBox.x;
            newHeight = originalBBox.y + originalBBox.height - currentY;
            newY = currentY;
            break;
        case "sw":
            newWidth = originalBBox.x + originalBBox.width - currentX;
            newHeight = currentY - originalBBox.y;
            newX = currentX;
            break;
        case "top":
            newHeight = originalBBox.y + originalBBox.height - currentY;
            newY = currentY;
            break;
        case "bottom":
            newHeight = currentY - originalBBox.y;
            break;
        case "left":
            newWidth = originalBBox.x + originalBBox.width - currentX;
            newX = currentX;
            break;
        case "right":
            newWidth = currentX - originalBBox.x;
            break;
    }

    // Prevent negative dimensions
    newWidth = Math.max(5, newWidth);
    newHeight = Math.max(5, newHeight);

    // Apply transformations to all selected elements
    selectedElements.forEach(element => {
        // Apply the new dimensions to each element based on its type
        if (element.tagName === 'rect') {
            const originalElementBBox = getTransformedBBox(element); //Get indiv element box
            // Calculate deltas relative to the ORIGINAL combined bbox
            const deltaX = newX - originalBBox.x;
            const deltaY = newY - originalBBox.y;
            const widthChange = newWidth - originalBBox.width;
            const heightChange = newHeight - originalBBox.height;


            //Adjust the X,Y, width height of the rectangle element.
            element.setAttribute('x', parseFloat(element.getAttribute('x')) + deltaX);
            element.setAttribute('y', parseFloat(element.getAttribute('y')) + deltaY);
            element.setAttribute('width', parseFloat(element.getAttribute('width')) + widthChange);
            element.setAttribute('height', parseFloat(element.getAttribute('height')) + heightChange);
        } else if (element.tagName === 'path') {
            // Complex path resizing logic (Requires parsing and manipulating path data)
            // This is a placeholder.  Resizing paths non-uniformly is MUCH more complex.
            //This will require parsing the "d" attribute and modifying coordinates.
            console.warn("Resizing paths non-uniformly is not yet implemented");
        }
    });

    // Update resize handles
    removeSelectionBox();
    drawSelectionBox();
}

// Stop Resizing
function stopResize() {
    isResizing = false;
    svgCanvas.removeEventListener("mousemove", resizeElement);
    svgCanvas.removeEventListener("mouseup", stopResize);
}

// Helper function to find the common ancestor of multiple elements
function findCommonAncestor(elements) {
    if (!elements || elements.length === 0) {
        return null;
    }
    if (elements.length === 1) {
        return elements[0].parentNode;
    }

    let ancestors = new Set();
    let firstElement = elements[0];

    // Add all ancestors of the first element to the set
    let parent = firstElement.parentNode;
    while (parent) {
        ancestors.add(parent);
        parent = parent.parentNode;
    }

    // Find the common ancestor by traversing the ancestors of the other elements
    for (let i = 1; i < elements.length; i++) {
        let currentElement = elements[i];
        while (currentElement) {
            if (ancestors.has(currentElement)) {
                return currentElement;
            }
            currentElement = currentElement.parentNode;
        }
    }

    return null; // No common ancestor found
}