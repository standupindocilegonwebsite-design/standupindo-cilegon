import { jsPDF } from 'jspdf';
import type { MaterialSetlistItem } from '@/lib/types';
import { parseMaterialContent } from '@/lib/material-content';

function safeFilename(value: string) {
  return value.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').replace(/\s+/g, '-').slice(0, 80) || 'setlist';
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadSetlistPdf(name: string, items: MaterialSetlistItem[]) {
  const doc = new jsPDF({ format: 'a4', unit: 'mm' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 18;
  const contentWidth = pageWidth - margin * 2;
  const totalDuration = items.reduce((sum, item) => sum + (item.material?.estimated_duration ?? 0), 0);
  let y = margin;

  const ensureSpace = (height: number) => {
    if (y + height > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  };

  const addParagraph = (text: string, options: { fontSize?: number; color?: [number, number, number]; bold?: boolean; gap?: number } = {}) => {
    const fontSize = options.fontSize ?? 12;
    doc.setFont('helvetica', options.bold ? 'bold' : 'normal');
    doc.setFontSize(fontSize);
    doc.setTextColor(...(options.color ?? [51, 65, 85]));
    const lines = doc.splitTextToSize(text || ' ', contentWidth) as string[];
    const lineHeight = fontSize * 0.48;
    ensureSpace(lines.length * lineHeight + (options.gap ?? 4));
    doc.text(lines, margin, y);
    y += lines.length * lineHeight + (options.gap ?? 4);
  };

  const addTable = (rows: string[][]) => {
    const columns = Math.max(1, ...rows.map((row) => row.length));
    const columnWidth = contentWidth / columns;
    const padding = 2.5;
    const fontSize = 9;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(fontSize);
    rows.forEach((row) => {
      const linesPerCell = Array.from({ length: columns }, (_, index) => doc.splitTextToSize(row[index] ?? '', columnWidth - padding * 2) as string[]);
      const rowHeight = Math.max(8, ...linesPerCell.map((lines) => lines.length * 4.3 + padding * 2));
      ensureSpace(rowHeight);
      linesPerCell.forEach((lines, columnIndex) => {
        const x = margin + columnIndex * columnWidth;
        doc.setDrawColor(203, 213, 225);
        doc.rect(x, y, columnWidth, rowHeight);
        doc.setTextColor(51, 65, 85);
        doc.text(lines, x + padding, y + padding + 3);
      });
      y += rowHeight;
    });
    y += 4;
  };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(23, 70, 209);
  const titleLines = doc.splitTextToSize(name, contentWidth) as string[];
  doc.text(titleLines, margin, y);
  y += titleLines.length * 9 + 2;
  addParagraph(`Setlist Materi · ${items.length} materi · Total ±${totalDuration} menit`, { fontSize: 10, color: [100, 116, 139], gap: 8 });

  items.forEach((item, index) => {
    ensureSpace(22);
    const material = item.material;
    doc.setDrawColor(219, 227, 240);
    doc.line(margin, y, pageWidth - margin, y);
    y += 7;
    addParagraph(`MATERI ${index + 1}`, { fontSize: 9, color: [29, 78, 216], bold: true, gap: 2 });
    addParagraph(material?.title ?? 'Materi', { fontSize: 15, color: [15, 23, 42], bold: true, gap: 2 });
    addParagraph(`${material?.theme ?? ''} · ±${material?.estimated_duration ?? 0} menit`, { fontSize: 10, color: [100, 116, 139], gap: 4 });
    if (material?.premis?.trim()) addParagraph(`Premis: ${material.premis.trim()}`, { fontSize: 11, gap: 5 });
    parseMaterialContent(material?.content ?? '').forEach((block) => {
      if (block.type === 'table') addTable(block.rows);
      else block.text.split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean).forEach((paragraph) => addParagraph(paragraph, { fontSize: 12, gap: 5 }));
    });
    y += 5;
  });

  doc.save(`${safeFilename(name)}.pdf`);
}

function xmlEscape(value: string) {
  return value.replace(/[<>&"']/g, (character) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[character] ?? character);
}

function wordRun(text: string, options: { bold?: boolean; color?: string; size?: number } = {}) {
  const properties = [
    options.bold ? '<w:b/>' : '',
    options.color ? `<w:color w:val="${options.color}"/>` : '',
    options.size ? `<w:sz w:val="${options.size}"/>` : '',
    '<w:rFonts w:ascii="Cambria" w:hAnsi="Cambria"/>',
  ].join('');
  const lines = text.split('\n');
  const content = lines.map((line, index) => `${index ? '<w:br/>' : ''}<w:t xml:space="preserve">${xmlEscape(line)}</w:t>`).join('');
  return `<w:r><w:rPr>${properties}</w:rPr>${content}</w:r>`;
}

function wordParagraph(text: string, options: { bold?: boolean; color?: string; size?: number; after?: number } = {}) {
  return `<w:p><w:pPr><w:spacing w:after="${options.after ?? 160}" w:line="360" w:lineRule="auto"/></w:pPr>${wordRun(text, options)}</w:p>`;
}

function wordTable(rows: string[][]) {
  const columns = Math.max(1, ...rows.map((row) => row.length));
  const cellWidth = Math.floor(9360 / columns);
  const borders = '<w:tblBorders><w:top w:val="single" w:sz="4" w:color="CBD5E1"/><w:left w:val="single" w:sz="4" w:color="CBD5E1"/><w:bottom w:val="single" w:sz="4" w:color="CBD5E1"/><w:right w:val="single" w:sz="4" w:color="CBD5E1"/><w:insideH w:val="single" w:sz="4" w:color="CBD5E1"/><w:insideV w:val="single" w:sz="4" w:color="CBD5E1"/></w:tblBorders>';
  const tableRows = rows.map((row) => `<w:tr>${Array.from({ length: columns }, (_, index) => `<w:tc><w:tcPr><w:tcW w:w="${cellWidth}" w:type="dxa"/><w:tcMar><w:top w:w="100" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="100" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tcMar></w:tcPr>${wordParagraph(row[index] ?? '', { size: 20, after: 0 })}</w:tc>`).join('')}</w:tr>`).join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="9360" w:type="dxa"/>${borders}</w:tblPr><w:tblGrid>${Array.from({ length: columns }, () => `<w:gridCol w:w="${cellWidth}"/>`).join('')}</w:tblGrid>${tableRows}</w:tbl>`;
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  bytes.forEach((byte) => {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  });
  return (crc ^ 0xffffffff) >>> 0;
}

function zipFiles(files: Array<{ name: string; content: string }>) {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  files.forEach(({ name, content }) => {
    const filename = encoder.encode(name);
    const data = encoder.encode(content);
    const crc = crc32(data);
    const localHeader = new Uint8Array(30 + filename.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, filename.length, true);
    localHeader.set(filename, 30);
    localParts.push(localHeader, data);

    const centralHeader = new Uint8Array(46 + filename.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, filename.length, true);
    centralView.setUint32(42, offset, true);
    centralHeader.set(filename, 46);
    centralParts.push(centralHeader);
    offset += localHeader.length + data.length;
  });

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  return new Blob([...localParts, ...centralParts, end], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

export function downloadSetlistDocx(name: string, items: MaterialSetlistItem[]) {
  const totalDuration = items.reduce((sum, item) => sum + (item.material?.estimated_duration ?? 0), 0);
  const body = [
    wordParagraph(name, { bold: true, color: '1746D1', size: 36, after: 240 }),
    wordParagraph(`Setlist Materi · ${items.length} materi · Total ±${totalDuration} menit`, { color: '64748B', size: 20, after: 360 }),
    ...items.flatMap((item, index) => {
      const material = item.material;
      const sections = [
        wordParagraph(`MATERI ${index + 1}`, { bold: true, color: '1D4ED8', size: 18, after: 80 }),
        wordParagraph(material?.title ?? 'Materi', { bold: true, size: 30, after: 80 }),
        wordParagraph(`${material?.theme ?? ''} · ±${material?.estimated_duration ?? 0} menit`, { color: '64748B', size: 20, after: 160 }),
      ];
      if (material?.premis?.trim()) sections.push(wordParagraph(`Premis: ${material.premis.trim()}`, { size: 22, after: 200 }));
      parseMaterialContent(material?.content ?? '').forEach((block) => {
        if (block.type === 'table') sections.push(wordTable(block.rows));
        else block.text.split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean).forEach((paragraph) => sections.push(wordParagraph(paragraph, { size: 24 })));
      });
      sections.push(wordParagraph('', { after: 240 }));
      return sections;
    }),
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1276" w:bottom="1134" w:left="1276" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr>',
  ].join('');
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`;
  const blob = zipFiles([
    { name: '[Content_Types].xml', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>' },
    { name: '_rels/.rels', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
    { name: 'word/document.xml', content: documentXml },
  ]);
  downloadBlob(blob, `${safeFilename(name)}.docx`);
}
