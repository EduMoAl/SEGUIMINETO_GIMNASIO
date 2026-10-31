'use strict';

/* =====================================================================
 * Seguimiento gimnasio
 * - Todo se guarda en el móvil (localStorage) en cuanto lo escribes.
 * - Al terminar, la sesión pasa a "pendientes" y se envía a la hoja
 *   (Google Apps Script). Si no hay internet, se reintenta más tarde.
 * ===================================================================== */

// ---------- Almacenamiento local ----------
const K = {
  config: 'gym.config',          // { url, clave }
  actual: 'gym.actual',          // sesión en curso (o null)
  pendientes: 'gym.pendientes',  // sesiones terminadas sin enviar
  ultimo: 'gym.ultimo',          // { [ejercicio]: { fecha, series:[{peso,reps}] } }
  ultimaSesion: 'gym.ultimaSesion', // { [sesion]: fecha }
  enviadas: 'gym.enviadas'       // copia de las últimas sesiones enviadas
};
const MAX_ENVIADAS = 50;

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

// ---------- Utilidades ----------
const $ = (sel, raiz = document) => raiz.querySelector(sel);

function esc(t) {
  return String(t ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function hoy() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fechaCorta(iso) { // "2026-11-03" → "03/11"
  if (!iso) return '';
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

function nuevoId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

/** "62,5" → 62.5 · "" → null · inválido → NaN */
function leerPeso(texto) {
  const t = String(texto ?? '').trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 && n <= 1000 ? n : NaN;
}
/** "8" → 8 · "" → null · inválido → NaN */
function leerReps(texto) {
  const t = String(texto ?? '').trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isInteger(n) && n >= 0 && n <= 100 ? n : NaN;
}

function formatoPeso(n) {
  return String(n).replace('.', ',');
}

function aviso(texto, tipo = 'info', segundos = 5) {
  const el = $('#aviso');
  el.textContent = texto;
  el.className = 'aviso ' + tipo;
  el.hidden = false;
  clearTimeout(aviso._t);
  if (segundos) aviso._t = setTimeout(() => { el.hidden = true; }, segundos * 1000);
}

// ---------- Sesión en curso ----------
function crearSesion(nombreSesion) {
  const datos = {};
  for (const ej of RUTINA[nombreSesion]) {
    datos[ej.nombre] = {
      series: Array.from({ length: ej.series }, () => ({ peso: '', reps: '' })),
      nota: ''
    };
  }
  return { id: nuevoId(), sesion: nombreSesion, fecha: hoy(), inicio: new Date().toISOString(), datos };
}

/**
 * Convierte la sesión en curso en lo que se envía a la hoja.
 * Solo cuentan las series con reps; si el peso está vacío se envía 0 (p. ej. fondos sin lastre).
 */
function analizarSesion(actual) {
  const ejercicios = [];
  const problemas = [];   // impiden terminar
  const avisos = [];      // se puede terminar igualmente

  for (const ej of RUTINA[actual.sesion]) {
    const d = actual.datos[ej.nombre];
    const series = [];
    d.series.forEach((s, i) => {
      const peso = leerPeso(s.peso);
      const reps = leerReps(s.reps);
      if (Number.isNaN(peso)) problemas.push(`${ej.nombre}, serie ${i + 1}: peso no válido`);
      if (Number.isNaN(reps)) problemas.push(`${ej.nombre}, serie ${i + 1}: reps no válidas`);
      if (Number.isNaN(peso) || Number.isNaN(reps)) return;
      if (reps === null) {
        if (peso !== null) avisos.push(`${ej.nombre}, serie ${i + 1}: tiene peso pero no reps (no se enviará)`);
        return;
      }
      series.push({ serie: i + 1, peso: peso ?? 0, reps });
    });
    const nota = d.nota.trim();
    if (series.length) {
      ejercicios.push({ nombre: ej.nombre, nota, series });
    } else if (nota) {
      avisos.push(`${ej.nombre}: tiene nota pero ninguna serie (la nota no se enviará)`);
    }
  }
  const sesion = { id: actual.id, sesion: actual.sesion, fecha: actual.fecha, ejercicios };
  return { sesion, problemas, avisos, totalSeries: ejercicios.reduce((a, e) => a + e.series.length, 0) };
}

function terminarSesion() {
  const actual = leer(K.actual, null);
  if (!actual) return;
  const { sesion } = analizarSesion(actual);

  // 1) A la cola de envío
  const pendientes = leer(K.pendientes, []);
  pendientes.push(sesion);
  guardar(K.pendientes, pendientes);

  // 2) "Última vez" de cada ejercicio
  const ultimo = leer(K.ultimo, {});
  for (const ej of sesion.ejercicios) {
    ultimo[ej.nombre] = { fecha: sesion.fecha, series: ej.series.map((s) => ({ peso: s.peso, reps: s.reps })) };
  }
  guardar(K.ultimo, ultimo);
  const ultimaSesion = leer(K.ultimaSesion, {});
  ultimaSesion[sesion.sesion] = sesion.fecha;
  guardar(K.ultimaSesion, ultimaSesion);

  // 3) Cerrar la sesión en curso
  localStorage.removeItem(K.actual);
}

// ---------- Envío a la hoja ----------
let enviando = false;

async function llamarScript(cuerpo) {
  const config = leer(K.config, {});
  const control = new AbortController();
  const t = setTimeout(() => control.abort(), 45000);
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

function configCompleta() {
  const c = leer(K.config, {});
  return Boolean(c.url && c.clave);
}

async function enviarPendientes({ silencioso = false } = {}) {
  if (enviando) return;
  const pendientes = leer(K.pendientes, []);
  if (!pendientes.length) return;
  if (!configCompleta()) {
    if (!silencioso) aviso('Sesión guardada. Configura el envío en Ajustes (⚙) para mandarla a la hoja.', 'atencion', 8);
    return;
  }
  if (!navigator.onLine) {
    if (!silencioso) aviso('Sin conexión. La sesión queda pendiente y se enviará cuando haya internet.', 'atencion', 8);
    return;
  }

  enviando = true;
  aviso('Enviando a la hoja…', 'info', 0);
  let enviadasAhora = 0;
  let error = null;
  try {
    while (true) {
      const cola = leer(K.pendientes, []);
      if (!cola.length) break;
      const s = cola[0];
      const r = await llamarScript({ tipo: 'sesion', sesion: s });
      if (!r.ok) { error = r; break; }
      // Quitar de la cola (por id, por si cambió mientras tanto) y guardar copia
      guardar(K.pendientes, leer(K.pendientes, []).filter((p) => p.id !== s.id));
      const enviadas = leer(K.enviadas, []);
      enviadas.push({ ...s, enviada: new Date().toISOString() });
      guardar(K.enviadas, enviadas.slice(-MAX_ENVIADAS));
      enviadasAhora++;
    }
  } finally {
    enviando = false;
  }

  if (error) {
    const msg = error.red
      ? 'No se pudo enviar (sin conexión). Queda pendiente.'
      : 'Error al enviar: ' + error.error;
    aviso(msg, 'error', 10);
  } else if (enviadasAhora) {
    aviso(enviadasAhora === 1 ? '✓ Sesión enviada a la hoja' : `✓ ${enviadasAhora} sesiones enviadas a la hoja`, 'ok', 5);
  }
  if (vistaActual === 'inicio') render('inicio');
}

// ---------- Vistas ----------
let vistaActual = 'inicio';

function navegar(vista) {
  history.pushState({ vista }, '');
  render(vista);
}

function render(vista) {
  vistaActual = vista;
  const enInicio = vista === 'inicio';
  $('#btn-atras').hidden = enInicio;
  $('#btn-ajustes').hidden = vista === 'ajustes';
  window.scrollTo(0, 0);
  ({ inicio: vistaInicio, sesion: vistaSesion, resumen: vistaResumen, ajustes: vistaAjustes }[vista] || vistaInicio)();
}

function vistaInicio() {
  $('#titulo').textContent = 'Gimnasio';
  const actual = leer(K.actual, null);
  const pendientes = leer(K.pendientes, []);
  const ultimaSesion = leer(K.ultimaSesion, {});
  let html = '';

  if (!configCompleta()) {
    html += `<div class="tarjeta alerta">Falta configurar el envío a la hoja. <button class="enlace" data-accion="ajustes">Ir a Ajustes</button></div>`;
  }

  if (actual) {
    const hora = new Date(actual.inicio).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    html += `
      <div class="tarjeta en-curso">
        <div><strong>Sesión en curso: ${esc(actual.sesion)}</strong><br><span class="tenue">${fechaCorta(actual.fecha)} · empezada ${hora}</span></div>
        <div class="fila-botones">
          <button class="btn primario" data-accion="continuar">Continuar</button>
          <button class="btn" data-accion="descartar">Descartar</button>
        </div>
      </div>`;
  }

  html += '<div class="sesiones">';
  for (const nombre of Object.keys(RUTINA)) {
    const ejs = RUTINA[nombre];
    const series = ejs.reduce((a, e) => a + e.series, 0);
    const ult = ultimaSesion[nombre] ? `Última: ${fechaCorta(ultimaSesion[nombre])}` : 'Sin registros';
    html += `
      <button class="btn-sesion" data-accion="empezar" data-sesion="${esc(nombre)}">
        <span class="nombre">${esc(nombre)}</span>
        <span class="tenue">${ejs.length} ejercicios · ${series} series</span>
        <span class="tenue">${ult}</span>
      </button>`;
  }
  html += '</div>';

  if (pendientes.length) {
    html += `<div class="tarjeta"><strong>Pendientes de enviar (${pendientes.length})</strong><ul class="lista-pendientes">`;
    for (const p of pendientes) {
      const n = p.ejercicios.reduce((a, e) => a + e.series.length, 0);
      html += `<li><span>${fechaCorta(p.fecha)} · ${esc(p.sesion)} · ${n} series</span>
        <button class="icono peque" data-accion="borrar-pendiente" data-id="${esc(p.id)}" aria-label="Descartar">✕</button></li>`;
    }
    html += `</ul><button class="btn primario ancho" data-accion="enviar">Enviar ahora</button></div>`;
  }

  $('#vista').innerHTML = html;
}

function vistaSesion() {
  const actual = leer(K.actual, null);
  if (!actual) return render('inicio');
  $('#titulo').textContent = actual.sesion;
  const ultimo = leer(K.ultimo, {});

  let html = `
    <label class="campo-fecha">Fecha
      <input type="date" id="fecha-sesion" value="${esc(actual.fecha)}" max="${hoy()}">
    </label>`;

  RUTINA[actual.sesion].forEach((ej, iEj) => {
    const d = actual.datos[ej.nombre];
    const u = ultimo[ej.nombre];
    const textoUltimo = u
      ? `Última vez (${fechaCorta(u.fecha)}): ` + u.series.map((s) => `${formatoPeso(s.peso)}×${s.reps}`).join(' · ')
      : 'Sin registros anteriores';

    html += `
      <section class="ejercicio" data-ej="${iEj}">
        <h2>${esc(ej.nombre)}</h2>
        <div class="tenue">${ej.series} series · descanso ${esc(ej.descanso)}</div>
        <div class="ultimo">${esc(textoUltimo)}</div>
        <div class="series">
          <div class="cab"><span>Serie</span><span>Objetivo</span><span>kg</span><span>reps</span></div>`;
    d.series.forEach((s, iS) => {
      html += `
          <div class="serie ${claseSerie(s)}" data-serie="${iS}">
            <span class="num-serie">${iS + 1}</span>
            <span class="objetivo">${esc(ej.objetivos[iS])}</span>
            <input class="num" data-campo="peso" inputmode="decimal" enterkeyhint="next" autocomplete="off"
                   value="${esc(s.peso)}" placeholder="${u && u.series[iS] ? esc(formatoPeso(u.series[iS].peso)) : 'kg'}">
            <input class="num" data-campo="reps" inputmode="numeric" enterkeyhint="next" autocomplete="off"
                   value="${esc(s.reps)}" placeholder="${u && u.series[iS] ? esc(u.series[iS].reps) : 'reps'}">
          </div>`;
    });
    html += `
        </div>
        <textarea class="nota" data-campo="nota" rows="1" placeholder="Nota (opcional)">${esc(d.nota)}</textarea>
      </section>`;
  });

  html += `<button class="btn primario ancho grande" data-accion="terminar">Terminar y enviar</button>`;
  $('#vista').innerHTML = html;
}

function claseSerie(s) {
  const peso = leerPeso(s.peso);
  const reps = leerReps(s.reps);
  if (Number.isNaN(peso) || Number.isNaN(reps)) return 'mal';
  if (reps !== null) return 'hecha';
  return '';
}

function vistaResumen() {
  const actual = leer(K.actual, null);
  if (!actual) return render('inicio');
  $('#titulo').textContent = 'Resumen';
  const { sesion, problemas, avisos, totalSeries } = analizarSesion(actual);

  let html = `<div class="tarjeta"><strong>${esc(actual.sesion)} · ${fechaCorta(actual.fecha)}</strong><br>
    <span class="tenue">${sesion.ejercicios.length} ejercicios · ${totalSeries} series</span>`;
  if (sesion.ejercicios.length) {
    html += '<ul class="lista-resumen">';
    for (const ej of sesion.ejercicios) {
      html += `<li><strong>${esc(ej.nombre)}</strong><br>${ej.series.map((s) => `${formatoPeso(s.peso)} kg × ${s.reps}`).join(' · ')}`;
      if (ej.nota) html += `<br><em class="tenue">${esc(ej.nota)}</em>`;
      html += '</li>';
    }
    html += '</ul>';
  }
  html += '</div>';

  if (problemas.length) {
    html += `<div class="tarjeta alerta"><strong>Corrige antes de terminar:</strong><ul>${problemas.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>`;
  }
  if (avisos.length) {
    html += `<div class="tarjeta aviso-suave"><ul>${avisos.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>`;
  }

  const puede = !problemas.length && totalSeries > 0;
  if (!totalSeries) html += `<div class="tarjeta alerta">No hay ninguna serie con repeticiones.</div>`;
  html += `
    <div class="fila-botones">
      <button class="btn" data-accion="volver-sesion">Seguir editando</button>
      <button class="btn primario" data-accion="confirmar" ${puede ? '' : 'disabled'}>Terminar y enviar</button>
    </div>`;
  $('#vista').innerHTML = html;
}

function vistaAjustes() {
  $('#titulo').textContent = 'Ajustes';
  const c = leer(K.config, {});
  $('#vista').innerHTML = `
    <div class="tarjeta">
      <label class="campo">URL del script (aplicación web)
        <input id="cfg-url" type="url" autocomplete="off" placeholder="https://script.google.com/macros/s/…/exec" value="${esc(c.url || '')}">
      </label>
      <label class="campo">Clave secreta
        <input id="cfg-clave" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(c.clave || '')}">
      </label>
      <div class="fila-botones">
        <button class="btn primario" data-accion="guardar-config">Guardar</button>
        <button class="btn" data-accion="probar">Probar conexión</button>
      </div>
      <p class="tenue">Probar conexión no escribe nada en la hoja.</p>
    </div>`;
}

// ---------- Eventos ----------
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-accion]');
  if (!b) return;
  const accion = b.dataset.accion;

  if (accion === 'empezar') {
    const nombre = b.dataset.sesion;
    const actual = leer(K.actual, null);
    if (actual && actual.sesion !== nombre) {
      if (!confirm(`Tienes una sesión de ${actual.sesion} en curso. ¿Descartarla y empezar ${nombre}?`)) return;
    }
    if (!actual || actual.sesion !== nombre) guardar(K.actual, crearSesion(nombre));
    navegar('sesion');
  } else if (accion === 'continuar') {
    navegar('sesion');
  } else if (accion === 'descartar') {
    if (confirm('¿Descartar la sesión en curso? Se perderá lo apuntado.')) {
      localStorage.removeItem(K.actual);
      render('inicio');
    }
  } else if (accion === 'terminar') {
    navegar('resumen');
  } else if (accion === 'volver-sesion') {
    history.back();
  } else if (accion === 'confirmar') {
    terminarSesion();
    // Volver al inicio limpiando el historial de navegación
    history.replaceState({ vista: 'inicio' }, '');
    render('inicio');
    enviarPendientes();
  } else if (accion === 'enviar') {
    enviarPendientes();
  } else if (accion === 'borrar-pendiente') {
    if (confirm('¿Descartar esta sesión pendiente? No se enviará a la hoja.')) {
      guardar(K.pendientes, leer(K.pendientes, []).filter((p) => p.id !== b.dataset.id));
      render('inicio');
    }
  } else if (accion === 'ajustes') {
    navegar('ajustes');
  } else if (accion === 'guardar-config') {
    guardar(K.config, { url: $('#cfg-url').value.trim(), clave: $('#cfg-clave').value.trim() });
    aviso('Ajustes guardados', 'ok', 3);
  } else if (accion === 'probar') {
    guardar(K.config, { url: $('#cfg-url').value.trim(), clave: $('#cfg-clave').value.trim() });
    if (!configCompleta()) return aviso('Rellena la URL y la clave', 'error');
    aviso('Probando…', 'info', 0);
    const r = await llamarScript({ tipo: 'ping' });
    aviso(r.ok ? '✓ ' + r.mensaje : '✗ ' + r.error, r.ok ? 'ok' : 'error', 8);
  }
});

// Guardado automático: cada pulsación se guarda al momento.
document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.id === 'fecha-sesion') {
    const actual = leer(K.actual, null);
    if (actual && el.value) { actual.fecha = el.value; guardar(K.actual, actual); }
    return;
  }
  const campo = el.dataset.campo;
  if (!campo) return;
  const actual = leer(K.actual, null);
  if (!actual) return;
  const secEj = el.closest('.ejercicio');
  const ej = RUTINA[actual.sesion][Number(secEj.dataset.ej)];
  const datos = actual.datos[ej.nombre];

  if (campo === 'nota') {
    datos.nota = el.value;
  } else {
    const fila = el.closest('.serie');
    const s = datos.series[Number(fila.dataset.serie)];
    s[campo] = el.value;
    fila.className = 'serie ' + claseSerie(s);
  }
  guardar(K.actual, actual);
});

// Intro en un campo numérico salta al siguiente.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || !e.target.classList.contains('num')) return;
  e.preventDefault();
  const campos = [...document.querySelectorAll('input.num')];
  const sig = campos[campos.indexOf(e.target) + 1];
  if (sig) sig.focus(); else e.target.blur();
});

$('#btn-atras').addEventListener('click', () => history.back());
$('#btn-ajustes').addEventListener('click', () => navegar('ajustes'));
window.addEventListener('popstate', (e) => render((e.state && e.state.vista) || 'inicio'));
window.addEventListener('online', () => enviarPendientes({ silencioso: true }));

// ---------- Arranque ----------
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().catch(() => {});
}
history.replaceState({ vista: 'inicio' }, '');
render('inicio');
enviarPendientes({ silencioso: true });
