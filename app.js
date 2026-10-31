'use strict';

/* =====================================================================
 * EDUX TRAINING — base de la interfaz: navegación, Inicio, eventos y arranque.
 *   Pestañas: inicio · historial · progreso · perfil · ajustes
 *   Pantallas: sesion · resumen (sesion.js) · records (vistas.js)
 * ===================================================================== */

const VERSION_APP = 'v5';
const $ = (sel, raiz = document) => raiz.querySelector(sel);

let vistaActual = 'inicio';
const TABS = ['inicio', 'historial', 'progreso', 'perfil', 'ajustes'];
let relojIntervalo = null;

// Orden global de los ejercicios (para ordenar listas)
const ORDEN_EJ = ORDEN_EJ_DATOS;

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

const BTN_ATRAS = `<button class="icono" data-accion="atras" aria-label="Volver"><svg viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg></button>`;
const BTN_REFRESCAR = `<button class="icono" data-accion="actualizar" aria-label="Actualizar datos"><svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-2.6-6.4M21 4v5h-5"/></svg></button>`;

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

  let html = `<div class="saludo"><h2>${saludo}${nombre ? ', ' + esc(nombre) : ''}</h2><p>${esc(fecha)}</p></div>`;

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
  for (const nombreSes of ORDEN_SESIONES) {
    const ejs = RUTINA[nombreSes];
    const u = idx.ultimaSesion[nombreSes];
    html += `
      <button class="tarjeta-sesion ${!actual && nombreSes === sig ? 'siguiente' : ''}" data-accion="empezar" data-sesion="${esc(nombreSes)}">
        <span class="letra">${INFO_SESION[nombreSes].letra}</span>
        <span class="nombre">${esc(nombreSes)}</span>
        <span class="grupos">${esc(INFO_SESION[nombreSes].grupos)}</span>
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
  const n = await enviarPendientes({ silencioso: true });
  if (!n) actualizarDatos();
});

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
