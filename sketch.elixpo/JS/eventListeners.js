import { handleMouseDownRect, handleMouseMoveRect, handleMouseUpRect } from './drawSquare.js';
import { handleMouseDownArrow, handleMouseMoveArrow, handleMouseUpArrow } from './drawArrow.js';
import { handleMouseDownCircle, handleMouseMoveCircle, handleMouseUpCircle } from './drawCircle.js';
import { handleMouseUpImage, handleMouseDownImage, handleMouseMoveImage } from './imageTool.js';
import { handleMouseDownLine, handleMouseMoveLine, handleMouseUpLine } from './lineTool.js';
import { handleFreehandMouseDown, handleFreehandMouseMove, handleFreehandMouseUp } from './canvasStroke.js';
import { handleTextMouseDown, handleTextMouseMove, handleTextMouseUp } from './writeText.js';
import { handleMouseDownFrame, handleMouseMoveFrame, handleMouseUpFrame } from './frameHolder.js';
import { handleMultiSelectionMouseDown, handleMultiSelectionMouseMove, handleMultiSelectionMouseUp, multiSelection, isMultiSelecting} from './selection.js';
import { handleMouseDownIcon, handleMouseMoveIcon, handleMouseUpIcon } from './icons.js';
import { handleCodeMouseDown, handleCodeMouseMove, handleCodeMouseUp } from './writeCode.js';

const handleMainMouseDown = (e) => {
    if (isSquareToolActive) {
        handleMouseDownRect(e);
    } else if (isArrowToolActive) {
        handleMouseDownArrow(e);
    } else if (isCircleToolActive) {
        handleMouseDownCircle(e);
    } else if (isImageToolActive) {
        handleMouseDownImage(e);
    } 
    else if (isLineToolActive) {
        handleMouseDownLine(e);
    }
    else if (isPaintToolActive) {
        handleFreehandMouseDown(e);
    }
    else if (isTextToolActive) {
        handleTextMouseDown(e);
    }
    else if (isFrameToolActive) {
        handleMouseDownFrame(e);
    }
    else if (isIconToolActive) {
        handleMouseDownIcon(e);
    }
    else if (isCodeToolActive) {
        handleCodeMouseDown(e);
    }
    else if (isSelectionToolActive) {
        // Try multi-selection first when selection tool is active
        if (handleMultiSelectionMouseDown(e)) {
            return; // Multi-selection handled the event
        }
        
        // If multi-selection didn't handle it, proceed with shape-specific selection
        if (currentShape?.shapeName === 'rectangle') {
            handleMouseDownRect(e);
        } else if (currentShape?.shapeName === 'arrow') {
            handleMouseDownArrow(e);
        } else if (currentShape?.shapeName === 'circle') {
            handleMouseDownCircle(e);
        } else if (currentShape?.shapeName === 'image') {
            handleMouseDownImage(e);
        }
        else if (currentShape?.shapeName === 'line') {
            handleMouseDownLine(e);
        }
        else if (currentShape?.shapeName === 'freehandStroke') {
            handleFreehandMouseDown(e);
        }
        else if (currentShape?.shapeName === 'text') {
            handleTextMouseDown(e);
        }
        else if (currentShape?.shapeName === 'frame') {
            handleMouseDownFrame(e);
        }
        else if (currentShape?.shapeName === 'icon') {
            handleMouseDownIcon(e);
        }
        else if( currentShape?.shapeName === 'code') {
            handleCodeMouseDown(e);
        }
        else {
            const originalCurrentShape = currentShape;
            handleMouseDownRect(e);
            if (currentShape && currentShape !== originalCurrentShape) return;
            handleMouseDownCircle(e);
            if (currentShape && currentShape !== originalCurrentShape) return;
            handleMouseDownArrow(e);
            if (currentShape && currentShape !== originalCurrentShape) return;
            handleMouseDownImage(e);
            if (currentShape && currentShape !== originalCurrentShape) return;
            handleMouseDownLine(e);
            if (currentShape && currentShape !== originalCurrentShape) return;
            handleFreehandMouseDown(e);
            if (currentShape && currentShape !== originalCurrentShape) return;
            handleTextMouseDown(e);
            if (currentShape && currentShape !== originalCurrentShape) return;
            handleMouseDownFrame(e);
            if (currentShape && currentShape !== originalCurrentShape) return;
            handleMouseDownIcon(e);
            if (currentShape && currentShape !== originalCurrentShape) return;
            handleCodeMouseDown(e);
            if (currentShape && currentShape !== originalCurrentShape) return;
            if (currentShape === originalCurrentShape) {
                if (currentShape) {
                    currentShape.removeSelection();
                    currentShape = null;
                }
            }
        }
    }
};

const handleMainMouseMove = (e) => {
    if (isSquareToolActive) {
        handleMouseMoveRect(e);
    } else if (isArrowToolActive) {
        handleMouseMoveArrow(e);
    } else if (isCircleToolActive) {
        handleMouseMoveCircle(e);
    } else if (isImageToolActive) {
        handleMouseMoveImage(e);
    } 
    else if (isLineToolActive) {
        handleMouseMoveLine(e);
    }
    else if (isPaintToolActive) {
        handleFreehandMouseMove(e);
    }
    else if (isTextToolActive) {
        handleTextMouseMove(e);
    }
    else if (isFrameToolActive) {
        handleMouseMoveFrame(e);
    }
    else if (isIconToolActive) {
        handleMouseMoveIcon(e);
    }
    else if (isCodeToolActive) {
        handleCodeMouseMove(e);
    }
    else if (isSelectionToolActive) {
        // Handle multi-selection operations first - these take priority
        if (isMultiSelecting || multiSelection.isDragging || multiSelection.isResizing || multiSelection.isRotating) {
            if (handleMultiSelectionMouseMove(e)) {
                return; // Multi-selection handled the event
            }
        }
        
        // Shape-specific mouse move handling
        if (currentShape?.shapeName === 'rectangle') {
            handleMouseMoveRect(e);
        } else if (currentShape?.shapeName === 'arrow') {
            handleMouseMoveArrow(e);
        } else if (currentShape?.shapeName === 'circle') {
            handleMouseMoveCircle(e);
        } else if (currentShape?.shapeName === 'image') {
            handleMouseMoveImage(e);
        } 
        else if (currentShape?.shapeName === 'line') {
            handleMouseMoveLine(e);
        }
        else if (currentShape?.shapeName === 'freehandStroke') {
            handleFreehandMouseMove(e);
        }
        else if (currentShape?.shapeName === 'text') {
            handleTextMouseMove(e);
        }
        else if (currentShape?.shapeName === 'frame') {
            handleMouseMoveFrame(e);
        }
        else if (currentShape?.shapeName === 'icon') {
            handleMouseMoveIcon(e);
        }
        else if (currentShape?.shapeName === 'code') {
            handleCodeMouseMove(e);
        }

        else {
            // Try multi-selection mouse move for cursor updates
            if (handleMultiSelectionMouseMove(e)) {
                return;
            }
            
            handleMouseMoveRect(e);
            handleMouseMoveArrow(e);
            handleMouseMoveCircle(e);
            handleMouseMoveImage(e);
            handleMouseMoveLine(e);
            handleFreehandMouseMove(e);
            handleTextMouseMove(e);
            handleMouseMoveFrame(e);
            handleMouseMoveIcon(e);
            handleCodeMouseMove(e);
        }
    }
};

const handleMainMouseUp = (e) => {
    if (isSquareToolActive) {
        handleMouseUpRect(e);
    } else if (isArrowToolActive) {
        handleMouseUpArrow(e);
    } else if (isCircleToolActive) {
        handleMouseUpCircle(e);
    } else if (isImageToolActive) {
        handleMouseUpImage(e);
    } 
    else if (isLineToolActive) {    
        handleMouseUpLine(e);
    }
    else if (isPaintToolActive) {
        handleFreehandMouseUp(e);
    }
    else if (isTextToolActive) {
        handleTextMouseUp(e);
    }
    else if (isFrameToolActive) {
        handleMouseUpFrame(e);
    }
    else if (isIconToolActive) {
        handleMouseUpIcon(e);
    }
    else if (isCodeToolActive) {
        handleCodeMouseUp(e);
    }

    else if (isSelectionToolActive) {
        // Handle multi-selection operations first - these take priority
        if (isMultiSelecting || multiSelection.isDragging || multiSelection.isResizing || multiSelection.isRotating) {
            if (handleMultiSelectionMouseUp(e)) {
                return; // Multi-selection handled the event
            }
        }
        
        // Shape-specific mouse up handling
        if (currentShape?.shapeName === 'rectangle') {
            handleMouseUpRect(e);
        } else if (currentShape?.shapeName === 'arrow') {
            handleMouseUpArrow(e);
        } else if (currentShape?.shapeName === 'circle') {
            handleMouseUpCircle(e);
        } else if (currentShape?.shapeName === 'image') {
            handleMouseUpImage(e);
        } 
        else if (currentShape?.shapeName === 'line') {
            handleMouseUpLine(e);
        }
        else if (currentShape?.shapeName === 'freehandStroke') {
            handleFreehandMouseUp(e);
        }
        else if (currentShape?.shapeName === 'text') {
            handleTextMouseUp(e);
        }
        else if (currentShape?.shapeName === 'frame') {
            handleMouseUpFrame(e);
        }
        else if (currentShape?.shapeName === 'icon') {
            handleMouseUpIcon(e);
        }
        else if (currentShape?.shapeName === 'code') {
            handleCodeMouseUp(e);
        }

        else {
            handleMultiSelectionMouseUp(e);
            handleMouseUpRect(e);
            handleMouseUpArrow(e);
            handleMouseUpCircle(e);
            handleMouseUpImage(e);
            handleMouseUpLine(e);
            handleFreehandMouseUp(e);
            handleTextMouseUp(e);
            handleMouseUpFrame(e);
            handleMouseUpIcon(e);
            handleCodeMouseUp(e);
        }
    }
};

svg.addEventListener('mousedown', handleMainMouseDown);
svg.addEventListener('mousemove', handleMainMouseMove);
svg.addEventListener('mouseup', handleMainMouseUp);