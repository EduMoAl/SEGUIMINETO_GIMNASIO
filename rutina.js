'use strict';

/* =====================================================================
 * La rutina de cada usuario se lee de SU hoja (pestaña Rutina) y llega con
 * los datos (cache.rutina). Aquí se convierte en las estructuras que usa la app:
 *   RUTINA[sesión]    → [{ nombre, series, objetivos[], descanso (s), principal, secundarios[], material }]
 *   ORDEN_SESIONES    → sesiones en el orden de la hoja (rotación)
 *   INFO_SESION[ses]  → { letra, grupos }
 *   MUSCULOS[ej]      → [principal, ...secundarios]
 *   ORDEN_EJ / DEF_EJERCICIO → orden global y definición de cada ejercicio
 * Se rellenan EN SITIO (los demás archivos guardan referencias a estos objetos).
 * ===================================================================== */

// Los grupos musculares de la app (mismo orden que en el script de la hoja)
const ORDEN_MUSCULOS = ['Pecho', 'Espalda', 'Hombro', 'Bíceps', 'Tríceps', 'Antebrazo', 'Abdomen', 'Lumbar',
  'Cuádriceps', 'Femoral', 'Glúteo', 'Aductores', 'Gemelos'];

const RUTINA = {};
const ORDEN_SESIONES = [];
const INFO_SESION = {};
const MUSCULOS = {};
const ORDEN_EJ = new Map();
const DEF_EJERCICIO = new Map();

/** Primera letra libre del nombre (Empuje → E; si ya está, la siguiente letra del nombre) */
function letraSesion(nombre, usadas) {
  const candidatas = (nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().match(/[A-Z0-9]/g) || []);
  for (const l of candidatas) if (!usadas.has(l)) return l;
  for (let i = 1; i < 100; i++) if (!usadas.has(String(i))) return String(i);
  return '•';
}

/** Grupos de una sesión: los músculos principales por orden de aparición (más de 4 → cuerpo completo) */
function gruposSesion(ejercicios) {
  const grupos = [];
  for (const e of ejercicios) if (e.principal && !grupos.includes(e.principal)) grupos.push(e.principal);
  if (!grupos.length) return 'Sin músculos asignados';
  return grupos.length > 4 ? 'Cuerpo completo' : grupos.join(' · ');
}

/** Rehace las estructuras a partir de la rutina descargada de la hoja */
function cargarRutina(filas) {
  for (const k of Object.keys(RUTINA)) delete RUTINA[k];
  for (const k of Object.keys(INFO_SESION)) delete INFO_SESION[k];
  for (const k of Object.keys(MUSCULOS)) delete MUSCULOS[k];
  ORDEN_SESIONES.length = 0;
  ORDEN_EJ.clear();
  DEF_EJERCICIO.clear();

  for (const f of filas || []) {
    if (!f || !f.sesion || !f.ejercicio) continue;
    if (!RUTINA[f.sesion]) { RUTINA[f.sesion] = []; ORDEN_SESIONES.push(f.sesion); }
    // Un ejercicio repetido dentro de la misma sesión se ignora (la sesión los identifica por nombre)
    if (RUTINA[f.sesion].some((e) => e.nombre === f.ejercicio)) continue;
    const series = Math.max(1, Math.min(10, Number(f.series) || 3));
    const objetivos = Array.isArray(f.objetivos) && f.objetivos.length ? f.objetivos.map(String) : ['8–12'];
    const ej = {
      nombre: f.ejercicio, series, objetivos,
      descanso: Number(f.descanso) > 0 ? Number(f.descanso) : 120,
      principal: f.principal || '', secundarios: Array.isArray(f.secundarios) ? f.secundarios : [],
      material: f.material || 'Otro'
    };
    RUTINA[f.sesion].push(ej);
    if (!DEF_EJERCICIO.has(ej.nombre)) {
      DEF_EJERCICIO.set(ej.nombre, ej);
      ORDEN_EJ.set(ej.nombre, ORDEN_EJ.size);
      MUSCULOS[ej.nombre] = [ej.principal, ...ej.secundarios].filter(Boolean);
    }
  }
  const usadas = new Set();
  for (const s of ORDEN_SESIONES) {
    const letra = letraSesion(s, usadas);
    usadas.add(letra);
    INFO_SESION[s] = { letra, grupos: gruposSesion(RUTINA[s]) };
  }
}

/** Datos de presentación de una sesión (también de sesiones antiguas que ya no están en la rutina) */
function infoSesion(nombre) {
  return INFO_SESION[nombre] || { letra: '•', grupos: '' };
}

function hayRutina() { return ORDEN_SESIONES.length > 0; }
