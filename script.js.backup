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

    init() {
        this.table = document.getElementById('editorTable');
        this.setupEventListeners();
        this.updateCode();
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

        // Update code on any change
        this.table.addEventListener('input', () => this.updateCode());
        this.table.addEventListener('blur', () => this.updateCode(), true);
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
        this.dragGhost.textContent = `Swapping ${this.selectedCells.length} cell${this.selectedCells.length > 1 ? 's' : ''}`;
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
            this.showToast('Cannot drop cells here', 'error');
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
            this.showToast('Cannot swap: target area goes beyond table rows', 'error');
            return;
        }

        const maxCols = Math.max(...Array.from(this.table.rows).map(row => row.cells.length));
        if (startCol + colCount > maxCols) {
            this.showToast('Cannot swap: target area goes beyond table columns', 'error');
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
            pair.source.setAttribute('style', pair.targetData.style);
            pair.source.className = '';
            pair.source.contentEditable = true;
            pair.targetData.classes.forEach(cls => pair.source.classList.add(cls));
            pair.source.rowSpan = pair.targetData.rowSpan;
            pair.source.colSpan = pair.targetData.colSpan;

            // Apply source data to target cell
            pair.target.innerHTML = pair.sourceData.content;
            pair.target.setAttribute('style', pair.sourceData.style);
            pair.target.className = '';
            pair.target.contentEditable = true;
            pair.sourceData.classes.forEach(cls => pair.target.classList.add(cls));
            pair.target.rowSpan = pair.sourceData.rowSpan;
            pair.target.colSpan = pair.sourceData.colSpan;
        });

        // Clear selection
        this.clearSelection();

        // Update code
        this.updateCode();

        this.showToast(`Swapped ${swapPairs.length} cell${swapPairs.length > 1 ? 's' : ''} successfully!`);
    },

    clearSelection() {
        this.selectedCells.forEach(cell => cell.classList.remove('selected'));
        this.selectedCells = [];
        // Don't close HTML editor when clearing selection
    },

    addRow() {
        const colCount = this.table.rows[0]?.cells.length || 3;
        const row = this.table.insertRow();
        for (let i = 0; i < colCount; i++) {
            const cell = row.insertCell();
            cell.contentEditable = true;
            cell.textContent = 'New Cell';
        }
        this.updateCode();
        this.showToast('Row added');
    },

    addColumn() {
        const rows = this.table.rows;
        for (let i = 0; i < rows.length; i++) {
            const cell = rows[i].insertCell();
            cell.contentEditable = true;
            cell.textContent = 'New Cell';
        }
        this.updateCode();
        this.showToast('Column added');
    },

    deleteRow() {
        if (this.selectedCells.length === 0) {
            this.showToast('Select a cell first', 'error');
            return;
        }

        const rowIndex = this.selectedCells[0].parentNode.rowIndex;
        if (this.table.rows.length > 1) {
            this.table.deleteRow(rowIndex);
            this.clearSelection();
            this.updateCode();
            this.showToast('Row deleted');
        } else {
            this.showToast('Cannot delete the last row', 'error');
        }
    },

    deleteColumn() {
        if (this.selectedCells.length === 0) {
            this.showToast('Select a cell first', 'error');
            return;
        }

        const cellIndex = this.selectedCells[0].cellIndex;
        const rows = this.table.rows;

        if (rows[0].cells.length > 1) {
            for (let i = 0; i < rows.length; i++) {
                rows[i].deleteCell(cellIndex);
            }
            this.clearSelection();
            this.updateCode();
            this.showToast('Column deleted');
        } else {
            this.showToast('Cannot delete the last column', 'error');
        }
    },

    mergeCells() {
        if (this.selectedCells.length < 2) {
            this.showToast('Select at least 2 cells to merge', 'error');
            return;
        }

        // Sort cells by position
        this.selectedCells.sort((a, b) => {
            const rowDiff = a.parentNode.rowIndex - b.parentNode.rowIndex;
            return rowDiff !== 0 ? rowDiff : a.cellIndex - b.cellIndex;
        });

        const firstCell = this.selectedCells[0];
        const lastCell = this.selectedCells[this.selectedCells.length - 1];

        // Calculate rowspan and colspan
        const rowStart = firstCell.parentNode.rowIndex;
        const rowEnd = lastCell.parentNode.rowIndex;
        const colStart = firstCell.cellIndex;
        const colEnd = lastCell.cellIndex;

        const rowspan = rowEnd - rowStart + 1;
        const colspan = colEnd - colStart + 1;

        // Merge content
        const content = this.selectedCells.map(cell => cell.textContent.trim()).join(' ');
        firstCell.textContent = content;
        firstCell.rowSpan = rowspan;
        firstCell.colSpan = colspan;

        // Remove other cells
        for (let i = 1; i < this.selectedCells.length; i++) {
            this.selectedCells[i].remove();
        }

        this.clearSelection();
        this.updateCode();
        this.showToast('Cells merged');
    },

    splitCell() {
        if (this.selectedCells.length !== 1) {
            this.showToast('Select exactly one cell to split', 'error');
            return;
        }

        const cell = this.selectedCells[0];
        if (cell.rowSpan === 1 && cell.colSpan === 1) {
            this.showToast('Cell is not merged', 'error');
            return;
        }

        cell.rowSpan = 1;
        cell.colSpan = 1;

        this.clearSelection();
        this.updateCode();
        this.showToast('Cell split (note: you may need to manually add cells back)');
    },

    toggleHeader() {
        if (this.selectedCells.length === 0) {
            this.showToast('Select cells to toggle header style', 'error');
            return;
        }

        this.selectedCells.forEach(cell => {
            cell.classList.toggle('header-cell');
        });

        this.updateCode();
        this.showToast('Header style toggled');
    },

    openHtmlEditor() {
        if (this.selectedCells.length === 0) {
            this.showToast('Select a cell to edit its HTML', 'error');
            return;
        }

        if (this.selectedCells.length > 1) {
            this.showToast('Please select only one cell to edit HTML', 'error');
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

        this.showToast('HTML editor opened - click other cells to switch between them');
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

        // Only remove 'selected' class for display
        clone.classList.remove('selected');

        // Get the cell HTML without formatting
        let cellHtml = clone.outerHTML;

        // Set the editor content to the complete cell HTML
        editor.value = cellHtml;
    },

    applyCellHtml() {
        if (!this.editingCell) {
            return;
        }

        try {
            const editor = document.getElementById('cellHtmlEditor');
            const newHtml = editor.value.trim();

            if (!newHtml) {
                this.showToast('HTML cannot be empty', 'error');
                return;
            }

            // Create a temporary table to properly parse td/th elements
            // (td/th elements need to be inside a table structure to parse correctly)
            const tempTable = document.createElement('table');
            const tempRow = document.createElement('tr');
            tempTable.appendChild(tempRow);
            tempRow.innerHTML = newHtml;

            // Get the first cell from the temp row
            const newCell = tempRow.firstElementChild;

            if (!newCell) {
                this.showToast('Invalid HTML: Could not parse cell element', 'error');
                return;
            }

            const tagName = newCell.tagName.toUpperCase();
            if (tagName !== 'TD' && tagName !== 'TH') {
                this.showToast(`Invalid HTML: Must be a <td> or <th> element (found <${tagName.toLowerCase()}>)`, 'error');
                return;
            }

            // Make the new cell editable
            newCell.contentEditable = true;

            // If it's a TH, add the header-cell class for styling
            if (tagName === 'TH') {
                newCell.classList.add('header-cell');
            }

            // Replace the old cell with the new one
            this.editingCellParent.replaceChild(newCell, this.editingCell);

            // Update selection to the new cell
            this.clearSelection();
            this.selectCell(newCell);

            // Update the editor content to reflect the new cell
            this.updateHtmlEditorContent(newCell);

            // Update the code output
            this.updateCode();

            this.showToast('Cell HTML updated successfully!');

        } catch (error) {
            this.showToast('Error applying cell HTML: ' + error.message, 'error');
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

    applyStyle(property, value) {
        if (this.selectedCells.length === 0) {
            this.showToast('Select cells to apply styling', 'error');
            return;
        }

        this.selectedCells.forEach(cell => {
            cell.style[property] = value;
        });

        this.updateCode();
    },

    clearTable() {
        if (confirm('Clear all table content?')) {
            this.table.innerHTML = `
                <tr>
                    <td contenteditable="true">Cell 1</td>
                    <td contenteditable="true">Cell 2</td>
                    <td contenteditable="true">Cell 3</td>
                </tr>
                <tr>
                    <td contenteditable="true">Cell 4</td>
                    <td contenteditable="true">Cell 5</td>
                    <td contenteditable="true">Cell 6</td>
                </tr>
            `;
            this.clearSelection();
            this.updateCode();
            this.showToast('Table cleared');
        }
    },

    updateCode() {
        const clone = this.table.cloneNode(true);

        // Remove editor-specific attributes
        clone.querySelectorAll('td').forEach(cell => {
            cell.removeAttribute('contenteditable');
            cell.classList.remove('selected');

            // Convert header-cell class to th
            if (cell.classList.contains('header-cell')) {
                const th = document.createElement('th');
                th.innerHTML = cell.innerHTML;
                th.setAttribute('style', cell.getAttribute('style') || '');
                if (cell.rowSpan > 1) th.rowSpan = cell.rowSpan;
                if (cell.colSpan > 1) th.colSpan = cell.colSpan;
                cell.parentNode.replaceChild(th, cell);
            }
        });

        // Format HTML nicely
        let html = clone.outerHTML;
        html = this.formatHTML(html);

        document.getElementById('codeOutput').value = html;
    },

    applyCodeChanges() {
        try {
            const codeOutput = document.getElementById('codeOutput');
            const htmlCode = codeOutput.value.trim();

            // Create a temporary container to parse the HTML
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = htmlCode;

            // Get the table from the parsed HTML
            const newTable = tempDiv.querySelector('table');

            if (!newTable) {
                this.showToast('Invalid HTML: No table found', 'error');
                return;
            }

            // Clear the current table
            this.table.innerHTML = '';

            // Copy all rows from the new table
            Array.from(newTable.rows).forEach(row => {
                const newRow = this.table.insertRow();

                Array.from(row.cells).forEach(cell => {
                    const newCell = document.createElement('td');
                    newCell.innerHTML = cell.innerHTML;
                    newCell.contentEditable = true;

                    // Copy attributes
                    if (cell.rowSpan > 1) newCell.rowSpan = cell.rowSpan;
                    if (cell.colSpan > 1) newCell.colSpan = cell.colSpan;
                    if (cell.getAttribute('style')) {
                        newCell.setAttribute('style', cell.getAttribute('style'));
                    }

                    // Convert th to td with header-cell class
                    if (cell.tagName === 'TH') {
                        newCell.classList.add('header-cell');
                    }

                    newRow.appendChild(newCell);
                });
            });

            // Clear selection
            this.clearSelection();

            // Show success message
            this.showToast('Changes applied successfully!');

        } catch (error) {
            this.showToast('Error applying changes: ' + error.message, 'error');
            console.error('Error applying code changes:', error);
        }
    },

    formatHTML(html) {
        // Simple HTML formatting
        let formatted = '';
        let indent = 0;
        const tab = '  ';

        html = html.replace(/></g, '>\n<');
        const lines = html.split('\n');

        lines.forEach(line => {
            line = line.trim();
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
            this.showToast('Code copied to clipboard!');
        }).catch(() => {
            this.showToast('Failed to copy code', 'error');
        });
    },

    showToast(message, type = 'success') {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.style.background = type === 'error' ? '#f56565' : '#48bb78';
        toast.classList.add('show');

        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    tableBuilder.init();
});
