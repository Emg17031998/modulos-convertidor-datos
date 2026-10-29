# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es este proyecto

Sitio web estático (sin backend, sin build tools) usado por el equipo de un laboratorio ambiental
para procesar datos de campo desde el navegador. Cada "módulo" es una calculadora independiente
para un tipo de ensayo (calidad de aire, y otros que se irán agregando). El usuario carga un
.xlsx, la herramienta procesa los datos en el navegador (JavaScript puro) y genera un .xlsx de
salida para descargar.

No hay agente ejecutando scripts por el usuario, no hay servidor, no hay base de datos. Todo el
cálculo ocurre client-side en el navegador de quien abre la página.

## Stack

- HTML/CSS/JS vanilla — sin frameworks, sin bundlers, sin npm install.
- Fuentes Archivo e IBM Plex Mono vía Google Fonts (importadas desde `assets/theme.css`).
- Librerías cargadas por CDN (cdnjs.cloudflare.com):
  - `xlsx` (SheetJS) — lectura de archivos .xlsx.
  - `exceljs` — generación de archivos .xlsx de salida con formato (fuente/relleno de celdas,
    formatos numéricos y de fecha).
  - `docx` 8.5.0 — generación de documentos Word (.docx): el reporte de VCE y la memoria de
    cálculo de todos los módulos. No está publicada en cdnjs: se carga desde jsDelivr (`build/index.umd.js`). La v9 se sirve como
    `application/node` y el navegador la bloquea, por eso queda fija en 8.5.0.
- Sin TypeScript, sin React. Mantenerlo así salvo que se decida explícitamente lo contrario.
- No hay comando de build, lint ni test: no hay `package.json` ni herramientas de compilación.
  Para desarrollar, abrir los `.html` directamente en el navegador, o servirlos con cualquier
  servidor estático simple si algún módulo llega a usar `type="module"` (los módulos ES no
  cargan vía `file://`).

## Estructura

```
index.html                     ← landing con enlaces a cada módulo/ensayo
assets/
  theme.css                    ← estilos compartidos: variables y componentes del diseño
                                  "Ficha técnica" (ver rediseno-ficha-tecnica/DESIGN_HANDOFF.md)
  js/utils.js                  ← funciones comunes reutilizables entre módulos:
                                  lectura de xlsx (readWorkbookWithHash: + SHA-256), render
                                  de tabla preview, descarga de xlsx generado, formateo
  js/memoria-calculo.js        ← generador común de la memoria de cálculo (LabMemoria):
                                  todo el formato Word vive acá
modules/
  calidad-aire/
    index.html                 ← UI del módulo
    calidad-aire.js            ← lógica específica de este ensayo (+ MODULO_INFO)
    calidad-aire-ui.js         ← solo presentación
    calidad-aire-memoria.js    ← contenido de la memoria de cálculo
  <siguiente-ensayo>/
    index.html
    <siguiente-ensayo>.js
    <siguiente-ensayo>-ui.js
    <siguiente-ensayo>-memoria.js
```

Cada ensayo nuevo es una carpeta nueva dentro de `modules/`. Nunca debe necesitar tocar el código
de otro módulo — solo consume funciones de `assets/js/utils.js`.

## Convenciones de diseño

- Diseño "Ficha técnica" (paleta oliva), definido en `assets/theme.css`; guía y maquetas de
  referencia en `rediseno-ficha-tecnica/`. Variables: `--bg` #EFEEEF (fondo y campos), `--ink`
  #161616 (texto, bordes, banda de encabezado, botón Calcular, avisos), `--ink-2` #313030 (texto
  secundario), `--olive-900` #424437 (etiquetas pequeñas, botón Descargar), `--olive-600` #6E6F62
  (numerales grandes y borde de zona de carga — nunca en texto < 24 px), `--olive-500` #8D9075
  (relleno del número de paso), `--sage` #B2B794 (encabezado de tabla, estado Cumple), `--rule`
  #ADADAC (líneas finas entre filas). Tipografía: Archivo (títulos y texto) e IBM Plex Mono
  (datos, etiquetas, fórmulas). Sin esquinas redondeadas, sin sombras, sin degradados; bordes
  `--border` (1,5 px `--ink`). Texto pequeño solo en `--ink`, `--ink-2` u `--olive-900`.
- Cada página usa el mismo encabezado de documento (`.doc-header`): banda negra con el título y el
  código del módulo (ej. `02 · VMB / HAV`) y debajo 4 celdas (Magnitud, Resolución, Norma,
  Salida). No dupliques componentes por módulo: reutiliza las clases de `theme.css` (`.step`,
  `.step-title`, `.field`, `.btn`, `.btn-primary`, `.btn-secondary`, `.dropzone`, `table.data`,
  `.formula`, `.chip-ok` / `.chip-warn`, `.notice-warn`, `.tabs`, `.cell-grid`, `.fieldset`…).
- No aplicar `text-transform:uppercase` a textos con unidades ("µg/m³" pasa a "ΜG/M³"): envolver la
  unidad en `<span class="unit">`. Por eso los encabezados de `table.data` no van en mayúsculas.
- Cada módulo sigue el mismo patrón de 3 pasos: (1) cargar archivo, (2) elegir parámetros/opciones
  del ensayo, (3) generar y descargar, cada uno como `.step` con título numerado. Mantener esta
  estructura para que la experiencia sea consistente entre ensayos.
- Lo que sea solo de presentación y necesite JS (pestañas, ficha de resultado) va en un archivo
  aparte `<modulo>-ui.js`, para no mezclarlo con la lógica de cálculo del módulo.
- Los cálculos se escriben como valores ya resueltos en el .xlsx de salida (no fórmulas en vivo
  de Excel) — decisión deliberada por simplicidad y porque el set de parámetros varía por caso.
  Se incluye siempre una hoja de copia de los datos fuente para trazabilidad.

## Al agregar un nuevo módulo (ensayo)

1. Crear carpeta en `modules/<nombre-ensayo>/`.
2. Reutilizar `assets/js/utils.js` para lectura/escritura de xlsx en vez de duplicar esa lógica.
3. Si una función nueva es genuinamente reutilizable entre ensayos (no específica de uno), subirla
   a `utils.js` en vez de dejarla local al módulo.
4. Agregar el enlace correspondiente en `index.html` (landing).
5. Antes de escribir un cálculo nuevo, preguntar por la lógica exacta del ensayo (fórmulas,
   estructura de la hoja fuente, unidades) si no está documentada — no asumir un formato.
6. Crear su memoria de cálculo (sección siguiente).

## Memoria de cálculo (ISO/IEC 17025)

Cada módulo ofrece un botón `Memoria de cálculo (.docx)` (`#memoriaBtn`, `.btn-secondary`, en
`.actions.actions-memoria` justo debajo de `.doc-header`, siempre habilitado) con una nota
`#memoriaEstado` que actualiza el `-ui.js` ("Descripción del método · sin resultados" /
"Incluye el registro del último cálculo") y un `#memoriaErr`.

- **Formato en un solo lugar.** `assets/js/memoria-calculo.js` (`LabMemoria`) arma todo el Word:
  bloque de identificación, las 9 secciones en orden fijo (`LabMemoria.SECCIONES`), la sección 10
  "Registro de la ejecución" solo si hay cálculo (si no, la nota "Documento descriptivo del
  método…"), Control del documento con historial y firmas, encabezado y "Página X de Y". Un
  módulo nunca da formato: solo entrega contenido en bloques tipados (`parrafo`, `lista`, `paso`,
  `formula`, `tabla`, `nota`). Admite `**negrita**` en el texto.
- **`<modulo>-memoria.js`** (se carga último) construye la spec `{ modulo, ficha, secciones,
  ejecucion }` y llama a `LabMemoria.descargar(spec)`. El texto de incertidumbre es siempre
  `LabMemoria.TEXTO_INCERTIDUMBRE`.
- **Una sola fuente de verdad.** Todo número de referencia (límites, bandas, factores, T0,
  tolerancias, PM, Vm, alias de encabezado…) se lee de las constantes de nivel superior del
  módulo; nunca se reescribe en la memoria. Si un valor está como literal dentro de una función,
  subirlo a una constante con el mismo valor.
- **La memoria no recalcula.** El ejemplo trabajado reproduce la operación con los valores ya
  calculados (`lastResult` o `getResult()`), y cada paso pasa por `LabMemoria.verificar(valor,
  calculado, contexto)`, que lanza error si la diferencia relativa supera 1e-9. Lo que la memoria
  necesite y el cálculo no guarde (muestras, archivo, bloques…) se agrega como metadato al
  resultado, sin cambiar el cálculo.
- **`MODULO_INFO`** `{ codigo, titulo, sigla, version, fecha, historial }` al principio de
  `<modulo>.js`; lo leen el encabezado de la página (vía `-ui.js`) y la memoria. **Al cambiar un
  cálculo, subir la versión y agregar una entrada al historial.**
- **Trazabilidad del archivo fuente:** leer con `LabUtils.readWorkbookWithHash(file)` y guardar
  `{ nombre, tamanoBytes, sha256, hojas }`.
- Nombre del archivo: `Memoria_Calculo_<SIGLA>_v<version>[_<fuente>]_<AAAAMMDD>.docx` (la fuente
  solo si hay exactamente un archivo).

## Qué evitar

- No introducir backend, base de datos, ni autenticación salvo que se pida explícitamente.
- No usar `tools/` ni `workflows/` (convención de repos agente-ejecuta-scripts) — este proyecto
  no aplica ese patrón.
- No agregar dependencias vía npm/bundler sin discutirlo primero; el objetivo es que el sitio
  siga siendo abrible con solo un navegador, sin paso de compilación.

## Despliegue

Pensado para publicarse como sitio estático (ej. GitHub Pages) para que todo el equipo del
laboratorio use siempre la misma versión desde una URL fija, en vez de distribuir archivos HTML
sueltos por correo.
