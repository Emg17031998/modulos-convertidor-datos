// modules/calidad-aire/calidad-aire-ui.js
// Solo presentación: no toca cálculos ni lectura/escritura de archivos. Pone el código del
// encabezado desde MODULO_INFO y mantiene el estado del botón "Memoria de cálculo".

(function () {
  document.querySelector('.doc-code').textContent = MODULO_INFO.codigo;

  // La memoria incluye el registro de la ejecución solo si hay promedios generados a la vista:
  // cargar otro archivo, cambiar de hoja o de fila de inicio oculta la vista previa. Estos
  // listeners corren después de los de calidad-aire.js (los de document, en la fase de burbuja).
  const memoriaEstado = document.getElementById('memoriaEstado');
  function actualizarEstadoMemoria() {
    const hay = lastResult && previewWrap.style.display !== 'none';
    memoriaEstado.textContent = hay ? 'Incluye el registro del último cálculo' : 'Descripción del método · sin resultados';
  }
  document.getElementById('genBtn').addEventListener('click', actualizarEstadoMemoria);
  document.addEventListener('change', actualizarEstadoMemoria);
  document.addEventListener('drop', actualizarEstadoMemoria);
})();
