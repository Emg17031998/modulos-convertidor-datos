// modules/vibracion-cuerpo-entero/vibracion-cuerpo-entero-memoria.js
// Contenido de la "Memoria de cálculo" (ISO/IEC 17025) del módulo VCE. El formato lo pone
// LabMemoria (assets/js/memoria-calculo.js). Todos los valores numéricos de referencia se leen de
// las constantes de vibracion-cuerpo-entero.js (BANDS, LIMITES_COPANIT, K_ISO, T0_MINUTOS, TOL_*):
// no se vuelve a escribir ninguno acá. No recalcula: el ejemplo trabajado reproduce la operación
// con los valores ya calculados y verifica que coincida con el resultado del módulo.

(function () {
  const N = LabMemoria.num;
  const hz = b => String(b).replace('.', ',');
  const pct = v => N(v * 100, 0) + ' %';

  // Estado del último cálculo, tomado en el momento de presionar Calcular (este listener se
  // registra después del de vibracion-cuerpo-entero.js, así que lastResult ya es el nuevo).
  let snap = null;
  document.getElementById('calcBtn').addEventListener('click', () => {
    if (!lastResult) return;
    snap = {
      result: lastResult,
      samples: lastImportSamples,
      meta: lastImportMeta,
      file: lastImportFile,
      operador: operadorInput.value.trim(),
      equipo: equipoInput.value.trim(),
      hora: horaDelReporte()
    };
  });

  // ---------- Secciones 1–9 (descripción del método) ----------

  function secciones() {
    const kTexto = AXES.map(e => `k_${e} = ${N(K_ISO[e], 1)}`).join('; ');
    return [
      { id: 'objeto', bloques: [
        { tipo: 'parrafo', texto: `Se calcula la aceleración ponderada de exposición diaria A(8h) por banda de tercio de octava (${hz(BANDS[0])}–${hz(BANDS[BANDS.length - 1])} Hz, ${BANDS.length} bandas) para los ejes X, Y y Z, a partir del archivo del equipo HVM200 o de valores ingresados en la interfaz, y se compara cada valor con los límites de DGNTI-COPANIT 45-2000 (curva X/Y y curva Z).` },
        { tipo: 'parrafo', texto: 'El resultado sirve de base para el informe de resultados del laboratorio.' },
        { tipo: 'parrafo', texto: '**No incluye:** estimación de incertidumbre, combinación de varias áreas o segmentos de exposición en un mismo cálculo, ni valor total o vectorial de A(8h).' }
      ] },
      { id: 'referencias', bloques: [
        { tipo: 'lista', items: [
          'DGNTI-COPANIT 45-2000 — Higiene y seguridad industrial en ambientes de trabajo donde se generen vibraciones (límites por banda de tercio de octava para exposición de 8 h).',
          'ISO 2631-1 — Vibración mecánica y choque. Evaluación de la exposición humana a la vibración de cuerpo entero (factores de multiplicación k por eje).',
          'ISO/IEC 17025:2017 — Requisitos generales para la competencia de los laboratorios de ensayo y calibración.'
        ] }
      ] },
      { id: 'entrada', bloques: [
        { tipo: 'parrafo', texto: '**Archivo del equipo (.xlsx, HVM200).** Contiene una hoja por eje y una hoja "Resumen". La estructura se detecta por contenido, nunca por posición fija:' },
        { tipo: 'lista', items: [
          'Hoja de cada eje: se busca por nombre "<eje> oba" (sin distinguir mayúsculas ni espacios repetidos), luego por nombre de una sola letra y, por último, por la letra del eje como palabra separada. Se excluyen las hojas cuyo nombre contiene "sum" (suma vectorial).',
          'Bloque de datos: el encabezado combinado de la fila 1 que contiene "RMS" y "1/3" (RMS por banda de tercio de octava). Se descartan los bloques de octava completa y de valor pico.',
          'Bandas: la fila 2 debe contener las frecuencias centrales; si contiene otra cosa se informa error de encabezado corrido. Cada columna se empareja con la banda nominal más cercana si la diferencia no supera la tolerancia de la sección 5; las bandas fuera del rango se descartan.',
          'Filas de datos: desde la fila 3 hasta la primera fila con la columna Fecha vacía (si no hay columna Fecha, hasta la primera fila sin valores de banda). No se usa el rango declarado de la hoja.',
          'Fila de promedio del instrumento: si la fila que cierra la tabla tiene valores de banda y además la Fecha vacía, una etiqueta "Promedio", "Media", "Average", "Mean" o "Avg", o el mismo instante que la fila anterior, se excluye del cálculo y se usa solo para verificación (sección 8).',
          'Hoja "Resumen": cada dato se ubica por el texto de su etiqueta (duración de cada fila "Promedio", tiempo de ejecución, hora de inicio, factores k del equipo, aRMS y A(8) del equipo, modo de funcionamiento).'
        ] },
        { tipo: 'parrafo', texto: '**Entrada manual.** Los valores también pueden escribirse o pegarse en la grilla de 20 bandas × 3 ejes. Los valores de la grilla se toman como **ya multiplicados por el factor k** del eje (cuando provienen del archivo, la grilla siempre contiene k × valor combinado).' },
        { tipo: 'parrafo', texto: '**Datos que ingresa el usuario:** Tiempo de exposición T (min), que es la exposición diaria del trabajador y no la duración de la medición; Método de combinación por banda (Promedio o RMS); y, solo para el informe, Operador, Equipo, Hora de la medición y Área.' }
      ] },
      { id: 'metodo', bloques: [
        { tipo: 'paso', n: 1, titulo: 'Duración de cada fila', texto: 'La duración d_i de cada fila de datos se toma de la hoja Resumen (campo "Promedio"). Si no está disponible, se estima como la diferencia de hora entre las dos primeras filas de datos de la hoja; si tampoco es posible, se asigna d_i = 1 a todas las filas (peso uniforme).' },
        { tipo: 'paso', n: 2, titulo: 'Combinación de las filas por banda', texto: 'Para cada eje y banda se combinan todas las filas de datos con el método seleccionado. Promedio es el método oficial del laboratorio y el predeterminado; RMS se ofrece solo como referencia de comparación.' },
        { tipo: 'formula', expr: 'Promedio:  a_b = Σ(d_i · a_i) / Σ d_i', variables: [
          ['a_b', 'Valor combinado del eje en la banda b', 'm/s²'],
          ['a_i', 'Aceleración RMS de la fila i en la banda b (bloque "RMS, Octava 1/3")', 'm/s²'],
          ['d_i', 'Duración de la fila i', 's']
        ] },
        { tipo: 'formula', expr: 'RMS:  a_b = √( Σ(d_i · a_i²) / Σ d_i )', variables: [] },
        { tipo: 'nota', texto: 'Si una celda de una banda está vacía en alguna fila, esa banda se combina solo con las filas que tienen dato y se muestra un aviso.' },
        { tipo: 'paso', n: 3, titulo: 'Factor k por eje', texto: `El valor combinado se multiplica por el factor k del eje según ISO 2631-1 (${kTexto}). Se usan siempre estos factores, aunque el archivo se haya grabado con otros.` },
        { tipo: 'formula', expr: 'a_w,b = k_e × a_b', variables: [
          ['a_w,b', 'Valor de la banda b con el factor k aplicado (valor de la grilla)', 'm/s²'],
          ['k_e', 'Factor de multiplicación del eje e (sección 5)', '—']
        ] },
        { tipo: 'paso', n: 4, titulo: 'Ponderación a 8 horas', texto: 'Cada banda se refiere a una jornada de referencia de 8 horas con el tiempo de exposición diaria.' },
        { tipo: 'formula', expr: `A(8)_e,b = a_w,e,b × √(T / ${T0_MINUTOS})`, variables: [
          ['A(8)_e,b', 'Aceleración ponderada de exposición diaria, eje e, banda b (columna "medido")', 'm/s²'],
          ['T', 'Tiempo de exposición diaria', 'min'],
          [String(T0_MINUTOS), 'Jornada de referencia de 8 h', 'min']
        ] },
        { tipo: 'paso', n: 5, titulo: 'Resumen por eje', texto: 'Para cada eje se cuentan las bandas que exceden el límite y se identifica la banda más exigida, la de mayor cociente A(8)/límite. La ficha de resultado de la interfaz muestra el eje y la banda con el mayor cociente de los tres ejes.' }
      ] },
      { id: 'constantes', bloques: [
        { tipo: 'parrafo', texto: 'Límites de DGNTI-COPANIT 45-2000 para exposición de 8 h, por banda de tercio de octava. Las bandas de 1,3 Hz y 3,1 Hz corresponden a las frecuencias preferidas de 1,25 Hz y 3,15 Hz.' },
        { tipo: 'tabla', encabezados: ['Banda (Hz)', 'Límite X e Y (m/s²)', 'Límite Z (m/s²)'],
          filas: BANDS.map(b => [hz(b), N(LIMITES_COPANIT.XY[b], 3), N(LIMITES_COPANIT.Z[b], 3)]),
          alinear: ['left', 'right', 'right'], mono: [true, true, true] },
        { tipo: 'tabla', encabezados: ['Constante', 'Valor', 'Uso'], filas: [
          ...AXES.map(e => [`Factor k, eje ${e}`, N(K_ISO[e], 1), 'Paso 4.3']),
          ['Jornada de referencia T0', `${T0_MINUTOS} min (${T0_SEGUNDOS_8H} s)`, 'Paso 4.4 y verificación cruzada'],
          ['Tolerancia de emparejamiento de bandas', `máx(${N(TOL_BANDA.abs, 2)} Hz; ${pct(TOL_BANDA.rel)} de la banda)`, 'Sección 3'],
          ['Tolerancia fila de promedio del instrumento', `máx(${N(TOL_FILA_PROMEDIO.abs, 4)} m/s²; ${pct(TOL_FILA_PROMEDIO.rel)})`, 'Sección 8'],
          ['Tolerancia A(8) del equipo', `máx(${N(TOL_A8_EQUIPO.abs, 4)} m/s²; ${pct(TOL_A8_EQUIPO.rel)})`, 'Sección 8']
        ], anchos: [3800, 3400, 2772] }
      ] },
      { id: 'decision', bloques: [
        { tipo: 'parrafo', texto: 'Por cada eje y banda: **Excede** si A(8) > límite (comparación estricta); en caso contrario, **Cumple**. Se usa la curva X/Y para los ejes X e Y, y la curva Z para el eje Z.' },
        { tipo: 'parrafo', texto: 'El estado global es **Excede** si al menos una banda de algún eje excede su límite; si no, **Cumple**.' },
        { tipo: 'parrafo', texto: LabMemoria.TEXTO_INCERTIDUMBRE }
      ] },
      { id: 'redondeo', bloques: [
        { tipo: 'lista', items: [
          'Todos los cálculos se hacen con la precisión completa del navegador (doble precisión IEEE-754). El redondeo se aplica solo al presentar.',
          'Pantalla y Word de resultados: A(8) y límites con 3 decimales (Word con coma decimal).',
          'Archivo .xlsx: se guarda el valor completo con formato numérico de 3 decimales; CSV: 3 decimales con punto decimal.',
          'Grilla de la sección 1: valor completo, con coma decimal.'
        ] }
      ] },
      { id: 'control', bloques: [
        { tipo: 'lista', items: [
          'Errores que detienen la importación: no se encuentra la hoja de un eje, falta el bloque "RMS, Octava 1/3", la fila 2 no contiene frecuencias, falta alguna de las 20 bandas, no hay filas de datos o una banda queda sin valores.',
          'Aviso si los factores k grabados en el archivo difieren de los de ISO 2631-1.',
          'Aviso si el modo de funcionamiento del archivo no es "WholeBody".',
          `Verificación cruzada con la hoja Resumen: A(8) = aRMS × k × √(t_ejecución / ${T0_SEGUNDOS_8H} s), calculado con los datos del equipo, se compara con el A(8) que reporta el equipo (tolerancia de la sección 5); si difiere, se avisa.`,
          'La fila de promedio del instrumento se compara con lo calculado por Promedio y por RMS (tolerancia de la sección 5); se avisa solo si no coincide con ninguno de los dos.',
          'Aviso de bandas con celdas vacías; aviso si se cambia el método después de calcular (resultados desactualizados).',
          'El botón Calcular se habilita solo cuando las 60 celdas (20 bandas × 3 ejes) tienen un número válido.',
          'Todo el procesamiento ocurre en el navegador: ningún dato sale del equipo del usuario.',
          'El .xlsx de salida incluye una hoja "Trazabilidad" con los valores de la grilla usados en el cálculo. Esta memoria registra la huella SHA-256 del archivo fuente (sección 10).'
        ] }
      ] },
      { id: 'limites', bloques: [
        { tipo: 'lista', items: [
          'Con el método Promedio, la misma medición grabada en 180 filas de 1 s da un valor algo menor que grabada en 3 filas de 60 s, porque cada fila ya es un valor RMS de su intervalo; con RMS el resultado es el mismo en ambos casos. Es un sesgo conocido y aceptado por el laboratorio.',
          'Un único área o segmento de exposición por cálculo.',
          'Los factores k de ISO 2631-1 se aplican siempre por banda; los factores grabados en el equipo no se usan para calcular.',
          'Los valores ingresados a mano se toman como ya multiplicados por k; el módulo no puede verificarlos.',
          'La comparación con los límites no considera la incertidumbre de medición (sección 6).'
        ] }
      ] }
    ];
  }

  // ---------- Sección 10 (registro de la ejecución) ----------

  function ejecucion() {
    if (!snap || snap.result !== lastResult) return null;
    const r = snap.result;
    const ejes = Object.keys(r.axisSummary);

    // Mismo eje y banda que la ficha de resultado de la interfaz.
    const eje = ejes.reduce((a, b) => (r.axisSummary[b].worstRatio > r.axisSummary[a].worstRatio ? b : a));
    const banda = r.axisSummary[eje].worstBand;
    const i = BANDS.indexOf(banda);
    const fila = r.rows[i];
    const aw = r.datos[eje][i];
    const k = K_ISO[eje];
    const pasos = [];

    // ¿El valor de la grilla salió del archivo importado con este método? (si se editó a mano, no)
    let combinado = null;
    if (snap.samples) {
      const { muestras, duraciones } = snap.samples[eje][i];
      const sumD = duraciones.reduce((a, d) => a + d, 0);
      const esProm = r.method === 'promedio';
      const sumPond = muestras.reduce((a, v, j) => a + duraciones[j] * (esProm ? v : v * v), 0);
      const ab = esProm ? sumPond / sumD : Math.sqrt(sumPond / sumD);
      if (Math.abs(ab * k - aw) / Math.max(Math.abs(aw), 1e-300) <= 1e-9) combinado = { muestras, duraciones, sumD, sumPond, ab, esProm };
    }

    if (combinado) {
      const { muestras, duraciones, sumD, sumPond, ab, esProm } = combinado;
      const n = muestras.length;
      const uniforme = duraciones.every(d => d === duraciones[0]);
      const durPromedio = snap.meta ? parseDuracionPromedioSegundos(snap.meta.promedio) : null;
      const origenD = durPromedio !== null ? 'hoja Resumen, campo "Promedio"'
        : (uniforme && duraciones[0] === 1 ? 'peso uniforme (d_i = 1)' : 'diferencia de hora entre las dos primeras filas');
      pasos.push({
        titulo: 'Filas de datos y duración',
        formula: 'd_i: duración de cada fila',
        sustitucion: `n = ${n} filas; ${uniforme ? `d_i = ${N(duraciones[0], 0)} s para todas` : 'd_i variable'} (${origenD})`,
        resultado: `Σ d_i = ${N(sumD, 0)} s`
      });
      const lista = n <= 6;
      const terminos = muestras.map((v, j) => esProm ? `${N(duraciones[j], 0)}·${N(v, 4)}` : `${N(duraciones[j], 0)}·${N(v, 4)}²`).join(' + ');
      pasos.push({
        titulo: `Combinación por ${esProm ? 'Promedio' : 'RMS'}`,
        formula: esProm ? 'a_b = Σ(d_i · a_i) / Σ d_i' : 'a_b = √( Σ(d_i · a_i²) / Σ d_i )',
        sustitucion: lista
          ? (esProm ? `a_b = (${terminos}) / ${N(sumD, 0)}` : `a_b = √( (${terminos}) / ${N(sumD, 0)} )`)
          : (esProm ? `a_b = ${N(sumPond, 6)} / ${N(sumD, 0)}` : `a_b = √( ${N(sumPond, 8)} / ${N(sumD, 0)} )`),
        resultado: `a_b = ${N(ab, 6)} m/s²`
      });
      pasos.push({
        titulo: 'Factor k',
        formula: 'a_w,b = k_e × a_b',
        sustitucion: `a_w,b = ${N(k, 1)} × ${N(ab, 6)}`,
        resultado: `a_w,b = ${N(LabMemoria.verificar(k * ab, aw, `a_w eje ${eje} banda ${banda} Hz`), 6)} m/s²`
      });
    } else {
      pasos.push({
        titulo: 'Valor de la grilla',
        formula: 'a_w,b: valor ingresado o pegado en la grilla (ya multiplicado por k)',
        sustitucion: `eje ${eje}, banda ${hz(banda)} Hz`,
        resultado: `a_w,b = ${N(aw, 6)} m/s²`
      });
    }

    const a8 = LabMemoria.verificar(aw * Math.sqrt(r.tiempoMin / T0_MINUTOS), fila[eje].medido, `A(8) eje ${eje} banda ${banda} Hz`);
    pasos.push({
      titulo: 'Ponderación a 8 horas',
      formula: `A(8) = a_w,b × √(T / ${T0_MINUTOS})`,
      sustitucion: `A(8) = ${N(aw, 6)} × √(${N(r.tiempoMin, 0)} / ${T0_MINUTOS})`,
      resultado: `A(8) = ${N(a8, 6)} m/s²  →  ${N(a8, 3)} m/s² (valor presentado)`
    });
    const excede = a8 > fila[eje].limite;
    if (excede !== fila[eje].excede) throw new Error('Memoria de cálculo: la comparación del ejemplo no coincide con el estado calculado.');
    pasos.push({
      titulo: 'Comparación con el límite',
      formula: 'Excede si A(8) > límite; si no, Cumple',
      sustitucion: `${N(a8, 3)} ${excede ? '>' : '≤'} ${N(fila[eje].limite, 3)} m/s² (límite ${eje === 'Z' ? 'Z' : 'X/Y'}, ${hz(banda)} Hz)`,
      resultado: excede ? 'Estado: **Excede**' : 'Estado: Cumple'
    });

    const desactualizado = staleWarnEl.textContent.trim() !== '' ||
      LabUtils.parseLocaleNumber(tiempoInput.value) !== r.tiempoMin ||
      AXES.some(e => cells[e].some((inp, j) => LabUtils.parseLocaleNumber(inp.value) !== r.datos[e][j]));

    const parametros = [
      ['Área', r.area],
      ['Tiempo de exposición', `${N(r.tiempoMin, 0)} min`],
      ['Método de combinación por banda', METODOS[r.method]],
      ['Factores k aplicados (ISO 2631-1)', AXES.map(e => `${e} ${N(K_ISO[e], 1)}`).join(' · ')],
      ['Origen de los datos', snap.file ? 'Archivo del equipo (grilla llenada por importación)' : 'Ingreso manual en la grilla']
    ];
    if (r.duracionMedicion) parametros.push(['Duración de la medición', r.duracionMedicion]);
    if (snap.operador) parametros.push(['Operador', snap.operador]);
    if (snap.equipo) parametros.push(['Equipo', snap.equipo]);
    if (snap.hora) parametros.push(['Hora de la medición', snap.hora]);

    const estadoGlobal = ejes.some(e => r.axisSummary[e].exceedCount > 0) ? '**Excede**' : 'Cumple';
    return {
      nota: desactualizado ? 'Las entradas de la interfaz cambiaron después del último cálculo. Este registro corresponde al último resultado calculado, no a los valores que se ven ahora en pantalla.' : null,
      archivos: snap.file ? [snap.file] : [],
      parametros,
      avisos: snap.file ? snap.file.avisos.slice() : [],
      resumen: { tabla: {
        encabezados: ['Eje', 'Bandas que exceden', 'Banda más exigida (Hz)', 'A(8h) (m/s²)', 'Límite (m/s²)', '% del límite', 'Estado'],
        filas: ejes.map(e => {
          const s = r.axisSummary[e];
          const f = r.rows[BANDS.indexOf(s.worstBand)][e];
          return [e, String(s.exceedCount), hz(s.worstBand), N(f.medido, 3), N(f.limite, 3), pct(s.worstRatio), s.exceedCount ? '**Excede**' : 'Cumple'];
        }),
        alinear: ['left', 'right', 'right', 'right', 'right', 'right', 'left'],
        anchos: [700, 1500, 1700, 1500, 1500, 1400, 1672],
        nota: `Estado global: ${estadoGlobal}. Los valores de las 20 bandas por eje están en el .xlsx de resultados.`
      } },
      ejemplo: { titulo: `banda ${hz(banda)} Hz, eje ${eje} (la de mayor cociente A(8)/límite)`, pasos }
    };
  }

  function construirSpecMemoria() {
    return {
      modulo: MODULO_INFO,
      ficha: { magnitud: 'A(8h)', resolucion: 'Tercio de octava', norma: 'DGNTI-COPANIT 45-2000', salida: '.xlsx · CSV · Word' },
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

  // Para pruebas y para el -ui.js (estado del botón).
  window.construirSpecMemoria = construirSpecMemoria;
})();
