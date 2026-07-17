// modules/vibracion-mano-brazo/vibracion-mano-brazo.js
// Lógica específica del ensayo "Vibración Mano-Brazo (HAV)".
// Todo lo genérico (lectura/escritura de xlsx, dropzone, formateo) vive en assets/js/utils.js.
//
// Modelo de datos: cada brazo se mide con 3 archivos .xlsx, uno por minuto de medición
// (el nombre del archivo suele incluir trabajador/mano/número de minuto, pero ese número
// NO determina el eje). Cada archivo trae los 3 ejes X/Y/Z como hojas separadas dentro de
// sí mismo. El promedio de cada banda, para un eje dado, se calcula combinando los datos
// de las 3 hojas de ese eje (una por archivo/minuto), no por archivo individual.

// Bandas de octava requeridas (Hz), en el orden en que se muestran/exportan.
const TARGET_BANDS = [8, 16, 31.5, 63, 125, 250, 500, 1000];

// Límite máximo de aceleración Aeq(8h) por banda, DGNTI-COPANIT 45-2000 (m/s²). Fijo,
// no editable desde la UI.
const LIMITES_COPANIT = {
  8: 1.4, 16: 1.4, 31.5: 2.7, 63: 5.4,
  125: 10.7, 250: 21.3, 500: 42.5, 1000: 85
};

const AXES = ['X', 'Y', 'Z'];
const AXIS_RE = /([xyz])\s*OBA/i;
const BAND_SEARCH_ROWS = 10;

// Además de las columnas de banda, cada hoja de eje trae columnas de Fecha/Hora en la misma
// fila de encabezado. Las hojas del instrumento incluyen, después de las filas reales de
// medición por segundo, filas de resumen (una fila "Media" y una tabla-leyenda vertical de
// promedios por banda) que NO tienen fecha/hora pero sí valores numéricos en esas mismas
// columnas de banda — hay que descartarlas antes de promediar.
const DATE_TIME_ALIASES = { Fecha: ['fecha', 'date'], Hora: ['hora', 'time'] };

// DEBUG TEMPORAL — banda sobre la que se junta info de diagnóstico (archivo/hoja/índice de
// columna/encabezado crudo/valores) en cada cálculo. Quitar junto con renderBandDebug() y el
// panel .debug-panel del HTML cuando se cierre el diagnóstico.
const DEBUG_BAND = 8;

// Recorre TODAS las hojas de un archivo y devuelve {X: nombreHoja|null, Y: ..., Z: ...}
// según el patrón "<eje> OBA" en el nombre de cada hoja. Si dos hojas calzan con el mismo
// eje, gana la primera (izquierda a derecha).
function detectAxisSheets(workbook) {
  const result = { X: null, Y: null, Z: null };
  for (const sheetName of workbook.SheetNames) {
    const m = sheetName.match(AXIS_RE);
    if (m) {
      const axis = m[1].toUpperCase();
      if (!result[axis]) result[axis] = sheetName;
    }
  }
  return result;
}

// Busca, entre las primeras maxRows filas, la primera que contenga al menos una celda
// cuyo valor numérico calce con alguna banda de TARGET_BANDS (tolerando coma/punto decimal).
function findBandRow(aoa, maxRows) {
  const limit = Math.min(maxRows, aoa.length);
  for (let r = 0; r < limit; r++) {
    const row = aoa[r] || [];
    for (let c = 0; c < row.length; c++) {
      const freq = LabUtils.parseNumericHeader(row[c]);
      if (freq !== null && TARGET_BANDS.some(b => Math.abs(b - freq) < 0.01)) return r;
    }
  }
  return -1;
}

// A partir de la fila de encabezado de bandas, arma {banda: índiceDeColumna} — nunca por
// posición fija, solo por el valor numérico del título de columna.
function buildBandColIndex(headerRow) {
  const colIndex = {};
  (headerRow || []).forEach((h, i) => {
    const freq = LabUtils.parseNumericHeader(h);
    if (freq === null) return;
    const band = TARGET_BANDS.find(b => Math.abs(b - freq) < 0.01);
    if (band !== undefined && !(band in colIndex)) colIndex[band] = i;
  });
  return colIndex;
}

const armTemplate = document.getElementById('armTemplate');
const armControllers = {};

function createArmController(side, label, mountEl) {
  const node = armTemplate.content.cloneNode(true);
  const root = node.querySelector('.arm-block');
  mountEl.appendChild(node);

  const el = role => root.querySelector(`[data-role="${role}"]`);
  root.querySelector('.arm-title').textContent = label;
  const dropzone = el('dropzone');
  const fileInput = el('fileInput');
  const fname = el('fname');
  const axisList = el('axisList');
  const loadErr = el('loadErr');
  const tiempoInput = el('tiempo');
  const calcBtn = el('calcBtn');
  const calcErr = el('calcErr');
  const previewWrap = el('previewWrap');
  const previewTable = el('previewTable');
  const debugPanel = el('debugPanel'); // DEBUG TEMPORAL
  const debugContent = el('debugContent'); // DEBUG TEMPORAL

  // files: [{ file, workbook, detected: {X,Y,Z}, manual: {X,Y,Z} }]
  let files = [];
  let lastResult = null;

  LabUtils.attachMultiDropzone(dropzone, fileInput, handleFiles);

  async function handleFiles(fileArr) {
    loadErr.textContent = '';
    calcErr.textContent = '';
    axisList.innerHTML = '';
    previewWrap.style.display = 'none';
    files = [];
    lastResult = null;
    updateGlobalDownloadState();

    if (fileArr.length !== 3) {
      fname.textContent = 'Ningún archivo cargado';
      loadErr.textContent = `Debes seleccionar exactamente 3 archivos (los 3 minutos de medición de este brazo). Seleccionaste ${fileArr.length}.`;
      return;
    }

    fname.textContent = fileArr.map(f => f.name).join(', ');

    for (const file of fileArr) {
      try {
        const workbook = await LabUtils.readWorkbook(file);
        files.push({ file, workbook, detected: detectAxisSheets(workbook), manual: { X: null, Y: null, Z: null } });
      } catch (err) {
        loadErr.textContent = `No se pudo leer "${file.name}": ` + err.message;
        files = [];
        return;
      }
    }

    renderFileList();
  }

  function resolvedSheet(f, axis) {
    return f.manual[axis] || f.detected[axis];
  }

  function renderFileList() {
    axisList.innerHTML = files.map((f, fi) => {
      const rows = AXES.map(axis => {
        const detectedSheet = f.detected[axis];
        if (detectedSheet) {
          return `<div class="file-axis-row ok"><span class="axis-icon">&#10003;</span> Hoja "${detectedSheet}" detectada como eje ${axis}</div>`;
        }
        const options = ['', ...f.workbook.SheetNames].map(sn => {
          const optLabel = sn === '' ? '— Elegir hoja —' : sn;
          return `<option value="${sn}" ${f.manual[axis] === sn ? 'selected' : ''}>${optLabel}</option>`;
        }).join('');
        return `<div class="file-axis-row warn">
          <span class="axis-icon">&#9888;</span> El archivo "${f.file.name}" no tiene una hoja identificable para el eje ${axis} — selecciona manualmente:
          <select class="axis-manual-select" data-file-idx="${fi}" data-axis="${axis}">${options}</select>
        </div>`;
      }).join('');
      return `<div class="file-axis-card"><div class="file-axis-name">Archivo: ${f.file.name}</div>${rows}</div>`;
    }).join('');

    axisList.querySelectorAll('.axis-manual-select').forEach(sel => {
      sel.addEventListener('change', e => {
        const fi = parseInt(e.target.dataset.fileIdx, 10);
        const axis = e.target.dataset.axis;
        files[fi].manual[axis] = e.target.value || null;
      });
    });
  }

  calcBtn.addEventListener('click', () => {
    calcErr.textContent = '';
    previewWrap.style.display = 'none';
    debugPanel.style.display = 'none'; // DEBUG TEMPORAL
    lastResult = null;
    updateGlobalDownloadState();

    if (files.length !== 3) { calcErr.textContent = 'Carga los 3 archivos antes de calcular.'; return; }

    const tiempoMin = parseFloat(tiempoInput.value);
    if (!tiempoInput.value || isNaN(tiempoMin) || tiempoMin <= 0) {
      calcErr.textContent = 'Ingresa el tiempo de exposición real (minutos).';
      return;
    }

    // Validar que los 3 archivos tengan hoja resuelta (detectada o manual) para X, Y y Z,
    // y que dentro de un mismo archivo no se haya asignado la misma hoja a dos ejes.
    for (const f of files) {
      const resolved = AXES.map(axis => resolvedSheet(f, axis));
      if (resolved.some(s => !s)) {
        calcErr.textContent = `Falta asignar manualmente la hoja de algún eje en el archivo "${f.file.name}".`;
        return;
      }
      if (new Set(resolved).size !== 3) {
        calcErr.textContent = `En el archivo "${f.file.name}" se asignó la misma hoja a más de un eje. Revisa la selección.`;
        return;
      }
    }

    // Acumular, por eje y banda, los valores de las 3 hojas correspondientes (una por
    // archivo/minuto) en un solo conjunto — el promedio se calcula sobre ese conjunto
    // combinado, no como promedio de promedios por archivo.
    const bandValues = {};
    AXES.forEach(axis => { bandValues[axis] = {}; TARGET_BANDS.forEach(b => { bandValues[axis][b] = []; }); });
    const traceInfo = [];
    // DEBUG TEMPORAL — un registro por (archivo, hoja) que aporta a DEBUG_BAND en cada eje.
    const bandDebug = { X: [], Y: [], Z: [] };

    for (const f of files) {
      for (const axis of AXES) {
        const sheetName = resolvedSheet(f, axis);
        let aoa;
        try {
          aoa = LabUtils.sheetToAOA(f.workbook, sheetName);
        } catch (err) {
          calcErr.textContent = `No se pudo leer la hoja "${sheetName}" de "${f.file.name}": ` + err.message;
          return;
        }

        const bandRowIdx = findBandRow(aoa, BAND_SEARCH_ROWS);
        if (bandRowIdx === -1) {
          calcErr.textContent = `No se encontraron columnas de banda de octava en "${f.file.name}" (hoja "${sheetName}", eje ${axis}).`;
          return;
        }
        const bandCol = buildBandColIndex(aoa[bandRowIdx]);
        const missingBands = TARGET_BANDS.filter(b => !(b in bandCol));
        if (missingBands.length) {
          calcErr.textContent = `Falta(n) la(s) banda(s) ${missingBands.join(', ')} Hz en "${f.file.name}" (hoja "${sheetName}", eje ${axis}).`;
          return;
        }

        const dateTimeCol = LabUtils.buildColIndexByAlias(aoa[bandRowIdx], DATE_TIME_ALIASES);
        if (!('Fecha' in dateTimeCol) || !('Hora' in dateTimeCol)) {
          calcErr.textContent = `No se encontró columna de Fecha/Hora en "${f.file.name}" (hoja "${sheetName}", eje ${axis}); no se pueden distinguir las filas de medición de las filas de resumen del instrumento.`;
          return;
        }

        // Solo cuentan como filas de medición real las que tienen Fecha Y Hora con valor
        // (las filas de resumen/leyenda del instrumento no traen fecha/hora, aunque sí
        // arrastran números en las columnas de banda).
        const hasValue = v => v !== null && v !== undefined && String(v).trim() !== '';
        const totalDataRows = aoa.length - (bandRowIdx + 1);
        const validRowIdxs = [];
        for (let r = bandRowIdx + 1; r < aoa.length; r++) {
          const row = aoa[r];
          if (row && hasValue(row[dateTimeCol.Fecha]) && hasValue(row[dateTimeCol.Hora])) validRowIdxs.push(r);
        }
        if (validRowIdxs.length === 0) {
          calcErr.textContent = `El archivo "${f.file.name}" (hoja "${sheetName}", eje ${axis}) no tiene ninguna fila con Fecha/Hora válida — no hay datos utilizables.`;
          return;
        }

        TARGET_BANDS.forEach(band => {
          const colIdx = bandCol[band];
          const collected = []; // DEBUG TEMPORAL — solo para inspeccionar, no participa del cálculo
          validRowIdxs.forEach(r => {
            const v = aoa[r][colIdx];
            if (typeof v === 'number') { bandValues[axis][band].push(v); collected.push(v); }
          });
          // DEBUG TEMPORAL — captura detallada solo de DEBUG_BAND, para no saturar.
          if (band === DEBUG_BAND) {
            bandDebug[axis].push({
              fileName: f.file.name,
              sheetName,
              colIndex: colIdx,
              rawHeader: aoa[bandRowIdx][colIdx],
              values: collected,
              sheetAvg: collected.length ? collected.reduce((a, b) => a + b, 0) / collected.length : null,
              rowsUsed: validRowIdxs.length,
              rowsDiscarded: totalDataRows - validRowIdxs.length
            });
          }
        });

        traceInfo.push({
          fileName: f.file.name, axis, sheetName,
          method: f.manual[axis] ? 'Manual' : 'Automático (nombre de hoja)'
        });
      }
    }

    const axisAverages = {};
    for (const axis of AXES) {
      axisAverages[axis] = {};
      for (const band of TARGET_BANDS) {
        const vals = bandValues[axis][band];
        if (!vals.length) {
          calcErr.textContent = `La banda ${band} Hz del eje ${axis} no tiene valores numéricos para promediar entre las 3 hojas.`;
          return;
        }
        axisAverages[axis][band] = vals.reduce((a, b) => a + b, 0) / vals.length;
      }
    }

    renderBandDebug(label, bandDebug, axisAverages); // DEBUG TEMPORAL

    const rows = TARGET_BANDS.map(band => {
      const X = axisAverages.X[band], Y = axisAverages.Y[band], Z = axisAverages.Z[band];
      const total = Math.sqrt(X * X + Y * Y + Z * Z);
      const aeq8h = total * Math.sqrt(tiempoMin / 480);
      const limite = LIMITES_COPANIT[band];
      const estado = aeq8h > limite ? 'Excede' : 'Cumple';
      return { band, X, Y, Z, aeq8h, limite, estado };
    });

    lastResult = { side, label, rows, tiempoMin, traceInfo };
    renderPreview(lastResult);
    updateGlobalDownloadState();
  });

  function renderPreview(res) {
    let head = '<tr><th>Frecuencia (Hz)</th><th>X (m/s²) Medido</th><th>Y (m/s²) Medido</th>' +
      '<th>Z (m/s²) Medido</th><th>Total (m/s²) Calculado</th><th>Límite COPANIT (m/s²)</th><th>Estado</th></tr>';
    let body = '';
    res.rows.forEach(r => {
      const statusClass = r.estado === 'Excede' ? 'status-bad' : 'status-ok';
      body += `<tr><td>${r.band}</td><td>${LabUtils.fmtNum(r.X, 3)}</td><td>${LabUtils.fmtNum(r.Y, 3)}</td>` +
        `<td>${LabUtils.fmtNum(r.Z, 3)}</td><td>${LabUtils.fmtNum(r.aeq8h, 3)}</td><td>${LabUtils.fmtNum(r.limite, 1)}</td>` +
        `<td><span class="${statusClass}">${r.estado}</span></td></tr>`;
    });
    previewTable.innerHTML = '<thead>' + head + '</thead><tbody>' + body + '</tbody>';
    previewWrap.style.display = 'block';
  }

  // DEBUG TEMPORAL — vuelca a consola (console.table) y al panel colapsable el detalle de
  // DEBUG_BAND (8 Hz): por eje, qué (archivo, hoja) aportó qué valores, con qué índice de
  // columna y encabezado crudo, y el promedio final combinado que resultó para esa banda.
  // No participa del cálculo — es solo lectura de lo que ya se calculó arriba.
  function renderBandDebug(armLabel, bandDebug, axisAverages) {
    const flat = [];
    AXES.forEach(axis => {
      bandDebug[axis].forEach(d => {
        flat.push({
          Eje: axis,
          Archivo: d.fileName,
          Hoja: d.sheetName,
          'Índice columna': d.colIndex,
          'Encabezado crudo': d.rawHeader,
          Valores: d.values.join(', '),
          'Promedio de esta hoja (referencia)': d.sheetAvg,
          'Filas usadas (Fecha/Hora válida)': d.rowsUsed,
          'Filas descartadas (sin Fecha/Hora)': d.rowsDiscarded
        });
      });
    });
    const summaryLabel = `Promedio final combinado (banda ${DEBUG_BAND} Hz)`;
    const summary = AXES.map(axis => ({ Eje: axis, [summaryLabel]: axisAverages[axis][DEBUG_BAND] }));

    console.log(`[DEBUG banda ${DEBUG_BAND} Hz — ${armLabel}] detalle por archivo/hoja:`);
    console.table(flat);
    console.log(`[DEBUG banda ${DEBUG_BAND} Hz — ${armLabel}] promedio final combinado por eje:`);
    console.table(summary);

    let html = '<table class="debug-table"><thead><tr><th>Eje</th><th>Archivo</th><th>Hoja</th>' +
      '<th>Índice col.</th><th>Encabezado crudo</th><th>Valores individuales</th><th>Prom. de esta hoja</th>' +
      '<th>Filas usadas</th><th>Filas descartadas</th></tr></thead><tbody>';
    flat.forEach(r => {
      html += `<tr><td>${r.Eje}</td><td>${r.Archivo}</td><td>${r.Hoja}</td><td>${r['Índice columna']}</td>` +
        `<td>${JSON.stringify(r['Encabezado crudo'])}</td><td>${r.Valores}</td>` +
        `<td>${LabUtils.fmtNum(r['Promedio de esta hoja (referencia)'], 4)}</td>` +
        `<td>${r['Filas usadas (Fecha/Hora válida)']}</td><td>${r['Filas descartadas (sin Fecha/Hora)']}</td></tr>`;
    });
    html += `</tbody></table><table class="debug-table"><thead><tr><th>Eje</th><th>${summaryLabel}</th></tr></thead><tbody>`;
    summary.forEach(s => {
      html += `<tr><td>${s.Eje}</td><td>${LabUtils.fmtNum(s[summaryLabel], 4)}</td></tr>`;
    });
    html += '</tbody></table>';

    debugContent.innerHTML = html;
    debugPanel.style.display = 'block';
  }

  return {
    getResult: () => lastResult
  };
}

armControllers.izq = createArmController('izq', 'Brazo Izquierdo', document.getElementById('armIzq'));
armControllers.der = createArmController('der', 'Brazo Derecho', document.getElementById('armDer'));

const dlAllBtn = document.getElementById('dlAllBtn');
const genErr = document.getElementById('genErr');

function updateGlobalDownloadState() {
  const anyResult = armControllers.izq.getResult() || armControllers.der.getResult();
  dlAllBtn.disabled = !anyResult;
}

dlAllBtn.addEventListener('click', async () => {
  genErr.textContent = '';
  const results = ['izq', 'der'].map(s => armControllers[s].getResult()).filter(Boolean);
  if (results.length === 0) { genErr.textContent = 'Calcula al menos un brazo antes de descargar.'; return; }

  try {
    await buildAndDownload(results);
  } catch (err) {
    genErr.textContent = 'Error generando el archivo: ' + err.message;
  }
});

// Fuente del documento de exportación (todas las hojas). El valor que excede el límite de
// la norma (columna "Aceleración Total Calculado", la que realmente se compara contra el
// límite) se resalta en negrita y verde 008000, además de la fuente base.
const EXPORT_FONT_NAME = 'Arial Narrow';
const EXPORT_FONT_SIZE = 9;
const EXCEDE_COLOR = 'FF008000';

async function buildAndDownload(results) {
  const wb = new ExcelJS.Workbook();
  const headers = ['Frecuencia (Hz)', 'Aceleración X (m/s²) Medido', 'Aceleración Y (m/s²) Medido',
    'Aceleración Z (m/s²) Medido', 'Aceleración Total (m/s²) Calculado',
    'Límite máximo DGNTI-COPANIT 45-2000 (m/s²)', 'Estado'];

  const traceRows = [
    ['Trazabilidad — Vibración Mano-Brazo (HAV)'],
    [],
    ['Brazo', 'Archivo (minuto)', 'Eje', 'Hoja usada', 'Método', 'Tiempo de exposición (min)'],
  ];

  results.forEach(res => {
    const ws = wb.addWorksheet(res.label.substring(0, 28));
    const headerRow = ws.addRow(headers);
    LabUtils.styleHeaderRow(headerRow);
    headerRow.font = { ...headerRow.font, name: EXPORT_FONT_NAME, size: EXPORT_FONT_SIZE };

    res.rows.forEach(r => {
      const row = ws.addRow([r.band, r.X, r.Y, r.Z, r.aeq8h, r.limite, r.estado]);
      row.font = { name: EXPORT_FONT_NAME, size: EXPORT_FONT_SIZE };
      row.getCell(2).numFmt = '0.000';
      row.getCell(3).numFmt = '0.000';
      row.getCell(4).numFmt = '0.000';
      row.getCell(5).numFmt = '0.000';
      row.getCell(6).numFmt = '0.0';

      const totalCell = row.getCell(5);
      if (r.estado === 'Excede') {
        totalCell.font = { name: EXPORT_FONT_NAME, size: EXPORT_FONT_SIZE, bold: true, color: { argb: EXCEDE_COLOR } };
      }

      const estadoCell = row.getCell(7);
      estadoCell.font = {
        name: EXPORT_FONT_NAME, size: EXPORT_FONT_SIZE, bold: true,
        color: { argb: r.estado === 'Excede' ? 'FF9C1F0E' : 'FF1E7B34' }
      };
      estadoCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: r.estado === 'Excede' ? 'FFFBD9D3' : 'FFDCF0E0' } };
      row.eachCell(c => c.alignment = { horizontal: 'center', vertical: 'middle' });
    });
    ws.columns.forEach(col => { col.width = 20; });

    res.traceInfo.forEach(t => {
      traceRows.push([res.label, t.fileName, t.axis, t.sheetName, t.method, res.tiempoMin]);
    });
  });

  traceRows.push(
    [],
    ['Fórmulas utilizadas'],
    ['Total = √(X² + Y² + Z²)'],
    ['Aeq(8h) = Total × √(tiempo de exposición en minutos / 480)'],
    [],
    ['Generado', new Date().toLocaleString('es-PA')]
  );
  const traceWs = LabUtils.addTraceabilitySheet(wb, 'Trazabilidad', traceRows);
  traceWs.eachRow((row, rowNumber) => {
    row.font = { name: EXPORT_FONT_NAME, size: EXPORT_FONT_SIZE, bold: rowNumber === 1 };
  });

  await LabUtils.downloadWorkbook(wb, 'Vibracion_Mano_Brazo.xlsx');
}
