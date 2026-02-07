// --- Function to highlight elements under the eraser ---
function handleElementHighlight(clientX, clientY) {
  if (!isErasing) return;

  const element = document.elementFromPoint(clientX, clientY);
  if (!element || element === svg) return;

  let elementToHighlight = element;

  while (elementToHighlight && elementToHighlight !== svg) {
    let groupType = elementToHighlight.closest("g[data-type='text-group']");
    let circleGroupType = elementToHighlight.closest("g[data-type='circle-group']");  
    let squareGroupType = elementToHighlight.closest("g[data-type='square-group']");
    let lineGroupType = elementToHighlight.closest("g[data-type='line-group']");
    let arrowGroupType = elementToHighlight.closest("g[data-type='arrow-group']");

    if (squareGroupType) {
        elementToHighlight = squareGroupType;
    } else if (circleGroupType) {
        elementToHighlight = circleGroupType;
    } 
    else if(lineGroupType) {
        elementToHighlight = lineGroupType
    }
    else if (arrowGroupType) {
        elementToHighlight = arrowGroupType;
    }
    else if (groupType) {
      elementToHighlight = groupType; //Target the text-group
    }
    else if (!["g", "path", "line", "image", "circle", "polygon"].includes(elementToHighlight.tagName)) {
        elementToHighlight = null; // Stop if it's not a targetable element
        break;

    }
    if (elementToHighlight) {
         if (!targetedElements.has(elementToHighlight)) {
            targetedElements.add(elementToHighlight); // Add the element to the Set
            elementToHighlight.setAttribute("data-original-opacity", elementToHighlight.style.opacity || "1");
            elementToHighlight.dataset.storedOpacity = elementToHighlight.getAttribute("data-original-opacity");
            elementToHighlight.style.opacity = "0.5";
            console.log("Targeted Element:", elementToHighlight);
        }
        return;
    }

    elementToHighlight = elementToHighlight.parentNode; // Move up the DOM
  }

  removeHighlight();
}

function removeHighlight() {
  targetedElements.forEach(element => {
      element.style.opacity = element.getAttribute("data-original-opacity") || "1";
  });
  targetedElements.clear();
}

function removeTargetedElements() {
    const elementsToRemove = Array.from(targetedElements); // Convert Set to Array

    if (elementsToRemove.length > 0) {
        const deletionActions = []; // Array to hold individual deletion actions

        elementsToRemove.forEach(element => {

            if (element.parentNode === svg) {
                const originalOpacity = element.dataset.storedOpacity || "1";
                deletionActions.push({
                    type: ACTION_DELETE,
                    element: element,
                    parent: element.parentNode,
                    nextSibling: element.nextSibling,
                    originalOpacity: originalOpacity,
                });
                element.parentNode.removeChild(element);
            }
        });

        if (deletionActions.length > 0) {
            history.push(...deletionActions);
        }

        redoStack = [];
        deselectAll(); // Deselect all elements
        updateUndoRedoButtons();
        targetedElements.clear(); // Clear the Set
    }
}




// --- Event Listeners ---
svg.addEventListener("pointerdown", (e) => {
  if (isEraserToolActive)
  {
    isErasing = true;
    createEraserTrail(e.clientX, e.clientY);
    handleElementHighlight(e.clientX, e.clientY);
  }
  
});

svg.addEventListener("pointermove", (e) => {
  if (isEraserToolActive) {
      svg.style.cursor = `url(${eraserCursorSVG}) 10 10, auto`;
  }
  if (!isErasing) return;
  updateEraserTrail(e.clientX, e.clientY);
  handleElementHighlight(e.clientX, e.clientY);
});

svg.addEventListener("pointerup", () => {
  isErasing = false;
  removeTargetedElements();
  fadeOutEraserTrail();
  svg.style.cursor = "default";
});

svg.addEventListener("pointerleave", (e) => {
  isErasing = false;
  removeTargetedElements();
  fadeOutEraserTrail();
  svg.style.cursor = "default";
});