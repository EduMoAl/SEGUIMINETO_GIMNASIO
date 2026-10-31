/**
 * Seguimiento gimnasio – receptor de sesiones.
 *
 * Se pega en la hoja "Seguimiento entreno – PPL + torso" (Extensiones → Apps Script)
 * y se publica como aplicación web. La app del móvil le envía cada sesión terminada
 * y este script escribe una fila por serie en la pestaña "Registro" (columnas A–H).
 *
 * Las columnas I y J (Volumen y 1RM) las calcula la propia hoja con ARRAYFORMULA:
 * este script NO las toca.
 */

const NOMBRE_HOJA = 'Registro';
const PRIMERA_FILA_DATOS = 3;   // filas 1 y 2 son cabeceras
const NUM_COLUMNAS = 8;         // A Fecha · B Semana · C Sesión · D Ejercicio · E Serie nº · F Peso · G Reps · H Notas
const SESIONES_VALIDAS = ['Empuje', 'Tirón', 'Pierna', 'Fullbody'];
const PREFIJO_ENVIADA = 'enviada_';

/**
 * Ejecuta esta función UNA VEZ desde el editor (botón ▶ Ejecutar).
 * Crea la clave secreta (si no existe) y la muestra en el registro de ejecución.
 * Esa clave es la que pegarás en Ajustes dentro de la app.
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

/** Punto de entrada de la aplicación web: la app hace POST con un JSON. */
function doPost(e) {
  let datos;
  try {
    datos = JSON.parse(e.postData.contents);
  } catch (err) {
    return responder({ ok: false, error: 'Datos ilegibles (JSON inválido).' });
  }

  const props = PropertiesService.getScriptProperties();
  const clave = props.getProperty('CLAVE');
  if (!clave) {
    return responder({ ok: false, error: 'El script no tiene clave. Ejecuta generarClave() en el editor.' });
  }
  if (datos.clave !== clave) {
    return responder({ ok: false, error: 'Clave incorrecta.' });
  }

  // Prueba de conexión desde Ajustes: no escribe nada.
  if (datos.tipo === 'ping') {
    return responder({ ok: true, mensaje: 'Conexión correcta.' });
  }

  // La app pide todo el Registro para el historial, las gráficas y "última vez".
  if (datos.tipo === 'datos') {
    return responder({ ok: true, filas: leerRegistro() });
  }

  if (datos.tipo !== 'sesion') {
    return responder({ ok: false, error: 'Tipo de petición desconocido.' });
  }

  let filas;
  try {
    filas = construirFilas(datos.sesion);
  } catch (err) {
    return responder({ ok: false, error: err.message });
  }

  // Un solo envío a la vez, para que dos sesiones no se pisen.
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    return responder({ ok: false, error: 'La hoja está ocupada, reintenta en un momento.' });
  }
  try {
    const id = datos.sesion.id;
    // Si ya la recibimos (p. ej. se cortó la conexión justo después), no la duplicamos.
    if (props.getProperty(PREFIJO_ENVIADA + id)) {
      return responder({ ok: true, duplicada: true, filas: 0 });
    }

    const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NOMBRE_HOJA);
    if (!hoja) {
      return responder({ ok: false, error: 'No existe la pestaña "' + NOMBRE_HOJA + '".' });
    }

    const fila = primeraFilaLibre(hoja);
    const ultimaNecesaria = fila + filas.length - 1;
    if (ultimaNecesaria > hoja.getMaxRows()) {
      hoja.insertRowsAfter(hoja.getMaxRows(), ultimaNecesaria - hoja.getMaxRows() + 100);
    }

    hoja.getRange(fila, 1, filas.length, NUM_COLUMNAS).setValues(filas);
    hoja.getRange(fila, 1, filas.length, 1).setNumberFormat('dd/mm/yyyy');
    SpreadsheetApp.flush();

    props.setProperty(PREFIJO_ENVIADA + id, new Date().toISOString());
    return responder({ ok: true, filas: filas.length, desdeFila: fila });
  } finally {
    lock.releaseLock();
  }
}

/** Abrir la URL en el navegador solo confirma que el script está publicado. */
function doGet() {
  return responder({ ok: true, mensaje: 'Script de seguimiento activo. Usa la app para enviar sesiones.' });
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

/** "2026-11-03" → Date a las 12:00 (las 12:00 evitan saltos de día por zona horaria). */
function parsearFecha(texto) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(texto || ''));
  if (!m) throw new Error('Fecha no válida: ' + texto);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
}

/**
 * Primera fila vacía después del último dato en la columna A (Fecha).
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

/**
 * Devuelve todas las series de "Registro" en formato compacto:
 * [fecha "yyyy-MM-dd", sesión, ejercicio, serie nº, peso, reps, nota]
 * Ignora filas sin fecha, sin ejercicio o sin reps.
 */
function leerRegistro() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hoja = ss.getSheetByName(NOMBRE_HOJA);
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
    filas.push([
      fecha,
      String(v[2] || '').trim(),
      ejercicio,
      aNumero(v[4]) || 0,
      aNumero(v[5]) || 0,
      reps,
      String(v[7] || '').trim()
    ]);
  });
  return filas;
}

/** Fecha de la celda (Date o texto "dd/mm/aaaa") → "yyyy-MM-dd", o null. */
function normalizarFecha(v, tz) {
  if (v instanceof Date && !isNaN(v.getTime())) return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(v || '').trim());
  if (!m) return null;
  const dos = function (x) { return ('0' + x).slice(-2); };
  return m[3] + '-' + dos(m[2]) + '-' + dos(m[1]);
}

/** Número de la celda (acepta "62,5"), o null si está vacía o no es un número. */
function aNumero(v) {
  if (typeof v === 'number') return v;
  const t = String(v === null || v === undefined ? '' : v).trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return isFinite(n) ? n : null;
}

function responder(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
