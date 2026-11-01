'use strict';

/* =====================================================================
 * Comunicación con el script de la hoja (Google Apps Script).
 *  - tipo 'ping':   prueba de conexión (no escribe nada)
 *  - tipo 'sesion': escribe una sesión en Registro
 *  - tipo 'datos':  devuelve Registro, descansos, Tiempos y Perfil
 *  - tipo 'perfil' / 'peso' / 'descanso': guardan datos en la hoja
 * ===================================================================== */

let enviando = false;
let actualizando = false;

async function llamarScript(cuerpo, timeoutMs = 45000) {
  const config = leer(K.config, {});
  const control = new AbortController();
  const t = setTimeout(() => control.abort(), timeoutMs);
  try {
    // text/plain evita la petición previa CORS que Apps Script no admite.
    const resp = await fetch(config.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ clave: config.clave, ...cuerpo }),
      redirect: 'follow',
      signal: control.signal
    });
    const texto = await resp.text();
    try {
      return JSON.parse(texto);
    } catch (e) {
      return { ok: false, error: 'Respuesta inesperada del script. Revisa la URL y que el acceso sea "Cualquier usuario".' };
    }
  } catch (e) {
    return { ok: false, red: true, error: 'No se pudo conectar con la hoja.' };
  } finally {
    clearTimeout(t);
  }
}

function mensajeError(r) {
  if (/desconocido/i.test(r.error || '')) {
    return 'El script de la hoja es la versión antigua. Actualízalo (ver README).';
  }
  return r.error;
}

/** Envía las sesiones pendientes, una a una. Después descarga los datos actualizados.
 *  Devuelve cuántas se enviaron. */
async function enviarPendientes({ silencioso = false } = {}) {
  if (enviando) return 0;
  const pendientes = leer(K.pendientes, []);
  if (!pendientes.length) return 0;
  if (!configCompleta()) {
    if (!silencioso) aviso('Sesión guardada. Configura el envío en Ajustes para mandarla a la hoja.', 'atencion', 8);
    return 0;
  }
  if (!navigator.onLine) {
    if (!silencioso) aviso('Sin conexión. La sesión queda pendiente y se enviará cuando haya internet.', 'atencion', 8);
    return 0;
  }

  enviando = true;
  aviso('Enviando a la hoja…', 'info', 0);
  let enviadas = 0;
  let error = null;
  try {
    while (true) {
      const cola = leer(K.pendientes, []);
      if (!cola.length) break;
      const s = cola[0];
      const r = await llamarScript({ tipo: 'sesion', sesion: s });
      if (!r.ok) { error = r; break; }
      // La hoja la tiene: se quita del móvil.
      guardar(K.pendientes, leer(K.pendientes, []).filter((p) => p.id !== s.id));
      enviadas++;
    }
  } finally {
    enviando = false;
  }

  if (error) {
    aviso(error.red ? 'No se pudo enviar (sin conexión). Queda pendiente.' : 'Error al enviar: ' + mensajeError(error), 'error', 10);
  } else if (enviadas) {
    aviso(enviadas === 1 ? 'Sesión guardada en la hoja' : `${enviadas} sesiones guardadas en la hoja`, 'ok', 4);
  }
  invalidarIndice();
  alCambiarDatos();
  if (enviadas) await actualizarDatos();
  return enviadas;
}

/** Descarga todo el Registro de la hoja y sustituye la copia local. */
async function actualizarDatos({ silencioso = true } = {}) {
  if (actualizando) return false;
  if (!configCompleta()) {
    if (!silencioso) aviso('Configura primero la URL y la clave.', 'error');
    return false;
  }
  if (!navigator.onLine) {
    if (!silencioso) aviso('Sin conexión: se muestran los últimos datos descargados.', 'atencion');
    return false;
  }
  actualizando = true;
  alCambiarDatos();
  const r = await llamarScript({ tipo: 'datos' }, 60000);
  actualizando = false;
  if (r.ok && Array.isArray(r.filas)) {
    guardar(K.cache, {
      actualizado: new Date().toISOString(),
      filas: r.filas,
      descansos: r.descansos || {},
      tiempos: r.tiempos || [],
      perfil: r.perfil || null
    });
    invalidarIndice();
    alCambiarDatos();
    if (!silencioso) aviso('Datos actualizados desde la hoja', 'ok', 3);
    return true;
  }
  alCambiarDatos();
  if (!silencioso || !r.red) aviso('No se pudieron descargar los datos: ' + mensajeError(r), 'error', 8);
  return false;
}

/**
 * Escritura directa en la hoja (perfil, peso, descanso). Necesita internet.
 * Si va bien, vuelve a descargar los datos para que la app muestre lo que hay en la hoja.
 */
async function escribirEnHoja(cuerpo, mensajeOk) {
  if (!configCompleta()) { aviso('Configura primero la conexión en Ajustes.', 'error'); return false; }
  if (!navigator.onLine) { aviso('Sin conexión: para guardar en la hoja necesitas internet.', 'atencion'); return false; }
  const r = await llamarScript(cuerpo);
  if (!r.ok) { aviso('No se pudo guardar: ' + mensajeError(r), 'error', 8); return false; }
  await actualizarDatos();
  if (mensajeOk) aviso(mensajeOk, 'ok', 3);
  return r;
}
