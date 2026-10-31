'use strict';

/* =====================================================================
 * Convierte las filas de la hoja (copia en caché) en estructuras útiles:
 * días entrenados, evolución por ejercicio, récords y estadísticas.
 * También incluye las sesiones pendientes de enviar (marcadas como tales),
 * para que "última vez" y los récords sean correctos aunque aún no hayan
 * llegado a la hoja.
 * ===================================================================== */

/** 1RM estimado, misma fórmula que la hoja (Epley): peso × (1 + reps/30), 1 decimal */
function rm1(peso, reps) {
  return Math.round(peso * (1 + reps / 30) * 10) / 10;
}

let _indice = null;
function invalidarIndice() { _indice = null; }

function indice() {
  if (!_indice) _indice = construirIndice();
  return _indice;
}

function construirIndice() {
  const cache = leer(K.cache, { filas: [] });
  const filas = [];

  for (const f of cache.filas || []) {
    const [fecha, sesion, ejercicio, serie, peso, reps, nota] = f;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !ejercicio) continue;
    filas.push({ fecha, sesion, ejercicio, serie: Number(serie) || 0, peso: Number(peso) || 0, reps: Number(reps) || 0, nota: nota || '', pendiente: false });
  }
  for (const p of leer(K.pendientes, [])) {
    for (const ej of p.ejercicios) {
      ej.series.forEach((s, i) => filas.push({
        fecha: p.fecha, sesion: p.sesion, ejercicio: ej.nombre, serie: s.serie,
        peso: s.peso, reps: s.reps, nota: i === 0 ? ej.nota : '', pendiente: true
      }));
    }
  }

  // --- Días → sesiones → ejercicios ---
  const dias = new Map();
  for (const f of filas) {
    if (!dias.has(f.fecha)) dias.set(f.fecha, { fecha: f.fecha, sesiones: new Map() });
    const dia = dias.get(f.fecha);
    const claveSesion = f.sesion || '—';
    if (!dia.sesiones.has(claveSesion)) dia.sesiones.set(claveSesion, { sesion: claveSesion, pendiente: f.pendiente, ejercicios: new Map() });
    const ses = dia.sesiones.get(claveSesion);
    if (!ses.ejercicios.has(f.ejercicio)) ses.ejercicios.set(f.ejercicio, { nombre: f.ejercicio, series: [], nota: '' });
    const ej = ses.ejercicios.get(f.ejercicio);
    ej.series.push({ serie: f.serie, peso: f.peso, reps: f.reps });
    if (f.nota) ej.nota = ej.nota ? ej.nota + ' · ' + f.nota : f.nota;
  }
  for (const dia of dias.values()) {
    for (const ses of dia.sesiones.values()) {
      for (const ej of ses.ejercicios.values()) ej.series.sort((a, b) => a.serie - b.serie);
    }
  }

  // --- Evolución por ejercicio (un punto por día) ---
  const porEjercicio = new Map();
  for (const f of filas) {
    if (!porEjercicio.has(f.ejercicio)) porEjercicio.set(f.ejercicio, new Map());
    const m = porEjercicio.get(f.ejercicio);
    if (!m.has(f.fecha)) m.set(f.fecha, { fecha: f.fecha, series: [], pesoMax: 0, rm1: 0, volumen: 0, nota: '', pendiente: f.pendiente });
    const d = m.get(f.fecha);
    d.series.push({ serie: f.serie, peso: f.peso, reps: f.reps });
    d.pesoMax = Math.max(d.pesoMax, f.peso);
    d.rm1 = Math.max(d.rm1, rm1(f.peso, f.reps));
    d.volumen += f.peso * f.reps;
    if (f.nota) d.nota = f.nota;
  }
  const evolucion = new Map();
  const records = new Map();
  for (const [nombre, m] of porEjercicio) {
    const lista = [...m.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
    lista.forEach((d) => d.series.sort((a, b) => a.serie - b.serie));
    evolucion.set(nombre, lista);
    const r = { peso: 0, rm1: 0, fechaPeso: null, fechaRm1: null };
    for (const d of lista) {
      if (d.pesoMax > r.peso) { r.peso = d.pesoMax; r.fechaPeso = d.fecha; }
      if (d.rm1 > r.rm1) { r.rm1 = d.rm1; r.fechaRm1 = d.fecha; }
    }
    records.set(nombre, r);
  }

  // --- Última fecha de cada sesión ---
  const ultimaSesion = {};
  for (const dia of dias.values()) {
    for (const s of dia.sesiones.keys()) {
      if (!ultimaSesion[s] || dia.fecha > ultimaSesion[s]) ultimaSesion[s] = dia.fecha;
    }
  }

  // --- Récords batidos a lo largo del tiempo (la primera vez no cuenta) ---
  const historialRecords = [];
  for (const [nombre, lista] of evolucion) {
    let bestP = null, bestR = null;
    for (const d of lista) {
      if (bestP !== null) {
        if (d.pesoMax > bestP) historialRecords.push({ fecha: d.fecha, ejercicio: nombre, tipo: 'peso', valor: d.pesoMax, anterior: bestP, series: d.series, pendiente: d.pendiente });
        else if (d.rm1 > bestR) historialRecords.push({ fecha: d.fecha, ejercicio: nombre, tipo: 'rm1', valor: d.rm1, anterior: bestR, series: d.series, pendiente: d.pendiente });
      }
      bestP = bestP === null ? d.pesoMax : Math.max(bestP, d.pesoMax);
      bestR = bestR === null ? d.rm1 : Math.max(bestR, d.rm1);
    }
  }
  historialRecords.sort((a, b) => b.fecha.localeCompare(a.fecha) || (ORDEN_EJ_DATOS.get(a.ejercicio) ?? 999) - (ORDEN_EJ_DATOS.get(b.ejercicio) ?? 999));

  // --- Tiempos (pestaña Tiempos + pendientes) ---
  const tiempoSesion = new Map();   // "fecha|sesión" → minutos totales
  const tiempoDiaEj = new Map();    // "fecha|sesión|ejercicio" → minutos
  const tiemposEj = new Map();      // ejercicio → [minutos, ...]
  const anotarTiempo = (fecha, sesion, ejercicio, min) => {
    if (ejercicio === TOTAL_SESION) { tiempoSesion.set(`${fecha}|${sesion}`, min); return; }
    tiempoDiaEj.set(`${fecha}|${sesion}|${ejercicio}`, min);
    if (!tiemposEj.has(ejercicio)) tiemposEj.set(ejercicio, []);
    tiemposEj.get(ejercicio).push(min);
  };
  for (const [fecha, sesion, ejercicio, min] of cache.tiempos || []) anotarTiempo(fecha, sesion, ejercicio, Number(min));
  for (const p of leer(K.pendientes, [])) {
    for (const t of p.tiempos || []) anotarTiempo(p.fecha, p.sesion, t.ejercicio, t.minutos);
    if (p.duracion) anotarTiempo(p.fecha, p.sesion, TOTAL_SESION, p.duracion);
  }

  return {
    dias, evolucion, records, ultimaSesion, historialRecords,
    tiempoSesion, tiempoDiaEj, tiemposEj,
    descansos: cache.descansos || {},
    perfil: cache.perfil || null,
    actualizado: cache.actualizado || null
  };
}

const TOTAL_SESION = 'Sesión completa';
const ORDEN_EJ_DATOS = new Map();
ORDEN_SESIONES.forEach((s) => RUTINA[s].forEach((ej) => ORDEN_EJ_DATOS.set(ej.nombre, ORDEN_EJ_DATOS.size)));
const DEF_EJERCICIO = new Map();
ORDEN_SESIONES.forEach((s) => RUTINA[s].forEach((ej) => DEF_EJERCICIO.set(ej.nombre, ej)));

/** Descanso de un ejercicio en segundos: el de la hoja (pestaña Rutina) o el de la app */
function descansoDe(nombre) {
  const texto = indice().descansos[nombre] || (DEF_EJERCICIO.get(nombre) || {}).descanso || '2 min';
  return descansoSegundos(texto);
}

/** Series por músculo en la semana que empieza el lunes indicado (principal 1, secundario ½) */
function seriesPorMusculo(lunesIso) {
  const fin = aISO(new Date(deISO(lunesIso).getTime() + 6 * 86400000 + 3600000));
  const out = Object.fromEntries(ORDEN_MUSCULOS.map((m) => [m, 0]));
  const detalle = Object.fromEntries(ORDEN_MUSCULOS.map((m) => [m, { principal: 0, secundario: 0 }]));
  for (const dia of indice().dias.values()) {
    if (dia.fecha < lunesIso || dia.fecha > fin) continue;
    for (const s of dia.sesiones.values()) {
      for (const ej of s.ejercicios.values()) {
        const m = MUSCULOS[ej.nombre];
        if (!m) continue;
        m.forEach((mus, i) => {
          out[mus] += ej.series.length * (i === 0 ? 1 : 0.5);
          detalle[mus][i === 0 ? 'principal' : 'secundario'] += ej.series.length;
        });
      }
    }
  }
  return { series: out, detalle };
}

/** Edad a partir de "yyyy-mm-dd" */
function edad(nacimiento) {
  if (!nacimiento) return null;
  const n = deISO(nacimiento), h = new Date();
  let e = h.getFullYear() - n.getFullYear();
  if (h.getMonth() < n.getMonth() || (h.getMonth() === n.getMonth() && h.getDate() < n.getDate())) e--;
  return e;
}

/** Último día registrado de un ejercicio (o null) */
function ultimaVez(nombre) {
  const lista = indice().evolucion.get(nombre);
  return lista && lista.length ? lista[lista.length - 1] : null;
}

/** Lista de sesiones (fecha + nombre) ordenadas por fecha */
function listaSesiones() {
  const out = [];
  for (const dia of indice().dias.values()) {
    for (const s of dia.sesiones.values()) out.push({ fecha: dia.fecha, sesion: s.sesion, ses: s });
  }
  return out.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/** Lunes de la semana de una fecha */
function lunesDe(d) {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  r.setDate(r.getDate() - ((r.getDay() + 6) % 7));
  return r;
}

function estadisticas() {
  const sesiones = listaSesiones();
  const ahora = new Date();
  const lunes = aISO(lunesDe(ahora));
  const mes = hoy().slice(0, 7);

  const semana = sesiones.filter((s) => s.fecha >= lunes).length;
  const esteMes = sesiones.filter((s) => s.fecha.startsWith(mes)).length;

  // Racha: semanas seguidas (lunes a domingo) con al menos una sesión.
  // Si esta semana aún no has entrenado, la racha sigue viva desde la anterior.
  const semanas = new Set(sesiones.map((s) => aISO(lunesDe(deISO(s.fecha)))));
  let cursor = lunesDe(ahora);
  if (!semanas.has(aISO(cursor))) cursor.setDate(cursor.getDate() - 7);
  let racha = 0;
  while (semanas.has(aISO(cursor))) { racha++; cursor.setDate(cursor.getDate() - 7); }

  // Volumen de esta semana
  let volumenSemana = 0;
  for (const s of sesiones) {
    if (s.fecha < lunes) continue;
    for (const ej of s.ses.ejercicios.values()) for (const x of ej.series) volumenSemana += x.peso * x.reps;
  }

  return { semana, esteMes, racha, total: sesiones.length, volumenSemana };
}

/** Sesión que toca según la rotación Empuje → Tirón → Pierna → Fullbody */
function siguienteSesion() {
  const u = indice().ultimaSesion;
  let ultima = null;
  for (const s of ORDEN_SESIONES) {
    if (u[s] && (!ultima || u[s] > u[ultima] || (u[s] === u[ultima] && ORDEN_SESIONES.indexOf(s) > ORDEN_SESIONES.indexOf(ultima)))) ultima = s;
  }
  if (!ultima) return ORDEN_SESIONES[0];
  return ORDEN_SESIONES[(ORDEN_SESIONES.indexOf(ultima) + 1) % ORDEN_SESIONES.length];
}
