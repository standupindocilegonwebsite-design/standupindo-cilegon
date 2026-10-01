import { memo, useRef, useState } from 'react';
import type { FormEvent, RefObject } from 'react';
import { Columns3, Ellipsis, Minus, Plus, Rows3, Table2, Trash2 } from 'lucide-react';
import { parseMaterialContent, serializeMaterialContent, type MaterialContentBlock } from '@/lib/material-content';

type MaterialContentEditorProps = {
  value: string;
  onChange: (value: string) => void;
};

type MaterialContentSurfaceProps = {
  value: string;
  editorRef: RefObject<HTMLDivElement>;
  onInput: (event: FormEvent<HTMLDivElement>) => void;
};

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function textToHtml(value: string) {
  return escapeHtml(value).replace(/\n/g, '<br>');
}

function editorHtml(content: string) {
  const blocks = parseMaterialContent(content);
  if (!blocks.length) return '<p data-material-text="true" data-placeholder="Tulis materi kamu..."><br></p>';
  return blocks.map((block) => {
    if (block.type === 'text') return `<p data-material-text="true" data-placeholder="Tulis materi kamu...">${textToHtml(block.text) || '<br>'}</p>`;
    const columnCount = Math.max(1, ...block.rows.map((row) => row.length));
    const rows = block.rows.length ? block.rows : [Array(columnCount).fill('')];
    const tableRows = rows.map((row) => `<tr>${Array.from({ length: columnCount }, (_, columnIndex) => `<td data-material-cell="true" data-placeholder="Tulis">${textToHtml(row[columnIndex] ?? '') || '<br>'}</td>`).join('')}</tr>`).join('');
    return `<div data-material-table-object="true" class="my-3 max-w-full rounded-lg border border-slate-300 bg-white">
      <table class="w-full table-fixed border-collapse text-left text-base leading-6"><tbody>${tableRows}</tbody></table>
    </div>`;
  }).join('');
}

const MaterialContentSurface = memo(function MaterialContentSurface({ value, editorRef, onInput }: MaterialContentSurfaceProps) {
  return (
    <div
      ref={editorRef}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      aria-label="Tulis materi kamu"
      spellCheck
      onInput={onInput}
      style={{ minHeight: 400 }}
      className="material-note-editor min-h-[400px] w-full max-w-full overflow-hidden rounded-2xl border border-slate-300 bg-white px-4 py-4 text-base leading-7 text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 [&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_table]:w-full [&_table]:table-fixed [&_td]:min-h-14 [&_td]:border-b [&_td]:border-r [&_td]:border-slate-200 [&_td]:px-3.5 [&_td]:py-3 [&_td]:align-top [&_td]:[overflow-wrap:anywhere] [&_td:last-child]:border-r-0"
      dangerouslySetInnerHTML={{ __html: editorHtml(value) }}
    />
  );
}, () => true);

function plainText(element: HTMLElement) {
  return (element.innerText ?? element.textContent ?? '').replace(/\r/g, '').replace(/\n$/, '');
}

function createTextParagraph(text = '') {
  const paragraph = document.createElement('p');
  paragraph.dataset.materialText = 'true';
  paragraph.dataset.placeholder = 'Tulis materi kamu...';
  if (text) paragraph.textContent = text;
  else paragraph.append(document.createElement('br'));
  return paragraph;
}

function createTableObject() {
  const object = document.createElement('div');
  object.dataset.materialTableObject = 'true';
  object.className = 'my-3 max-w-full rounded-lg border border-slate-300 bg-white';
  const table = document.createElement('table');
  table.className = 'w-full table-fixed border-collapse text-left text-base leading-6';
  const body = table.createTBody();
  for (let rowIndex = 0; rowIndex < 2; rowIndex += 1) {
    const row = body.insertRow();
    for (let columnIndex = 0; columnIndex < 2; columnIndex += 1) {
      const cell = row.insertCell();
      cell.dataset.materialCell = 'true';
      cell.dataset.placeholder = 'Tulis';
      cell.className = 'min-h-14 border-b border-r border-slate-200 px-3.5 py-3 align-top [overflow-wrap:anywhere] last:border-r-0';
      cell.append(document.createElement('br'));
    }
  }
  object.append(table);
  return object;
}

function MaterialContentEditorView({ value, onChange }: MaterialContentEditorProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const activeCellRef = useRef<HTMLTableCellElement | null>(null);
  const activeTableRef = useRef<HTMLElement | null>(null);
  const [activeTable, setActiveTable] = useState<HTMLElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ left: 0, top: 0 });

  function readEditor(editor: HTMLDivElement) {
    const blocks: MaterialContentBlock[] = Array.from(editor.childNodes).flatMap((node) => {
      if (!(node instanceof HTMLElement)) {
        const text = node.textContent ?? '';
        return text ? [{ type: 'text' as const, text }] : [];
      }
      const tableObject = node.matches('[data-material-table-object]') ? node : node.querySelector<HTMLElement>('[data-material-table-object]');
      if (tableObject) {
        const rows = Array.from(tableObject.querySelectorAll('tr')).map((row) => Array.from(row.cells).map(plainText));
        return rows.length ? [{ type: 'table' as const, rows }] : [];
      }
      return [{ type: 'text' as const, text: plainText(node) }];
    });
    onChange(serializeMaterialContent(blocks));
  }

  function focusCell(cell: HTMLTableCellElement) {
    const editor = editorRef.current;
    if (!editor) return;
    activeCellRef.current = cell;
    editor.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(cell);
    range.collapse(false);
    selection?.removeAllRanges();
    selection?.addRange(range);
  }

  function selectTable(tableObject: HTMLElement, openMenu = false) {
    activeTableRef.current = tableObject;
    setActiveTable(tableObject);
    setMenuOpen(openMenu);
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const wrapperRect = wrapper.getBoundingClientRect();
    const tableRect = tableObject.getBoundingClientRect();
    setMenuPosition({
      left: Math.max(0, Math.min(wrapperRect.width - 44, tableRect.right - wrapperRect.left - 44)),
      top: Math.max(0, tableRect.top - wrapperRect.top + 4),
    });
  }

  function insertTable() {
    const editor = editorRef.current;
    if (!editor) return;
    const object = createTableObject();
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    const anchor = range?.commonAncestorContainer;
    const anchorElement = anchor instanceof HTMLElement ? anchor : anchor?.parentElement;
    const activeCell = anchorElement?.closest<HTMLTableCellElement>('[data-material-cell]');
    const paragraph = anchorElement?.closest<HTMLElement>('[data-material-text], p');

    if (activeCell && editor.contains(activeCell)) {
      const currentObject = activeCell.closest<HTMLElement>('[data-material-table-object]');
      currentObject?.after(object, createTextParagraph());
    } else if (range && editor.contains(range.commonAncestorContainer) && paragraph && editor.contains(paragraph)) {
      const beforeRange = range.cloneRange();
      beforeRange.selectNodeContents(paragraph);
      beforeRange.setEnd(range.startContainer, range.startOffset);
      const afterRange = range.cloneRange();
      afterRange.selectNodeContents(paragraph);
      afterRange.setStart(range.startContainer, range.startOffset);
      const beforeFragment = beforeRange.cloneContents();
      const afterFragment = afterRange.cloneContents();
      const beforeText = beforeFragment.textContent ?? '';
      const before = createTextParagraph();
      before.replaceChildren(beforeFragment);
      const after = createTextParagraph();
      after.replaceChildren(afterFragment);
      if (beforeText.trim()) paragraph.before(before);
      paragraph.replaceWith(object);
      object.after(after);
    } else if (range && editor.contains(range.commonAncestorContainer)) {
      range.deleteContents();
      range.insertNode(object);
      object.after(createTextParagraph());
    } else {
      editor.append(object, createTextParagraph());
    }

    selectTable(object);
    const firstCell = object.querySelector<HTMLTableCellElement>('[data-material-cell]');
    if (firstCell) focusCell(firstCell);
    readEditor(editor);
  }

  function updateTable(action: string, tableObject: HTMLElement) {
    const table = tableObject.querySelector('table');
    if (!table) return;

    if (action === 'remove-table') {
      const editor = editorRef.current;
      const nextParagraph = tableObject.nextElementSibling?.matches('[data-material-text]')
        ? tableObject.nextElementSibling as HTMLElement
        : createTextParagraph();
      if (!nextParagraph.isConnected) tableObject.after(nextParagraph);
      tableObject.remove();
      activeCellRef.current = null;
      activeTableRef.current = null;
      setActiveTable(null);
      setMenuOpen(false);
      editor?.focus();
      const range = document.createRange();
      range.selectNodeContents(nextParagraph);
      range.collapse(true);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      if (editor) readEditor(editor);
      return;
    }

    const activeCell = activeCellRef.current && tableObject.contains(activeCellRef.current)
      ? activeCellRef.current
      : table?.querySelector<HTMLTableCellElement>('[data-material-cell]') ?? null;
    if (!activeCell) return;
    const row = activeCell.parentElement as HTMLTableRowElement;
    const columnIndex = activeCell.cellIndex;
    let nextCell: HTMLTableCellElement | null = activeCell;

    if (action === 'add-row') {
      const newRow = table.tBodies[0].insertRow(row.rowIndex + 1);
      for (let index = 0; index < row.cells.length; index += 1) {
        const cell = newRow.insertCell();
        cell.dataset.materialCell = 'true';
        cell.dataset.placeholder = 'Tulis';
        cell.className = 'min-h-14 border-b border-r border-slate-200 px-3.5 py-3 align-top [overflow-wrap:anywhere] last:border-r-0';
        cell.append(document.createElement('br'));
      }
      nextCell = newRow.cells[Math.min(columnIndex, newRow.cells.length - 1)];
    } else if (action === 'add-column') {
      Array.from(table.rows).forEach((currentRow) => {
        const cell = currentRow.insertCell(columnIndex + 1);
        cell.dataset.materialCell = 'true';
        cell.dataset.placeholder = 'Tulis';
        cell.className = 'min-h-14 border-b border-r border-slate-200 px-3.5 py-3 align-top [overflow-wrap:anywhere] last:border-r-0';
        cell.append(document.createElement('br'));
      });
      nextCell = row.cells[columnIndex + 1];
    } else if (action === 'remove-row' && table.rows.length > 1) {
      const nextRowIndex = Math.min(row.rowIndex, table.rows.length - 2);
      table.deleteRow(row.rowIndex);
      nextCell = table.rows[nextRowIndex]?.cells[Math.min(columnIndex, table.rows[nextRowIndex].cells.length - 1)] ?? null;
    } else if (action === 'remove-column' && row.cells.length > 1) {
      Array.from(table.rows).forEach((currentRow) => currentRow.deleteCell(columnIndex));
      nextCell = row.cells[Math.min(columnIndex, row.cells.length - 1)] ?? null;
    }

    if (nextCell) focusCell(nextCell);
    const editor = editorRef.current;
    if (editor) readEditor(editor);
  }

  function handleClick(event: React.MouseEvent<HTMLDivElement>) {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (!target) return;
    const editor = editorRef.current;
    if (target.closest('[data-insert-table]')) {
      insertTable();
      return;
    }
    const tableObject = target.closest<HTMLElement>('[data-material-table-object]');
    if (tableObject && editor?.contains(tableObject)) {
      const cell = target.closest<HTMLTableCellElement>('[data-material-cell]');
      if (cell) activeCellRef.current = cell;
      selectTable(tableObject);
      return;
    }
    if (editor?.contains(target)) {
      activeTableRef.current = null;
      setActiveTable(null);
      setMenuOpen(false);
    }
  }

  function handleMouseDown(event: React.MouseEvent<HTMLDivElement>) {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (target?.closest('[data-insert-table]')) event.preventDefault();
  }

  function runTableAction(action: string, event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    if (activeTableRef.current) updateTable(action, activeTableRef.current);
    setMenuOpen(false);
  }

  return (
    <div ref={wrapperRef} className="relative space-y-2" onClick={handleClick} onMouseDown={handleMouseDown}>
      <div className="flex items-center justify-between gap-3">
        <label className="block text-xs font-extrabold uppercase tracking-[0.12em] text-slate-600">Tulis materi kamu</label>
        <button type="button" data-insert-table="true" className="btn-secondary !min-h-10 !px-3 !py-2 text-xs" aria-label="Sisipkan tabel" title="Sisipkan tabel"><Table2 className="h-4 w-4" /> Tabel</button>
      </div>
      <MaterialContentSurface value={value} editorRef={editorRef} onInput={(event) => readEditor(event.currentTarget)} />
      {activeTable && editorRef.current?.contains(activeTable) && <div className="absolute z-30" style={{ left: menuPosition.left, top: menuPosition.top }}>
        <button type="button" data-table-menu-toggle="true" onClick={(event) => { event.stopPropagation(); setMenuOpen((isOpen) => !isOpen); }} className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50" aria-label="Aksi tabel" title="Aksi tabel"><Ellipsis className="h-5 w-5" /></button>
        {menuOpen && <div className="absolute right-0 top-full mt-1 grid w-40 grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
          <button type="button" data-table-action="add-row" onClick={(event) => runTableAction('add-row', event)} className="flex h-11 items-center justify-center rounded-lg text-slate-700 hover:bg-blue-50" aria-label="Tambah baris" title="Tambah baris"><Rows3 className="h-5 w-5" /><Plus className="-ml-1 h-3.5 w-3.5" /></button>
          <button type="button" data-table-action="add-column" onClick={(event) => runTableAction('add-column', event)} className="flex h-11 items-center justify-center rounded-lg text-slate-700 hover:bg-blue-50" aria-label="Tambah kolom" title="Tambah kolom"><Columns3 className="h-5 w-5" /><Plus className="-ml-1 h-3.5 w-3.5" /></button>
          <button type="button" data-table-action="remove-row" onClick={(event) => runTableAction('remove-row', event)} className="flex h-11 items-center justify-center rounded-lg text-slate-700 hover:bg-red-50" aria-label="Hapus baris" title="Hapus baris"><Rows3 className="h-5 w-5" /><Minus className="-ml-1 h-3.5 w-3.5" /></button>
          <button type="button" data-table-action="remove-column" onClick={(event) => runTableAction('remove-column', event)} className="flex h-11 items-center justify-center rounded-lg text-slate-700 hover:bg-red-50" aria-label="Hapus kolom" title="Hapus kolom"><Columns3 className="h-5 w-5" /><Minus className="-ml-1 h-3.5 w-3.5" /></button>
          <button type="button" data-table-action="remove-table" onClick={(event) => runTableAction('remove-table', event)} className="col-span-2 flex h-11 items-center justify-center rounded-lg text-red-700 hover:bg-red-50" aria-label="Hapus tabel" title="Hapus tabel"><Trash2 className="h-5 w-5" /></button>
        </div>}
      </div>}
    </div>
  );
}

// Keep React from reconciling the live editable DOM and moving the user's caret.
export const MaterialContentEditor = memo(MaterialContentEditorView, () => true);