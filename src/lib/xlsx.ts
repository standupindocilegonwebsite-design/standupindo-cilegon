const encoder = new TextEncoder();

interface XlsxTableOptions {
  fileName: string;
  sheetName: string;
  title: string;
  subtitle: string;
  headers: string[];
  rows: Array<Array<string | number>>;
}

function xmlEscape(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD]/g, '');
}

function columnName(index: number) {
  let name = '';
  let column = index + 1;
  while (column > 0) {
    const remainder = (column - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    column = Math.floor((column - 1) / 26);
  }
  return name;
}

function crc32(bytes: Uint8Array) {
  let crc = 0xFFFFFFFF;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xEDB88320 : 0);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function write16(view: DataView, offset: number, value: number) {
  view.setUint16(offset, value, true);
}

function write32(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value, true);
}

function zipStore(files: Array<{ name: string; content: string }>) {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;

  files.forEach(({ name, content }) => {
    const nameBytes = encoder.encode(name);
    const contentBytes = encoder.encode(content);
    const checksum = crc32(contentBytes);
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    write32(localView, 0, 0x04034B50);
    write16(localView, 4, 20);
    write16(localView, 6, 0x0800);
    write16(localView, 8, 0);
    write16(localView, 10, 0);
    write16(localView, 12, 0x21);
    write32(localView, 14, checksum);
    write32(localView, 18, contentBytes.length);
    write32(localView, 22, contentBytes.length);
    write16(localView, 26, nameBytes.length);
    localHeader.set(nameBytes, 30);
    localParts.push(localHeader, contentBytes);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    write32(centralView, 0, 0x02014B50);
    write16(centralView, 4, 20);
    write16(centralView, 6, 20);
    write16(centralView, 8, 0x0800);
    write16(centralView, 10, 0);
    write16(centralView, 12, 0);
    write16(centralView, 14, 0x21);
    write32(centralView, 16, checksum);
    write32(centralView, 20, contentBytes.length);
    write32(centralView, 24, contentBytes.length);
    write16(centralView, 28, nameBytes.length);
    write16(centralView, 30, 0);
    write16(centralView, 32, 0);
    write16(centralView, 34, 0);
    write16(centralView, 36, 0);
    write32(centralView, 38, 0);
    write32(centralView, 42, localOffset);
    centralHeader.set(nameBytes, 46);
    centralParts.push(centralHeader);
    localOffset += localHeader.length + contentBytes.length;
  });

  const centralSize = centralParts.reduce((size, part) => size + part.length, 0);
  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);
  write32(endView, 0, 0x06054B50);
  write16(endView, 4, 0);
  write16(endView, 6, 0);
  write16(endView, 8, files.length);
  write16(endView, 10, files.length);
  write32(endView, 12, centralSize);
  write32(endView, 16, localOffset);
  write16(endView, 20, 0);
  return new Blob([...localParts, ...centralParts, endRecord], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export function downloadXlsxTable({ fileName, sheetName, title, subtitle, headers, rows }: XlsxTableOptions) {
  const headerRow = 4;
  const lastColumn = columnName(headers.length - 1);
  const lastRow = headerRow + rows.length;
  const lastCell = `${lastColumn}${lastRow}`;
  const headerCells = headers.map((header, columnIndex) => {
    const reference = `${columnName(columnIndex)}${headerRow}`;
    return `<c r="${reference}" t="inlineStr" s="1"><is><t xml:space="preserve">${xmlEscape(header)}</t></is></c>`;
  }).join('');
  const dataRows = rows.map((row, rowIndex) => `<row r="${rowIndex + headerRow + 1}">${headers.map((_, columnIndex) => {
    const value = row[columnIndex] ?? '';
    const reference = `${columnName(columnIndex)}${rowIndex + headerRow + 1}`;
    if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${reference}"><v>${value}</v></c>`;
    return `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(String(value))}</t></is></c>`;
  }).join('')}</row>`).join('');
  const worksheetRows = `<row r="1" ht="27" customHeight="1"><c r="A1" t="inlineStr" s="2"><is><t>${xmlEscape(title)}</t></is></c></row><row r="2" ht="20" customHeight="1"><c r="A2" t="inlineStr" s="3"><is><t>${xmlEscape(subtitle)}</t></is></c></row><row r="3"/> <row r="${headerRow}">${headerCells}</row>${dataRows}`;
  const tableColumns = headers.map((header, index) => `<tableColumn id="${index + 1}" name="${xmlEscape(header)}"/>`).join('');
  const escapedSheetName = xmlEscape(sheetName.slice(0, 31));
  const tableName = `AudienceTable${Date.now()}`;
  const files = [
    { name: '[Content_Types].xml', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/tables/table1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/></Types>` },
    { name: '_rels/.rels', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: 'xl/workbook.xml', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${escapedSheetName}" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: 'xl/styles.xml', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FF0B1F44"/><sz val="18"/><name val="Calibri"/></font><font><color rgb="FF475569"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1D4ED8"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>` },
    { name: 'xl/worksheets/sheet1.xml', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><dimension ref="A1:${lastCell}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A5" sqref="A5"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="18"/><sheetData>${worksheetRows}</sheetData><mergeCells count="2"><mergeCell ref="A1:${lastColumn}1"/><mergeCell ref="A2:${lastColumn}2"/></mergeCells><tableParts count="1"><tablePart r:id="rId1"/></tableParts></worksheet>` },
    { name: 'xl/worksheets/_rels/sheet1.xml.rels', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/table" Target="../tables/table1.xml"/></Relationships>` },
    { name: 'xl/tables/table1.xml', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><table xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" id="1" name="${tableName}" displayName="${tableName}" ref="A${headerRow}:${lastCell}" totalsRowShown="0"><autoFilter ref="A${headerRow}:${lastCell}"/><tableColumns count="${headers.length}">${tableColumns}</tableColumns><tableStyleInfo name="TableStyleMedium2" showFirstColumn="0" showLastColumn="0" showRowStripes="1" showColumnStripes="0"/></table>` },
  ];
  const blob = zipStore(files);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
