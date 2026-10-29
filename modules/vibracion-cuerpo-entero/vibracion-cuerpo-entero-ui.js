// modules/vibracion-cuerpo-entero/vibracion-cuerpo-entero-ui.js
// Solo presentación (rediseño "Ficha técnica"): llena la ficha de resultado del paso 3 con valores
// que vibracion-cuerpo-entero.js YA calculó (lastResult). No hace ningún cálculo ni fórmula nueva:
// solo elige, entre los ejes, el de mayor porcentaje del límite (axisSummary[eje].worstRatio, ya
// calculado) y muestra el A(8h) y el límite de esa banda tal como están en lastResult.rows.

(function () {
  const fmt = v => LabUtils.fmtNum(v, 3);
  const celdas = {
    a8: document.getElementById('resA8'),
    limite: document.getElementById('resLimite'),
    eje: document.getElementById('resEje'),
    estado: document.getElementById('resEstado')
  };

  function llenarFicha() {
    // lastResult es la variable de nivel superior de vibracion-cuerpo-entero.js (visible acá
    // porque ambos son scripts clásicos que comparten el ámbito global).
    if (typeof lastResult === 'undefined' || !lastResult) return;
    const ejes = Object.keys(lastResult.axisSummary);
    const dominante = ejes.reduce((a, b) => (lastResult.axisSummary[b].worstRatio > lastResult.axisSummary[a].worstRatio ? b : a));
    const banda = lastResult.axisSummary[dominante].worstBand;
    const fila = lastResult.rows.find(r => r.band === banda);
    const celda = fila[dominante];
    const excede = ejes.some(e => lastResult.axisSummary[e].exceedCount > 0);

    celdas.a8.innerHTML = `${fmt(celda.medido)} <small>m/s²</small><br><span class="vce-band-note">${banda} Hz · eje ${dominante}</span>`;
    celdas.limite.innerHTML = `${fmt(celda.limite)} <small>m/s²</small>`;
    celdas.eje.textContent = dominante;
    celdas.estado.innerHTML = excede ? '<span class="chip-warn">Excede</span>' : '<span class="chip-ok">Cumple</span>';
  }

  // Estado del botón "Memoria de cálculo": la memoria incluye el registro de la ejecución solo si
  // hay un cálculo hecho.
  const memoriaEstado = document.getElementById('memoriaEstado');
  function actualizarEstadoMemoria() {
    memoriaEstado.textContent = lastResult
      ? 'Incluye el registro del último cálculo'
      : 'Descripción del método · sin resultados';
  }

  // El código del encabezado sale de MODULO_INFO, igual que en la memoria.
  document.querySelector('.doc-code').textContent = MODULO_INFO.codigo;

  // Estos listeners se registran después de los de vibracion-cuerpo-entero.js, así que corren
  // cuando lastResult ya tiene el cálculo nuevo (o ya se borró).
  document.getElementById('calcBtn').addEventListener('click', () => { llenarFicha(); actualizarEstadoMemoria(); });
  document.getElementById('clearBtn').addEventListener('click', actualizarEstadoMemoria);
})();
