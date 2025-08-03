hljs.highlightAll();
let enterPressCount = 0;
const editor = document.getElementById('editor');

function generateHexID() {
  return Math.random().toString(16).substr(2, 8);
}

function createSection() {
  const section = document.createElement('section');
  const h1 = document.createElement('h1');
  h1.innerHTML = '<span class="default-text">Heading</span>';
  const p = document.createElement('p');
  p.innerHTML = '<span class="default-text">Start typing...</span>';
  
  section.appendChild(h1);
  section.appendChild(p);
  return section;
}

function createParagraph() {
  const p = document.createElement('p');
  p.innerHTML = '<span class="default-text">\u200B</span>';
  return p;
}

function createCodeBlock(hexID) {
  return `
    <pre data-slate-node="element" contenteditable="false">
      <code contenteditable="true" id="code_${hexID}" class="code_block hljs" data-slate-node="code"></code>
      <i class='bx bx-copy' data-copy-btn></i>
    </pre>
  `;
}

function highlightCodeBlock(codeElement) {
  if (!codeElement) return;
  try {
    if (codeElement.dataset.highlighted) {
      delete codeElement.dataset.highlighted;
    }
    // Ensure the code_block class is present
    if (!codeElement.classList.contains('code_block')) {
      codeElement.classList.add('code_block');
    }
    hljs.highlightElement(codeElement);
  } catch (error) {
    console.warn("Highlight.js error:", error);
  }
}

function getCurrentLineElement() {
  const sel = window.getSelection();
  if (!sel.rangeCount) return null;

  let node = sel.getRangeAt(0).startContainer;

  while (node && node !== editor) {
    if (node.parentNode === editor) {
      return node;
    }
    if (node.tagName === 'H1' || node.tagName === 'P') {
      return node;
    }
    if (node.tagName === 'LI') {
      return node;
    }
    if (node.tagName === 'PRE') {
      return node;
    }
    node = node.parentNode;
  }
  return null;
}

function placeCaretAtStart(el) {
  const range = document.createRange();
  const sel = window.getSelection();

  if (el.nodeType === Node.TEXT_NODE) {
    range.setStart(el, 0);
  } else if (el.firstChild) {
    if (el.firstChild.nodeType === Node.TEXT_NODE) {
      range.setStart(el.firstChild, 0);
    } else {
      range.setStartBefore(el.firstChild);
    }
  } else {
    range.setStart(el, 0);
  }
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

function placeCaretAtEnd(el) {
  const range = document.createRange();
  const sel = window.getSelection();
  range.selectNodeContents(el);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

function createNewLineElement() {
  const p = document.createElement('p');
  p.innerHTML = '<span class="default-text">\u200B</span>';
  return p;
}

function handleBlockFormatting(lineEl) {
  const text = lineEl.textContent;
  let handled = false;

  if (lineEl.tagName === 'P') {
    const section = lineEl.parentNode;
    
    // Check for code block
    if (text === '```\u00A0') {
      const hexID = generateHexID();
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = createCodeBlock(hexID);
      const pre = tempDiv.firstElementChild;
      const code = pre.querySelector('code');
      const copyButton = pre.querySelector('i[data-copy-btn]');

      // Add copy functionality
      copyButton.addEventListener('click', (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(code.textContent);
        copyButton.classList.add('copied');
        setTimeout(() => copyButton.classList.remove('copied'), 1500);
      });

      // Replace current p with pre
      section.replaceChild(pre, lineEl);
      
      // Add new paragraph after pre
      const newP = createParagraph();
      section.appendChild(newP);
      
      placeCaretAtEnd(code);
      return true;
    }

    // Check for horizontal rule
    if (text == '---\u00A0' || text === '***\u00A0' || text === '___\u00A0') {
      const hr = document.createElement('hr');
      section.replaceChild(hr, lineEl);
      
      // Add new paragraph after hr
      const newP = createParagraph();
      section.appendChild(newP);
      
      placeCaretAtStart(newP);
      return true;
    }

    // Check for heading patterns - these create new sections
    const headingPatterns = [
      { regex: /^#\s(.*)/, tag: 'h1' },
      { regex: /^##\s(.*)/, tag: 'h2' },
      { regex: /^###\s(.*)/, tag: 'h3' },
      { regex: /^####\s(.*)/, tag: 'h4' },
      { regex: /^#####\s(.*)/, tag: 'h5' },
      { regex: /^######\s(.*)/, tag: 'h6' }
    ];

    for (const pattern of headingPatterns) {
      const match = text.match(pattern.regex);
      if (match) {
        // Create new section with heading
        const newSection = document.createElement('section');
        const heading = document.createElement(pattern.tag);
        heading.textContent = match[1] || '\u200B';
        
        const newP = createParagraph();
        
        newSection.appendChild(heading);
        newSection.appendChild(newP);
        
        // Insert new section after current section
        editor.insertBefore(newSection, section.nextSibling);
        
        placeCaretAtStart(newP);
        return true;
      }
    }

    // Check for list items
    if (text.match(/^[\*\-\+]\s(.*)/) || text.match(/^\d+\.\s(.*)/)) {
      const isOrdered = text.match(/^\d+\.\s(.*)/);
      const listType = isOrdered ? 'ol' : 'ul';
      const content = text.match(isOrdered ? /^\d+\.\s(.*)/ : /^[\*\-\+]\s(.*)/)[1];
      
      const list = document.createElement(listType);
      const li = document.createElement('li');
      li.textContent = content;
      list.appendChild(li);
      
      // Replace current p with list
      section.replaceChild(list, lineEl);
      
      // Add new paragraph after list
      const newP = createParagraph();
      section.appendChild(newP);
      
      placeCaretAtEnd(li);
      return true;
    }

    // Check for blockquote
    if (text.match(/^>\s(.*)/)) {
      const content = text.match(/^>\s(.*)/)[1];
      const blockquote = document.createElement('blockquote');
      blockquote.textContent = content;
      
      // Replace current p with blockquote
      section.replaceChild(blockquote, lineEl);
      
      // Add new paragraph after blockquote
      const newP = createParagraph();
      section.appendChild(newP);
      
      placeCaretAtEnd(blockquote);
      return true;
    }
  }

  return handled;
}

function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/"/g, '"')
    .replace(/'/g, "'");
}


function traverseAndApplyInlineStyles(node) {
    if (!node) return;

    if (node.nodeType === Node.ELEMENT_NODE && (node.tagName === 'CODE' || node.tagName === 'PRE')) {
        return;
    }

    // Check if this node already has styled spans - if so, only process text nodes that aren't styled
    const hasStyledSpans = node.querySelector('.bold, .italic, .underline, .strike, .mark, .code-inline, .default-text');
    
    if (hasStyledSpans) {
        // Only process text nodes that are direct children and not in styled spans
        const directTextNodes = Array.from(node.childNodes).filter(child => 
            child.nodeType === Node.TEXT_NODE
        );
        
        for (const textNode of directTextNodes) {
            processTextNodeForStyles(textNode);
        }
        
        // Also process any default-text spans that might have new content
        const defaultSpans = node.querySelectorAll('.default-text');
        for (const span of defaultSpans) {
            if (span.childNodes.length === 1 && span.firstChild.nodeType === Node.TEXT_NODE) {
                processTextNodeForStyles(span.firstChild);
            }
        }
    } else {
        // Process the entire line's text content as before
        processEntireLineContent(node);
    }
}


function processEntireLineContent(node) {
    // Process the entire line's text content as a single unit
    const lineText = node.textContent;
    if (!lineText) return;

    // Define all inline style patterns
    const stylePatterns = [
        { regex: /\*\*(.+?)\*\*/g, tag: 'span', className: 'bold' },
        { regex: /(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, tag: 'span', className: 'italic' },
        { regex: /__(.+?)__/g, tag: 'span', className: 'underline' },
        { regex: /(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, tag: 'span', className: 'italic' },
        { regex: /~~(.+?)~~/g, tag: 'span', className: 'strike' },
        { regex: /==(.+?)==/g, tag: 'span', className: 'mark' },
        { regex: /`([^`\n]+?)`/g, tag: 'span', className: 'code-inline' }
    ];

    // Collect all matches with their positions
    const allMatches = [];
    
    for (let i = 0; i < stylePatterns.length; i++) {
        const pattern = stylePatterns[i];
        let match;
        const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
        
        while ((match = regex.exec(lineText)) !== null) {
            allMatches.push({
                start: match.index,
                end: match.index + match[0].length,
                fullMatch: match[0],
                content: match[1],
                tag: pattern.tag,
                className: pattern.className,
                priority: i
            });
        }
    }

    if (allMatches.length === 0) {
        // No styles, wrap in default span
        const defaultSpan = document.createElement('span');
        defaultSpan.className = 'default-text';
        defaultSpan.textContent = lineText;
        node.innerHTML = '';
        node.appendChild(defaultSpan);
        return;
    }

    // Sort matches by start position
    allMatches.sort((a, b) => {
        if (a.start !== b.start) return a.start - b.start;
        return a.priority - b.priority;
    });

    // Remove overlapping matches
    const validMatches = [];
    for (const match of allMatches) {
        const hasOverlap = validMatches.some(existing => 
            (match.start < existing.end && match.end > existing.start)
        );
        if (!hasOverlap) {
            validMatches.push(match);
        }
    }

    // Clear and rebuild
    node.innerHTML = '';
    
    let lastIndex = 0;
    const fragment = document.createDocumentFragment();

    for (const match of validMatches) {
        // Add text before the match
        if (match.start > lastIndex) {
            const beforeText = lineText.substring(lastIndex, match.start);
            if (beforeText) {
                const defaultSpan = document.createElement('span');
                defaultSpan.className = 'default-text';
                defaultSpan.textContent = beforeText;
                fragment.appendChild(defaultSpan);
            }
        }
        
        // Create styled span
        const styledSpan = document.createElement(match.tag);
        styledSpan.className = match.className;
        styledSpan.textContent = match.content;
        fragment.appendChild(styledSpan);
        
        lastIndex = match.end;
    }

    // Add remaining text
    const remainingText = lineText.substring(lastIndex);
    if (remainingText) {
        const defaultSpan = document.createElement('span');
        defaultSpan.className = 'default-text';
        defaultSpan.textContent = remainingText;
        fragment.appendChild(defaultSpan);
    }

    node.appendChild(fragment);
}


function processTextNodeForStyles(textNode) {
    if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return;
    
    const parent = textNode.parentNode;
    const text = textNode.nodeValue;
    
    // Define all inline style patterns
    const stylePatterns = [
        { regex: /\*\*(.+?)\*\*/g, tag: 'span', className: 'bold' },
        { regex: /(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, tag: 'span', className: 'italic' },
        { regex: /__(.+?)__/g, tag: 'span', className: 'underline' },
        { regex: /(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, tag: 'span', className: 'italic' },
        { regex: /~~(.+?)~~/g, tag: 'span', className: 'strike' },
        { regex: /==(.+?)==/g, tag: 'span', className: 'mark' },
        { regex: /`([^`\n]+?)`/g, tag: 'span', className: 'code-inline' }
    ];

    // Find all matches in this text node
    const allMatches = [];
    
    for (let i = 0; i < stylePatterns.length; i++) {
        const pattern = stylePatterns[i];
        let match;
        const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
        
        while ((match = regex.exec(text)) !== null) {
            allMatches.push({
                start: match.index,
                end: match.index + match[0].length,
                fullMatch: match[0],
                content: match[1],
                tag: pattern.tag,
                className: pattern.className,
                priority: i
            });
        }
    }

    if (allMatches.length === 0) {
        // No styles found, ensure it's in a default span
        if (!parent.classList.contains('default-text')) {
            const defaultSpan = document.createElement('span');
            defaultSpan.className = 'default-text';
            defaultSpan.textContent = text;
            parent.insertBefore(defaultSpan, textNode);
            parent.removeChild(textNode);
        }
        return;
    }

    // Sort matches by start position
    allMatches.sort((a, b) => {
        if (a.start !== b.start) return a.start - b.start;
        return a.priority - b.priority;
    });

    // Remove overlapping matches
    const validMatches = [];
    for (const match of allMatches) {
        const hasOverlap = validMatches.some(existing => 
            (match.start < existing.end && match.end > existing.start)
        );
        if (!hasOverlap) {
            validMatches.push(match);
        }
    }

    // Create fragment with styled content
    const fragment = document.createDocumentFragment();
    let lastIndex = 0;

    for (const match of validMatches) {
        // Add text before the match
        if (match.start > lastIndex) {
            const beforeText = text.substring(lastIndex, match.start);
            if (beforeText) {
                const defaultSpan = document.createElement('span');
                defaultSpan.className = 'default-text';
                defaultSpan.textContent = beforeText;
                fragment.appendChild(defaultSpan);
            }
        }
        
        // Create styled span
        const styledSpan = document.createElement(match.tag);
        styledSpan.className = match.className;
        styledSpan.textContent = match.content;
        fragment.appendChild(styledSpan);
        
        lastIndex = match.end;
    }

    // Add remaining text
    const remainingText = text.substring(lastIndex);
    if (remainingText) {
        const defaultSpan = document.createElement('span');
        defaultSpan.className = 'default-text';
        defaultSpan.textContent = remainingText;
        fragment.appendChild(defaultSpan);
    }

    // Replace the text node with styled spans
    parent.insertBefore(fragment, textNode);
    parent.removeChild(textNode);
}


function updateCodeBlockClasses(codeElement) {
  if (!codeElement) return;
  
  // Clear existing highlighting
  if (codeElement.dataset.highlighted) {
    delete codeElement.dataset.highlighted;
  }
  
  // Auto-detect language and highlight
  const result = hljs.highlightAuto(codeElement.textContent);
  
  // Reset classes and apply new ones
  codeElement.className = 'code_block hljs';
  
  // Add detected language class if available
  if (result.language) {
    codeElement.classList.add(`language-${result.language}`);
    codeElement.dataset.detectedLanguage = result.language;
  }
  
  // Apply the highlighted HTML
  codeElement.innerHTML = result.value;
}

editor.addEventListener('input', (e) => {
  const sel = window.getSelection();
  const range = sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
  const currentLine = getCurrentLineElement();

  if (!currentLine || !range) return;

  // Only handle block formatting on space, and only for P tags
  if (e.inputType === 'insertText' && e.data === ' ') {
    // Check if the line has any styled spans - if so, don't apply block formatting
    const hasStyledContent = currentLine.querySelector('span[class]');
    if (currentLine.tagName === 'P' && !hasStyledContent && handleBlockFormatting(currentLine)) {
      return;
    }
  }

  // Apply inline styles for H1 and P tags
  if (currentLine.tagName === 'H1' || currentLine.tagName === 'P') {
    // Store the cursor position relative to the entire line's text content
    let cursorPosition = 0;
    
    // Calculate cursor position within the line
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

    // Apply inline styles - this will process ALL text nodes in the line
    traverseAndApplyInlineStyles(currentLine);

    // Restore cursor position
    try {
      let currentPos = 0;
      const newWalker = document.createTreeWalker(
        currentLine,
        NodeFilter.SHOW_TEXT,
        null,
        false
      );
      
      let newNode;
      while ((newNode = newWalker.nextNode())) {
        const nodeLength = newNode.textContent.length;
        if (currentPos + nodeLength >= cursorPosition) {
          const offset = cursorPosition - currentPos;
          const newRange = document.createRange();
          newRange.setStart(newNode, Math.min(offset, nodeLength));
          newRange.collapse(true);
          sel.removeAllRanges();
          sel.addRange(newRange);
          return;
        }
        currentPos += nodeLength;
      }
      
      // Fallback: place at end of line
      placeCaretAtEnd(currentLine);
    } catch (err) {
      console.warn("Error restoring cursor position:", err);
      placeCaretAtEnd(currentLine);
    }
  }
  else if (currentLine.tagName === 'PRE') {
    const codeEl = currentLine.querySelector('code');
    if (codeEl) {
      const cursorPos = getCursorPositionInCodeBlock(codeEl);
      updateCodeBlockClasses(codeEl);
      restoreCursorPositionInCodeBlock(codeEl, cursorPos);
    }
  }
});

function getCursorPositionInCodeBlock(codeElement) {
  const sel = window.getSelection();
  if (!sel.rangeCount) return 0;
  
  const range = sel.getRangeAt(0);
  const preSelectionRange = range.cloneRange();
  preSelectionRange.selectNodeContents(codeElement);
  preSelectionRange.setEnd(range.startContainer, range.startOffset);
  
  return preSelectionRange.toString().length;
}


function restoreCursorPositionInCodeBlock(codeElement, position) {
  const sel = window.getSelection();
  const range = document.createRange();
  
  let currentPos = 0;
  const walker = document.createTreeWalker(
    codeElement,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );
  
  let node;
  while (node = walker.nextNode()) {
    const nodeLength = node.textContent.length;
    if (currentPos + nodeLength >= position) {
      range.setStart(node, position - currentPos);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
    currentPos += nodeLength;
  }
  
  // Fallback: place at end
  range.selectNodeContents(codeElement);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}


editor.addEventListener('keydown', (e) => {
  const sel = window.getSelection();
  const range = sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
  let currentLine = getCurrentLineElement();

  if(e.key === 'Backspace') {
    if (currentLine && (currentLine.tagName === 'H1' || currentLine.tagName === 'P')) {
      if (currentLine.textContent === '' || currentLine.innerHTML === '<br>' || currentLine.innerHTML === '<span class="default-text">\u200B</span>') {
        e.preventDefault();
        const section = currentLine.parentNode;
        
        // If it's an H1 and there are other elements in section, just reset it
        if (currentLine.tagName === 'H1' && section.children.length > 1) {
          currentLine.innerHTML = '<span class="default-text">\u200B</span>';
          placeCaretAtStart(currentLine);
          return;
        }
        
        // If it's a P and there are other Ps in section, remove this P
        if (currentLine.tagName === 'P') {
          const otherPs = section.querySelectorAll('p');
          if (otherPs.length > 1) {
            const prevP = currentLine.previousElementSibling;
            const nextP = currentLine.nextElementSibling;
            section.removeChild(currentLine);
            if (prevP && prevP.tagName === 'P') {
              placeCaretAtEnd(prevP);
            } else if (nextP && nextP.tagName === 'P') {
              placeCaretAtStart(nextP);
            } else {
              const h1 = section.querySelector('h1');
              if (h1) placeCaretAtEnd(h1);
            }
            return;
          } else {
            // Last P in section, reset it
            currentLine.innerHTML = '<span class="default-text">\u200B</span>';
            placeCaretAtStart(currentLine);
            return;
          }
        }
      }
    }

    if (currentLine && currentLine.tagName === 'DIV' && currentLine.parentElement?.tagName === 'LI' && currentLine.textContent.trim() === '') {
      e.preventDefault();
      const liParent = currentLine.parentElement;

      liParent.removeChild(currentLine);
      if (!liParent.hasChildNodes()) {
          const br = document.createElement('br');
          liParent.appendChild(br);
      }
      placeCaretAtEnd(liParent);
      return;
    }

    if (currentLine && currentLine.tagName === 'LI') {
        const ul = currentLine.parentElement;
        if (!ul || (ul.tagName !== 'UL' && ul.tagName !== 'OL')) return;

        const isEmpty = currentLine.textContent.trim() === '';

        if (isEmpty) {
            e.preventDefault();

            if (ul.parentNode.tagName === 'LI') {
                const parentLi = ul.parentNode;
                ul.remove();
                placeCaretAtEnd(parentLi);
            } else {
                const newDiv = createNewLineElement();
                ul.remove();
                editor.insertBefore(newDiv, ul.nextSibling || null);
                placeCaretAtStart(newDiv);
            }
            return;
        }
    }
  }

  if (currentLine && currentLine.tagName === 'PRE') {
    if (sel) {
      if(e.key === 'Backspace') {
        const codeEl = currentLine.querySelector('code');
        const selectedContent = sel.toString();
        if (codeEl && selectedContent === codeEl.textContent && selectedContent.length > 0) {
          e.preventDefault();
          codeEl.textContent = '';
          placeCaretAtStart(codeEl);
          updateCodeBlockClasses(codeEl);
          return;
        }

        const isCaretAtStart = sel.isCollapsed && sel.anchorOffset === 0 && (sel.anchorNode === codeEl || sel.anchorNode === codeEl.firstChild);
        const isCodeEmpty = codeEl.textContent.trim() === '';
        if (isCaretAtStart && isCodeEmpty) {
            e.preventDefault();
            const newDiv = createNewLineElement();
            editor.replaceChild(newDiv, currentLine);
            placeCaretAtStart(newDiv);
            return;
        }
      }
    }
  }

  if (e.key === 'Enter') {
    e.preventDefault();
    enterPressCount++;

    if (!currentLine) {
      const newSection = createSection();
      editor.appendChild(newSection);
      placeCaretAtStart(newSection.querySelector('p'));
      return;
    }

    // Handle Enter in H1 tags - create new P in same section
    if (currentLine.tagName === 'H1') {
      const section = currentLine.parentNode;
      const newP = createParagraph();
      section.appendChild(newP);
      placeCaretAtStart(newP);
      return;
    }

    // Handle Enter in P tags - create new P in same section
    if (currentLine.tagName === 'P') {
      const section = currentLine.parentNode;
      const newP = createParagraph();
      
      // Extract remaining content after cursor
      const remainingContents = range.extractContents();
      if (remainingContents.hasChildNodes()) {
        // Clear the new P and add the remaining content
        newP.innerHTML = '';
        newP.appendChild(remainingContents);
      }
      
      // Insert new P after current P
      section.insertBefore(newP, currentLine.nextSibling);
      placeCaretAtStart(newP);
      return;
    }

    if (currentLine.tagName === 'LI') {
      const parentList = currentLine.parentNode;
      const isCaretAtStartOfLi = range.startOffset === 0 && range.startContainer === currentLine.firstChild;
      const isLiEmpty = currentLine.textContent.trim() === '' && !currentLine.querySelector('br');

      if (isLiEmpty) {
        if (enterPressCount >= 2 || (isCaretAtStartOfLi && !currentLine.previousElementSibling)) {
          const section = parentList.closest('section');
          const newP = createParagraph();
          parentList.removeChild(currentLine);
          if (parentList.children.length === 0) {
            if (parentList.parentNode.tagName === 'LI') {
              const grandParentLi = parentList.parentNode;
              parentList.remove();
              section.insertBefore(newP, grandParentLi.nextSibling || null);
              placeCaretAtStart(newP);
            } else {
              parentList.remove();
              section.appendChild(newP);
              placeCaretAtStart(newP);
            }
          } else {
            const next = currentLine.nextElementSibling;
            const prev = currentLine.previousElementSibling;
            if (next) placeCaretAtStart(next);
            else if (prev) placeCaretAtEnd(prev);
            else placeCaretAtStart(parentList.children[0]);
          }
          enterPressCount = 0;
        } else {
          const nextSibling = currentLine.nextElementSibling;
          if (nextSibling && nextSibling.tagName === 'LI') {
            parentList.removeChild(currentLine);
            placeCaretAtStart(nextSibling);
          } else {
            const section = parentList.closest('section');
            const newP = createParagraph();
            parentList.removeChild(currentLine);
            if (parentList.children.length === 0) {
              parentList.remove();
            }
            section.appendChild(newP);
            placeCaretAtStart(newP);
          }
          enterPressCount = 0;
        }
      } else {
        const newLi = document.createElement('li');
        const remainingContents = range.extractContents();
        if (remainingContents.hasChildNodes()) {
          newLi.appendChild(remainingContents);
        } else {
          newLi.appendChild(document.createElement('br'));
        }
        currentLine.parentNode.insertBefore(newLi, currentLine.nextSibling);
        placeCaretAtStart(newLi);
        enterPressCount = 0;
      }
    }

    else if (currentLine.tagName === 'PRE') {
  const codeEl = currentLine.querySelector('code');
  if (codeEl) {
    if (e.shiftKey) {
      e.preventDefault();
      const range = sel.getRangeAt(0);
      
      // Store cursor position before making changes
      const cursorPos = getCursorPositionInCodeBlock(codeEl);
      
      // Insert newline at current position
      const textNode = document.createTextNode('\n');
      range.insertNode(textNode);
      
      // Update syntax highlighting
      updateCodeBlockClasses(codeEl);
      
      // Restore cursor position AFTER the newline (cursorPos + 1)
      restoreCursorPositionInCodeBlock(codeEl, cursorPos + 1);
    } else {
      e.preventDefault();
      if (codeEl.textContent.trim() === '') {
        const section = currentLine.closest('section');
        const newP = createParagraph();
        section.replaceChild(newP, currentLine);
        placeCaretAtStart(newP);
      } else {
        const section = currentLine.closest('section');
        const newP = createParagraph();
        section.appendChild(newP);
        placeCaretAtStart(newP);
      }
    }
  }
}

    else {
      // For other elements, create new P in section
      const section = currentLine.closest('section');
      if (section) {
        const newP = createParagraph();
        section.appendChild(newP);
        placeCaretAtStart(newP);
      }
      enterPressCount = 0;
    }
  }

  else if (e.key === 'Tab') {
    e.preventDefault();
    if (currentLine && currentLine.tagName === 'LI') {
      const parentList = currentLine.parentNode;
      const previousSibling = currentLine.previousElementSibling;

      if (previousSibling && previousSibling.tagName === 'LI') {
        let nestedList;
        if (previousSibling.lastElementChild && (previousSibling.lastElementChild.tagName === 'UL' || previousSibling.lastElementChild.tagName === 'OL')) {
          nestedList = previousSibling.lastElementChild;
        } else {
          nestedList = document.createElement(parentList.tagName);
          previousSibling.appendChild(nestedList);
        }
        nestedList.appendChild(currentLine);
        placeCaretAtEnd(currentLine);
      }
    } else if (currentLine && currentLine.tagName === 'PRE') {
      const textNode = document.createTextNode('  ');
      range.insertNode(textNode);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
      highlightCodeBlock(currentLine.querySelector('code'));
    } else if (currentLine && (currentLine.tagName === 'H1' || currentLine.tagName === 'P')) {
      const spaceNode = document.createTextNode('  ');
      range.insertNode(spaceNode);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    } else {
      const spaceNode = document.createTextNode('  ');
      range.insertNode(spaceNode);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  } else if (e.key === 'Backspace') {
    enterPressCount = 0;
    const sel = window.getSelection();
    if (sel.isCollapsed && sel.anchorOffset === 0) {
      const currentLineElement = getCurrentLineElement();
      if (!currentLineElement) return;

      // Handle backspace at beginning of elements - no longer convert back to divs
      if (currentLineElement.tagName === 'H1' || currentLineElement.tagName === 'P') {
        // Don't do anything special at start - let normal editing handle it
        return;
      }
      else if (currentLineElement.tagName === 'LI' && !currentLineElement.previousElementSibling) {
        e.preventDefault();
        const parentList = currentLineElement.parentNode;
        const section = parentList.closest('section');
        const newP = createParagraph();
        newP.innerHTML = currentLineElement.innerHTML;
        parentList.removeChild(currentLineElement);
        if (parentList.children.length === 0) {
          parentList.remove();
        }
        section.appendChild(newP);
        placeCaretAtEnd(newP);
      }
      else if (currentLineElement.tagName === 'PRE' && currentLineElement.textContent.trim() === '') {
        e.preventDefault();
        const section = currentLineElement.closest('section');
        const newP = createParagraph();
        section.replaceChild(newP, currentLineElement);
        placeCaretAtStart(newP);
      }
    }
  } else {
    enterPressCount = 0;
  }
});

editor.addEventListener('keydown', (e) => {
  if (e.key === 'Tab' && e.shiftKey) {
    e.preventDefault();
    const currentLi = getCurrentLineElement();
    if (currentLi && currentLi.tagName === 'LI') {
      const parentList = currentLi.parentNode;
      const grandParentLi = parentList.parentNode;

      if (grandParentLi && grandParentLi.tagName === 'LI') {
        grandParentLi.parentNode.insertBefore(currentLi, grandParentLi.nextSibling);
        if (parentList.children.length === 0) {
          parentList.remove();
        }
        placeCaretAtEnd(currentLi);
      } else if (parentList.parentNode === editor) {
        const newDiv = document.createElement('div');
        newDiv.innerHTML = currentLi.innerHTML;
        editor.insertBefore(newDiv, parentList.nextSibling || parentList);
        parentList.removeChild(currentLi);
        if (parentList.children.length === 0) {
          parentList.remove();
        }
        placeCaretAtEnd(newDiv);
      }
    }
  }
});

editor.addEventListener('click', (e) => {
  const clickedElement = e.target;

  if (clickedElement.tagName === 'PRE' || clickedElement.tagName === 'CODE') {
    const codeEl = clickedElement.tagName === 'CODE' ? clickedElement : clickedElement.querySelector('code');
    if (codeEl) {
      setTimeout(() => {
        codeEl.focus();
        if (codeEl.textContent === '') {
          placeCaretAtStart(codeEl);
        }
      }, 0);
    }
  }
});

// Initialize editor with a section containing H1 and P
if (editor.children.length === 0 || editor.textContent.trim() === '') {
  editor.innerHTML = '';
  const initialSection = createSection();
  editor.appendChild(initialSection);
  placeCaretAtStart(initialSection.querySelector('p'));
} else {
  // If editor has content but no sections, wrap in section
  if (!editor.querySelector('section')) {
    const initialSection = createSection();
    editor.appendChild(initialSection);
    placeCaretAtStart(initialSection.querySelector('p'));
  }
}