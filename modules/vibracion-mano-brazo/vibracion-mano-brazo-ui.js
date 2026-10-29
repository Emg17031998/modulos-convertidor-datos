// modules/vibracion-mano-brazo/vibracion-mano-brazo-ui.js
// Solo presentación (rediseño "Ficha técnica"): no toca cálculos ni lectura/escritura de archivos.
// vibracion-mano-brazo.js crea un bloque por brazo dentro de #armDer / #armIzq y guarda sus propias
// referencias a cada nodo; acá solo se MUEVE la tabla de resultados de cada brazo (previewWrap) a
// su pestaña del paso 2 — el JS original la sigue llenando y mostrando igual — y se maneja el
// cambio entre pestañas.

(function () {
  const pares = [
    { brazo: 'armDer', tab: 'tabDer', panel: 'panelDer' },
    { brazo: 'armIzq', tab: 'tabIzq', panel: 'panelIzq' }
  ];

  pares.forEach(({ brazo, panel }) => {
    const tabla = document.querySelector(`#${brazo} [data-role="previewWrap"]`);
    const destino = document.getElementById(panel);
    if (tabla && destino) destino.insertBefore(tabla, destino.querySelector('.tab-empty'));
  });

  function seleccionar(tabId) {
    pares.forEach(({ tab, panel }) => {
      const activa = tab === tabId;
      document.getElementById(tab).setAttribute('aria-selected', String(activa));
      document.getElementById(panel).hidden = !activa;
    });
  }

  pares.forEach(({ tab }) => {
    document.getElementById(tab).addEventListener('click', () => seleccionar(tab));
  });

  // El código del encabezado sale de MODULO_INFO, igual que en la memoria de cálculo.
  document.querySelector('.doc-code').textContent = MODULO_INFO.codigo;

  // Estado del botón "Memoria de cálculo": incluye el registro de la ejecución solo si algún
  // brazo tiene resultado. Cargar archivos nuevos o Limpiar borra el resultado del brazo; estos
  // listeners corren después de los del módulo (los de document, en la fase de burbuja).
  const memoriaEstado = document.getElementById('memoriaEstado');
  function actualizarEstadoMemoria() {
    const hay = armControllers.der.getResult() || armControllers.izq.getResult();
    memoriaEstado.textContent = hay ? 'Incluye el registro del último cálculo' : 'Descripción del método · sin resultados';
  }
  document.getElementById('calcBtn').addEventListener('click', actualizarEstadoMemoria);
  document.getElementById('clearBtn').addEventListener('click', actualizarEstadoMemoria);
  document.addEventListener('change', actualizarEstadoMemoria);
  document.addEventListener('drop', actualizarEstadoMemoria);
})();
