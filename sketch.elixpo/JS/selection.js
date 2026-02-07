let isMultiSelecting = false;
let multiSelectionStart = { x: 0, y: 0 };
let multiSelectionRect = null;
let isDraggingMultiSelection = false;

function getSVGCoordsFromMouse(e) {
    const viewBox = svg.viewBox.baseVal;
    const rect = svg.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const svgX = viewBox.x + (mouseX / rect.width) * viewBox.width;
    const svgY = viewBox.y + (mouseY / rect.height) * viewBox.height;
    return { x: svgX, y: svgY };
}

function createMultiSelectionRect(startX, startY) {
    multiSelectionRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    multiSelectionRect.setAttribute('x', startX);
    multiSelectionRect.setAttribute('y', startY);
    multiSelectionRect.setAttribute('width', 0);
    multiSelectionRect.setAttribute('height', 0);
    multiSelectionRect.setAttribute('fill', 'rgba(91, 87, 209, 0.1)');
    multiSelectionRect.setAttribute('stroke', '#5B57D1');
    multiSelectionRect.setAttribute('stroke-width', 1);
    multiSelectionRect.setAttribute('stroke-dasharray', '4 2');
    multiSelectionRect.setAttribute('style', 'pointer-events: none;');
    svg.appendChild(multiSelectionRect);
}

function updateMultiSelectionRect(currentX, currentY) {
    if (!multiSelectionRect) return;

    const x = Math.min(multiSelectionStart.x, currentX);
    const y = Math.min(multiSelectionStart.y, currentY);
    const width = Math.abs(currentX - multiSelectionStart.x);
    const height = Math.abs(currentY - multiSelectionStart.y);

    multiSelectionRect.setAttribute('x', x);
    multiSelectionRect.setAttribute('y', y);
    multiSelectionRect.setAttribute('width', width);
    multiSelectionRect.setAttribute('height', height);
}

function removeMultiSelectionRect() {
    if (multiSelectionRect && multiSelectionRect.parentNode) {
        multiSelectionRect.parentNode.removeChild(multiSelectionRect);
    }
    multiSelectionRect = null;
}

function isShapeInSelectionRect(shape, selectionBounds) {
    let shapeBounds;

    switch (shape.shapeName) {
        case 'rectangle':
            shapeBounds = {
                x: shape.x,
                y: shape.y,
                width: shape.width,
                height: shape.height
            };
            break;
        case 'circle':
            shapeBounds = {
                x: shape.x - shape.rx,
                y: shape.y - shape.ry,
                width: shape.rx * 2,
                height: shape.ry * 2
            };
            break;
        case 'line':
            shapeBounds = {
                x: Math.min(shape.startPoint.x, shape.endPoint.x),
                y: Math.min(shape.startPoint.y, shape.endPoint.y),
                width: Math.abs(shape.endPoint.x - shape.startPoint.x),
                height: Math.abs(shape.endPoint.y - shape.startPoint.y)
            };
            break;
        case 'arrow':
            const minX = Math.min(shape.startPoint.x, shape.endPoint.x);
            const minY = Math.min(shape.startPoint.y, shape.endPoint.y);
            const maxX = Math.max(shape.startPoint.x, shape.endPoint.x);
            const maxY = Math.max(shape.startPoint.y, shape.endPoint.y);
            shapeBounds = {
                x: minX,
                y: minY,
                width: maxX - minX,
                height: maxY - minY
            };
            break;
        case 'freehandStroke':
            shapeBounds = {
                x: shape.boundingBox.x,
                y: shape.boundingBox.y,
                width: shape.boundingBox.width,
                height: shape.boundingBox.height
            };
            break;
        case 'text':
            const textElement = shape.group ? shape.group.querySelector('text') : null;
            if (textElement) {
                const bbox = textElement.getBBox();
                const transform = shape.group.transform.baseVal.consolidate();
                const matrix = transform ? transform.matrix : { e: 0, f: 0 };
                shapeBounds = {
                    x: bbox.x + matrix.e,
                    y: bbox.y + matrix.f,
                    width: bbox.width,
                    height: bbox.height
                };
            } else {
                shapeBounds = { x: 0, y: 0, width: 0, height: 0 };
            }
            break;
        case 'image':
            if (shape.element) {
                shapeBounds = {
                    x: parseFloat(shape.element.getAttribute('x')),
                    y: parseFloat(shape.element.getAttribute('y')),
                    width: parseFloat(shape.element.getAttribute('width')),
                    height: parseFloat(shape.element.getAttribute('height'))
                };
            } else {
                shapeBounds = { x: shape.x, y: shape.y, width: shape.width, height: shape.height };
            }
            break;
        case 'frame':
            shapeBounds = {
                x: shape.x,
                y: shape.y,
                width: shape.width,
                height: shape.height
            };
            break;
        case 'icon':
            shapeBounds = {
                x: shape.x,
                y: shape.y,
                width: shape.width,
                height: shape.height
            };
            break;
        default:
            shapeBounds = {
                x: shape.x || 0,
                y: shape.y || 0,
                width: shape.width || 0,
                height: shape.height || 0
            };
    }

    return !(selectionBounds.x > shapeBounds.x + shapeBounds.width ||
             selectionBounds.x + selectionBounds.width < shapeBounds.x ||
             selectionBounds.y > shapeBounds.y + shapeBounds.height ||
             selectionBounds.y + selectionBounds.height < shapeBounds.y);
}

class MultiSelection {
    constructor() {
        this.selectedShapes = new Set();
        this.group = null;
        this.anchors = [];
        this.outline = null;
        this.rotationAnchor = null;
        this.rotationLine = null;
        this.selectionPadding = 12;
        this.bounds = null;
        this.initialPositions = new Map();

        this.isDragging = false;
        this.isResizing = false;
        this.isRotating = false;
        this.resizingAnchorIndex = null;
        this.dragStart = { x: 0, y: 0 };
        this.rotationCenter = { x: 0, y: 0 };
        this.startRotationMouseAngle = 0;
        this.initialRotation = 0;
    }

    addShape(shape) {
        this.selectedShapes.add(shape);
        shape.isSelected = true;
        this.updateControls();
    }

    removeShape(shape) {
        this.selectedShapes.delete(shape);
        shape.isSelected = false;
        if (this.selectedShapes.size === 0) {
            this.clearSelection();
        } else {
            this.updateControls();
        }
    }

    clearSelection() {
        this.selectedShapes.forEach(shape => {
            shape.isSelected = false;
            if (typeof shape.removeSelection === 'function') {
                shape.removeSelection();
            }
        });
        this.selectedShapes.clear();
        this.removeControls();
        if (typeof currentShape !== 'undefined') {
            currentShape = null;
        }
        if (typeof disableAllSideBars === 'function') {
            disableAllSideBars();
        }
    }

    selectShapesInRect(selectionBounds) {
        this.clearSelection();

        if (typeof shapes !== 'undefined') {
            shapes.forEach(shape => {
                if (isShapeInSelectionRect(shape, selectionBounds)) {
                    this.addShape(shape);
                }
            });
        }

        if (this.selectedShapes.size === 1) {
            if (typeof currentShape !== 'undefined') {
                currentShape = Array.from(this.selectedShapes)[0];
            }
        } else {
            if (typeof currentShape !== 'undefined') {
                currentShape = null;
            }
        }
    }

    getBounds() {
        if (this.selectedShapes.size === 0) return null;

        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;

        this.selectedShapes.forEach(shape => {
            const shapeBounds = this.getShapeBounds(shape);
            minX = Math.min(minX, shapeBounds.x);
            minY = Math.min(minY, shapeBounds.y);
            maxX = Math.max(maxX, shapeBounds.x + shapeBounds.width);
            maxY = Math.max(maxY, shapeBounds.y + shapeBounds.height);
        });

        return {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY
        };
    }

    getShapeBounds(shape) {
        switch (shape.shapeName) {
            case 'rectangle':
            case 'frame':
                return {
                    x: shape.x,
                    y: shape.y,
                    width: shape.width,
                    height: shape.height
                };
            case 'circle':
                return {
                    x: shape.x - shape.rx,
                    y: shape.y - shape.ry,
                    width: shape.rx * 2,
                    height: shape.ry * 2
                };
            case 'line':
            case 'arrow':
                return {
                    x: Math.min(shape.startPoint.x, shape.endPoint.x),
                    y: Math.min(shape.startPoint.y, shape.endPoint.y),
                    width: Math.abs(shape.endPoint.x - shape.startPoint.x),
                    height: Math.abs(shape.endPoint.y - shape.startPoint.y)
                };
            case 'freehandStroke':
                return {
                    x: shape.boundingBox.x,
                    y: shape.boundingBox.y,
                    width: shape.boundingBox.width,
                    height: shape.boundingBox.height
                };
            case 'text':
                const textElement = shape.group ? shape.group.querySelector('text') : null;
                if (textElement) {
                    const bbox = textElement.getBBox();
                    const transform = shape.group.transform.baseVal.consolidate();
                    const matrix = transform ? transform.matrix : { e: 0, f: 0 };
                    return {
                        x: bbox.x + matrix.e,
                        y: bbox.y + matrix.f,
                        width: bbox.width,
                        height: bbox.height
                    };
                }
                return { x: 0, y: 0, width: 0, height: 0 };
            case 'image':
                if (shape.element) {
                    return {
                        x: parseFloat(shape.element.getAttribute('x')),
                        y: parseFloat(shape.element.getAttribute('y')),
                        width: parseFloat(shape.element.getAttribute('width')),
                        height: parseFloat(shape.element.getAttribute('height'))
                    };
                }
                return { x: shape.x, y: shape.y, width: shape.width, height: shape.height };
            case 'icon':
            return {
                x: shape.x,
                y: shape.y,
                width: shape.width,
                height: shape.height
            };
            default:
                return {
                    x: shape.x || 0,
                    y: shape.y || 0,
                    width: shape.width || 0,
                    height: shape.height || 0
                };
        }
    }

    updateControls() {
        this.removeControls();
        if (this.selectedShapes.size === 0) return;

        this.bounds = this.getBounds();
        if (!this.bounds) return;

        this.createControls();
    }

    createControls() {
        this.createRotatedControls(0);
    }

    createOutline(x, y, width, height) {
        const outlinePoints = [
            [x, y],
            [x + width, y],
            [x + width, y + height],
            [x, y + height],
            [x, y]
        ];

        this.outline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        this.outline.setAttribute('points', outlinePoints.map(p => p.join(',')).join(' '));
        this.outline.setAttribute('fill', 'none');
        this.outline.setAttribute('stroke', '#5B57D1');
        this.outline.setAttribute('stroke-width', 2);
        this.outline.setAttribute('stroke-dasharray', '8 4');
        this.outline.setAttribute('style', 'pointer-events: none;');
        this.group.appendChild(this.outline);
    }

    createResizeAnchors(x, y, width, height) {
        const anchorSize = 12;
        const anchorPositions = [
            { x: x, y: y, index: 0 },
            { x: x + width, y: y, index: 1 },
            { x: x, y: y + height, index: 2 },
            { x: x + width, y: y + height, index: 3 },
            { x: x + width / 2, y: y, index: 4 },
            { x: x + width / 2, y: y + height, index: 5 },
            { x: x, y: y + height / 2, index: 6 },
            { x: x + width, y: y + height / 2, index: 7 }
        ];

        this.anchors = [];
        anchorPositions.forEach((pos) => {
            const anchor = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            anchor.setAttribute('x', pos.x - anchorSize / 2);
            anchor.setAttribute('y', pos.y - anchorSize / 2);
            anchor.setAttribute('width', anchorSize);
            anchor.setAttribute('height', anchorSize);
            anchor.setAttribute('class', 'multi-selection-anchor');
            anchor.setAttribute('data-index', pos.index);
            anchor.setAttribute('fill', '#121212');
            anchor.setAttribute('stroke', '#5B57D1');
            anchor.setAttribute('stroke-width', 2);
            anchor.setAttribute('style', 'pointer-events: all; cursor: pointer;');

            const cursors = ['nw-resize', 'ne-resize', 'sw-resize', 'se-resize', 'n-resize', 's-resize', 'w-resize', 'e-resize'];
            anchor.style.cursor = cursors[pos.index];

            anchor.addEventListener('mousedown', (e) => this.startResize(e, pos.index));

            this.group.appendChild(anchor);
            this.anchors.push(anchor);
        });
    }

    createRotationAnchor(x, y, width, height) {
        const rotationAnchorPos = { x: x + width / 2, y: y - 30 };

        this.rotationAnchor = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        this.rotationAnchor.setAttribute('cx', rotationAnchorPos.x);
        this.rotationAnchor.setAttribute('cy', rotationAnchorPos.y);
        this.rotationAnchor.setAttribute('r', 8);
        this.rotationAnchor.setAttribute('class', 'multi-selection-rotation-anchor');
        this.rotationAnchor.setAttribute('fill', '#121212');
        this.rotationAnchor.setAttribute('stroke', '#5B57D1');
        this.rotationAnchor.setAttribute('stroke-width', 2);
        this.rotationAnchor.setAttribute('style', 'pointer-events: all; cursor: grab;');

        this.rotationAnchor.addEventListener('mousedown', (e) => this.startRotation(e));

        this.rotationLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        this.rotationLine.setAttribute('x1', rotationAnchorPos.x);
        this.rotationLine.setAttribute('y1', rotationAnchorPos.y);
        this.rotationLine.setAttribute('x2', x + width / 2);
        this.rotationLine.setAttribute('y2', y);
        this.rotationLine.setAttribute('stroke', '#5B57D1');
        this.rotationLine.setAttribute('stroke-width', 1);
        this.rotationLine.setAttribute('stroke-dasharray', '3 3');
        this.rotationLine.setAttribute('style', 'pointer-events: none;');

        this.group.appendChild(this.rotationLine);
        this.group.appendChild(this.rotationAnchor);
    }

    removeControls() {
        if (this.group && this.group.parentNode) {
            this.group.parentNode.removeChild(this.group);
        }
        this.group = null;
        this.anchors = [];
        this.outline = null;
        this.rotationAnchor = null;
        this.rotationLine = null;
    }

    isPointInBounds(x, y) {
        if (!this.bounds) return false;

        const padding = this.selectionPadding;
        return x >= this.bounds.x - padding && x <= this.bounds.x + this.bounds.width + padding &&
               y >= this.bounds.y - padding && y <= this.bounds.y + this.bounds.height + padding;
    }

    move(dx, dy) {
    this.selectedShapes.forEach(shape => {
        switch (shape.shapeName) {
            case 'rectangle':
            case 'circle':
            case 'freehandStroke':
            case 'frame':
                if (typeof shape.move === 'function') {
                    shape.move(dx, dy);
                    shape.draw();
                }
                break;
            case 'line':
            case 'arrow':
                if (typeof shape.move === 'function') {
                    shape.move(dx, dy);
                    shape.draw();
                }
                break;
            case 'text':
            case 'image':
            case 'icon':
                if (typeof shape.move === 'function') {
                    shape.move(dx, dy);
                }
                break;
        }

        if (typeof shape.updateAttachedArrows === 'function') {
            shape.updateAttachedArrows();
        }
    });

    this.updateControls();
}

    startRotation(e) {
        e.stopPropagation();
        e.preventDefault();

        this.isRotating = true;

        const currentBounds = this.getBounds();
        this.rotationCenter = {
            x: currentBounds.x + currentBounds.width / 2,
            y: currentBounds.y + currentBounds.height / 2
        };

        const { x: mouseX, y: mouseY } = getSVGCoordsFromMouse(e);
        this.startRotationMouseAngle = Math.atan2(mouseY - this.rotationCenter.y, mouseX - this.rotationCenter.x) * 180 / Math.PI;

        this.storeInitialPositions();

        const onMouseMove = (event) => {
            if (this.isRotating) {
                this.handleRotation(event);
            }
        };

        const onMouseUp = () => {
            this.isRotating = false;
            this.initialPositions.clear();
            if (typeof svg !== 'undefined') {
                svg.removeEventListener('mousemove', onMouseMove);
                svg.removeEventListener('mouseup', onMouseUp);
                svg.style.cursor = 'default';
            }
        };

        if (typeof svg !== 'undefined') {
            svg.addEventListener('mousemove', onMouseMove);
            svg.addEventListener('mouseup', onMouseUp);
            svg.style.cursor = 'grabbing';
        }
    }

    storeInitialPositions() {
        this.initialPositions.clear();

        const initialBounds = this.getBounds();
        this.initialPositions.set('initialBounds', {
            x: initialBounds.x,
            y: initialBounds.y,
            width: initialBounds.width,
            height: initialBounds.height
        });

        this.selectedShapes.forEach(shape => {
            let shapeData;

            let shapeCenterX, shapeCenterY;

            switch (shape.shapeName) {
                case 'rectangle':
                case 'frame':
                    shapeCenterX = shape.x + shape.width / 2;
                    shapeCenterY = shape.y + shape.height / 2;
                    shapeData = {
                        x: shape.x,
                        y: shape.y,
                        width: shape.width || 0,
                        height: shape.height || 0,
                        rotation: shape.rotation || 0,
                        centerX: shapeCenterX,
                        centerY: shapeCenterY,
                        relativeX: shapeCenterX - this.rotationCenter.x,
                        relativeY: shapeCenterY - this.rotationCenter.y
                    };
                    break;
                case 'icon':
                shapeCenterX = shape.x + shape.width / 2;
                shapeCenterY = shape.y + shape.height / 2;
                shapeData = {
                    x: shape.x,
                    y: shape.y,
                    width: shape.width || 0,
                    height: shape.height || 0,
                    rotation: shape.rotation || 0,
                    centerX: shapeCenterX,
                    centerY: shapeCenterY,
                    relativeX: shapeCenterX - this.rotationCenter.x,
                    relativeY: shapeCenterY - this.rotationCenter.y
                };
                break;

                case 'circle':
                    shapeCenterX = shape.x;
                    shapeCenterY = shape.y;
                    shapeData = {
                        x: shape.x,
                        y: shape.y,
                        rx: shape.rx || 0,
                        ry: shape.ry || 0,
                        rotation: shape.rotation || 0,
                        centerX: shapeCenterX,
                        centerY: shapeCenterY,
                        relativeX: shapeCenterX - this.rotationCenter.x,
                        relativeY: shapeCenterY - this.rotationCenter.y
                    };
                    break;

                case 'line':
                case 'arrow':
                    shapeData = {
                        startPoint: { ...shape.startPoint },
                        endPoint: { ...shape.endPoint },
                        relativeStartX: shape.startPoint.x - this.rotationCenter.x,
                        relativeStartY: shape.startPoint.y - this.rotationCenter.y,
                        relativeEndX: shape.endPoint.x - this.rotationCenter.x,
                        relativeEndY: shape.endPoint.y - this.rotationCenter.y
                    };
                    break;

                    case 'freehandStroke':
                        if (!shape.points || !Array.isArray(shape.points) || shape.points.length === 0) {
                            console.warn('FreehandStroke has invalid points array');
                            return;
                        }

                        const validPoints = shape.points.filter(point =>
                            Array.isArray(point) &&
                            point.length >= 2 &&
                            typeof point[0] === 'number' &&
                            typeof point[1] === 'number' &&
                            !isNaN(point[0]) &&
                            !isNaN(point[1])
                        );

                        if (validPoints.length === 0) {
                            console.warn('FreehandStroke has no valid points');
                            return;
                        }

                        if (typeof shape.updateBoundingBox === 'function') {
                            shape.updateBoundingBox();
                        }

                        const boundingBox = shape.boundingBox || this.getShapeBounds(shape);

                        shapeData = {
                            x: boundingBox.x || 0,
                            y: boundingBox.y || 0,
                            width: boundingBox.width || 0,
                            height: boundingBox.height || 0,
                            points: validPoints.map(point => [point[0], point[1], point[2] || 0.5]),
                            relativePoints: validPoints.map(point => [
                                point[0] - this.rotationCenter.x,
                                point[1] - this.rotationCenter.y,
                                point[2] || 0.5
                            ]),
                            boundingBox: { ...boundingBox }
                        };
                        break;

                        case 'text':
                        const textBounds = this.getShapeBounds(shape);
                        shapeCenterX = textBounds.x + textBounds.width / 2;
                        shapeCenterY = textBounds.y + textBounds.height / 2;

                        const currentTransform = shape.group.transform.baseVal.consolidate();
                        const currentX = currentTransform ? currentTransform.matrix.e : 0;
                        const currentY = currentTransform ? currentTransform.matrix.f : 0;

                        shapeData = {
                            x: currentX,
                            y: currentY,
                            width: shape.width || textBounds.width,
                            height: shape.height || textBounds.height,
                            rotation: shape.rotation || 0,
                            centerX: shapeCenterX,
                            centerY: shapeCenterY,
                            relativeX: shapeCenterX - this.rotationCenter.x,
                            relativeY: shapeCenterY - this.rotationCenter.y,
                            visualBounds: textBounds,
                            transformX: currentX,
                            transformY: currentY
                        };
                        break;

                case 'image':
                    shapeCenterX = shape.x + (shape.width || 0) / 2;
                    shapeCenterY = shape.y + (shape.height || 0) / 2;
                    shapeData = {
                        x: shape.x || 0,
                        y: shape.y || 0,
                        width: shape.width || 0,
                        height: shape.height || 0,
                        rotation: shape.rotation || 0,
                        centerX: shapeCenterX,
                        centerY: shapeCenterY,
                        relativeX: shapeCenterX - this.rotationCenter.x,
                        relativeY: shapeCenterY - this.rotationCenter.y
                    };
                    break;

                default:
                    shapeCenterX = (shape.x || 0) + (shape.width || 0) / 2;
                    shapeCenterY = (shape.y || 0) + (shape.height || 0) / 2;
                    shapeData = {
                        x: shape.x || 0,
                        y: shape.y || 0,
                        width: shape.width || 0,
                        height: shape.height || 0,
                        rotation: shape.rotation || 0,
                        centerX: shapeCenterX,
                        centerY: shapeCenterY,
                        relativeX: shapeCenterX - this.rotationCenter.x,
                        relativeY: shapeCenterY - this.rotationCenter.y
                    };
            }

            if (shapeData) {
                this.initialPositions.set(shape, shapeData);
            }
        });
    }

    handleRotation(e) {
        const { x: mouseX, y: mouseY } = getSVGCoordsFromMouse(e);
        const currentMouseAngle = Math.atan2(mouseY - this.rotationCenter.y, mouseX - this.rotationCenter.x) * 180 / Math.PI;
        const angleDiff = currentMouseAngle - this.startRotationMouseAngle;
        const angleRad = angleDiff * Math.PI / 180;
        const cosAngle = Math.cos(angleRad);
        const sinAngle = Math.sin(angleRad);

        this.selectedShapes.forEach(shape => {
            const initialData = this.initialPositions.get(shape);
            if (!initialData) return;

            if (typeof shape.removeSelection === 'function') {
                shape.removeSelection();
            }

            switch (shape.shapeName) {
                case 'rectangle':
                case 'frame':
                case 'image':
                case 'icon':
                    const newCenterX = this.rotationCenter.x + (initialData.relativeX * cosAngle - initialData.relativeY * sinAngle);
                    const newCenterY = this.rotationCenter.y + (initialData.relativeX * sinAngle + initialData.relativeY * cosAngle);

                    shape.x = newCenterX - initialData.width / 2;
                    shape.y = newCenterY - initialData.height / 2;
                    shape.rotation = (initialData.rotation || 0) + angleDiff;

                    if (typeof shape.rotate === 'function') {
                        shape.rotate(shape.rotation);
                    }
                    if (typeof shape.draw === 'function') {
                        shape.draw();
                    }
                    break;

                    case 'text':
                    const newTextCenterX = this.rotationCenter.x + (initialData.relativeX * cosAngle - initialData.relativeY * sinAngle);
                    const newTextCenterY = this.rotationCenter.y + (initialData.relativeX * sinAngle + initialData.relativeY * cosAngle);

                    const textElement = shape.group.querySelector('text');
                    if (textElement) {
                        const initialBbox = initialData.visualBounds;

                        const newTransformX = newTextCenterX - initialBbox.width / 2;
                        const newTransformY = newTextCenterY - initialBbox.height / 2;

                        const newRotation = (initialData.rotation || 0) + angleDiff;

                        const textCenterX = initialBbox.width / 2;
                        const textCenterY = initialBbox.height / 2;

                        shape.group.setAttribute('transform',
                            `translate(${newTransformX}, ${newTransformY}) rotate(${newRotation}, ${textCenterX}, ${textCenterY})`
                        );

                        shape.x = newTransformX;
                        shape.y = newTransformY;
                        shape.rotation = newRotation;
                    }

                    if (typeof shape.draw === 'function') {
                        shape.draw();
                    }
                    break;

                case 'circle':
                    const newCircleCenterX = this.rotationCenter.x + (initialData.relativeX * cosAngle - initialData.relativeY * sinAngle);
                    const newCircleCenterY = this.rotationCenter.y + (initialData.relativeX * sinAngle + initialData.relativeY * cosAngle);

                    shape.x = newCircleCenterX;
                    shape.y = newCircleCenterY;
                    shape.rotation = (initialData.rotation || 0) + angleDiff;

                    if (typeof shape.rotate === 'function') {
                        shape.rotate(shape.rotation);
                    }
                    if (typeof shape.draw === 'function') {
                        shape.draw();
                    }
                    break;

                case 'line':
                case 'arrow':
                    const newStartX = this.rotationCenter.x + (initialData.relativeStartX * cosAngle - initialData.relativeStartY * sinAngle);
                    const newStartY = this.rotationCenter.y + (initialData.relativeStartX * sinAngle + initialData.relativeStartY * cosAngle);
                    const newEndX = this.rotationCenter.x + (initialData.relativeEndX * cosAngle - initialData.relativeEndY * sinAngle);
                    const newEndY = this.rotationCenter.y + (initialData.relativeEndX * sinAngle + initialData.relativeEndY * cosAngle);

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

                    case 'freehandStroke':
                        if (!initialData.relativePoints || !Array.isArray(initialData.relativePoints)) {
                            console.warn('FreehandStroke missing valid relativePoints');
                            break;
                        }

                        const rotatedPoints = initialData.relativePoints.map(relPoint => {
                            if (!Array.isArray(relPoint) || relPoint.length < 2 ||
                                typeof relPoint[0] !== 'number' || typeof relPoint[1] !== 'number' ||
                                isNaN(relPoint[0]) || isNaN(relPoint[1])) {
                                console.warn('Invalid relative point:', relPoint);
                                return [0, 0, 0.5];
                            }

                            const newX = this.rotationCenter.x + (relPoint[0] * cosAngle - relPoint[1] * sinAngle);
                            const newY = this.rotationCenter.y + (relPoint[0] * sinAngle + relPoint[1] * cosAngle);

                            if (isNaN(newX) || isNaN(newY)) {
                                console.warn('Generated NaN coordinates:', { newX, newY, relPoint, rotationCenter: this.rotationCenter });
                                return [0, 0, 0.5];
                            }

                            return [newX, newY, relPoint[2] || 0.5];
                        });

                        shape.points = rotatedPoints.filter(point =>
                            Array.isArray(point) &&
                            point.length >= 2 &&
                            typeof point[0] === 'number' &&
                            typeof point[1] === 'number' &&
                            !isNaN(point[0]) &&
                            !isNaN(point[1])
                        );

                        if (shape.points.length === 0) {
                            console.warn('No valid points after rotation');
                            shape.points = [[0, 0, 0.5]];
                        }

                        if (typeof shape.updateBoundingBox === 'function') {
                            shape.updateBoundingBox();
                        }
                        if (typeof shape.draw === 'function') {
                            shape.draw();
                        }
                        break;
            }

            if (typeof shape.updateAttachedArrows === 'function') {
                shape.updateAttachedArrows();
            }
        });

        this.updateControlsAfterRotation();
    }

    updateControlsAfterRotation() {
        this.removeControls();
        if (this.selectedShapes.size === 0) return;

        this.bounds = this.getBounds();

        if (!this.bounds) {
            return;
        }

        this.createControls();
    }


createRotatedControls(angleDiff = 0) {
    this.group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    this.group.setAttribute('id', 'multi-selection-controls');

    if (angleDiff !== 0) {
        const centerX = this.bounds.x + this.bounds.width / 2;
        const centerY = this.bounds.y + this.bounds.height / 2;
        this.group.setAttribute('transform', `rotate(${angleDiff} ${centerX} ${centerY})`);
    }

    if (typeof svg !== 'undefined') {
        svg.appendChild(this.group);
    }

    const expandedX = this.bounds.x - this.selectionPadding;
    const expandedY = this.bounds.y - this.selectionPadding;
    const expandedWidth = this.bounds.width + 2 * this.selectionPadding;
    const expandedHeight = this.bounds.height + 2 * this.selectionPadding;

    this.createOutline(expandedX, expandedY, expandedWidth, expandedHeight);
    this.createResizeAnchors(expandedX, expandedY, expandedWidth, expandedHeight);
    this.createRotationAnchor(expandedX, expandedY, expandedWidth, expandedHeight);
}

    startResize(e, anchorIndex) {
        e.stopPropagation();
        e.preventDefault();

        this.isResizing = true;
        this.resizingAnchorIndex = anchorIndex;

        this.initialPositions.clear();
        const initialBounds = this.getBounds();

        this.selectedShapes.forEach(shape => {
            let shapeData;
            shape.removeSelection();
            switch (shape.shapeName) {
                case 'rectangle':
                case 'icon': 
                    shapeData = {
                        x: shape.x,
                        y: shape.y,
                        width: shape.width,
                        height: shape.height,
                        rotation: shape.rotation
                    };
                    break;
                case 'circle':
                    shapeData = {
                        x: shape.x,
                        y: shape.y,
                        rx: shape.rx,
                        ry: shape.ry,
                        rotation: shape.rotation
                    };
                    break;
                case 'line':
                case 'arrow':
                    shapeData = {
                        startPoint: { ...shape.startPoint },
                        endPoint: { ...shape.endPoint }
                    };
                    break;
                default:
                    shapeData = {
                        x: shape.x || 0,
                        y: shape.y || 0,
                        width: shape.width || 0,
                        height: shape.height || 0
                    };
            }
            this.initialPositions.set(shape, shapeData);
        });

        this.initialPositions.set('bounds', initialBounds);

        const onMouseMove = (event) => {
            if (this.isResizing) {
                this.handleResize(event);
            }
        };

        const onMouseUp = () => {
            this.isResizing = false;
            this.resizingAnchorIndex = null;
            this.initialPositions.clear();
            if (typeof svg !== 'undefined') {
                svg.removeEventListener('mousemove', onMouseMove);
                svg.removeEventListener('mouseup', onMouseUp);
                svg.style.cursor = 'default';
            }
        };

        if (typeof svg !== 'undefined') {
            svg.addEventListener('mousemove', onMouseMove);
            svg.addEventListener('mouseup', onMouseUp);
        }
    }

    handleResize(e) {
        const { x: mouseX, y: mouseY } = getSVGCoordsFromMouse(e);
        const initialBounds = this.initialPositions.get('bounds');
        if (!initialBounds) return;

        let scaleX = 1, scaleY = 1;
        let newBounds = { ...initialBounds };

        switch (this.resizingAnchorIndex) {
            case 0:
                scaleX = (initialBounds.x + initialBounds.width - mouseX) / initialBounds.width;
                scaleY = (initialBounds.y + initialBounds.height - mouseY) / initialBounds.height;
                newBounds.x = mouseX;
                newBounds.y = mouseY;
                newBounds.width = initialBounds.x + initialBounds.width - mouseX;
                newBounds.height = initialBounds.y + initialBounds.height - mouseY;
                break;
            case 1:
                scaleX = (mouseX - initialBounds.x) / initialBounds.width;
                scaleY = (initialBounds.y + initialBounds.height - mouseY) / initialBounds.height;
                newBounds.y = mouseY;
                newBounds.width = mouseX - initialBounds.x;
                newBounds.height = initialBounds.y + initialBounds.height - mouseY;
                break;
            case 2:
                scaleX = (initialBounds.x + initialBounds.width - mouseX) / initialBounds.width;
                scaleY = (mouseY - initialBounds.y) / initialBounds.height;
                newBounds.x = mouseX;
                newBounds.width = initialBounds.x + initialBounds.width - mouseX;
                newBounds.height = mouseY - initialBounds.y;
                break;
            case 3:
                scaleX = (mouseX - initialBounds.x) / initialBounds.width;
                scaleY = (mouseY - initialBounds.y) / initialBounds.height;
                newBounds.width = mouseX - initialBounds.x;
                newBounds.height = mouseY - initialBounds.y;
                break;
            case 4:
                scaleY = (initialBounds.y + initialBounds.height - mouseY) / initialBounds.height;
                newBounds.y = mouseY;
                newBounds.height = initialBounds.y + initialBounds.height - mouseY;
                break;
            case 5:
                scaleY = (mouseY - initialBounds.y) / initialBounds.height;
                newBounds.height = mouseY - initialBounds.y;
                break;
            case 6:
                scaleX = (initialBounds.x + initialBounds.width - mouseX) / initialBounds.width;
                newBounds.x = mouseX;
                newBounds.width = initialBounds.x + initialBounds.width - mouseX;
                break;
            case 7:
                scaleX = (mouseX - initialBounds.x) / initialBounds.width;
                newBounds.width = mouseX - initialBounds.x;
                break;
        }

        scaleX = Math.max(0.1, Math.abs(scaleX));
        scaleY = Math.max(0.1, Math.abs(scaleY));

        this.selectedShapes.forEach(shape => {
            const initialData = this.initialPositions.get(shape);
            if (!initialData) return;

            switch (shape.shapeName) {
                case 'rectangle':
                case 'icon':
                    const relX = (initialData.x - initialBounds.x) / initialBounds.width;
                    const relY = (initialData.y - initialBounds.y) / initialBounds.height;
                    const relW = initialData.width / initialBounds.width;
                    const relH = initialData.height / initialBounds.height;

                    shape.x = newBounds.x + relX * newBounds.width;
                    shape.y = newBounds.y + relY * newBounds.height;
                    shape.width = relW * newBounds.width;
                    shape.height = relH * newBounds.height;
                    shape.draw();
                    break;

                case 'circle':
                    const relXCircle = (initialData.x - initialBounds.x) / initialBounds.width;
                    const relYCircle = (initialData.y - initialBounds.y) / initialBounds.height;

                    shape.x = newBounds.x + relXCircle * newBounds.width;
                    shape.y = newBounds.y + relYCircle * newBounds.height;
                    shape.rx = initialData.rx * scaleX;
                    shape.ry = initialData.ry * scaleY;
                    shape.draw();
                    break;

                case 'line':
                case 'arrow':
                    const relStartX = (initialData.startPoint.x - initialBounds.x) / initialBounds.width;
                    const relStartY = (initialData.startPoint.y - initialBounds.y) / initialBounds.height;
                    const relEndX = (initialData.endPoint.x - initialBounds.x) / initialBounds.width;
                    const relEndY = (initialData.endPoint.y - initialBounds.y) / initialBounds.height;

                    shape.startPoint.x = newBounds.x + relStartX * newBounds.width;
                    shape.startPoint.y = newBounds.y + relStartY * newBounds.height;
                    shape.endPoint.x = newBounds.x + relEndX * newBounds.width;
                    shape.endPoint.y = newBounds.y + relEndY * newBounds.height;

                    if (shape.shapeName === 'arrow' && shape.arrowCurved) {
                        if (typeof shape.initializeCurveControlPoints === 'function') {
                            shape.initializeCurveControlPoints();
                        }
                    }
                    shape.draw();
                    break;

                default:
                    const relXDefault = (initialData.x - initialBounds.x) / initialBounds.width;
                    const relYDefault = (initialData.y - initialBounds.y) / initialBounds.height;
                    const relWDefault = initialData.width / initialBounds.width;
                    const relHDefault = initialData.height / initialBounds.height;

                    shape.x = newBounds.x + relXDefault * newBounds.width;
                    shape.y = newBounds.y + relYDefault * newBounds.height;
                    if (shape.width !== undefined) shape.width = relWDefault * newBounds.width;
                    if (shape.height !== undefined) shape.height = relHDefault * newBounds.height;

                    if (typeof shape.draw === 'function') {
                        shape.draw();
                    }
            }

            if (typeof shape.updateAttachedArrows === 'function') {
                shape.updateAttachedArrows();
            }
        });

        this.updateControls();
    }

    startDrag(e) {
        this.isDragging = true;
        isDraggingMultiSelection = true;
        const { x, y } = getSVGCoordsFromMouse(e);
        this.dragStart = { x, y };

        this.initialPositions.clear();
        this.selectedShapes.forEach(shape => {
            let shapeData;
            shape.removeSelection();
            switch (shape.shapeName) {
                case 'rectangle':
                case 'icon':
                    shapeData = {
                        x: shape.x,
                        y: shape.y,
                        width: shape.width,
                        height: shape.height,
                        rotation: shape.rotation
                    };
                    break;
                case 'circle':
                    shapeData = {
                        x: shape.x,
                        y: shape.y,
                        rx: shape.rx,
                        ry: shape.ry,
                        rotation: shape.rotation
                    };
                    break;
                case 'line':
                case 'arrow':
                    shapeData = {
                        startPoint: { ...shape.startPoint },
                        endPoint: { ...shape.endPoint }
                    };
                    break;
                default:
                    shapeData = {
                        x: shape.x || 0,
                        y: shape.y || 0,
                        width: shape.width || 0,
                        height: shape.height || 0,
                        rotation: shape.rotation || 0
                    };
            }
            this.initialPositions.set(shape, shapeData);
        });

        if (typeof svg !== 'undefined') {
            svg.style.cursor = 'move';
        }
    }

    handleDrag(e) {
        if (!this.isDragging) return;
        isDraggingMultiSelection = true;
        const { x, y } = getSVGCoordsFromMouse(e);
        const dx = x - this.dragStart.x;
        const dy = y - this.dragStart.y;

        this.move(dx, dy);

        this.dragStart = { x, y };
    }

    endDrag() {
        if (!this.isDragging) return;
        isDraggingMultiSelection = false;
        this.isDragging = false;
        this.initialPositions.clear();
        if (typeof svg !== 'undefined') {
            svg.style.cursor = 'default';
        }
    }
}

const multiSelection = new MultiSelection();

function selectShapesInRect(selectionBounds) {
    multiSelection.selectShapesInRect(selectionBounds);
}

function clearAllSelections() {
    multiSelection.clearSelection();
}

function getMultiSelectionBounds() {
    return multiSelection.getBounds();
}

function createMultiSelectionControls() {
    multiSelection.updateControls();
}

function removeMultiSelectionControls() {
    multiSelection.removeControls();
}

function isPointInMultiSelection(x, y) {
    return multiSelection.isPointInBounds(x, y);
}

function moveSelectedShapes(dx, dy) {
    multiSelection.move(dx, dy);
}

function handleMultiSelectionMouseDown(e) {
    const { x, y } = getSVGCoordsFromMouse(e);

    // Only handle multi-selection operations if we have multiple shapes selected
    if (multiSelection.selectedShapes.size > 1) {
        const anchor = e.target.closest('.multi-selection-anchor');
        if (anchor) {
            const anchorIndex = parseInt(anchor.getAttribute('data-index'));
            multiSelection.startResize(e, anchorIndex);
            return true;
        }

        if (e.target.closest('.multi-selection-rotation-anchor')) {
            multiSelection.startRotation(e);
            return true;
        }

        if (multiSelection.isPointInBounds(x, y)) {
            multiSelection.startDrag(e);
            return true;
        }
    }

    // Check if clicking on individual shape anchors - let them handle it
    if (e.target.closest('.anchor') || e.target.closest('.rotate-anchor') || e.target.closest('.rotation-anchor')) {
        return false; // Let individual shape handlers manage their own anchors
    }

    // Check if clicking on any shape
    let clickedOnShape = false;
    let clickedShape = null;
    if (typeof shapes !== 'undefined') {
        for (let i = shapes.length - 1; i >= 0; i--) {
            const shape = shapes[i];
            if (shape.contains && shape.contains(x, y)) {
                clickedOnShape = true;
                clickedShape = shape;
                break;
            }
        }
    }

    // If clicking on a shape
    if (clickedOnShape && clickedShape) {
        // If it's the same shape that's already selected, let individual handlers manage it
        if (currentShape === clickedShape) {
            return false; // Let individual shape handlers manage their own interactions
        }
        
        // If it's a different shape, deselect current and select the new one
        if (currentShape && typeof currentShape.removeSelection === 'function') {
            currentShape.removeSelection();
        }
        
        // Clear multi-selection
        multiSelection.clearSelection();
        
        // Set new current shape
        currentShape = clickedShape;
        
        // Trigger the shape's own selection handling
        if (typeof clickedShape.addAnchors === 'function') {
            clickedShape.addAnchors();
            clickedShape.isSelected = true;
        } else if (typeof clickedShape.createSelection === 'function') {
            clickedShape.createSelection();
            clickedShape.isSelected = true;
        }
        
        // Update sidebar if function exists
        if (typeof clickedShape.updateSidebar === 'function') {
            clickedShape.updateSidebar();
        }
        
        return false; // Return false so individual handlers can also process the event
    }

    // If not clicking on a shape, deselect everything and start multi-selection
    if (!clickedOnShape) {
        // Deselect current individual shape
        if (typeof currentShape !== 'undefined' && currentShape && typeof currentShape.removeSelection === 'function') {
            currentShape.removeSelection();
            currentShape = null;
        }
        if (typeof disableAllSideBars === 'function') {
            disableAllSideBars();
        }
        
        multiSelectionStart = { x, y };
        isMultiSelecting = true;
        createMultiSelectionRect(x, y);
        clearAllSelections();
        return true;
    }

    return false;
}

function handleMultiSelectionMouseMove(e) {
    const { x, y } = getSVGCoordsFromMouse(e);

    if (multiSelection.isDragging) {
        multiSelection.handleDrag(e);
        return true;
    }

    if (multiSelection.isResizing) {
        multiSelection.handleResize(e);
        return true;
    }

    if (multiSelection.isRotating) {
        multiSelection.handleRotation(e);
        return true;
    }

    if (isMultiSelecting) {
        updateMultiSelectionRect(x, y);
        return true;
    }

    if (multiSelection.selectedShapes.size > 1 && multiSelection.isPointInBounds(x, y)) {
        if (typeof svg !== 'undefined') {
            svg.style.cursor = 'move';
        }
        return true;
    }

    return false;
}

function handleMultiSelectionMouseUp(e) {
    if (multiSelection.isDragging) {
        multiSelection.endDrag();
        return true;
    }

    if (multiSelection.isResizing) {
        multiSelection.handleResize(e);
        return true;
    }

    if (multiSelection.isRotating) {
        multiSelection.handleRotation(e);
        return true;
    }

    if (isMultiSelecting) {
        const { x, y } = getSVGCoordsFromMouse(e);

        const selectionBounds = {
            x: Math.min(multiSelectionStart.x, x),
            y: Math.min(multiSelectionStart.y, y),
            width: Math.abs(x - multiSelectionStart.x),
            height: Math.abs(y - multiSelectionStart.y)
        };

        if (selectionBounds.width > 5 && selectionBounds.height > 5) {
            // First, find all shapes in the selection bounds
            let shapesInBounds = [];
            if (typeof shapes !== 'undefined') {
                shapes.forEach(shape => {
                    if (isShapeInSelectionRect(shape, selectionBounds)) {
                        shapesInBounds.push(shape);
                    }
                });
            }

            // If only one shape is selected, let the shape handle its own selection
            if (shapesInBounds.length === 1) {
                const selectedShape = shapesInBounds[0];
                
                // Clear any existing multi-selection
                multiSelection.clearSelection();
                
                // Set the current shape and let it handle its own selection
                if (typeof currentShape !== 'undefined') {
                    currentShape = selectedShape;
                }
                
                // Trigger the shape's own selection handling
                if (typeof selectedShape.addAnchors === 'function') {
                    selectedShape.addAnchors();
                    selectedShape.isSelected = true;
                } else if (typeof selectedShape.createSelection === 'function') {
                    selectedShape.createSelection();
                    selectedShape.isSelected = true;
                }
                
                // Update sidebar if function exists
                if (typeof selectedShape.updateSidebar === 'function') {
                    selectedShape.updateSidebar();
                }
            } else if (shapesInBounds.length > 1) {
                // Multiple shapes selected - use multi-selection
                multiSelection.selectShapesInRect(selectionBounds);
            }
        }

        removeMultiSelectionRect();
        isMultiSelecting = false;
        return true;
    }

    return false;
}


export {
    handleMultiSelectionMouseDown,
    handleMultiSelectionMouseMove,
    handleMultiSelectionMouseUp,
    clearAllSelections,
    selectShapesInRect,
    createMultiSelectionControls,
    removeMultiSelectionControls,
    isPointInMultiSelection,
    moveSelectedShapes,
    multiSelection,
    isDraggingMultiSelection,
    isMultiSelecting

};