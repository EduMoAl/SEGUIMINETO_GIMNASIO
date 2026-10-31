/**
 * EDUX TRAINING – script de la hoja "Seguimiento entreno – PPL + torso".
 *
 * Se pega en la hoja (Extensiones → Apps Script) y se publica como aplicación web.
 * La hoja es la ÚNICA fuente de datos de la app:
 *   - Registro: una fila por serie (columnas A–H). Volumen y 1RM (I, J) los calcula la hoja.
 *   - Rutina:   la app lee y cambia aquí los descansos (columna F).
 *   - Tiempos:  minutos por ejercicio y total de cada sesión (la crea este script).
 *   - Perfil:   tus datos personales y el historial de peso (la crea este script).
 * Además envía un resumen semanal por email (ver activarResumenSemanal).
 */

const HOJA_REGISTRO = 'Registro';
const HOJA_RUTINA = 'Rutina';
const HOJA_TIEMPOS = 'Tiempos';
const HOJA_PERFIL = 'Perfil';
const PRIMERA_FILA_DATOS = 3;   // Registro: filas 1 y 2 son cabeceras
const NUM_COLUMNAS = 8;         // A Fecha · B Semana · C Sesión · D Ejercicio · E Serie nº · F Peso · G Reps · H Notas
const SESIONES_VALIDAS = ['Empuje', 'Tirón', 'Pierna', 'Fullbody'];
const PREFIJO_ENVIADA = 'enviada_';
const TOTAL_SESION = 'Sesión completa';

// Músculo principal (1 serie) y secundarios (½ serie). Igual que en la app (rutina.js).
const MUSCULOS = {
  'Press banca': ['Pecho', 'Hombro', 'Tríceps'],
  'Press inclinado 45º': ['Pecho', 'Hombro', 'Tríceps'],
  'Fondos lastrados': ['Pecho', 'Tríceps'],
  'Contractora de pecho': ['Pecho'],
  'Press militar': ['Hombro', 'Tríceps'],
  'Elevaciones laterales en polea': ['Hombro'],
  'Press francés': ['Tríceps'],
  'Extensión de tríceps en polea cruzada': ['Tríceps'],
  'Extensión de tríceps sobre la cabeza en polea': ['Tríceps'],
  'Remo en T': ['Espalda', 'Bíceps'],
  'Jalón al pecho, agarre neutro': ['Espalda', 'Bíceps'],
  'Remo en máquina': ['Espalda', 'Bíceps'],
  'Remo en polea': ['Espalda', 'Bíceps'],
  'Curl predicador': ['Bíceps'],
  'Curl de bíceps en polea': ['Bíceps'],
  'Curl martillo con mancuernas': ['Bíceps'],
  'Sentadilla hack': ['Cuádriceps', 'Glúteo'],
  'Extensión de rodilla': ['Cuádriceps'],
  'Curl femoral sentado': ['Femoral'],
  'Curl femoral tumbado': ['Femoral'],
  'Peso muerto rumano': ['Femoral', 'Glúteo'],
  'Hip thrust': ['Glúteo'],
  'Aductora en máquina': ['Aductores']
};
const ORDEN_MUSCULOS = ['Pecho', 'Espalda', 'Hombro', 'Bíceps', 'Tríceps', 'Cuádriceps', 'Femoral', 'Glúteo', 'Aductores'];

/* ============================ Configuración ============================ */

/**
 * Ejecuta esta función UNA VEZ desde el editor (botón ▶ Ejecutar).
 * Crea la clave secreta (si no existe) y la muestra en el registro de ejecución.
 */
function generarClave() {
  const props = PropertiesService.getScriptProperties();
  let clave = props.getProperty('CLAVE');
  if (!clave) {
    clave = Utilities.getUuid().replace(/-/g, '');
    props.setProperty('CLAVE', clave);
  }
  Logger.log('Tu clave secreta es: ' + clave);
  return clave;
}

/* ============================ Aplicación web ============================ */

/** La app hace POST con un JSON { clave, tipo, ... }. */
function doPost(e) {
  let datos;
  try {
    datos = JSON.parse(e.postData.contents);
  } catch (err) {
    return responder({ ok: false, error: 'Datos ilegibles (JSON inválido).' });
  }

  const props = PropertiesService.getScriptProperties();
  const clave = props.getProperty('CLAVE');
  if (!clave) return responder({ ok: false, error: 'El script no tiene clave. Ejecuta generarClave() en el editor.' });
  if (datos.clave !== clave) return responder({ ok: false, error: 'Clave incorrecta.' });

  try {
    switch (datos.tipo) {
      case 'ping':
        return responder({ ok: true, mensaje: 'Conexión correcta.' });
      case 'datos':
        return responder({
          ok: true,
          filas: leerRegistro(),
          descansos: leerDescansos(),
          tiempos: leerTiempos(),
          perfil: leerPerfil()
        });
      case 'sesion':
        return conBloqueo(function () { return guardarSesion(datos.sesion, props); });
      case 'perfil':
        return conBloqueo(function () { return guardarPerfil(datos.perfil); });
      case 'peso':
        return conBloqueo(function () { return guardarPeso(datos.fecha, datos.peso); });
      case 'descanso':
        return conBloqueo(function () { return guardarDescanso(datos.ejercicio, datos.segundos); });
      default:
        return responder({ ok: false, error: 'Tipo de petición desconocido.' });
    }
  } catch (err) {
    return responder({ ok: false, error: err.message });
  }
}

/** Abrir la URL en el navegador solo confirma que el script está publicado. */
function doGet() {
  return responder({ ok: true, mensaje: 'Script de EDUX TRAINING activo. Usa la app para enviar sesiones.' });
}

/** Ejecuta una escritura con el bloqueo del script (una a la vez). */
function conBloqueo(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return responder({ ok: false, error: 'La hoja está ocupada, reintenta en un momento.' });
  try {
    return responder(fn());
  } finally {
    lock.releaseLock();
  }
}

function responder(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ============================ Sesiones ============================ */

function guardarSesion(sesion, props) {
  const filas = construirFilas(sesion);              // valida todo antes de escribir
  const tiempos = construirTiempos(sesion);

  // Si ya la recibimos (p. ej. se cortó la conexión justo después), no la duplicamos.
  if (props.getProperty(PREFIJO_ENVIADA + sesion.id)) return { ok: true, duplicada: true, filas: 0 };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hoja = ss.getSheetByName(HOJA_REGISTRO);
  if (!hoja) throw new Error('No existe la pestaña "' + HOJA_REGISTRO + '".');

  const fila = primeraFilaLibre(hoja);
  asegurarFilas(hoja, fila + filas.length - 1);
  hoja.getRange(fila, 1, filas.length, NUM_COLUMNAS).setValues(filas);
  hoja.getRange(fila, 1, filas.length, 1).setNumberFormat('dd/mm/yyyy');

  if (tiempos.length) {
    const ht = hojaTiempos(true);
    const ft = ht.getLastRow() + 1;
    asegurarFilas(ht, ft + tiempos.length - 1);
    ht.getRange(ft, 1, tiempos.length, 4).setValues(tiempos);
    ht.getRange(ft, 1, tiempos.length, 1).setNumberFormat('dd/mm/yyyy');
  }
  SpreadsheetApp.flush();

  props.setProperty(PREFIJO_ENVIADA + sesion.id, new Date().toISOString());
  return { ok: true, filas: filas.length, desdeFila: fila };
}

/**
 * Convierte la sesión de la app en filas [A..H] para "Registro".
 * Lanza un error (y no se escribe nada) si algún dato no es válido.
 */
function construirFilas(sesion) {
  if (!sesion || typeof sesion !== 'object') throw new Error('Falta la sesión.');
  if (!sesion.id || typeof sesion.id !== 'string') throw new Error('La sesión no tiene identificador.');
  if (SESIONES_VALIDAS.indexOf(sesion.sesion) === -1) throw new Error('Sesión desconocida: ' + sesion.sesion);

  const fecha = parsearFecha(sesion.fecha);
  if (!Array.isArray(sesion.ejercicios) || sesion.ejercicios.length === 0) {
    throw new Error('La sesión no tiene ejercicios.');
  }

  const filas = [];
  sesion.ejercicios.forEach(function (ej) {
    if (!ej.nombre || typeof ej.nombre !== 'string') throw new Error('Ejercicio sin nombre.');
    if (!Array.isArray(ej.series)) throw new Error('Ejercicio sin series: ' + ej.nombre);
    const nota = typeof ej.nota === 'string' ? ej.nota.trim() : '';

    ej.series.forEach(function (s, i) {
      const serie = Number(s.serie);
      const peso = Number(s.peso);
      const reps = Number(s.reps);
      if (!Number.isInteger(serie) || serie < 1 || serie > 10) throw new Error('Serie nº no válida en ' + ej.nombre);
      if (!isFinite(peso) || peso < 0) throw new Error('Peso no válido en ' + ej.nombre + ' (serie ' + serie + ')');
      if (!Number.isInteger(reps) || reps < 0 || reps > 100) throw new Error('Reps no válidas en ' + ej.nombre + ' (serie ' + serie + ')');

      // La nota del ejercicio va solo en la fila de su primera serie enviada.
      filas.push([fecha, '', sesion.sesion, ej.nombre, serie, peso, reps, i === 0 ? nota : '']);
    });
  });

  if (filas.length === 0) throw new Error('La sesión no tiene ninguna serie.');
  return filas;
}

/** Filas [Fecha, Sesión, Ejercicio, Minutos] para la pestaña Tiempos (puede ir vacío). */
function construirTiempos(sesion) {
  const fecha = parsearFecha(sesion.fecha);
  const out = [];
  (sesion.tiempos || []).forEach(function (t) {
    const min = Number(t.minutos);
    if (!t.ejercicio || !isFinite(min) || min < 0 || min > 600) return;
    out.push([fecha, sesion.sesion, String(t.ejercicio), Math.round(min * 10) / 10]);
  });
  const total = Number(sesion.duracion);
  if (isFinite(total) && total > 0 && total <= 600) {
    out.push([fecha, sesion.sesion, TOTAL_SESION, Math.round(total * 10) / 10]);
  }
  return out;
}

/** "2026-11-03" → Date a las 12:00 (las 12:00 evitan saltos de día por zona horaria). */
function parsearFecha(texto) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(texto || ''));
  if (!m) throw new Error('Fecha no válida: ' + texto);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
}

/**
 * Primera fila vacía después del último dato en la columna A (Fecha) de Registro.
 * No usamos getLastRow() porque las ARRAYFORMULA de I/J y las instrucciones
 * de la columna L hacen que no refleje dónde acaban los datos.
 */
function primeraFilaLibre(hoja) {
  const ultima = hoja.getLastRow();
  if (ultima < PRIMERA_FILA_DATOS) return PRIMERA_FILA_DATOS;
  const columnaA = hoja.getRange(PRIMERA_FILA_DATOS, 1, ultima - PRIMERA_FILA_DATOS + 1, 1).getValues();
  for (let i = columnaA.length - 1; i >= 0; i--) {
    if (columnaA[i][0] !== '' && columnaA[i][0] !== null) return PRIMERA_FILA_DATOS + i + 1;
  }
  return PRIMERA_FILA_DATOS;
}

function asegurarFilas(hoja, ultimaNecesaria) {
  if (ultimaNecesaria > hoja.getMaxRows()) {
    hoja.insertRowsAfter(hoja.getMaxRows(), ultimaNecesaria - hoja.getMaxRows() + 100);
  }
}

/* ============================ Lectura ============================ */

/**
 * Todas las series de "Registro": [fecha "yyyy-MM-dd", sesión, ejercicio, serie nº, peso, reps, nota]
 * Ignora filas sin fecha, sin ejercicio o sin reps.
 */
function leerRegistro() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hoja = ss.getSheetByName(HOJA_REGISTRO);
  if (!hoja) return [];
  const ultima = hoja.getLastRow();
  if (ultima < PRIMERA_FILA_DATOS) return [];
  const tz = ss.getSpreadsheetTimeZone();
  const valores = hoja.getRange(PRIMERA_FILA_DATOS, 1, ultima - PRIMERA_FILA_DATOS + 1, NUM_COLUMNAS).getValues();

  const filas = [];
  valores.forEach(function (v) {
    const fecha = normalizarFecha(v[0], tz);
    const ejercicio = String(v[3] || '').trim();
    const reps = aNumero(v[6]);
    if (!fecha || !ejercicio || reps === null) return;
    filas.push([fecha, String(v[2] || '').trim(), ejercicio, aNumero(v[4]) || 0, aNumero(v[5]) || 0, reps, String(v[7] || '').trim()]);
  });
  return filas;
}

/** { "Press banca": "3,5 min", ... } desde la pestaña Rutina (C = ejercicio, F = descanso) */
function leerDescansos() {
  const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_RUTINA);
  const out = {};
  if (!hoja || hoja.getLastRow() < 2) return out;
  hoja.getRange(2, 1, hoja.getLastRow() - 1, 6).getValues().forEach(function (v) {
    const nombre = String(v[2] || '').trim();
    const descanso = String(v[5] || '').trim();
    if (nombre && descanso) out[nombre] = descanso;
  });
  return out;
}

/** [[fecha, sesión, ejercicio, minutos], ...] desde la pestaña Tiempos */
function leerTiempos() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hoja = ss.getSheetByName(HOJA_TIEMPOS);
  if (!hoja || hoja.getLastRow() < 2) return [];
  const tz = ss.getSpreadsheetTimeZone();
  const out = [];
  hoja.getRange(2, 1, hoja.getLastRow() - 1, 4).getValues().forEach(function (v) {
    const fecha = normalizarFecha(v[0], tz);
    const min = aNumero(v[3]);
    if (fecha && v[2] && min !== null) out.push([fecha, String(v[1] || '').trim(), String(v[2]).trim(), min]);
  });
  return out;
}

/** Fecha de la celda (Date o texto "dd/mm/aaaa") → "yyyy-MM-dd", o null. */
function normalizarFecha(v, tz) {
  if (v instanceof Date && !isNaN(v.getTime())) return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(v || '').trim());
  if (!m) return null;
  return m[3] + '-' + dos(m[2]) + '-' + dos(m[1]);
}

function dos(x) { return ('0' + x).slice(-2); }

/** Número de la celda (acepta "62,5"), o null si está vacía o no es un número. */
function aNumero(v) {
  if (typeof v === 'number') return v;
  const t = String(v === null || v === undefined ? '' : v).trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return isFinite(n) ? n : null;
}

/* ============================ Descansos (pestaña Rutina) ============================ */

function guardarDescanso(ejercicio, segundos) {
  const seg = Number(segundos);
  if (!isFinite(seg) || seg < 15 || seg > 900) throw new Error('Descanso no válido.');
  const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_RUTINA);
  if (!hoja) throw new Error('No existe la pestaña "' + HOJA_RUTINA + '".');
  const nombres = hoja.getRange(2, 3, Math.max(hoja.getLastRow() - 1, 1), 1).getValues();
  for (let i = 0; i < nombres.length; i++) {
    if (String(nombres[i][0]).trim() === ejercicio) {
      const texto = String(Math.round((seg / 60) * 100) / 100).replace('.', ',') + ' min';
      hoja.getRange(i + 2, 6).setValue(texto);
      return { ok: true, descanso: texto };
    }
  }
  throw new Error('No encuentro "' + ejercicio + '" en la pestaña Rutina.');
}

/* ============================ Tiempos ============================ */

function hojaTiempos(crear) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let hoja = ss.getSheetByName(HOJA_TIEMPOS);
  if (!hoja && crear) {
    hoja = ss.insertSheet(HOJA_TIEMPOS);
    hoja.getRange(1, 1, 1, 4).setValues([['Fecha', 'Sesión', 'Ejercicio', 'Minutos']]).setFontWeight('bold');
    hoja.setFrozenRows(1);
  }
  return hoja;
}

/* ============================ Perfil ============================ */
/*  Pestaña Perfil:
 *    A1 Dato | B1 Valor          D1 Fecha | E1 Peso (kg)
 *    A2 Nombre                   (historial de peso, una fila por registro)
 *    A3 Fecha de nacimiento
 *    A4 Altura (cm)
 */
const CAMPOS_PERFIL = { nombre: 'Nombre', nacimiento: 'Fecha de nacimiento', altura: 'Altura (cm)' };

function hojaPerfil(crear) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let hoja = ss.getSheetByName(HOJA_PERFIL);
  if (!hoja && crear) {
    hoja = ss.insertSheet(HOJA_PERFIL);
    hoja.getRange(1, 1, 4, 2).setValues([['Dato', 'Valor'], [CAMPOS_PERFIL.nombre, ''], [CAMPOS_PERFIL.nacimiento, ''], [CAMPOS_PERFIL.altura, '']]);
    hoja.getRange(1, 4, 1, 2).setValues([['Fecha', 'Peso (kg)']]);
    hoja.getRange(1, 1, 1, 5).setFontWeight('bold');
    hoja.setFrozenRows(1);
  }
  return hoja;
}

/** Fila (1-based) de un dato del perfil, buscando la etiqueta en la columna A */
function filaCampo(hoja, etiqueta) {
  const etiquetas = hoja.getRange(1, 1, Math.max(hoja.getLastRow(), 4), 1).getValues();
  for (let i = 0; i < etiquetas.length; i++) if (String(etiquetas[i][0]).trim() === etiqueta) return i + 1;
  return null;
}

function leerPerfil() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hoja = hojaPerfil(false);
  if (!hoja) return null;
  const tz = ss.getSpreadsheetTimeZone();
  const valor = function (etiqueta) {
    const f = filaCampo(hoja, etiqueta);
    return f ? hoja.getRange(f, 2).getValue() : '';
  };
  const pesos = [];
  const ultima = ultimaFilaColumna(hoja, 4);
  if (ultima >= 2) {
    hoja.getRange(2, 4, ultima - 1, 2).getValues().forEach(function (v) {
      const f = normalizarFecha(v[0], tz);
      const p = aNumero(v[1]);
      if (f && p !== null) pesos.push([f, p]);
    });
  }
  pesos.sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0; });
  return {
    nombre: String(valor(CAMPOS_PERFIL.nombre) || '').trim(),
    nacimiento: normalizarFecha(valor(CAMPOS_PERFIL.nacimiento), tz),
    altura: aNumero(valor(CAMPOS_PERFIL.altura)),
    pesos: pesos
  };
}

function guardarPerfil(p) {
  if (!p || typeof p !== 'object') throw new Error('Faltan los datos del perfil.');
  const altura = p.altura === '' || p.altura === null || p.altura === undefined ? '' : Number(p.altura);
  if (altura !== '' && (!isFinite(altura) || altura < 100 || altura > 250)) throw new Error('Altura no válida (en cm).');
  const nacimiento = p.nacimiento ? parsearFecha(p.nacimiento) : '';
  const hoja = hojaPerfil(true);
  const escribir = function (etiqueta, valor, formato) {
    let f = filaCampo(hoja, etiqueta);
    if (!f) { f = hoja.getLastRow() + 1; hoja.getRange(f, 1).setValue(etiqueta); }
    const celda = hoja.getRange(f, 2);
    celda.setValue(valor);
    if (formato) celda.setNumberFormat(formato);
  };
  escribir(CAMPOS_PERFIL.nombre, String(p.nombre || '').trim().slice(0, 40));
  escribir(CAMPOS_PERFIL.nacimiento, nacimiento, 'dd/mm/yyyy');
  escribir(CAMPOS_PERFIL.altura, altura);
  SpreadsheetApp.flush();
  return { ok: true };
}

/** Añade (o corrige, si ya hay uno ese día) un registro de peso corporal */
function guardarPeso(fechaTxt, peso) {
  const kg = Number(peso);
  if (!isFinite(kg) || kg < 30 || kg > 300) throw new Error('Peso no válido.');
  const fecha = parsearFecha(fechaTxt);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tz = ss.getSpreadsheetTimeZone();
  const hoja = hojaPerfil(true);
  const ultima = ultimaFilaColumna(hoja, 4);
  let fila = ultima + 1;
  if (ultima >= 2) {
    const fechas = hoja.getRange(2, 4, ultima - 1, 1).getValues();
    for (let i = 0; i < fechas.length; i++) {
      if (normalizarFecha(fechas[i][0], tz) === fechaTxt) { fila = i + 2; break; }
    }
  }
  asegurarFilas(hoja, fila);
  hoja.getRange(fila, 4, 1, 2).setValues([[fecha, kg]]);
  hoja.getRange(fila, 4).setNumberFormat('dd/mm/yyyy');
  SpreadsheetApp.flush();
  return { ok: true };
}

/** Última fila con datos en una columna concreta (las demás columnas pueden ser más largas) */
function ultimaFilaColumna(hoja, col) {
  const ultima = hoja.getLastRow();
  if (ultima < 1) return 0;
  const v = hoja.getRange(1, col, ultima, 1).getValues();
  for (let i = v.length - 1; i >= 0; i--) if (v[i][0] !== '' && v[i][0] !== null) return i + 1;
  return 0;
}

/* ============================ Resumen semanal por email ============================ */

/**
 * Ejecuta esta función UNA VEZ desde el editor para activar el email de cada lunes
 * hacia las 7:00 (zona horaria del proyecto: Configuración del proyecto ⚙).
 * Si la ejecutas otra vez, sustituye el activador anterior (no se duplica).
 */
function activarResumenSemanal() {
  desactivarResumenSemanal();
  ScriptApp.newTrigger('enviarResumenSemanal')
    .timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(7).nearMinute(0).everyWeeks(1)
    .create();
  Logger.log('✓ Resumen semanal activado: cada lunes hacia las 7:00 (zona horaria: ' + Session.getScriptTimeZone() + ').');
}

/** Quita el envío automático del resumen semanal. */
function desactivarResumenSemanal() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'enviarResumenSemanal') ScriptApp.deleteTrigger(t);
  });
}

/** Envía ahora mismo el resumen de la semana pasada (para probarlo). */
function probarResumenSemanal() {
  enviarResumenSemanal();
  Logger.log('✓ Resumen enviado a ' + Session.getEffectiveUser().getEmail());
}

function enviarResumenSemanal() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tz = ss.getSpreadsheetTimeZone();
  const hoyIso = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  const r = calcularResumen(leerRegistro(), leerTiempos(), hoyIso);
  const perfil = leerPerfil();
  MailApp.sendEmail({
    to: Session.getEffectiveUser().getEmail(),
    subject: 'EDUX TRAINING · Tu semana (' + r.rango + ')',
    htmlBody: htmlResumen(r, perfil && perfil.nombre),
    name: 'EDUX TRAINING'
  });
}

/* --- fechas "yyyy-MM-dd" sin líos de zona horaria (aritmética en UTC) --- */
function isoAUtc(iso) { const p = iso.split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); }
function utcAIso(d) { return d.toISOString().slice(0, 10); }
function sumarDias(iso, n) { const d = isoAUtc(iso); d.setUTCDate(d.getUTCDate() + n); return utcAIso(d); }
function lunesDe(iso) { const d = isoAUtc(iso); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return utcAIso(d); }
const MESES_C = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function fechaTxt(iso) { const d = isoAUtc(iso); return d.getUTCDate() + ' ' + MESES_C[d.getUTCMonth()]; }
function numTxt(n, dec) { const f = Math.pow(10, dec === undefined ? 1 : dec); return String(Math.round(n * f) / f).replace('.', ','); }
function volTxt(kg) { return kg >= 1000 ? numTxt(kg / 1000, 1) + ' t' : numTxt(kg, 0) + ' kg'; }
function rm1(peso, reps) { return Math.round(peso * (1 + reps / 30) * 10) / 10; }

/**
 * Datos del resumen de la semana anterior a la de "hoyIso" (lunes a domingo).
 * Función pura (sin acceso a la hoja) para poder probarla.
 */
function calcularResumen(filas, tiempos, hoyIso) {
  const lunes = lunesDe(hoyIso);
  const ini = sumarDias(lunes, -7), fin = sumarDias(lunes, -1);
  const iniPrev = sumarDias(ini, -7), finPrev = sumarDias(ini, -1);

  const semana = function (a, b) {
    const sel = filas.filter(function (f) { return f[0] >= a && f[0] <= b; });
    const sesiones = {};
    let volumen = 0;
    sel.forEach(function (f) { sesiones[f[0] + '|' + f[1]] = { fecha: f[0], sesion: f[1] }; volumen += f[4] * f[5]; });
    const lista = Object.keys(sesiones).sort().map(function (k) { return sesiones[k]; });
    let minutos = 0;
    tiempos.forEach(function (t) { if (t[0] >= a && t[0] <= b && t[2] === TOTAL_SESION) minutos += t[3]; });
    return { filas: sel, sesiones: lista, series: sel.length, volumen: volumen, minutos: minutos };
  };
  const act = semana(ini, fin);
  const prev = semana(iniPrev, finPrev);

  // Series por músculo (principal 1, secundario ½)
  const musculos = {};
  ORDEN_MUSCULOS.forEach(function (m) { musculos[m] = 0; });
  act.filas.forEach(function (f) {
    const m = MUSCULOS[f[2]];
    if (!m) return;
    m.forEach(function (mus, i) { musculos[mus] += i === 0 ? 1 : 0.5; });
  });

  // Récords batidos en la semana (la primera vez de un ejercicio no cuenta)
  const porEj = {};
  filas.forEach(function (f) {
    const k = f[2];
    porEj[k] = porEj[k] || {};
    const d = porEj[k][f[0]] = porEj[k][f[0]] || { peso: 0, rm: 0 };
    d.peso = Math.max(d.peso, f[4]);
    d.rm = Math.max(d.rm, rm1(f[4], f[5]));
  });
  const records = [];
  Object.keys(porEj).forEach(function (ej) {
    const dias = Object.keys(porEj[ej]).sort();
    let bestP = null, bestR = null;
    dias.forEach(function (dia) {
      const d = porEj[ej][dia];
      if (bestP !== null && dia >= ini && dia <= fin) {
        if (d.peso > bestP) records.push({ ejercicio: ej, fecha: dia, texto: numTxt(d.peso, 2) + ' kg (antes ' + numTxt(bestP, 2) + ')' });
        else if (d.rm > bestR) records.push({ ejercicio: ej, fecha: dia, texto: '1RM est. ' + numTxt(d.rm) + ' kg (antes ' + numTxt(bestR) + ')' });
      }
      bestP = bestP === null ? d.peso : Math.max(bestP, d.peso);
      bestR = bestR === null ? d.rm : Math.max(bestR, d.rm);
    });
  });

  // Siguiente sesión según la rotación
  let ultima = null;
  filas.forEach(function (f) {
    if (SESIONES_VALIDAS.indexOf(f[1]) === -1) return;
    if (!ultima || f[0] > ultima.fecha || (f[0] === ultima.fecha && SESIONES_VALIDAS.indexOf(f[1]) > SESIONES_VALIDAS.indexOf(ultima.sesion))) {
      ultima = { fecha: f[0], sesion: f[1] };
    }
  });
  const siguiente = ultima ? SESIONES_VALIDAS[(SESIONES_VALIDAS.indexOf(ultima.sesion) + 1) % SESIONES_VALIDAS.length] : SESIONES_VALIDAS[0];

  return {
    rango: fechaTxt(ini) + ' – ' + fechaTxt(fin),
    act: act, prev: prev, musculos: musculos, records: records, siguiente: siguiente
  };
}

function htmlResumen(r, nombre) {
  const morado = '#9b6cf6';
  const cambio = function (a, b, fmt) {
    if (!b) return '';
    const d = a - b;
    if (Math.abs(d) < 1e-9) return '<span style="color:#8a8599">= igual que la semana anterior</span>';
    return '<span style="color:' + (d > 0 ? '#34d399' : '#f87171') + '">' + (d > 0 ? '↑ +' : '↓ −') + fmt(Math.abs(d)) + ' vs semana anterior</span>';
  };
  const caja = function (valor, etiqueta, extra) {
    return '<td style="width:50%;padding:6px"><div style="background:#121018;border:1px solid #262230;border-radius:14px;padding:14px">' +
      '<div style="font-size:12px;color:#8a8599">' + etiqueta + '</div>' +
      '<div style="font-size:26px;font-weight:800;color:#f4f2fa;margin-top:2px">' + valor + '</div>' +
      '<div style="font-size:12px;margin-top:2px">' + (extra || '&nbsp;') + '</div></div></td>';
  };
  const a = r.act, p = r.prev;
  let html = '<div style="background:#09080d;padding:24px 12px;font-family:Segoe UI,Roboto,Arial,sans-serif;color:#f4f2fa">' +
    '<div style="max-width:560px;margin:0 auto">' +
    '<div style="font-weight:800;letter-spacing:4px;font-size:15px">EDUX <span style="color:#c4b5fd;font-weight:600;letter-spacing:6px;font-size:11px">TRAINING</span></div>' +
    '<h1 style="margin:18px 0 4px;font-size:24px">' + (nombre ? 'Buenos días, ' + nombre : 'Buenos días') + '</h1>' +
    '<div style="color:#bdb7cc">Tu semana del ' + r.rango + '</div>';

  if (!a.sesiones.length) {
    html += '<div style="margin-top:18px;background:#121018;border:1px solid #262230;border-radius:14px;padding:18px">La semana pasada no registraste entrenos. ¡Esta semana a por ello! 💪</div>';
  } else {
    html += '<table style="width:100%;border-collapse:collapse;margin-top:14px"><tr>' +
      caja(a.sesiones.length, 'Sesiones', cambio(a.sesiones.length, p.sesiones.length, function (x) { return x; })) +
      caja(a.series, 'Series', cambio(a.series, p.series, function (x) { return x; })) + '</tr><tr>' +
      caja(volTxt(a.volumen), 'Volumen (kg × reps)', cambio(a.volumen, p.volumen, volTxt)) +
      caja(a.minutos ? Math.round(a.minutos) + ' min' : '—', 'Tiempo entrenando', a.minutos && p.minutos ? cambio(a.minutos, p.minutos, function (x) { return Math.round(x) + ' min'; }) : '') +
      '</tr></table>';

    html += '<h2 style="font-size:13px;letter-spacing:2px;color:#8a8599;margin:22px 0 8px">SESIONES</h2><div style="color:#bdb7cc">' +
      a.sesiones.map(function (s) { return fechaTxt(s.fecha) + ' · <b style="color:#f4f2fa">' + s.sesion + '</b>'; }).join('<br>') + '</div>';

    html += '<h2 style="font-size:13px;letter-spacing:2px;color:#8a8599;margin:22px 0 8px">🏆 RÉCORDS</h2>';
    html += r.records.length
      ? r.records.map(function (x) { return '<div style="padding:6px 0;border-top:1px solid #262230"><b>' + x.ejercicio + '</b><br><span style="color:#bdb7cc">' + fechaTxt(x.fecha) + ' · ' + x.texto + '</span></div>'; }).join('')
      : '<div style="color:#bdb7cc">Ningún récord esta semana. ¡La próxima cae!</div>';

    const max = Math.max.apply(null, ORDEN_MUSCULOS.map(function (m) { return r.musculos[m]; }).concat([1]));
    html += '<h2 style="font-size:13px;letter-spacing:2px;color:#8a8599;margin:22px 0 8px">SERIES POR MÚSCULO</h2><table style="width:100%;border-collapse:collapse">';
    ORDEN_MUSCULOS.forEach(function (m) {
      const v = r.musculos[m];
      html += '<tr><td style="width:90px;padding:3px 8px 3px 0;color:#bdb7cc;font-size:13px">' + m + '</td>' +
        '<td style="padding:3px 0"><div style="background:' + morado + ';height:12px;border-radius:0 4px 4px 0;width:' + Math.max(v / max * 100, v ? 2 : 0) + '%"></div></td>' +
        '<td style="width:40px;text-align:right;font-size:13px;font-weight:700;color:#f4f2fa">' + numTxt(v) + '</td></tr>';
    });
    html += '</table>';
  }

  html += '<div style="margin-top:22px;border-radius:16px;padding:18px;background:linear-gradient(135deg,#b16cf9,#7c3aed 55%,#5b21b6);background-color:#7c3aed">' +
    '<div style="font-size:11px;font-weight:800;letter-spacing:3px;opacity:.85">SIGUIENTE ENTRENO</div>' +
    '<div style="font-size:28px;font-weight:900;text-transform:uppercase;margin-top:4px">' + r.siguiente + '</div></div>' +
    '<div style="color:#8a8599;font-size:11px;margin-top:18px;text-align:center">Enviado por el script de tu hoja de seguimiento.</div>' +
    '</div></div>';
  return html;
}
