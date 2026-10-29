// assets/js/memoria-calculo.js
// Generador común de la "Memoria de cálculo" (.docx) de cada módulo, para evidencia de
// ISO/IEC 17025:2017 (7.2 métodos, 7.5 registros técnicos, 7.8.6 regla de decisión, 7.11 control
// de datos). Contiene TODO el formato del documento; cada módulo solo aporta el CONTENIDO en su
// <ensayo>-memoria.js con bloques tipados (parrafo, lista, paso, formula, tabla, nota).
// Requiere la librería docx 8.5.0 (window.docx) y LabUtils (utils.js).

const LabMemoria = (function () {
  const D = () => window.docx;

  // Texto común de la sección 6 en los módulos con juicio de conformidad (regla R6). A validar por
  // el responsable técnico del laboratorio: cambiarlo acá lo cambia en las tres memorias.
  const TEXTO_INCERTIDUMBRE = 'La comparación se hace sobre el valor calculado, sin considerar la incertidumbre ' +
    'de medición. La regla de decisión y la declaración de incertidumbre corresponden al informe de ' +
    'resultados del laboratorio.';

  const TEXTO_SIN_RESULTADOS = 'Documento descriptivo del método. No contiene resultados de una medición.';
  const NOMBRE_SITIO = 'Módulos de Laboratorio';

  // Orden fijo de las secciones 1–9: es igual en todos los módulos.
  const SECCIONES = [
    ['objeto', 'Objeto y alcance'],
    ['referencias', 'Referencias normativas'],
    ['entrada', 'Datos de entrada'],
    ['metodo', 'Método de cálculo'],
    ['constantes', 'Constantes y valores de referencia'],
    ['decision', 'Criterio de evaluación'],
    ['redondeo', 'Redondeo y presentación'],
    ['control', 'Controles automáticos y trazabilidad'],
    ['limites', 'Supuestos y limitaciones']
  ];

  // Estilo (traducción de "Ficha técnica" a Word). Tamaños en medios puntos; bordes en octavos de
  // punto; medidas de página en twips.
  const C = { ink: '161616', ink2: '313030', olive: '424437', sage: 'B2B794', rule: 'ADADAC', bg: 'EFEEEF' };
  const SANS = 'Arial';
  const MONO = 'Consolas';
  const ANCHO = 12240 - 2 * 1134; // carta − márgenes de 2 cm = 9972 twips útiles

  function num(v, dec) {
    if (typeof v !== 'number' || !isFinite(v)) return '—';
    return v.toFixed(dec).replace('.', ',');
  }

  function fechaHora(d) {
    const p = n => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  // ---------- Piezas de bajo nivel ----------

  // Texto con **negrita** mínima → TextRuns.
  function runs(texto, o = {}) {
    const { TextRun } = D();
    return String(texto).split(/(\*\*[^*]+\*\*)/).filter(s => s !== '').map(s => {
      const negrita = /^\*\*.*\*\*$/.test(s);
      return new TextRun({
        text: negrita ? s.slice(2, -2) : s,
        bold: negrita || o.bold, font: o.mono ? MONO : SANS, size: o.size || 20,
        color: o.color || C.ink
      });
    });
  }

  function parrafo(texto, o = {}) {
    const { Paragraph } = D();
    return new Paragraph({ children: runs(texto, o), alignment: o.align, spacing: o.spacing, keepNext: o.keepNext });
  }

  const BORDE_NULO = () => ({ style: D().BorderStyle.NONE, size: 0, color: 'FFFFFF' });
  const borde = (size, color) => ({ style: D().BorderStyle.SINGLE, size, color });

  function celda(contenido, o = {}) {
    const { TableCell, Paragraph, ShadingType, VerticalAlign, AlignmentType } = D();
    const parrafos = (Array.isArray(contenido) ? contenido : [contenido]).map(c =>
      c instanceof Paragraph ? c : new Paragraph({
        children: runs(c === null || c === undefined ? '' : c, { size: o.size || 18, bold: o.bold, mono: o.mono, color: o.color }),
        alignment: o.align === 'right' ? AlignmentType.RIGHT : (o.align === 'center' ? AlignmentType.CENTER : AlignmentType.LEFT),
        spacing: { after: 0, line: 240 }
      }));
    return new TableCell({
      children: parrafos,
      columnSpan: o.span,
      width: o.ancho ? { size: o.ancho, type: D().WidthType.DXA } : undefined,
      shading: o.fill ? { type: ShadingType.CLEAR, color: 'auto', fill: o.fill } : undefined,
      verticalAlign: VerticalAlign.CENTER,
      borders: o.borders,
      margins: { top: 50, bottom: 50, left: 90, right: 90 }
    });
  }

  // Tabla de datos: encabezado sage en negrita 9 pt, filas 9 pt, líneas horizontales 0,5 pt
  // grises y borde exterior 1 pt negro.
  function tablaDatos(encabezados, filas, o = {}) {
    const { Table, TableRow, WidthType } = D();
    const n = encabezados.length;
    const anchos = o.anchos || Array(n).fill(Math.floor(ANCHO / n));
    const alinear = o.alinear || [];
    const filaHtml = (vals, cab) => new TableRow({
      tableHeader: cab, cantSplit: true,
      children: vals.map((v, i) => celda(v, {
        bold: cab, fill: cab ? C.sage : undefined, ancho: anchos[i], align: alinear[i],
        mono: !cab && o.mono && o.mono[i], size: 18
      }))
    });
    return new Table({
      width: { size: anchos.reduce((a, b) => a + b, 0), type: WidthType.DXA },
      columnWidths: anchos,
      borders: {
        top: borde(8, C.ink), bottom: borde(8, C.ink), left: borde(8, C.ink), right: borde(8, C.ink),
        insideHorizontal: borde(4, C.rule), insideVertical: BORDE_NULO()
      },
      rows: [filaHtml(encabezados, true), ...filas.map(f => filaHtml(f, false))]
    });
  }

  // Recuadro de fórmula: tabla de 1 celda, fondo claro, filete izquierdo oliva de 3 pt.
  function recuadro(lineas) {
    const { Table, TableRow, WidthType, Paragraph } = D();
    const parrafos = lineas.map(l => new Paragraph({
      children: runs(l.texto, { mono: true, size: 20, bold: l.bold }), spacing: { after: 40, line: 260 }
    }));
    return new Table({
      width: { size: ANCHO, type: WidthType.DXA }, columnWidths: [ANCHO],
      borders: { top: BORDE_NULO(), bottom: BORDE_NULO(), left: BORDE_NULO(), right: BORDE_NULO(), insideHorizontal: BORDE_NULO(), insideVertical: BORDE_NULO() },
      rows: [new TableRow({ cantSplit: true, children: [celda(parrafos, {
        fill: C.bg, ancho: ANCHO,
        borders: { left: borde(24, C.olive), top: BORDE_NULO(), bottom: BORDE_NULO(), right: BORDE_NULO() }
      })] })]
    });
  }

  const separador = () => new (D().Paragraph)({ children: [], spacing: { after: 80 } });

  function tituloSeccion(n, titulo) {
    const { Paragraph, TextRun } = D();
    return new Paragraph({
      keepNext: true,
      spacing: { before: 240, after: 120 },
      border: { bottom: { style: D().BorderStyle.SINGLE, size: 12, color: C.ink, space: 2 } },
      children: [new TextRun({ text: `${n}. ${titulo}`, bold: true, size: 24, font: SANS, color: C.ink })]
    });
  }

  function nota(texto) {
    const { Paragraph } = D();
    return new Paragraph({
      children: runs(texto, { size: 17, color: C.ink2 }),
      indent: { left: 140 },
      spacing: { before: 60, after: 120 },
      border: { left: { style: D().BorderStyle.SINGLE, size: 8, color: C.rule, space: 6 } }
    });
  }

  // ---------- Bloques tipados (lo único que usa un módulo) ----------

  function bloque(b, nSeccion) {
    switch (b.tipo) {
      case 'parrafo':
        return [parrafo(b.texto)];
      case 'lista':
        return b.items.map((it, i) => b.numerada
          ? new (D().Paragraph)({ children: runs(`${i + 1}. ${it}`), indent: { left: 360, hanging: 260 }, spacing: { after: 60 } })
          : new (D().Paragraph)({ children: runs(it), bullet: { level: 0 }, spacing: { after: 60 } }));
      case 'paso':
        return [
          parrafo(`${nSeccion}.${b.n} ${b.titulo}`, { bold: true, keepNext: true, spacing: { before: 160, after: 80 } }),
          ...(b.texto ? [parrafo(b.texto)] : [])
        ];
      case 'formula': {
        const out = [recuadro([{ texto: b.expr }])];
        if (b.variables && b.variables.length) {
          out.push(parrafo('donde:', { size: 18, spacing: { before: 80, after: 40 }, keepNext: true }));
          out.push(tablaDatos(['Símbolo', 'Descripción', 'Unidad'], b.variables,
            { anchos: [1700, 6472, 1800], mono: [true, false, false] }));
        }
        out.push(separador());
        return out;
      }
      case 'tabla': {
        const out = [tablaDatos(b.encabezados, b.filas, { alinear: b.alinear, anchos: b.anchos, mono: b.mono })];
        if (b.nota) out.push(nota(b.nota)); else out.push(separador());
        return out;
      }
      case 'nota':
        return [nota(b.texto)];
      default:
        throw new Error(`Memoria de cálculo: tipo de bloque desconocido "${b.tipo}".`);
    }
  }

  // ---------- Partes fijas del documento ----------

  function bloqueIdentificacion(spec, generado) {
    const { Table, TableRow, WidthType, Paragraph, TextRun, AlignmentType } = D();
    const w = Math.floor(ANCHO / 4);
    const anchos = [w, w, w, ANCHO - 3 * w];
    const m = spec.modulo, f = spec.ficha;
    const etiquetaValor = (etq, val) => [
      new Paragraph({ children: [new TextRun({ text: etq.toUpperCase(), font: MONO, size: 14, color: C.olive })], spacing: { after: 20 } }),
      new Paragraph({ children: [new TextRun({ text: val, font: SANS, size: 18, color: C.ink })], spacing: { after: 0 } })
    ];
    const negro = (texto, o) => new Paragraph({
      alignment: o.right ? AlignmentType.RIGHT : AlignmentType.LEFT, spacing: { after: 0 },
      children: [new TextRun({ text: texto, font: o.mono ? MONO : SANS, size: o.size, bold: o.bold, color: o.color })]
    });
    const filaCeldas = pares => new TableRow({ cantSplit: true, children: pares.map((p, i) => celda(etiquetaValor(p[0], p[1]), { ancho: anchos[i] })) });
    const url = window.location.protocol === 'file:' ? window.location.href.split('?')[0] : window.location.origin + window.location.pathname;
    return new Table({
      width: { size: ANCHO, type: WidthType.DXA }, columnWidths: anchos,
      borders: {
        top: borde(12, C.ink), bottom: borde(12, C.ink), left: borde(12, C.ink), right: borde(12, C.ink),
        insideHorizontal: borde(8, C.ink), insideVertical: borde(8, C.ink)
      },
      rows: [
        new TableRow({ cantSplit: true, children: [
          celda(negro(m.titulo, { size: 28, bold: true, color: C.bg }), { span: 3, fill: C.ink }),
          celda(negro(m.codigo, { size: 18, mono: true, color: C.sage, right: true }), { fill: C.ink, ancho: anchos[3] })
        ] }),
        filaCeldas([['Magnitud', f.magnitud], ['Resolución', f.resolucion], ['Norma', f.norma], ['Salida', f.salida]]),
        filaCeldas([['Versión del módulo', m.version], ['Fecha de la versión', m.fecha], ['Generado', fechaHora(generado)], ['URL de la herramienta', url]])
      ]
    });
  }

  function seccionEjecucion(ej) {
    const out = [tituloSeccion(10, 'Registro de la ejecución')];
    if (ej.nota) out.push(nota(ej.nota));
    out.push(parrafo('**Archivos fuente**', { keepNext: true }));
    if (ej.archivos && ej.archivos.length) {
      out.push(tablaDatos(['Archivo', 'Tamaño (bytes)', 'SHA-256', 'Hojas usadas'],
        ej.archivos.map(a => [a.nombre, String(a.tamanoBytes ?? '—'), a.sha256 || '—', a.hojas || '—']),
        { anchos: [2600, 1200, 3872, 2300], alinear: ['left', 'right', 'left', 'left'], mono: [false, true, true, false] }));
    } else {
      out.push(parrafo('Sin archivo fuente: datos ingresados manualmente en la interfaz.'));
    }
    out.push(separador());
    out.push(parrafo('**Parámetros ingresados**', { keepNext: true }));
    out.push(tablaDatos(['Parámetro', 'Valor'], ej.parametros, { anchos: [4500, 5472] }));
    out.push(separador());
    out.push(parrafo('**Avisos mostrados en pantalla**', { keepNext: true }));
    if (ej.avisos && ej.avisos.length) out.push(...bloque({ tipo: 'lista', items: ej.avisos }));
    else out.push(parrafo('Ninguno.'));
    out.push(parrafo('**Resumen de resultados**', { keepNext: true, spacing: { before: 120, after: 80 } }));
    const t = ej.resumen.tabla;
    out.push(...bloque({ tipo: 'tabla', ...t }));
    if (ej.ejemplo) {
      out.push(parrafo(`**Ejemplo trabajado:** ${ej.ejemplo.titulo}`, { keepNext: true, spacing: { before: 120, after: 80 } }));
      ej.ejemplo.pasos.forEach((p, i) => {
        out.push(parrafo(`Paso ${i + 1}. ${p.titulo || ''}`.trim(), { size: 18, bold: true, keepNext: true, spacing: { before: 80, after: 40 } }));
        out.push(recuadro([{ texto: p.formula }, { texto: p.sustitucion }, { texto: p.resultado, bold: true }]));
      });
    } else {
      out.push(parrafo('**Ejemplo trabajado:** no hay ningún valor numérico calculado para mostrar.', { spacing: { before: 120, after: 80 } }));
    }
    out.push(separador());
    return out;
  }

  function controlDocumento(spec) {
    const { Table, TableRow, WidthType } = D();
    const out = [tituloSeccion(spec.ejecucion ? 11 : 10, 'Control del documento')];
    out.push(parrafo('**Historial de versiones del módulo**', { keepNext: true }));
    out.push(tablaDatos(['Versión', 'Fecha', 'Cambio'],
      spec.modulo.historial.map(h => [h.version, h.fecha, h.cambio]), { anchos: [1300, 1600, 7072], mono: [true, true, false] }));
    out.push(separador());
    out.push(parrafo('**Revisión y aprobación**', { keepNext: true }));
    const anchos = [1900, 2400, 2072, 2000, 1600];
    const fila = (vals, cab) => new TableRow({
      cantSplit: true, height: cab ? undefined : { value: 620, rule: D().HeightRule.ATLEAST },
      children: vals.map((v, i) => celda(v, { bold: cab || i === 0, fill: cab ? C.sage : undefined, ancho: anchos[i] }))
    });
    out.push(new Table({
      width: { size: ANCHO, type: WidthType.DXA }, columnWidths: anchos,
      borders: {
        top: borde(8, C.ink), bottom: borde(8, C.ink), left: borde(8, C.ink), right: borde(8, C.ink),
        insideHorizontal: borde(4, C.rule), insideVertical: borde(4, C.rule)
      },
      rows: [
        fila(['', 'Nombre', 'Cargo', 'Firma', 'Fecha'], true),
        fila(['Elaborado por', '', '', '', ''], false),
        fila(['Revisado por', '', '', '', ''], false),
        fila(['Aprobado por', '', '', '', ''], false)
      ]
    }));
    return out;
  }

  function encabezadoPagina(spec) {
    const { Header, Paragraph, TextRun, Tab, TabStopType } = D();
    return new Header({ children: [new Paragraph({
      tabStops: [{ type: TabStopType.RIGHT, position: ANCHO }],
      border: { bottom: { style: D().BorderStyle.SINGLE, size: 4, color: C.ink2, space: 2 } },
      children: [
        new TextRun({ text: `${NOMBRE_SITIO} · Memoria de cálculo`, font: SANS, size: 16, color: C.ink2 }),
        new TextRun({ children: [new Tab(), `${spec.modulo.codigo} · v${spec.modulo.version}`], font: SANS, size: 16, color: C.ink2 })
      ]
    })] });
  }

  function piePagina() {
    const { Footer, Paragraph, TextRun, PageNumber, AlignmentType } = D();
    return new Footer({ children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ children: ['Página ', PageNumber.CURRENT, ' de ', PageNumber.TOTAL_PAGES], font: SANS, size: 16, color: C.ink2 })]
    })] });
  }

  // ---------- Validación y armado ----------

  function validar(spec) {
    if (!window.docx) throw new Error('No se cargó la librería docx: revisa la conexión a internet y recarga la página.');
    const m = spec.modulo;
    ['codigo', 'titulo', 'version', 'fecha', 'sigla'].forEach(k => { if (!m || !m[k]) throw new Error(`MODULO_INFO.${k} no está definido.`); });
    if (!Array.isArray(m.historial) || !m.historial.length) throw new Error('MODULO_INFO.historial está vacío.');
    const ids = (spec.secciones || []).map(s => s.id);
    const esperados = SECCIONES.map(s => s[0]);
    if (ids.join() !== esperados.join()) {
      throw new Error(`La memoria debe tener las secciones ${esperados.join(', ')} en ese orden (recibidas: ${ids.join(', ')}).`);
    }
  }

  function construirDocumento(spec, generado) {
    validar(spec);
    const { Document } = D();
    const cuerpo = [bloqueIdentificacion(spec, generado), separador()];
    spec.secciones.forEach((s, i) => {
      cuerpo.push(tituloSeccion(i + 1, SECCIONES[i][1]));
      s.bloques.forEach(b => cuerpo.push(...bloque(b, i + 1)));
    });
    if (spec.ejecucion) {
      cuerpo.push(...seccionEjecucion(spec.ejecucion));
    } else {
      cuerpo.push(nota(TEXTO_SIN_RESULTADOS));
    }
    cuerpo.push(...controlDocumento(spec));

    return new Document({
      creator: NOMBRE_SITIO,
      title: `Memoria de cálculo — ${spec.modulo.titulo}`,
      styles: { default: { document: {
        run: { font: SANS, size: 20, color: C.ink },
        paragraph: { spacing: { line: 276, after: 120 } }
      } } },
      sections: [{
        properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1134, bottom: 1134, left: 1134, right: 1134, header: 567, footer: 567 } } },
        headers: { default: encabezadoPagina(spec) },
        footers: { default: piePagina() },
        children: cuerpo
      }]
    });
  }

  function nombreArchivo(spec, generado) {
    const p = n => String(n).padStart(2, '0');
    const fecha = `${generado.getFullYear()}${p(generado.getMonth() + 1)}${p(generado.getDate())}`;
    const fuente = spec.ejecucion && spec.ejecucion.archivos && spec.ejecucion.archivos.length === 1
      ? '_' + spec.ejecucion.archivos[0].nombre.replace(/\.[^.]+$/, '').replace(/[^\w\-]+/g, '_').slice(0, 60)
      : '';
    return `Memoria_Calculo_${spec.modulo.sigla}_v${spec.modulo.version}${fuente}_${fecha}.docx`;
  }

  async function descargar(spec) {
    const generado = new Date();
    const doc = construirDocumento(spec, generado);
    const blob = await D().Packer.toBlob(doc);
    LabUtils.downloadBlob(blob, nombreArchivo(spec, generado));
  }

  // Verifica que el ejemplo trabajado reproduce el valor que ya calculó el módulo. Si no coincide
  // (diferencia relativa > 1e-9) la memoria y el cálculo divergen: se lanza error y no se genera.
  function verificar(reproducido, calculado, contexto) {
    const escala = Math.max(Math.abs(calculado), 1e-300);
    if (!(Math.abs(reproducido - calculado) / escala <= 1e-9)) {
      const msg = `Memoria de cálculo: el ejemplo trabajado no reproduce el valor calculado (${contexto}: ${reproducido} ≠ ${calculado}).`;
      console.error(msg);
      throw new Error(msg);
    }
    return calculado;
  }

  return {
    descargar, construirDocumento, nombreArchivo, verificar, num, fechaHora,
    sha256: buf => LabUtils.sha256Hex(buf),
    TEXTO_INCERTIDUMBRE, TEXTO_SIN_RESULTADOS, SECCIONES
  };
})();
