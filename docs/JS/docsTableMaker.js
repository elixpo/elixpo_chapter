

function handleTableCellBlockStyle(cell, elementType) {
    const existingList = cell.querySelector('ul,ol');

    // Utility functions
    const createDefaultSpan = (text = '\u00A0') => {
        const span = document.createElement('span');
        span.className = 'default-text';
        span.id = `span_${generateHexID()}`;
        span.textContent = text;
        return span;
    };

    const convertListToSpans = (list) => {
        const lis = Array.from(list.querySelectorAll('li'));
        cell.removeChild(list);
        
        lis.forEach(li => {
            const textSpan = li.querySelector('.default-text');
            const text = textSpan ? textSpan.textContent : li.textContent.replace(/^-\s*/, '');
            cell.appendChild(createDefaultSpan(text.trim() || '\u00A0'));
        });
        
        if (cell.lastElementChild) {
            placeCaretAtEnd(cell.lastElementChild);
        }
    };

    const convertListType = (list, toType) => {
        const newList = document.createElement(toType);
        newList.className = 'markdown-table-list';
        
        Array.from(list.children).forEach(li => {
            const newLi = document.createElement('li');
            newLi.className = 'markdown-table-li';
            
            const textSpan = li.querySelector('.default-text');
            const text = textSpan ? textSpan.textContent : li.textContent.replace(/^-\s*/, '');
            
            if (toType === 'ul') {
                newLi.innerHTML = `<span class="list-bullet">- </span><span class="default-text" contenteditable="true">${text}</span>`;
            } else {
                newLi.innerHTML = `<span class="default-text" contenteditable="true">${text}</span>`;
            }
            
            newList.appendChild(newLi);
        });
        
        cell.replaceChild(newList, list);
        const firstTextSpan = newList.querySelector('.default-text');
        if (firstTextSpan) placeCaretAtEnd(firstTextSpan);
    };

    const createListFromCell = (toType) => {
        const cellText = cell.textContent.trim();
        cell.innerHTML = '';
        
        const list = document.createElement(toType);
        list.className = 'markdown-table-list';
        
        const li = document.createElement('li');
        li.className = 'markdown-table-li';
        
        if (toType === 'ul') {
            li.innerHTML = `<span class="list-bullet">- </span><span class="default-text" contenteditable="true">${cellText || '\u00A0'}</span>`;
        } else {
            li.innerHTML = `<span class="default-text" contenteditable="true">${cellText || '\u00A0'}</span>`;
        }
        
        list.appendChild(li);
        cell.appendChild(list);
        placeCaretAtEnd(li.querySelector('.default-text'));
    };

    // Main logic
    if (elementType === "UL") {
        if (existingList) {
            if (existingList.tagName === 'UL') {
                convertListToSpans(existingList);
            } else {
                convertListType(existingList, 'ul');
            }
        } else {
            createListFromCell('ul');
        }
    } else if (elementType === "OL") {
        if (existingList) {
            if (existingList.tagName === 'OL') {
                convertListToSpans(existingList);
            } else {
                convertListType(existingList, 'ol');
            }
        } else {
            createListFromCell('ol');
        }
    }

    attachTableCellListeners(cell);
}

// Optimized table cell listeners
function attachTableCellListeners(cell) {
  // Remove existing listeners
  cell.oninput = null;
  cell.onkeydown = null;

  cell.addEventListener('input', () => {
    const cellText = cell.textContent;

    if (/^(?:\s|\u00A0)*-\s/.test(cellText)) {
      handleTableCellBullet(cell, false);
      return;
    }
    if (/^(?:\s|\u00A0)*\d+\.\s/.test(cellText)) {
      handleTableCellBullet(cell, true);
      return;
    }

    // Inline markdown for normal text
    processInlineMarkdown(cell);
  });

  cell.addEventListener('keydown', (e) => {
    // Shift+Enter: insert new row
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      insertTableRow(cell);
      return;
    }

    // Handle Enter tracking
    if (e.key === 'Enter') {
      const now = Date.now();
      enterCount = (now - lastEnterTime < 500) ? enterCount + 1 : 1;
      lastEnterTime = now;

      const list = cell.querySelector('ul,ol');
      const activeEl = document.activeElement;

      if (list && activeEl && activeEl.closest('li')) {
        // In list
        if (enterCount === 2) {
          e.preventDefault();
          exitListMode(cell);
          return;
        }
        // Normal Enter: add new LI
        e.preventDefault();
        addNewListItem(list);
        return;
      } else if (enterCount === 2) {
        // Double Enter outside list: move caret outside table
        e.preventDefault();
        moveCaretOutsideTable(cell);
        return;
      }
    }
  });

  // Initialize with default span if empty
  if (!cell.querySelector('span,ul,ol')) {
    const defaultSpan = createDefaultSpan();
    cell.appendChild(defaultSpan);
  }
}

// Helper functions for list management
function exitListMode(cell) {
  cell.innerHTML = '';
  const newSpan = createDefaultSpan();
  cell.appendChild(newSpan);
  placeCaretAtStart(newSpan);
  attachTableCellListeners(cell);
  enterCount = 0;
}

function addNewListItem(list) {
  const newLi = createListLi();
  list.appendChild(newLi);
  placeCaretAtStart(newLi.querySelector('.default-text'));
}

function createDefaultSpan(text = '\u00A0') {
  const span = document.createElement('span');
  span.className = 'default-text';
  span.id = `span_${generateHexID()}`;
  span.textContent = text;
  return span;
}

function moveCaretOutsideTable(cell) {
  const table = cell.closest('table');
  if (!table) return;
  
  // Find next paragraph after table or create one
  let nextP = table.nextElementSibling;
  if (!nextP || nextP.tagName !== 'P') {
    nextP = createParagraph();
    table.parentNode.insertBefore(nextP, table.nextSibling);
  }
  
  placeCaretAtStart(nextP);
  enterCount = 0;
}

function insertTableRow(cell) {
  const tr = cell.closest('tr');
  const table = tr.closest('table');
  if (!tr || !table) return;

  const newRow = tr.cloneNode(true);
  // Clear content in new row
  Array.from(newRow.cells).forEach(td => {
    td.innerHTML = '';
    const span = createDefaultSpan();
    td.appendChild(span);
    attachTableCellListeners(td);
  });

  table.tBodies[0].insertBefore(newRow, tr.nextSibling);
  placeCaretAtStart(newRow.cells[0].querySelector('span'));
}