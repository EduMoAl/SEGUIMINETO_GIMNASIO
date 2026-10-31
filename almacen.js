'use strict';

/* =====================================================================
 * Lo que la app guarda en el móvil (localStorage). La hoja de Google es la
 * única fuente de verdad; aquí solo hay:
 *  - config:     URL del script y clave secreta.
 *  - actual:     la sesión que estás haciendo (para no perderla si se cierra la app).
 *  - pendientes: sesiones terminadas que aún no han llegado a la hoja.
 *                Se borran en cuanto la hoja confirma que las ha recibido.
 *  - cache:      copia de SOLO LECTURA del Registro de la hoja, para consultar
 *                "última vez", récords, calendario y gráficas sin internet.
 *                Se sustituye entera cada vez que se descarga de la hoja.
 * ===================================================================== */

const K = {
  config: 'gym.config',
  actual: 'gym.actual',
  pendientes: 'gym.pendientes',
  cache: 'gym.cache',
  descanso: 'gym.descanso',        // temporizador en marcha (para sobrevivir a una recarga)
  ejercicioProgreso: 'gym.progreso.ejercicio'
};

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

function configCompleta() {
  const c = leer(K.config, {});
  return Boolean(c.url && c.clave);
}

// ---------- Utilidades de formato compartidas ----------
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

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
/** "3,5 min" → 210 (segundos) */
function descansoSegundos(texto) {
  const n = parseFloat(String(texto).replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 60) : 120;
}
