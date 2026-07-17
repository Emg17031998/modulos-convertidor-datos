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

  // Igual que attachDropzone, pero para ensayos que necesitan varios archivos a la vez
  // (ej. un archivo por eje X/Y/Z). onFiles recibe un array de File.
  function attachMultiDropzone(dropzoneEl, fileInputEl, onFiles) {
    dropzoneEl.addEventListener('click', () => fileInputEl.click());
    dropzoneEl.addEventListener('dragover', e => { e.preventDefault(); dropzoneEl.classList.add('drag'); });
    dropzoneEl.addEventListener('dragleave', () => dropzoneEl.classList.remove('drag'));
    dropzoneEl.addEventListener('drop', e => {
      e.preventDefault();
      dropzoneEl.classList.remove('drag');
      if (e.dataTransfer.files.length) onFiles(Array.from(e.dataTransfer.files));
    });
    fileInputEl.addEventListener('change', e => {
      if (e.target.files.length) onFiles(Array.from(e.target.files));
    });
  }

  // Parsea un encabezado numérico (ej. una banda de frecuencia) tolerando coma o punto
  // decimal y texto alrededor ("31,5", "31.5 Hz"...). Devuelve un number o null si la
  // celda no empieza con un número.
  function parseNumericHeader(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return v;
    const m = String(v).trim().replace(',', '.').match(/^(\d+(\.\d+)?)/);
    return m ? parseFloat(m[1]) : null;
  }

  // Normaliza un título de columna para comparar por contenido, no por posición:
  // trim, minúsculas, sin acentos. Así "Time ", "TIME", "Tiempo"/"Hora" con distinto
  // formato no rompen la detección por una diferencia trivial de formato.
  function normalizeHeader(v) {
    if (v === null || v === undefined) return '';
    return String(v).trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  // Busca, entre las primeras maxRows filas de aoa, la primera que contenga al menos una
  // celda cuyo título normalizado esté en matchTitles (array de strings ya normalizados).
  // Nunca asume que el encabezado está en una fila fija. Devuelve el índice de fila
  // (0-based) o -1 si no se encontró en el rango buscado.
  function findHeaderRow(aoa, matchTitles, maxRows) {
    const wanted = new Set(matchTitles);
    const limit = Math.min(maxRows || 5, aoa.length);
    for (let r = 0; r < limit; r++) {
      const row = aoa[r] || [];
      for (let c = 0; c < row.length; c++) {
        if (wanted.has(normalizeHeader(row[c]))) return r;
      }
    }
    return -1;
  }

  // A partir de una fila de encabezado y un mapa {nombreCanónico: [alias, ...]}, arma
  // {nombreCanónico: índiceDeColumna} comparando títulos normalizados (nunca posición/índice
  // fijo). Columnas cuyo título no calza con ningún alias se ignoran. Si dos columnas del
  // archivo calzan con el mismo nombre canónico, gana la primera (izquierda a derecha).
  function buildColIndexByAlias(headerRow, aliasMap) {
    const aliasToCanonical = {};
    Object.keys(aliasMap).forEach(canonical => {
      aliasMap[canonical].forEach(alias => { aliasToCanonical[normalizeHeader(alias)] = canonical; });
    });
    const colIndex = {};
    (headerRow || []).forEach((h, i) => {
      const norm = normalizeHeader(h);
      if (norm === '') return;
      const canonical = aliasToCanonical[norm];
      if (canonical && !(canonical in colIndex)) colIndex[canonical] = i;
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
    attachDropzone, attachMultiDropzone, readWorkbook, sheetToAOA,
    normalizeHeader, findHeaderRow, buildColIndexByAlias, parseNumericHeader,
    toTimeParts, fmtDate, fmtTime, fmtNum, styleHeaderRow, styleTotalRow,
    downloadWorkbook, addTraceabilitySheet
  };
})();
