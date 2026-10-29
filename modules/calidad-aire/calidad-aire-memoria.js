// modules/calidad-aire/calidad-aire-memoria.js
// Contenido de la "Memoria de cálculo" (ISO/IEC 17025) del módulo CAA. El formato lo pone
// LabMemoria (assets/js/memoria-calculo.js). Los valores de referencia se leen de las constantes
// de calidad-aire.js (HEADER_ALIASES, DATE_TIME_TITLES, HEADER_SEARCH_ROWS, REGISTROS_POR_BLOQUE,
// MAX_BLOQUES, GAS_DEFAULTS, VM_DEFAULT, FILA_INICIO_DEFAULT, PARAMS_PREDETERMINADOS): no se vuelve
// a escribir ninguno acá. No recalcula: el ejemplo trabajado reproduce la operación con los
// valores ya calculados (lastResult) y verifica que coincida.

(function () {
  const N = LabMemoria.num;
  const dec = p => (p === 'CO' ? 2 : 1); // mismos decimales que la vista previa y el .xlsx

  // ---------- Secciones 1–9 (descripción del método) ----------

  function secciones() {
    const aliasFilas = Object.entries(HEADER_ALIASES).map(([k, v]) => [k, v.map(a => `"${a}"`).join(', ')]);
    const gases = Object.keys(GAS_DEFAULTS);
    return [
      { id: 'objeto', bloques: [
        { tipo: 'parrafo', texto: `Se calculan los promedios horarios de los parámetros de calidad de aire ambiental a partir de los registros de 5 min del equipo (patrón EPAS: bloques de ${REGISTROS_POR_BLOQUE} registros más una fila de promedio), el promedio general del período, y la conversión de las concentraciones de gases de ppb a µg/m³.` },
        { tipo: 'parrafo', texto: 'El resultado sirve de base para el informe de resultados del laboratorio.' },
        { tipo: 'parrafo', texto: '**No incluye:** estimación de incertidumbre, comparación con límites o normas de calidad de aire, corrección de la conversión por temperatura y presión reales, ni validación de los datos del equipo (calibraciones, datos faltantes o fuera de rango).' }
      ] },
      { id: 'referencias', bloques: [
        { tipo: 'lista', items: [
          `Convención de la U.S. EPA para la conversión de concentraciones de gases entre ppb y µg/m³ a 25 °C y 1 atm (volumen molar ${N(VM_DEFAULT, 2)} L/mol).`,
          'ISO/IEC 17025:2017 — Requisitos generales para la competencia de los laboratorios de ensayo y calibración.'
        ] }
      ] },
      { id: 'entrada', bloques: [
        { tipo: 'parrafo', texto: '**Archivo del equipo (.xlsx).** Una hoja elegida por el usuario (por defecto, la primera). La estructura se detecta por contenido, nunca por posición fija:' },
        { tipo: 'lista', items: [
          `Fila de encabezado: la primera fila, entre las ${HEADER_SEARCH_ROWS} primeras, que tenga una celda titulada ${DATE_TIME_TITLES.map(t => `"${t}"`).join(', ')} (sin distinguir mayúsculas ni acentos). Son obligatorias las columnas de fecha y de hora.`,
          'Fila de unidades: la fila inmediatamente debajo del encabezado. Se muestra como "Unidad fuente" y no se usa como dato.',
          'Columnas de parámetros: se reconocen por su título según la tabla de la sección 5; las columnas con otro título se ignoran. Si dos columnas calzan con el mismo parámetro, se usa la primera.',
          `Inicio de los datos: por defecto, la fila del encabezado + 2 (después de la fila de unidades); el usuario puede cambiarla. Si el campo queda vacío al generar, se usa la fila ${FILA_INICIO_DEFAULT}.`,
          `Bloques horarios: desde la fila de inicio, cada bloque ocupa ${REGISTROS_POR_BLOQUE + 1} filas (${REGISTROS_POR_BLOQUE} registros de 5 min + 1 fila de promedio). Se aceptan bloques mientras el registro ${REGISTROS_POR_BLOQUE} del bloque tenga fecha, hasta un máximo de ${MAX_BLOQUES} bloques.`
        ] },
        { tipo: 'parrafo', texto: `**Datos que ingresa el usuario:** parámetros a extraer (por defecto ${PARAMS_PREDETERMINADOS.join(', ')}), qué parámetros convertir a µg/m³ y su peso molecular PM (por defecto se marca la conversión para las columnas con unidad "ppb" y para ${gases.join(', ')}), y el volumen molar Vm (por defecto ${N(VM_DEFAULT, 2)} L/mol).` }
      ] },
      { id: 'metodo', bloques: [
        { tipo: 'paso', n: 1, titulo: 'Fecha y hora del bloque', texto: 'La fecha y la hora final del bloque se toman del último registro de 5 min del bloque (registro 12), en horas y minutos. La hora inicial es la hora final menos 1 hora.' },
        { tipo: 'paso', n: 2, titulo: 'Promedio horario', texto: 'Para cada parámetro se toma el valor numérico de la fila de promedio del bloque, tal como lo calculó el equipo. Si esa celda no es numérica (vacía o con texto), se calcula el promedio aritmético de los registros numéricos del bloque.' },
        { tipo: 'formula', expr: `C_h = Σ c_i / n   (solo si falta la fila de promedio del equipo)`, variables: [
          ['C_h', 'Promedio horario del parámetro en el bloque', 'unidad fuente'],
          ['c_i', 'Valor numérico de cada registro de 5 min del bloque', 'unidad fuente'],
          ['n', `Cantidad de registros numéricos del bloque (hasta ${REGISTROS_POR_BLOQUE})`, '—']
        ] },
        { tipo: 'paso', n: 3, titulo: 'Conversión ppb → µg/m³', texto: 'Para los parámetros marcados para convertir y con un PM válido (> 0), cada promedio horario se convierte con la convención EPA.' },
        { tipo: 'formula', expr: 'C_µg = C_ppb × PM / Vm', variables: [
          ['C_µg', 'Concentración convertida', 'µg/m³'],
          ['C_ppb', 'Promedio horario del parámetro (paso 4.2)', 'ppb'],
          ['PM', 'Peso molecular del gas', 'g/mol'],
          ['Vm', 'Volumen molar', 'L/mol']
        ] },
        { tipo: 'paso', n: 4, titulo: 'Promedio general', texto: 'Promedio aritmético de los promedios horarios (o de los valores convertidos) de todos los bloques que tienen valor numérico.' },
        { tipo: 'formula', expr: 'C_gen = Σ C_h / m', variables: [
          ['C_gen', 'Promedio general del período', 'unidad del parámetro'],
          ['m', 'Cantidad de bloques con valor numérico', '—']
        ] }
      ] },
      { id: 'constantes', bloques: [
        { tipo: 'tabla', encabezados: ['Gas', 'PM por defecto (g/mol)'],
          filas: gases.map(g => [g, N(GAS_DEFAULTS[g], 2)]), alinear: ['left', 'right'], mono: [true, true], anchos: [4986, 4986],
          nota: 'El PM es editable en el paso 2; el valor usado en cada cálculo queda en la sección 10 y en el .xlsx.' },
        { tipo: 'tabla', encabezados: ['Constante', 'Valor', 'Uso'], filas: [
          ['Volumen molar Vm por defecto', `${N(VM_DEFAULT, 2)} L/mol (25 °C, 1 atm)`, 'Paso 4.3'],
          ['Registros por bloque', `${REGISTROS_POR_BLOQUE} + 1 fila de promedio`, 'Sección 3'],
          ['Máximo de bloques', String(MAX_BLOQUES), 'Sección 3'],
          ['Filas revisadas para el encabezado', String(HEADER_SEARCH_ROWS), 'Sección 3'],
          ['Fila de inicio si el campo queda vacío', String(FILA_INICIO_DEFAULT), 'Sección 3']
        ], anchos: [3800, 3400, 2772] },
        { tipo: 'tabla', encabezados: ['Parámetro', 'Títulos de columna reconocidos'], filas: aliasFilas,
          alinear: ['left', 'left'], mono: [true, true], anchos: [2200, 7772] }
      ] },
      { id: 'decision', bloques: [
        { tipo: 'parrafo', texto: 'El módulo no compara los resultados con límites ni emite un estado de cumplimiento: entrega los promedios horarios, el promedio general y las concentraciones convertidas.' },
        { tipo: 'parrafo', texto: LabMemoria.TEXTO_INCERTIDUMBRE }
      ] },
      { id: 'redondeo', bloques: [
        { tipo: 'lista', items: [
          'Todos los cálculos se hacen con la precisión completa del navegador (doble precisión IEEE-754). El redondeo se aplica solo al presentar.',
          'Vista previa: CO con 2 decimales; los demás parámetros y los valores en µg/m³, con 1 decimal.',
          'Archivo .xlsx: se guarda el valor completo; formato 0.00 para CO y 0.0 para los demás parámetros. Las columnas en µg/m³ no tienen formato numérico asignado. Fecha dd/mm/yyyy; horas h:mm AM/PM.',
          'PM y volumen molar en el bloque de referencia del .xlsx: formato 0.00.'
        ] }
      ] },
      { id: 'control', bloques: [
        { tipo: 'lista', items: [
          'Errores que detienen el proceso: el archivo no tiene hojas, la hoja tiene menos de 3 filas, no se encuentra la fila de encabezado, faltan las columnas de fecha u hora, no hay parámetros seleccionados o no se detecta ningún bloque desde la fila indicada.',
          'El panel de lectura muestra la hoja, la fila de encabezado, el mapeo título → columna, la cantidad de bloques detectados y la fila de inicio, para verificar la detección antes de generar.',
          'El .xlsx de salida incluye una copia de la hoja fuente (trazabilidad) y un bloque de referencia con el PM de cada gas convertido y el volumen molar usados.',
          'Los valores del .xlsx son estáticos (no fórmulas).',
          'Todo el procesamiento ocurre en el navegador: ningún dato sale del equipo del usuario.',
          'Esta memoria registra la huella SHA-256 del archivo fuente (sección 10).'
        ] }
      ] },
      { id: 'limites', bloques: [
        { tipo: 'lista', items: [
          `Se asume la estructura fija de ${REGISTROS_POR_BLOQUE} registros + 1 fila de promedio desde la fila de inicio; no se verifica que los registros estén cada 5 min ni que la fila de promedio lo sea. Una fila faltante o sobrante desplaza todos los bloques siguientes.`,
          'Cuando existe, se usa el promedio que calculó el equipo; el módulo no lo verifica contra los registros del bloque.',
          'La conversión a µg/m³ se aplica a los parámetros marcados por el usuario sin verificar que la unidad fuente sea ppb.',
          'La conversión usa un volumen molar fijo (25 °C, 1 atm), no las condiciones reales de la medición.',
          'La hora se toma en horas y minutos; si la celda de hora es texto, no se interpreta (queda 0:00). Si la fecha no es una fecha de Excel, las horas del bloque quedan vacías.',
          'El promedio general es el promedio de los promedios horarios, no de todos los registros de 5 min.'
        ] }
      ] }
    ];
  }

  // ---------- Sección 10 (registro de la ejecución) ----------

  function ejecucion() {
    if (!lastResult || previewWrap.style.display === 'none') return null;
    const r = lastResult;
    const f = r.fuente;
    const conv = Object.keys(r.conversions);

    // Ejemplo: primer parámetro convertido (o el primero) en el primer bloque con valor numérico.
    const p = conv[0] || r.params[0];
    const bi = r.rows.findIndex(x => typeof x.values[p] === 'number');
    const pasos = [];
    if (bi !== -1) {
      const b = f.blocks[bi];
      const fila = r.rows[bi];
      const col = f.colIndex[p];
      const unidad = f.unitsRow[col] || '';
      const u = unidad ? ' ' + unidad : '';
      const eq = b.avgRow !== null ? f.aoa[b.avgRow][col] : null;
      let ch;
      if (typeof eq === 'number') {
        ch = LabMemoria.verificar(eq, fila.values[p], `promedio horario ${p}, bloque ${bi + 1}`);
        pasos.push({
          titulo: 'Promedio horario (fila de promedio del equipo)',
          formula: 'C_h = valor de la fila de promedio del bloque',
          sustitucion: `bloque ${bi + 1}: registros en filas ${b.dataStart + 1}–${b.dataEnd + 1}, promedio en la fila ${b.avgRow + 1}`,
          resultado: `C_h = ${N(ch, 6)}${u}`
        });
      } else {
        const vals = [];
        for (let i = b.dataStart; i <= b.dataEnd; i++) {
          const v = f.aoa[i] ? f.aoa[i][col] : null;
          if (typeof v === 'number') vals.push(v);
        }
        const suma = vals.reduce((a, v) => a + v, 0);
        ch = LabMemoria.verificar(suma / vals.length, fila.values[p], `promedio horario ${p}, bloque ${bi + 1}`);
        pasos.push({
          titulo: 'Promedio horario (calculado con los registros del bloque)',
          formula: 'C_h = Σ c_i / n',
          sustitucion: `bloque ${bi + 1} (filas ${b.dataStart + 1}–${b.dataEnd + 1}): C_h = ${N(suma, 6)} / ${vals.length}`,
          resultado: `C_h = ${N(ch, 6)}${u}`
        });
      }
      let enGen = ch;
      if (p in r.conversions) {
        const pm = r.conversions[p];
        const cu = LabMemoria.verificar(ch * pm / r.molarVol, fila.converted[p], `conversión ${p}, bloque ${bi + 1}`);
        pasos.push({
          titulo: 'Conversión a µg/m³',
          formula: 'C_µg = C_ppb × PM / Vm',
          sustitucion: `C_µg = ${N(ch, 6)} × ${N(pm, 2)} / ${N(r.molarVol, 2)}`,
          resultado: `C_µg = ${N(cu, 6)} µg/m³  →  ${N(cu, 1)} µg/m³ (valor presentado)`
        });
        enGen = null;
      } else {
        pasos[0].resultado += `  →  ${N(ch, dec(p))}${u} (valor presentado)`;
      }
      const serie = r.rows.map(x => (enGen === null ? x.converted[p] : x.values[p])).filter(v => typeof v === 'number');
      const sumaGen = serie.reduce((a, v) => a + v, 0);
      const objetivo = enGen === null ? r.genAvg.converted[p] : r.genAvg.values[p];
      const gen = LabMemoria.verificar(sumaGen / serie.length, objetivo, `promedio general ${p}`);
      const ug = enGen === null;
      pasos.push({
        titulo: 'Promedio general',
        formula: 'C_gen = Σ C_h / m',
        sustitucion: `C_gen = ${N(sumaGen, 6)} / ${serie.length}`,
        resultado: `C_gen = ${N(gen, 6)}${ug ? ' µg/m³' : u}  →  ${N(gen, ug ? 1 : dec(p))}${ug ? ' µg/m³' : u} (valor presentado)`
      });
    }

    const conAvgEquipo = r.params.map(q => {
      const c = f.colIndex[q];
      const n = f.blocks.filter(b => b.avgRow !== null && typeof f.aoa[b.avgRow][c] === 'number').length;
      return `${q} ${n}/${f.blocks.length}`;
    }).join(' · ');
    const parametros = [
      ['Hoja usada', r.sourceSheetName],
      ['Fila de inicio de los datos', String(f.startRow1based)],
      ['Bloques horarios detectados', String(f.blocks.length)],
      ['Parámetros extraídos', r.params.map(q => `${q}${f.unitsRow[f.colIndex[q]] ? ` (${f.unitsRow[f.colIndex[q]]})` : ''}`).join(', ')],
      ['Bloques con fila de promedio del equipo', conAvgEquipo],
      ['Volumen molar Vm', `${N(r.molarVol, 2)} L/mol`],
      ['Conversiones a µg/m³', conv.length ? conv.map(q => `${q}: PM ${N(r.conversions[q], 2)} g/mol`).join(' · ') : 'Ninguna']
    ];

    const archivo = f.archivo ? [{ ...f.archivo, hojas: r.sourceSheetName }] : [];
    const avisos = [];
    const sinValor = r.params.filter(q => r.rows.some(x => typeof x.values[q] !== 'number'));
    if (sinValor.length) avisos.push(`Bloques sin valor numérico (celda vacía en el .xlsx) en: ${sinValor.join(', ')}.`);

    return {
      archivos: archivo,
      parametros,
      avisos,
      resumen: { tabla: {
        encabezados: ['Parámetro', 'Unidad', 'Promedio general', 'Bloques con valor'],
        filas: [
          ...r.params.map(q => [q, f.unitsRow[f.colIndex[q]] || '—', N(r.genAvg.values[q], dec(q)),
            `${r.rows.filter(x => typeof x.values[q] === 'number').length} de ${r.rows.length}`]),
          ...conv.map(q => [q, 'µg/m³', N(r.genAvg.converted[q], 1),
            `${r.rows.filter(x => typeof x.converted[q] === 'number').length} de ${r.rows.length}`])
        ],
        alinear: ['left', 'left', 'right', 'right'],
        anchos: [2400, 2400, 2600, 2572],
        nota: 'Los promedios horarios de cada bloque están en la hoja "Promedios" del .xlsx de resultados.'
      } },
      ejemplo: bi === -1 ? null : { titulo: `${p}, bloque ${bi + 1}`, pasos }
    };
  }

  function construirSpecMemoria() {
    return {
      modulo: MODULO_INFO,
      ficha: { magnitud: 'Promedio horario', resolucion: 'Registros de 5 min (EPAS)', norma: 'Convención EPA · 25 °C · 1 atm', salida: '.xlsx · Promedios + fuente' },
      secciones: secciones(),
      ejecucion: ejecucion()
    };
  }

  const memoriaErr = document.getElementById('memoriaErr');
  document.getElementById('memoriaBtn').addEventListener('click', async () => {
    memoriaErr.textContent = '';
    try {
      await LabMemoria.descargar(construirSpecMemoria());
    } catch (err) {
      memoriaErr.textContent = 'No se pudo generar la memoria de cálculo: ' + err.message;
    }
  });

  // Para pruebas y para calidad-aire-ui.js (estado del botón).
  window.construirSpecMemoria = construirSpecMemoria;
})();
