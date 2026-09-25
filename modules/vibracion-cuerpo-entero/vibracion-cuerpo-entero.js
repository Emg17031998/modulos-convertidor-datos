// modules/vibracion-cuerpo-entero/vibracion-cuerpo-entero.js
// Lógica específica del ensayo "Vibración de Cuerpo Entero (VCE)".
// Todo lo genérico (parseo numérico, descarga CSV, formateo) vive en assets/js/utils.js.
//
// Marca de versión — visible en la consola del navegador (F12 → Console) al cargar la página.
// Sirve para confirmar que el navegador está corriendo este archivo y no una copia en caché:
// si tras un cambio no aparece la fecha/nota esperada acá, el navegador no recargó el script.
console.log('[VCE] vibracion-cuerpo-entero.js cargado — versión 2026-09-25b (k fijo ISO 1,4/1,4/1,0 y límites Z corregidos)');
//
// Modelo: un área/medición por cálculo (igual que vibracion-mano-brazo.js) — se carga un .xlsx
// del equipo HVM200 (o se tipea/pega manualmente) con las 20 lecturas de aceleración RMS por
// banda de tercio de octava para X/Y/Z, se ingresa el tiempo de exposición real del operador
// (distinto de la duración de la medición) y se pondera cada banda a una jornada de referencia
// de 8h (ver T0_MINUTOS más abajo — fórmula ISO 2631-1/5349-1 estándar).

// 20 bandas de tercio de octava (Hz), fijas para los 3 ejes.
const BANDS = [1, 1.3, 1.6, 2, 2.5, 3.1, 4, 5, 6.3, 8, 10, 12.5, 16, 20, 25, 31.5, 40, 50, 63, 80];
const AXES = ['X', 'Y', 'Z'];

// Límites DGNTI-COPANIT 45-2000 para exposición de 8h, por banda (m/s²). X e Y comparten la
// misma curva; Z tiene la suya. Tabla fija de la norma, no depende de la medición.
const LIMITES_COPANIT = {
  XY: {
    1: 0.224, 1.3: 0.224, 1.6: 0.224, 2: 0.224, 2.5: 0.240, 3.1: 0.555, 4: 0.450, 5: 0.560,
    6.3: 0.710, 8: 0.900, 10: 1.120, 12.5: 1.400, 16: 1.800, 20: 2.240, 25: 2.800, 31.5: 3.550,
    40: 4.500, 50: 5.600, 63: 7.100, 80: 9.000
  },
  Z: {
    1: 0.630, 1.3: 0.560, 1.6: 0.500, 2: 0.450, 2.5: 0.400, 3.1: 0.355, 4: 0.315, 5: 0.315,
    6.3: 0.315, 8: 0.315, 10: 0.400, 12.5: 0.500, 16: 0.630, 20: 0.800, 25: 1.000, 31.5: 1.250,
    40: 1.600, 50: 2.000, 63: 2.500, 80: 3.150
  }
};
function limitFor(axis, band) {
  return (axis === 'Z' ? LIMITES_COPANIT.Z : LIMITES_COPANIT.XY)[band];
}

// Jornada de referencia para la ponderación a 8h. Constante deliberadamente aislada y fácil de
// ubicar: si al comparar contra el Excel real del laboratorio resulta que el factor de
// ponderación observado no corresponde a 480 min, este es el único lugar a tocar.
const T0_MINUTOS = 480;
const T0_SEGUNDOS_8H = T0_MINUTOS * 60;

// Factores k de ISO 2631-1 (ponderación Wd horizontal para X/Y, Wk vertical para Z) — se aplican
// SIEMPRE al valor combinado por banda, antes de la ponderación a 8h, igual que la plantilla del
// laboratorio. Son parte de la evaluación según la norma, no de la configuración del equipo: el
// HVM200 puede grabar con otros factores (se confirmó un archivo real grabado con k = 1/1/1), y
// en ese caso el valor del archivo NO se usa para calcular — solo se avisa de la diferencia.
const K_ISO = { X: 1.4, Y: 1.4, Z: 1.0 };

function normalizarTexto(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/\s+/g, ' ').trim().toLowerCase();
}

// --- Grilla de entrada (20 bandas × X/Y/Z) ---
// Un solo bloque fijo (no repetible) — el "segmento" de la spec original se simplificó a un
// único área por cálculo, igual que vibracion-mano-brazo.js, para mantener consistencia de UX
// entre módulos. Si más adelante se necesita combinar varias áreas en un mismo cálculo, hay que
// reintroducir esa lista (el código de combinación por energía ya soporta N muestras).

const gridBody = document.getElementById('gridBody');
const cells = { X: [], Y: [], Z: [] };

(function buildGrid() {
  const rowsHtml = BANDS.map((band, i) => {
    const cellsHtml = AXES.map(axis =>
      `<td><input type="text" inputmode="decimal" class="vce-cell" data-row="${i}" data-axis="${axis}" placeholder="0,000"></td>`
    ).join('');
    return `<tr><td class="vce-band">${band} Hz</td>${cellsHtml}</tr>`;
  }).join('');
  gridBody.innerHTML = rowsHtml;
  gridBody.querySelectorAll('.vce-cell').forEach(inp => {
    cells[inp.dataset.axis][parseInt(inp.dataset.row, 10)] = inp;
    inp.addEventListener('paste', handlePaste);
    inp.addEventListener('input', updateCalcButtonState);
  });
})();

// Al pegar sobre una celda de la grilla, interpreta el portapapeles como filas (salto de línea)
// y columnas (tabulación), rellenando desde la celda donde se hizo clic — replica el flujo de
// copiar desde el software del equipo y pegar en Excel.
function handlePaste(e) {
  const clipboard = e.clipboardData || window.clipboardData;
  const text = clipboard ? clipboard.getData('text') : '';
  if (!text) return;
  e.preventDefault();

  const input = e.target;
  const startRow = parseInt(input.dataset.row, 10);
  const startCol = AXES.indexOf(input.dataset.axis);

  const lines = text.replace(/\r/g, '').split('\n');
  while (lines.length && lines[lines.length - 1] === '') lines.pop();

  lines.forEach((line, ri) => {
    line.split('\t').forEach((raw, ci) => {
      const r = startRow + ri;
      const c = startCol + ci;
      if (r < 0 || r >= BANDS.length || c < 0 || c >= AXES.length) return;
      const target = cells[AXES[c]][r];
      if (target) target.value = raw.trim();
    });
  });
  updateCalcButtonState();
}

// El botón "Calcular" solo se habilita cuando los 3 ejes tienen sus 20 bandas con un valor
// numérico válido (por importación, tipeo o pegado) — igual que vibracion-mano-brazo.js exige
// los 3 archivos antes de calcular.
function gridIsComplete() {
  return AXES.every(axis => cells[axis].every(inp => LabUtils.parseLocaleNumber(inp.value) !== null));
}
function updateCalcButtonState() {
  calcBtn.disabled = !gridIsComplete();
}

// --- Importación desde .xlsx (formato del equipo HVM200) ---
// El archivo que exporta el equipo trae una hoja "Resumen", una "Historia del tiempo" y una hoja
// por eje ("X OBA" / "Y OBA" / "Z OBA" / "Sum OBA"). Dentro de cada hoja de eje hay 4 bloques de
// columnas en paralelo (RMS y pico, por octava completa y por tercio de octava) — el módulo solo
// usa el bloque "RMS, Octava 1/3". El equipo es inconsistente con los espacios en los nombres de
// hoja y de encabezado (ej. "X OBA" con un espacio, "Y  OBA" con dos) — todo se normaliza antes
// de comparar.

// Ubica la hoja del eje dado, sin asumir orden ni posición: primero busca "<letra> oba" (exacto,
// luego por contenido excluyendo la hoja de suma vectorial "Sum OBA"), y si no aparece cae a una
// hoja de una sola letra o, como último recurso, a una hoja que contenga la letra como palabra
// separada (ej. "Eje X").
function encontrarHojaEje(sheetNames, letraEje) {
  const norm = sheetNames.map(normalizarTexto);
  const letra = letraEje.toLowerCase();
  let i = norm.findIndex(n => n === `${letra} oba`);
  if (i === -1) i = norm.findIndex(n => n.includes(`${letra} oba`) && !n.includes('sum'));
  if (i === -1) i = norm.findIndex(n => n === letra);
  if (i === -1) i = norm.findIndex(n => !n.includes('sum') && new RegExp(`(^|[^a-z0-9])${letra}([^a-z0-9]|$)`).test(n));
  return i === -1 ? null : sheetNames[i];
}

// Dentro de la fila de encabezado (fila 1 de la hoja), ubica el bloque "RMS, Octava 1/3" por
// contenido de la celda combinada de inicio — nunca por letra de columna fija, porque el rango
// real varía según la configuración del equipo. El bloque termina donde empieza la siguiente
// celda no vacía de esa misma fila.
function encontrarBloqueRMS13(aoa) {
  const headerRow = aoa[0] || [];
  for (let c = 0; c < headerRow.length; c++) {
    const norm = normalizarTexto(headerRow[c]);
    if (norm.includes('rms') && norm.includes('1/3')) {
      let endCol = headerRow.length - 1;
      for (let c2 = c + 1; c2 < headerRow.length; c2++) {
        if (normalizarTexto(headerRow[c2]) !== '') { endCol = c2 - 1; break; }
      }
      return { startCol: c, endCol };
    }
  }
  return null;
}

// Ubica las columnas de Fecha/Hora de la hoja (buscando en las dos primeras filas, que es donde
// puede aparecer un encabezado simple de una sola columna, a diferencia de los bloques de banda
// que están combinados). Se usan para (a) saber dónde terminan realmente los datos — no se puede
// confiar en sheet.dimensions/!ref, que en archivos de muchas filas reporta relleno/formato
// sobrante de Excel más allá del último dato real — y (b) como respaldo para estimar la duración
// de cada fila si Resumen!B13 no está disponible.
const FECHA_HORA_ALIASES = { Fecha: ['fecha', 'date'], Hora: ['hora', 'time'] };
function encontrarColFechaHora(aoa) {
  const col = {};
  [0, 1].forEach(r => {
    const found = LabUtils.buildColIndexByAlias(aoa[r] || [], FECHA_HORA_ALIASES);
    Object.keys(found).forEach(k => { if (!(k in col)) col[k] = found[k]; });
  });
  return col;
}

// Empareja una frecuencia leída del archivo contra las 20 bandas fijas con tolerancia relativa
// (no absoluta): el equipo puede reportar las bandas preferidas ISO reales (1.25, 3.15...) en vez
// de los valores redondeados de la tabla COPANIT (1.3, 3.1...) que ya usa el resto del módulo.
function matchBandIndex(freq) {
  let bestIdx = -1, bestDiff = Infinity;
  BANDS.forEach((b, i) => {
    const diff = Math.abs(b - freq);
    if (diff < bestDiff) { bestDiff = diff; bestIdx = i; }
  });
  return bestIdx !== -1 && bestDiff <= Math.max(0.05, BANDS[bestIdx] * 0.05) ? bestIdx : -1;
}

// Convierte una celda de hora/duración (Date, fracción de día, o texto "hh:mm:ss") a segundos.
// Sirve tanto para Resumen!B26 (duración) como para una celda de Hora de una fila de datos
// (hora del día) — en ambos casos es la misma extracción de h:m:s.
function horaASegundos(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.getUTCHours() * 3600 + v.getUTCMinutes() * 60 + v.getUTCSeconds() + v.getUTCMilliseconds() / 1000;
  if (typeof v === 'number') return v * 24 * 3600;
  const m = String(v).trim().match(/^(\d+):(\d+)(?::(\d+(?:[.,]\d+)?))?/);
  if (!m) return null;
  return parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + (m[3] ? parseFloat(m[3].replace(',', '.')) : 0);
}

// Resumen!B13 ("Promedio") trae la duración de cada fila de datos como texto libre, ej.
// "60 seconds" o "1 second" — nunca se asume una sola forma exacta.
function parseDuracionPromedioSegundos(v) {
  if (v === null || v === undefined) return null;
  const m = String(v).trim().toLowerCase().match(/^([\d.,]+)\s*([a-záéíóúñ]+)/);
  if (!m) return null;
  const n = LabUtils.parseLocaleNumber(m[1]);
  if (n === null) return null;
  const unidad = m[2];
  if (/^(s|seg|second)/.test(unidad)) return n;
  if (/^(m|min)/.test(unidad)) return n * 60;
  if (/^(h|hora|hour)/.test(unidad)) return n * 3600;
  return null;
}

// Cada hoja de eje trae una fila por intervalo de tiempo grabado (a veces 3 filas de 60s, a
// veces 180 de 1s para la misma medición de 3 minutos) — no un solo valor por banda. Se combinan
// ponderando por la duración real de cada fila, con dos métodos posibles (switch en la UI):
//   RMS:      valor_banda = √( Σ(duración_i · valor_i²) / Σ(duración_i) )      — por energía
//   Promedio: valor_banda =    Σ(duración_i · valor_i)   / Σ(duración_i)       — aritmético
// Con duración uniforme (el caso normal dentro de un mismo archivo) RMS equivale a la media
// cuadrática simple y Promedio al promedio aritmético simple de todas las filas.
// Promedio es el método oficial de reporte del laboratorio (y el default). Decisión explícita del
// laboratorio: se promedian todas las filas tal cual vienen (3 de 60 s o 180 de 1 s), SIN
// reagruparlas en bloques. Se acepta el sesgo conocido: como cada fila es un RMS de su intervalo,
// el promedio de 180 filas de 1 s da algo menos que el de 3 filas de 60 s de la misma medición
// (RMS, en cambio, da idéntico en ambos casos).
const METODOS = { rms: 'RMS', promedio: 'Promedio' };

function combinarValor(muestras, duraciones, metodo) {
  let sumaPonderada = 0, sumaDuraciones = 0;
  muestras.forEach((v, i) => {
    const d = duraciones[i];
    sumaPonderada += d * (metodo === 'promedio' ? v : v * v);
    sumaDuraciones += d;
  });
  const media = sumaPonderada / sumaDuraciones;
  return metodo === 'promedio' ? media : Math.sqrt(media);
}

// Texto que identifica una fila de resumen agregada por el instrumento al final de la tabla
// (no una medición): "Promedio", "Media", "Average", "Mean", "Avg".
const ETIQUETA_FILA_RESUMEN_RE = /^(promedio|media|average|mean|avg)\b/;

function esVacio(v) {
  return v === null || v === undefined || String(v).trim() === '';
}

// Clave de tiempo de una fila (fecha + hora) para detectar una fila que repite el timestamp de
// la anterior. Sin columna de Hora devuelve null: la Fecha sola puede ser solo el día (igual en
// todas las filas) y marcaría como repetidas filas que son mediciones válidas.
function claveTiempo(row, colFechaHora) {
  if (colFechaHora.Hora === undefined) return null;
  const f = row[colFechaHora.Fecha];
  const h = row[colFechaHora.Hora];
  const fk = f instanceof Date ? f.getTime() : String(f);
  const hk = h instanceof Date ? h.getTime() : String(h);
  return fk + '|' + hk;
}

// Frecuencia de una celda de la fila 2, en forma estricta: la celda tiene que ser solo un número
// (opcionalmente con "Hz"). LabUtils.parseNumericHeader es más permisivo (toma el número inicial
// de cualquier texto) y leería una fecha como "25/09/2026" como si fuera la banda de 25 Hz.
function frecuenciaDeCelda(v) {
  if (v instanceof Date) return null;
  if (typeof v === 'number') return v;
  if (typeof v !== 'string' || !/^\s*\d+([.,]\d+)?\s*(hz)?\s*$/i.test(v)) return null;
  return LabUtils.parseNumericHeader(v);
}

function parseAxisSheet(aoa, duracionFilaSeg) {
  const bloque = encontrarBloqueRMS13(aoa);
  if (!bloque) {
    return { error: 'no se encontró el bloque "RMS, Octava 1/3" en la fila de encabezado de esta hoja' };
  }

  // La fila 2 tiene que traer las frecuencias de banda (números), no fechas ni texto. Si no, el
  // encabezado viene corrido respecto del formato esperado y se avisa explícitamente, en vez de
  // dejar que falle más abajo con un mensaje engañoso de "faltan bandas".
  const freqRow = aoa[1] || [];
  let frecuenciasEnFila2 = 0;
  for (let c = bloque.startCol; c <= bloque.endCol; c++) {
    if (frecuenciaDeCelda(freqRow[c]) !== null) frecuenciasEnFila2++;
  }
  if (frecuenciasEnFila2 === 0) {
    return {
      error: 'la fila 2 no contiene frecuencias de banda debajo del encabezado "RMS, Octava 1/3" — ' +
        'el encabezado parece corrido respecto del formato esperado (fila 1: bloque, fila 2: frecuencias, datos desde la fila 3)'
    };
  }

  const colForBand = new Array(BANDS.length).fill(-1);
  for (let c = bloque.startCol; c <= bloque.endCol; c++) {
    const freq = frecuenciaDeCelda(freqRow[c]);
    if (freq === null) continue;
    const bandIdx = matchBandIndex(freq);
    if (bandIdx !== -1 && colForBand[bandIdx] === -1) colForBand[bandIdx] = c;
  }
  const missing = BANDS.filter((b, i) => colForBand[i] === -1);
  if (missing.length) {
    return { error: `faltan la(s) banda(s) ${missing.join(', ')} Hz en el bloque de tercio de octava` };
  }

  const tieneValoresDeBanda = row => colForBand.some(c => LabUtils.parseLocaleNumber(row[c]) !== null);
  const tieneEtiquetaResumen = row => row.some(v => typeof v === 'string' && ETIQUETA_FILA_RESUMEN_RE.test(normalizarTexto(v)));

  // Filas de datos: desde la fila 3 (índice 2) hasta la primera fila vacía. No se usa
  // sheet.dimensions/!ref porque puede incluir relleno/formato sobrante de Excel más allá del
  // último dato real. Criterio de fin: primera fila con Fecha vacía (o, si no se encontró columna
  // de Fecha, primera fila sin valores de banda).
  // Si la fila que corta la tabla trae valores de banda pero no es una medición — Fecha vacía,
  // etiqueta "Promedio"/"Media", o el mismo timestamp que la fila anterior — es la fila de
  // promedio que agrega el instrumento: se excluye de la combinación y se guarda para verificar
  // lo calculado contra ella.
  const colFechaHora = encontrarColFechaHora(aoa);
  const dataRows = [];
  let filaResumenInstrumento = null;
  let claveAnterior = null;
  for (let r = 2; r < aoa.length; r++) {
    const row = aoa[r] || [];
    const conValores = tieneValoresDeBanda(row);

    if (conValores && tieneEtiquetaResumen(row)) { filaResumenInstrumento = row; break; }

    if (colFechaHora.Fecha !== undefined) {
      if (esVacio(row[colFechaHora.Fecha])) {
        if (conValores) filaResumenInstrumento = row;
        break;
      }
      const clave = claveTiempo(row, colFechaHora);
      if (clave !== null && clave === claveAnterior && conValores) { filaResumenInstrumento = row; break; }
      claveAnterior = clave;
    } else if (!conValores) {
      break;
    }
    dataRows.push(row);
  }
  if (dataRows.length === 0) {
    return { error: 'no se encontraron filas de datos (intervalos de tiempo) desde la fila 3 — revisa que no haya una fila vacía entre el encabezado de bandas y los datos' };
  }

  // Duración por fila: preferir Resumen!B13; si no está disponible, estimarla por la diferencia
  // de horario entre las dos primeras filas de datos de esta misma hoja; si tampoco se puede,
  // usar peso uniforme (equivalente a la media cuadrática simple).
  let duracionSeg = duracionFilaSeg;
  if (duracionSeg === null && colFechaHora.Hora !== undefined && dataRows.length >= 2) {
    const t0 = horaASegundos(dataRows[0][colFechaHora.Hora]);
    const t1 = horaASegundos(dataRows[1][colFechaHora.Hora]);
    if (t0 !== null && t1 !== null && t1 - t0 > 0) duracionSeg = t1 - t0;
  }
  const duraciones = dataRows.map(() => (duracionSeg !== null ? duracionSeg : 1));

  // Se devuelven las muestras crudas por banda (no un valor ya combinado): el método de
  // combinación (RMS/Promedio) se aplica después, en aplicarMetodoAGrid(), para poder recalcular
  // al instante si el usuario cambia el switch sin tener que releer el archivo.
  const samples = colForBand.map(c => {
    const muestras = [];
    const muestrasDur = [];
    dataRows.forEach((row, i) => {
      const v = LabUtils.parseLocaleNumber(row[c]);
      if (v !== null) { muestras.push(v); muestrasDur.push(duraciones[i]); }
    });
    return { muestras, duraciones: muestrasDur };
  });
  if (samples.some(s => s.muestras.length === 0)) {
    return { error: 'alguna banda no tiene valores numéricos en ninguna fila de datos' };
  }

  const avisos = [];

  // Bandas con celdas vacías dentro de filas válidas: se promedian solo las filas con dato, pero
  // se avisa porque esa banda queda con menos muestras que las demás.
  const incompletas = BANDS.filter((b, i) => samples[i].muestras.length < dataRows.length);
  if (incompletas.length) {
    avisos.push(`la(s) banda(s) ${incompletas.join(', ')} Hz tienen celdas vacías en alguna fila; se combinaron solo las filas con dato.`);
  }

  // Verificación cruzada contra la fila de promedio del instrumento (si existe). No se sabe si el
  // equipo la calcula como promedio aritmético o por energía, así que se acepta que coincida con
  // cualquiera de los dos; se avisa solo si no coincide con ninguno.
  if (filaResumenInstrumento) {
    const noCoinciden = [];
    BANDS.forEach((band, i) => {
      const ref = LabUtils.parseLocaleNumber(filaResumenInstrumento[colForBand[i]]);
      if (ref === null) return;
      const { muestras, duraciones: d } = samples[i];
      const tol = Math.max(0.0005, Math.abs(ref) * 0.01);
      const okProm = Math.abs(combinarValor(muestras, d, 'promedio') - ref) <= tol;
      const okRms = Math.abs(combinarValor(muestras, d, 'rms') - ref) <= tol;
      if (!okProm && !okRms) noCoinciden.push(band);
    });
    if (noCoinciden.length) {
      avisos.push(`la fila de promedio del instrumento (excluida del cálculo) no coincide con lo calculado en la(s) banda(s) ${noCoinciden.join(', ')} Hz — puede haber filas o bandas mal leídas; revisa el archivo antes de usar el resultado.`);
    }
  }

  return { samples, avisos };
}

// Metadata de la hoja "Resumen". ANTES se leía por dirección de celda fija (B12, B22:D22, etc.),
// asumiendo que el layout del reporte es idéntico en todos los archivos — resultó ser falso: se
// confirmó con un archivo real (israel_gonzales.xlsx) que "Factores k" no está en la fila 22 en
// todos los casos (el equipo puede agregar/quitar filas según la configuración de la medición,
// desplazando todo lo que sigue). Eso hacía que B22 leyera una celda distinta —a veces vacía, a
// veces con otro número—, lo que en la práctica anulaba el factor k para X/Y sin ningún error
// visible. Ahora cada fila se ubica por el texto de su etiqueta (misma filosofía que el bloque
// "RMS, Octava 1/3" de las hojas de eje: nunca asumir posición, buscar por contenido), y los
// valores se leen de las columnas B/C/D de ESA fila encontrada, sea cual sea su número real.
const RESUMEN_ETIQUETAS = {
  modoFuncionamiento: ['modo de funcionamiento', 'modo funcionamiento', 'operating mode'],
  promedio: ['promedio', 'average', 'averaging time'],
  tiempoEjecucion: ['tiempo de ejecucion', 'tiempo de ejecución', 'run time', 'duracion de la medicion', 'duración de la medición'],
  factoresK: ['factores k', 'factor k', 'k factors', 'k-factor', 'k factor'],
  aRMS: ['arms', 'a rms', 'aceleracion rms', 'aceleración rms'],
  a8Equipo: ['a(8)', 'a (8)', 'a8']
};

// Recorre toda la hoja buscando una celda cuyo texto normalizado calce (exacto o por contenido)
// con alguno de los alias dados, y devuelve el índice de esa fila (0-based) o -1 si no aparece.
function encontrarFilaPorEtiqueta(aoa, aliases) {
  for (let r = 0; r < aoa.length; r++) {
    const row = aoa[r] || [];
    for (let c = 0; c < row.length; c++) {
      const norm = normalizarTexto(row[c]);
      if (norm && aliases.some(a => norm === a || norm.includes(a))) return r;
    }
  }
  return -1;
}

function readResumenMeta(workbook) {
  const sheetName = workbook.SheetNames.find(n => normalizarTexto(n) === 'resumen');
  if (!sheetName) return null;
  const aoa = LabUtils.sheetToAOA(workbook, sheetName);

  // Valor de la columna col (0=A, 1=B, 2=C, 3=D) de la fila donde se encontró la etiqueta dada.
  // null si la etiqueta no aparece en la hoja — nunca se adivina una fila por defecto.
  const valorEnFila = (etiquetaKey, col) => {
    const fila = encontrarFilaPorEtiqueta(aoa, RESUMEN_ETIQUETAS[etiquetaKey]);
    if (fila === -1) return null;
    const v = (aoa[fila] || [])[col];
    return v === undefined ? null : v;
  };

  return {
    modoFuncionamiento: valorEnFila('modoFuncionamiento', 1),
    promedio: valorEnFila('promedio', 1),
    tiempoEjecucion: valorEnFila('tiempoEjecucion', 1),
    factoresK: {
      X: LabUtils.parseLocaleNumber(valorEnFila('factoresK', 1)),
      Y: LabUtils.parseLocaleNumber(valorEnFila('factoresK', 2)),
      Z: LabUtils.parseLocaleNumber(valorEnFila('factoresK', 3))
    },
    aRMS: {
      X: LabUtils.parseLocaleNumber(valorEnFila('aRMS', 1)),
      Y: LabUtils.parseLocaleNumber(valorEnFila('aRMS', 2)),
      Z: LabUtils.parseLocaleNumber(valorEnFila('aRMS', 3))
    },
    a8Equipo: {
      X: LabUtils.parseLocaleNumber(valorEnFila('a8Equipo', 1)),
      Y: LabUtils.parseLocaleNumber(valorEnFila('a8Equipo', 2)),
      Z: LabUtils.parseLocaleNumber(valorEnFila('a8Equipo', 3))
    }
  };
}

const areaInput = document.getElementById('areaInput');
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const fname = document.getElementById('fname');
const importErr = document.getElementById('importErr');
const importWarn = document.getElementById('importWarn');

// Muestras crudas por banda del último archivo importado ({X,Y,Z}: 20 × {muestras, duraciones}),
// retenidas en memoria para poder recalcular la grilla al instante cuando cambia el switch de
// método sin volver a leer el archivo. null si nunca se importó un archivo (entrada manual/pegado).
let lastImportSamples = null;
const METODO_DEFAULT = 'promedio';
let metodoActual = METODO_DEFAULT;

// Vuelca a la grilla los valores combinados con el método actualmente seleccionado, con el
// factor k del eje ya aplicado (valor_banda = combinación × k_eje — ver K_ISO), en los dos modos.
// No hace nada si no hay un archivo importado (la entrada manual/pegada no tiene muestras que
// recombinar).
function aplicarMetodoAGrid() {
  if (!lastImportSamples) return;
  AXES.forEach(axis => {
    const k = K_ISO[axis];
    BANDS.forEach((band, i) => {
      const { muestras, duraciones } = lastImportSamples[axis][i];
      const v = combinarValor(muestras, duraciones, metodoActual) * k;
      cells[axis][i].value = String(v).replace('.', ',');
    });
  });
  updateCalcButtonState();
  updateStaleWarning();
}

document.querySelectorAll('.vce-segmented-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.classList.contains('active')) return;
    document.querySelectorAll('.vce-segmented-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    metodoActual = btn.dataset.method;
    aplicarMetodoAGrid();
  });
});

async function handleFile(file) {
  importErr.textContent = '';
  importWarn.textContent = '';
  fname.textContent = file.name;
  try {
    const workbook = await LabUtils.readWorkbook(file);
    const meta = readResumenMeta(workbook);
    const duracionFilaSeg = meta ? parseDuracionPromedioSegundos(meta.promedio) : null;

    const samples = {};
    const warnings = [];
    for (const axis of AXES) {
      const sheetName = encontrarHojaEje(workbook.SheetNames, axis);
      if (!sheetName) { importErr.textContent = `No se encontró la hoja del eje ${axis} en este archivo.`; return; }
      const aoa = LabUtils.sheetToAOA(workbook, sheetName);
      const parsed = parseAxisSheet(aoa, duracionFilaSeg);
      if (parsed.error) { importErr.textContent = `Eje ${axis} (hoja "${sheetName}"): ${parsed.error}.`; return; }
      samples[axis] = parsed.samples;
      parsed.avisos.forEach(a => warnings.push(`Eje ${axis}: ${a}`));
    }

    lastImportSamples = samples;
    aplicarMetodoAGrid();

    if (meta) {
      const distintos = AXES.filter(axis => meta.factoresK[axis] !== null && Math.abs(meta.factoresK[axis] - K_ISO[axis]) > 0.001);
      if (distintos.length) {
        const delArchivo = distintos.map(a => `${a.toLowerCase()}=${meta.factoresK[a]}`).join(', ');
        const iso = distintos.map(a => `${a.toLowerCase()}=${K_ISO[a]}`).join(', ');
        warnings.push(`El archivo fue grabado con factores k ${delArchivo}; el cálculo usa los de ISO 2631-1 (${iso}).`);
      }
    }

    if (meta) {
      if (meta.modoFuncionamiento && normalizarTexto(meta.modoFuncionamiento) !== 'wholebody') {
        warnings.push(`Modo de funcionamiento del archivo: "${meta.modoFuncionamiento}" (se esperaba "WholeBody").`);
      }

      const teSegundos = horaASegundos(meta.tiempoEjecucion);
      if (teSegundos !== null) {
        AXES.forEach(axis => {
          const { aRMS, factoresK, a8Equipo } = meta;
          if (aRMS[axis] === null || factoresK[axis] === null || a8Equipo[axis] === null) return;
          const a8Calc = aRMS[axis] * factoresK[axis] * Math.sqrt(teSegundos / T0_SEGUNDOS_8H);
          const tol = Math.max(0.0005, a8Equipo[axis] * 0.02);
          if (Math.abs(a8Calc - a8Equipo[axis]) > tol) {
            warnings.push(`Eje ${axis}: A(8) recalculado (${a8Calc.toFixed(5)}) difiere del reportado por el equipo (${a8Equipo[axis].toFixed(5)}) — verifica el archivo.`);
          }
        });
      }
    }
    importWarn.textContent = warnings.join(' ');
  } catch (err) {
    importErr.textContent = `No se pudo leer "${file.name}": ` + err.message;
  }
}

LabUtils.attachDropzone(dropzone, fileInput, handleFile);

document.getElementById('clearBtn').addEventListener('click', () => {
  areaInput.value = '';
  fileInput.value = '';
  fname.textContent = 'Ningún archivo cargado';
  importErr.textContent = '';
  importWarn.textContent = '';
  AXES.forEach(axis => cells[axis].forEach(inp => { inp.value = ''; }));
  lastImportSamples = null;
  metodoActual = METODO_DEFAULT;
  document.querySelectorAll('.vce-segmented-btn').forEach(b => b.classList.toggle('active', b.dataset.method === METODO_DEFAULT));
  tiempoInput.value = '';
  updateCalcButtonState();
  resultsStep.style.display = 'none';
  calcErr.textContent = '';
  lastResult = null;
  updateStaleWarning();
});

// --- Cálculo ---
// Un solo área por cálculo: A(8) = valor_medido × √(tiempo de exposición / T0) — el atajo de un
// solo segmento de la fórmula general de combinación de dosis (ISO 2631-1/5349-1). El valor de
// la grilla (datos[axis][i]) ya viene con el factor k del eje aplicado desde aplicarMetodoAGrid()
// — acá solo falta la ponderación a 8h.

function calculate(tiempoMin) {
  const datos = {};
  AXES.forEach(axis => { datos[axis] = cells[axis].map(inp => LabUtils.parseLocaleNumber(inp.value)); });

  const rows = BANDS.map((band, i) => {
    const row = { band };
    AXES.forEach(axis => {
      const medido = datos[axis][i] * Math.sqrt(tiempoMin / T0_MINUTOS);
      const limite = limitFor(axis, band);
      row[axis] = { medido, limite, excede: medido > limite };
    });
    return row;
  });

  const axisSummary = {};
  AXES.forEach(axis => {
    let exceedCount = 0, worst = null;
    rows.forEach(r => {
      const cell = r[axis];
      if (cell.excede) exceedCount++;
      const ratio = cell.medido / cell.limite;
      if (!worst || ratio > worst.ratio) worst = { band: r.band, ratio };
    });
    axisSummary[axis] = { exceedCount, worstBand: worst.band, worstRatio: worst.ratio };
  });

  return { rows, axisSummary, area: areaInput.value.trim() || '(sin nombre)', tiempoMin, datos, method: metodoActual };
}

function fmtHMS(totalMinutos) {
  const totalSeconds = Math.round(totalMinutos * 60);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h}h ${m}m ${s}s`;
}

// --- Render de resultados ---

const tiempoInput = document.getElementById('tiempoInput');
const calcBtn = document.getElementById('calcBtn');
const calcErr = document.getElementById('calcErr');
const resultsStep = document.getElementById('resultsStep');
const axisSummaryEl = document.getElementById('axisSummary');
const totalExposureEl = document.getElementById('totalExposure');
const resultsTable = document.getElementById('resultsTable');
const exportCsvBtn = document.getElementById('exportCsvBtn');
const exportXlsxBtn = document.getElementById('exportXlsxBtn');
const staleWarnEl = document.getElementById('staleWarn');

let lastResult = null;
updateCalcButtonState();

// Si el switch de método cambia después de calcular, los resultados de la sección 3 quedan
// desactualizados respecto al método ahora seleccionado — avisar en vez de dejarlo sin
// indicación (es justo la confusión original entre plantilla y módulo, ahora dentro del propio
// módulo si no se avisa).
function updateStaleWarning() {
  if (lastResult && lastResult.method !== metodoActual) {
    staleWarnEl.textContent = `Resultados calculados con ${METODOS[lastResult.method]} — cambiá el método y volvé a presionar Calcular para actualizarlos.`;
  } else {
    staleWarnEl.textContent = '';
  }
}

calcBtn.addEventListener('click', () => {
  calcErr.textContent = '';

  const tiempoMin = LabUtils.parseLocaleNumber(tiempoInput.value);
  if (tiempoMin === null || tiempoMin <= 0) {
    calcErr.textContent = 'Ingresa el tiempo de exposición real (minutos).';
    return;
  }
  if (!gridIsComplete()) {
    calcErr.textContent = 'Carga o completa los datos de los 3 ejes antes de calcular.';
    return;
  }

  lastResult = calculate(tiempoMin);
  renderResults(lastResult);
  resultsStep.style.display = '';
  updateStaleWarning();
});

function renderResults(result) {
  axisSummaryEl.innerHTML = AXES.map(axis => {
    const s = result.axisSummary[axis];
    const estado = s.exceedCount === 0
      ? '<span class="status-ok">Cumple</span>'
      : `<span class="status-bad">${s.exceedCount} banda(s) exceden</span>`;
    return `<div class="vce-axis-card">
      <h4>Eje ${axis}</h4>
      <p>${estado}</p>
      <p>Banda más exigida: <strong>${s.worstBand} Hz</strong> (${(s.worstRatio * 100).toFixed(0)}% del límite)</p>
    </div>`;
  }).join('');

  totalExposureEl.textContent = `Tiempo de exposición considerado: ${result.tiempoMin} min (${fmtHMS(result.tiempoMin)}) · Método: ${METODOS[result.method]}`;

  let head = '<tr><th>Frecuencia (Hz)</th>';
  AXES.forEach(axis => { head += `<th>${axis} medido (m/s²)</th><th>${axis} límite (m/s²)</th><th>${axis} estado</th>`; });
  head += '</tr>';

  let body = '';
  result.rows.forEach(r => {
    const anyExceed = AXES.some(axis => r[axis].excede);
    body += `<tr class="${anyExceed ? 'vce-row-exceed' : ''}"><td>${r.band}</td>`;
    AXES.forEach(axis => {
      const cell = r[axis];
      const statusClass = cell.excede ? 'status-bad' : 'status-ok';
      body += `<td>${LabUtils.fmtNum(cell.medido, 3)}</td><td>${LabUtils.fmtNum(cell.limite, 3)}</td>` +
        `<td><span class="${statusClass}">${cell.excede ? 'Excede' : 'Cumple'}</span></td>`;
    });
    body += '</tr>';
  });

  resultsTable.innerHTML = '<thead>' + head + '</thead><tbody>' + body + '</tbody>';
}

exportCsvBtn.addEventListener('click', () => {
  if (!lastResult) return;
  const rows = [];
  rows.push(['Vibración de Cuerpo Entero (VCE) — Resumen ponderado a 8h']);
  rows.push(['Norma', 'DGNTI-COPANIT 45-2000']);
  rows.push(['Jornada de referencia (T0)', T0_MINUTOS + ' min']);
  rows.push([]);
  rows.push(['Área', lastResult.area]);
  rows.push(['Tiempo de exposición real (min)', lastResult.tiempoMin]);
  rows.push(['Método de combinación por banda', METODOS[lastResult.method]]);
  rows.push([]);

  const header = ['Frecuencia (Hz)'];
  AXES.forEach(axis => header.push(`${axis} medido (m/s²)`, `${axis} límite (m/s²)`, `${axis} estado`));
  rows.push(header);

  lastResult.rows.forEach(r => {
    const row = [r.band];
    AXES.forEach(axis => {
      const cell = r[axis];
      row.push(cell.medido.toFixed(3), cell.limite.toFixed(3), cell.excede ? 'Excede' : 'Cumple');
    });
    rows.push(row);
  });

  rows.push([]);
  rows.push(['Resumen por eje']);
  rows.push(['Eje', 'Estado general', 'Banda más exigida (Hz)', 'Razón medido/límite']);
  AXES.forEach(axis => {
    const s = lastResult.axisSummary[axis];
    rows.push([axis, s.exceedCount === 0 ? 'Cumple' : `${s.exceedCount} banda(s) exceden`, s.worstBand, s.worstRatio.toFixed(2)]);
  });

  rows.push([]);
  rows.push(['Fórmula utilizada', `A(8) = valor medido × √(tiempo de exposición / ${T0_MINUTOS})`]);
  rows.push(['Generado', new Date().toLocaleString('es-PA')]);

  LabUtils.downloadCSV(rows, 'Vibracion_Cuerpo_Entero_VCE.csv');
});

// Exportación a .xlsx real (no solo CSV) con SheetJS, generada en el navegador. A diferencia del
// CSV, los valores medido/límite quedan como números con formato nativo de Excel (no texto), y
// se agrega una hoja de trazabilidad con los datos fuente por banda.
exportXlsxBtn.addEventListener('click', () => {
  if (!lastResult) return;

  const rows = [];
  rows.push(['Vibración de Cuerpo Entero (VCE) — Resumen ponderado a 8h']);
  rows.push(['Norma', 'DGNTI-COPANIT 45-2000']);
  rows.push(['Jornada de referencia (T0)', T0_MINUTOS, 'min']);
  rows.push([]);
  rows.push(['Área', lastResult.area]);
  rows.push(['Tiempo de exposición real (min)', lastResult.tiempoMin]);
  rows.push(['Método de combinación por banda', METODOS[lastResult.method]]);
  rows.push([]);

  const header = ['Frecuencia (Hz)'];
  AXES.forEach(axis => header.push(`${axis} medido (m/s²)`, `${axis} límite (m/s²)`, `${axis} estado`));
  rows.push(header);

  const dataStartIdx = rows.length;
  lastResult.rows.forEach(r => {
    const row = [r.band];
    AXES.forEach(axis => {
      const cell = r[axis];
      row.push(cell.medido, cell.limite, cell.excede ? 'Excede' : 'Cumple');
    });
    rows.push(row);
  });
  const dataEndIdx = rows.length - 1;

  rows.push([]);
  rows.push(['Resumen por eje']);
  rows.push(['Eje', 'Estado general', 'Banda más exigida (Hz)', 'Razón medido/límite']);
  const axisStartIdx = rows.length;
  AXES.forEach(axis => {
    const s = lastResult.axisSummary[axis];
    rows.push([axis, s.exceedCount === 0 ? 'Cumple' : `${s.exceedCount} banda(s) exceden`, s.worstBand, s.worstRatio]);
  });
  const axisEndIdx = rows.length - 1;

  rows.push([]);
  rows.push(['Fórmula utilizada', `A(8) = valor medido x RAIZ(tiempo de exposición / ${T0_MINUTOS})`]);
  rows.push(['Generado', new Date().toLocaleString('es-PA')]);

  const ws = XLSX.utils.aoa_to_sheet(rows);

  for (let r = dataStartIdx; r <= dataEndIdx; r++) {
    AXES.forEach((axis, ai) => {
      const medidoCol = 1 + ai * 3;
      const limiteCol = medidoCol + 1;
      [medidoCol, limiteCol].forEach(c => {
        const ref = XLSX.utils.encode_cell({ r, c });
        if (ws[ref]) ws[ref].z = '0.000';
      });
    });
  }
  for (let r = axisStartIdx; r <= axisEndIdx; r++) {
    const ref = XLSX.utils.encode_cell({ r, c: 3 });
    if (ws[ref]) ws[ref].z = '0%';
  }

  ws['!cols'] = [{ wch: 16 }, ...AXES.flatMap(() => [{ wch: 16 }, { wch: 16 }, { wch: 10 }])];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Resumen VCE');

  const traceRows = [
    ['Trazabilidad — datos fuente'],
    [],
    [`Área: ${lastResult.area}`, `Tiempo de exposición real: ${lastResult.tiempoMin} min`],
    ['Frecuencia (Hz)', 'X (m/s²)', 'Y (m/s²)', 'Z (m/s²)']
  ];
  BANDS.forEach((band, i) => traceRows.push([band, lastResult.datos.X[i], lastResult.datos.Y[i], lastResult.datos.Z[i]]));
  const traceWs = XLSX.utils.aoa_to_sheet(traceRows);
  traceWs['!cols'] = [{ wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, traceWs, 'Trazabilidad');

  XLSX.writeFile(wb, 'Vibracion_Cuerpo_Entero_VCE.xlsx');
});
