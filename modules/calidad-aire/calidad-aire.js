// modules/calidad-aire/calidad-aire.js
// Lógica específica del ensayo "Promedios de Calidad de Aire Ambiental".
// Todo lo genérico (lectura/escritura de xlsx, formateo, dropzone) vive en assets/js/utils.js.

let workbook = null, aoa = [], colIndex = {}, unitsRow = [], sheetNames = [], detectedParams = [];

// Alias reconocidos por TÍTULO de columna (nunca por posición/índice fijo). Los archivos de
// campo no tienen una estructura uniforme entre sí, así que la detección se basa en comparar
// el título normalizado (trim + minúsculas + sin acentos, ver LabUtils.normalizeHeader) contra
// esta lista. Columnas cuyo título no calza con ningún alias de aquí se ignoran (no aparecen
// como parámetro seleccionable). PMA y PMB se mantienen separados a propósito: si se
// colapsaran en un solo "PM" genérico, un archivo que traiga ambas columnas perdería una de
// las dos en silencio. PWR/Voltage no se incluyen: no se usan en este ensayo.
const HEADER_ALIASES = {
  Date: ['date', 'fecha'],
  Time: ['time', 'hora'],
  CO: ['co'],
  CO2: ['co2'],
  NO2: ['no2'],
  O3: ['o3'],
  PMA: ['pma'],
  PMB: ['pmb'],
  PM: ['pm10', 'pm2.5', 'pm2,5', 'material particulado', 'pm'],
  RH: ['rh', 'humedad'],
  SO2: ['so2'],
  Temp: ['tmpc', 'temp', 'temperatura'],
};
const DATE_TIME_TITLES = ['date', 'fecha', 'time', 'hora'];
const HEADER_SEARCH_ROWS = 5;

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const fname = document.getElementById('fname');
const sheetRow = document.getElementById('sheetRow');
const sheetSelect = document.getElementById('sheetSelect');
const startRowInput = document.getElementById('startRow');
const readout = document.getElementById('readout');
const loadErr = document.getElementById('loadErr');
const paramsBody = document.getElementById('paramsBody');
const paramsBodyRows = document.getElementById('paramsBodyRows');
const genBody = document.getElementById('genBody');
const genBtn = document.getElementById('genBtn');
const dlBtn = document.getElementById('dlBtn');
const genErr = document.getElementById('genErr');
const previewWrap = document.getElementById('previewWrap');
const previewTable = document.getElementById('previewTable');
const molarVolInput = document.getElementById('molarVol');

LabUtils.attachDropzone(dropzone, fileInput, handleFile);

async function handleFile(file) {
  loadErr.textContent = '';
  fname.textContent = file.name;
  disableSteps();
  sheetRow.style.display = 'none';
  sheetSelect.innerHTML = '';

  try {
    workbook = await LabUtils.readWorkbook(file);
  } catch (err) {
    loadErr.textContent = 'No se pudo leer el archivo: ' + err.message;
    return;
  }

  sheetNames = workbook.SheetNames || [];
  if (sheetNames.length === 0) {
    loadErr.textContent = 'El archivo no contiene hojas válidas.';
    return;
  }

  sheetSelect.innerHTML = sheetNames.map(n => `<option value="${n}">${n}</option>`).join('');
  sheetRow.style.display = 'flex';
  loadSheet(sheetNames[0], true);
}

sheetSelect.addEventListener('change', () => loadSheet(sheetSelect.value, true));
startRowInput.addEventListener('change', () => loadSheet(sheetSelect.value, false));

// Limpia el panel de resumen y deshabilita los pasos 2/3, para que no queden datos
// de una hoja o archivo anterior visibles mientras se evalúa la hoja recién elegida.
function disableSteps() {
  readout.classList.remove('on');
  readout.innerHTML = '';
  paramsBody.classList.add('disabled');
  genBody.classList.add('disabled');
  previewWrap.style.display = 'none';
  dlBtn.style.display = 'none';
  genErr.textContent = '';
}

// autoStartRow: true cuando se carga un archivo/hoja nuevo (recalcula "Fila donde inician
// los datos" a partir del encabezado detectado); false cuando el usuario mismo editó ese
// campo (se respeta el valor que escribió, sin pisarlo).
function loadSheet(name, autoStartRow) {
  loadErr.textContent = '';
  disableSteps();

  if (!name) {
    loadErr.textContent = 'No hay una hoja seleccionada.';
    return;
  }

  try {
    aoa = LabUtils.sheetToAOA(workbook, name);
  } catch (err) {
    loadErr.textContent = `No se pudo leer la hoja "${name}": ` + err.message;
    return;
  }

  if (!aoa || aoa.length < 3) { loadErr.textContent = 'Esta hoja no tiene suficientes filas.'; return; }

  // La fila de encabezado se BUSCA por título (Date/Fecha/Time/Hora), nunca se asume que
  // es la fila 1 — los archivos de campo no tienen una estructura uniforme entre sí.
  const headerRowIdx = LabUtils.findHeaderRow(aoa, DATE_TIME_TITLES, HEADER_SEARCH_ROWS);
  if (headerRowIdx === -1) {
    loadErr.textContent = `No se encontró una fila de encabezado con columna "Date"/"Fecha" u "Time"/"Hora" en las primeras ${HEADER_SEARCH_ROWS} filas de esta hoja. Verifica que sea el formato esperado.`;
    return;
  }

  const headerRow = aoa[headerRowIdx] || [];
  unitsRow = aoa[headerRowIdx + 1] || []; // fila justo debajo del encabezado (unidades) — se ignora como fila de datos
  colIndex = LabUtils.buildColIndexByAlias(headerRow, HEADER_ALIASES);

  const missing = [];
  if (!('Date' in colIndex)) missing.push('Date/Fecha');
  if (!('Time' in colIndex)) missing.push('Time/Hora');
  if (missing.length) {
    loadErr.textContent = `No se encontró columna de ${missing.join(' ni ')} en el encabezado detectado (fila ${headerRowIdx + 1}).`;
    return;
  }

  detectedParams = Object.keys(colIndex).filter(n => n !== 'Date' && n !== 'Time');

  // Fila de datos por defecto = encabezado + fila de unidades + 1. Se autocompleta al cargar
  // un archivo/hoja nuevo, pero sigue siendo editable: si el usuario la ajusta a mano, ese
  // valor se respeta (ver el listener de startRowInput más arriba).
  const defaultStartRow1based = headerRowIdx + 3;
  if (autoStartRow) startRowInput.value = defaultStartRow1based;
  const startRow1based = parseInt(startRowInput.value, 10) || defaultStartRow1based;
  const startIdx0 = startRow1based - 1;
  const blocks = detectBlocks(startIdx0);

  const mapping = Object.keys(colIndex).map(k => `${k}=col ${colIndex[k] + 1}`).join(', ');
  readout.classList.add('on');
  readout.innerHTML = `<b>Hoja:</b> ${name} &nbsp;&middot;&nbsp; <b>Fila de encabezado:</b> ${headerRowIdx + 1} &nbsp;&middot;&nbsp; <b>Columnas detectadas:</b> ${Object.keys(colIndex).length} &nbsp;&middot;&nbsp; <b>Parámetros disponibles:</b> ${detectedParams.length}<br><b>Intervalos (bloques 12+1) detectados:</b> ${blocks.length} &nbsp;&middot;&nbsp; <b>Inicio de datos:</b> fila ${startRow1based}<br><b>Mapeo título → columna:</b> ${mapping}`;

  renderParamsTable();
  paramsBody.classList.remove('disabled');
  genBody.classList.remove('disabled');
}

// Detección de bloques, índices 0-based, replica el patrón 15+13*(k-1) / 14+13*(k-1) (1-based)
function detectBlocks(startIdx0) {
  const blocks = [];
  let k = 1;
  while (true) {
    const dataStart = startIdx0 + 13 * (k - 1);
    const dataEnd = dataStart + 11;   // última de las 12 filas de datos
    const avgRow = dataStart + 12;    // fila de promedio
    if (dataEnd >= aoa.length) break;
    const dateVal = aoa[dataEnd] ? aoa[dataEnd][colIndex['Date']] : null;
    if (dateVal === null || dateVal === undefined) break;
    blocks.push({ dataStart, dataEnd, avgRow: avgRow < aoa.length ? avgRow : null });
    k++;
    if (k > 200) break; // salvaguarda
  }
  return blocks;
}

const GAS_DEFAULTS = { 'NO2': 46.01, 'SO2': 64.07, 'O3': 48.00 };

function renderParamsTable() {
  paramsBodyRows.innerHTML = '';
  detectedParams.forEach(name => {
    const unit = unitsRow[colIndex[name]] ?? '';
    const isGasByUnit = String(unit).toLowerCase().includes('ppb');
    const defaultChecked = ['CO', 'NO2', 'PMA', 'PMB', 'RH', 'SO2'].includes(name);
    const defaultConvert = isGasByUnit || GAS_DEFAULTS[name] !== undefined;
    const pm = GAS_DEFAULTS[name] ?? '';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="checkbox" class="p-check" data-name="${name}" ${defaultChecked ? 'checked' : ''}></td>
      <td class="pname">${name}</td>
      <td class="punit">${unit || '—'}</td>
      <td><input type="checkbox" class="p-conv" data-name="${name}" ${defaultConvert ? 'checked' : ''} ${defaultChecked ? '' : 'disabled'}></td>
      <td><input type="number" class="pm-input" data-name="${name}" step="0.01" value="${pm}" ${defaultConvert && defaultChecked ? '' : 'disabled'}></td>
    `;
    paramsBodyRows.appendChild(tr);
  });

  paramsBodyRows.querySelectorAll('.p-check').forEach(cb => {
    cb.addEventListener('change', e => {
      const name = e.target.dataset.name;
      const convCb = paramsBodyRows.querySelector(`.p-conv[data-name="${name}"]`);
      const pmInput = paramsBodyRows.querySelector(`.pm-input[data-name="${name}"]`);
      convCb.disabled = !e.target.checked;
      pmInput.disabled = !e.target.checked || !convCb.checked;
    });
  });
  paramsBodyRows.querySelectorAll('.p-conv').forEach(cb => {
    cb.addEventListener('change', e => {
      const name = e.target.dataset.name;
      const pmInput = paramsBodyRows.querySelector(`.pm-input[data-name="${name}"]`);
      pmInput.disabled = !e.target.checked;
    });
  });
}

function getSelection() {
  const params = [];
  const conversions = {};
  paramsBodyRows.querySelectorAll('.p-check').forEach(cb => {
    if (cb.checked) {
      const name = cb.dataset.name;
      params.push(name);
      const convCb = paramsBodyRows.querySelector(`.p-conv[data-name="${name}"]`);
      if (convCb.checked) {
        const pm = parseFloat(paramsBodyRows.querySelector(`.pm-input[data-name="${name}"]`).value);
        if (!isNaN(pm) && pm > 0) conversions[name] = pm;
      }
    }
  });
  return { params, conversions };
}

function avgOfRange(colName, r1, r2) {
  const idx = colIndex[colName];
  let sum = 0, n = 0;
  for (let r = r1; r <= r2; r++) {
    const v = aoa[r] ? aoa[r][idx] : null;
    if (typeof v === 'number') { sum += v; n++; }
  }
  return n > 0 ? sum / n : null;
}

let lastResult = null;

genBtn.addEventListener('click', () => {
  genErr.textContent = '';
  const { params, conversions } = getSelection();
  if (params.length === 0) { genErr.textContent = 'Selecciona al menos un parámetro.'; return; }

  const startRow1based = parseInt(startRowInput.value, 10) || 3;
  const startIdx0 = startRow1based - 1;
  const blocks = detectBlocks(startIdx0);
  if (blocks.length === 0) { genErr.textContent = 'No se detectaron intervalos con el patrón 12 datos + 1 promedio a partir de la fila indicada.'; return; }

  const molarVol = parseFloat(molarVolInput.value) || 24.45;
  const dateIdx = colIndex['Date'], timeIdx = colIndex['Time'];

  const rows = blocks.map(b => {
    const dateVal = aoa[b.dataEnd][dateIdx];
    const timeVal = aoa[b.dataEnd][timeIdx];
    const dateObj = dateVal instanceof Date ? dateVal : null;
    const tp = LabUtils.toTimeParts(timeVal);
    let horaFinal = null, horaInicial = null;
    if (dateObj) {
      horaFinal = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate(), tp.h, tp.m);
      horaInicial = new Date(horaFinal.getTime() - 3600000);
    }
    const values = {};
    params.forEach(p => {
      let v = b.avgRow !== null ? aoa[b.avgRow][colIndex[p]] : null;
      if (typeof v !== 'number') v = avgOfRange(p, b.dataStart, b.dataEnd);
      values[p] = v;
    });
    const converted = {};
    Object.keys(conversions).forEach(p => {
      converted[p] = (typeof values[p] === 'number') ? values[p] * conversions[p] / molarVol : null;
    });
    return { date: dateObj, horaInicial, horaFinal, values, converted };
  });

  const genAvg = { values: {}, converted: {} };
  params.forEach(p => {
    const vals = rows.map(r => r.values[p]).filter(v => typeof v === 'number');
    genAvg.values[p] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  });
  Object.keys(conversions).forEach(p => {
    const vals = rows.map(r => r.converted[p]).filter(v => typeof v === 'number');
    genAvg.converted[p] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  });

  lastResult = { params, conversions, molarVol, rows, genAvg, sourceSheetName: sheetSelect.value };
  renderPreview(lastResult);
  dlBtn.style.display = 'inline-block';
});

function renderPreview(res) {
  const { params, conversions, rows, genAvg } = res;
  let head = '<tr><th>Fecha</th><th>Hora inicial</th><th>Hora final</th>';
  params.forEach(p => head += `<th>${p}</th>`);
  Object.keys(conversions).forEach(p => head += `<th>${p} µg/m³</th>`);
  head += '</tr>';

  let body = '';
  rows.forEach(r => {
    body += `<tr><td>${LabUtils.fmtDate(r.date)}</td><td>${LabUtils.fmtTime(r.horaInicial)}</td><td>${LabUtils.fmtTime(r.horaFinal)}</td>`;
    params.forEach(p => { body += `<td>${LabUtils.fmtNum(r.values[p], p === 'CO' ? 2 : 1)}</td>`; });
    Object.keys(conversions).forEach(p => { body += `<td>${LabUtils.fmtNum(r.converted[p], 1)}</td>`; });
    body += '</tr>';
  });
  body += `<tr class="avg"><td>Promedio general</td><td></td><td></td>`;
  params.forEach(p => { body += `<td>${LabUtils.fmtNum(genAvg.values[p], p === 'CO' ? 2 : 1)}</td>`; });
  Object.keys(conversions).forEach(p => { body += `<td>${LabUtils.fmtNum(genAvg.converted[p], 1)}</td>`; });
  body += '</tr>';

  previewTable.innerHTML = '<thead>' + head + '</thead><tbody>' + body + '</tbody>';
  previewWrap.style.display = 'block';
}

dlBtn.addEventListener('click', async () => {
  if (!lastResult) return;
  try { await buildAndDownload(lastResult); }
  catch (err) { genErr.textContent = 'Error generando el archivo: ' + err.message; }
});

async function buildAndDownload(res) {
  const { params, conversions, molarVol, rows, genAvg, sourceSheetName } = res;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Promedios');

  const headers = ['Date', 'Hora inicial', 'Hora final', ...params, ...Object.keys(conversions).map(p => p + ' (µg/m³)')];
  const units = ['(fecha)', '(inicio)', '(fin)', ...params.map(p => unitsRow[colIndex[p]] || ''), ...Object.keys(conversions).map(() => 'ug/m3')];

  LabUtils.styleHeaderRow(ws.addRow(headers));
  const unitsRowXL = ws.addRow(units);
  unitsRowXL.font = { italic: true };
  unitsRowXL.eachCell(c => c.alignment = { horizontal: 'center', vertical: 'middle' });

  rows.forEach(r => {
    const rowVals = [r.date || null, r.horaInicial || null, r.horaFinal || null];
    params.forEach(p => rowVals.push(typeof r.values[p] === 'number' ? r.values[p] : null));
    Object.keys(conversions).forEach(p => rowVals.push(typeof r.converted[p] === 'number' ? r.converted[p] : null));
    const xlRow = ws.addRow(rowVals);
    xlRow.getCell(1).numFmt = 'dd/mm/yyyy';
    xlRow.getCell(2).numFmt = 'h:mm AM/PM';
    xlRow.getCell(3).numFmt = 'h:mm AM/PM';
    params.forEach((p, i) => { xlRow.getCell(4 + i).numFmt = p === 'CO' ? '0.00' : '0.0'; });
    xlRow.eachCell(c => c.alignment = { horizontal: 'center', vertical: 'middle' });
  });

  const genRowVals = ['Promedio general', null, null];
  params.forEach(p => genRowVals.push(typeof genAvg.values[p] === 'number' ? genAvg.values[p] : null));
  Object.keys(conversions).forEach(p => genRowVals.push(typeof genAvg.converted[p] === 'number' ? genAvg.converted[p] : null));
  const genRow = ws.addRow(genRowVals);
  LabUtils.styleTotalRow(genRow);
  params.forEach((p, i) => { genRow.getCell(4 + i).numFmt = p === 'CO' ? '0.00' : '0.0'; });

  ws.columns.forEach(col => { col.width = 15; });

  if (Object.keys(conversions).length > 0) {
    const refCol = headers.length + 2;
    const c1 = ws.getRow(1).getCell(refCol);
    c1.value = 'Conversión ppb → µg/m³ (25°C, 1 atm)';
    c1.font = { bold: true };
    c1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBF7' } };
    let rIdx = 2;
    Object.keys(conversions).forEach(p => {
      ws.getRow(rIdx).getCell(refCol).value = 'PM ' + p + ' (g/mol)';
      const cell = ws.getRow(rIdx).getCell(refCol + 1);
      cell.value = conversions[p];
      cell.font = { color: { argb: 'FF0000FF' } };
      cell.numFmt = '0.00';
      rIdx++;
    });
    ws.getRow(rIdx).getCell(refCol).value = 'Vol. molar (L/mol)';
    const vmCell = ws.getRow(rIdx).getCell(refCol + 1);
    vmCell.value = molarVol;
    vmCell.font = { color: { argb: 'FF0000FF' } };
    vmCell.numFmt = '0.00';
    ws.getRow(rIdx).getCell(refCol).note = 'µg/m³ = ppb × PM / volumen molar';
    ws.getColumn(refCol).width = 26;
    ws.getColumn(refCol + 1).width = 10;
  }

  LabUtils.addTraceabilitySheet(wb, sourceSheetName, aoa);

  const base = (fname.textContent || 'archivo').replace(/\.[^/.]+$/, '');
  await LabUtils.downloadWorkbook(wb, 'Promedios_' + base + '.xlsx');
}
