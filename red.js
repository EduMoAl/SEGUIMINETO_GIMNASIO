'use strict';

/* =====================================================================
 * Comunicación con el script central (Google Apps Script).
 * Cada petición lleva la clave de tu cuenta: el script solo abre TU hoja.
 *  - 'ping':   prueba de conexión (devuelve tu nombre)
 *  - 'datos':  rutina, perfil y sesiones. La app manda las huellas de las
 *              sesiones que ya tiene y el script solo envía las nuevas o cambiadas.
 *  - 'sesion': guarda una sesión
 *  - 'perfil' / 'peso' / 'descanso': guardan datos en la hoja
 *  - 'usuarios', 'crearUsuario', …: panel de usuarios (solo administrador)
 * ===================================================================== */

let enviando = false;
let actualizando = false;

async function llamarScript(cuerpo, timeoutMs = 45000, config = leer(K.config, {})) {
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
      return { ok: false, error: 'Respuesta inesperada del script. Revisa que la aplicación web esté implementada con acceso "Cualquier usuario".' };
    }
  } catch (e) {
    return { ok: false, red: true, error: 'No se pudo conectar con la hoja.' };
  } finally {
    clearTimeout(t);
  }
}

function mensajeError(r) {
  if (/desconocido/i.test(r.error || '')) return 'El script es de una versión antigua. Actualízalo (ver README).';
  if (/clave incorrecta/i.test(r.error || '')) return 'Tu enlace de conexión ya no es válido. Pide uno nuevo al administrador.';
  return r.error;
}

/** Envía las sesiones pendientes, una a una. Después descarga los datos actualizados.
 *  Devuelve cuántas se enviaron. */
async function enviarPendientes({ silencioso = false } = {}) {
  if (enviando) return 0;
  const pendientes = leer(K.pendientes, []);
  if (!pendientes.length) return 0;
  if (!configCompleta()) {
    if (!silencioso) aviso('Sesión guardada en el móvil. Abre tu enlace de conexión para enviarla a la hoja.', 'atencion', 8);
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
  actualizarEstadoRed();
  if (enviadas) await actualizarDatos();
  return enviadas;
}

/**
 * Une la respuesta del script con la copia local: de las sesiones que ya teníamos
 * (misma huella) el script solo manda {id, huella}. Devuelve null si falta alguna.
 */
function unirSesiones(local, remotas) {
  const porHuella = new Map((local || []).map((s) => [s.huella, s]));
  const out = [];
  for (const r of remotas) {
    if (Array.isArray(r.filas)) out.push(r);
    else if (porHuella.has(r.huella)) out.push(porHuella.get(r.huella));
    else return null;
  }
  return out;
}

/** Descarga lo que ha cambiado en la hoja y actualiza la copia local. */
async function actualizarDatos({ silencioso = true, completo = false } = {}) {
  if (actualizando) return false;
  if (!configCompleta()) {
    if (!silencioso) aviso(configAntigua() ? 'Abre tu enlace de conexión nuevo (te llegó por email).' : 'Primero conecta la app con tu enlace de conexión.', 'error', 8);
    return false;
  }
  if (!navigator.onLine) {
    if (!silencioso) aviso('Sin conexión: se muestran los últimos datos descargados.', 'atencion');
    return false;
  }
  actualizando = true;
  alCambiarDatos();
  const claveInicio = leer(K.config, {}).clave;
  let cache = leerCache();
  let r = await llamarScript({ tipo: 'datos', tengo: completo ? [] : (cache.sesiones || []).map((s) => s.huella) }, 60000);
  let sesiones = r.ok && Array.isArray(r.sesiones) ? unirSesiones(cache.sesiones, r.sesiones) : null;
  if (r.ok && Array.isArray(r.sesiones) && !sesiones) {
    // La copia local no cuadra: se descarga todo
    r = await llamarScript({ tipo: 'datos', tengo: [] }, 60000);
    sesiones = r.ok && Array.isArray(r.sesiones) ? unirSesiones([], r.sesiones) : null;
  }
  actualizando = false;
  // Si mientras tanto se cambió de cuenta, esta respuesta es de la anterior: se descarta y se repite
  if (leer(K.config, {}).clave !== claveInicio) return actualizarDatos({ silencioso, completo: true });
  if (r.ok && sesiones) {
    cache = {
      formato: FORMATO_CACHE,
      actualizado: new Date().toISOString(),
      rutina: r.rutina || [],
      perfil: r.perfil || null,
      admin: Boolean(r.admin),
      usuario: r.usuario || null,
      sesiones
    };
    guardar(K.cache, cache);
    cargarRutina(cache.rutina);
    invalidarIndice();
    alCambiarDatos();
    if (!silencioso) aviso(r.nuevas ? `Datos actualizados (${r.nuevas} ${r.nuevas === 1 ? 'sesión nueva' : 'sesiones nuevas'})` : 'Datos al día', 'ok', 3);
    return true;
  }
  alCambiarDatos();
  if (r.ok) r = { ok: false, error: 'El script es de una versión antigua. Actualízalo (ver README).' };
  if (!silencioso || !r.red) aviso('No se pudieron descargar los datos: ' + mensajeError(r), 'error', 8);
  return false;
}

/**
 * Escritura directa en la hoja (perfil, peso, descanso). Necesita internet.
 * Si va bien, vuelve a descargar los datos para que la app muestre lo que hay en la hoja.
 */
async function escribirEnHoja(cuerpo, mensajeOk) {
  if (!configCompleta()) { aviso('Primero conecta la app con tu enlace de conexión.', 'error'); return false; }
  if (!navigator.onLine) { aviso('Sin conexión: para guardar en la hoja necesitas internet.', 'atencion'); return false; }
  const r = await llamarScript(cuerpo);
  if (!r.ok) { aviso('No se pudo guardar: ' + mensajeError(r), 'error', 8); return false; }
  await actualizarDatos();
  if (mensajeOk) aviso(mensajeOk, 'ok', 3);
  return r;
}

/** Peticiones del panel de usuarios (solo administrador). Devuelve la respuesta o null. */
async function llamarAdmin(cuerpo, mensajeOk) {
  if (!navigator.onLine) { aviso('Sin conexión: el panel de usuarios necesita internet.', 'atencion'); return null; }
  const r = await llamarScript(cuerpo);
  if (!r.ok) { aviso(mensajeError(r), 'error', 8); return null; }
  if (mensajeOk) aviso(mensajeOk, 'ok', 4);
  return r;
}

/**
 * Conecta la app a una cuenta (enlace de conexión o datos escritos a mano).
 * Si es otra cuenta distinta, se borra la copia local de la anterior.
 */
async function conectarCuenta(datos) {
  const previa = leer(K.config, {});
  const otraCuenta = previa.clave && previa.clave !== datos.clave;
  aviso('Conectando…', 'info', 0);
  const r = await llamarScript({ tipo: 'ping' }, 45000, datos);
  if (!r.ok) { aviso(r.red ? 'No se pudo conectar (¿hay internet?). Vuelve a abrir el enlace.' : mensajeError(r), 'error', 10); return false; }
  if (!(r.version >= 2)) { aviso('Ese script es de la versión antigua: usa el enlace del script central.', 'error', 10); return false; }
  guardar(K.config, { url: datos.url, clave: datos.clave, v2: true, nombre: r.nombre || '' });
  if (otraCuenta || !leer(K.cache, null) || leer(K.cache, {}).formato !== FORMATO_CACHE) {
    localStorage.removeItem(K.cache);
    localStorage.removeItem(K.ejercicioProgreso);
    cargarRutina([]);
    invalidarIndice();
  }
  aviso(`Conectado${r.nombre ? ' como ' + r.nombre : ''}`, 'ok', 4);
  if (!(await enviarPendientes({ silencioso: true }))) await actualizarDatos({ silencioso: true });
  actualizarEstadoRed();
  return true;
}
