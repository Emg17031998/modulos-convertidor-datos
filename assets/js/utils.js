// assets/js/utils.js
// Funciones genéricas reutilizables entre módulos/ensayos.
// No poner aquí lógica específica de un ensayo (eso va en modules/<ensayo>/<ensayo>.js).
// Requiere que la página haya cargado las librerías xlsx (SheetJS) y exceljs vía CDN.

const LabUtils = (function () {

  // Conecta un dropzone + input[type=file] a un callback onFile(file)
  function attachDropzone(dropzoneEl, fileInputEl, onFile) {
    dropzoneEl.addEventListener('click', () => fileInputEl.click());
    dropzoneEl.addEventListener('dragover', e => { e.preventDefault(); dropzoneEl.classList.add('drag'); });
    dropzoneEl.addEventListener('dragleave', () => dropzoneEl.classList.remove('drag'));
    dropzoneEl.addEventListener('drop', e => {
      e.preventDefault();
      dropzoneEl.classList.remove('drag');
      if (e.dataTransfer.files.length) onFile(e.dataTransfer.files[0]);
    });
    fileInputEl.addEventListener('change', e => {
      if (e.target.files.length) onFile(e.target.files[0]);
    });
  }

  // Lee un File del navegador y devuelve un workbook de SheetJS (Promise)
  function readWorkbook(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array', cellDates: true });
          resolve(workbook);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
      reader.readAsArrayBuffer(file);
    });
  }

  // Convierte una hoja del workbook a "array of arrays" (una fila = un array de celdas)
  function sheetToAOA(workbook, sheetName) {
    const ws = workbook.Sheets[sheetName];
    return XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
  }

  // A partir de la fila de encabezados, arma {nombreColumna: indice}
  function buildColIndex(headerRow) {
    const colIndex = {};
    (headerRow || []).forEach((h, i) => {
      if (h !== null && h !== undefined && String(h).trim() !== '') {
        colIndex[String(h).trim()] = i;
      }
    });
    return colIndex;
  }

  // Descompone una celda de hora (Date u número serial de Excel) en {h, m}
  function toTimeParts(v) {
    if (v instanceof Date) return { h: v.getHours(), m: v.getMinutes() };
    if (typeof v === 'number') {
      const totalMin = Math.round(v * 24 * 60);
      return { h: Math.floor(totalMin / 60) % 24, m: totalMin % 60 };
    }
    return { h: 0, m: 0 };
  }

  function fmtDate(d) {
    if (!d) return '—';
    return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
  }

  function fmtTime(d) {
    if (!d) return '—';
    let h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, '0');
    const ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    if (h === 0) h = 12;
    return h + ':' + m + ' ' + ap;
  }

  function fmtNum(v, dec) {
    return typeof v === 'number' ? v.toFixed(dec) : '—';
  }

  // Da estilo estándar (negrita + relleno azul claro) a una fila de encabezado en ExcelJS
  function styleHeaderRow(row, argb) {
    row.font = { bold: true };
    row.eachCell(c => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb || 'FFDDEBF7' } };
      c.alignment = { horizontal: 'center', vertical: 'middle' };
    });
  }

  // Da estilo estándar (negrita + relleno ámbar) a una fila de totales/promedios en ExcelJS
  function styleTotalRow(row, argb) {
    row.font = { bold: true };
    row.eachCell(c => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb || 'FFFFF2CC' } };
      c.alignment = { horizontal: 'center', vertical: 'middle' };
    });
  }

  // Genera un workbook ExcelJS y dispara la descarga en el navegador
  async function downloadWorkbook(wb, filename) {
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Copia una hoja fuente (array of arrays) tal cual a una nueva hoja de un workbook ExcelJS,
  // para dejar trazabilidad de los datos usados en el cálculo.
  function addTraceabilitySheet(wb, sheetName, aoa) {
    const ws = wb.addWorksheet((sheetName || 'Fuente').substring(0, 28));
    aoa.forEach(rowArr => {
      ws.addRow(rowArr.map(v => (v === undefined ? null : v)));
    });
    ws.getRow(1).font = { bold: true };
    return ws;
  }

  return {
    attachDropzone, readWorkbook, sheetToAOA, buildColIndex, toTimeParts,
    fmtDate, fmtTime, fmtNum, styleHeaderRow, styleTotalRow,
    downloadWorkbook, addTraceabilitySheet
  };
})();
