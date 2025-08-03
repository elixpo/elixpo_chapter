hljs.highlightAll();
let enterPressCount = 0;
const editor = document.getElementById('editor');

function generateHexID() {
  return Math.random().toString(16).substr(2, 8);
}

function createSection() {
  const section = document.createElement('section');
  const h1 = document.createElement('h1');
  h1.innerHTML = '\u00A0<span class="default-text-not-editable" contenteditable="false">Untitled File</span>';
  const p = document.createElement('p');
  p.innerHTML = '\u00A0<span class="default-text-not-editable" contenteditable="false">Welcome to Elixpo Sketch, you can type your notes here -- styled with markdown support!</span>';

  section.appendChild(h1);
  section.appendChild(p);
  return section;
}

function createParagraph() {
  const p = document.createElement('p');
  const defaultSpan = document.createElement('span');
  defaultSpan.className = 'default-text';
  defaultSpan.innerHTML = '\u00A0';
  p.appendChild(defaultSpan);
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
    if (node.tagName === 'H1' || node.tagName === 'P' || node.tagName === 'BLOCKQUOTE') {
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

  if (!el) return;

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

  if (!el) return;

  range.selectNodeContents(el);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

function createNewLineElement() {
  const p = document.createElement('p');
  const defaultSpan = document.createElement('span');
  defaultSpan.className = 'default-text';
  defaultSpan.innerHTML = '\u00A0';
  p.appendChild(defaultSpan);
  return p;
}

function handleBlockFormatting(lineEl) {
  const text = lineEl.textContent;
  const section = lineEl.parentNode;

  if (lineEl.tagName === 'P') {
    if (text === '```\u00A0' || text === '```  ' || text === '\u00A0\u00A0') {
      const hexID = generateHexID();
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = createCodeBlock(hexID);
      const pre = tempDiv.firstElementChild;
      const code = pre.querySelector('code');
      const copyButton = pre.querySelector('i[data-copy-btn]');

      pre.id = `pre_${hexID}`;

      copyButton.addEventListener('click', (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(code.textContent);
        copyButton.classList.add('copied');
        setTimeout(() => copyButton.classList.remove('copied'), 1500);
      });

      section.replaceChild(pre, lineEl);
      const newP = createParagraph();
      section.appendChild(newP);

      placeCaretAtStart(code);
      return true;
    }

    else if (text === '---\u00A0\u00A0' || text === '***\u00A0\u00A0' || text === '___\u00A0\u00A0' || text === '---\u00A0\u00A0') {
      const hexID = generateHexID();
      const hr = document.createElement('hr');
      hr.id = `hr_${hexID}`;
      section.replaceChild(hr, lineEl);

      const newP = createParagraph();
      section.appendChild(newP);

      placeCaretAtStart(newP);
      return true;
    }

    // Heading detection: match #, ##, ###, etc. with any combination of spaces or &nbsp; before/after
    else if (/^(?:\s|\u00A0)*#{1,6}(?:\s|\u00A0)+.*/.test(text)) {
      const hexID = generateHexID();
      const hashCount = (text.match(/#/g) || []).length;
      const content = text.replace(/^(?:\s|\u00A0)*#{1,6}(?:\s|\u00A0)*/, '').trim() || '\u00A0';
      
      const heading = document.createElement(`h${Math.min(hashCount, 6)}`);
      heading.id = `heading_${hexID}`;
      
      // Process inline markdown in heading content
      if (content !== '\u00A0' && hasMarkdownPattern(content)) {
        processMarkdownInText(content, heading);
      } else {
        heading.textContent = content;
      }

      section.replaceChild(heading, lineEl);
      const newP = createParagraph();
      section.appendChild(newP);

      placeCaretAtEnd(heading);
      return true;
    }

    const unorderedListMatch = text.match(/^[\*\-\+]\s(.*)/);
    const orderedListMatch = text.match(/^\d+\.\s(.*)/);

    if (unorderedListMatch || orderedListMatch) {
      const hexID = generateHexID();
      const isOrdered = !!orderedListMatch;
      const listType = isOrdered ? 'ol' : 'ul';
      const content = isOrdered ? orderedListMatch[1] : unorderedListMatch[1];

      const list = document.createElement(listType);
      list.id = `${listType}_${hexID}`;
      const li = document.createElement('li');
      li.id = `li_${generateHexID()}`;
      
      // Process inline markdown in list item content
      if (content && hasMarkdownPattern(content)) {
        processMarkdownInText(content, li);
      } else {
        li.textContent = content;
      }

      list.appendChild(li);
      section.replaceChild(list, lineEl);
      const newP = createParagraph();
      section.appendChild(newP);

      placeCaretAtEnd(li);
      return true;
    }

    const blockquoteMatch = text.match(/^>\s(.*)/);
    if (blockquoteMatch) {
      const hexID = generateHexID();
      const content = blockquoteMatch[1];
      const blockquote = document.createElement('blockquote');
      blockquote.id = `blockquote_${hexID}`;
      
      // Process inline markdown in blockquote content
      if (content && hasMarkdownPattern(content)) {
        processMarkdownInText(content, blockquote);
      } else {
        blockquote.textContent = content;
      }

      section.replaceChild(blockquote, lineEl);
      const newP = createParagraph();
      section.appendChild(newP);

      placeCaretAtEnd(blockquote);
      return true;
    }
  }

  return false;
}


const stylePatterns = [
  { regex: /\*\*(.+?)\*\*/g, tag: 'span', className: 'bold' },
  { regex: /(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, tag: 'span', className: 'italic' },
  { regex: /__(.+?)__/g, tag: 'span', className: 'underline' },
  { regex: /(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, tag: 'span', className: 'italic' },
  { regex: /~~(.+?)~~/g, tag: 'span', className: 'strike' },
  { regex: /==(.+?)==/g, tag: 'span', className: 'mark' },
  { regex: /`([^`\n]+?)`/g, tag: 'span', className: 'code-inline' }
];

function hasMarkdownPattern(text) {
  const patterns = [
    /\*\*(.+?)\*\*/g,
    /(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g,
    /__(.+?)__/g,
    /(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g,
    /~~(.+?)~~/g,
    /==(.+?)==/g,
    /`([^`\n]+?)`/g
  ];
  return patterns.some(pattern => pattern.test(text));
}


function processMarkdownInText(text, parentNode, replaceNode = null) {
  if (!text || !hasMarkdownPattern(text)) return { addedTrailingSpan: false };

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
    if (!parentNode.querySelector('span.default-text')) {
      const defaultSpan = document.createElement('span');
      defaultSpan.className = 'default-text';
      defaultSpan.id = `span_${generateHexID()}`;
      defaultSpan.textContent = text;
      parentNode.innerHTML = '';
      parentNode.appendChild(defaultSpan);
    }
    return { addedTrailingSpan: false };
  }

  allMatches.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return a.priority - b.priority;
  });

  const validMatches = [];
  for (const match of allMatches) {
    const hasOverlap = validMatches.some(existing =>
      (match.start < existing.end && match.end > existing.start)
    );
    if (!hasOverlap) {
      validMatches.push(match);
    }
  }

  const fragment = document.createDocumentFragment();
  let lastIndex = 0;
  let lastTrailingSpan = null;

  for (const match of validMatches) {
    // Add text before the match
    if (match.start > lastIndex) {
      const beforeText = text.substring(lastIndex, match.start);
      if (beforeText) {
        const defaultSpan = document.createElement('span');
        defaultSpan.className = 'default-text';
        defaultSpan.id = `span_${generateHexID()}`;
        defaultSpan.textContent = beforeText;
        fragment.appendChild(defaultSpan);
      }
    }

    // Create the styled span
    const styledSpan = document.createElement(match.tag);
    styledSpan.className = match.className;
    styledSpan.id = `span_${generateHexID()}`;
    styledSpan.textContent = match.content;
    fragment.appendChild(styledSpan);

    lastIndex = match.end;
  }

  // Handle remaining text after the last match
  const remainingText = text.substring(lastIndex);
  let addedTrailingSpan = false;
  
  if (remainingText) {
    // Create a span for remaining text
    const remainingSpan = document.createElement('span');
    remainingSpan.className = 'default-text';
    remainingSpan.id = `span_${generateHexID()}`;
    remainingSpan.textContent = remainingText;
    fragment.appendChild(remainingSpan);
  }

  // Always create a trailing span at the end for easy typing
  const finalTrailingSpan = document.createElement('span');
  finalTrailingSpan.className = 'default-text';
  finalTrailingSpan.id = `span_${generateHexID()}`;
  finalTrailingSpan.innerHTML = ' ';
  fragment.appendChild(finalTrailingSpan);
  lastTrailingSpan = finalTrailingSpan;
  addedTrailingSpan = true;

  if (replaceNode) {
    // Replace specific span
    parentNode.insertBefore(fragment, replaceNode);
    parentNode.removeChild(replaceNode);
  } else {
    // Replace entire line content
    parentNode.innerHTML = '';
    parentNode.appendChild(fragment);
  }

  // Always place caret in the last trailing span
  if (lastTrailingSpan) {
    setTimeout(() => {
      placeCaretAtEnd(lastTrailingSpan);
    }, 0);
  }

  return { addedTrailingSpan };
}

function processEntireLineContent(node) {
  const existingStyledSpans = node.querySelectorAll('span:not(.default-text)');
  const allSpans = Array.from(node.querySelectorAll('span'));

  if (existingStyledSpans.length > 0) {
    let hasChanges = false;
    let addedTrailingSpan = false;

    for (const span of allSpans) {
      if (span.classList.contains('default-text')) {
        const spanText = span.textContent;
        if (spanText && hasMarkdownPattern(spanText)) {
          const result = processMarkdownInText(spanText, span.parentNode, span);
          if (result && result.addedTrailingSpan) {
            addedTrailingSpan = true;
          }
          hasChanges = true;
        }
      }
    }
    if (hasChanges) {
      cleanupEmptySpans(node);
    }
    return { addedTrailingSpan };
  }

  const lineText = node.textContent;
  if (!lineText) return { addedTrailingSpan: false };

  return processMarkdownInText(lineText, node);
}

function cleanupEmptySpans(node) {
  const spans = node.querySelectorAll('span');
  for (const span of spans) {
    if (span.textContent === '' || span.textContent === '\u200B') {
      span.remove();
    }
  }
  if (node.tagName === 'P' && !node.querySelector('span')) {
    const defaultSpan = document.createElement('span');
    defaultSpan.className = 'default-text';
    defaultSpan.innerHTML = '\u00A0';
    node.appendChild(defaultSpan);
  }
}

function updateCodeBlockClasses(codeElement) {
  if (!codeElement) return;

  if (codeElement.dataset.highlighted) {
    delete codeElement.dataset.highlighted;
  }

  const result = hljs.highlightAuto(codeElement.textContent);

  codeElement.className = 'code_block hljs';

  if (result.language) {
    codeElement.classList.add(`language-${result.language}`);
    codeElement.dataset.detectedLanguage = result.language;
  }

  codeElement.innerHTML = result.value;
}

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

  range.selectNodeContents(codeElement);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

function removeDefaultTextIfPresent(element) {
  const defaultSpan = element.querySelector('.default-text-not-editable');
  if (defaultSpan) {
    defaultSpan.remove();
    if (element.textContent === '' || !element.querySelector('span')) {
      const newSpan = document.createElement('span');
      newSpan.className = 'default-text';
      newSpan.innerHTML = '\u00A0';
      element.innerHTML = '';
      element.appendChild(newSpan);
    }
  }
}

if (editor.children.length === 0 || editor.textContent.trim() === '') {
  editor.innerHTML = '';
  const initialSection = createSection();
  editor.appendChild(initialSection);
  placeCaretAtStart(initialSection.querySelector('p'));
} else {
  if (!editor.querySelector('section')) {
    const initialSection = createSection();
    editor.appendChild(initialSection);
    placeCaretAtStart(initialSection.querySelector('p'));
  }
}

editor.addEventListener('input', (e) => {
  const sel = window.getSelection();
  const range = sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
  const currentLine = getCurrentLineElement();

  if (!currentLine || !range) return;

  if (currentLine.tagName === 'H1' || currentLine.tagName === 'P') {
    removeDefaultTextIfPresent(currentLine);
  }

  if (currentLine.tagName === 'P') {
    const currentNode = range.startContainer;

    if (currentNode === currentLine) {
      let targetSpan = currentLine.querySelector('span');
      if (!targetSpan) {
        targetSpan = document.createElement('span');
        targetSpan.className = 'default-text';
        targetSpan.innerHTML = ' ';
        currentLine.appendChild(targetSpan);
      }
      placeCaretAtEnd(targetSpan);
      return;
    }

    if (currentNode.nodeType === Node.TEXT_NODE && currentNode.parentNode === currentLine) {
      const span = document.createElement('span');
      span.className = 'default-text';
      currentNode.parentNode.insertBefore(span, currentNode);
      span.appendChild(currentNode);
      const newRange = document.createRange();
      newRange.setStart(currentNode, range.startOffset);
      newRange.collapse(true);
      sel.removeAllRananges();
      sel.addRange(newRange);
    }

    setTimeout(() => {
      cleanupEmptySpans(currentLine);
    }, 0);
  }

  if (e.inputType === 'insertText' && e.data === ' ') {
    const hasStyledContent = currentLine.querySelector('span[class]:not(.default-text)');
    if (currentLine.tagName === 'P' && !hasStyledContent && handleBlockFormatting(currentLine)) {
      return;
    }
  }

  // Process inline markdown for all supported block elements
  if (currentLine.tagName === 'H1' || currentLine.tagName === 'H2' || currentLine.tagName === 'H3' || 
      currentLine.tagName === 'H4' || currentLine.tagName === 'H5' || currentLine.tagName === 'H6' || 
      currentLine.tagName === 'P' || currentLine.tagName === 'BLOCKQUOTE' || currentLine.tagName === 'LI') {
    
    if (currentLine.querySelector('.default-text-not-editable')) {
      return;
    }

    let cursorPosition = 0;
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

    const styleResult = processEntireLineContent(currentLine);

    if (styleResult && styleResult.addedTrailingSpan) {
      const spans = currentLine.querySelectorAll('span.default-text');
      const lastDefaultSpan = spans[spans.length - 1];
      if (
        lastDefaultSpan &&
        (
          lastDefaultSpan.innerHTML === '&nbsp;' ||
          lastDefaultSpan.textContent === '\u00A0' ||
          lastDefaultSpan.textContent === '\u200B' ||
          lastDefaultSpan.textContent === ''        ||
          lastDefaultSpan.textContent === ' ' ||
          lastDefaultSpan.textContent.trim() === '' 
        )
      ) {
        setTimeout(() => {
          placeCaretAtStart(lastDefaultSpan);
        }, 0);
        return;
      }
    }

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
      placeCaretAtEnd(currentLine);
    } catch (err) {
      console.warn("Error restoring cursor position:", err);
      placeCaretAtEnd(currentLine);
    }
  } else if (currentLine.tagName === 'PRE') {
    const codeEl = currentLine.querySelector('code');
    if (codeEl) {
      const cursorPos = getCursorPositionInCodeBlock(codeEl);
      updateCodeBlockClasses(codeEl);
      restoreCursorPositionInCodeBlock(codeEl, cursorPos);
    }
  }
});


editor.addEventListener('keydown', (e) => {
  const sel = window.getSelection();
  const range = sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
  let currentLine = getCurrentLineElement();

  if (currentLine && (currentLine.tagName === 'H1' || currentLine.tagName === 'H2' || 
      currentLine.tagName === 'H3' || currentLine.tagName === 'H4' || currentLine.tagName === 'H5' || 
      currentLine.tagName === 'H6' || currentLine.tagName === 'P' || currentLine.tagName === 'BLOCKQUOTE') &&
      (e.key.length === 1 || e.key === 'Enter' || e.key === 'Backspace')) {
    removeDefaultTextIfPresent(currentLine);
  }

  // Handle span creation for paragraph elements
  if (currentLine && currentLine.tagName === 'P' && e.key.length === 1) {
    const currentNode = range.startContainer;

    if (currentNode === currentLine) {
      let targetSpan = currentLine.querySelector('span.default-text');
      if (!targetSpan) {
        targetSpan = document.createElement('span');
        targetSpan.className = 'default-text';
        currentLine.appendChild(targetSpan);
      }
      placeCaretAtStart(targetSpan);
      return;
    }
  }

  if (e.key === 'Backspace') {
    if (currentLine && currentLine.tagName === 'P') {
      const hasContent = currentLine.textContent.trim() !== '' &&
        currentLine.textContent !== '\u00A0' &&
        currentLine.textContent !== '\u200B';

      if (!hasContent) {
        e.preventDefault();
        return;
      }

      setTimeout(() => {
        const spans = currentLine.querySelectorAll('span');
        for (const span of spans) {
          if (span.textContent === '' || span.textContent === '\u200B') {
            span.remove();
          }
        }

        if (!currentLine.querySelector('span')) {
          const defaultSpan = document.createElement('span');
          defaultSpan.className = 'default-text';
          defaultSpan.innerHTML = '\u00A0';
          currentLine.appendChild(defaultSpan);
          placeCaretAtStart(defaultSpan);
        }
      }, 0);

      return;
    }

    if (currentLine && (currentLine.tagName == "H1" || currentLine.tagName === 'H2' || currentLine.tagName === 'H3' || 
    currentLine.tagName === 'H4' || currentLine.tagName === 'H5' || currentLine.tagName === 'H6')) {
  const isEmpty = currentLine.textContent.trim() === '' || currentLine.textContent === '\u00A0';
  
  if (isEmpty) {
    e.preventDefault();
    
    const section = currentLine.closest('section');
    const paragraphs = section.querySelectorAll('p');
    
    currentLine.remove();
    
    if (paragraphs.length > 0) {
      const lastP = paragraphs[paragraphs.length - 1];

      const defaultSpans = lastP.querySelectorAll('span.default-text:not(.default-text-not-editable)');
      
      if (defaultSpans.length > 0) {
        const lastDefaultSpan = defaultSpans[defaultSpans.length - 1];
        placeCaretAtEnd(lastDefaultSpan);
      } else {

        const newSpan = document.createElement('span');
        newSpan.className = 'default-text';
        newSpan.innerHTML = '\u00A0';
        lastP.appendChild(newSpan);
        placeCaretAtEnd(newSpan);
      }
    } else {
      const newP = createParagraph();
      section.appendChild(newP);
      placeCaretAtStart(newP);
    }
    return;
  }
  return;
}

    if (currentLine && currentLine.tagName === 'LI') {
      const parentList = currentLine.parentElement;
      if (!parentList || (parentList.tagName !== 'UL' && parentList.tagName !== 'OL')) return;

      const isEmpty = currentLine.textContent.trim() === '';
      const isCaretAtStart = sel.isCollapsed && sel.anchorOffset === 0 && 
        (sel.anchorNode === currentLine || sel.anchorNode === currentLine.firstChild);

      if (isEmpty || isCaretAtStart) {
        e.preventDefault();

        // Check if this is a nested list (parent list is inside another LI)
        const grandParentLi = parentList.parentElement;
        const isNested = grandParentLi && grandParentLi.tagName === 'LI';

        if (isEmpty) {
          // Remove the empty list item
          const nextLi = currentLine.nextElementSibling;
          const prevLi = currentLine.previousElementSibling;
          
          currentLine.remove();
          
          // If this was the last item in a nested list, remove the list too
          if (parentList.children.length === 0 && isNested) {
            parentList.remove();
            placeCaretAtEnd(grandParentLi);
          } else if (parentList.children.length === 0) {
            // If this was the last item in a top-level list
            const section = parentList.closest('section');
            const newP = createParagraph();
            parentList.remove();
            section.appendChild(newP);
            placeCaretAtStart(newP);
          } else {
            // Move focus to next or previous item
            if (nextLi) {
              placeCaretAtStart(nextLi);
            } else if (prevLi) {
              placeCaretAtEnd(prevLi);
            }
          }
        } else {
          // Not empty but caret is at start - un-indent the item
          if (isNested) {
            // Move this LI out of the nested list
            const nextSibling = grandParentLi.nextElementSibling;
            const grandParentList = grandParentLi.parentElement;
            
            // Remove from current nested list
            currentLine.remove();
            
            // If nested list is now empty, remove it
            if (parentList.children.length === 0) {
              parentList.remove();
            }
            
            // Insert after the parent LI
            if (nextSibling) {
              grandParentList.insertBefore(currentLine, nextSibling);
            } else {
              grandParentList.appendChild(currentLine);
            }
            
            placeCaretAtStart(currentLine);
          } else {
            // Top-level list item - convert to paragraph
            const section = parentList.closest('section');
            const newP = createParagraph();
            
            // Copy content to new paragraph
            if (currentLine.textContent.trim()) {
              newP.textContent = currentLine.textContent;
            }
            
            currentLine.remove();
            
            // If list is now empty, remove it
            if (parentList.children.length === 0) {
              parentList.remove();
            }
            
            section.appendChild(newP);
            placeCaretAtStart(newP);
          }
        }
        return;
      }
      return;
    }

    if (currentLine && currentLine.tagName === 'PRE') {
      const codeEl = currentLine.querySelector('code');
      const selectedContent = sel.toString();

      if (codeEl && selectedContent === codeEl.textContent && selectedContent.length > 0) {
        e.preventDefault();
        codeEl.textContent = '';
        placeCaretAtStart(codeEl);
        updateCodeBlockClasses(codeEl);
        return;
      }

      const isCaretAtStart = sel.isCollapsed && sel.anchorOffset === 0 &&
        (sel.anchorNode === codeEl || sel.anchorNode === codeEl.firstChild);
      const isCodeEmpty = codeEl.textContent.trim() === '';

      if (isCaretAtStart && isCodeEmpty) {
        e.preventDefault();
        const section = currentLine.closest('section');
        const newP = createParagraph();
        section.replaceChild(newP, currentLine);
        placeCaretAtStart(newP);
        return;
      }
      return;
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

    if (currentLine.tagName === 'H1') {
      const section = currentLine.parentNode;
      const newP = createParagraph();
      section.appendChild(newP);
      placeCaretAtStart(newP);
      return;
    }

    if (currentLine.tagName === 'P') {
      const section = currentLine.parentNode;
      const newP = createParagraph();

      const remainingContents = range.extractContents();
      if (remainingContents.hasChildNodes()) {
        newP.innerHTML = '';
        newP.appendChild(remainingContents);
      }

      section.insertBefore(newP, currentLine.nextSibling);
      placeCaretAtStart(newP);
      return;
    }

    if (currentLine.tagName === 'LI') {
      const parentList = currentLine.parentNode;
      const isCaretAtStart = range.startOffset === 0 && 
        (range.startContainer === currentLine || range.startContainer === currentLine.firstChild);
      const isLiEmpty = currentLine.textContent.trim() === '';

      if (isLiEmpty) {
        // Empty list item - exit the list
        const section = parentList.closest('section');
        const newP = createParagraph();
        
        // Remove the empty list item
        currentLine.remove();
        
        // Check if this was a nested list
        const grandParentLi = parentList.parentElement;
        const isNested = grandParentLi && grandParentLi.tagName === 'LI';
        
        if (parentList.children.length === 0) {
          // List is now empty, remove it
          if (isNested) {
            parentList.remove();
            // Insert the new paragraph after the parent LI
            const grandParentList = grandParentLi.parentElement;
            const nextSibling = grandParentLi.nextElementSibling;
            if (nextSibling) {
              grandParentList.insertBefore(newP, nextSibling);
            } else {
              section.appendChild(newP);
            }
          } else {
            parentList.remove();
            section.appendChild(newP);
          }
        } else {
          // List still has items, insert paragraph after the list
          if (isNested) {
            // For nested lists, insert after the parent LI
            const grandParentList = grandParentLi.parentElement;
            const nextSibling = grandParentLi.nextElementSibling;
            if (nextSibling) {
              grandParentList.insertBefore(newP, nextSibling);
            } else {
              section.appendChild(newP);
            }
          } else {
            const nextSibling = parentList.nextElementSibling;
            if (nextSibling) {
              section.insertBefore(newP, nextSibling);
            } else {
              section.appendChild(newP);
            }
          }
        }
        
        placeCaretAtStart(newP);
        enterPressCount = 0;
      } else {
        // List item has content - create new list item or exit on double enter
        if (enterPressCount >= 2 && isCaretAtStart) {
          // Double enter at start of non-empty item - exit list
          const section = parentList.closest('section');
          const newP = createParagraph();
          
          // Copy current item content to paragraph
          if (currentLine.innerHTML) {
            newP.innerHTML = currentLine.innerHTML;
          }
          
          currentLine.remove();
          
          // Check if list is now empty
          const grandParentLi = parentList.parentElement;
          const isNested = grandParentLi && grandParentLi.tagName === 'LI';
          
          if (parentList.children.length === 0) {
            if (isNested) {
              parentList.remove();
              const grandParentList = grandParentLi.parentElement;
              const nextSibling = grandParentLi.nextElementSibling;
              if (nextSibling) {
                grandParentList.insertBefore(newP, nextSibling);
              } else {
                section.appendChild(newP);
              }
            } else {
              parentList.remove();
              section.appendChild(newP);
            }
          } else {
            if (isNested) {
              const grandParentList = grandParentLi.parentElement;
              const nextSibling = grandParentLi.nextElementSibling;
              if (nextSibling) {
                grandParentList.insertBefore(newP, nextSibling);
              } else {
                section.appendChild(newP);
              }
            } else {
              const nextSibling = parentList.nextElementSibling;
              if (nextSibling) {
                section.insertBefore(newP, nextSibling);
              } else {
                section.appendChild(newP);
              }
            }
          }
          
          placeCaretAtStart(newP);
          enterPressCount = 0;
        } else {
          // Normal enter - create new list item
          const newLi = document.createElement('li');
          newLi.id = `li_${generateHexID()}`;
          
          const remainingContents = range.extractContents();
          if (remainingContents.hasChildNodes()) {
            newLi.appendChild(remainingContents);
          } else {
            const defaultSpan = document.createElement('span');
            defaultSpan.className = 'default-text';
            defaultSpan.innerHTML = '\u00A0';
            newLi.appendChild(defaultSpan);
          }
          
          parentList.insertBefore(newLi, currentLine.nextSibling);
          placeCaretAtStart(newLi);
          enterPressCount = 0;
        }
      }
    } else if (currentLine.tagName === 'PRE') {
      const codeEl = currentLine.querySelector('code');
      if (codeEl) {
        if (e.shiftKey) {
          e.preventDefault();
          const range = sel.getRangeAt(0);

          const cursorPos = getCursorPositionInCodeBlock(codeEl);

          const textNode = document.createTextNode('\n');
          range.insertNode(textNode);

          updateCodeBlockClasses(codeEl);

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
    } else {
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
  } else {
    enterPressCount = 0;
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