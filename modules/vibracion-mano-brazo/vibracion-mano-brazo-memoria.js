// modules/vibracion-mano-brazo/vibracion-mano-brazo-memoria.js
// Contenido de la "Memoria de cálculo" (ISO/IEC 17025) del módulo VMB. El formato lo pone
// LabMemoria (assets/js/memoria-calculo.js). Los valores de referencia se leen de las constantes
// de vibracion-mano-brazo.js (TARGET_BANDS, LIMITES_COPANIT, T0_MINUTOS, TOL_BANDA_HZ,
// BAND_SEARCH_ROWS, DATE_TIME_ALIASES): no se vuelve a escribir ninguno acá. No recalcula: el
// ejemplo trabajado reproduce la operación con los valores ya calculados de cada brazo
// (armControllers[...].getResult()) y verifica que coincida.

(function () {
  const N = LabMemoria.num;
  const hz = b => String(b).replace('.', ',');
  const pct = v => N(v * 100, 0) + ' %';
  const BRAZOS = [['der', 'Brazo derecho'], ['izq', 'Brazo izquierdo']];

  // Avisos globales visibles al momento de calcular (este listener corre después del del módulo).
  let avisoGlobal = '';
  document.getElementById('calcBtn').addEventListener('click', () => {
    avisoGlobal = operatorWarnGlobal.style.display === 'none' ? '' : operatorWarnGlobal.textContent.trim();
  });

  // ---------- Secciones 1–9 (descripción del método) ----------

  function secciones() {
    const alias = Object.entries(DATE_TIME_ALIASES).map(([k, v]) => `${k} (${v.map(a => `"${a}"`).join(', ')})`).join(' y ');
    return [
      { id: 'objeto', bloques: [
        { tipo: 'parrafo', texto: `Se calcula, para cada brazo (derecho e izquierdo), la aceleración equivalente de exposición diaria Aeq(8h) por banda de octava (${TARGET_BANDS.length} bandas, ${hz(TARGET_BANDS[0])}–${hz(TARGET_BANDS[TARGET_BANDS.length - 1])} Hz) a partir de la suma vectorial de los ejes X, Y y Z, y se compara cada valor con los límites de DGNTI-COPANIT 45-2000.` },
        { tipo: 'parrafo', texto: 'Cada brazo se mide con 3 archivos del equipo, uno por minuto de medición. El resultado sirve de base para el informe de resultados del laboratorio.' },
        { tipo: 'parrafo', texto: '**No incluye:** estimación de incertidumbre, ponderación en frecuencia (los valores por banda se usan tal como los registra el equipo), combinación de varias tareas o tiempos de exposición distintos por brazo, ni un valor global de todas las bandas.' }
      ] },
      { id: 'referencias', bloques: [
        { tipo: 'lista', items: [
          'DGNTI-COPANIT 45-2000 — Higiene y seguridad industrial en ambientes de trabajo donde se generen vibraciones (límites de Aeq(8h) por banda de octava para mano-brazo).',
          'ISO 5349-1 — Vibración mecánica. Medición y evaluación de la exposición humana a la vibración transmitida por la mano (suma vectorial de los tres ejes y normalización a 8 h).',
          'ISO/IEC 17025:2017 — Requisitos generales para la competencia de los laboratorios de ensayo y calibración.'
        ] }
      ] },
      { id: 'entrada', bloques: [
        { tipo: 'parrafo', texto: '**Archivos del equipo (.xlsx).** Exactamente 3 por brazo (uno por minuto). Cada archivo trae los 3 ejes como hojas separadas. La estructura se detecta por contenido, nunca por posición fija:' },
        { tipo: 'lista', items: [
          `Hoja de cada eje: la primera hoja (de izquierda a derecha) cuyo nombre sigue el patrón "<eje> OBA" (expresión ${AXIS_RE.source}, sin distinguir mayúsculas). Si un eje no se identifica, el usuario elige la hoja a mano; no se puede asignar la misma hoja a dos ejes.`,
          `Fila de bandas: la primera fila, entre las ${BAND_SEARCH_ROWS} primeras, que tenga alguna celda cuyo valor numérico coincida con una banda de octava (tolerancia de la sección 5). Cada banda se ubica por el título de su columna.`,
          `Columnas de fecha y hora: en la misma fila de bandas, por su título: ${alias}.`,
          'Filas de medición: solo las que tienen Fecha y Hora con valor. Las filas de resumen del instrumento (fila "Media" y tabla de promedios) no tienen fecha/hora y se descartan. Solo se toman celdas numéricas.',
          'Operador: se toma del nombre de cada archivo, todo el texto antes de "MANO IZQUIERDA/IZQ" o "MANO DERECHA/DER". El nombre del eje no se toma del nombre del archivo.'
        ] },
        { tipo: 'parrafo', texto: '**Dato que ingresa el usuario:** Tiempo de exposición real T (min), único para ambos brazos.' }
      ] },
      { id: 'metodo', bloques: [
        { tipo: 'paso', n: 1, titulo: 'Promedio por eje y banda', texto: 'Para cada brazo, eje y banda se juntan los valores de las 3 hojas homólogas (una por archivo/minuto) en un solo conjunto y se calcula su promedio aritmético. No es un promedio de los promedios de cada archivo.' },
        { tipo: 'formula', expr: 'a_e,b = Σ a_i / N', variables: [
          ['a_e,b', 'Aceleración del eje e en la banda b (columnas "X/Y/Z Medido")', 'm/s²'],
          ['a_i', 'Valor de la banda b en cada fila de medición de las 3 hojas del eje e', 'm/s²'],
          ['N', 'Cantidad de valores numéricos del conjunto', '—']
        ] },
        { tipo: 'paso', n: 2, titulo: 'Suma vectorial de los ejes', texto: 'Por banda se combina la aceleración de los tres ejes.' },
        { tipo: 'formula', expr: 'Total_b = √(X_b² + Y_b² + Z_b²)', variables: [
          ['Total_b', 'Aceleración total de la banda b', 'm/s²'],
          ['X_b, Y_b, Z_b', 'Aceleración de cada eje en la banda b (paso 4.1)', 'm/s²']
        ] },
        { tipo: 'paso', n: 3, titulo: 'Normalización a 8 horas', texto: 'Cada banda se refiere a una jornada de referencia de 8 horas con el tiempo de exposición real.' },
        { tipo: 'formula', expr: `Aeq(8h)_b = Total_b × √(T / ${T0_MINUTOS})`, variables: [
          ['Aeq(8h)_b', 'Aceleración equivalente de exposición diaria, banda b', 'm/s²'],
          ['T', 'Tiempo de exposición real', 'min'],
          [String(T0_MINUTOS), 'Jornada de referencia de 8 h', 'min']
        ] }
      ] },
      { id: 'constantes', bloques: [
        { tipo: 'parrafo', texto: 'Límites máximos de Aeq(8h) de DGNTI-COPANIT 45-2000, por banda de octava. Fijos, no editables desde la interfaz.' },
        { tipo: 'tabla', encabezados: ['Banda (Hz)', 'Límite Aeq(8h) (m/s²)'],
          filas: TARGET_BANDS.map(b => [hz(b), N(LIMITES_COPANIT[b], 1)]),
          alinear: ['left', 'right'], mono: [true, true], anchos: [4986, 4986] },
        { tipo: 'tabla', encabezados: ['Constante', 'Valor', 'Uso'], filas: [
          ['Jornada de referencia T0', `${T0_MINUTOS} min`, 'Paso 4.3'],
          ['Tolerancia para reconocer una banda', `${N(TOL_BANDA_HZ, 2)} Hz`, 'Sección 3'],
          ['Filas revisadas para la fila de bandas', String(BAND_SEARCH_ROWS), 'Sección 3'],
          ['Archivos por brazo', '3', 'Sección 3']
        ], anchos: [3800, 3400, 2772] }
      ] },
      { id: 'decision', bloques: [
        { tipo: 'parrafo', texto: 'Por cada brazo y banda: **Excede** si Aeq(8h) > límite (comparación estricta); en caso contrario, **Cumple**.' },
        { tipo: 'parrafo', texto: 'El módulo no calcula un estado global: cada banda de cada brazo se evalúa por separado.' },
        { tipo: 'parrafo', texto: LabMemoria.TEXTO_INCERTIDUMBRE }
      ] },
      { id: 'redondeo', bloques: [
        { tipo: 'lista', items: [
          'Todos los cálculos se hacen con la precisión completa del navegador (doble precisión IEEE-754). El redondeo se aplica solo al presentar.',
          'Pantalla: X, Y, Z y Aeq(8h) con 3 decimales; límite con 1 decimal.',
          'Archivo .xlsx: se guarda el valor completo con formato numérico 0.000 (X, Y, Z y Aeq(8h)) y 0.0 (límite).',
          'En la pantalla y en el .xlsx, la columna "Total (m/s²) Calculado" muestra el valor Aeq(8h) normalizado a 8 h, que es el que se compara con el límite.'
        ] }
      ] },
      { id: 'control', bloques: [
        { tipo: 'lista', items: [
          'Errores que detienen el cálculo de un brazo: no son exactamente 3 archivos, falta asignar la hoja de un eje, la misma hoja asignada a dos ejes, no se encuentra la fila de bandas, falta alguna de las 8 bandas, no hay columnas de Fecha/Hora, no hay filas con Fecha/Hora o una banda queda sin valores numéricos.',
          'Aviso si los 3 archivos de un brazo no coinciden en el nombre de operador detectado.',
          'Aviso si el operador del brazo derecho difiere del del brazo izquierdo (no bloquea: puede ser intencional).',
          'El .xlsx de salida incluye una hoja "Trazabilidad" con, por brazo y archivo, el eje, la hoja usada, si se asignó automática o manualmente, el operador detectado y el tiempo de exposición, además de las fórmulas usadas.',
          'Todo el procesamiento ocurre en el navegador: ningún dato sale del equipo del usuario.',
          'Esta memoria registra la huella SHA-256 de cada archivo fuente (sección 10).'
        ] }
      ] },
      { id: 'limites', bloques: [
        { tipo: 'lista', items: [
          'El promedio por banda es aritmético sobre los valores de las filas (no energético).',
          'El mismo tiempo de exposición se aplica a ambos brazos.',
          'La asignación manual de una hoja a un eje no se puede verificar: queda registrada como "Manual" en la trazabilidad.',
          'Los valores por banda se usan tal como los entrega el equipo; el módulo no aplica ni verifica la ponderación en frecuencia.',
          'La comparación con los límites no considera la incertidumbre de medición (sección 6).'
        ] }
      ] }
    ];
  }

  // ---------- Sección 10 (registro de la ejecución) ----------

  function ejecucion() {
    const res = BRAZOS.map(([s, nombre]) => ({ s, nombre, r: armControllers[s].getResult() })).filter(x => x.r);
    if (!res.length) return null;
    const T = res[0].r.tiempoMin;

    // Brazo y banda de mayor cociente Aeq(8h)/límite.
    let peor = null;
    res.forEach(x => x.r.rows.forEach(f => {
      const ratio = f.aeq8h / f.limite;
      if (!peor || ratio > peor.ratio) peor = { x, f, ratio };
    }));
    const { x, f } = peor;
    const pasos = [];
    const v = {};
    AXES.forEach(e => {
      const m = x.r.muestras[e][f.band];
      const suma = m.reduce((a, b) => a + b, 0);
      v[e] = LabMemoria.verificar(suma / m.length, f[e], `${x.nombre}, eje ${e}, banda ${f.band} Hz`);
      pasos.push({
        titulo: `Promedio del eje ${e}`,
        formula: `${e}_b = Σ a_i / N`,
        sustitucion: `${e}_b = ${N(suma, 6)} / ${m.length}`,
        resultado: `${e}_b = ${N(v[e], 6)} m/s²`
      });
    });
    const total = Math.sqrt(v.X * v.X + v.Y * v.Y + v.Z * v.Z);
    pasos.push({
      titulo: 'Suma vectorial',
      formula: 'Total_b = √(X_b² + Y_b² + Z_b²)',
      sustitucion: `Total_b = √(${N(v.X, 6)}² + ${N(v.Y, 6)}² + ${N(v.Z, 6)}²)`,
      resultado: `Total_b = ${N(total, 6)} m/s²`
    });
    const aeq = LabMemoria.verificar(total * Math.sqrt(x.r.tiempoMin / T0_MINUTOS), f.aeq8h, `${x.nombre}, Aeq(8h) banda ${f.band} Hz`);
    pasos.push({
      titulo: 'Normalización a 8 horas',
      formula: `Aeq(8h)_b = Total_b × √(T / ${T0_MINUTOS})`,
      sustitucion: `Aeq(8h)_b = ${N(total, 6)} × √(${N(x.r.tiempoMin, 0)} / ${T0_MINUTOS})`,
      resultado: `Aeq(8h)_b = ${N(aeq, 6)} m/s²  →  ${N(aeq, 3)} m/s² (valor presentado)`
    });
    const excede = aeq > f.limite;
    if ((excede ? 'Excede' : 'Cumple') !== f.estado) throw new Error('Memoria de cálculo: la comparación del ejemplo no coincide con el estado calculado.');
    pasos.push({
      titulo: 'Comparación con el límite',
      formula: 'Excede si Aeq(8h) > límite; si no, Cumple',
      sustitucion: `${N(aeq, 3)} ${excede ? '>' : '≤'} ${N(f.limite, 1)} m/s² (${hz(f.band)} Hz)`,
      resultado: excede ? 'Estado: **Excede**' : 'Estado: Cumple'
    });

    const parametros = [
      ['Tiempo de exposición real', `${N(T, 0)} min`],
      ['Brazos calculados', res.map(y => y.nombre).join(', ')]
    ];
    res.forEach(y => {
      const op = y.r.operatorInfo && y.r.operatorInfo.finalName;
      parametros.push([`Operador, ${y.nombre.toLowerCase()}`, op || 'No detectado']);
      const manuales = y.r.traceInfo.filter(t => t.method === 'Manual');
      parametros.push([`Asignación de hojas, ${y.nombre.toLowerCase()}`,
        manuales.length ? `Manual en ${manuales.length} de ${y.r.traceInfo.length}` : 'Automática (nombre de hoja)']);
      const usadas = y.r.traceInfo.reduce((a, t) => a + t.filasUsadas, 0);
      const descartadas = y.r.traceInfo.reduce((a, t) => a + t.filasDescartadas, 0);
      parametros.push([`Filas de medición, ${y.nombre.toLowerCase()}`, `${usadas} usadas, ${descartadas} descartadas (sin Fecha/Hora), en ${y.r.traceInfo.length} hojas`]);
    });

    const avisos = res.map(y => y.r.operatorInfo && y.r.operatorInfo.warning).filter(Boolean);
    if (avisoGlobal) avisos.push(avisoGlobal);

    const tActual = parseFloat(tiempoInput.value);
    return {
      nota: tActual !== T ? 'El tiempo de exposición de la interfaz cambió después del último cálculo. Este registro corresponde al último resultado calculado.' : null,
      archivos: [].concat(...res.map(y => y.r.archivos.map(a => ({ ...a, hojas: `${y.nombre}: ${a.hojas}` })))),
      parametros,
      avisos,
      resumen: { tabla: {
        encabezados: ['Brazo', 'Banda (Hz)', 'X (m/s²)', 'Y (m/s²)', 'Z (m/s²)', 'Aeq(8h) (m/s²)', 'Límite (m/s²)', 'Estado'],
        filas: [].concat(...res.map(y => y.r.rows.map(r => [
          y.nombre.replace('Brazo ', ''), hz(r.band), N(r.X, 3), N(r.Y, 3), N(r.Z, 3), N(r.aeq8h, 3), N(r.limite, 1),
          r.estado === 'Excede' ? '**Excede**' : 'Cumple'
        ]))),
        alinear: ['left', 'right', 'right', 'right', 'right', 'right', 'right', 'left'],
        anchos: [1300, 1100, 1200, 1200, 1200, 1500, 1300, 1172]
      } },
      ejemplo: { titulo: `${x.nombre.toLowerCase()}, banda ${hz(f.band)} Hz (la de mayor cociente Aeq(8h)/límite, ${pct(peor.ratio)})`, pasos }
    };
  }

  function construirSpecMemoria() {
    return {
      modulo: MODULO_INFO,
      ficha: { magnitud: 'Aeq(8h)', resolucion: 'Banda de octava', norma: 'DGNTI-COPANIT 45-2000', salida: '.xlsx + trazabilidad' },
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

  // Para pruebas.
  window.construirSpecMemoria = construirSpecMemoria;
})();
