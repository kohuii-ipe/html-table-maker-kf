const tableBuilder = {
    table: null,
    selectedCells: [],
    isSelecting: false,
    selectionStart: null,
    isDragging: false,
    dragGhost: null,
    mouseDownPos: null,
    dragThreshold: 5, // pixels to move before starting drag
    borderThreshold: 8, // pixels from edge to consider as border
    isOnBorder: false,
    history: [],
    historyIndex: -1,
    maxHistory: 50,
    isApplyingHistory: false,
    debounceTimer: null,
    // New properties for supporting all table tags
    caption: '',
    sections: { thead: [], tbody: [], tfoot: [] },
    columnGroups: [],
    // Tag attributes
    tableAttributes: { class: '', style: '', id: '', border: '', cellspacing: '', cellpadding: '', width: '' },
    captionAttributes: { class: '', style: '', id: '' },
    sectionAttributes: {
        thead: { class: '', style: '', id: '' },
        tbody: { class: '', style: '', id: '' },
        tfoot: { class: '', style: '', id: '' }
    },
    rowAttributes: {}, // Will store by row index
    patterns: {}, // Will store attribute patterns

    init() {
        this.table = document.getElementById('editorTable');
        this.initializeSections();
        this.setupEventListeners();
        this.setupKeyboardShortcuts();
        this.loadFromStorage();
        this.loadPatterns(); // Load saved patterns
        this.saveHistory(); // Save initial state
        this.updateCode();
    },

    initializeSections() {
        // Initialize all current rows as tbody by default
        this.sections = { thead: [], tbody: [], tfoot: [] };
        for (let i = 0; i < this.table.rows.length; i++) {
            this.sections.tbody.push(i);
            this.table.rows[i].setAttribute('data-section', 'tbody');
        }
    },

    isMouseOnCellBorder(e, cell) {
        const rect = cell.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const threshold = this.borderThreshold;

        // Check if mouse is near any edge
        const nearLeft = x < threshold;
        const nearRight = x > rect.width - threshold;
        const nearTop = y < threshold;
        const nearBottom = y > rect.height - threshold;

        return nearLeft || nearRight || nearTop || nearBottom;
    },

    setupEventListeners() {
        // Mouse out - remove border class
        this.table.addEventListener('mouseout', (e) => {
            if (e.target.tagName === 'TD') {
                e.target.classList.remove('on-border');
            }
        });

        // Mouse down - record position
        this.table.addEventListener('mousedown', (e) => {
            if (e.target.tagName === 'TD') {
                // Check if clicking on border
                const onBorder = this.isMouseOnCellBorder(e, e.target);

                // Record mouse position and border status
                this.mouseDownPos = {
                    x: e.clientX,
                    y: e.clientY,
                    target: e.target,
                    onBorder: onBorder
                };

                const isHtmlEditorOpen = document.getElementById('htmlEditorPanel').classList.contains('active');

                // If clicking on border of selected cell(s), prepare for drag
                if (onBorder && e.target.classList.contains('selected') && this.selectedCells.length > 0) {
                    e.preventDefault();
                    return;
                }

                // If not on border, handle selection
                if (!onBorder) {
                    // Handle Ctrl/Cmd + Click for multi-select
                    if (e.ctrlKey || e.metaKey) {
                        this.toggleCellSelection(e.target);
                        if (isHtmlEditorOpen && this.selectedCells.length > 1) {
                            this.closeHtmlEditor();
                        }
                        e.preventDefault();
                    }
                    // Single click will be handled in mouseup if not dragging
                } else {
                    // On border - prevent default to avoid text selection
                    e.preventDefault();
                }
            }
        });

        // Mouse move - handle dragging and selection while mouse is down
        this.table.addEventListener('mousemove', (e) => {
            if (!this.mouseDownPos || e.buttons !== 1) {
                // Update cursor when not dragging
                if (e.target.tagName === 'TD' && !this.isDragging) {
                    const onBorder = this.isMouseOnCellBorder(e, e.target);
                    if (onBorder) {
                        e.target.classList.add('on-border');
                    } else {
                        e.target.classList.remove('on-border');
                    }
                }
                return;
            }

            const distance = Math.sqrt(
                Math.pow(e.clientX - this.mouseDownPos.x, 2) +
                Math.pow(e.clientY - this.mouseDownPos.y, 2)
            );

            // Check if we've moved beyond the threshold
            if (distance > this.dragThreshold) {
                const isHtmlEditorOpen = document.getElementById('htmlEditorPanel').classList.contains('active');
                const startCell = this.mouseDownPos.target;

                // Start drag-select if not already selecting or dragging
                if (!this.isSelecting && !this.isDragging) {
                    // Only allow dragging if mousedown was on border
                    if (this.mouseDownPos.onBorder && startCell.classList.contains('selected') && this.selectedCells.length > 0) {
                        // Start dragging existing selection
                        this.isDragging = true;
                        this.selectedCells.forEach(cell => {
                            cell.classList.add('dragging');
                            cell.classList.remove('on-border');
                        });
                        this.createDragGhost(e);
                    } else if (!this.mouseDownPos.onBorder && !(e.ctrlKey || e.metaKey)) {
                        // Start drag-select (only if not on border)
                        this.isSelecting = true;
                        this.selectionStart = startCell;
                        this.clearSelection();
                        this.selectCell(startCell);

                        if (isHtmlEditorOpen) {
                            this.updateHtmlEditorContent(startCell);
                        }
                    }
                }

                // Continue drag-select
                if (this.isSelecting && e.target.tagName === 'TD') {
                    this.extendSelection(this.selectionStart, e.target);
                }

                // Update drag ghost position
                if (this.isDragging && this.dragGhost) {
                    this.dragGhost.style.left = e.pageX + 10 + 'px';
                    this.dragGhost.style.top = e.pageY + 10 + 'px';
                }
            }
        });

        // Mouse up - end selection or drop
        document.addEventListener('mouseup', (e) => {
            // Handle simple click (no drag)
            if (this.mouseDownPos && !this.isSelecting && !this.isDragging) {
                const distance = Math.sqrt(
                    Math.pow(e.clientX - this.mouseDownPos.x, 2) +
                    Math.pow(e.clientY - this.mouseDownPos.y, 2)
                );

                // It was just a click, not a drag
                if (distance <= this.dragThreshold && this.mouseDownPos.target.tagName === 'TD') {
                    const isHtmlEditorOpen = document.getElementById('htmlEditorPanel').classList.contains('active');

                    // Single select on click only if not on border and not Ctrl-clicking
                    if (!this.mouseDownPos.onBorder && !(e.ctrlKey || e.metaKey)) {
                        this.clearSelection();
                        this.selectCell(this.mouseDownPos.target);

                        if (isHtmlEditorOpen) {
                            this.updateHtmlEditorContent(this.mouseDownPos.target);
                        }
                    }
                }
            }

            if (this.isSelecting) {
                this.isSelecting = false;
                this.selectionStart = null;
            }
            if (this.isDragging) {
                this.handleDrop(e);
                this.isDragging = false;
                this.selectedCells.forEach(cell => cell.classList.remove('dragging'));
                if (this.dragGhost) {
                    this.dragGhost.remove();
                    this.dragGhost = null;
                }
            }

            // Clean up on-border class
            this.table.querySelectorAll('.on-border').forEach(cell => {
                cell.classList.remove('on-border');
            });

            this.mouseDownPos = null;
        });

        // Mouse enter - highlight drop target area
        this.table.addEventListener('mouseover', (e) => {
            if (this.isDragging && e.target.tagName === 'TD' && !e.target.classList.contains('selected')) {
                // Remove previous highlights
                this.table.querySelectorAll('.drag-over').forEach(cell => {
                    cell.classList.remove('drag-over');
                });

                // Highlight the entire target area
                this.highlightDropArea(e.target);
            }
        });

        // Mouse leave - remove drop highlight
        this.table.addEventListener('mouseout', (e) => {
            if (e.target.tagName === 'TD') {
                e.target.classList.remove('drag-over');
            }
        });

        // Update code on any change with debounce
        this.table.addEventListener('input', () => this.debouncedUpdateCode());
        this.table.addEventListener('blur', () => this.debouncedUpdateCode(), true);

        // Paste event handler for pasting table data
        this.table.addEventListener('paste', (e) => this.handlePaste(e));

        // Touch event handlers for mobile devices
        this.setupTouchEvents();
    },

    setupTouchEvents() {
        let touchStartCell = null;
        let touchStartTime = 0;
        let longPressTimer = null;

        // Touch start - record the cell
        this.table.addEventListener('touchstart', (e) => {
            if (e.target.tagName === 'TD') {
                touchStartCell = e.target;
                touchStartTime = Date.now();

                // Long press to open context menu or multi-select
                longPressTimer = setTimeout(() => {
                    this.toggleCellSelection(e.target);
                    // Haptic feedback if available
                    if (navigator.vibrate) {
                        navigator.vibrate(50);
                    }
                }, 500);
            }
        }, { passive: true });

        // Touch move - cancel long press
        this.table.addEventListener('touchmove', (e) => {
            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }
        }, { passive: true });

        // Touch end - handle tap
        this.table.addEventListener('touchend', (e) => {
            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }

            if (touchStartCell && e.target.tagName === 'TD') {
                const touchDuration = Date.now() - touchStartTime;

                // Quick tap (less than 300ms) - single select
                if (touchDuration < 300) {
                    const isHtmlEditorOpen = document.getElementById('htmlEditorPanel').classList.contains('active');

                    this.clearSelection();
                    this.selectCell(touchStartCell);

                    if (isHtmlEditorOpen) {
                        this.updateHtmlEditorContent(touchStartCell);
                    }
                }
            }

            touchStartCell = null;
        }, { passive: true });
    },

    debounce(func, wait) {
        return (...args) => {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = setTimeout(() => func.apply(this, args), wait);
        };
    },

    debouncedUpdateCode() {
        if (!this.debounceTimer) {
            this.debounceTimer = setTimeout(() => {
                this.updateCode();
                this.debounceTimer = null;
            }, 300);
        }
    },

    sanitizeHTML(html) {
        // For TD/TH elements, wrap them in a table structure for proper parsing
        const isCellElement = html.trim().match(/^<(td|th)[\s>]/i);
        let htmlToParse = html;

        if (isCellElement) {
            htmlToParse = `<table><tr>${html}</tr></table>`;
        }

        // Parse it back
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlToParse, 'text/html');

        // Allowed tags for table cells (now includes all 10 table tags)
        const allowedTags = ['TD', 'TH', 'TABLE', 'TR', 'TBODY', 'THEAD', 'TFOOT', 'CAPTION', 'COLGROUP', 'COL', 'B', 'STRONG', 'I', 'EM', 'U', 'BR', 'SPAN', 'DIV', 'P', 'A', 'IMG'];

        // Remove script tags and event handlers
        const elements = doc.body.querySelectorAll('*');
        elements.forEach(el => {
            // Remove if not allowed tag
            if (!allowedTags.includes(el.tagName)) {
                el.remove();
                return;
            }

            // Remove event handler attributes only (allow all other attributes including data-*, aria-*, etc.)
            Array.from(el.attributes).forEach(attr => {
                // Only remove event handlers (attributes starting with 'on')
                if (attr.name.startsWith('on')) {
                    el.removeAttribute(attr.name);
                }
            });

            // Sanitize href to prevent javascript:
            if (el.hasAttribute('href')) {
                const href = el.getAttribute('href');
                if (href.toLowerCase().startsWith('javascript:')) {
                    el.removeAttribute('href');
                }
            }
        });

        // If it was a cell element, extract just the cell HTML
        if (isCellElement) {
            const cell = doc.querySelector('td, th');
            return cell ? cell.outerHTML : html;
        }

        return doc.body.innerHTML;
    },

    saveHistory() {
        if (this.isApplyingHistory) return;

        // Get current table state
        const state = this.table.innerHTML;

        // Don't save if it's the same as current
        if (this.history[this.historyIndex] === state) return;

        // Remove any future history if we're not at the end
        this.history = this.history.slice(0, this.historyIndex + 1);

        // Add new state
        this.history.push(state);

        // Limit history size
        if (this.history.length > this.maxHistory) {
            this.history.shift();
        } else {
            this.historyIndex++;
        }
    },

    undo() {
        if (this.historyIndex > 0) {
            this.historyIndex--;
            this.applyHistoryState();
            this.showToast('元に戻しました');
        } else {
            this.showToast('これ以上元に戻せません', 'error');
        }
    },

    redo() {
        if (this.historyIndex < this.history.length - 1) {
            this.historyIndex++;
            this.applyHistoryState();
            this.showToast('やり直しました');
        } else {
            this.showToast('これ以上やり直せません', 'error');
        }
    },

    applyHistoryState() {
        this.isApplyingHistory = true;
        this.table.innerHTML = this.history[this.historyIndex];
        this.clearSelection();
        this.updateCode();
        this.isApplyingHistory = false;
    },

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ctrl/Cmd + Z - Undo
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                this.undo();
            }

            // Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y - Redo
            if ((e.ctrlKey || e.metaKey) && ((e.key === 'z' && e.shiftKey) || e.key === 'y')) {
                e.preventDefault();
                this.redo();
            }

            // Delete or Backspace - Clear selected cell content
            if ((e.key === 'Delete' || e.key === 'Backspace') && this.selectedCells.length > 0) {
                const activeElement = document.activeElement;
                // Only clear if not currently editing a cell or textarea
                if ((activeElement.tagName !== 'TD' || !activeElement.isContentEditable) && activeElement.tagName !== 'TEXTAREA') {
                    e.preventDefault();
                    this.clearSelectedCellsContent();
                }
            }

            // Ctrl/Cmd + C - Copy cells (show message)
            if ((e.ctrlKey || e.metaKey) && e.key === 'c' && this.selectedCells.length > 0) {
                const activeElement = document.activeElement;
                if (activeElement.tagName !== 'TD') {
                    this.copyCells();
                }
            }

            // Arrow keys for navigation
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                if (this.selectedCells.length === 1 && document.activeElement.tagName !== 'TD') {
                    e.preventDefault();
                    this.navigateCell(e.key);
                }
            }
        });
    },

    clearSelectedCellsContent() {
        if (this.selectedCells.length === 0) return;

        this.selectedCells.forEach(cell => {
            cell.textContent = '';
        });

        this.updateCode();
        this.saveHistory();
        this.showToast(`${this.selectedCells.length}個のセルの内容をクリアしました`);
    },

    copyCells() {
        const contents = this.selectedCells.map(cell => cell.outerHTML).join('\n');
        navigator.clipboard.writeText(contents).then(() => {
            this.showToast('セルのHTMLをコピーしました');
        }).catch(() => {
            this.showToast('コピーに失敗しました', 'error');
        });
    },

    handlePaste(e) {
        // Only handle paste when a cell is selected
        if (this.selectedCells.length === 0) return;

        // Check if we're editing a cell (contenteditable is focused)
        const activeElement = document.activeElement;
        if (activeElement.tagName === 'TD' && activeElement.isContentEditable) {
            // Allow default paste behavior when editing cell content
            return;
        }

        e.preventDefault();

        const clipboardData = e.clipboardData || window.clipboardData;
        const htmlData = clipboardData.getData('text/html');
        const textData = clipboardData.getData('text/plain');

        let pasteData = [];

        // Try to parse HTML table first (from Word, Excel with formatting)
        if (htmlData) {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = htmlData;
            const table = tempDiv.querySelector('table');

            if (table) {
                // Extract data from HTML table
                const rows = table.querySelectorAll('tr');
                rows.forEach(row => {
                    const rowData = [];
                    const cells = row.querySelectorAll('td, th');
                    cells.forEach(cell => {
                        rowData.push(cell.textContent.trim());
                    });
                    if (rowData.length > 0) {
                        pasteData.push(rowData);
                    }
                });
            }
        }

        // If no HTML table found, parse as TSV (tab-separated values)
        if (pasteData.length === 0 && textData) {
            const lines = textData.split(/\r?\n/).filter(line => line.trim());
            pasteData = lines.map(line => line.split('\t'));
        }

        if (pasteData.length === 0) {
            this.showToast('貼り付けるデータがありません', 'error');
            return;
        }

        // Get starting position from first selected cell
        const startCell = this.selectedCells[0];
        const startRow = startCell.parentNode.rowIndex;
        const startCol = startCell.cellIndex;

        // Calculate how many rows and columns we need
        const pasteRows = pasteData.length;
        const pasteCols = Math.max(...pasteData.map(row => row.length));
        const currentRows = this.table.rows.length;
        const currentCols = this.table.rows[0]?.cells.length || 0;

        // Add rows if needed
        const rowsNeeded = (startRow + pasteRows) - currentRows;
        for (let i = 0; i < rowsNeeded; i++) {
            const row = this.table.insertRow();
            for (let j = 0; j < currentCols; j++) {
                const cell = row.insertCell();
                cell.contentEditable = true;
                cell.textContent = '';
            }
        }

        // Add columns if needed
        const colsNeeded = (startCol + pasteCols) - currentCols;
        if (colsNeeded > 0) {
            for (let i = 0; i < this.table.rows.length; i++) {
                for (let j = 0; j < colsNeeded; j++) {
                    const cell = this.table.rows[i].insertCell();
                    cell.contentEditable = true;
                    cell.textContent = '';
                }
            }
        }

        // Paste the data
        let cellsUpdated = 0;
        pasteData.forEach((rowData, rowOffset) => {
            const targetRow = this.table.rows[startRow + rowOffset];
            if (targetRow) {
                rowData.forEach((cellData, colOffset) => {
                    const targetCell = targetRow.cells[startCol + colOffset];
                    if (targetCell) {
                        targetCell.textContent = cellData;
                        cellsUpdated++;
                    }
                });
            }
        });

        this.clearSelection();
        this.updateCode();
        this.saveHistory();
        this.showToast(`${cellsUpdated}個のセルにデータを貼り付けました`);
    },

    navigateCell(direction) {
        if (this.selectedCells.length !== 1) return;

        const currentCell = this.selectedCells[0];
        const currentRow = currentCell.parentNode;
        const rowIndex = currentRow.rowIndex;
        const cellIndex = currentCell.cellIndex;

        let targetCell = null;

        switch(direction) {
            case 'ArrowUp':
                if (rowIndex > 0) {
                    targetCell = this.table.rows[rowIndex - 1].cells[cellIndex];
                }
                break;
            case 'ArrowDown':
                if (rowIndex < this.table.rows.length - 1) {
                    targetCell = this.table.rows[rowIndex + 1].cells[cellIndex];
                }
                break;
            case 'ArrowLeft':
                if (cellIndex > 0) {
                    targetCell = currentRow.cells[cellIndex - 1];
                }
                break;
            case 'ArrowRight':
                if (cellIndex < currentRow.cells.length - 1) {
                    targetCell = currentRow.cells[cellIndex + 1];
                }
                break;
        }

        if (targetCell) {
            this.clearSelection();
            this.selectCell(targetCell);
        }
    },

    selectCell(cell) {
        cell.classList.add('selected');
        this.selectedCells.push(cell);
    },

    toggleCellSelection(cell) {
        if (cell.classList.contains('selected')) {
            cell.classList.remove('selected');
            this.selectedCells = this.selectedCells.filter(c => c !== cell);
        } else {
            this.selectCell(cell);
        }
    },

    extendSelection(startCell, endCell) {
        if (!startCell || !endCell) return;

        // Get cell positions
        const startRow = startCell.parentNode.rowIndex;
        const startCol = startCell.cellIndex;
        const endRow = endCell.parentNode.rowIndex;
        const endCol = endCell.cellIndex;

        // Calculate selection bounds
        const minRow = Math.min(startRow, endRow);
        const maxRow = Math.max(startRow, endRow);
        const minCol = Math.min(startCol, endCol);
        const maxCol = Math.max(startCol, endCol);

        // Clear current selection
        this.clearSelection();

        // Select all cells in the rectangle
        for (let r = minRow; r <= maxRow; r++) {
            const row = this.table.rows[r];
            if (row) {
                for (let c = minCol; c <= maxCol; c++) {
                    const cell = row.cells[c];
                    if (cell && !cell.classList.contains('selected')) {
                        this.selectCell(cell);
                    }
                }
            }
        }
    },

    createDragGhost(e) {
        this.dragGhost = document.createElement('div');
        this.dragGhost.className = 'drag-ghost';
        this.dragGhost.textContent = `${this.selectedCells.length}個のセルを入れ替え中`;
        this.dragGhost.style.left = e.pageX + 10 + 'px';
        this.dragGhost.style.top = e.pageY + 10 + 'px';
        document.body.appendChild(this.dragGhost);
    },

    highlightDropArea(dropTarget) {
        // Get the dimensions of the selected area
        let minRow = Infinity, maxRow = -Infinity;
        let minCol = Infinity, maxCol = -Infinity;

        this.selectedCells.forEach(cell => {
            const row = cell.parentNode.rowIndex;
            const col = cell.cellIndex;
            minRow = Math.min(minRow, row);
            maxRow = Math.max(maxRow, row);
            minCol = Math.min(minCol, col);
            maxCol = Math.max(maxCol, col);
        });

        const rowCount = maxRow - minRow + 1;
        const colCount = maxCol - minCol + 1;

        // Highlight the target area with the same dimensions
        const startRow = dropTarget.parentNode.rowIndex;
        const startCol = dropTarget.cellIndex;

        for (let r = 0; r < rowCount; r++) {
            const targetRow = this.table.rows[startRow + r];
            if (targetRow) {
                for (let c = 0; c < colCount; c++) {
                    const targetCell = targetRow.cells[startCol + c];
                    if (targetCell && !targetCell.classList.contains('selected')) {
                        targetCell.classList.add('drag-over');
                    }
                }
            }
        }
    },

    handleDrop(e) {
        // Find the drop target
        const dropTarget = document.elementFromPoint(e.clientX, e.clientY);

        if (!dropTarget || dropTarget.tagName !== 'TD' || dropTarget.classList.contains('selected')) {
            // Invalid drop target
            this.showToast('ここにはセルをドロップできません', 'error');
            return;
        }

        // Remove drag-over class from all cells
        this.table.querySelectorAll('.drag-over').forEach(cell => {
            cell.classList.remove('drag-over');
        });

        // Get drop location
        const startRow = dropTarget.parentNode.rowIndex;
        const startCol = dropTarget.cellIndex;

        // Get the selection bounds
        let minRow = Infinity, maxRow = -Infinity;
        let minCol = Infinity, maxCol = -Infinity;

        this.selectedCells.forEach(cell => {
            const row = cell.parentNode.rowIndex;
            const col = cell.cellIndex;
            minRow = Math.min(minRow, row);
            maxRow = Math.max(maxRow, row);
            minCol = Math.min(minCol, col);
            maxCol = Math.max(maxCol, col);
        });

        const rowCount = maxRow - minRow + 1;
        const colCount = maxCol - minCol + 1;

        // Check if target area is valid (within bounds)
        if (startRow + rowCount > this.table.rows.length) {
            this.showToast('入れ替え不可: 対象エリアがテーブルの行範囲を超えています', 'error');
            return;
        }

        const maxCols = Math.max(...Array.from(this.table.rows).map(row => row.cells.length));
        if (startCol + colCount > maxCols) {
            this.showToast('入れ替え不可: 対象エリアがテーブルの列範囲を超えています', 'error');
            return;
        }

        // Build a map of source and target cells
        const swapPairs = [];

        for (let r = 0; r < rowCount; r++) {
            for (let c = 0; c < colCount; c++) {
                const sourceCell = this.table.rows[minRow + r]?.cells[minCol + c];
                const targetCell = this.table.rows[startRow + r]?.cells[startCol + c];

                if (sourceCell && targetCell) {
                    swapPairs.push({
                        source: sourceCell,
                        target: targetCell,
                        sourceData: {
                            content: sourceCell.innerHTML,
                            style: sourceCell.getAttribute('style') || '',
                            classes: Array.from(sourceCell.classList).filter(cls => cls !== 'selected' && cls !== 'dragging'),
                            rowSpan: sourceCell.rowSpan,
                            colSpan: sourceCell.colSpan
                        },
                        targetData: {
                            content: targetCell.innerHTML,
                            style: targetCell.getAttribute('style') || '',
                            classes: Array.from(targetCell.classList).filter(cls => cls !== 'selected' && cls !== 'dragging'),
                            rowSpan: targetCell.rowSpan,
                            colSpan: targetCell.colSpan
                        }
                    });
                }
            }
        }

        // Perform the swap
        swapPairs.forEach(pair => {
            // Apply target data to source cell
            pair.source.innerHTML = pair.targetData.content;
            if (pair.targetData.style) {
                pair.source.setAttribute('style', pair.targetData.style);
            } else {
                pair.source.removeAttribute('style');
            }
            pair.source.className = '';
            pair.source.contentEditable = true;
            pair.targetData.classes.forEach(cls => pair.source.classList.add(cls));
            if (pair.targetData.rowSpan > 1) {
                pair.source.rowSpan = pair.targetData.rowSpan;
            } else {
                pair.source.removeAttribute('rowspan');
            }
            if (pair.targetData.colSpan > 1) {
                pair.source.colSpan = pair.targetData.colSpan;
            } else {
                pair.source.removeAttribute('colspan');
            }

            // Apply source data to target cell
            pair.target.innerHTML = pair.sourceData.content;
            if (pair.sourceData.style) {
                pair.target.setAttribute('style', pair.sourceData.style);
            } else {
                pair.target.removeAttribute('style');
            }
            pair.target.className = '';
            pair.target.contentEditable = true;
            pair.sourceData.classes.forEach(cls => pair.target.classList.add(cls));
            if (pair.sourceData.rowSpan > 1) {
                pair.target.rowSpan = pair.sourceData.rowSpan;
            } else {
                pair.target.removeAttribute('rowspan');
            }
            if (pair.sourceData.colSpan > 1) {
                pair.target.colSpan = pair.sourceData.colSpan;
            } else {
                pair.target.removeAttribute('colspan');
            }
        });

        // Clear selection
        this.clearSelection();

        // Update code
        this.updateCode();

        // Save history
        this.saveHistory();

        this.showToast(`${swapPairs.length}個のセルを正常に入れ替えました！`);
    },

    clearSelection() {
        this.selectedCells.forEach(cell => cell.classList.remove('selected'));
        this.selectedCells = [];
        // Don't close HTML editor when clearing selection
    },

    addRow() {
        const colCount = this.table.rows[0]?.cells.length || 3;
        let insertPosition = -1; // -1 means at the end
        let message = '行を追加しました';
        let targetSection = 'tbody'; // default section

        // If a cell is selected, insert after that row
        if (this.selectedCells.length > 0) {
            const selectedRow = this.selectedCells[0].parentNode;
            insertPosition = selectedRow.rowIndex + 1;
            targetSection = selectedRow.getAttribute('data-section') || 'tbody';
            message = `行${selectedRow.rowIndex + 1}の後に行を追加しました`;
        }

        const row = this.table.insertRow(insertPosition);
        row.setAttribute('data-section', targetSection);

        for (let i = 0; i < colCount; i++) {
            const cell = row.insertCell();
            cell.contentEditable = true;
            cell.textContent = '新しいセル';
        }

        // Update section tracking - rebuild all sections
        this.rebuildSectionTracking();

        this.updateCode();
        this.saveHistory();
        this.showToast(message);
    },

    rebuildSectionTracking() {
        // Rebuild section tracking based on data-section attributes
        this.sections = { thead: [], tbody: [], tfoot: [] };
        for (let i = 0; i < this.table.rows.length; i++) {
            const section = this.table.rows[i].getAttribute('data-section') || 'tbody';
            this.sections[section].push(i);
        }
    },

    addColumn() {
        const rows = this.table.rows;
        let insertPosition = -1; // -1 means at the end
        let message = '列を追加しました';

        // If a cell is selected, insert after that column
        if (this.selectedCells.length > 0) {
            insertPosition = this.selectedCells[0].cellIndex + 1;
            message = `列${insertPosition}の後に列を追加しました`;
        }

        for (let i = 0; i < rows.length; i++) {
            const cell = rows[i].insertCell(insertPosition);
            cell.contentEditable = true;
            cell.textContent = '新しいセル';
        }
        this.updateCode();
        this.saveHistory();
        this.showToast(message);
    },

    deleteRow() {
        if (this.selectedCells.length === 0) {
            this.showToast('まずセルを選択してください', 'error');
            return;
        }

        // Get unique row indices from all selected cells
        const rowIndices = [...new Set(this.selectedCells.map(cell => cell.parentNode.rowIndex))].sort((a, b) => b - a);

        if (this.table.rows.length - rowIndices.length < 1) {
            this.showToast('すべての行を削除することはできません', 'error');
            return;
        }

        // Delete rows in reverse order to maintain correct indices
        rowIndices.forEach(rowIndex => {
            this.table.deleteRow(rowIndex);
        });

        // Rebuild section tracking
        this.rebuildSectionTracking();

        this.clearSelection();
        this.updateCode();
        this.saveHistory();
        this.showToast(`${rowIndices.length}行を削除しました`);
    },

    deleteColumn() {
        if (this.selectedCells.length === 0) {
            this.showToast('まずセルを選択してください', 'error');
            return;
        }

        // Get unique column indices from all selected cells
        const colIndices = [...new Set(this.selectedCells.map(cell => cell.cellIndex))].sort((a, b) => b - a);
        const rows = this.table.rows;

        if (rows[0] && rows[0].cells.length - colIndices.length < 1) {
            this.showToast('すべての列を削除することはできません', 'error');
            return;
        }

        // Delete columns in reverse order to maintain correct indices
        colIndices.forEach(colIndex => {
            for (let i = 0; i < rows.length; i++) {
                if (rows[i].cells[colIndex]) {
                    rows[i].deleteCell(colIndex);
                }
            }
        });

        this.clearSelection();
        this.updateCode();
        this.saveHistory();
        this.showToast(`${colIndices.length}列を削除しました`);
    },

    buildLogicalGrid() {
        // Build a logical grid that accounts for rowspan and colspan
        const grid = [];
        const rows = this.table.rows;

        for (let r = 0; r < rows.length; r++) {
            if (!grid[r]) grid[r] = [];

            let logicalCol = 0;
            for (let c = 0; c < rows[r].cells.length; c++) {
                const cell = rows[r].cells[c];

                // Skip columns already occupied by previous cells
                while (grid[r][logicalCol]) {
                    logicalCol++;
                }

                const rowSpan = cell.rowSpan || 1;
                const colSpan = cell.colSpan || 1;

                // Mark all positions occupied by this cell
                for (let dr = 0; dr < rowSpan; dr++) {
                    for (let dc = 0; dc < colSpan; dc++) {
                        if (!grid[r + dr]) grid[r + dr] = [];
                        grid[r + dr][logicalCol + dc] = cell;
                    }
                }

                logicalCol += colSpan;
            }
        }

        return grid;
    },

    getCellLogicalPosition(cell) {
        // Get the logical position of a cell in the grid
        const grid = this.buildLogicalGrid();

        for (let r = 0; r < grid.length; r++) {
            for (let c = 0; c < grid[r].length; c++) {
                if (grid[r][c] === cell) {
                    return { row: r, col: c };
                }
            }
        }

        return null;
    },

    mergeCells() {
        if (this.selectedCells.length < 2) {
            this.showToast('結合するには少なくとも2つのセルを選択してください', 'error');
            return;
        }

        // Build logical grid
        const grid = this.buildLogicalGrid();
        const positions = [];

        // Get logical positions of all selected cells
        for (const cell of this.selectedCells) {
            const pos = this.getCellLogicalPosition(cell);
            if (pos) {
                positions.push({ cell, ...pos });
            }
        }

        if (positions.length === 0) {
            this.showToast('選択されたセルの位置を特定できませんでした', 'error');
            return;
        }

        // Find bounds
        let minRow = Infinity, maxRow = -Infinity;
        let minCol = Infinity, maxCol = -Infinity;

        for (const pos of positions) {
            minRow = Math.min(minRow, pos.row);
            maxRow = Math.max(maxRow, pos.row);
            minCol = Math.min(minCol, pos.col);
            maxCol = Math.max(maxCol, pos.col);
        }

        const rowspan = maxRow - minRow + 1;
        const colspan = maxCol - minCol + 1;

        // Validate that all cells in the rectangle are selected
        const cellsInRect = new Set();
        for (let r = minRow; r <= maxRow; r++) {
            for (let c = minCol; c <= maxCol; c++) {
                if (grid[r] && grid[r][c]) {
                    cellsInRect.add(grid[r][c]);
                }
            }
        }

        // Check if all cells in rectangle are selected
        for (const cell of cellsInRect) {
            if (!this.selectedCells.includes(cell)) {
                this.showToast('選択範囲が不完全です。結合する領域のすべてのセルを選択してください', 'error');
                return;
            }
        }

        // Check if selected cells match cells in rectangle
        if (this.selectedCells.length !== cellsInRect.size) {
            this.showToast('選択されたセルが長方形の範囲を形成していません', 'error');
            return;
        }

        // Sort cells by position
        this.selectedCells.sort((a, b) => {
            const rowDiff = a.parentNode.rowIndex - b.parentNode.rowIndex;
            return rowDiff !== 0 ? rowDiff : a.cellIndex - b.cellIndex;
        });

        const firstCell = this.selectedCells[0];

        // Merge content - remove line breaks and extra whitespace
        const content = this.selectedCells.map(cell => {
            return cell.textContent.replace(/\s+/g, ' ').trim();
        }).filter(t => t).join(' ');
        firstCell.textContent = content;
        firstCell.rowSpan = rowspan;
        firstCell.colSpan = colspan;

        // Remove other cells
        for (let i = 1; i < this.selectedCells.length; i++) {
            this.selectedCells[i].remove();
        }

        this.clearSelection();
        this.updateCode();
        this.saveHistory();
        this.showToast('セルを結合しました');
    },

    splitCell() {
        if (this.selectedCells.length !== 1) {
            this.showToast('分割するには1つのセルのみを選択してください', 'error');
            return;
        }

        const cell = this.selectedCells[0];
        const rowSpan = cell.rowSpan || 1;
        const colSpan = cell.colSpan || 1;

        if (rowSpan === 1 && colSpan === 1) {
            this.showToast('セルは結合されていません', 'error');
            return;
        }

        const currentRow = cell.parentNode;
        const rowIndex = currentRow.rowIndex;
        const cellIndex = cell.cellIndex;

        // Reset the original cell
        cell.rowSpan = 1;
        cell.colSpan = 1;

        // Add missing cells for colspan in the current row
        for (let c = 1; c < colSpan; c++) {
            const newCell = document.createElement('td');
            newCell.contentEditable = true;
            newCell.textContent = '';

            // Insert after the current cell
            if (cellIndex + c < currentRow.cells.length) {
                currentRow.insertBefore(newCell, currentRow.cells[cellIndex + c]);
            } else {
                currentRow.appendChild(newCell);
            }
        }

        // Add missing cells for rowspan in subsequent rows
        for (let r = 1; r < rowSpan; r++) {
            const targetRow = this.table.rows[rowIndex + r];
            if (targetRow) {
                for (let c = 0; c < colSpan; c++) {
                    const newCell = document.createElement('td');
                    newCell.contentEditable = true;
                    newCell.textContent = '';

                    // Insert at the correct position (cellIndex + c to maintain order)
                    const insertPosition = cellIndex + c;
                    if (insertPosition < targetRow.cells.length) {
                        targetRow.insertBefore(newCell, targetRow.cells[insertPosition]);
                    } else {
                        targetRow.appendChild(newCell);
                    }
                }
            }
        }

        this.clearSelection();
        this.updateCode();
        this.saveHistory();
        this.showToast('セルを分割しました');
    },

    toggleHeader() {
        if (this.selectedCells.length === 0) {
            this.showToast('ヘッダースタイルを切り替えるセルを選択してください', 'error');
            return;
        }

        this.selectedCells.forEach(cell => {
            cell.classList.toggle('header-cell');
        });

        this.updateCode();
        this.saveHistory();
        this.showToast('ヘッダースタイルを切り替えました');
    },

    openHtmlEditor() {
        if (this.selectedCells.length === 0) {
            this.showToast('HTMLを編集するセルを選択してください', 'error');
            return;
        }

        if (this.selectedCells.length > 1) {
            this.showToast('HTML編集は1つのセルのみ選択してください', 'error');
            return;
        }

        const cell = this.selectedCells[0];
        this.updateHtmlEditorContent(cell);

        // Show the panel
        const panel = document.getElementById('htmlEditorPanel');
        panel.classList.add('active');

        // Focus the editor
        const editor = document.getElementById('cellHtmlEditor');
        setTimeout(() => editor.focus(), 100);

        this.showToast('HTMLエディタを開きました - 他のセルをクリックして切り替えられます');
    },

    updateHtmlEditorContent(cell) {
        const editor = document.getElementById('cellHtmlEditor');

        // Store the current cell being edited and its parent row
        this.editingCell = cell;
        this.editingCellParent = cell.parentNode;
        this.editingCellIndex = cell.cellIndex;

        // Get the complete cell HTML including the tag
        // Create a clone
        const clone = cell.cloneNode(true);

        // Remove internal attributes for cleaner display
        clone.removeAttribute('contenteditable');
        clone.removeAttribute('role');
        clone.classList.remove('selected', 'dragging', 'drag-over', 'on-border');

        // Convert TD with header-cell class to TH for display
        let displayElement = clone;
        if (clone.tagName === 'TD' && clone.classList.contains('header-cell')) {
            displayElement = document.createElement('th');
            displayElement.innerHTML = clone.innerHTML;

            // Only set style if it exists and is not empty
            const styleAttr = clone.getAttribute('style');
            if (styleAttr && styleAttr.trim() !== '') {
                displayElement.setAttribute('style', styleAttr);
            }

            if (clone.rowSpan > 1) displayElement.rowSpan = clone.rowSpan;
            if (clone.colSpan > 1) displayElement.colSpan = clone.colSpan;

            // Copy all classes except 'header-cell'
            Array.from(clone.classList).forEach(cls => {
                if (cls !== 'header-cell') {
                    displayElement.classList.add(cls);
                }
            });
        }

        // Remove class attribute entirely if empty
        if (displayElement.className === '') {
            displayElement.removeAttribute('class');
        }

        // Remove style attribute if empty
        const finalStyle = displayElement.getAttribute('style');
        if (!finalStyle || finalStyle.trim() === '') {
            displayElement.removeAttribute('style');
        }

        // Get the cell HTML without formatting
        let cellHtml = displayElement.outerHTML;

        // Set the editor content to the complete cell HTML
        editor.value = cellHtml;
    },

    applyCellHtml() {
        if (!this.editingCell) {
            return;
        }

        try {
            const editor = document.getElementById('cellHtmlEditor');
            let newHtml = editor.value.trim();

            if (!newHtml) {
                this.showToast('HTMLを空にすることはできません', 'error');
                return;
            }

            // Sanitize the HTML first
            newHtml = this.sanitizeHTML(newHtml);

            // Create a temporary table to properly parse td/th elements
            // (td/th elements need to be inside a table structure to parse correctly)
            const tempTable = document.createElement('table');
            const tempRow = document.createElement('tr');
            tempTable.appendChild(tempRow);
            tempRow.innerHTML = newHtml;

            // Get the first cell from the temp row
            const newCell = tempRow.firstElementChild;

            if (!newCell) {
                this.showToast('無効なHTML: セル要素を解析できませんでした', 'error');
                return;
            }

            const tagName = newCell.tagName.toUpperCase();
            if (tagName !== 'TD' && tagName !== 'TH') {
                this.showToast(`無効なHTML: <td>または<th>要素である必要があります（<${tagName.toLowerCase()}>が見つかりました）`, 'error');
                return;
            }

            // Convert TH to TD internally (editor only works with TD elements)
            let finalCell = newCell;
            if (tagName === 'TH') {
                finalCell = document.createElement('td');
                finalCell.innerHTML = newCell.innerHTML;
                if (newCell.getAttribute('style')) {
                    finalCell.setAttribute('style', newCell.getAttribute('style'));
                }
                if (newCell.rowSpan > 1) finalCell.rowSpan = newCell.rowSpan;
                if (newCell.colSpan > 1) finalCell.colSpan = newCell.colSpan;
                // Copy classes except header-cell (we'll add it separately)
                Array.from(newCell.classList).forEach(cls => {
                    if (cls !== 'header-cell') {
                        finalCell.classList.add(cls);
                    }
                });
                // Add header-cell class for TH elements
                finalCell.classList.add('header-cell');
            }

            // Make the new cell editable
            finalCell.contentEditable = true;

            // Replace the old cell with the new one
            this.editingCellParent.replaceChild(finalCell, this.editingCell);

            // Update selection to the new cell
            this.clearSelection();
            this.selectCell(finalCell);

            // Update the editor content to reflect the new cell
            this.updateHtmlEditorContent(finalCell);

            // Update the code output
            this.updateCode();
            this.saveHistory();

            this.showToast('セルHTMLを正常に更新しました！');

        } catch (error) {
            this.showToast('セルHTML適用エラー: ' + error.message, 'error');
            console.error('Error applying cell HTML:', error);
        }
    },

    closeHtmlEditor() {
        const panel = document.getElementById('htmlEditorPanel');
        const editor = document.getElementById('cellHtmlEditor');

        panel.classList.remove('active');
        editor.value = '';
        this.editingCell = null;
        this.editingCellParent = null;
        this.editingCellIndex = null;
    },

    clearTable() {
        if (confirm('すべてのテーブル内容をクリアしますか？')) {
            this.table.innerHTML = `
                <tr data-section="tbody">
                    <td contenteditable="true">セル1</td>
                    <td contenteditable="true">セル2</td>
                    <td contenteditable="true">セル3</td>
                </tr>
                <tr data-section="tbody">
                    <td contenteditable="true">セル4</td>
                    <td contenteditable="true">セル5</td>
                    <td contenteditable="true">セル6</td>
                </tr>
            `;

            // Reset caption and column groups
            this.caption = '';
            this.columnGroups = [];
            const captionInput = document.getElementById('tableCaption');
            if (captionInput) {
                captionInput.value = '';
            }

            // Reset sections
            this.sections = { thead: [], tbody: [0, 1], tfoot: [] };

            this.clearSelection();
            this.updateCode();
            this.saveHistory();
            this.showToast('テーブルをクリアしました');
        }
    },

    applyCellStyle(styleProperty, value) {
        if (this.selectedCells.length === 0) {
            this.showToast('スタイルを適用するセルを選択してください', 'error');
            return;
        }

        this.selectedCells.forEach(cell => {
            cell.style[styleProperty] = value;
        });

        this.updateCode();
        this.saveHistory();
        this.showToast(`スタイルを${this.selectedCells.length}個のセルに適用しました`);
    },

    applyTextAlign(align) {
        this.applyCellStyle('textAlign', align);
    },

    applyBackgroundColor(color) {
        this.applyCellStyle('backgroundColor', color);
    },

    applyTextColor(color) {
        this.applyCellStyle('color', color);
    },

    applyBorder(borderStyle) {
        this.applyCellStyle('border', borderStyle);
    },

    clearCellStyles() {
        if (this.selectedCells.length === 0) {
            this.showToast('スタイルをクリアするセルを選択してください', 'error');
            return;
        }

        this.selectedCells.forEach(cell => {
            cell.removeAttribute('style');
        });

        this.updateCode();
        this.saveHistory();
        this.showToast(`${this.selectedCells.length}個のセルのスタイルをクリアしました`);
    },

    moveRowUp() {
        if (this.selectedCells.length === 0) {
            this.showToast('移動する行のセルを選択してください', 'error');
            return;
        }

        const rowIndex = this.selectedCells[0].parentNode.rowIndex;
        if (rowIndex === 0) {
            this.showToast('最初の行はこれ以上上に移動できません', 'error');
            return;
        }

        const currentRow = this.table.rows[rowIndex];
        const previousRow = this.table.rows[rowIndex - 1];
        this.table.insertBefore(currentRow, previousRow);

        this.updateCode();
        this.saveHistory();
        this.showToast('行を上に移動しました');
    },

    moveRowDown() {
        if (this.selectedCells.length === 0) {
            this.showToast('移動する行のセルを選択してください', 'error');
            return;
        }

        const rowIndex = this.selectedCells[0].parentNode.rowIndex;
        if (rowIndex === this.table.rows.length - 1) {
            this.showToast('最後の行はこれ以上下に移動できません', 'error');
            return;
        }

        const currentRow = this.table.rows[rowIndex];
        const nextRow = this.table.rows[rowIndex + 1];
        this.table.insertBefore(nextRow, currentRow);

        this.updateCode();
        this.saveHistory();
        this.showToast('行を下に移動しました');
    },

    moveColumnLeft() {
        if (this.selectedCells.length === 0) {
            this.showToast('移動する列のセルを選択してください', 'error');
            return;
        }

        const cellIndex = this.selectedCells[0].cellIndex;
        if (cellIndex === 0) {
            this.showToast('最初の列はこれ以上左に移動できません', 'error');
            return;
        }

        const rows = this.table.rows;
        for (let i = 0; i < rows.length; i++) {
            const currentCell = rows[i].cells[cellIndex];
            const previousCell = rows[i].cells[cellIndex - 1];
            rows[i].insertBefore(currentCell, previousCell);
        }

        this.updateCode();
        this.saveHistory();
        this.showToast('列を左に移動しました');
    },

    moveColumnRight() {
        if (this.selectedCells.length === 0) {
            this.showToast('移動する列のセルを選択してください', 'error');
            return;
        }

        const cellIndex = this.selectedCells[0].cellIndex;
        const rows = this.table.rows;
        const maxCols = rows[0] ? rows[0].cells.length : 0;

        if (cellIndex === maxCols - 1) {
            this.showToast('最後の列はこれ以上右に移動できません', 'error');
            return;
        }

        for (let i = 0; i < rows.length; i++) {
            const currentCell = rows[i].cells[cellIndex];
            const nextCell = rows[i].cells[cellIndex + 1];
            if (nextCell && nextCell.nextSibling) {
                rows[i].insertBefore(currentCell, nextCell.nextSibling);
            } else {
                rows[i].appendChild(currentCell);
            }
        }

        this.updateCode();
        this.saveHistory();
        this.showToast('列を右に移動しました');
    },

    updateCode() {
        // Build HTML string with all table tags
        // Build table tag with attributes
        let tableAttrs = [];
        if (this.tableAttributes.class && this.tableAttributes.class.trim()) tableAttrs.push(`class="${this.tableAttributes.class}"`);
        if (this.tableAttributes.style && this.tableAttributes.style.trim()) tableAttrs.push(`style="${this.tableAttributes.style}"`);
        if (this.tableAttributes.id && this.tableAttributes.id.trim()) tableAttrs.push(`id="${this.tableAttributes.id}"`);
        if (this.tableAttributes.border && this.tableAttributes.border.trim()) tableAttrs.push(`border="${this.tableAttributes.border}"`);
        if (this.tableAttributes.cellspacing && this.tableAttributes.cellspacing.trim()) tableAttrs.push(`cellspacing="${this.tableAttributes.cellspacing}"`);
        if (this.tableAttributes.cellpadding && this.tableAttributes.cellpadding.trim()) tableAttrs.push(`cellpadding="${this.tableAttributes.cellpadding}"`);
        if (this.tableAttributes.width && this.tableAttributes.width.trim()) tableAttrs.push(`width="${this.tableAttributes.width}"`);

        let html = `<table${tableAttrs.length ? ' ' + tableAttrs.join(' ') : ''}>\n`;

        // Add caption if exists
        if (this.caption && this.caption.trim() !== '') {
            let captionAttrs = [];
            if (this.captionAttributes.class && this.captionAttributes.class.trim()) captionAttrs.push(`class="${this.captionAttributes.class}"`);
            if (this.captionAttributes.style && this.captionAttributes.style.trim()) captionAttrs.push(`style="${this.captionAttributes.style}"`);
            if (this.captionAttributes.id && this.captionAttributes.id.trim()) captionAttrs.push(`id="${this.captionAttributes.id}"`);
            html += `  <caption${captionAttrs.length ? ' ' + captionAttrs.join(' ') : ''}>${this.caption}</caption>\n`;
        }

        // Add colgroup if exists
        if (this.columnGroups.length > 0 && this.columnGroups.some(col => col.style || col.class || col.span > 1)) {
            html += '  <colgroup>\n';
            this.columnGroups.forEach(col => {
                let attrs = [];
                if (col.span && col.span > 1) attrs.push(`span="${col.span}"`);
                if (col.style && col.style.trim()) attrs.push(`style="${col.style}"`);
                if (col.class && col.class.trim()) attrs.push(`class="${col.class}"`);
                html += `    <col${attrs.length ? ' ' + attrs.join(' ') : ''}>\n`;
            });
            html += '  </colgroup>\n';
        }

        // Helper function to get cleaned row HTML
        const getRowHTML = (rowIndex) => {
            const row = this.table.rows[rowIndex];
            if (!row) return '';

            // Build row attributes
            let rowAttrs = [];
            const rowAttributes = this.rowAttributes[rowIndex];
            if (rowAttributes) {
                if (rowAttributes.class && rowAttributes.class.trim()) rowAttrs.push(`class="${rowAttributes.class}"`);
                if (rowAttributes.style && rowAttributes.style.trim()) rowAttrs.push(`style="${rowAttributes.style}"`);
                if (rowAttributes.id && rowAttributes.id.trim()) rowAttrs.push(`id="${rowAttributes.id}"`);
            }

            let rowHtml = `      <tr${rowAttrs.length ? ' ' + rowAttrs.join(' ') : ''}>\n`;
            Array.from(row.cells).forEach(cell => {
                // Determine if this should be th or td
                const isHeaderCell = cell.classList.contains('header-cell');
                const tagName = isHeaderCell ? 'th' : 'td';

                // Build attributes - read ALL attributes from the cell
                let attrs = [];
                const excludeAttrs = ['contenteditable', 'role', 'tabindex'];
                const excludeClasses = ['selected', 'dragging', 'drag-over', 'on-border', 'header-cell'];

                // Read all attributes from the cell element
                Array.from(cell.attributes).forEach(attr => {
                    if (excludeAttrs.includes(attr.name)) {
                        return; // Skip internal attributes
                    }

                    if (attr.name === 'class') {
                        // Filter out internal classes
                        const classes = Array.from(cell.classList).filter(cls => !excludeClasses.includes(cls));
                        if (classes.length > 0) {
                            attrs.push(`class="${classes.join(' ')}"`);
                        }
                    } else if (attr.name === 'style') {
                        // Only include style if not empty
                        if (attr.value && attr.value.trim() !== '') {
                            attrs.push(`style="${attr.value}"`);
                        }
                    } else {
                        // Include all other attributes (rowspan, colspan, id, data-*, aria-*, etc.)
                        attrs.push(`${attr.name}="${attr.value}"`);
                    }
                });

                const attrStr = attrs.length ? ' ' + attrs.join(' ') : '';
                rowHtml += `        <${tagName}${attrStr}>${cell.innerHTML}</${tagName}>\n`;
            });
            rowHtml += '      </tr>\n';
            return rowHtml;
        };

        // Add thead section
        if (this.sections.thead.length > 0) {
            let theadAttrs = [];
            if (this.sectionAttributes.thead.class && this.sectionAttributes.thead.class.trim()) theadAttrs.push(`class="${this.sectionAttributes.thead.class}"`);
            if (this.sectionAttributes.thead.style && this.sectionAttributes.thead.style.trim()) theadAttrs.push(`style="${this.sectionAttributes.thead.style}"`);
            if (this.sectionAttributes.thead.id && this.sectionAttributes.thead.id.trim()) theadAttrs.push(`id="${this.sectionAttributes.thead.id}"`);
            html += `  <thead${theadAttrs.length ? ' ' + theadAttrs.join(' ') : ''}>\n`;
            this.sections.thead.forEach(rowIndex => {
                html += getRowHTML(rowIndex);
            });
            html += '  </thead>\n';
        }

        // Add tbody section
        if (this.sections.tbody.length > 0) {
            let tbodyAttrs = [];
            if (this.sectionAttributes.tbody.class && this.sectionAttributes.tbody.class.trim()) tbodyAttrs.push(`class="${this.sectionAttributes.tbody.class}"`);
            if (this.sectionAttributes.tbody.style && this.sectionAttributes.tbody.style.trim()) tbodyAttrs.push(`style="${this.sectionAttributes.tbody.style}"`);
            if (this.sectionAttributes.tbody.id && this.sectionAttributes.tbody.id.trim()) tbodyAttrs.push(`id="${this.sectionAttributes.tbody.id}"`);
            html += `  <tbody${tbodyAttrs.length ? ' ' + tbodyAttrs.join(' ') : ''}>\n`;
            this.sections.tbody.forEach(rowIndex => {
                html += getRowHTML(rowIndex);
            });
            html += '  </tbody>\n';
        }

        // Add tfoot section
        if (this.sections.tfoot.length > 0) {
            let tfootAttrs = [];
            if (this.sectionAttributes.tfoot.class && this.sectionAttributes.tfoot.class.trim()) tfootAttrs.push(`class="${this.sectionAttributes.tfoot.class}"`);
            if (this.sectionAttributes.tfoot.style && this.sectionAttributes.tfoot.style.trim()) tfootAttrs.push(`style="${this.sectionAttributes.tfoot.style}"`);
            if (this.sectionAttributes.tfoot.id && this.sectionAttributes.tfoot.id.trim()) tfootAttrs.push(`id="${this.sectionAttributes.tfoot.id}"`);
            html += `  <tfoot${tfootAttrs.length ? ' ' + tfootAttrs.join(' ') : ''}>\n`;
            this.sections.tfoot.forEach(rowIndex => {
                html += getRowHTML(rowIndex);
            });
            html += '  </tfoot>\n';
        }

        html += '</table>';

        document.getElementById('codeOutput').value = html;

        // Auto-save to localStorage
        this.saveToStorage();
    },

    applyCodeChanges() {
        try {
            const codeOutput = document.getElementById('codeOutput');
            let htmlCode = codeOutput.value.trim();

            // Sanitize the HTML first
            htmlCode = this.sanitizeHTML(htmlCode);

            // Create a temporary container to parse the HTML
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = htmlCode;

            // Get the table from the parsed HTML
            const newTable = tempDiv.querySelector('table');

            if (!newTable) {
                this.showToast('無効なHTML: テーブルが見つかりません', 'error');
                return;
            }

            // Extract table attributes
            this.tableAttributes = {
                class: newTable.className || '',
                style: newTable.getAttribute('style') || '',
                id: newTable.id || '',
                border: newTable.getAttribute('border') || '',
                cellspacing: newTable.getAttribute('cellspacing') || '',
                cellpadding: newTable.getAttribute('cellpadding') || '',
                width: newTable.getAttribute('width') || ''
            };

            // Extract caption and its attributes
            const caption = newTable.querySelector('caption');
            this.caption = caption ? caption.textContent.trim() : '';
            if (caption) {
                this.captionAttributes = {
                    class: caption.className || '',
                    style: caption.getAttribute('style') || '',
                    id: caption.id || ''
                };
            } else {
                this.captionAttributes = { class: '', style: '', id: '' };
            }

            // Update caption input field
            const captionInput = document.getElementById('tableCaption');
            if (captionInput) {
                captionInput.value = this.caption;
            }

            // Extract colgroup
            const colgroup = newTable.querySelector('colgroup');
            this.columnGroups = [];
            if (colgroup) {
                const cols = colgroup.querySelectorAll('col');
                cols.forEach(col => {
                    this.columnGroups.push({
                        span: col.span || 1,
                        style: col.getAttribute('style') || '',
                        class: col.className || ''
                    });
                });
            }

            // Clear current table and sections
            this.table.innerHTML = '';
            this.sections = { thead: [], tbody: [], tfoot: [] };
            this.rowAttributes = {}; // Clear row attributes

            // Extract section attributes
            ['thead', 'tbody', 'tfoot'].forEach(sectionName => {
                const section = newTable.querySelector(sectionName);
                if (section) {
                    this.sectionAttributes[sectionName] = {
                        class: section.className || '',
                        style: section.getAttribute('style') || '',
                        id: section.id || ''
                    };
                } else {
                    this.sectionAttributes[sectionName] = { class: '', style: '', id: '' };
                }
            });

            let rowIndex = 0;

            // Process each section
            ['thead', 'tbody', 'tfoot'].forEach(sectionName => {
                const section = newTable.querySelector(sectionName);
                if (section) {
                    const rows = section.querySelectorAll('tr');
                    rows.forEach(row => {
                        const newRow = this.table.insertRow();
                        newRow.setAttribute('data-section', sectionName);

                        // Track this row in the section
                        this.sections[sectionName].push(rowIndex);

                        // Extract row attributes
                        this.rowAttributes[rowIndex] = {
                            class: row.className || '',
                            style: row.getAttribute('style') || '',
                            id: row.id || ''
                        };

                        // Copy cells
                        Array.from(row.cells).forEach(cell => {
                            const newCell = document.createElement('td');
                            newCell.innerHTML = cell.innerHTML;
                            newCell.contentEditable = true;

                            // Copy ALL attributes from the cell
                            const excludeAttrs = ['contenteditable', 'role', 'tabindex'];
                            Array.from(cell.attributes).forEach(attr => {
                                if (!excludeAttrs.includes(attr.name)) {
                                    if (attr.name === 'rowspan') {
                                        newCell.rowSpan = parseInt(attr.value) || 1;
                                    } else if (attr.name === 'colspan') {
                                        newCell.colSpan = parseInt(attr.value) || 1;
                                    } else {
                                        newCell.setAttribute(attr.name, attr.value);
                                    }
                                }
                            });

                            // Convert th to td with header-cell class
                            if (cell.tagName === 'TH') {
                                newCell.classList.add('header-cell');
                            }

                            newRow.appendChild(newCell);
                        });

                        rowIndex++;
                    });
                }
            });

            // If no sections were found, process all rows as tbody
            if (rowIndex === 0) {
                const rows = newTable.querySelectorAll('tr');
                rows.forEach(row => {
                    const newRow = this.table.insertRow();
                    newRow.setAttribute('data-section', 'tbody');
                    this.sections.tbody.push(rowIndex);

                    // Extract row attributes
                    this.rowAttributes[rowIndex] = {
                        class: row.className || '',
                        style: row.getAttribute('style') || '',
                        id: row.id || ''
                    };

                    Array.from(row.cells).forEach(cell => {
                        const newCell = document.createElement('td');
                        newCell.innerHTML = cell.innerHTML;
                        newCell.contentEditable = true;

                        // Copy ALL attributes from the cell
                        const excludeAttrs = ['contenteditable', 'role', 'tabindex'];
                        Array.from(cell.attributes).forEach(attr => {
                            if (!excludeAttrs.includes(attr.name)) {
                                if (attr.name === 'rowspan') {
                                    newCell.rowSpan = parseInt(attr.value) || 1;
                                } else if (attr.name === 'colspan') {
                                    newCell.colSpan = parseInt(attr.value) || 1;
                                } else {
                                    newCell.setAttribute(attr.name, attr.value);
                                }
                            }
                        });

                        if (cell.tagName === 'TH') {
                            newCell.classList.add('header-cell');
                        }

                        newRow.appendChild(newCell);
                    });

                    rowIndex++;
                });
            }

            // Clear selection
            this.clearSelection();

            // Save history
            this.saveHistory();

            // Show success message
            this.showToast('変更を正常に適用しました！');

        } catch (error) {
            this.showToast('変更適用エラー: ' + error.message, 'error');
            console.error('Error applying code changes:', error);
        }
    },

    formatHTML(html) {
        // Simple HTML formatting
        let formatted = '';
        let indent = 0;
        const tab = '  ';

        // First normalize whitespace within tags and content
        html = html.replace(/>\s+</g, '><').trim();

        html = html.replace(/></g, '>\n<');
        const lines = html.split('\n');

        lines.forEach(line => {
            line = line.trim();
            if (!line) return; // Skip empty lines

            if (line.match(/^<\//) || line.match(/^<[^>]+\/>/)) {
                indent = Math.max(0, indent - 1);
            }
            formatted += tab.repeat(indent) + line + '\n';
            if (line.match(/^<[^\/][^>]*[^\/]>/) && !line.match(/^<(td|th)/)) {
                indent++;
            }
        });

        return formatted.trim();
    },

    copyCode() {
        const code = document.getElementById('codeOutput').value;
        navigator.clipboard.writeText(code).then(() => {
            this.showToast('コードをクリップボードにコピーしました！');
        }).catch(() => {
            this.showToast('コードのコピーに失敗しました', 'error');
        });
    },

    exportAsCSV() {
        try {
            let csv = '';
            const rows = this.table.rows;

            for (let i = 0; i < rows.length; i++) {
                const cells = rows[i].cells;
                const rowData = [];

                for (let j = 0; j < cells.length; j++) {
                    let cellText = cells[j].textContent.trim();
                    // Escape quotes and wrap in quotes if contains comma, quote, or newline
                    if (cellText.includes(',') || cellText.includes('"') || cellText.includes('\n')) {
                        cellText = '"' + cellText.replace(/"/g, '""') + '"';
                    }
                    rowData.push(cellText);
                }

                csv += rowData.join(',') + '\n';
            }

            // Download as file
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = 'table_export.csv';
            link.click();
            URL.revokeObjectURL(link.href);

            this.showToast('CSV形式でエクスポートしました');
        } catch (error) {
            this.showToast('CSVエクスポートエラー: ' + error.message, 'error');
            console.error('CSV export error:', error);
        }
    },

    exportAsMarkdown() {
        try {
            let markdown = '';
            const rows = this.table.rows;

            if (rows.length === 0) {
                this.showToast('エクスポートするテーブルがありません', 'error');
                return;
            }

            for (let i = 0; i < rows.length; i++) {
                const cells = rows[i].cells;
                const rowData = [];

                for (let j = 0; j < cells.length; j++) {
                    let cellText = cells[j].textContent.trim().replace(/\|/g, '\\|');
                    rowData.push(cellText);
                }

                markdown += '| ' + rowData.join(' | ') + ' |\n';

                // Add separator after first row (header)
                if (i === 0) {
                    markdown += '| ' + rowData.map(() => '---').join(' | ') + ' |\n';
                }
            }

            // Download as file
            const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = 'table_export.md';
            link.click();
            URL.revokeObjectURL(link.href);

            this.showToast('Markdown形式でエクスポートしました');
        } catch (error) {
            this.showToast('Markdownエクスポートエラー: ' + error.message, 'error');
            console.error('Markdown export error:', error);
        }
    },

    exportAsJSON() {
        try {
            const tableData = [];
            const rows = this.table.rows;

            for (let i = 0; i < rows.length; i++) {
                const cells = rows[i].cells;
                const rowData = [];

                for (let j = 0; j < cells.length; j++) {
                    const cell = cells[j];
                    rowData.push({
                        content: cell.textContent.trim(),
                        rowSpan: cell.rowSpan > 1 ? cell.rowSpan : undefined,
                        colSpan: cell.colSpan > 1 ? cell.colSpan : undefined,
                        isHeader: cell.classList.contains('header-cell'),
                        style: cell.getAttribute('style') || undefined
                    });
                }

                tableData.push(rowData);
            }

            const jsonStr = JSON.stringify(tableData, null, 2);

            // Download as file
            const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = 'table_export.json';
            link.click();
            URL.revokeObjectURL(link.href);

            this.showToast('JSON形式でエクスポートしました');
        } catch (error) {
            this.showToast('JSONエクスポートエラー: ' + error.message, 'error');
            console.error('JSON export error:', error);
        }
    },

    showToast(message, type = 'success') {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.style.background = type === 'error' ? '#f56565' : '#48bb78';
        toast.classList.add('show');

        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    },

    saveToStorage() {
        try {
            const tableHTML = this.table.innerHTML;

            // Check if localStorage is available
            if (typeof(Storage) === "undefined") {
                console.warn('このブラウザはlocalStorageをサポートしていません');
                return;
            }

            // Check storage quota
            try {
                localStorage.setItem('htmlTableMaker_table', tableHTML);
            } catch (quotaError) {
                if (quotaError.name === 'QuotaExceededError') {
                    this.showToast('保存容量が不足しています。古いデータを削除してください', 'error');
                    return;
                }
                throw quotaError;
            }

            const timestamp = new Date().toLocaleString('ja-JP');
            localStorage.setItem('htmlTableMaker_lastSaved', timestamp);

            // Update last saved display if it exists
            const lastSavedEl = document.getElementById('lastSaved');
            if (lastSavedEl) {
                lastSavedEl.textContent = `最終保存: ${timestamp}`;
            }
        } catch (error) {
            console.error('保存エラー:', error);
            this.showToast('データの保存中にエラーが発生しました: ' + error.message, 'error');
        }
    },

    loadFromStorage() {
        try {
            // Check if localStorage is available
            if (typeof(Storage) === "undefined") {
                console.warn('このブラウザはlocalStorageをサポートしていません');
                return;
            }

            const savedTable = localStorage.getItem('htmlTableMaker_table');
            const lastSaved = localStorage.getItem('htmlTableMaker_lastSaved');

            if (savedTable) {
                // Validate HTML before loading
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = savedTable;

                if (!tempDiv.querySelector('td')) {
                    console.warn('保存されたデータが無効です');
                    return;
                }

                this.table.innerHTML = savedTable;

                // Update last saved display if it exists
                const lastSavedEl = document.getElementById('lastSaved');
                if (lastSavedEl && lastSaved) {
                    lastSavedEl.textContent = `最終保存: ${lastSaved}`;
                }
            }
        } catch (error) {
            console.error('読み込みエラー:', error);
            this.showToast('データの読み込み中にエラーが発生しました: ' + error.message, 'error');
        }
    },

    clearStorage() {
        if (confirm('保存されたテーブルデータを削除しますか？')) {
            try {
                if (typeof(Storage) === "undefined") {
                    this.showToast('このブラウザはlocalStorageをサポートしていません', 'error');
                    return;
                }

                localStorage.removeItem('htmlTableMaker_table');
                localStorage.removeItem('htmlTableMaker_lastSaved');

                // Update last saved display if it exists
                const lastSavedEl = document.getElementById('lastSaved');
                if (lastSavedEl) {
                    lastSavedEl.textContent = '';
                }

                this.showToast('保存データを削除しました');
            } catch (error) {
                console.error('削除エラー:', error);
                this.showToast('データの削除に失敗しました: ' + error.message, 'error');
            }
        }
    },

    // ========== New Functions for Table Structure Support ==========

    setCaption(text) {
        this.caption = text;
        this.updateCode();
    },

    moveRowToSection(targetSection) {
        if (this.selectedCells.length === 0) {
            this.showToast('セクションを移動する行を選択してください', 'error');
            return;
        }

        // Get unique row indices from selected cells
        const rowIndices = [...new Set(this.selectedCells.map(cell => cell.parentNode.rowIndex))];

        rowIndices.forEach(rowIndex => {
            // Remove from all sections
            ['thead', 'tbody', 'tfoot'].forEach(section => {
                const index = this.sections[section].indexOf(rowIndex);
                if (index > -1) {
                    this.sections[section].splice(index, 1);
                }
            });

            // Add to target section
            this.sections[targetSection].push(rowIndex);

            // Update data-section attribute
            this.table.rows[rowIndex].setAttribute('data-section', targetSection);
        });

        // Sort section arrays
        Object.keys(this.sections).forEach(section => {
            this.sections[section].sort((a, b) => a - b);
        });

        this.updateCode();
        this.saveHistory();
        this.showToast(`${rowIndices.length}行を${targetSection}に移動しました`);
    },

    openColumnPropertiesPanel() {
        const modal = document.getElementById('columnPropertiesModal');
        const list = document.getElementById('columnPropertiesList');

        // Get column count
        const colCount = this.table.rows[0]?.cells.length || 0;

        if (colCount === 0) {
            this.showToast('テーブルに列がありません', 'error');
            return;
        }

        // Initialize columnGroups if empty
        if (this.columnGroups.length === 0) {
            for (let i = 0; i < colCount; i++) {
                this.columnGroups.push({ span: 1, style: '', class: '' });
            }
        }

        // Build the column properties list
        let html = '';
        for (let i = 0; i < colCount; i++) {
            const col = this.columnGroups[i] || { span: 1, style: '', class: '' };
            html += `
                <div style="border: 1px solid #e2e8f0; padding: 12px; margin-bottom: 10px; border-radius: 6px; background: #f7fafc;">
                    <h4 style="margin-bottom: 10px; color: #2d3748;">列 ${i + 1}</h4>
                    <div style="display: grid; gap: 8px;">
                        <label style="display: flex; align-items: center; gap: 8px;">
                            <span style="width: 60px; font-size: 13px;">span:</span>
                            <input type="number" min="1" value="${col.span || 1}"
                                   data-col="${i}" data-prop="span"
                                   style="flex: 1; padding: 4px 8px; border: 1px solid #cbd5e0; border-radius: 4px;">
                        </label>
                        <label style="display: flex; align-items: center; gap: 8px;">
                            <span style="width: 60px; font-size: 13px;">style:</span>
                            <input type="text" value="${col.style || ''}"
                                   data-col="${i}" data-prop="style" placeholder="width: 100px;"
                                   style="flex: 1; padding: 4px 8px; border: 1px solid #cbd5e0; border-radius: 4px;">
                        </label>
                        <label style="display: flex; align-items: center; gap: 8px;">
                            <span style="width: 60px; font-size: 13px;">class:</span>
                            <input type="text" value="${col.class || ''}"
                                   data-col="${i}" data-prop="class" placeholder="my-class"
                                   style="flex: 1; padding: 4px 8px; border: 1px solid #cbd5e0; border-radius: 4px;">
                        </label>
                    </div>
                </div>
            `;
        }

        list.innerHTML = html;
        modal.style.display = 'flex';
    },

    closeColumnPropertiesPanel() {
        const modal = document.getElementById('columnPropertiesModal');
        modal.style.display = 'none';
    },

    applyColumnProperties() {
        const inputs = document.querySelectorAll('#columnPropertiesList input');

        inputs.forEach(input => {
            const colIndex = parseInt(input.getAttribute('data-col'));
            const prop = input.getAttribute('data-prop');
            const value = input.value;

            if (!this.columnGroups[colIndex]) {
                this.columnGroups[colIndex] = { span: 1, style: '', class: '' };
            }

            if (prop === 'span') {
                this.columnGroups[colIndex][prop] = parseInt(value) || 1;
            } else {
                this.columnGroups[colIndex][prop] = value;
            }
        });

        this.closeColumnPropertiesPanel();
        this.updateCode();
        this.saveHistory();
        this.showToast('列プロパティを適用しました');
    },

    // ========== Tag Attributes Functions ==========

    // Helper: Convert attributes object to tag string
    attributesToString(attrs) {
        return Object.entries(attrs)
            .filter(([key, value]) => value && value.trim() !== '')
            .map(([key, value]) => `${key}="${value}"`)
            .join(' ');
    },

    // Helper: Parse tag string to attributes object
    parseTagString(tagString) {
        const attrs = {};
        // Match attribute="value" or attribute='value' or attribute=value
        // This regex handles: data-*, aria-*, and any hyphenated attributes
        const attrRegex = /([\w-]+)=(?:"([^"]*)"|'([^']*)'|([^\s>]*))/g;
        let match;
        while ((match = attrRegex.exec(tagString)) !== null) {
            const attrName = match[1];
            const attrValue = match[2] || match[3] || match[4] || '';
            attrs[attrName] = attrValue;
        }
        return attrs;
    },

    openTablePropertiesModal() {
        const modal = document.getElementById('tablePropertiesModal');
        const editor = document.getElementById('tableTagEditor');

        // Generate tag string from current attributes
        editor.value = this.attributesToString(this.tableAttributes);

        modal.style.display = 'flex';
    },

    closeTablePropertiesModal() {
        document.getElementById('tablePropertiesModal').style.display = 'none';
    },

    applyTableProperties() {
        const editor = document.getElementById('tableTagEditor');
        const tagString = editor.value.trim();

        // Parse the tag string and store all attributes
        this.tableAttributes = this.parseTagString(tagString);

        this.closeTablePropertiesModal();
        this.updateCode();
        this.saveHistory();
        this.showToast('テーブル属性を適用しました');
    },

    openRowPropertiesModal() {
        if (this.selectedCells.length === 0) {
            this.showToast('行を選択してください', 'error');
            return;
        }

        const modal = document.getElementById('rowPropertiesModal');
        const editor = document.getElementById('rowTagEditor');
        const rowIndex = this.selectedCells[0].parentNode.rowIndex;

        // Get current row attributes or defaults
        const rowAttrs = this.rowAttributes[rowIndex] || {};

        // Generate tag string from current attributes
        editor.value = this.attributesToString(rowAttrs);

        modal.style.display = 'flex';
    },

    closeRowPropertiesModal() {
        document.getElementById('rowPropertiesModal').style.display = 'none';
    },

    applyRowProperties() {
        if (this.selectedCells.length === 0) {
            this.showToast('行を選択してください', 'error');
            return;
        }

        const editor = document.getElementById('rowTagEditor');
        const tagString = editor.value.trim();

        // Parse the tag string
        const parsedAttrs = this.parseTagString(tagString);

        // Get unique row indices from selected cells
        const rowIndices = [...new Set(this.selectedCells.map(cell => cell.parentNode.rowIndex))];

        // Apply to all selected rows
        rowIndices.forEach(rowIndex => {
            this.rowAttributes[rowIndex] = parsedAttrs;
        });

        this.closeRowPropertiesModal();
        this.updateCode();
        this.saveHistory();
        this.showToast(`${rowIndices.length}行の属性を適用しました`);
    },

    openSectionPropertiesModal() {
        const modal = document.getElementById('sectionPropertiesModal');
        const sectionSelect = document.getElementById('sectionSelect');
        const editor = document.getElementById('sectionTagEditor');

        // Load current section's attributes
        this.loadSectionTagEditor();

        modal.style.display = 'flex';
    },

    loadSectionTagEditor() {
        const sectionSelect = document.getElementById('sectionSelect');
        const editor = document.getElementById('sectionTagEditor');
        const section = sectionSelect.value || 'thead';
        const attrs = this.sectionAttributes[section] || {};

        // Generate tag string from current attributes
        editor.value = this.attributesToString(attrs);
    },

    closeSectionPropertiesModal() {
        document.getElementById('sectionPropertiesModal').style.display = 'none';
    },

    applySectionProperties() {
        const section = document.getElementById('sectionSelect').value;
        const editor = document.getElementById('sectionTagEditor');
        const tagString = editor.value.trim();

        // Parse the tag string
        this.sectionAttributes[section] = this.parseTagString(tagString);

        this.closeSectionPropertiesModal();
        this.updateCode();
        this.saveHistory();
        this.showToast(`${section}セクション属性を適用しました`);
    },

    openCaptionPropertiesModal() {
        if (!this.caption || this.caption.trim() === '') {
            this.showToast('まずキャプションを入力してください', 'error');
            return;
        }

        const modal = document.getElementById('captionPropertiesModal');
        const editor = document.getElementById('captionTagEditor');

        // Generate tag string from current attributes
        editor.value = this.attributesToString(this.captionAttributes);

        modal.style.display = 'flex';
    },

    closeCaptionPropertiesModal() {
        document.getElementById('captionPropertiesModal').style.display = 'none';
    },

    applyCaptionProperties() {
        const editor = document.getElementById('captionTagEditor');
        const tagString = editor.value.trim();

        // Parse the tag string
        this.captionAttributes = this.parseTagString(tagString);

        this.closeCaptionPropertiesModal();
        this.updateCode();
        this.saveHistory();
        this.showToast('キャプション属性を適用しました');
    },

    openCellAttributesModal() {
        if (this.selectedCells.length === 0) {
            this.showToast('セルを選択してください', 'error');
            return;
        }

        const modal = document.getElementById('cellAttributesModal');
        const editor = document.getElementById('cellTagEditor');
        const cell = this.selectedCells[0];

        // Get all attributes from the cell (excluding internal ones)
        const attrs = {};
        const excludeAttrs = ['contenteditable', 'role', 'tabindex'];
        const excludeClasses = ['selected', 'dragging', 'drag-over', 'on-border', 'header-cell'];

        Array.from(cell.attributes).forEach(attr => {
            if (!excludeAttrs.includes(attr.name)) {
                if (attr.name === 'class') {
                    // Filter out internal classes
                    const classes = Array.from(cell.classList).filter(cls => !excludeClasses.includes(cls));
                    if (classes.length > 0) {
                        attrs['class'] = classes.join(' ');
                    }
                } else {
                    attrs[attr.name] = attr.value;
                }
            }
        });

        // Generate tag string from current attributes
        editor.value = this.attributesToString(attrs);

        modal.style.display = 'flex';
    },

    closeCellAttributesModal() {
        document.getElementById('cellAttributesModal').style.display = 'none';
    },

    applyCellAttributes() {
        if (this.selectedCells.length === 0) {
            this.showToast('セルを選択してください', 'error');
            return;
        }

        const editor = document.getElementById('cellTagEditor');
        const tagString = editor.value.trim();

        // Parse the tag string
        const parsedAttrs = this.parseTagString(tagString);

        // Apply to all selected cells
        this.selectedCells.forEach(cell => {
            // Check if this cell is a header before removing attributes
            const wasHeader = cell.classList.contains('header-cell');

            // Remove all existing attributes except contenteditable
            const attributesToRemove = [];
            Array.from(cell.attributes).forEach(attr => {
                if (attr.name !== 'contenteditable') {
                    attributesToRemove.push(attr.name);
                }
            });
            attributesToRemove.forEach(attrName => cell.removeAttribute(attrName));

            // Apply new attributes from parsed string
            Object.entries(parsedAttrs).forEach(([key, value]) => {
                if (key === 'class') {
                    // Set the new class, then restore header-cell if it was there before
                    cell.className = value;
                    if (wasHeader && !cell.classList.contains('header-cell')) {
                        cell.classList.add('header-cell');
                    }
                } else if (key === 'rowspan') {
                    cell.rowSpan = parseInt(value) || 1;
                } else if (key === 'colspan') {
                    cell.colSpan = parseInt(value) || 1;
                } else {
                    cell.setAttribute(key, value);
                }
            });

            // If no class was specified but it was a header, preserve header-cell
            if (!parsedAttrs.class && wasHeader) {
                cell.classList.add('header-cell');
            }

            // Ensure contenteditable is set
            cell.contentEditable = true;
        });

        this.closeCellAttributesModal();
        this.updateCode();
        this.saveHistory();
        this.showToast(`${this.selectedCells.length}個のセルの属性を適用しました`);
    },

    // ========== Pattern Management Functions ==========

    loadPatterns() {
        try {
            const saved = localStorage.getItem('htmlTableMaker_patterns');
            if (saved) {
                this.patterns = JSON.parse(saved);
            }
        } catch (error) {
            console.error('パターン読み込みエラー:', error);
            this.patterns = {};
        }
    },

    savePatternsToStorage() {
        try {
            localStorage.setItem('htmlTableMaker_patterns', JSON.stringify(this.patterns));
        } catch (error) {
            console.error('パターン保存エラー:', error);
            this.showToast('パターンの保存に失敗しました', 'error');
        }
    },

    openPatternManager() {
        const modal = document.getElementById('patternManagerModal');
        this.renderPatternList();
        modal.style.display = 'flex';
    },

    closePatternManager() {
        document.getElementById('patternManagerModal').style.display = 'none';
    },

    renderPatternList() {
        const list = document.getElementById('patternList');
        const patternNames = Object.keys(this.patterns);

        if (patternNames.length === 0) {
            list.innerHTML = '<p style="text-align: center; color: #718096; padding: 40px;">パターンがまだありません。新規作成してください。</p>';
            return;
        }

        let html = '';
        patternNames.forEach(name => {
            const pattern = this.patterns[name];
            const enabledTags = Object.keys(pattern.enabled).filter(tag => pattern.enabled[tag]);

            html += `
                <div style="border: 1px solid #e2e8f0; padding: 15px; border-radius: 8px; background: white;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                        <h4 style="margin: 0; color: #2d3748; font-size: 16px;">${name}</h4>
                        <div style="display: flex; gap: 8px;">
                            <button onclick="tableBuilder.applyPattern('${name.replace(/'/g, "\\\'")}')"
                                    class="primary" style="padding: 6px 12px; font-size: 13px;">適用</button>
                            <button onclick="tableBuilder.editPattern('${name.replace(/'/g, "\\\'")}')"
                                    style="padding: 6px 12px; font-size: 13px;">編集</button>
                            <button onclick="tableBuilder.deletePattern('${name.replace(/'/g, "\\\'")}')"
                                    class="danger" style="padding: 6px 12px; font-size: 13px;">削除</button>
                        </div>
                    </div>
                    <div style="font-size: 12px; color: #718096;">
                        含まれるタグ: ${enabledTags.map(tag => `<code style="background: #edf2f7; padding: 2px 6px; border-radius: 3px;">${tag}</code>`).join(' ')}
                    </div>
                </div>
            `;
        });

        list.innerHTML = html;
    },

    createNewPattern() {
        this.currentEditingPattern = null;
        this.openPatternEditor(null);
    },

    editPattern(name) {
        this.currentEditingPattern = name;
        this.openPatternEditor(this.patterns[name]);
    },

    deletePattern(name) {
        if (confirm(`パターン「${name}」を削除しますか？`)) {
            delete this.patterns[name];
            this.savePatternsToStorage();
            this.renderPatternList();
            this.showToast('パターンを削除しました');
        }
    },

    openPatternEditor(patternData) {
        const modal = document.getElementById('patternEditorModal');
        const title = document.getElementById('patternEditorTitle');
        const nameInput = document.getElementById('patternNameInput');
        const container = document.getElementById('patternAttributesContainer');

        // Set title
        title.textContent = patternData ? 'パターン編集' : '新規パターン作成';

        // Set name
        nameInput.value = this.currentEditingPattern || '';
        nameInput.disabled = !!this.currentEditingPattern;

        // Define all tag types
        const tags = [
            { name: 'table', label: '&lt;table&gt;', placeholder: 'class="my-table" border="1"' },
            { name: 'caption', label: '&lt;caption&gt;', placeholder: 'class="caption" style="text-align: left;"' },
            { name: 'thead', label: '&lt;thead&gt;', placeholder: 'class="table-header"' },
            { name: 'tbody', label: '&lt;tbody&gt;', placeholder: 'class="table-body"' },
            { name: 'tfoot', label: '&lt;tfoot&gt;', placeholder: 'class="table-footer"' },
            { name: 'tr', label: '&lt;tr&gt;', placeholder: 'class="row" style="height: 40px;"' },
            { name: 'td', label: '&lt;td&gt;', placeholder: 'class="cell" data-type="text"' },
            { name: 'th', label: '&lt;th&gt;', placeholder: 'class="header-cell" scope="col"' }
        ];

        // Render attribute editors
        let html = '';
        tags.forEach(tag => {
            const isEnabled = patternData?.enabled?.[tag.name] || false;
            const attrValue = patternData?.attributes?.[tag.name] || '';

            html += `
                <div style="border: 1px solid #e2e8f0; padding: 12px; border-radius: 6px; background: #f7fafc;">
                    <label style="display: flex; align-items: center; gap: 10px; cursor: pointer; margin-bottom: 8px;">
                        <input type="checkbox" id="pattern_enable_${tag.name}"
                               ${isEnabled ? 'checked' : ''}
                               onchange="tableBuilder.togglePatternTag('${tag.name}')"
                               style="width: 18px; height: 18px; cursor: pointer;">
                        <span style="font-weight: 600; color: #2d3748; font-family: monospace;">${tag.label}</span>
                    </label>
                    <textarea id="pattern_attr_${tag.name}"
                              placeholder="${tag.placeholder}"
                              ${!isEnabled ? 'disabled' : ''}
                              style="width: 100%; padding: 8px; border: 1px solid #cbd5e0; border-radius: 4px;
                                     font-family: monospace; font-size: 12px; min-height: 50px; resize: vertical;
                                     ${!isEnabled ? 'background: #e2e8f0; color: #a0aec0;' : ''}">${attrValue}</textarea>
                </div>
            `;
        });

        container.innerHTML = html;
        modal.style.display = 'flex';
    },

    togglePatternTag(tagName) {
        const checkbox = document.getElementById(`pattern_enable_${tagName}`);
        const textarea = document.getElementById(`pattern_attr_${tagName}`);

        if (checkbox.checked) {
            textarea.disabled = false;
            textarea.style.background = '';
            textarea.style.color = '';
        } else {
            textarea.disabled = true;
            textarea.style.background = '#e2e8f0';
            textarea.style.color = '#a0aec0';
        }
    },

    closePatternEditor() {
        document.getElementById('patternEditorModal').style.display = 'none';
        this.currentEditingPattern = null;
    },

    savePattern() {
        const nameInput = document.getElementById('patternNameInput');
        const patternName = nameInput.value.trim();

        if (!patternName) {
            this.showToast('パターン名を入力してください', 'error');
            return;
        }

        // Check if name already exists (only for new patterns)
        if (!this.currentEditingPattern && this.patterns[patternName]) {
            this.showToast('同じ名前のパターンが既に存在します', 'error');
            return;
        }

        const tags = ['table', 'caption', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th'];
        const pattern = {
            enabled: {},
            attributes: {}
        };

        let hasEnabledTags = false;

        tags.forEach(tag => {
            const checkbox = document.getElementById(`pattern_enable_${tag}`);
            const textarea = document.getElementById(`pattern_attr_${tag}`);

            pattern.enabled[tag] = checkbox.checked;
            pattern.attributes[tag] = textarea.value.trim();

            if (checkbox.checked) {
                hasEnabledTags = true;
            }
        });

        if (!hasEnabledTags) {
            this.showToast('少なくとも1つのタグを有効にしてください', 'error');
            return;
        }

        // If editing, delete old pattern if name changed
        if (this.currentEditingPattern && this.currentEditingPattern !== patternName) {
            delete this.patterns[this.currentEditingPattern];
        }

        this.patterns[patternName] = pattern;
        this.savePatternsToStorage();
        this.closePatternEditor();
        this.renderPatternList();
        this.showToast(`パターン「${patternName}」を保存しました`);
    },

    // ========== Import/Export Functions ==========

    exportPatterns() {
        if (Object.keys(this.patterns).length === 0) {
            this.showToast('エクスポートするパターンがありません', 'error');
            return;
        }

        try {
            const dataStr = JSON.stringify(this.patterns, null, 2);
            const blob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            const timestamp = new Date().toISOString().slice(0, 10);
            link.download = `table-patterns-${timestamp}.json`;
            link.click();
            URL.revokeObjectURL(url);
            this.showToast('パターンをエクスポートしました');
        } catch (error) {
            console.error('エクスポートエラー:', error);
            this.showToast('エクスポートに失敗しました', 'error');
        }
    },

    importPatterns() {
        document.getElementById('patternImportFile').click();
    },

    handleImportFile(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const importedPatterns = JSON.parse(e.target.result);

                // Validate structure
                if (typeof importedPatterns !== 'object' || importedPatterns === null) {
                    this.showToast('無効なファイル形式です', 'error');
                    return;
                }

                // Check for conflicts
                const conflicts = Object.keys(importedPatterns).filter(name => this.patterns[name]);

                if (conflicts.length > 0) {
                    const message = `既存のパターン (${conflicts.join(', ')}) と重複しています。上書きしますか？`;
                    if (!confirm(message)) {
                        event.target.value = ''; // Reset file input
                        return;
                    }
                }

                // Merge patterns
                this.patterns = { ...this.patterns, ...importedPatterns };
                this.savePatternsToStorage();
                this.renderPatternList();
                this.showToast(`${Object.keys(importedPatterns).length}個のパターンをインポートしました`);

            } catch (error) {
                console.error('インポートエラー:', error);
                this.showToast('ファイルの読み込みに失敗しました', 'error');
            }

            event.target.value = ''; // Reset file input
        };

        reader.readAsText(file);
    },

    // ========== Preview Functions ==========

    applyPattern(name) {
        // Store pattern name for preview
        this.pendingPatternName = name;
        this.showPatternPreview(name);
    },

    showPatternPreview(name) {
        const pattern = this.patterns[name];
        if (!pattern) {
            this.showToast('パターンが見つかりません', 'error');
            return;
        }

        const modal = document.getElementById('patternPreviewModal');
        const patternNameEl = document.getElementById('patternPreviewPatternName');
        const contentEl = document.getElementById('patternPreviewContent');

        patternNameEl.textContent = `パターン「${name}」を適用します`;

        let html = '';
        let changesCount = 0;

        // Table-level changes
        if (pattern.enabled.table && pattern.attributes.table) {
            const current = this.attributesToString(this.tableAttributes);
            const newAttrs = pattern.attributes.table;
            html += this.generatePreviewItem('table', '&lt;table&gt;', current, newAttrs);
            changesCount++;
        }

        if (pattern.enabled.caption && pattern.attributes.caption) {
            const current = this.attributesToString(this.captionAttributes);
            const newAttrs = pattern.attributes.caption;
            html += this.generatePreviewItem('caption', '&lt;caption&gt;', current, newAttrs);
            changesCount++;
        }

        ['thead', 'tbody', 'tfoot'].forEach(section => {
            if (pattern.enabled[section] && pattern.attributes[section]) {
                const current = this.attributesToString(this.sectionAttributes[section]);
                const newAttrs = pattern.attributes[section];
                html += this.generatePreviewItem(section, `&lt;${section}&gt;`, current, newAttrs);
                changesCount++;
            }
        });

        // Row-level changes
        if (pattern.enabled.tr && pattern.attributes.tr) {
            if (this.selectedCells.length === 0) {
                html += `
                    <div style="background: #fff5f5; border-left: 4px solid #fc8181; padding: 12px; border-radius: 4px;">
                        <strong style="color: #c53030;">&lt;tr&gt; (行)</strong>
                        <p style="margin: 5px 0 0 0; font-size: 13px; color: #742a2a;">⚠️ セルを選択してください</p>
                    </div>
                `;
            } else {
                const rowIndices = [...new Set(this.selectedCells.map(cell => cell.parentNode.rowIndex))];
                const newAttrs = pattern.attributes.tr;
                html += `
                    <div style="background: #f0fff4; border-left: 4px solid #48bb78; padding: 12px; border-radius: 4px;">
                        <strong style="color: #22543d;">&lt;tr&gt; (${rowIndices.length}行)</strong>
                        <p style="margin: 5px 0 0 0; font-size: 13px; color: #276749;">→ ${newAttrs || '(空)'}</p>
                    </div>
                `;
                changesCount++;
            }
        }

        // Cell-level changes
        if ((pattern.enabled.td || pattern.enabled.th) && this.selectedCells.length > 0) {
            const tdCells = this.selectedCells.filter(cell => !cell.classList.contains('header-cell'));
            const thCells = this.selectedCells.filter(cell => cell.classList.contains('header-cell'));

            if (pattern.enabled.td && pattern.attributes.td && tdCells.length > 0) {
                const newAttrs = pattern.attributes.td;
                html += `
                    <div style="background: #f0fff4; border-left: 4px solid #48bb78; padding: 12px; border-radius: 4px;">
                        <strong style="color: #22543d;">&lt;td&gt; (${tdCells.length}セル)</strong>
                        <p style="margin: 5px 0 0 0; font-size: 13px; color: #276749;">→ ${newAttrs || '(空)'}</p>
                    </div>
                `;
                changesCount++;
            }

            if (pattern.enabled.th && pattern.attributes.th && thCells.length > 0) {
                const newAttrs = pattern.attributes.th;
                html += `
                    <div style="background: #f0fff4; border-left: 4px solid #48bb78; padding: 12px; border-radius: 4px;">
                        <strong style="color: #22543d;">&lt;th&gt; (${thCells.length}セル)</strong>
                        <p style="margin: 5px 0 0 0; font-size: 13px; color: #276749;">→ ${newAttrs || '(空)'}</p>
                    </div>
                `;
                changesCount++;
            }
        } else if ((pattern.enabled.td || pattern.enabled.th) && this.selectedCells.length === 0) {
            html += `
                <div style="background: #fff5f5; border-left: 4px solid #fc8181; padding: 12px; border-radius: 4px;">
                    <strong style="color: #c53030;">&lt;td/th&gt; (セル)</strong>
                    <p style="margin: 5px 0 0 0; font-size: 13px; color: #742a2a;">⚠️ セルを選択してください</p>
                </div>
            `;
        }

        if (changesCount === 0) {
            html = `
                <div style="text-align: center; padding: 40px; color: #718096;">
                    適用可能な変更がありません
                </div>
            `;
        }

        contentEl.innerHTML = html;
        modal.style.display = 'flex';
    },

    generatePreviewItem(tag, label, current, newValue) {
        return `
            <div style="background: #f7fafc; border: 1px solid #e2e8f0; padding: 12px; border-radius: 4px;">
                <strong style="color: #2d3748;">${label}</strong>
                <div style="margin-top: 8px; font-size: 12px; font-family: monospace;">
                    <div style="color: #718096;">現在: ${current || '(なし)'}</div>
                    <div style="color: #2d3748; margin-top: 4px;">→ 新規: ${newValue || '(空)'}</div>
                </div>
            </div>
        `;
    },

    closePatternPreview() {
        document.getElementById('patternPreviewModal').style.display = 'none';
        this.pendingPatternName = null;
    },

    confirmApplyPattern() {
        if (!this.pendingPatternName) return;

        const name = this.pendingPatternName;
        const pattern = this.patterns[name];
        if (!pattern) {
            this.showToast('パターンが見つかりません', 'error');
            return;
        }

        let appliedCount = 0;

        // Apply table-level attributes (immediate, whole table)
        if (pattern.enabled.table && pattern.attributes.table) {
            this.tableAttributes = this.parseTagString(pattern.attributes.table);
            appliedCount++;
        }

        if (pattern.enabled.caption && pattern.attributes.caption) {
            this.captionAttributes = this.parseTagString(pattern.attributes.caption);
            appliedCount++;
        }

        ['thead', 'tbody', 'tfoot'].forEach(section => {
            if (pattern.enabled[section] && pattern.attributes[section]) {
                this.sectionAttributes[section] = this.parseTagString(pattern.attributes[section]);
                appliedCount++;
            }
        });

        // Apply row attributes (only to selected rows)
        if (pattern.enabled.tr && pattern.attributes.tr) {
            if (this.selectedCells.length === 0) {
                this.showToast('行属性を適用するにはセルを選択してください', 'error');
            } else {
                const rowIndices = [...new Set(this.selectedCells.map(cell => cell.parentNode.rowIndex))];
                const parsedAttrs = this.parseTagString(pattern.attributes.tr);

                rowIndices.forEach(rowIndex => {
                    this.rowAttributes[rowIndex] = parsedAttrs;
                });
                appliedCount++;
            }
        }

        // Apply cell attributes (only to selected cells)
        if ((pattern.enabled.td || pattern.enabled.th) && this.selectedCells.length > 0) {
            this.selectedCells.forEach(cell => {
                const isHeader = cell.classList.contains('header-cell');
                const tagToUse = isHeader ? 'th' : 'td';

                if (pattern.enabled[tagToUse] && pattern.attributes[tagToUse]) {
                    const parsedAttrs = this.parseTagString(pattern.attributes[tagToUse]);

                    // Remove all existing attributes except contenteditable
                    const attributesToRemove = [];
                    Array.from(cell.attributes).forEach(attr => {
                        if (attr.name !== 'contenteditable') {
                            attributesToRemove.push(attr.name);
                        }
                    });
                    attributesToRemove.forEach(attrName => cell.removeAttribute(attrName));

                    // Apply new attributes
                    Object.entries(parsedAttrs).forEach(([key, value]) => {
                        if (key === 'class') {
                            cell.className = value;
                            if (isHeader) cell.classList.add('header-cell');
                        } else if (key === 'rowspan') {
                            cell.rowSpan = parseInt(value) || 1;
                        } else if (key === 'colspan') {
                            cell.colSpan = parseInt(value) || 1;
                        } else {
                            cell.setAttribute(key, value);
                        }
                    });

                    if (!parsedAttrs.class && isHeader) {
                        cell.classList.add('header-cell');
                    }

                    cell.contentEditable = true;
                }
            });
            appliedCount++;
        }

        if (appliedCount > 0) {
            this.closePatternPreview();
            this.updateCode();
            this.saveHistory();
            this.showToast(`パターン「${name}」を適用しました`);
        } else {
            this.closePatternPreview();
            this.showToast('適用可能な属性がありませんでした', 'error');
        }

        this.pendingPatternName = null;
    }
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    tableBuilder.init();
});
