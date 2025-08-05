// Wait for DOM to be fully loaded before attaching event listeners
document.addEventListener('DOMContentLoaded', function() {
    // Typography button to toggle textControls visibility
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
        { id: "BLOCKQUOTE", type: "BLOCKQUOTE" }
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
                console.log(`Clicked ${control.id}, applying ${control.type}`); // Debug log
                applyInlineStyle(control.type);
            });
        } else {
            console.warn(`Element with ID ${control.id} not found`);
        }
    });
});

function applyBlockStyle(elementType) {
    
    sel = currentLineFormat.sel;
    range = currentLineFormat.range;
    currentLine = currentLineFormat.currentLine;
    if (!currentLine) {
        console.warn("No current line element found");
        return;
    }

    const section = currentLine.closest('section');
    if (!section) {
        console.warn("No section found");
        return;
    }


    // Save cursor position
    let cursorPosition = 0;
    if (range) {
        const walker = document.createTreeWalker(
            currentLine,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );
        let node;
        let found = false;
        while ((node = walker.nextNode()) && !found) {
            if (node === range.startContainer) {
                cursorPosition += range.startOffset;
                found = true;
            } else {
                cursorPosition += node.textContent.length;
            }
        }
    }

    const content = currentLine.innerHTML || '\u00A0';
    const hexID = generateHexID();
    let newElement;

    switch(elementType) {
        case "H1":
            if (currentLine.tagName === 'H1') return;
            updateCurrentBlock("HEADING1");
            
            // If converting from other heading, stay in same section
            if (currentLine.tagName.match(/^H[2-6]$/)) {
                newElement = document.createElement('h1');
                newElement.id = `heading_${hexID}`;
                newElement.innerHTML = content;
                section.replaceChild(newElement, currentLine);
            } else {
                // Create new section for H1
                const newSection = document.createElement('section');
                newElement = document.createElement('h1');
                newElement.id = `heading_${hexID}`;
                newElement.innerHTML = content;
                newSection.appendChild(newElement);
                
                // Insert new section after current
                section.parentNode.insertBefore(newSection, section.nextSibling);
                
                // Remove current line and clean up empty section
                currentLine.remove();
                if (section.children.length === 0) {
                    section.remove();
                } else {
                    const newP = createParagraph();
                    newSection.appendChild(newP);
                }
            }
            break;

        case "H2":
        case "H3":
        case "H4":
        case "H5":
            const headingLevel = elementType.charAt(1);
            updateCurrentBlock(`HEADING${headingLevel}`);
            newElement = document.createElement(`h${headingLevel}`);
            newElement.id = `heading_${hexID}`;
            newElement.innerHTML = content;
            section.replaceChild(newElement, currentLine);
            break;

        case "PRE":
            if (currentLine.tagName === 'PRE') return;
            updateCurrentBlock("CODE_BLOCK");
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = createCodeBlock(hexID);
            newElement = tempDiv.firstElementChild;
            const code = newElement.querySelector('code');
            const copyButton = newElement.querySelector('i[data-copy-btn]');

            newElement.id = `pre_${hexID}`;
            code.textContent = currentLine.textContent || '';

            copyButton.addEventListener('click', (e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(code.textContent);
                copyButton.classList.add('copied');
                setTimeout(() => copyButton.classList.remove('copied'), 1500);
            });

            section.replaceChild(newElement, currentLine);
            updateCodeBlockClasses(code);
            placeCaretAtStart(code);
            return;

        case "UL":
            if (currentLine.tagName === 'LI' && currentLine.parentElement.tagName === 'UL') return;
            updateCurrentBlock("UNORDERED_LIST");
            newElement = document.createElement('ul');
            newElement.id = `ul_${hexID}`;
            const li = document.createElement('li');
            li.id = `li_${generateHexID()}`;
            li.innerHTML = content;
            newElement.appendChild(li);
            section.replaceChild(newElement, currentLine);
            newElement = li; // Focus on the li element
            break;

        case "OL":
            if (currentLine.tagName === 'LI' && currentLine.parentElement.tagName === 'OL') return;
            updateCurrentBlock("ORDERED_LIST");
            newElement = document.createElement('ol');
            newElement.id = `ol_${hexID}`;
            const liOrdered = document.createElement('li');
            liOrdered.id = `li_${generateHexID()}`;
            liOrdered.innerHTML = content;
            newElement.appendChild(liOrdered);
            section.replaceChild(newElement, currentLine);
            newElement = liOrdered; // Focus on the li element
            break;

        case "BLOCKQUOTE":
            if (currentLine.tagName === 'BLOCKQUOTE') return;
            updateCurrentBlock("BLOCKQUOTE");
            newElement = document.createElement('blockquote');
            newElement.id = `blockquote_${hexID}`;
            newElement.innerHTML = content;
            section.replaceChild(newElement, currentLine);
            break;

        default:
            console.warn(`Unknown element type: ${elementType}`);
            return;
    }

    // Restore cursor position
    if (newElement && elementType !== "PRE") {
        setTimeout(() => {
            try {
                let currentPos = 0;
                const walker = document.createTreeWalker(
                    newElement,
                    NodeFilter.SHOW_TEXT,
                    null,
                    false
                );

                let node;
                while ((node = walker.nextNode())) {
                    const nodeLength = node.textContent.length;
                    if (currentPos + nodeLength >= cursorPosition) {
                        const offset = cursorPosition - currentPos;
                        const newRange = document.createRange();
                        newRange.setStart(node, Math.min(offset, nodeLength));
                        newRange.collapse(true);
                        sel.removeAllRanges();
                        sel.addRange(newRange);
                        return;
                    }
                    currentPos += nodeLength;
                }
                placeCaretAtEnd(newElement);
            } catch (err) {
                console.warn("Error restoring cursor position:", err);
                placeCaretAtEnd(newElement);
            }
        }, 0);
    }
}

function applyInlineStyle(styleType) {
    

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

    if (range.collapsed) {
        // No selection - apply style at cursor position
        applyStyleAtCursor(styleType, range, currentLine);
    } else {
        // Has selection - apply style to selected text
        applyStyleToSelection(styleType, range, currentLine);
    }
}

function applyStyleAtCursor(styleType, range, currentLine) {
    const currentNode = range.startContainer;
    
    // If cursor is in a styled span, check if we should toggle or change style
    if (currentNode.nodeType === Node.TEXT_NODE && currentNode.parentNode.tagName === 'SPAN') {
        const parentSpan = currentNode.parentNode;
        const currentClass = parentSpan.className;
        
        if (currentClass === styleType) {
            // Same style - split the span and insert a default span
            const beforeText = currentNode.textContent.substring(0, range.startOffset);
            const afterText = currentNode.textContent.substring(range.startOffset);
            
            if (beforeText) {
                const beforeSpan = document.createElement('span');
                beforeSpan.className = currentClass;
                beforeSpan.id = `span_${generateHexID()}`;
                beforeSpan.textContent = beforeText;
                parentSpan.parentNode.insertBefore(beforeSpan, parentSpan);
            }
            
            const newSpan = document.createElement('span');
            newSpan.className = 'default-text';
            newSpan.id = `span_${generateHexID()}`;
            newSpan.textContent = '\u00A0';
            parentSpan.parentNode.insertBefore(newSpan, parentSpan);
            
            if (afterText) {
                parentSpan.textContent = afterText;
            } else {
                parentSpan.remove();
            }
            
            placeCaretAtEnd(newSpan);
            updateCurrentInlineBlock('default-text');
            return;
        }
    }
    
    // Create new styled span at cursor
    const newSpan = document.createElement('span');
    newSpan.className = styleType;
    newSpan.id = `span_${generateHexID()}`;
    newSpan.textContent = '\u00A0';
    
    range.insertNode(newSpan);
    placeCaretAtEnd(newSpan);
    updateCurrentInlineBlock(styleType);
}

function applyStyleToSelection(styleType, range, currentLine) {
    const selectedText = range.toString();
    if (!selectedText) return;
    
    // Check if selection is entirely within a single span with same style
    const startContainer = range.startContainer;
    const endContainer = range.endContainer;
    
    if (startContainer === endContainer && 
        startContainer.nodeType === Node.TEXT_NODE &&
        startContainer.parentNode.tagName === 'SPAN' &&
        startContainer.parentNode.className === styleType) {
        
        // Toggle off the style
        const span = startContainer.parentNode;
        const beforeText = startContainer.textContent.substring(0, range.startOffset);
        const selectedText = startContainer.textContent.substring(range.startOffset, range.endOffset);
        const afterText = startContainer.textContent.substring(range.endOffset);
        
        // Create before span if needed
        if (beforeText) {
            const beforeSpan = document.createElement('span');
            beforeSpan.className = styleType;
            beforeSpan.id = `span_${generateHexID()}`;
            beforeSpan.textContent = beforeText;
            span.parentNode.insertBefore(beforeSpan, span);
        }
        
        // Create default span for selected text
        const defaultSpan = document.createElement('span');
        defaultSpan.className = 'default-text';
        defaultSpan.id = `span_${generateHexID()}`;
        defaultSpan.textContent = selectedText;
        span.parentNode.insertBefore(defaultSpan, span);
        
        // Update original span with after text or remove it
        if (afterText) {
            span.textContent = afterText;
        } else {
            span.remove();
        }
        
        // Select the new default span
        const newRange = document.createRange();
        newRange.selectNodeContents(defaultSpan);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(newRange);
        
        updateCurrentInlineBlock('default-text');
        return;
    }
    
    // Apply new style to selection
    const styledSpan = document.createElement('span');
    styledSpan.className = styleType;
    styledSpan.id = `span_${generateHexID()}`;
    
    try {
        const contents = range.extractContents();
        styledSpan.appendChild(contents);
        range.insertNode(styledSpan);
        
        // Select the new styled span
        const newRange = document.createRange();
        newRange.selectNodeContents(styledSpan);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(newRange);
        
        updateCurrentInlineBlock(styleType);
        
        // Process the entire line to handle any markdown conflicts
        setTimeout(() => {
            if (typeof processEntireLineContent === 'function') {
                processEntireLineContent(currentLine);
            }
        }, 0);
        
    } catch (err) {
        console.warn("Error applying inline style:", err);
    }
}

function updateCurrentBlock(type) {
    document.querySelectorAll(".blockedStyleElements").forEach(el => {
        el.classList.remove('selected');
    });
    currentBlock = type;
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