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

  // Este listener se registra después del de vibracion-cuerpo-entero.js, así que corre cuando
  // lastResult ya tiene el cálculo nuevo.
  document.getElementById('calcBtn').addEventListener('click', llenarFicha);
})();
