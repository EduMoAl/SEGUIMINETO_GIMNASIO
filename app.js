'use strict';

/* =====================================================================
 * EDUX TRAINING — base de la interfaz: navegación, Inicio, eventos y arranque.
 *   Pestañas: inicio · historial · progreso · perfil · ajustes
 *   Pantallas: sesion · resumen (sesion.js) · records (vistas.js)
 * ===================================================================== */

const VERSION_APP = 'v7';
const $ = (sel, raiz = document) => raiz.querySelector(sel);

let vistaActual = 'inicio';
const TABS = ['inicio', 'historial', 'progreso', 'perfil', 'ajustes'];
let relojIntervalo = null;

// Orden global de los ejercicios (para ordenar listas)
const ORDEN_EJ = ORDEN_EJ_DATOS;

/* ===================== Utilidades de interfaz ===================== */

const ICONO_AVISO = { ok: 'check', error: 'alerta', atencion: 'alerta', info: 'info', record: 'trofeo' };

/**
 * Aviso temporal abajo. Con `accion` muestra un botón (p. ej. Deshacer):
 *   aviso('Sesión descartada', 'info', 8, { texto: 'Deshacer', fn: () => … })
 */
function aviso(texto, tipo = 'info', segundos = 5, accion = null) {
  const el = $('#toast');
  const limpio = String(texto).replace(/^(✓|✗|🏆|💪)\s*/u, '');
  el.innerHTML = ico(ICONO_AVISO[tipo] || 'info') + `<span>${esc(limpio)}</span>` +
    (accion ? `<button class="toast-accion" data-accion="toast-accion">${esc(accion.texto)}</button>` : '');
  el.className = 'toast ' + tipo;
  el.hidden = false;
  aviso._accion = accion ? accion.fn : null;
  clearTimeout(aviso._t);
  if (segundos) aviso._t = setTimeout(() => { el.hidden = true; aviso._accion = null; }, segundos * 1000);
}

function ocultarAviso() {
  $('#toast').hidden = true;
  aviso._accion = null;
}

/** Aviso con "Deshacer": guarda el estado anterior y lo restaura si se pulsa */
function avisoDeshacer(texto, restaurar) {
  aviso(texto, 'info', 8, {
    texto: 'Deshacer',
    fn: () => { restaurar(); invalidarIndice(); actualizarEstadoRed(); aviso('Deshecho', 'ok', 2); }
  });
}

/* ---------- Estado de conexión y sesiones sin enviar ---------- */
function actualizarEstadoRed() {
  const el = $('#estado-red');
  if (!el) return;
  const pendientes = leer(K.pendientes, []).length;
  const offline = !navigator.onLine;
  const enSesion = vistaActual === 'sesion' || vistaActual === 'resumen';
  if (offline) {
    el.innerHTML = `${ico('alerta', 's')}<span>Sin conexión${pendientes ? ` · ${pendientes} sin enviar` : ''}</span>`;
    el.className = 'estado-red sin-red';
    el.hidden = false;
  } else if (pendientes && !enviando && !enSesion) {
    el.innerHTML = `${ico('subir', 's')}<span>${pendientes} ${pendientes === 1 ? 'sesión sin enviar' : 'sesiones sin enviar'}</span><button data-accion="enviar">Enviar</button>`;
    el.className = 'estado-red pendientes';
    el.hidden = false;
  } else {
    el.hidden = true;
  }
  document.body.classList.toggle('con-estado-red', !el.hidden);
}

/* ---------- Actualización de la app (service worker en espera) ---------- */
let swEnEspera = null;
let actualizandoApp = false;

function vigilarActualizaciones() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').then((reg) => {
    const avisar = (sw) => {
      swEnEspera = sw;
      $('#actualizacion').hidden = false;
    };
    if (reg.waiting && navigator.serviceWorker.controller) avisar(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const sw = reg.installing;
      if (!sw) return;
      sw.addEventListener('statechange', () => {
        if (sw.state === 'installed' && navigator.serviceWorker.controller) avisar(sw);
      });
    });
    // Buscar versiones nuevas al volver a la app y cada 30 minutos
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
    setInterval(() => reg.update().catch(() => {}), 30 * 60000);
  }).catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (actualizandoApp) { actualizandoApp = false; location.reload(); }
  });
}

function actualizarApp() {
  if (!swEnEspera) return;
  actualizandoApp = true;
  $('#actualizacion').hidden = true;
  swEnEspera.postMessage('activar');
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
function minTxt(min) {
  if (min < 1) return '< 1 min';
  return min < 60 ? `${Math.round(min)} min` : `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, '0')} min`;
}

function reloj(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return (h ? `${h}:${String(m).padStart(2, '0')}` : `${m}`) + `:${String(x).padStart(2, '0')}`;
}

function barra(html) { $('#barra').innerHTML = html; }

const BTN_ATRAS = `<button class="icono" data-accion="atras" aria-label="Volver">${ico('atras')}</button>`;
const BTN_REFRESCAR = `<button class="icono" data-accion="actualizar" aria-label="Actualizar datos">${ico('refrescar')}</button>`;

/* ===================== Navegación ===================== */

const VISTAS = {
  inicio: () => vistaInicio(), historial: () => vistaHistorial(), progreso: () => vistaProgreso(),
  perfil: () => vistaPerfil(), ajustes: () => vistaAjustes(), records: () => vistaRecords(),
  sesion: () => vistaSesion(), resumen: () => vistaResumen()
};

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
  const tabActiva = vista === 'records' ? 'perfil' : vista;
  document.querySelectorAll('#nav button').forEach((b) => b.classList.toggle('activo', b.dataset.tab === tabActiva));
  if (vista === 'sesion') Pantalla.activar(); else Pantalla.desactivar();
  clearInterval(relojIntervalo);
  window.scrollTo(0, 0);
  (VISTAS[vista] || VISTAS.inicio)();
  actualizarEstadoRed();
}

/** Re-pinta la vista actual conservando el scroll */
function repintar() {
  const y = window.scrollY;
  clearInterval(relojIntervalo);
  (VISTAS[vistaActual] || VISTAS.inicio)();
  window.scrollTo(0, y);
}

/** Llamado por red.js cuando cambian los datos (envío o descarga) */
function alCambiarDatos() {
  // No se repinta mientras escribes en un formulario
  const escribiendo = document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
  if ((TABS.includes(vistaActual) || vistaActual === 'records') && !escribiendo) repintar();
}

/* ===================== Vista: Inicio ===================== */

function minutosEstimados(nombre) {
  const seg = RUTINA[nombre].reduce((a, ej) => a + ej.series * (descansoDe(ej.nombre) + 40), 0);
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
  const nombre = idx.perfil && idx.perfil.nombre;
  const fechaTxt = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  const fecha = fechaTxt.charAt(0).toUpperCase() + fechaTxt.slice(1);
  const sig = siguienteSesion();

  let html = `<div class="saludo"><p>${esc(fecha)}</p><h2>${saludo}${nombre ? `, <em>${esc(nombre)}</em>` : ''}</h2></div>`;

  if (!configCompleta()) {
    html += `<div class="tarjeta alerta aviso-linea">${ico('enlace')}<div>Falta conectar la app con tu hoja. <button class="enlace" data-tab="ajustes">Ir a Ajustes</button></div></div>`;
  }

  // Tarjeta principal: sesión en curso o siguiente entreno, con el mapa muscular
  const nombreHero = actual ? actual.sesion : sig;
  let datosHero, botones;
  if (actual) {
    const { hechas, total } = progresoSesion(actual);
    datosHero = `<div><b>${hechas}/${total}</b>series</div><div><b>${esc(duracionTxt(Date.now() - new Date(actual.inicio).getTime()).replace(' min', '′'))}</b>en marcha</div>`;
    botones = `<button class="btn blanco" data-accion="continuar">${ico('play', 'relleno')}Continuar</button>
               <button class="btn fantasma" data-accion="descartar">Descartar</button>`;
  } else {
    const ejs = RUTINA[sig];
    datosHero = `<div><b>${ejs.length}</b>ejercicios</div><div><b>${ejs.reduce((a, e) => a + e.series, 0)}</b>series</div><div><b>${minutosEstimados(sig)}′</b>aprox.</div>`;
    botones = `<button class="btn blanco ancho" data-accion="empezar" data-sesion="${esc(sig)}">${ico('play', 'relleno')}Empezar entreno</button>`;
  }
  html += `
    <section class="hero">
      <div class="hero-etiqueta">${actual ? 'SESIÓN EN CURSO' : 'SIGUIENTE ENTRENO'}</div>
      <div class="hero-nombre">${esc(nombreHero)}</div>
      <div class="hero-cuerpo">
        <div>
          <div class="hero-grupos">${esc(INFO_SESION[nombreHero].grupos).replace(/ · /g, '<br>')}</div>
          <div class="hero-datos">${datosHero}</div>
        </div>
        ${cuerpoSVG(intensidadSesion(nombreHero), { etiquetas: false })}
      </div>
      <div class="fila-botones">${botones}</div>
    </section>`;

  // Pendientes
  if (pendientes.length) {
    html += `<div class="tarjeta atencion" style="margin-top:12px"><div class="pendientes-cab">${ico('subir')}Pendientes de enviar (${pendientes.length})</div><ul class="lista-pendientes">`;
    for (const p of pendientes) {
      const n = p.ejercicios.reduce((a, e) => a + e.series.length, 0);
      html += `<li><span>${esc(fechaMedia(p.fecha))} · ${esc(p.sesion)} · ${n} series</span>
        <button class="icono plano" data-accion="borrar-pendiente" data-id="${esc(p.id)}" aria-label="Descartar">${ico('x')}</button></li>`;
    }
    html += `</ul><button class="btn primario ancho" style="margin-top:10px" data-accion="enviar">${ico('subir')}Enviar ahora</button></div>`;
  }

  // Tu semana
  const lunes = lunesDe(new Date());
  const hoyIso = hoy();
  let dias = '';
  ['L', 'M', 'X', 'J', 'V', 'S', 'D'].forEach((letra, i) => {
    const d = new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() + i);
    const iso = aISO(d);
    const dia = idx.dias.get(iso);
    const cls = ['semana-dia'];
    if (dia) cls.push([...dia.sesiones.values()].every((s) => s.pendiente) ? 'pendiente' : 'hecho');
    if (iso === hoyIso) cls.push('hoy');
    if (iso > hoyIso) cls.push('futuro');
    const etiqueta = dia ? `${fechaMedia(iso)}: ${[...dia.sesiones.keys()].join(', ')}` : fechaMedia(iso);
    dias += `<div class="${cls.join(' ')}" aria-label="${esc(etiqueta)}"><span>${letra}</span><i>${d.getDate()}</i></div>`;
  });
  html += `<div class="seccion-titulo">Tu actividad</div>
    <div class="tarjeta">
      <div class="semana-cab">
        <div><div class="etiqueta">Esta semana</div><b>${est.semana} ${est.semana === 1 ? 'sesión' : 'sesiones'}</b></div>
        <span class="racha" title="Semanas seguidas entrenando">${ico('llama')}${est.racha} ${est.racha === 1 ? 'semana' : 'semanas'}</span>
      </div>
      <div class="semana">${dias}</div>
    </div>
    <div class="stats tres">
      <div class="stat"><div class="stat-etiqueta">Este mes</div><div class="stat-valor">${est.esteMes}</div><div class="stat-pie">${est.esteMes === 1 ? 'sesión' : 'sesiones'}</div></div>
      <div class="stat"><div class="stat-etiqueta">Total</div><div class="stat-valor">${est.total}</div><div class="stat-pie">sesiones</div></div>
      <div class="stat"><div class="stat-etiqueta">Volumen</div><div class="stat-valor">${volumenTxt(est.volumenSemana).replace(/ (kg|t)$/, '<small>$1</small>')}</div><div class="stat-pie">esta semana</div></div>
    </div>`;

  // Sesiones
  html += `<div class="seccion-titulo">Sesiones</div><div class="sesiones">`;
  for (const nombreSes of ORDEN_SESIONES) {
    const ejs = RUTINA[nombreSes];
    const u = idx.ultimaSesion[nombreSes];
    const esSig = !actual && nombreSes === sig;
    html += `
      <button class="tarjeta-sesion ${esSig ? 'siguiente' : ''}" data-accion="empezar" data-sesion="${esc(nombreSes)}">
        ${cuerpoSVG(intensidadSesion(nombreSes), { etiquetas: false })}
        <span>
          <span class="nombre">${esc(nombreSes)}${esSig ? '<span class="etiqueta-sig">TOCA</span>' : ''}</span>
          <span class="grupos">${esc(INFO_SESION[nombreSes].grupos)}</span>
          <span class="pie">${ejs.length} ejercicios · ${ejs.reduce((a, e) => a + e.series, 0)} series</span>
        </span>
        <span class="lado">${u ? esc(haceDias(u)) : 'Sin registros'}${ico('sig')}</span>
      </button>`;
  }
  html += '</div>';

  // Estado de sincronización
  const actualizado = idx.actualizado;
  const reciente = actualizado && Date.now() - new Date(actualizado).getTime() < 24 * 3600000;
  html += `<div class="sync"><span class="punto ${reciente ? '' : 'viejo'}"></span>${actualizando ? 'Actualizando datos…' : 'Datos de la hoja: ' + hace(actualizado)}</div>`;

  $('#vista').innerHTML = html;
}

/* ===================== Eventos ===================== */

document.addEventListener('click', async (e) => {
  const tab = e.target.closest('[data-tab]');
  if (tab) return navegar(tab.dataset.tab);

  const b = e.target.closest('[data-accion]');
  if (!b || b.disabled) return;
  const accion = b.dataset.accion;

  // Acciones de cada pantalla (sesion.js y vistas.js)
  if (await accionSesion(accion, b)) return;
  if (await accionVistas(accion, b)) return;

  switch (accion) {
    case 'atras': history.back(); break;
    case 'enviar': enviarPendientes(); break;
    case 'borrar-pendiente': {
      const antes = leer(K.pendientes, []);
      guardar(K.pendientes, antes.filter((p) => p.id !== b.dataset.id));
      invalidarIndice();
      repintar();
      actualizarEstadoRed();
      avisoDeshacer('Sesión pendiente descartada', () => { guardar(K.pendientes, antes); repintar(); });
      break;
    }
    case 'toast-accion': {
      const fn = aviso._accion;
      ocultarAviso();
      if (fn) fn();
      break;
    }
    case 'actualizar-app': actualizarApp(); break;
    case 'actualizar':
    case 'actualizar-forzado':
      await actualizarDatos({ silencioso: false });
      break;
  }
});

document.addEventListener('input', (e) => { entradaSesion(e.target); });
document.addEventListener('change', (e) => { cambioSesion(e.target) || cambioVistas(e.target); });

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
  actualizarEstadoRed();
  const n = await enviarPendientes({ silencioso: true });
  if (!n) actualizarDatos();
  actualizarEstadoRed();
});
window.addEventListener('offline', actualizarEstadoRed);

let anchoPrevio = window.innerWidth;
window.addEventListener('resize', () => {
  if (['progreso', 'perfil'].includes(vistaActual) && Math.abs(window.innerWidth - anchoPrevio) > 20) {
    anchoPrevio = window.innerWidth;
    repintar();
  }
});

// Al volver a la app tras un rato, refrescar datos de la hoja
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  const cache = leer(K.cache, {});
  if (!cache.actualizado || Date.now() - new Date(cache.actualizado).getTime() > 10 * 60000) actualizarDatos();
});

/* ===================== Arranque ===================== */

vigilarActualizaciones();
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
  actualizarEstadoRed();
})();
