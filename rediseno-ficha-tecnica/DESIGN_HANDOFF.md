# Rediseño visual · "Ficha técnica" (paleta oliva)

Guía para aplicar el nuevo diseño a **modulos-convertidor-datos**.
Es solo un cambio visual: **no se toca la lógica de cálculo, la lectura de archivos ni la exportación**.

Referencias visuales en `design-reference/`:

| Archivo | Pantalla |
|---|---|
| `C2-Inicio.dc.html` | `index.html` (portada) |
| `C2-Aire.dc.html` | `modules/calidad-aire/index.html` |
| `C2-HAV.dc.html` | `modules/vibracion-mano-brazo/index.html` |
| `C2-VCE.dc.html` | `modules/vibracion-cuerpo-entero/index.html` |
| `C2-Tokens.dc.html` | Paleta, tipografía y componentes |

> Los `.dc.html` son maquetas de un editor de diseño: el HTML y los estilos inline sirven de referencia exacta, pero **no copies** `<x-dc>`, `<helmet>`, `<sc-for>`, `{{…}}`, `support.js` ni el `<script type="text/x-dc">`. Traduce a HTML/CSS normal.

---

## 1. Variables CSS (crear `assets/theme.css` compartido)

```css
@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');

:root {
  --bg: #EFEEEF;          /* fondo de página y campos */
  --ink: #161616;         /* texto, bordes, banda de encabezado, botón Calcular, avisos */
  --ink-2: #313030;       /* texto secundario y notas */
  --olive-900: #424437;   /* etiquetas pequeñas, botón Descargar */
  --olive-600: #6E6F62;   /* numerales grandes, borde de zona de carga (NO para texto < 24px) */
  --olive-500: #8D9075;   /* relleno del número de paso */
  --sage: #B2B794;        /* encabezado de tabla, estado OK / Cumple */
  --rule: #ADADAC;        /* líneas finas entre filas */
  --font-sans: "Archivo", system-ui, sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, monospace;
  --border: 1.5px solid var(--ink);
}
body { margin: 0; background: var(--bg); color: var(--ink); font-family: var(--font-sans); }
```

Reglas de contraste: texto pequeño solo en `--ink`, `--ink-2` u `--olive-900`. Rellenos `--olive-500` y `--sage` siempre con texto `--ink`. Sin esquinas redondeadas, sin sombras, sin degradados.

## 2. Componentes (clases sugeridas)

| Clase | Estilo |
|---|---|
| `.page` | `max-width: 1040px` (portada 1200px), `margin: 0 auto`, `padding: 32px 24px 64px`, columna con `gap: 36px` |
| `.doc-header` | Grid con `border: var(--border)`. Primera fila de ancho completo: fondo `--ink`, título Archivo 700 32px en `--bg`, código del módulo en mono 14px `--sage` (ej. `02 · VMB / HAV`). Debajo, 4 celdas (Magnitud, Resolución, Norma, Salida) separadas por línea `--ink` |
| `.lbl` | Mono 11px, mayúsculas, `letter-spacing: .08em`, color `--olive-900` |
| `.step-title` | Archivo 700 20px en MAYÚSCULAS, `border-bottom: 3px solid var(--ink)`, con número `.step-num` |
| `.step-num` | Mono 500 14px, fondo `--olive-500`, texto `--ink`, `padding: 2px 8px` |
| `.input` | Alto mín. 44px, `border: var(--border)`, fondo transparente, mono 15px |
| `.btn` (Calcular / Generar) | Fondo `--ink`, texto `--bg`, Archivo 600 14px mayúsculas, alto 44px |
| `.btn-primary` (Descargar) | Fondo `--olive-900`, texto `--bg` |
| `.btn-secondary` (Limpiar / Exportar) | Transparente, `border: var(--border)` |
| `.dropzone` | `border: 1.5px dashed var(--olive-600)`, ícono de subida, texto + estado en mono ("Ningún archivo cargado") |
| `table` | Encabezado fondo `--sage`, mono 11px mayúsculas, borde inferior 1.5px `--ink`; filas mono 13px con línea `--rule`; números alineados a la derecha. Tablas anchas dentro de `overflow-x: auto` |
| `.formula` | Caja con `border: var(--border)`, mono 15px, etiqueta "Ec. 1" a la derecha |
| `.chip-ok` | Fondo `--sage`, texto `--ink`, mono 11px (✓ X·Y·Z, CUMPLE) |
| `.chip-warn` | Fondo `--ink`, texto `--bg` (! ASIGNAR EJE, EXCEDE) |
| `.chip-pending` | Borde punteado `--olive-600`, texto `--olive-900` |
| `.alert` | Barra fondo `--ink`, texto `--bg` 13px, con "!" en chip `--sage` |

## 3. Por pantalla

**Portada:** encabezado de documento (Herramientas de Laboratorio / Área / Procesamiento / Módulos / Salida). Título "Elige el ensayo" 44px con línea de 3px. Lista numerada 01–03: numeral mono 40px `--olive-600`, título 24px, descripción, ficha mono (ENTRADA / CÁLCULO / NORMA), chip DISPONIBLE y botón negro "ABRIR →". Pie: aviso de procesamiento local + versión + repositorio.

**Calidad de Aire:** 1) dropzone + Hoja + Fila de inicio · 2) tabla de parámetros (checkbox, Parámetro, Unidad fuente, Convertir a µg/m³, PM), campo Volumen molar y caja de fórmula "µg/m³ = ppb × PM / Vm · EPA 25 °C 1 atm" · 3) Generar promedios / Descargar .xlsx, contadores (bloques detectados, promedios recalculados, parámetros) y vista previa de la hoja Promedios.

**Vibración Mano-Brazo:** 1) dos columnas por brazo con 3 filas de archivo y su chip de estado + barra de aviso si falta asignar eje · 2) tiempo de exposición + Calcular, dos fórmulas, pestañas Brazo derecho / izquierdo y tabla por banda (Banda, X, Y, Z, Total, Aeq(8h), Límite, Estado) con leyenda CUMPLE/EXCEDE · 3) Descargar / Limpiar y las 3 hojas del reporte.

**Vibración Cuerpo Entero:** 1) dropzone + Método de combinación + Limpiar, tabla de segmentos con scroll (Frecuencia, X, Y, Z) · 2) fieldsets "Medición" (Operador, Equipo, Hora) y "Área y exposición" (Área, Tiempo) + Calcular · 3) celdas de resultado (A(8h) destacado en negro, Límite, Eje dominante, Estado) y botones .xlsx / CSV / Word.

## 4. Requisitos

- Conservar todos los `id`, `name` y manejadores de eventos que usa el JavaScript actual. Si hay que cambiar estructura, ajustar los selectores sin cambiar la lógica.
- Responsive: a ancho de teléfono las grillas pasan a una columna y las tablas hacen scroll horizontal.
- Accesibilidad: `<label for>` en cada campo, botones reales, objetivos táctiles ≥ 44px.
- Verificar en el navegador que cada módulo sigue cargando archivos, calculando y descargando igual que antes.

---

## Instrucción para pegar en Claude Code

```
Lee DESIGN_HANDOFF.md y las maquetas en design-reference/. Aplica el rediseño
visual "Ficha técnica" a index.html y a los tres módulos de modules/.
Crea assets/theme.css con las variables y componentes de la sección 1 y 2,
y enlázalo en todas las páginas. Es solo un cambio visual: no modifiques la
lógica de cálculo, lectura de archivos ni exportación, y conserva los id y
eventos que usa el JS. Empieza por la portada y un módulo (Vibración
Mano-Brazo), muéstrame el resultado y luego sigue con los otros dos.
Trabaja en una rama nueva llamada rediseno-ficha-tecnica.
```
