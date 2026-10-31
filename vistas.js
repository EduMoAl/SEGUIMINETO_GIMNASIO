'use strict';

/* =====================================================================
 * Pantallas de consulta: Historial, Progreso, Perfil, Récords y Ajustes.
 * Todo se calcula a partir de la copia de la hoja (datos.js).
 * ===================================================================== */

const estHist = { mes: null, dia: null };
const estProg = { modo: 'ejercicio', ejercicio: null, metrica: 'peso', rango: 'todo', semana: null, musculo: null };
const estPerfil = { editando: false, pesando: false };
let guardandoDescanso = false;

const ICONO_ATRAS = '<svg viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg>';
const ICONO_SIG = '<svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg>';

function ordenarEjercicios(lista) {
  return lista.sort((a, b) => (ORDEN_EJ.get(a.nombre) ?? 999) - (ORDEN_EJ.get(b.nombre) ?? 999));
}

/* ===================== Historial ===================== */

function vistaHistorial() {
  barra(`<h1>Historial</h1>${BTN_REFRESCAR}`);
  const idx = indice();
  if (!estHist.mes) estHist.mes = hoy().slice(0, 7);
  const [y, m] = estHist.mes.split('-').map(Number);
  const primero = new Date(y, m - 1, 1);
  const hueco = (primero.getDay() + 6) % 7;
  const diasMes = new Date(y, m, 0).getDate();

  // Día seleccionado por defecto: el último entreno del mes
  const diasConEntreno = [];
  for (let d = 1; d <= diasMes; d++) {
    const iso = `${estHist.mes}-${String(d).padStart(2, '0')}`;
    if (idx.dias.has(iso)) diasConEntreno.push(iso);
  }
  if (!estHist.dia || !estHist.dia.startsWith(estHist.mes)) {
    estHist.dia = diasConEntreno.length ? diasConEntreno[diasConEntreno.length - 1] : null;
  }

  let html = `<div class="tarjeta">
    <div class="cal-cabecera">
      <button class="icono" data-accion="mes" data-delta="-1" aria-label="Mes anterior">${ICONO_ATRAS}</button>
      <h3>${MESES[m - 1]} ${y}</h3>
      <button class="icono" data-accion="mes" data-delta="1" aria-label="Mes siguiente">${ICONO_SIG}</button>
    </div>
    <div class="cal-grid">${['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d) => `<div class="cal-dsem">${d}</div>`).join('')}`;
  for (let i = 0; i < hueco; i++) html += '<div class="cal-dia fuera"></div>';
  const hoyIso = hoy();
  for (let d = 1; d <= diasMes; d++) {
    const iso = `${estHist.mes}-${String(d).padStart(2, '0')}`;
    const dia = idx.dias.get(iso);
    const cls = ['cal-dia'];
    let letras = '';
    if (dia) {
      const ses = [...dia.sesiones.values()];
      cls.push(ses.every((s) => s.pendiente) ? 'pendiente' : 'entreno');
      letras = ses.map((s) => (INFO_SESION[s.sesion] || { letra: '•' }).letra).join('');
    }
    if (iso === hoyIso) cls.push('hoy');
    if (iso === estHist.dia) cls.push('sel');
    const etiqueta = `${d} de ${MESES[m - 1]}${dia ? ': ' + [...dia.sesiones.keys()].join(', ') : ''}`;
    html += `<button class="${cls.join(' ')}" data-accion="dia" data-fecha="${iso}" aria-label="${esc(etiqueta)}">${d}${letras ? `<small>${esc(letras)}</small>` : ''}</button>`;
  }
  html += `</div>
    <div class="cal-leyenda"><span><i></i>Entrenado</span><span><i class="p"></i>Pendiente de enviar</span></div>
  </div>`;

  // Resumen del mes
  let sesionesMes = 0, seriesMes = 0, volMes = 0, minMes = 0;
  for (const iso of diasConEntreno) {
    for (const s of idx.dias.get(iso).sesiones.values()) {
      sesionesMes++;
      minMes += idx.tiempoSesion.get(`${iso}|${s.sesion}`) || 0;
      for (const ej of s.ejercicios.values()) for (const x of ej.series) { seriesMes++; volMes += x.peso * x.reps; }
    }
  }
  html += `<div class="resumen-mes">
    <div><b>${sesionesMes}</b><span>${sesionesMes === 1 ? 'sesión' : 'sesiones'}</span></div>
    <div><b>${seriesMes}</b><span>series</span></div>
    <div><b>${volumenTxt(volMes)}</b><span>volumen</span></div>
  </div>`;
  if (minMes) html += `<div class="tenue" style="text-align:center;margin-top:8px">⏱ ${minTxt(minMes)} entrenando este mes</div>`;

  // Detalle del día
  html += `<div class="seccion-titulo">${estHist.dia ? esc(fechaMedia(estHist.dia)) : 'Detalle'}</div>`;
  const dia = estHist.dia && idx.dias.get(estHist.dia);
  if (!estHist.dia) {
    html += `<div class="tarjeta vacio">No hay entrenos este mes.</div>`;
  } else if (!dia) {
    html += `<div class="tarjeta vacio">Sin entreno este día.</div>`;
  } else {
    for (const s of dia.sesiones.values()) {
      const ejs = ordenarEjercicios([...s.ejercicios.values()]);
      const minSes = idx.tiempoSesion.get(`${estHist.dia}|${s.sesion}`);
      html += `<div class="tarjeta dia-sesion">
        <h4><span class="letra" style="margin:0;width:28px;height:28px;font-size:.85rem">${esc((INFO_SESION[s.sesion] || { letra: '•' }).letra)}</span>${esc(s.sesion)}
          ${s.pendiente ? '<span class="etiqueta-pend">pendiente</span>' : ''}</h4>
        <div class="tenue" style="margin-bottom:6px">${s.soloAsistencia
          ? `Asistencia registrada, sin series detalladas${minSes ? ` · ⏱ ${minTxt(minSes)}` : ''}`
          : `${ejs.length} ejercicios · ${ejs.reduce((a, e) => a + e.series.length, 0)} series${minSes ? ` · ⏱ ${minTxt(minSes)}` : ''}`}</div>`;
      for (const ej of ejs) {
        const min = idx.tiempoDiaEj.get(`${estHist.dia}|${s.sesion}|${ej.nombre}`);
        html += `<div class="dia-ej"><b>${esc(ej.nombre)}${min !== undefined ? ` <span class="tenue">· ${minTxt(min)}</span>` : ''}</b>
          <div class="series-txt">${esc(seriesTxt(ej.series))}</div>${ej.nota ? `<em>${esc(ej.nota)}</em>` : ''}</div>`;
      }
      html += '</div>';
    }
  }

  html += mapaConstancia(idx);
  $('#vista').innerHTML = html;
  const mapa = $('.constancia-scroll');
  if (mapa) mapa.scrollLeft = mapa.scrollWidth;
}

/** Cuadrícula de los últimos 12 meses: una columna por semana, una casilla por día */
function mapaConstancia(idx) {
  const hoyD = deISO(hoy());
  const inicio = lunesDe(new Date(hoyD.getFullYear(), hoyD.getMonth(), hoyD.getDate() - 7 * 52));
  const CELDA = 13; // 11 px + 2 px de hueco
  let celdas = '', meses = '', dias = 0, col = 0, mesPrevio = -1;
  for (let d = new Date(inicio); d <= hoyD; d.setDate(d.getDate() + 1)) {
    const iso = aISO(d);
    const fila = (d.getDay() + 6) % 7;
    if (fila === 0 && d > inicio) col++;
    if (fila === 0 && d.getMonth() !== mesPrevio) {
      mesPrevio = d.getMonth();
      meses += `<span style="left:${col * CELDA}px">${MESES_CORTOS[d.getMonth()]}</span>`;
    }
    const dia = idx.dias.get(iso);
    let cls = 'cd';
    if (dia) {
      dias++;
      cls += [...dia.sesiones.values()].every((s) => s.pendiente) ? ' p' : ' e';
    }
    const etiqueta = dia ? `${fechaMedia(iso)}: ${[...dia.sesiones.keys()].join(', ')}` : fechaMedia(iso);
    celdas += `<button class="${cls}" style="grid-column:${col + 1};grid-row:${fila + 1}" data-accion="dia-anual" data-fecha="${iso}" aria-label="${esc(etiqueta)}" title="${esc(etiqueta)}"></button>`;
  }
  return `<div class="seccion-titulo">Constancia · últimos 12 meses</div>
    <div class="tarjeta">
      <div class="constancia-cab"><b>${dias}</b> ${dias === 1 ? 'día entrenado' : 'días entrenados'}</div>
      <div class="constancia-scroll">
        <div class="constancia-meses" style="width:${(col + 1) * CELDA}px">${meses}</div>
        <div class="constancia">${celdas}</div>
      </div>
      <div class="cal-leyenda"><span><i class="m"></i>Sin entreno</span><span><i></i>Entrenado</span><span><i class="p"></i>Pendiente</span></div>
    </div>`;
}

/* ===================== Progreso ===================== */

const METRICAS = {
  peso:    { nombre: 'Peso máx.', titulo: 'Peso máximo de cada día', valor: (d) => d.pesoMax, formato: (v) => `${num(v)} kg` },
  rm1:     { nombre: '1RM est.', titulo: '1RM estimado de cada día', valor: (d) => d.rm1, formato: (v) => `${num(v, 1)} kg` },
  volumen: { nombre: 'Volumen', titulo: 'Volumen de cada día (kg × reps)', valor: (d) => d.volumen, formato: (v) => volumenTxt(v) }
};
const RANGOS = { '1m': 1, '3m': 3, '6m': 6, todo: null };

function vistaProgreso() {
  barra(`<h1>Progreso</h1>${BTN_REFRESCAR}`);
  let html = `<div class="segmentado modos">
    <button class="chip ${estProg.modo === 'ejercicio' ? 'activo' : ''}" data-accion="modo-prog" data-valor="ejercicio">Por ejercicio</button>
    <button class="chip ${estProg.modo === 'musculo' ? 'activo' : ''}" data-accion="modo-prog" data-valor="musculo">Por músculo</button>
  </div>`;
  html += estProg.modo === 'musculo' ? htmlMusculos() : htmlEjercicio();
  $('#vista').innerHTML = html;

  const cont = $('#grafico');
  if (cont && progresoPuntos) dibujarGrafico(cont, progresoPuntos.puntos, { formato: progresoPuntos.formato });
}
let progresoPuntos = null;

function htmlEjercicio() {
  const idx = indice();
  progresoPuntos = null;
  if (!estProg.ejercicio) {
    const guardado = leer(K.ejercicioProgreso, null);
    const conDatos = [...ORDEN_EJ.keys()].find((n) => idx.evolucion.has(n));
    estProg.ejercicio = guardado && ORDEN_EJ.has(guardado) ? guardado : conDatos || RUTINA[ORDEN_SESIONES[0]][0].nombre;
  }
  const nombre = estProg.ejercicio;
  const lista = idx.evolucion.get(nombre) || [];
  const rec = idx.records.get(nombre);
  const met = METRICAS[estProg.metrica];

  let html = `<select class="selector" id="sel-ejercicio" aria-label="Ejercicio">`;
  for (const s of ORDEN_SESIONES) {
    html += `<optgroup label="${esc(s)}">`;
    for (const ej of RUTINA[s]) {
      const n = (idx.evolucion.get(ej.nombre) || []).length;
      html += `<option value="${esc(ej.nombre)}" ${ej.nombre === nombre ? 'selected' : ''}>${esc(ej.nombre)}${n ? '' : ' · sin datos'}</option>`;
    }
    html += '</optgroup>';
  }
  html += '</select>';

  if (!lista.length) {
    return html + `<div class="tarjeta vacio" style="margin-top:12px">Aún no hay registros de este ejercicio.<br>Aparecerán aquí cuando guardes una sesión en la hoja.</div>`;
  }

  const tiempos = idx.tiemposEj.get(nombre) || [];
  const media = tiempos.length ? tiempos.reduce((a, b) => a + b, 0) / tiempos.length : null;
  html += `<div class="records">
    <div class="stat"><div class="stat-etiqueta">Mejor peso</div><div class="stat-valor">${num(rec.peso)}<small>kg</small></div><div class="stat-pie">${esc(fechaCorta(rec.fechaPeso))}</div></div>
    <div class="stat"><div class="stat-etiqueta">Mejor 1RM estimado</div><div class="stat-valor">${num(rec.rm1, 1)}<small>kg</small></div><div class="stat-pie">${esc(fechaCorta(rec.fechaRm1))}</div></div>
    <div class="stat"><div class="stat-etiqueta">Días registrados</div><div class="stat-valor">${lista.length}</div><div class="stat-pie">desde ${esc(fechaCorta(lista[0].fecha))}</div></div>
    <div class="stat"><div class="stat-etiqueta">Tiempo medio</div><div class="stat-valor">${media === null ? '—' : num(media, 0)}${media === null ? '' : '<small>min</small>'}</div><div class="stat-pie">${tiempos.length ? `en ${tiempos.length} ${tiempos.length === 1 ? 'sesión' : 'sesiones'}` : 'sin tiempos aún'}</div></div>
  </div>`;

  let puntos = lista;
  const meses = RANGOS[estProg.rango];
  if (meses) {
    const corte = new Date(); corte.setMonth(corte.getMonth() - meses);
    puntos = lista.filter((d) => d.fecha >= aISO(corte));
  }

  html += `<div class="seccion-titulo">Evolución día a día</div>
    <div class="tarjeta">
      <div class="controles-grafico">
        <div class="segmentado">${Object.entries(METRICAS).map(([k, v]) => `<button class="chip ${k === estProg.metrica ? 'activo' : ''}" data-accion="metrica" data-valor="${k}">${v.nombre}</button>`).join('')}</div>
        <div class="segmentado">${Object.keys(RANGOS).map((k) => `<button class="chip ${k === estProg.rango ? 'activo' : ''}" data-accion="rango" data-valor="${k}">${k === 'todo' ? 'Todo' : k.toUpperCase()}</button>`).join('')}</div>
      </div>
      <div class="tenue" style="margin-bottom:6px">${esc(met.titulo)}</div>
      ${puntos.length ? '<div class="grafico" id="grafico"></div>' : '<div class="vacio">Sin registros en este periodo.</div>'}
      ${puntos.length === 1 ? '<div class="tenue" style="text-align:center;margin-top:6px">Con dos o más días verás la línea de evolución.</div>' : ''}
    </div>`;
  if (puntos.length) {
    progresoPuntos = {
      puntos: puntos.map((d) => ({ fecha: d.fecha, valor: met.valor(d), detalle: seriesTxt(d.series), pendiente: d.pendiente })),
      formato: met.formato
    };
  }

  // Tabla día a día (lo más reciente arriba)
  html += `<div class="seccion-titulo">Registro día a día</div>
    <div class="tarjeta"><table class="tabla">
      <thead><tr><th>Día</th><th>Series</th><th class="num-col">Máx.</th><th class="num-col">1RM</th></tr></thead><tbody>`;
  for (const d of [...lista].reverse()) {
    const esPR = d.fecha === rec.fechaPeso;
    html += `<tr>
      <td>${esc(fechaCorta(d.fecha))}${d.pendiente ? '<br><span class="etiqueta-pend">pend.</span>' : ''}</td>
      <td class="series-txt">${esc(seriesTxt(d.series))}${d.nota ? `<br><em class="tenue">${esc(d.nota)}</em>` : ''}</td>
      <td class="num-col">${num(d.pesoMax)}${esPR ? ' 🏆' : ''}</td>
      <td class="num-col">${num(d.rm1, 1)}</td></tr>`;
  }
  html += '</tbody></table></div>';
  return html;
}

/** Series por grupo muscular en una semana, con la media de las 4 anteriores */
function htmlMusculos() {
  if (!estProg.semana) estProg.semana = aISO(lunesDe(new Date()));
  const lunes = estProg.semana;
  const domingo = aISO(new Date(deISO(lunes).getFullYear(), deISO(lunes).getMonth(), deISO(lunes).getDate() + 6));
  const { series, detalle } = seriesPorMusculo(lunes);
  const medias = Object.fromEntries(ORDEN_MUSCULOS.map((m) => [m, 0]));
  for (let k = 1; k <= 4; k++) {
    const l = deISO(lunes); l.setDate(l.getDate() - 7 * k);
    const s = seriesPorMusculo(aISO(l)).series;
    ORDEN_MUSCULOS.forEach((m) => { medias[m] += s[m] / 4; });
  }
  const maximo = Math.max(1, ...ORDEN_MUSCULOS.map((m) => Math.max(series[m], medias[m])));
  const total = ORDEN_MUSCULOS.reduce((a, m) => a + series[m], 0);
  const esActual = lunes === aISO(lunesDe(new Date()));

  let html = `<div class="tarjeta">
    <div class="cal-cabecera">
      <button class="icono" data-accion="semana" data-delta="-1" aria-label="Semana anterior">${ICONO_ATRAS}</button>
      <h3 style="text-transform:none">${esActual ? 'Esta semana' : `${esc(fechaCorta(lunes))} – ${esc(fechaCorta(domingo))}`}</h3>
      <button class="icono" data-accion="semana" data-delta="1" aria-label="Semana siguiente" ${esActual ? 'disabled' : ''}>${ICONO_SIG}</button>
    </div>
    <div class="tenue" style="margin-bottom:12px">Series por músculo · principal = 1, secundario = ½ · total ${num(total, 1)}</div>
    <div class="barras">`;
  for (const m of ORDEN_MUSCULOS) {
    const v = series[m];
    const sel = estProg.musculo === m;
    html += `<button class="barra-fila ${sel ? 'sel' : ''}" data-accion="musculo" data-valor="${esc(m)}" aria-label="${esc(m)}: ${num(v, 1)} series">
      <span class="barra-nombre">${esc(m)}</span>
      <span class="barra-pista">
        <span class="barra-valor" style="width:${(v / maximo) * 100}%"></span>
        <span class="barra-media" style="left:${(medias[m] / maximo) * 100}%"></span>
      </span>
      <span class="barra-num">${num(v, 1)}</span>
    </button>`;
    if (sel) {
      html += `<div class="barra-detalle">${detalle[m].principal} como principal + ${detalle[m].secundario} como secundario (½) · media de las 4 semanas anteriores: ${num(medias[m], 1)}</div>`;
    }
  }
  html += `</div>
    <div class="cal-leyenda"><span><i></i>Series de la semana</span><span><i class="linea"></i>Media de las 4 semanas anteriores</span></div>
  </div>
  <p class="tenue" style="padding:0 4px">Toca un músculo para ver el detalle. Las sesiones pendientes de enviar también cuentan.</p>`;
  return html;
}

/* ===================== Perfil ===================== */

function vistaPerfil() {
  barra(`<h1>Perfil</h1>${BTN_REFRESCAR}`);
  const idx = indice();
  const p = idx.perfil || { nombre: '', nacimiento: null, altura: null, pesos: [] };
  const pesos = p.pesos || [];
  const ultimoPeso = pesos.length ? pesos[pesos.length - 1] : null;
  const anos = edad(p.nacimiento);
  const imc = ultimoPeso && p.altura ? ultimoPeso[1] / Math.pow(p.altura / 100, 2) : null;
  const inicial = (p.nombre || '?').trim().charAt(0).toUpperCase();

  let html = `<div class="perfil-cab">
    <div class="avatar">${esc(inicial)}</div>
    <div>
      <div class="perfil-nombre">${esc(p.nombre || 'Sin nombre')}</div>
      <div class="tenue">${[anos !== null ? `${anos} años` : null, p.altura ? `${num(p.altura / 100, 2)} m` : null].filter(Boolean).join(' · ') || 'Completa tus datos'}</div>
    </div>
  </div>`;

  if (!idx.perfil && !configCompleta()) {
    html += `<div class="tarjeta alerta">Conecta la app con tu hoja en Ajustes para guardar tu perfil.</div>`;
  }

  html += `<div class="stats">
    <div class="stat"><div class="stat-etiqueta">Peso</div><div class="stat-valor">${ultimoPeso ? num(ultimoPeso[1], 1) : '—'}${ultimoPeso ? '<small>kg</small>' : ''}</div><div class="stat-pie">${ultimoPeso ? esc(haceDias(ultimoPeso[0])) : 'sin registrar'}</div></div>
    <div class="stat"><div class="stat-etiqueta">IMC</div><div class="stat-valor">${imc ? num(imc, 1) : '—'}</div><div class="stat-pie">peso / altura²</div></div>
    <div class="stat"><div class="stat-etiqueta">Altura</div><div class="stat-valor">${p.altura ? num(p.altura, 0) : '—'}${p.altura ? '<small>cm</small>' : ''}</div><div class="stat-pie">&nbsp;</div></div>
    <div class="stat"><div class="stat-etiqueta">Edad</div><div class="stat-valor">${anos !== null ? anos : '—'}${anos !== null ? '<small>años</small>' : ''}</div><div class="stat-pie">${p.nacimiento ? esc(fechaCorta(p.nacimiento)) + ' ' + p.nacimiento.slice(0, 4) : '&nbsp;'}</div></div>
  </div>`;

  // Peso corporal
  html += `<div class="seccion-titulo">Peso corporal</div><div class="tarjeta">`;
  if (pesos.length >= 2) {
    html += `<div class="tenue" style="margin-bottom:6px">Evolución del peso</div><div class="grafico" id="grafico-peso"></div>`;
  } else {
    html += `<div class="tenue">${pesos.length ? 'Con dos o más registros verás la gráfica de tu peso.' : 'Aún no has registrado tu peso.'}</div>`;
  }
  if (estPerfil.pesando) {
    html += `<div class="form-linea">
      <label class="campo">Peso (kg)<input id="nuevo-peso" inputmode="decimal" autocomplete="off" value="${ultimoPeso ? esc(num(ultimoPeso[1], 1)) : ''}"></label>
      <label class="campo">Fecha<input id="fecha-peso" type="date" value="${hoy()}" max="${hoy()}"></label>
    </div>
    <div class="fila-botones" style="margin-top:0">
      <button class="btn" data-accion="cancelar-peso">Cancelar</button>
      <button class="btn primario" data-accion="guardar-peso">Guardar en la hoja</button>
    </div>`;
  } else {
    html += `<button class="btn ancho" style="margin-top:12px" data-accion="registrar-peso">Registrar peso</button>`;
  }
  html += `</div>`;

  // Últimos récords
  const ultimos = idx.historialRecords.slice(0, 3);
  html += `<div class="seccion-titulo">Últimos récords</div><div class="tarjeta">`;
  html += ultimos.length
    ? ultimos.map(htmlRecord).join('')
    : `<div class="tenue">Aún no has batido ningún récord. Aparecerán aquí cuando superes tus mejores marcas.</div>`;
  html += `<button class="btn ancho" style="margin-top:12px" data-accion="ver-records">Ver todos los récords</button></div>`;

  // Datos personales
  html += `<div class="seccion-titulo">Datos personales</div><div class="tarjeta">`;
  if (estPerfil.editando) {
    html += `
      <label class="campo">Nombre<input id="pf-nombre" autocomplete="off" value="${esc(p.nombre || '')}"></label>
      <label class="campo">Fecha de nacimiento<input id="pf-nacimiento" type="date" value="${esc(p.nacimiento || '')}" max="${hoy()}"></label>
      <label class="campo">Altura (cm)<input id="pf-altura" inputmode="numeric" autocomplete="off" value="${p.altura ? esc(p.altura) : ''}"></label>
      <div class="fila-botones" style="margin-top:0">
        <button class="btn" data-accion="cancelar-perfil">Cancelar</button>
        <button class="btn primario" data-accion="guardar-perfil">Guardar en la hoja</button>
      </div>`;
  } else {
    html += `
      <div class="info-fila"><span>Nombre</span><span>${esc(p.nombre || '—')}</span></div>
      <div class="info-fila"><span>Fecha de nacimiento</span><span>${p.nacimiento ? esc(p.nacimiento.split('-').reverse().join('/')) : '—'}</span></div>
      <div class="info-fila"><span>Altura</span><span>${p.altura ? num(p.altura, 0) + ' cm' : '—'}</span></div>
      <button class="btn ancho" style="margin-top:12px" data-accion="editar-perfil">Editar datos</button>`;
  }
  html += `<p class="tenue" style="margin-bottom:0">Se guardan en la pestaña Perfil de tu hoja. Para editarlos necesitas internet.</p></div>`;

  $('#vista').innerHTML = html;
  const g = $('#grafico-peso');
  if (g) dibujarGrafico(g, pesos.map(([fecha, kg]) => ({ fecha, valor: kg })), { formato: (v) => `${num(v, 1)} kg` });
}

function htmlRecord(r) {
  const tipo = r.tipo === 'peso' ? 'Peso' : '1RM est.';
  const dec = r.tipo === 'peso' ? 2 : 1;
  return `<div class="record">
    <div class="record-icono">🏆</div>
    <div class="record-txt">
      <b>${esc(r.ejercicio)}</b>
      <span>${tipo} ${num(r.valor, dec)} kg <span class="tenue">· antes ${num(r.anterior, dec)} kg</span></span>
    </div>
    <div class="record-fecha">${esc(fechaCorta(r.fecha))}${r.pendiente ? '<br><span class="etiqueta-pend">pend.</span>' : ''}</div>
  </div>`;
}

/* ===================== Muro de récords ===================== */

function vistaRecords() {
  barra(`${BTN_ATRAS}<h1>Récords</h1>`);
  const idx = indice();
  let html = '';

  // Récords actuales por ejercicio
  html += `<div class="seccion-titulo" style="margin-top:4px">Tus mejores marcas</div>`;
  let alguno = false;
  for (const s of ORDEN_SESIONES) {
    const filas = RUTINA[s].filter((ej) => idx.records.has(ej.nombre));
    if (!filas.length) continue;
    alguno = true;
    html += `<div class="tarjeta"><div class="muro-sesion"><span class="letra" style="margin:0;width:26px;height:26px;font-size:.8rem">${INFO_SESION[s].letra}</span>${esc(s)}</div>`;
    for (const ej of filas) {
      const r = idx.records.get(ej.nombre);
      html += `<div class="muro-fila">
        <b>${esc(ej.nombre)}</b>
        <div class="muro-valores">
          <span><small>Peso</small>${num(r.peso)} kg <em>${esc(fechaCorta(r.fechaPeso))}</em></span>
          <span><small>1RM est.</small>${num(r.rm1, 1)} kg <em>${esc(fechaCorta(r.fechaRm1))}</em></span>
        </div>
      </div>`;
    }
    html += '</div>';
  }
  if (!alguno) html += `<div class="tarjeta vacio">Aún no hay registros.</div>`;

  // Línea de tiempo
  const hist = idx.historialRecords;
  html += `<div class="seccion-titulo">Récords batidos (${hist.length})</div>`;
  if (!hist.length) {
    html += `<div class="tarjeta vacio">Cuando superes una marca anterior aparecerá aquí.</div>`;
  } else {
    html += '<div class="tarjeta">';
    let fechaPrev = null;
    for (const r of hist) {
      if (r.fecha !== fechaPrev) {
        html += `<div class="muro-fecha">${esc(fechaMedia(r.fecha))}</div>`;
        fechaPrev = r.fecha;
      }
      html += htmlRecord(r);
    }
    html += '</div>';
  }
  $('#vista').innerHTML = html;
}

/* ===================== Ajustes ===================== */

function vistaAjustes() {
  barra('<h1>Ajustes</h1>');
  const c = leer(K.config, {});
  const cache = leer(K.cache, { filas: [] });
  const pendientes = leer(K.pendientes, []);
  const pr = prefs();

  let descansos = '';
  for (const s of ORDEN_SESIONES) {
    descansos += `<div class="muro-sesion" style="margin-top:12px">${esc(s)}</div>`;
    for (const ej of RUTINA[s]) {
      const seg = descansoDe(ej.nombre);
      descansos += `<div class="descanso-ajuste">
        <span>${esc(ej.nombre)}</span>
        <div class="paso paso-peq">
          <button data-accion="descanso-ej" data-ej="${esc(ej.nombre)}" data-delta="-15" aria-label="Menos descanso" ${seg <= 15 || guardandoDescanso ? 'disabled' : ''}>−</button>
          <b>${mmss(seg)}</b>
          <button data-accion="descanso-ej" data-ej="${esc(ej.nombre)}" data-delta="15" aria-label="Más descanso" ${guardandoDescanso ? 'disabled' : ''}>+</button>
        </div>
      </div>`;
    }
  }

  $('#vista').innerHTML = `
    <div class="seccion-titulo" style="margin-top:4px">Conexión con la hoja</div>
    <div class="tarjeta">
      <label class="campo">URL del script (aplicación web)
        <input id="cfg-url" type="url" autocomplete="off" placeholder="https://script.google.com/macros/s/…/exec" value="${esc(c.url || '')}">
      </label>
      <label class="campo">Clave secreta
        <input id="cfg-clave" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(c.clave || '')}">
      </label>
      <div class="fila-botones">
        <button class="btn primario" data-accion="guardar-config">Guardar</button>
        <button class="btn" data-accion="probar">Probar conexión</button>
      </div>
    </div>

    <div class="seccion-titulo">Aviso de fin de descanso</div>
    <div class="tarjeta">
      <label class="interruptor"><span>Sonido</span><input type="checkbox" data-pref="sonido" ${pr.sonido ? 'checked' : ''}><i></i></label>
      <label class="interruptor"><span>Vibración</span><input type="checkbox" data-pref="vibracion" ${pr.vibracion ? 'checked' : ''}><i></i></label>
      <p class="tenue" style="margin-bottom:0">Se guardan solo en este móvil.</p>
    </div>

    <div class="seccion-titulo">Descansos por ejercicio</div>
    <div class="tarjeta">
      <p class="tenue" style="margin-top:0">Se guardan en la pestaña Rutina de tu hoja (columna Descanso). Necesitas internet para cambiarlos.</p>
      ${descansos}
    </div>

    <div class="seccion-titulo">Datos</div>
    <div class="tarjeta">
      <div class="info-fila"><span>Última descarga de la hoja</span><span>${esc(hace(cache.actualizado))}</span></div>
      <div class="info-fila"><span>Series en la hoja</span><span>${(cache.filas || []).length}</span></div>
      <div class="info-fila"><span>Sesiones pendientes de enviar</span><span>${pendientes.length}</span></div>
      <button class="btn ancho" style="margin-top:12px" data-accion="actualizar-forzado">Actualizar datos ahora</button>
      <p class="tenue" style="margin-bottom:0">La hoja de Google es la única fuente de datos. El móvil guarda una copia de solo lectura para usar la app sin internet.</p>
    </div>

    <div class="seccion-titulo">Acerca de</div>
    <div class="tarjeta">
      <div class="info-fila"><span>App</span><span>EDUX TRAINING</span></div>
      <div class="info-fila"><span>Versión</span><span>${VERSION_APP}</span></div>
    </div>`;
}

/* ===================== Eventos de estas pantallas ===================== */

async function accionVistas(accion, b) {
  switch (accion) {
    // Historial
    case 'mes': {
      const [y, m] = estHist.mes.split('-').map(Number);
      const d = new Date(y, m - 1 + Number(b.dataset.delta), 1);
      estHist.mes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      estHist.dia = null;
      repintar();
      return true;
    }
    case 'dia': estHist.dia = b.dataset.fecha; repintar(); return true;
    case 'dia-anual':
      estHist.mes = b.dataset.fecha.slice(0, 7);
      estHist.dia = b.dataset.fecha;
      vistaHistorial();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return true;

    // Progreso
    case 'modo-prog': estProg.modo = b.dataset.valor; repintar(); return true;
    case 'metrica': estProg.metrica = b.dataset.valor; repintar(); return true;
    case 'rango': estProg.rango = b.dataset.valor; repintar(); return true;
    case 'semana': {
      const l = deISO(estProg.semana); l.setDate(l.getDate() + 7 * Number(b.dataset.delta));
      if (aISO(l) <= aISO(lunesDe(new Date()))) estProg.semana = aISO(l);
      repintar();
      return true;
    }
    case 'musculo': estProg.musculo = estProg.musculo === b.dataset.valor ? null : b.dataset.valor; repintar(); return true;

    // Perfil y récords
    case 'ver-records': navegar('records'); return true;
    case 'registrar-peso': estPerfil.pesando = true; repintar(); setTimeout(() => $('#nuevo-peso')?.focus(), 50); return true;
    case 'cancelar-peso': estPerfil.pesando = false; repintar(); return true;
    case 'guardar-peso': {
      const kg = leerPeso($('#nuevo-peso').value);
      const fecha = $('#fecha-peso').value;
      if (!kg || Number.isNaN(kg) || kg < 30 || kg > 300) return aviso('Escribe un peso válido (kg)', 'error'), true;
      b.disabled = true;
      if (await escribirEnHoja({ tipo: 'peso', fecha, peso: kg }, '✓ Peso guardado en la hoja')) estPerfil.pesando = false;
      document.activeElement?.blur();
      repintar();
      return true;
    }
    case 'editar-perfil': estPerfil.editando = true; repintar(); return true;
    case 'cancelar-perfil': estPerfil.editando = false; repintar(); return true;
    case 'guardar-perfil': {
      const altura = $('#pf-altura').value.trim().replace(',', '.');
      const perfil = { nombre: $('#pf-nombre').value.trim(), nacimiento: $('#pf-nacimiento').value, altura: altura === '' ? '' : Number(altura) };
      if (perfil.altura !== '' && (!Number.isFinite(perfil.altura) || perfil.altura < 100 || perfil.altura > 250)) return aviso('La altura va en centímetros (por ejemplo 188)', 'error'), true;
      b.disabled = true;
      if (await escribirEnHoja({ tipo: 'perfil', perfil }, '✓ Perfil guardado en la hoja')) estPerfil.editando = false;
      document.activeElement?.blur();
      repintar();
      return true;
    }

    // Ajustes
    case 'guardar-config':
      guardar(K.config, { url: $('#cfg-url').value.trim(), clave: $('#cfg-clave').value.trim() });
      aviso('Ajustes guardados', 'ok', 3);
      return true;
    case 'probar': {
      guardar(K.config, { url: $('#cfg-url').value.trim(), clave: $('#cfg-clave').value.trim() });
      if (!configCompleta()) return aviso('Rellena la URL y la clave', 'error'), true;
      aviso('Probando…', 'info', 0);
      const r = await llamarScript({ tipo: 'ping' });
      aviso(r.ok ? '✓ ' + r.mensaje : '✗ ' + r.error, r.ok ? 'ok' : 'error', 8);
      if (r.ok) actualizarDatos();
      return true;
    }
    case 'descanso-ej': {
      const nombre = b.dataset.ej;
      const seg = Math.max(15, descansoDe(nombre) + Number(b.dataset.delta));
      guardandoDescanso = true;
      repintar();
      await escribirEnHoja({ tipo: 'descanso', ejercicio: nombre, segundos: seg }, `✓ ${nombre}: descanso ${mmss(seg)}`);
      guardandoDescanso = false;
      repintar();
      return true;
    }
  }
  return false;
}

function cambioVistas(el) {
  if (el.id === 'sel-ejercicio') {
    estProg.ejercicio = el.value;
    guardar(K.ejercicioProgreso, estProg.ejercicio);
    repintar();
    return true;
  }
  if (el.dataset.pref) {
    const p = prefs();
    p[el.dataset.pref] = el.checked;
    guardar(K.prefs, p);
    aviso(`${el.dataset.pref === 'sonido' ? 'Sonido' : 'Vibración'} ${el.checked ? 'activado' : 'desactivado'}`, 'info', 2);
    return true;
  }
  return false;
}
