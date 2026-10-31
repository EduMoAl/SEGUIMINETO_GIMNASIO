'use strict';

/* =====================================================================
 * EDUX TRAINING — pantallas y eventos.
 *   inicio · historial · progreso · ajustes  (pestañas)
 *   sesion · resumen                         (durante el entreno)
 * ===================================================================== */

const VERSION_APP = 'v2';
const $ = (sel, raiz = document) => raiz.querySelector(sel);

let vistaActual = 'inicio';
const TABS = ['inicio', 'historial', 'progreso', 'ajustes'];

// Estado de la sesión en pantalla (qué ejercicios están plegados a mano)
let abiertos = new Set();   // completos pero desplegados a mano
let cerrados = new Set();   // incompletos pero plegados a mano
let relojIntervalo = null;

// Estado de Historial y Progreso
const estHist = { mes: null, dia: null };
const estProg = { ejercicio: null, metrica: 'peso', rango: 'todo' };

// Orden global de los ejercicios (para ordenar listas)
const ORDEN_EJ = new Map();
ORDEN_SESIONES.forEach((s) => RUTINA[s].forEach((ej) => ORDEN_EJ.set(ej.nombre, ORDEN_EJ.size)));

/* ===================== Utilidades de interfaz ===================== */

function aviso(texto, tipo = 'info', segundos = 5) {
  const el = $('#toast');
  el.textContent = texto;
  el.className = 'toast ' + tipo;
  el.hidden = false;
  clearTimeout(aviso._t);
  if (segundos) aviso._t = setTimeout(() => { el.hidden = true; }, segundos * 1000);
}

function hace(isoFechaHora) {
  if (!isoFechaHora) return 'nunca';
  const min = Math.round((Date.now() - new Date(isoFechaHora).getTime()) / 60000);
  if (min < 1) return 'hace un momento';
  if (min < 60) return `hace ${min} min`;
  if (min < 24 * 60) return `hace ${Math.round(min / 60)} h`;
  return fechaCorta(aISO(new Date(isoFechaHora)));
}

function duracionTxt(ms) {
  const min = Math.max(0, Math.floor(ms / 60000));
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
}

function reloj(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return (h ? `${h}:${String(m).padStart(2, '0')}` : `${m}`) + `:${String(x).padStart(2, '0')}`;
}

/* ===================== Sesión en curso: datos ===================== */

/** "62,5" → 62.5 · "" → null · inválido → NaN */
function leerPeso(texto) {
  const t = String(texto ?? '').trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 && n <= 1000 ? n : NaN;
}
/** "8" → 8 · "" → null · inválido → NaN */
function leerReps(texto) {
  const t = String(texto ?? '').trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isInteger(n) && n >= 0 && n <= 100 ? n : NaN;
}

function crearSesion(nombreSesion) {
  const datos = {};
  for (const ej of RUTINA[nombreSesion]) {
    datos[ej.nombre] = {
      series: Array.from({ length: ej.series }, () => ({ peso: '', reps: '', hecha: false })),
      nota: ''
    };
  }
  return { id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2),
           sesion: nombreSesion, fecha: hoy(), inicio: new Date().toISOString(), datos };
}

function serieHecha(s) {
  const r = leerReps(s.reps);
  return Boolean(s.hecha) && r !== null && !Number.isNaN(r) && !Number.isNaN(leerPeso(s.peso));
}
function ejercicioCompleto(d) { return d.series.every(serieHecha); }

function progresoSesion(actual) {
  let hechas = 0, total = 0;
  for (const ej of RUTINA[actual.sesion]) {
    for (const s of actual.datos[ej.nombre].series) { total++; if (serieHecha(s)) hechas++; }
  }
  return { hechas, total };
}

/** Valores de referencia para una serie: última vez (misma serie) o la serie anterior de hoy */
function referencia(nombre, iS, d) {
  const u = ultimaVez(nombre);
  const ref = u && u.series.find((x) => x.serie === iS + 1);
  if (ref) return { peso: ref.peso, reps: ref.reps };
  for (let k = iS - 1; k >= 0; k--) {
    const p = leerPeso(d.series[k].peso), r = leerReps(d.series[k].reps);
    if (r !== null && !Number.isNaN(r)) return { peso: Number.isNaN(p) || p === null ? 0 : p, reps: r };
  }
  return null;
}

function esRecord(nombre, s) {
  if (!serieHecha(s)) return false;
  const p = leerPeso(s.peso) ?? 0, r = leerReps(s.reps);
  if (!r) return false;
  const rec = indice().records.get(nombre);
  if (!rec || rec.peso <= 0) return false;   // la primera vez no cuenta como récord
  return p > rec.peso || rm1(p, r) > rec.rm1;
}

/**
 * Convierte la sesión en lo que se envía a la hoja.
 * Se envían las series con reps; si el peso está vacío se envía 0.
 */
function analizarSesion(actual) {
  const ejercicios = [];
  const problemas = [];
  const avisos = [];
  let volumen = 0, records = 0;

  for (const ej of RUTINA[actual.sesion]) {
    const d = actual.datos[ej.nombre];
    const series = [];
    d.series.forEach((s, i) => {
      const peso = leerPeso(s.peso);
      const reps = leerReps(s.reps);
      if (Number.isNaN(peso)) problemas.push(`${ej.nombre}, serie ${i + 1}: peso no válido`);
      if (Number.isNaN(reps)) problemas.push(`${ej.nombre}, serie ${i + 1}: reps no válidas`);
      if (Number.isNaN(peso) || Number.isNaN(reps)) return;
      if (reps === null) {
        if (peso !== null) avisos.push(`${ej.nombre}, serie ${i + 1}: tiene peso pero no reps (no se enviará)`);
        return;
      }
      series.push({ serie: i + 1, peso: peso ?? 0, reps });
      volumen += (peso ?? 0) * reps;
      if (esRecord(ej.nombre, { ...s, hecha: true })) records++;
    });
    const nota = d.nota.trim();
    if (series.length) ejercicios.push({ nombre: ej.nombre, nota, series });
    else if (nota) avisos.push(`${ej.nombre}: tiene nota pero ninguna serie (la nota no se enviará)`);
  }
  const sesion = { id: actual.id, sesion: actual.sesion, fecha: actual.fecha, ejercicios };
  const totalSeries = ejercicios.reduce((a, e) => a + e.series.length, 0);
  return { sesion, problemas, avisos, totalSeries, volumen, records };
}

function terminarSesion() {
  const actual = leer(K.actual, null);
  if (!actual) return;
  const { sesion } = analizarSesion(actual);
  const pendientes = leer(K.pendientes, []);
  pendientes.push(sesion);
  guardar(K.pendientes, pendientes);
  localStorage.removeItem(K.actual);
  Descanso.parar();
  Pantalla.desactivar();
  abiertos = new Set(); cerrados = new Set();
  invalidarIndice();
}

/* ===================== Navegación ===================== */

function navegar(vista) {
  if (TABS.includes(vista) && TABS.includes(vistaActual)) {
    // Entre pestañas: el botón atrás de Android siempre vuelve a Inicio.
    if (vista === 'inicio' || vistaActual !== 'inicio') history.replaceState({ vista }, '');
    else history.pushState({ vista }, '');
  } else {
    history.pushState({ vista }, '');
  }
  render(vista);
}

function render(vista) {
  vistaActual = vista;
  const enSesion = vista === 'sesion' || vista === 'resumen';
  document.body.classList.toggle('en-sesion', enSesion);
  $('#nav').hidden = enSesion;
  $('#dock').hidden = vista !== 'sesion';
  $('#progreso-sesion').hidden = vista !== 'sesion';
  document.querySelectorAll('#nav button').forEach((b) => b.classList.toggle('activo', b.dataset.tab === vista));
  if (vista === 'sesion') Pantalla.activar(); else Pantalla.desactivar();
  clearInterval(relojIntervalo);
  window.scrollTo(0, 0);
  ({ inicio: vistaInicio, historial: vistaHistorial, progreso: vistaProgreso, ajustes: vistaAjustes,
     sesion: vistaSesion, resumen: vistaResumen }[vista] || vistaInicio)();
}

/** Re-pinta la vista actual conservando el scroll */
function repintar() {
  const y = window.scrollY;
  ({ inicio: vistaInicio, historial: vistaHistorial, progreso: vistaProgreso, ajustes: vistaAjustes,
     sesion: vistaSesion, resumen: vistaResumen }[vistaActual] || vistaInicio)();
  window.scrollTo(0, y);
}

/** Llamado por red.js cuando cambian los datos (envío o descarga) */
function alCambiarDatos() {
  if (TABS.includes(vistaActual)) repintar();
}

function barra(html) { $('#barra').innerHTML = html; }

const BTN_ATRAS = `<button class="icono" data-accion="atras" aria-label="Volver"><svg viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg></button>`;
const BTN_REFRESCAR = `<button class="icono" data-accion="actualizar" aria-label="Actualizar datos"><svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-2.6-6.4M21 4v5h-5"/></svg></button>`;

/* ===================== Vista: Inicio ===================== */

function minutosEstimados(nombre) {
  const seg = RUTINA[nombre].reduce((a, ej) => a + ej.series * (descansoSegundos(ej.descanso) + 40), 0);
  return Math.round(seg / 60 / 5) * 5;
}

function vistaInicio() {
  barra(`<div class="marca"><img src="icons/icon-192.png" alt=""><div class="marca-texto"><b>EDUX</b><span>TRAINING</span></div></div>${BTN_REFRESCAR}`);
  const actual = leer(K.actual, null);
  const pendientes = leer(K.pendientes, []);
  const idx = indice();
  const est = estadisticas();
  const h = new Date().getHours();
  const saludo = h < 6 ? 'Buenas noches' : h < 13 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches';
  const fechaTxt = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  const fecha = fechaTxt.charAt(0).toUpperCase() + fechaTxt.slice(1);
  const sig = siguienteSesion();

  let html = `<div class="saludo"><h2>${saludo}</h2><p>${esc(fecha)}</p></div>`;

  if (!configCompleta()) {
    html += `<div class="tarjeta alerta">Falta conectar la app con tu hoja. <button class="enlace" data-tab="ajustes">Ir a Ajustes</button></div>`;
  }

  // Hero: sesión en curso o siguiente entreno
  if (actual) {
    const { hechas, total } = progresoSesion(actual);
    html += `
      <section class="hero">
        <div class="hero-etiqueta">SESIÓN EN CURSO</div>
        <div class="hero-nombre">${esc(actual.sesion)}</div>
        <div class="hero-grupos">${esc(INFO_SESION[actual.sesion].grupos)}</div>
        <div class="hero-datos">
          <div><b>${hechas}/${total}</b>series</div>
          <div><b>${duracionTxt(Date.now() - new Date(actual.inicio).getTime())}</b>en marcha</div>
        </div>
        <div class="fila-botones">
          <button class="btn blanco" data-accion="continuar">Continuar</button>
          <button class="btn fantasma" data-accion="descartar">Descartar</button>
        </div>
      </section>`;
  } else {
    const ejs = RUTINA[sig];
    html += `
      <section class="hero">
        <div class="hero-etiqueta">SIGUIENTE ENTRENO</div>
        <div class="hero-nombre">${esc(sig)}</div>
        <div class="hero-grupos">${esc(INFO_SESION[sig].grupos)}</div>
        <div class="hero-datos">
          <div><b>${ejs.length}</b>ejercicios</div>
          <div><b>${ejs.reduce((a, e) => a + e.series, 0)}</b>series</div>
          <div><b>≈ ${minutosEstimados(sig)}</b>min</div>
        </div>
        <div class="fila-botones"><button class="btn blanco ancho" data-accion="empezar" data-sesion="${esc(sig)}">Empezar entreno</button></div>
      </section>`;
  }

  // Pendientes
  if (pendientes.length) {
    html += `<div class="tarjeta atencion" style="margin-top:12px"><strong>Pendientes de enviar (${pendientes.length})</strong><ul class="lista-pendientes">`;
    for (const p of pendientes) {
      const n = p.ejercicios.reduce((a, e) => a + e.series.length, 0);
      html += `<li><span>${esc(fechaMedia(p.fecha))} · ${esc(p.sesion)} · ${n} series</span>
        <button class="icono" data-accion="borrar-pendiente" data-id="${esc(p.id)}" aria-label="Descartar">✕</button></li>`;
    }
    html += `</ul><button class="btn primario ancho" style="margin-top:10px" data-accion="enviar">Enviar ahora</button></div>`;
  }

  // Estadísticas
  html += `<div class="seccion-titulo">Tu actividad</div>
    <div class="stats">
      <div class="stat"><div class="stat-etiqueta">Esta semana</div><div class="stat-valor">${est.semana}<small>${est.semana === 1 ? 'sesión' : 'sesiones'}</small></div><div class="stat-pie">de lunes a domingo</div></div>
      <div class="stat"><div class="stat-etiqueta">Racha</div><div class="stat-valor">${est.racha}<small>${est.racha === 1 ? 'semana' : 'semanas'}</small></div><div class="stat-pie">seguidas entrenando</div></div>
      <div class="stat"><div class="stat-etiqueta">Este mes</div><div class="stat-valor">${est.esteMes}<small>${est.esteMes === 1 ? 'sesión' : 'sesiones'}</small></div><div class="stat-pie">${est.total} en total</div></div>
      <div class="stat"><div class="stat-etiqueta">Volumen semanal</div><div class="stat-valor">${volumenTxt(est.volumenSemana).replace(/ (kg|t)$/, '<small>$1</small>')}</div><div class="stat-pie">kg × reps</div></div>
    </div>`;

  // Sesiones
  html += `<div class="seccion-titulo">Sesiones</div><div class="sesiones">`;
  for (const nombre of ORDEN_SESIONES) {
    const ejs = RUTINA[nombre];
    const u = idx.ultimaSesion[nombre];
    html += `
      <button class="tarjeta-sesion ${!actual && nombre === sig ? 'siguiente' : ''}" data-accion="empezar" data-sesion="${esc(nombre)}">
        <span class="letra">${INFO_SESION[nombre].letra}</span>
        <span class="nombre">${esc(nombre)}</span>
        <span class="grupos">${esc(INFO_SESION[nombre].grupos)}</span>
        <span class="pie">${ejs.length} ejercicios · ${ejs.reduce((a, e) => a + e.series, 0)} series<br>${u ? 'Última: ' + haceDias(u) : 'Sin registros'}</span>
      </button>`;
  }
  html += '</div>';

  // Estado de sincronización
  const actualizado = idx.actualizado;
  const reciente = actualizado && Date.now() - new Date(actualizado).getTime() < 24 * 3600000;
  html += `<div class="sync"><span class="punto ${reciente ? '' : 'viejo'}"></span>${actualizando ? 'Actualizando datos…' : 'Datos de la hoja: ' + hace(actualizado)}</div>`;

  $('#vista').innerHTML = html;
}

/* ===================== Vista: Sesión ===================== */

function vistaSesion() {
  const actual = leer(K.actual, null);
  if (!actual) return render('inicio');
  barra(`${BTN_ATRAS}<div class="titulo-sesion"><b>${esc(actual.sesion)}</b><span id="reloj"></span></div>`);

  const rutina = RUTINA[actual.sesion];
  const idxActual = rutina.findIndex((ej) => !ejercicioCompleto(actual.datos[ej.nombre]));

  let html = `
    <div class="fecha-sesion">
      <span>${esc(INFO_SESION[actual.sesion].grupos)}</span>
      <input type="date" id="fecha-sesion" value="${esc(actual.fecha)}" max="${hoy()}" aria-label="Fecha de la sesión">
    </div>`;
  rutina.forEach((ej, i) => { html += tarjetaEjercicio(actual, ej, i, idxActual); });
  $('#vista').innerHTML = html;

  actualizarCabeceraSesion();
  relojIntervalo = setInterval(actualizarCabeceraSesion, 1000);
}

function tarjetaEjercicio(actual, ej, i, idxActual) {
  const d = actual.datos[ej.nombre];
  const completo = ejercicioCompleto(d);
  const plegado = (completo && !abiertos.has(i)) || cerrados.has(i);
  const u = ultimaVez(ej.nombre);
  const hechas = d.series.filter(serieHecha);
  const resumen = completo
    ? seriesTxt(hechas.map((s) => ({ peso: leerPeso(s.peso) ?? 0, reps: leerReps(s.reps) })))
    : `${hechas.length}/${ej.series} series hechas`;
  const clases = ['ejercicio', i === idxActual ? 'actual' : '', completo ? 'completo' : '', plegado ? 'plegado' : ''].join(' ');

  let html = `
    <section class="${clases}" data-ej="${i}" id="ej-${i}">
      <button class="ej-cabecera" data-accion="plegar">
        <span class="ej-num">${completo ? '✓' : i + 1}</span>
        <span class="ej-titulo">
          <b>${esc(ej.nombre)}</b>
          <span>${ej.series} series · descanso ${esc(ej.descanso)}</span>
          <span class="ej-resumen">${esc(resumen)}</span>
        </span>
        <span class="ej-chevron">⌄</span>
      </button>
      <div class="ej-cuerpo">
        <div class="ultimo">${u
          ? `<b>Última · ${esc(fechaCorta(u.fecha))}</b><span>${esc(seriesTxt(u.series))}</span>`
          : '<b>Primera vez</b><span>Sin registros anteriores</span>'}</div>
        <div class="serie-cab"><span>kg</span><span>reps</span><span></span></div>`;

  d.series.forEach((s, iS) => {
    const ref = referenciaUltima(u, iS);
    html += `
        <div class="serie ${claseSerie(ej.nombre, s)}" data-serie="${iS}">
          <div class="serie-info"><span><b>Serie ${iS + 1}</b> · objetivo ${esc(ej.objetivos[iS])} reps</span><span class="pr">🏆 Récord</span></div>
          <div class="serie-fila">
            <div class="paso">
              <button data-accion="menos" data-campo="peso" aria-label="Menos peso">−</button>
              <input class="num" data-campo="peso" inputmode="decimal" enterkeyhint="next" autocomplete="off"
                     value="${esc(s.peso)}" placeholder="${ref ? esc(num(ref.peso)) : 'kg'}" aria-label="Peso serie ${iS + 1}">
              <button data-accion="mas" data-campo="peso" aria-label="Más peso">+</button>
            </div>
            <div class="paso">
              <button data-accion="menos" data-campo="reps" aria-label="Menos reps">−</button>
              <input class="num" data-campo="reps" inputmode="numeric" enterkeyhint="next" autocomplete="off"
                     value="${esc(s.reps)}" placeholder="${ref ? esc(ref.reps) : 'reps'}" aria-label="Reps serie ${iS + 1}">
              <button data-accion="mas" data-campo="reps" aria-label="Más reps">+</button>
            </div>
            <button class="check" data-accion="check" aria-label="Marcar serie ${iS + 1} como hecha">✓</button>
          </div>
        </div>`;
  });

  html += `
        <textarea class="nota" data-campo="nota" rows="1" placeholder="Nota del ejercicio (opcional)">${esc(d.nota)}</textarea>
      </div>
    </section>`;
  return html;
}

function referenciaUltima(u, iS) {
  const ref = u && u.series.find((x) => x.serie === iS + 1);
  return ref || null;
}

function claseSerie(nombre, s) {
  const p = leerPeso(s.peso), r = leerReps(s.reps);
  const cls = [];
  if (Number.isNaN(p) || Number.isNaN(r)) cls.push('mal');
  else if (serieHecha(s)) cls.push('hecha');
  if (esRecord(nombre, s)) cls.push('es-pr');
  return cls.join(' ');
}

function actualizarCabeceraSesion() {
  const actual = leer(K.actual, null);
  if (!actual || vistaActual !== 'sesion') return;
  const { hechas, total } = progresoSesion(actual);
  const el = $('#reloj');
  if (el) el.textContent = `${reloj(Date.now() - new Date(actual.inicio).getTime())} · ${hechas}/${total} series`;
  $('#progreso-sesion .relleno').style.width = `${total ? (hechas / total) * 100 : 0}%`;
}

/** Contexto (sesión, ejercicio, serie) a partir de un elemento dentro de una tarjeta */
function contexto(el) {
  const actual = leer(K.actual, null);
  const sec = el.closest('.ejercicio');
  if (!actual || !sec) return null;
  const iEj = Number(sec.dataset.ej);
  const ej = RUTINA[actual.sesion][iEj];
  const d = actual.datos[ej.nombre];
  const fila = el.closest('.serie');
  const iS = fila ? Number(fila.dataset.serie) : null;
  return { actual, iEj, ej, d, fila, iS, s: iS !== null ? d.series[iS] : null };
}

function pasoSerie(el, signo) {
  const c = contexto(el);
  if (!c) return;
  const campo = el.dataset.campo;
  const paso = campo === 'peso' ? 2.5 : 1;
  const leerV = campo === 'peso' ? leerPeso : leerReps;
  let v = leerV(c.s[campo]);
  if (v === null || Number.isNaN(v)) {
    const ref = referencia(c.ej.nombre, c.iS, c.d);
    const base = ref ? ref[campo] : 0;
    v = base > 0 ? base : Math.max(0, signo * paso);
  } else {
    v = Math.max(0, Math.round((v + signo * paso) * 100) / 100);
  }
  c.s[campo] = campo === 'peso' ? num(v) : String(v);
  guardar(K.actual, c.actual);
  c.fila.querySelector(`input[data-campo="${campo}"]`).value = c.s[campo];
  c.fila.className = 'serie ' + claseSerie(c.ej.nombre, c.s);
}

function marcarSerie(el) {
  const c = contexto(el);
  if (!c) return;
  const s = c.s;
  if (s.hecha) {
    s.hecha = false;
  } else {
    if (leerReps(s.reps) === null) {
      // Serie vacía: se rellena con la referencia (última vez o serie anterior)
      const ref = referencia(c.ej.nombre, c.iS, c.d);
      if (!ref) {
        c.fila.classList.remove('sacudir'); void c.fila.offsetWidth; c.fila.classList.add('sacudir');
        c.fila.querySelector('input[data-campo="reps"]').focus();
        return aviso('Apunta las repeticiones de la serie', 'atencion', 3);
      }
      if (leerPeso(s.peso) === null) s.peso = num(ref.peso);
      s.reps = String(ref.reps);
    }
    if (Number.isNaN(leerPeso(s.peso)) || Number.isNaN(leerReps(s.reps))) {
      c.fila.classList.remove('sacudir'); void c.fila.offsetWidth; c.fila.classList.add('sacudir');
      return aviso('Revisa el peso o las reps de la serie', 'error', 3);
    }
    s.hecha = true;
    if (navigator.vibrate) navigator.vibrate(30);
    if (esRecord(c.ej.nombre, s)) aviso(`🏆 ¡Récord en ${c.ej.nombre}!`, 'ok', 4);
  }
  guardar(K.actual, c.actual);

  const { hechas, total } = progresoSesion(c.actual);
  if (s.hecha && hechas < total) Descanso.iniciar(descansoSegundos(c.ej.descanso));
  if (s.hecha && hechas === total) { Descanso.parar(); aviso('💪 ¡Sesión completa! Pulsa "Terminar sesión"', 'ok', 6); }

  if (s.hecha && ejercicioCompleto(c.d)) {
    // Ejercicio terminado: se pliega y se pasa al siguiente sin terminar
    abiertos.delete(c.iEj);
    cerrados.delete(c.iEj);
    repintar();
    const rutina = RUTINA[c.actual.sesion];
    const sig = rutina.findIndex((e) => !ejercicioCompleto(c.actual.datos[e.nombre]));
    if (sig >= 0) { cerrados.delete(sig); const t = $(`#ej-${sig}`); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  } else {
    repintar();
  }
}

function plegar(el) {
  const sec = el.closest('.ejercicio');
  const i = Number(sec.dataset.ej);
  const plegado = sec.classList.contains('plegado');
  if (sec.classList.contains('completo')) {
    if (plegado) abiertos.add(i); else abiertos.delete(i);
  } else {
    if (plegado) cerrados.delete(i); else cerrados.add(i);
  }
  sec.classList.toggle('plegado');
}

/* ===================== Vista: Resumen ===================== */

function vistaResumen() {
  const actual = leer(K.actual, null);
  if (!actual) return render('inicio');
  barra(`${BTN_ATRAS}<h1>Resumen</h1>`);
  const { sesion, problemas, avisos, totalSeries, volumen, records } = analizarSesion(actual);

  let html = `<div class="tarjeta">
    <div class="hero-etiqueta" style="color:var(--morado-claro)">${esc(fechaMedia(actual.fecha)).toUpperCase()}</div>
    <div style="font-size:1.6rem;font-weight:900;text-transform:uppercase;margin-top:2px">${esc(actual.sesion)}</div>
    <div class="resumen-cifras">
      <div><b>${totalSeries}</b><span>series</span></div>
      <div><b>${volumenTxt(volumen)}</b><span>volumen</span></div>
      <div><b>${duracionTxt(Date.now() - new Date(actual.inicio).getTime())}</b><span>duración</span></div>
    </div>
    ${records ? `<div style="margin-top:10px;color:var(--aviso);font-weight:700">🏆 ${records} ${records === 1 ? 'récord personal' : 'récords personales'}</div>` : ''}`;
  if (sesion.ejercicios.length) {
    html += '<ul class="lista-resumen" style="margin-top:14px">';
    for (const ej of sesion.ejercicios) {
      html += `<li><strong>${esc(ej.nombre)}</strong><div class="series-txt">${esc(ej.series.map((s) => `${num(s.peso)} kg × ${s.reps}`).join(' · '))}</div>`;
      if (ej.nota) html += `<em class="tenue">${esc(ej.nota)}</em>`;
      html += '</li>';
    }
    html += '</ul>';
  }
  html += '</div>';

  if (problemas.length) html += `<div class="tarjeta alerta"><strong>Corrige antes de terminar:</strong><ul>${problemas.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>`;
  if (avisos.length) html += `<div class="tarjeta atencion"><ul style="margin:0">${avisos.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>`;
  if (!totalSeries) html += `<div class="tarjeta alerta">No hay ninguna serie con repeticiones.</div>`;

  const puede = !problemas.length && totalSeries > 0;
  html += `
    <div class="fila-botones">
      <button class="btn" data-accion="atras">Seguir editando</button>
      <button class="btn primario" data-accion="confirmar" ${puede ? '' : 'disabled'}>Guardar en la hoja</button>
    </div>`;
  $('#vista').innerHTML = html;
}

/* ===================== Vista: Historial ===================== */

function vistaHistorial() {
  barra(`<h1>Historial</h1>${BTN_REFRESCAR}`);
  const idx = indice();
  if (!estHist.mes) estHist.mes = hoy().slice(0, 7);
  const [y, m] = estHist.mes.split('-').map(Number);
  const primero = new Date(y, m - 1, 1);
  const hueco = (primero.getDay() + 6) % 7;
  const diasMes = new Date(y, m, 0).getDate();

  // Día seleccionado por defecto: hoy si entrenaste, si no el último entreno del mes
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
      <button class="icono" data-accion="mes" data-delta="-1" aria-label="Mes anterior"><svg viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg></button>
      <h3>${MESES[m - 1]} ${y}</h3>
      <button class="icono" data-accion="mes" data-delta="1" aria-label="Mes siguiente"><svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg></button>
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
  let sesionesMes = 0, seriesMes = 0, volMes = 0;
  for (const iso of diasConEntreno) {
    for (const s of idx.dias.get(iso).sesiones.values()) {
      sesionesMes++;
      for (const ej of s.ejercicios.values()) for (const x of ej.series) { seriesMes++; volMes += x.peso * x.reps; }
    }
  }
  html += `<div class="resumen-mes">
    <div><b>${sesionesMes}</b><span>${sesionesMes === 1 ? 'sesión' : 'sesiones'}</span></div>
    <div><b>${seriesMes}</b><span>series</span></div>
    <div><b>${volumenTxt(volMes)}</b><span>volumen</span></div>
  </div>`;

  // Detalle del día
  html += `<div class="seccion-titulo">${estHist.dia ? esc(fechaMedia(estHist.dia)) : 'Detalle'}</div>`;
  const dia = estHist.dia && idx.dias.get(estHist.dia);
  if (!estHist.dia) {
    html += `<div class="tarjeta vacio">No hay entrenos este mes.</div>`;
  } else if (!dia) {
    html += `<div class="tarjeta vacio">Sin entreno este día.</div>`;
  } else {
    for (const s of dia.sesiones.values()) {
      const ejs = [...s.ejercicios.values()].sort((a, b) => (ORDEN_EJ.get(a.nombre) ?? 999) - (ORDEN_EJ.get(b.nombre) ?? 999));
      html += `<div class="tarjeta dia-sesion">
        <h4><span class="letra" style="margin:0;width:28px;height:28px;font-size:.85rem">${esc((INFO_SESION[s.sesion] || { letra: '•' }).letra)}</span>${esc(s.sesion)}
          ${s.pendiente ? '<span class="etiqueta-pend">pendiente</span>' : ''}</h4>
        <div class="tenue" style="margin-bottom:6px">${ejs.length} ejercicios · ${ejs.reduce((a, e) => a + e.series.length, 0)} series</div>`;
      for (const ej of ejs) {
        html += `<div class="dia-ej"><b>${esc(ej.nombre)}</b><div class="series-txt">${esc(seriesTxt(ej.series))}</div>${ej.nota ? `<em>${esc(ej.nota)}</em>` : ''}</div>`;
      }
      html += '</div>';
    }
  }
  $('#vista').innerHTML = html;
}

/* ===================== Vista: Progreso ===================== */

const METRICAS = {
  peso:    { nombre: 'Peso máx.', titulo: 'Peso máximo de cada día', valor: (d) => d.pesoMax, formato: (v) => `${num(v)} kg` },
  rm1:     { nombre: '1RM est.', titulo: '1RM estimado de cada día', valor: (d) => d.rm1, formato: (v) => `${num(v, 1)} kg` },
  volumen: { nombre: 'Volumen', titulo: 'Volumen de cada día (kg × reps)', valor: (d) => d.volumen, formato: (v) => volumenTxt(v) }
};
const RANGOS = { '1m': 1, '3m': 3, '6m': 6, todo: null };

function vistaProgreso() {
  barra(`<h1>Progreso</h1>${BTN_REFRESCAR}`);
  const idx = indice();
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
    html += `<div class="tarjeta vacio" style="margin-top:12px">Aún no hay registros de este ejercicio.<br>Aparecerán aquí cuando guardes una sesión en la hoja.</div>`;
    $('#vista').innerHTML = html;
    return;
  }

  const ultimo = lista[lista.length - 1];
  html += `<div class="records">
    <div class="stat"><div class="stat-etiqueta">Mejor peso</div><div class="stat-valor">${num(rec.peso)}<small>kg</small></div><div class="stat-pie">${esc(fechaCorta(rec.fechaPeso))}</div></div>
    <div class="stat"><div class="stat-etiqueta">Mejor 1RM estimado</div><div class="stat-valor">${num(rec.rm1, 1)}<small>kg</small></div><div class="stat-pie">${esc(fechaCorta(rec.fechaRm1))}</div></div>
    <div class="stat"><div class="stat-etiqueta">Días registrados</div><div class="stat-valor">${lista.length}</div><div class="stat-pie">desde ${esc(fechaCorta(lista[0].fecha))}</div></div>
    <div class="stat"><div class="stat-etiqueta">Última vez</div><div class="stat-valor" style="font-size:1.25rem">${esc(seriesTxt(ultimo.series.slice(0, 2)))}${ultimo.series.length > 2 ? '…' : ''}</div><div class="stat-pie">${esc(haceDias(ultimo.fecha))}</div></div>
  </div>`;

  // Filtro por periodo
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

  $('#vista').innerHTML = html;
  const cont = $('#grafico');
  if (cont) {
    dibujarGrafico(cont, puntos.map((d) => ({ fecha: d.fecha, valor: met.valor(d), detalle: seriesTxt(d.series), pendiente: d.pendiente })),
      { formato: met.formato });
  }
}

/* ===================== Vista: Ajustes ===================== */

function vistaAjustes() {
  barra('<h1>Ajustes</h1>');
  const c = leer(K.config, {});
  const cache = leer(K.cache, { filas: [] });
  const pendientes = leer(K.pendientes, []);
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

/* ===================== Eventos ===================== */

document.addEventListener('click', async (e) => {
  const tab = e.target.closest('[data-tab]');
  if (tab) return navegar(tab.dataset.tab);

  const b = e.target.closest('[data-accion]');
  if (!b) return;
  const accion = b.dataset.accion;

  switch (accion) {
    case 'atras': history.back(); break;

    case 'empezar': {
      const nombre = b.dataset.sesion;
      const actual = leer(K.actual, null);
      if (actual && actual.sesion !== nombre &&
          !confirm(`Tienes una sesión de ${actual.sesion} en curso. ¿Descartarla y empezar ${nombre}?`)) return;
      if (!actual || actual.sesion !== nombre) {
        guardar(K.actual, crearSesion(nombre));
        abiertos = new Set(); cerrados = new Set();
        Descanso.parar();
      }
      Descanso.prepararAudio();
      navegar('sesion');
      break;
    }
    case 'continuar': Descanso.prepararAudio(); navegar('sesion'); break;
    case 'descartar':
      if (confirm('¿Descartar la sesión en curso? Se perderá lo apuntado.')) {
        localStorage.removeItem(K.actual);
        Descanso.parar();
        repintar();
      }
      break;

    case 'plegar': plegar(b); break;
    case 'mas': pasoSerie(b, +1); break;
    case 'menos': pasoSerie(b, -1); break;
    case 'check': marcarSerie(b); break;
    case 'descanso-mas': Descanso.ajustar(15); break;
    case 'descanso-menos': Descanso.ajustar(-15); break;
    case 'descanso-saltar': Descanso.parar(); break;

    case 'terminar': navegar('resumen'); break;
    case 'confirmar':
      terminarSesion();
      history.go(-2);   // vuelve a la pantalla anterior a la sesión
      enviarPendientes();
      break;

    case 'enviar': enviarPendientes(); break;
    case 'borrar-pendiente':
      if (confirm('¿Descartar esta sesión pendiente? No se guardará en la hoja.')) {
        guardar(K.pendientes, leer(K.pendientes, []).filter((p) => p.id !== b.dataset.id));
        invalidarIndice();
        repintar();
      }
      break;

    case 'actualizar':
    case 'actualizar-forzado':
      await actualizarDatos({ silencioso: false });
      break;

    case 'mes': {
      const [y, m] = estHist.mes.split('-').map(Number);
      const d = new Date(y, m - 1 + Number(b.dataset.delta), 1);
      estHist.mes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      estHist.dia = null;
      repintar();
      break;
    }
    case 'dia': estHist.dia = b.dataset.fecha; repintar(); break;

    case 'metrica': estProg.metrica = b.dataset.valor; repintar(); break;
    case 'rango': estProg.rango = b.dataset.valor; repintar(); break;

    case 'guardar-config':
      guardar(K.config, { url: $('#cfg-url').value.trim(), clave: $('#cfg-clave').value.trim() });
      aviso('Ajustes guardados', 'ok', 3);
      break;
    case 'probar': {
      guardar(K.config, { url: $('#cfg-url').value.trim(), clave: $('#cfg-clave').value.trim() });
      if (!configCompleta()) return aviso('Rellena la URL y la clave', 'error');
      aviso('Probando…', 'info', 0);
      const r = await llamarScript({ tipo: 'ping' });
      aviso(r.ok ? '✓ ' + r.mensaje : '✗ ' + r.error, r.ok ? 'ok' : 'error', 8);
      if (r.ok) actualizarDatos();
      break;
    }
  }
});

// Guardado automático en cada pulsación
document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.id === 'fecha-sesion') {
    const actual = leer(K.actual, null);
    if (actual && el.value) { actual.fecha = el.value; guardar(K.actual, actual); }
    return;
  }
  const campo = el.dataset.campo;
  if (!campo) return;
  const c = contexto(el);
  if (!c) return;
  if (campo === 'nota') {
    c.d.nota = el.value;
  } else {
    c.s[campo] = el.value;
    if (leerReps(c.s.reps) === null) c.s.hecha = false;
    c.fila.className = 'serie ' + claseSerie(c.ej.nombre, c.s);
  }
  guardar(K.actual, c.actual);
  if (campo !== 'nota') actualizarCabeceraSesion();
});

document.addEventListener('change', (e) => {
  if (e.target.id === 'sel-ejercicio') {
    estProg.ejercicio = e.target.value;
    guardar(K.ejercicioProgreso, estProg.ejercicio);
    repintar();
  }
});

// Intro en un campo numérico salta al siguiente
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || !e.target.classList.contains('num')) return;
  e.preventDefault();
  const campos = [...document.querySelectorAll('.ejercicio:not(.plegado) input.num')];
  const sig = campos[campos.indexOf(e.target) + 1];
  if (sig) sig.focus(); else e.target.blur();
});

window.addEventListener('popstate', (e) => render((e.state && e.state.vista) || 'inicio'));

window.addEventListener('online', async () => {
  const n = await enviarPendientes({ silencioso: true });
  if (!n) actualizarDatos();
});

let anchoPrevio = window.innerWidth;
window.addEventListener('resize', () => {
  if (vistaActual === 'progreso' && Math.abs(window.innerWidth - anchoPrevio) > 20) { anchoPrevio = window.innerWidth; repintar(); }
});

// Al volver a la app tras un rato, refrescar datos de la hoja
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  const cache = leer(K.cache, {});
  if (!cache.actualizado || Date.now() - new Date(cache.actualizado).getTime() > 10 * 60000) actualizarDatos();
});

/* ===================== Arranque ===================== */

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

Descanso.restaurar();
history.replaceState({ vista: 'inicio' }, '');
if (leer(K.actual, null)) {
  // Si Android cerró la app en mitad del entreno, se vuelve directo a la sesión.
  history.pushState({ vista: 'sesion' }, '');
  render('sesion');
} else {
  render('inicio');
}
(async () => {
  const n = await enviarPendientes({ silencioso: true });
  if (!n) actualizarDatos();
})();
