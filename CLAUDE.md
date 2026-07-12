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
- Librerías cargadas por CDN (cdnjs.cloudflare.com):
  - `xlsx` (SheetJS) — lectura de archivos .xlsx.
  - `exceljs` — generación de archivos .xlsx de salida con formato (fuente/relleno de celdas,
    formatos numéricos y de fecha).
- Sin TypeScript, sin React. Mantenerlo así salvo que se decida explícitamente lo contrario.
- No hay comando de build, lint ni test: no hay `package.json` ni herramientas de compilación.
  Para desarrollar, abrir los `.html` directamente en el navegador, o servirlos con cualquier
  servidor estático simple si algún módulo llega a usar `type="module"` (los módulos ES no
  cargan vía `file://`).

## Estructura

```
index.html                     ← landing con enlaces a cada módulo/ensayo
assets/
  css/style.css                ← estilos compartidos (paleta, tipografía, componentes)
  js/utils.js                  ← funciones comunes reutilizables entre módulos:
                                  lectura de xlsx, render de tabla preview, descarga
                                  de xlsx generado, formateo de fecha/hora
modules/
  calidad-aire/
    index.html                 ← UI del módulo
    calidad-aire.js             ← lógica específica de este ensayo
  <siguiente-ensayo>/
    index.html
    <siguiente-ensayo>.js
```

Cada ensayo nuevo es una carpeta nueva dentro de `modules/`. Nunca debe necesitar tocar el código
de otro módulo — solo consume funciones de `assets/js/utils.js`.

## Convenciones de diseño

- Paleta (variables CSS en `assets/css/style.css`): fondo `#F4F5FA` (`--bg`), tinta `#12162B`
  (`--ink`) / `#5B6072` (`--ink-soft`), acento navy `#10288C` (`--accent`) con hover azul de
  acción `#274DEA` (`--accent-hover`), acento lima `#EAF6AD` (`--accent-soft` / `--lime`, fondo de
  paneles/iconos/badges) con borde `#B6DB00` (`--lime-border`) y texto sobre lima `#5C7A00`
  (`--lime-ink`), ámbar `#B8860B` para filas de totales/promedios (sin relación con la paleta
  lima — se mantiene como marcador semántico aparte). Tipografía: Poppins (600/700/800, vía
  Google Fonts) para títulos, Inter (400–700) para texto de cuerpo/UI, monoespaciada
  (JetBrains Mono / Roboto Mono) para datos y lecturas tipo instrumento.
- Cada página (landing y cada módulo) usa el mismo header de sitio: franja navy de ancho completo
  con patrón de rejilla sutil (`.site-header` / `header.top` en la landing y en cada módulo
  respectivamente — mismas clases `.site-header-*`), título en Poppins blanco y una leyenda en
  lima. No dupliques este componente por módulo; reutiliza las clases existentes en `style.css`.
- Cada módulo sigue el mismo patrón de 3 pasos: (1) cargar archivo, (2) elegir parámetros/opciones
  del ensayo, (3) generar y descargar, presentados como tarjetas blancas redondeadas
  (`border-radius` grande, sombra suave) sobre el fondo `--bg`. Mantener esta estructura para que
  la experiencia sea consistente entre ensayos.
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
