'use strict';

/* =====================================================================
 * Lo que la app guarda en el móvil (localStorage). La hoja de Google es la
 * única fuente de verdad; aquí solo hay:
 *  - config:     URL del script central y la clave de tu cuenta (llegan con el enlace de conexión).
 *  - actual:     la sesión que estás haciendo (para no perderla si se cierra la app).
 *  - pendientes: sesiones terminadas que aún no han llegado a la hoja.
 *                Se borran en cuanto la hoja confirma que las ha recibido.
 *  - cache:      copia de SOLO LECTURA de tu hoja (rutina, sesiones y perfil), para
 *                consultar todo sin internet. Se actualiza con lo que cambia en la hoja.
 * ===================================================================== */

const K = {
  config: 'gym.config',
  actual: 'gym.actual',
  pendientes: 'gym.pendientes',
  cache: 'gym.cache',
  descanso: 'gym.descanso',        // temporizador en marcha (para sobrevivir a una recarga)
  ejercicioProgreso: 'gym.progreso.ejercicio',
  prefs: 'gym.prefs'               // preferencias del móvil: sonido y vibración
};

/** Preferencias del teléfono (no son datos de entreno) */
function prefs() {
  return { sonido: true, vibracion: true, ...leer(K.prefs, {}) };
}

/** Vibrar solo si está activado en Ajustes */
function vibrar(patron) {
  if (prefs().vibracion && navigator.vibrate) navigator.vibrate(patron);
}

// Limpieza de datos de la versión 1 (la app ya no guarda historial propio).
['gym.ultimo', 'gym.ultimaSesion', 'gym.enviadas'].forEach((k) => localStorage.removeItem(k));

function leer(clave, defecto) {
  try {
    const v = localStorage.getItem(clave);
    return v === null ? defecto : JSON.parse(v);
  } catch (e) {
    return defecto;
  }
}

function guardar(clave, valor) {
  localStorage.setItem(clave, JSON.stringify(valor));
}

/** Conectada al script central (las conexiones de la versión antigua no valen) */
function configCompleta() {
  const c = leer(K.config, {});
  return Boolean(c.url && c.clave && c.v2);
}

/** Había una conexión de la versión antigua (un solo usuario) */
function configAntigua() {
  const c = leer(K.config, {});
  return Boolean(c.url && c.clave && !c.v2);
}

const FORMATO_CACHE = 2;
/** Copia local de la hoja (vacía si es de otra versión) */
function leerCache() {
  const c = leer(K.cache, null);
  return c && c.formato === FORMATO_CACHE ? c : { formato: FORMATO_CACHE, sesiones: [], rutina: [], perfil: null, admin: false, actualizado: null };
}

/** Datos de un enlace de conexión: …#conectar=<base64url de {"u": url, "c": clave}> */
function leerEnlaceConexion(texto) {
  const m = /[#&]conectar=([A-Za-z0-9_-]+)/.exec(String(texto || ''));
  if (!m) return null;
  try {
    const b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
    const d = JSON.parse(decodeURIComponent(escape(bin)));
    if (typeof d.u !== 'string' || typeof d.c !== 'string' || !/^https?:\/\//.test(d.u) || !d.c) return null;
    return { url: d.u, clave: d.c };
  } catch (e) {
    return null;
  }
}

// ---------- Utilidades de formato compartidas ----------
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

/** Icono del juego de iconos de index.html: ico('check') */
function ico(nombre, clase = '') {
  return `<svg class="ico ${clase}" aria-hidden="true"><use href="#i-${nombre}"/></svg>`;
}

function esc(t) {
  return String(t ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Date → "2026-11-03" (hora local) */
function aISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** "2026-11-03" → Date (00:00 local) */
function deISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function hoy() { return aISO(new Date()); }

/** "2026-11-03" → "3 nov" */
function fechaCorta(iso) {
  const d = deISO(iso);
  return `${d.getDate()} ${MESES_CORTOS[d.getMonth()]}`;
}
/** "2026-11-03" → "mar 3 nov" */
function fechaMedia(iso) {
  const d = deISO(iso);
  return `${DIAS_CORTOS[d.getDay()]} ${d.getDate()} ${MESES_CORTOS[d.getMonth()]}`;
}
/** Días entre una fecha ISO y hoy → "hoy", "ayer", "hace 3 días" */
function haceDias(iso) {
  const dias = Math.round((deISO(hoy()) - deISO(iso)) / 86400000);
  if (dias <= 0) return 'hoy';
  if (dias === 1) return 'ayer';
  if (dias < 7) return `hace ${dias} días`;
  if (dias < 14) return 'hace 1 semana';
  if (dias < 60) return `hace ${Math.floor(dias / 7)} semanas`;
  return `hace ${Math.floor(dias / 30)} meses`;
}

/** 62.5 → "62,5" */
function num(n, dec = 2) {
  return Number(n).toLocaleString('es-ES', { maximumFractionDigits: dec });
}
/** Volumen en kg → "850 kg" o "12,4 t" */
function volumenTxt(kg) {
  return kg >= 1000 ? `${num(kg / 1000, 1)} t` : `${num(kg, 0)} kg`;
}
/** Lista de series → "60×8 · 62,5×7" */
function seriesTxt(series) {
  return series.map((s) => `${num(s.peso)}×${s.reps}`).join(' · ');
}
/** { peso: 65, reps: 12 } → "65 kg × 12 reps" */
function serieTxt(s) {
  return s ? `${num(s.peso)} kg × ${s.reps} ${s.reps === 1 ? 'rep' : 'reps'}` : '';
}
/** Récord con la serie real: 91 → "91 kg (65 kg × 12 reps)" */
function prTxt(valor, serie, dec = 2) {
  return `${num(valor, dec)} kg${serie ? ` (${serieTxt(serie)})` : ''}`;
}
/** 210 → "3:30" */
function mmss(seg) {
  return `${Math.floor(seg / 60)}:${String(Math.round(seg % 60)).padStart(2, '0')}`;
}
/** 210 → "3,5 min" (como se escribe en la columna Descanso de la hoja) */
function descansoTexto(seg) {
  return `${num(seg / 60, 2)} min`;
}
