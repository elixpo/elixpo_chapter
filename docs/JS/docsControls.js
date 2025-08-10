
document.addEventListener('DOMContentLoaded', function() {
    const styleButtons = document.querySelectorAll('.styles');
    const typographyBtn = document.getElementById("typography");
    const textControls = document.getElementById("textControls");
    
    if (typographyBtn && textControls) {
        typographyBtn.addEventListener("click", function() {
            textControls.classList.toggle("hidden");
        });
    }

    // Block-level controls event listeners
    const blockControls = [
        { id: "HEADING1", type: "H1" },
        { id: "HEADING2", type: "H2" },
        { id: "HEADING3", type: "H3" },
        { id: "HEADING4", type: "H4" },
        { id: "HEADING5", type: "H5" },
        { id: "CODE_BLOCK", type: "PRE" },
        { id: "UNORDERED_LIST", type: "UL" },
        { id: "ORDERED_LIST", type: "OL" },
        { id: "BLOCKQUOTE", type: "BLOCKQUOTE" },
        { id: "TABLE", type: "TABLE" }
    ];

    blockControls.forEach(control => {
        const element = document.getElementById(control.id);
        if (element) {
            element.addEventListener("click", function() {
                // console.log(`Clicked ${control.id}, applying ${control.type}`); // Debug log
                applyBlockStyle(control.type);
            });
        } else {
            console.warn(`Element with ID ${control.id} not found`);
        }
    });

    // Inline style controls event listeners
    const inlineControls = [
        { id: "BOLD_CONTROL", type: "bold" },
        { id: "ITALIC_CONTROL", type: "italic" },
        { id: "UNDERLINE_CONTROL", type: "underline" },
        { id: "STRIKETHROUGH_CONTROL", type: "strike" },
        { id: "MARKED_CONTROL", type: "mark" },
        { id: "INLINE_CODE", type: "code-inline" }
    ];

    inlineControls.forEach(control => {
        const element = document.getElementById(control.id);
        if (element) {
            element.addEventListener("click", function() {
                // console.log(`Clicked ${control.id}, applying ${control.type}`); // Debug log
                applyInlineStyle(control.type);
            });
        } else {
            console.warn(`Element with ID ${control.id} not found`);
        }
    });

    styleButtons.forEach(button => {
        button.addEventListener('mousedown', function(e) {
        // Prevent the button click from clearing the selection
        e.preventDefault();
        
        // Preserve the current selection
        if (currentSelection && currentSelection.isSelectionActive) {
            preservedSelection = {
            range: currentSelection.range.cloneRange(),
            text: currentSelection.text,
            isValid: currentSelection.isValid,
            isSelectionActive: currentSelection.isSelectionActive
            };
        }
        });
        
        button.addEventListener('click', function(e) {
        e.preventDefault();
        const selectionToUse = preservedSelection || currentSelection;
        if (selectionToUse && selectionToUse.isSelectionActive) {
            applyInlineStyle(button.dataset.style, selectionToUse);
            setTimeout(() => {
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(selectionToUse.range);
            preservedSelection = null;
            }, 0);
        }
        });
    });
});


function applyBlockStyle(elementType) {
    const { sel, range, currentLine } = currentLineFormat;
    
    if (!currentLine) {
        console.warn("No current line element found");
        return;
    }

    // Handle table cells specially
    if (currentLine.tagName === 'TD') {
        handleTableCellBlockStyle(currentLine, elementType);
        return;
    }
    
    // Find actual block-level element
    let targetElement = currentLine;
    if (currentLine.tagName === 'SPAN') {
        targetElement = currentLine.closest('h1,h2,h3,h4,h5,h6,p,pre,blockquote,li') || currentLine;
    } else if (currentLine.tagName === 'CODE') {
        targetElement = currentLine.closest('pre') || currentLine;
    }
    
    // Update reference
    currentLineFormat.currentLine = targetElement;
    
    // Save cursor position
    const cursorPosition = saveCursorPosition(range, targetElement);
    
    // Check if toggling to paragraph
    if (shouldToggleToP(elementType, targetElement)) {
        convertToP(targetElement);
    } else {
        applyNewBlockStyle(elementType, targetElement);
    }
    
    // Restore cursor position
    if (elementType !== "PRE") {
        setTimeout(() => restoreCursorPosition(cursorPosition, currentLineFormat.currentLine), 0);
    }
}

function shouldToggleToP(elementType, element) {
    const toggleMap = {
        "H1": "H1", "H2": "H2", "H3": "H3", "H4": "H4", "H5": "H5",
        "PRE": "PRE", "BLOCKQUOTE": "BLOCKQUOTE"
    };
    
    if (toggleMap[elementType] === element.tagName) return true;
    
    if ((elementType === "UL" && element.tagName === 'LI' && element.parentElement.tagName === 'UL') ||
        (elementType === "OL" && element.tagName === 'LI' && element.parentElement.tagName === 'OL')) {
        return true;
    }
    
    return false;
}

function convertToP(element) {
    const hexID = generateHexID();
    const newElement = document.createElement('p');
    newElement.id = `p_${hexID}`;
    
    if (element.tagName === 'LI') {
        const listParent = element.parentElement;
        newElement.innerHTML = element.innerHTML;
        
        if (listParent.children.length === 1) {
            listParent.parentNode.replaceChild(newElement, listParent);
        } else {
            listParent.parentNode.insertBefore(newElement, listParent);
            element.remove();
            if (listParent.children.length === 0) listParent.remove();
        }
    } else {
        newElement.innerHTML = element.innerHTML || '\u00A0';
        element.parentNode.replaceChild(newElement, element);
    }
    
    currentLineFormat.currentLine = newElement;
    updateCurrentBlock("PARAGRAPH");
}

function saveCursorPosition(range, element) {
    if (!range) return 0;
    
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
    let position = 0;
    let node;
    
    while ((node = walker.nextNode())) {
        if (node === range.startContainer) {
            return position + range.startOffset;
        }
        position += node.textContent.length;
    }
    
    return position;
}

function restoreCursorPosition(position, element) {
    try {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
        let currentPos = 0;
        let node;
        
        while ((node = walker.nextNode())) {
            const nodeLength = node.textContent.length;
            if (currentPos + nodeLength >= position) {
                const offset = position - currentPos;
                const newRange = document.createRange();
                newRange.setStart(node, Math.min(offset, nodeLength));
                newRange.collapse(true);
                
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(newRange);
                
                currentLineFormat.range = newRange;
                return;
            }
            currentPos += nodeLength;
        }
        
        placeCaretAtEnd(element);
    } catch (err) {
        console.warn("Error restoring cursor position:", err);
        placeCaretAtEnd(element);
    }
}
function applyInlineStyle(styleType, selection) {
    sel = currentLineFormat.sel;
    range = currentLineFormat.range;
    currentLine = currentLineFormat.currentLine;
    
    if (!sel.rangeCount) {
        console.warn("No selection range found");
        return;
    }
    
    if (!currentLine) {
        console.warn("No current line element found");
        return;
    }

    // Don't apply inline styles to code blocks
    if (currentLine.tagName === 'PRE') {
        console.warn("Cannot apply inline styles to code blocks");
        return;
    }

    if(selection && selection.isSelectionActive == true) {
        applyStyleToSelection(selection, styleType);
    } else {
        applyStyleAtCursor(styleType, range, currentLine);
    }
    
    // Update buttons in real-time after applying style
    setTimeout(() => {
        handleSelectionChange();
    }, 10);
}


function applyStyleAtCursor(styleType, range, currentLine) {
    const currentNode = range.startContainer;
    
    // If cursor is in a styled span, we need to split it and only affect future typing
    if (currentNode.nodeType === Node.TEXT_NODE && currentNode.parentNode.tagName === 'SPAN') {
        const parentSpan = currentNode.parentNode;
        const currentClasses = parentSpan.className.split(' ').filter(cls => 
            ['bold', 'italic', 'underline', 'strike', 'mark', 'code-inline', 'default-text'].includes(cls)
        );
        
        const textContent = currentNode.textContent;
        const cursorOffset = range.startOffset;
        
        // Split the text at cursor position
        const beforeText = textContent.substring(0, cursorOffset);
        const afterText = textContent.substring(cursorOffset);
        
        // Special case: if this is an empty span with just nbsp, replace it entirely
        if (textContent === '\u00A0' && beforeText === '' && afterText === '\u00A0') {
            // Determine new style classes
            let newClasses = [...currentClasses];
            if (currentClasses.includes(styleType)) {
                // Toggle off the style
                newClasses = newClasses.filter(cls => cls !== styleType);
                if (newClasses.length === 0) {
                    newClasses = ['default-text'];
                }
            } else if (currentClasses.includes('default-text')) {
                // Replace default-text with new style
                newClasses = [styleType];
            } else {
                // Add new style to existing ones
                newClasses.push(styleType);
                newClasses = newClasses.filter(cls => cls !== 'default-text');
            }
            
            // Update the current span's class
            parentSpan.className = newClasses.join(' ');
            
            // Create a new default span after this one for future typing
            const nextSpan = document.createElement('span');
            nextSpan.className = 'default-text';
            nextSpan.id = `span_${generateHexID()}`;
            nextSpan.textContent = '\u00A0';
            
            // Insert after the current span
            parentSpan.parentNode.insertBefore(nextSpan, parentSpan.nextSibling);
            
            updateCurrentInlineBlock(newClasses.includes('default-text') ? 'default-text' : styleType);
            updateInlineStyleButtons(parentSpan, parentSpan.className);
            return;
        }
        
        // If cursor is at the beginning of the span
        if (cursorOffset === 0) {
            // Create new styled span for future typing
            const newSpan = document.createElement('span');
            
            // Determine new style classes
            let newClasses = [...currentClasses];
            if (currentClasses.includes(styleType)) {
                // Toggle off the style
                newClasses = newClasses.filter(cls => cls !== styleType);
                if (newClasses.length === 0) {
                    newClasses = ['default-text'];
                }
            } else if (currentClasses.includes('default-text')) {
                // Replace default-text with new style
                newClasses = [styleType];
            } else {
                // Add new style to existing ones
                newClasses.push(styleType);
                newClasses = newClasses.filter(cls => cls !== 'default-text');
            }
            
            newSpan.className = newClasses.join(' ');
            newSpan.id = `span_${generateHexID()}`;
            newSpan.textContent = '\u00A0'; // Placeholder for future typing
            
            // Insert before the existing span
            parentSpan.parentNode.insertBefore(newSpan, parentSpan);
            
            // Place cursor at end of new span
            placeCaretAtEnd(newSpan);
            updateCurrentInlineBlock(newClasses.includes('default-text') ? 'default-text' : styleType);
            updateInlineStyleButtons(newSpan, newSpan.className);
            return;
        }
        
        // If cursor is at the end of the span
        if (cursorOffset === textContent.length) {
            // Create new styled span for future typing
            const newSpan = document.createElement('span');
            
            // Determine new style classes
            let newClasses = [...currentClasses];
            if (currentClasses.includes(styleType)) {
                // Toggle off the style
                newClasses = newClasses.filter(cls => cls !== styleType);
                if (newClasses.length === 0) {
                    newClasses = ['default-text'];
                }
            } else if (currentClasses.includes('default-text')) {
                // Replace default-text with new style
                newClasses = [styleType];
            } else {
                // Add new style to existing ones
                newClasses.push(styleType);
                newClasses = newClasses.filter(cls => cls !== 'default-text');
            }
            
            newSpan.className = newClasses.join(' ');
            newSpan.id = `span_${generateHexID()}`;
            newSpan.textContent = '\u00A0'; // Placeholder for future typing
            
            // Insert after the existing span
            parentSpan.parentNode.insertBefore(newSpan, parentSpan.nextSibling);
            
            // Place cursor at end of new span
            placeCaretAtEnd(newSpan);
            updateCurrentInlineBlock(newClasses.includes('default-text') ? 'default-text' : styleType);
            updateInlineStyleButtons(newSpan, newSpan.className);
            return;
        }
        
        // If cursor is in the middle of the span, split it
        if (beforeText && afterText) {
            // Create before span (keep original styling)
            const beforeSpan = document.createElement('span');
            beforeSpan.className = parentSpan.className;
            beforeSpan.id = `span_${generateHexID()}`;
            beforeSpan.textContent = beforeText;
            
            // Create new styled span for future typing
            const newSpan = document.createElement('span');
            
            // Determine new style classes
            let newClasses = [...currentClasses];
            if (currentClasses.includes(styleType)) {
                // Toggle off the style
                newClasses = newClasses.filter(cls => cls !== styleType);
                if (newClasses.length === 0) {
                    newClasses = ['default-text'];
                }
            } else if (currentClasses.includes('default-text')) {
                // Replace default-text with new style
                newClasses = [styleType];
            } else {
                // Add new style to existing ones
                newClasses.push(styleType);
                newClasses = newClasses.filter(cls => cls !== 'default-text');
            }
            
            newSpan.className = newClasses.join(' ');
            newSpan.id = `span_${generateHexID()}`;
            newSpan.textContent = '\u00A0'; // Placeholder for future typing
            
            // Create after span (keep original styling)
            const afterSpan = document.createElement('span');
            afterSpan.className = parentSpan.className;
            afterSpan.id = `span_${generateHexID()}`;
            afterSpan.textContent = afterText;
            
            // Insert all new spans
            parentSpan.parentNode.insertBefore(beforeSpan, parentSpan);
            parentSpan.parentNode.insertBefore(newSpan, parentSpan);
            parentSpan.parentNode.insertBefore(afterSpan, parentSpan);
            
            // Remove original span
            parentSpan.remove();
            
            // Place cursor at end of new styled span
            placeCaretAtEnd(newSpan);
            updateCurrentInlineBlock(newClasses.includes('default-text') ? 'default-text' : styleType);
            updateInlineStyleButtons(newSpan, newSpan.className);
            return;
        }
    }
    
    // If cursor is not in a span, create new styled span for future typing
    const newSpan = document.createElement('span');
    newSpan.className = styleType;
    newSpan.id = `span_${generateHexID()}`;
    newSpan.textContent = '\u00A0'; // Only add non-breaking space as placeholder
    
    range.insertNode(newSpan);
    placeCaretAtEnd(newSpan);
    updateCurrentInlineBlock(styleType);
    updateInlineStyleButtons(newSpan, newSpan.className);
}

function applyStyleToSelection(selection, styleType) {
    const selectedText = selection.range.toString();
    if (!selectedText) {
        // If no text is selected, treat as cursor positioning
        applyStyleAtCursor(styleType, selection.range, currentLineFormat.currentLine);
        return;
    }
    
    const range = selection.range;
    const startContainer = range.startContainer;
    const endContainer = range.endContainer;
    
    // Case 1: Selection is entirely within a single text node
    if (startContainer === endContainer && startContainer.nodeType === Node.TEXT_NODE) {
        const parentElement = startContainer.parentNode;
        
        // Check if parent is a span with styling
        if (parentElement.tagName === 'SPAN') {
            const currentClasses = parentElement.className.split(' ').filter(cls => 
                ['bold', 'italic', 'underline', 'strike', 'mark', 'code-inline', 'default-text'].includes(cls)
            );
            
            // If it's default-text, apply the new style
            if (currentClasses.includes('default-text') || currentClasses.length === 0) {
                const beforeText = startContainer.textContent.substring(0, range.startOffset);
                const selectedText = startContainer.textContent.substring(range.startOffset, range.endOffset);
                const afterText = startContainer.textContent.substring(range.endOffset);
                
                // Create before span if there's text before (only if there's actual content)
                if (beforeText) {
                    const beforeSpan = document.createElement('span');
                    beforeSpan.className = 'default-text';
                    beforeSpan.id = `span_${generateHexID()}`;
                    beforeSpan.textContent = beforeText;
                    parentElement.parentNode.insertBefore(beforeSpan, parentElement);
                }
                
                // Create styled span for selected text
                const styledSpan = document.createElement('span');
                styledSpan.className = styleType;
                styledSpan.id = `span_${generateHexID()}`;
                styledSpan.textContent = selectedText;
                parentElement.parentNode.insertBefore(styledSpan, parentElement);
                
                // Create after span if there's text after (only if there's actual content)
                if (afterText) {
                    const afterSpan = document.createElement('span');
                    afterSpan.className = 'default-text';
                    afterSpan.id = `span_${generateHexID()}`;
                    afterSpan.textContent = afterText;
                    parentElement.parentNode.insertBefore(afterSpan, parentElement);
                }
                
                // Remove original span
                parentElement.remove();
                
                // Select the new styled span
                const newRange = document.createRange();
                newRange.selectNodeContents(styledSpan);
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(newRange);
                
                updateCurrentInlineBlock(styleType);
                return;
            }
            
            // Handle multiple classes in the span
            if (currentClasses.length >= 1 && !currentClasses.includes('default-text')) {
                // If same style exists, remove it (toggle off)
                if (currentClasses.includes(styleType)) {
                    const beforeText = startContainer.textContent.substring(0, range.startOffset);
                    const selectedText = startContainer.textContent.substring(range.startOffset, range.endOffset);
                    const afterText = startContainer.textContent.substring(range.endOffset);
                    
                    const newClasses = currentClasses.filter(cls => cls !== styleType);
                    const finalClass = newClasses.length === 0 ? 'default-text' : newClasses.join(' ');
                    
                    // Create before span if there's text before
                    if (beforeText) {
                        const beforeSpan = document.createElement('span');
                        beforeSpan.className = currentClasses.join(' ');
                        beforeSpan.id = `span_${generateHexID()}`;
                        beforeSpan.textContent = beforeText;
                        parentElement.parentNode.insertBefore(beforeSpan, parentElement);
                    }
                    
                    // Create span for selected text with style removed
                    const modifiedSpan = document.createElement('span');
                    modifiedSpan.className = finalClass;
                    modifiedSpan.id = `span_${generateHexID()}`;
                    modifiedSpan.textContent = selectedText;
                    parentElement.parentNode.insertBefore(modifiedSpan, parentElement);
                    
                    // Create after span if there's text after
                    if (afterText) {
                        const afterSpan = document.createElement('span');
                        afterSpan.className = currentClasses.join(' ');
                        afterSpan.id = `span_${generateHexID()}`;
                        afterSpan.textContent = afterText;
                        parentElement.parentNode.insertBefore(afterSpan, parentElement);
                    }
                    
                    // Remove original span
                    parentElement.remove();
                    
                    // Select the new span
                    const newRange = document.createRange();
                    newRange.selectNodeContents(modifiedSpan);
                    const sel = window.getSelection();
                    sel.removeAllRanges();
                    sel.addRange(newRange);
                    
                    updateCurrentInlineBlock(finalClass === 'default-text' ? 'default-text' : styleType);
                    return;
                } else {
                    // Different style, add to existing classes
                    const beforeText = startContainer.textContent.substring(0, range.startOffset);
                    const selectedText = startContainer.textContent.substring(range.startOffset, range.endOffset);
                    const afterText = startContainer.textContent.substring(range.endOffset);
                    
                    // Create before span if there's text before
                    if (beforeText) {
                        const beforeSpan = document.createElement('span');
                        beforeSpan.className = currentClasses.join(' ');
                        beforeSpan.id = `span_${generateHexID()}`;
                        beforeSpan.textContent = beforeText;
                        parentElement.parentNode.insertBefore(beforeSpan, parentElement);
                    }
                    
                    // Create new styled span with combined styles
                    const newStyledSpan = document.createElement('span');
                    const newClasses = [...currentClasses, styleType].filter((cls, index, arr) => 
                        arr.indexOf(cls) === index && cls !== 'default-text'
                    );
                    newStyledSpan.className = newClasses.join(' ');
                    newStyledSpan.id = `span_${generateHexID()}`;
                    newStyledSpan.textContent = selectedText;
                    parentElement.parentNode.insertBefore(newStyledSpan, parentElement);
                    
                    // Create after span if there's text after
                    if (afterText) {
                        const afterSpan = document.createElement('span');
                        afterSpan.className = currentClasses.join(' ');
                        afterSpan.id = `span_${generateHexID()}`;
                        afterSpan.textContent = afterText;
                        parentElement.parentNode.insertBefore(afterSpan, parentElement);
                    }
                    
                    // Remove original span
                    parentElement.remove();
                    
                    // Select the new styled span
                    const newRange = document.createRange();
                    newRange.selectNodeContents(newStyledSpan);
                    const sel = window.getSelection();
                    sel.removeAllRanges();
                    sel.addRange(newRange);

                    updateCurrentInlineBlock(styleType);
                    return;
                }
            }
        }
    }
    
    // Case 3: Selection spans multiple elements/spans
    const fragment = range.extractContents();
    const tempDiv = document.createElement('div');
    tempDiv.appendChild(fragment.cloneNode(true));
    
    // Collect all text nodes and their styling
    const walker = document.createTreeWalker(
        tempDiv,
        NodeFilter.SHOW_TEXT,
        null,
        false
    );
    
    const textNodes = [];
    let node;
    while ((node = walker.nextNode())) {
        const parentSpan = node.parentNode.tagName === 'SPAN' ? node.parentNode : null;
        textNodes.push({
            text: node.textContent,
            parentClasses: parentSpan ? parentSpan.className.split(' ').filter(cls => 
                ['bold', 'italic', 'underline', 'strike', 'mark', 'code-inline', 'default-text'].includes(cls)
            ) : ['default-text']
        });
    }
    
    // Create new spans for each text segment
    const newFragment = document.createDocumentFragment();
    
    textNodes.forEach(nodeInfo => {
        if (nodeInfo.text) { // Remove .trim() to preserve spaces
            const newSpan = document.createElement('span');
            
            // Determine new classes
            let newClasses = [...nodeInfo.parentClasses];
            
            // If default-text or no styling, apply new style
            if (newClasses.includes('default-text') || newClasses.length === 0) {
                newClasses = [styleType];
            } else {
                // If same style exists, remove it (toggle off)
                if (newClasses.includes(styleType)) {
                    newClasses = newClasses.filter(cls => cls !== styleType);
                    if (newClasses.length === 0) {
                        newClasses = ['default-text'];
                    }
                } else {
                    // Add new style to existing ones
                    newClasses.push(styleType);
                    newClasses = newClasses.filter(cls => cls !== 'default-text');
                }
            }
            
            newSpan.className = newClasses.join(' ');
            newSpan.id = `span_${generateHexID()}`;
            newSpan.textContent = nodeInfo.text;
            newFragment.appendChild(newSpan);
        }
    });
    
    // Insert the new fragment
    range.insertNode(newFragment);
    
    // Set cursor at the end of the new content
    const newRange = document.createRange();
    newRange.selectNodeContents(newFragment);
    newRange.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(newRange);

    updateCurrentInlineBlock(styleType);
    
    setTimeout(() => {
        if (typeof processEntireLineContent === 'function') {
            processEntireLineContent(currentLineFormat.currentLine);
        }
    }, 0);
}

function updateCurrentBlock(type) {
    document.querySelectorAll(".blockedStyleElements").forEach(el => {
        el.classList.remove('selected');
    });
    currentBlock = type;

    document.getElementById("languageSelector")?.classList.add('hidden');
    updateBlockStyleAvailability(type);
    
    switch (currentBlock) {
        case "HEADING1":
            document.getElementById('HEADING1')?.classList.add('selected');
            break;
        case "HEADING2":
            document.getElementById('HEADING2')?.classList.add('selected');
            break;
        case "HEADING3":
            document.getElementById('HEADING3')?.classList.add('selected');
            break;
        case "HEADING4":
            document.getElementById('HEADING4')?.classList.add('selected');
            break;
        case "HEADING5":
            document.getElementById('HEADING5')?.classList.add('selected');
            break;
        case "CODE_BLOCK":
            document.getElementById('CODE_BLOCK')?.classList.add('selected');
            document.getElementById("languageSelector")?.classList.remove('hidden');
            setTimeout(() => {
                if (typeof updateLanguageSelectorForCodeBlock === 'function') {
                    updateLanguageSelectorForCodeBlock();
                }
            }, 0);
            break;
        case "UNORDERED_LIST":
            document.getElementById('UNORDERED_LIST')?.classList.add('selected');
            break;
        case "ORDERED_LIST":
            document.getElementById('ORDERED_LIST')?.classList.add('selected');
            break;
        case "BLOCKQUOTE":
            document.getElementById('BLOCKQUOTE')?.classList.add('selected');
            break;
        case "PARAGRAPH":
            updateBlockStyleAvailability("PARAGRAPH");
            document.querySelectorAll(".blockedStyleElements").forEach(el => {
                el.classList.remove('selected');
            });
            currentBlock = null;
            break;
    }
}

function updateCurrentInlineBlock(type) {
    document.querySelectorAll(".styles").forEach(el => {
        el.classList.remove('selected');
    });
    currentInlineBlock = type;
    switch (type) {
        case "bold":
            currentInlineBlock = "BOLD_CONTROL";
            document.getElementById('BOLD_CONTROL')?.classList.add('selected');
            break;
        case "italic":
            currentInlineBlock = "ITALIC_CONTROL";
            document.getElementById('ITALIC_CONTROL')?.classList.add('selected');
            break;
        case "underline":
            currentInlineBlock = "UNDERLINE_CONTROL";
            document.getElementById('UNDERLINE_CONTROL')?.classList.add('selected');
            break;
        case "strike":
            currentInlineBlock = "STRIKETHROUGH_CONTROL";
            document.getElementById('STRIKETHROUGH_CONTROL')?.classList.add('selected');
            break;
        case "mark":
            currentInlineBlock = "MARKED_CONTROL";
            document.getElementById('MARKED_CONTROL')?.classList.add('selected');
            break;
        case "code-inline":
            currentInlineBlock = "INLINE_CODE";
            document.getElementById('INLINE_CODE')?.classList.add('selected');
            break;
        case "default-text":
            currentInlineBlock = "DEFAULT_TEXT";
            document.querySelectorAll(".styles").forEach(el => {
                el.classList.remove('selected');
            });
            break;
    }
}

function updateInlineStyleButtons(element, className) {
    const styleButtons = document.querySelectorAll('.styles');
    
    // Clear all selected states first
    styleButtons.forEach(btn => btn.classList.remove('selected'));
    
    if (!element || !className) return;
    
    if (currentSelection && currentSelection.isSelectionActive) {
        // Handle selection state - check all spans in selection
        const range = currentSelection.range;
        const selectedFragment = range.cloneContents();
        const spans = selectedFragment.querySelectorAll('span');
        
        // Collect all style classes from selected spans
        const allStyles = new Set();
        
        // Check if selection spans multiple elements
        if (spans.length > 1) {
            spans.forEach(span => {
                const classes = span.className.split(' ').filter(cls => 
                    ['bold', 'italic', 'strike', 'underline', 'mark', 'code-inline'].includes(cls)
                );
                classes.forEach(cls => allStyles.add(cls));
            });
        } else {
            // Single span or text node
            const parentSpan = range.startContainer.nodeType === Node.TEXT_NODE 
                ? range.startContainer.parentNode 
                : range.startContainer;
                
            if (parentSpan && parentSpan.tagName === 'SPAN') {
                const classes = parentSpan.className.split(' ').filter(cls => 
                    ['bold', 'italic', 'strike', 'underline', 'mark', 'code-inline'].includes(cls)
                );
                classes.forEach(cls => allStyles.add(cls));
            }
        }
        
        // Activate buttons for all found styles
        allStyles.forEach(styleClass => {
            const activeButton = Array.from(styleButtons).find(btn => btn.dataset.style === styleClass);
            if (activeButton) {
                activeButton.classList.add('selected');
            }
        });
        
        console.log("Selection styles:", Array.from(allStyles));
        
    } else {
        // Handle cursor position state
        const styleClasses = className.split(' ').filter(cls => 
            ['bold', 'italic', 'strike', 'underline', 'mark', 'code-inline', 'default-text'].includes(cls)
        );
        
        console.log("Cursor position styles:", styleClasses);
        
        if (styleClasses.includes('default-text') || styleClasses.length === 0) {
            // All buttons should remain unselected for default-text
            return;
        }
        
        // Activate buttons for all style classes found
        styleClasses.forEach(styleClass => {
            if (styleClass !== 'default-text') {
                const activeButton = Array.from(styleButtons).find(btn => btn.dataset.style === styleClass);
                if (activeButton) {
                    activeButton.classList.add('selected');
                }
            }
        });
    }
}

function handleSelectionChange() {
  const selection = window.getSelection();
  if (selection.rangeCount === 0) {
    // Only clear if we're not preserving a selection
    if (!preservedSelection) {
      currentSelection = null;
    }
    return;
  }
  
  const range = selection.getRangeAt(0);
  const selectedText = selection.toString();
  
  // Check if selection is within editor content
  const editorContainer = document.querySelector('.editor-content') || document.body;
  if (!editorContainer.contains(range.commonAncestorContainer)) {
    return;
  }
  
  // --- FIX: Update currentBlock based on current position ---
  const currentLine = getCurrentLineElement();
  if (currentLine) {
    switch (currentLine.tagName) {
      case 'H1':
        if (currentBlock !== "HEADING1") updateCurrentBlock("HEADING1");
        break;
      case 'H2':
        if (currentBlock !== "HEADING2") updateCurrentBlock("HEADING2");
        break;
      case 'H3':
        if (currentBlock !== "HEADING3") updateCurrentBlock("HEADING3");
        break;
      case 'H4':
        if (currentBlock !== "HEADING4") updateCurrentBlock("HEADING4");
        break;
      case 'H5':
        if (currentBlock !== "HEADING5") updateCurrentBlock("HEADING5");
        break;
      case 'PRE':
        if (currentBlock !== "CODE_BLOCK") updateCurrentBlock("CODE_BLOCK");
        break;
      case 'BLOCKQUOTE':
        if (currentBlock !== "BLOCKQUOTE") updateCurrentBlock("BLOCKQUOTE");
        break;
      case 'LI':
        const parentList = currentLine.parentElement;
        if (parentList && parentList.tagName === 'UL') {
          if (currentBlock !== "UNORDERED_LIST") updateCurrentBlock("UNORDERED_LIST");
        } else if (parentList && parentList.tagName === 'OL') {
          if (currentBlock !== "ORDERED_LIST") updateCurrentBlock("ORDERED_LIST");
        }
        break;
      case 'P':
      default:
        updateCurrentBlock("PARAGRAPH");
        if (currentBlock !== null) updateCurrentBlock("PARAGRAPH");
        break;
    }
  }
  
  // Get the current element more accurately
  let currentElement = range.startContainer;
  if (currentElement.nodeType === Node.TEXT_NODE) {
    currentElement = currentElement.parentNode;
  }
  
  // Find the closest span element
  while (currentElement && currentElement.tagName !== 'SPAN' && currentElement !== document.body) {
    currentElement = currentElement.parentNode;
  }
  
  if (selection.toString().length > 0) {
    currentSelection = {
      range: range.cloneRange(), 
      text: selectedText,
      isValid: selectedText.length > 0,
      isSelectionActive: true
    };
    
    // For selections, check the common ancestor or the range itself
    const selectionElement = range.commonAncestorContainer.nodeType === Node.TEXT_NODE 
      ? range.commonAncestorContainer.parentNode 
      : range.commonAncestorContainer;
      
    console.log("Selection element:", selectionElement);
    updateInlineStyleButtons(selectionElement, selectionElement.className || '');
    
  } else {
    currentSelection = {
      range: range.cloneRange(),
      text: selectedText,
      isValid: selectedText.length > 0,
      isSelectionActive: false
    };
    
    // For cursor position, use the current element
    if (currentElement && currentElement.tagName === 'SPAN') {
      console.log("Cursor element:", currentElement);
      updateInlineStyleButtons(currentElement, currentElement.className || '');
    } else {
      // If not in a span, treat as default-text
      updateInlineStyleButtons(null, 'default-text');
    }
  }
}


function getBlockCompatibilityRules() {
    return {
        "BLOCKQUOTE": {
            allowed: ["INLINE_CODE"], // Only inline code allowed inside blockquotes
            disallowed: ["HEADING1", "HEADING2", "HEADING3", "HEADING4", "HEADING5", "CODE_BLOCK", "UNORDERED_LIST", "ORDERED_LIST"]
        },
        "CODE_BLOCK": {
            allowed: [], // No other block styles allowed inside code blocks
            disallowed: ["HEADING1", "HEADING2", "HEADING3", "HEADING4", "HEADING5", "BLOCKQUOTE", "UNORDERED_LIST", "ORDERED_LIST"]
        },
        "HEADING1": {
            allowed: ["HEADING2", "HEADING3", "HEADING4", "HEADING5", "CODE_BLOCK", "BLOCKQUOTE", "UNORDERED_LIST", "ORDERED_LIST"],
            disallowed: []
        },
        "HEADING2": {
            allowed: ["HEADING1", "HEADING3", "HEADING4", "HEADING5", "CODE_BLOCK", "BLOCKQUOTE", "UNORDERED_LIST", "ORDERED_LIST"],
            disallowed: []
        },
        "HEADING3": {
            allowed: ["HEADING1", "HEADING2", "HEADING4", "HEADING5", "CODE_BLOCK", "BLOCKQUOTE", "UNORDERED_LIST", "ORDERED_LIST"],
            disallowed: []
        },
        "HEADING4": {
            allowed: ["HEADING1", "HEADING2", "HEADING3", "HEADING5", "CODE_BLOCK", "BLOCKQUOTE", "UNORDERED_LIST", "ORDERED_LIST"],
            disallowed: []
        },
        "HEADING5": {
            allowed: ["HEADING1", "HEADING2", "HEADING3", "HEADING4", "CODE_BLOCK", "BLOCKQUOTE", "UNORDERED_LIST", "ORDERED_LIST"],
            disallowed: []
        },
        "UNORDERED_LIST": {
            allowed: ["HEADING1", "HEADING2", "HEADING3", "HEADING4", "HEADING5", "CODE_BLOCK", "BLOCKQUOTE", "ORDERED_LIST"],
            disallowed: []
        },
        "ORDERED_LIST": {
            allowed: ["HEADING1", "HEADING2", "HEADING3", "HEADING4", "HEADING5", "CODE_BLOCK", "BLOCKQUOTE", "UNORDERED_LIST"],
            disallowed: []
        },
        "PARAGRAPH": {
            allowed: ["HEADING1", "HEADING2", "HEADING3", "HEADING4", "HEADING5", "CODE_BLOCK", "BLOCKQUOTE", "UNORDERED_LIST", "ORDERED_LIST"],
            disallowed: []
        }
    };
}

function updateBlockStyleAvailability(currentBlockType) {
    const rules = getBlockCompatibilityRules();
    const currentRules = rules[currentBlockType];
    
    if (!currentRules) return;
    
    // Reset all block controls first
    const allBlockControls = [
        "HEADING1", "HEADING2", "HEADING3", "HEADING4", "HEADING5", 
        "CODE_BLOCK", "UNORDERED_LIST", "ORDERED_LIST", "BLOCKQUOTE"
    ];
    
    allBlockControls.forEach(controlId => {
        const element = document.getElementById(controlId);
        if (element) {
            element.classList.remove('deactivated');
            element.style.pointerEvents = 'auto';
            element.style.opacity = '1';
        }
    });
    
    // Deactivate disallowed controls
    currentRules.disallowed.forEach(controlId => {
        const element = document.getElementById(controlId);
        if (element) {
            element.classList.add('deactivated');
            element.style.pointerEvents = 'none';
            element.style.opacity = '0.5';
        }
    });
}

function updateInlineStyleAvailability(currentBlockType) {
    const inlineControls = [
        "BOLD_CONTROL", "ITALIC_CONTROL", "UNDERLINE_CONTROL", 
        "STRIKETHROUGH_CONTROL", "MARKED_CONTROL", "INLINE_CODE"
    ];
    
    // Reset all inline controls first
    inlineControls.forEach(controlId => {
        const element = document.getElementById(controlId);
        if (element) {
            element.classList.remove('deactivated');
            element.style.pointerEvents = 'auto';
            element.style.opacity = '1';
        }
    });
    
    // Special rules for specific block types
    if (currentBlockType === "CODE_BLOCK") {
        document.getElementById("languageSelector").classList.remove('hidden');
        inlineControls.forEach(controlId => {
            if (controlId !== "INLINE_CODE") {
                const element = document.getElementById(controlId);
                if (element) {
                    element.classList.add('deactivated');
                    element.style.pointerEvents = 'none';
                    element.style.opacity = '0.5';
                }
            }
        });
    }
}
