'use strict';

/* =====================================================================
 * Panel de usuarios (Ajustes → Usuarios). Solo lo ve el administrador.
 * Todo pasa por el script central: la lista no se guarda en el móvil.
 *  - Añadir usuario: el script crea su hoja en tu Drive y su clave.
 *  - Enlace de conexión: con QR para escanearlo en el gimnasio, copiar o compartir.
 *  - Desactivar (deja de poder usar la app) y nueva clave (el enlace anterior deja de valer).
 * ===================================================================== */

const estUsuarios = { lista: null, cargando: false, creando: false, enlace: null, ocupado: false };

async function cargarUsuarios() {
  estUsuarios.cargando = true;
  const r = await llamarAdmin({ tipo: 'usuarios' });
  estUsuarios.cargando = false;
  if (r) estUsuarios.lista = r.usuarios;
  if (vistaActual === 'usuarios') repintar();
}

/** Código QR en SVG (módulos negros sobre blanco, como lo esperan los lectores) */
function qrSVG(texto) {
  const q = qrcode(0, 'M');
  q.addData(texto);
  q.make();
  const n = q.getModuleCount();
  const borde = 4;
  let d = '';
  for (let f = 0; f < n; f++) {
    for (let c = 0; c < n; c++) if (q.isDark(f, c)) d += `M${c + borde} ${f + borde}h1v1h-1z`;
  }
  const lado = n + borde * 2;
  return `<svg class="qr" viewBox="0 0 ${lado} ${lado}" role="img" aria-label="Código QR del enlace de conexión" shape-rendering="crispEdges">
    <rect width="${lado}" height="${lado}" fill="#fff"/><path d="${d}" fill="#0b0a10"/></svg>`;
}

function htmlEnlace(e) {
  return `<div class="tarjeta enlace-usuario" id="panel-enlace">
    <div class="enlace-cab"><b>Enlace de ${esc(e.nombre)}</b>
      <button class="icono plano" data-accion="usuario-cerrar-enlace" aria-label="Cerrar">${ico('x')}</button></div>
    <p class="tenue" style="margin:4px 0 12px">Que lo escanee con la cámara del móvil o ábrelo en su teléfono. Conecta la app a su cuenta. Es su llave: no lo compartas con nadie más.</p>
    <div class="qr-caja">${qrSVG(e.enlace)}</div>
    <input class="enlace-texto" id="enlace-texto" readonly value="${esc(e.enlace)}" aria-label="Enlace de conexión">
    <div class="fila-botones">
      <button class="btn" data-accion="usuario-copiar">${ico('enlace')}Copiar</button>
      ${navigator.share ? `<button class="btn" data-accion="usuario-compartir">${ico('subir')}Compartir</button>` : ''}
    </div>
    ${e.email ? `<button class="btn ancho" style="margin-top:10px" data-accion="usuario-email" data-id="${esc(e.id)}">${ico('info')}Enviar a ${esc(e.email)}</button>` : ''}
    ${e.enviado ? `<p class="enviado">${ico('check')}Enviado por email a ${esc(e.email)}</p>` : ''}
  </div>`;
}

function htmlUsuario(u) {
  const ultimo = u.ultimo ? `Último entreno ${haceDias(u.ultimo)}` : 'Aún no ha entrenado';
  return `<div class="tarjeta usuario ${u.activo ? '' : 'inactivo'}" data-id="${esc(u.id)}">
    <div class="usuario-cab">
      <div class="avatar peq">${esc(u.nombre.charAt(0).toUpperCase())}</div>
      <div class="usuario-txt">
        <b>${esc(u.nombre)}${u.rol === 'admin' ? ' <span class="etiqueta-rol">admin</span>' : ''}${u.activo ? '' : ' <span class="etiqueta-pend">desactivado</span>'}</b>
        <span class="tenue">${esc(u.email || 'sin email')}</span>
        <span class="tenue">${esc(ultimo)}${u.alta ? ` · alta ${esc(fechaCorta(u.alta))}` : ''}</span>
      </div>
    </div>
    <div class="usuario-acciones">
      ${u.activo ? `<button class="chip" data-accion="usuario-enlace" data-id="${esc(u.id)}">${ico('enlace')}Enlace</button>` : ''}
      <a class="chip" href="${esc(u.hojaUrl)}" target="_blank" rel="noopener">${ico('historial')}Hoja</a>
      ${u.rol === 'admin' ? '' : `<button class="chip" data-accion="usuario-activar" data-id="${esc(u.id)}" data-activo="${u.activo ? '0' : '1'}">${u.activo ? 'Desactivar' : 'Activar'}</button>`}
      ${u.activo ? `<button class="chip" data-accion="usuario-clave" data-id="${esc(u.id)}">${ico('refrescar')}Nueva clave</button>` : ''}
    </div>
  </div>`;
}

function vistaUsuarios() {
  barra(`${BTN_ATRAS}<h1>Usuarios</h1><button class="icono" data-accion="usuarios-recargar" aria-label="Actualizar lista">${ico('refrescar')}</button>`);
  if (!leerCache().admin) { $('#vista').innerHTML = `<div class="tarjeta vacio">${ico('alerta')}Solo el administrador puede ver esta pantalla.</div>`; return; }
  if (!estUsuarios.lista && !estUsuarios.cargando && navigator.onLine) cargarUsuarios();

  let html = '';
  if (estUsuarios.enlace) html += htmlEnlace(estUsuarios.enlace);

  if (estUsuarios.creando) {
    html += `<div class="tarjeta">
      <div class="seccion-titulo" style="margin-top:0">Nuevo usuario</div>
      <label class="campo">Nombre<input id="nu-nombre" autocomplete="off" maxlength="40" placeholder="Por ejemplo: Marcos"></label>
      <label class="campo">Email (opcional)<input id="nu-email" type="email" autocomplete="off" autocapitalize="off" placeholder="Para el enlace, el resumen semanal y los recordatorios"></label>
      <label class="interruptor">${ico('info')}<span>Enviarle el enlace por email</span><input type="checkbox" id="nu-enviar" checked><i></i></label>
      <p class="tenue">Se creará su hoja en tu Drive (carpeta EDUX TRAINING › Usuarios). Después rellena allí su rutina: él solo verá la app.</p>
      <div class="fila-botones" style="margin-top:0">
        <button class="btn" data-accion="usuario-cancelar">Cancelar</button>
        <button class="btn primario" data-accion="usuario-crear" ${estUsuarios.ocupado ? 'disabled' : ''}>${ico('mas')}Crear</button>
      </div>
    </div>`;
  } else {
    html += `<button class="btn primario ancho" data-accion="usuario-nuevo">${ico('mas')}Añadir usuario</button>`;
  }

  html += `<div class="seccion-titulo">${estUsuarios.lista ? `${estUsuarios.lista.length} ${estUsuarios.lista.length === 1 ? 'usuario' : 'usuarios'}` : 'Usuarios'}</div>`;
  if (estUsuarios.lista) html += estUsuarios.lista.map(htmlUsuario).join('');
  else if (!navigator.onLine) html += `<div class="tarjeta vacio">${ico('alerta')}El panel de usuarios necesita internet.</div>`;
  else html += `<div class="tarjeta vacio">${ico('refrescar')}Cargando usuarios…</div>`;

  html += `<p class="tenue" style="padding:0 4px">Cada usuario solo puede ver y guardar sus propios datos desde la app. Las hojas están en tu Drive y nadie más tiene acceso a ellas.</p>`;
  $('#vista').innerHTML = html;
}

async function copiarEnlace() {
  const campo = $('#enlace-texto');
  try {
    await navigator.clipboard.writeText(campo.value);
  } catch (e) {
    campo.select();
    document.execCommand('copy');
  }
  aviso('Enlace copiado', 'ok', 3);
}

/** Devuelve true si la acción era del panel de usuarios */
async function accionUsuarios(accion, b) {
  const u = () => (estUsuarios.lista || []).find((x) => x.id === b.dataset.id) || {};
  switch (accion) {
    case 'usuarios-recargar': estUsuarios.lista = null; repintar(); return true;
    case 'usuario-nuevo': estUsuarios.creando = true; repintar(); setTimeout(() => $('#nu-nombre')?.focus(), 50); return true;
    case 'usuario-cancelar': estUsuarios.creando = false; repintar(); return true;
    case 'usuario-cerrar-enlace': estUsuarios.enlace = null; repintar(); return true;
    case 'usuario-crear': {
      const nombre = $('#nu-nombre').value.trim();
      const email = $('#nu-email').value.trim();
      const enviarEmail = $('#nu-enviar').checked && Boolean(email);
      if (!nombre) return aviso('Escribe el nombre', 'error', 3), true;
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return aviso('El email no es válido', 'error', 4), true;
      estUsuarios.ocupado = true;
      repintar();
      aviso('Creando usuario y su hoja…', 'info', 0);
      const r = await llamarAdmin({ tipo: 'crearUsuario', nombre, email, enviarEmail }, `${nombre} añadido`);
      estUsuarios.ocupado = false;
      if (r) {
        estUsuarios.creando = false;
        estUsuarios.enlace = { id: r.usuario.id, nombre: r.usuario.nombre, email: r.usuario.email, enlace: r.enlace, enviado: r.enviado };
        estUsuarios.lista = null;   // se recarga con el usuario nuevo
      }
      document.activeElement?.blur();
      repintar();
      window.scrollTo(0, 0);
      return true;
    }
    case 'usuario-enlace': {
      const x = u();
      b.disabled = true;
      const r = await llamarAdmin({ tipo: 'enlaceUsuario', id: x.id });
      if (r) estUsuarios.enlace = { id: x.id, nombre: x.nombre, email: x.email, enlace: r.enlace };
      repintar();
      window.scrollTo(0, 0);
      return true;
    }
    case 'usuario-email': {
      const e = estUsuarios.enlace;
      b.disabled = true;
      const r = await llamarAdmin({ tipo: 'enlaceUsuario', id: e.id, enviarEmail: true }, `Enlace enviado a ${e.email}`);
      if (r) e.enviado = r.enviado;
      repintar();
      return true;
    }
    case 'usuario-copiar': await copiarEnlace(); return true;
    case 'usuario-compartir': {
      const e = estUsuarios.enlace;
      try {
        await navigator.share({ title: 'EDUX TRAINING', text: `${e.nombre}, este es tu acceso a EDUX TRAINING. Ábrelo en tu móvil:`, url: e.enlace });
      } catch (err) { /* cancelado */ }
      return true;
    }
    case 'usuario-activar': {
      const x = u();
      const activo = b.dataset.activo === '1';
      if (!activo && !confirm(`¿Desactivar a ${x.nombre}? No podrá usar la app hasta que lo vuelvas a activar. Su hoja no se borra.`)) return true;
      b.disabled = true;
      if (await llamarAdmin({ tipo: 'activarUsuario', id: x.id, activo }, activo ? `${x.nombre} activado` : `${x.nombre} desactivado`)) {
        x.activo = activo;
        if (!activo && estUsuarios.enlace && estUsuarios.enlace.id === x.id) estUsuarios.enlace = null;
      }
      repintar();
      return true;
    }
    case 'usuario-clave': {
      const x = u();
      if (!confirm(`¿Crear una clave nueva para ${x.nombre}? Su enlace actual dejará de funcionar${x.rol === 'admin' ? ' (también en este móvil: se reconectará con el nuevo)' : ''} y tendrá que abrir el nuevo.`)) return true;
      b.disabled = true;
      const r = await llamarAdmin({ tipo: 'nuevaClave', id: x.id }, 'Clave nueva creada');
      if (r) {
        estUsuarios.enlace = { id: x.id, nombre: x.nombre, email: x.email, enlace: r.enlace };
        // Si es la tuya, este móvil se conecta con la nueva
        if (x.rol === 'admin') {
          const datos = leerEnlaceConexion(r.enlace);
          const c = leer(K.config, {});
          if (datos) guardar(K.config, { ...c, clave: datos.clave });
        }
      }
      repintar();
      window.scrollTo(0, 0);
      return true;
    }
  }
  return false;
}
