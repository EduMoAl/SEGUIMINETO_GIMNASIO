/**
 * EDUX TRAINING — SCRIPT CENTRAL (varios usuarios)
 *
 * Va pegado en la hoja "EDUX · Administración" (Extensiones → Apps Script) y se publica
 * como aplicación web (Ejecutar como: Yo · Acceso: Cualquier usuario).
 * Para instalarlo, abre en el navegador la URL de la aplicación web (termina en /exec):
 * es una página de instalación que solo funciona para el dueño del script.
 *
 *  - La pestaña "Usuarios" de la hoja de Administración guarda a cada usuario:
 *    su nombre, email, la hoja con sus datos y su clave.
 *  - Cada usuario tiene SU hoja (Rutina, Registro, Sesiones, Tiempos, Perfil, Progreso).
 *    Con su clave, la app solo puede leer y escribir en esa hoja.
 *  - La página de instalación (y el menú "EDUX" de la hoja, si aparece) tiene la instalación,
 *    la migración de la hoja antigua y la activación de los emails automáticos.
 *  - Emails: resumen semanal (lunes ~7:00) y recordatorio si alguien lleva X días
 *    sin entrenar (todos los días ~18:00), cada uno a su email.
 */

const APP_URL = 'https://edumoal.github.io/SEGUIMINETO_GIMNASIO/';
const VERSION_SCRIPT = 2;
const NOMBRE_ADMIN = 'EDUX · Administración';

const MUSCULOS = ['Pecho', 'Espalda', 'Hombro', 'Bíceps', 'Tríceps', 'Antebrazo', 'Abdomen', 'Lumbar',
  'Cuádriceps', 'Femoral', 'Glúteo', 'Aductores', 'Gemelos'];
const MATERIALES = ['Barra', 'Máquina', 'Polea', 'Mancuernas', 'Peso corporal', 'Otro'];

const CABECERAS = {
  Rutina: ['Sesión', 'Orden', 'Ejercicio', 'Series', 'Repeticiones', 'Descanso', 'Músculo principal', 'Músculos secundarios', 'Material'],
  Registro: ['ID sesión', 'Fecha', 'Sesión', 'Ejercicio', 'Serie', 'Peso (kg)', 'Reps', 'Nota', 'Volumen (kg)', '1RM est. (kg)'],
  Sesiones: ['ID', 'Fecha', 'Sesión', 'Inicio', 'Duración (min)', 'Series', 'Volumen (kg)', 'Origen', 'Enviada'],
  Tiempos: ['ID sesión', 'Ejercicio', 'Minutos'],
  Progreso: ['Ejercicio', 'Sesión', 'Series registradas', 'Días', 'Mejor peso (kg)', 'Mejor 1RM est. (kg)', 'Última vez', 'Peso máx. última vez (kg)']
};
const PESTANAS_USUARIO = ['Rutina', 'Registro', 'Sesiones', 'Tiempos', 'Perfil', 'Progreso'];
const PERFIL_CAMPOS = { nombre: 'Nombre', nacimiento: 'Fecha de nacimiento', altura: 'Altura (cm)', recordatorio: 'Recordatorio (días)' };
const RECORDATORIO_DEFECTO = 7;

const CAB_USUARIOS = ['ID', 'Nombre', 'Email', 'Hoja', 'Clave', 'Rol', 'Activo', 'Alta', 'Último entreno', 'Último recordatorio', 'Recordatorio por el entreno del'];
const COL = { id: 1, nombre: 2, email: 3, hoja: 4, clave: 5, rol: 6, activo: 7, alta: 8, ultimo: 9, recordatorio: 10, recordatorioPor: 11 };
const TIPOS_ADMIN = ['usuarios', 'crearUsuario', 'enlaceUsuario', 'activarUsuario', 'nuevaClave'];

/* ===================================================================== */
/* 1. MENÚ E INSTALACIÓN                                                  */
/* ===================================================================== */

function onOpen() {
  let ui;
  try {
    ui = SpreadsheetApp.getUi();
  } catch (e) {
    throw new Error('Google no deja mostrar el menú desde aquí. No pasa nada: abre en el navegador la URL de la aplicación web ' +
      '(Implementar → Gestionar implementaciones → la que termina en /exec) y sigue los pasos de la página de instalación.');
  }
  ui.createMenu('EDUX')
    .addItem('1 · Instalar', 'instalar')
    .addItem('2 · Migrar hoja antigua…', 'migrarDesdeMenu')
    .addItem('3 · Activar emails automáticos', 'activarAvisos')
    .addSeparator()
    .addItem('Mi enlace de conexión', 'mostrarMiEnlace')
    .addItem('Probar resumen semanal (te llega a ti)', 'probarResumenSemanal')
    .addToUi();
}

function ui_() {
  try { return SpreadsheetApp.getUi(); } catch (e) { return null; }
}

/**
 * Prepara la hoja de Administración, las carpetas y tu usuario (administrador).
 * Desde el menú pregunta la URL de la aplicación web y tu nombre.
 */
function instalar(opciones) {
  opciones = opciones || {};
  const ui = opciones.sinUi ? null : ui_();
  const props = PropertiesService.getScriptProperties();
  const admin = hojaAdminParaInstalar_();
  props.setProperty('ADMIN_ID', admin.getId());

  let url = opciones.urlWebApp || props.getProperty('URL_WEBAPP');
  if (!url && ui) {
    const r = ui.prompt('EDUX · Instalar (1/2)', 'Pega la URL de la aplicación web.\n(Implementar → Gestionar implementaciones → URL que termina en /exec)', ui.ButtonSet.OK_CANCEL);
    if (r.getSelectedButton() !== ui.Button.OK) return null;
    url = r.getResponseText().trim();
  }
  if (!opciones.urlWebApp && !urlWebAppValida_(url)) {
    throw new Error('Falta la URL de la aplicación web (empieza por https://script.google.com/ y termina en /exec). ' +
      'Lo más fácil: abre esa URL en el navegador y sigue la página de instalación.');
  }
  props.setProperty('URL_WEBAPP', url);

  prepararPestanaUsuarios_(admin);
  carpetaUsuarios_();

  let u = leerUsuarios_().filter(function (x) { return x.rol === 'admin'; })[0];
  if (!u) {
    let nombre = opciones.nombre;
    if (!nombre && ui) {
      const r = ui.prompt('EDUX · Instalar (2/2)', '¿Cómo te llamas? (es el nombre del saludo de la app)', ui.ButtonSet.OK);
      nombre = r.getResponseText().trim();
    }
    u = crearUsuario_({ nombre: nombre || 'Administrador', email: Session.getEffectiveUser().getEmail(), rol: 'admin' });
  }
  const enlace = enlaceDe_(u);
  if (!opciones.sinEmail) enviarEnlace_(u, enlace);
  if (ui) {
    ui.alert('EDUX · Instalado',
      'Listo. Tu hoja nueva es "EDUX · ' + u.nombre + '" (carpeta EDUX TRAINING/Usuarios).\n\n' +
      'Te he enviado por email tu enlace de conexión para el móvil.\n\n' +
      'Siguiente paso: menú EDUX → 2 · Migrar hoja antigua.', ui.ButtonSet.OK);
  }
  return { usuario: u, enlace: enlace };
}

/** Muestra (y envía por email) el enlace de conexión del administrador */
function mostrarMiEnlace() {
  const u = leerUsuarios_().filter(function (x) { return x.rol === 'admin'; })[0];
  if (!u) throw new Error('Primero: menú EDUX → 1 · Instalar.');
  const enlace = enlaceDe_(u);
  enviarEnlace_(u, enlace);
  const ui = ui_();
  if (ui) ui.alert('Tu enlace de conexión', 'Te lo he enviado por email. Ábrelo en Chrome en tu móvil:\n\n' + enlace, ui.ButtonSet.OK);
  return enlace;
}

/** URL de la aplicación web publicada (o la del simulador de pruebas) */
function urlWebAppValida_(url) {
  return /^https:\/\/script\.google\.com\/.+\/exec$/.test(url || '') || /^http:\/\/127\.0\.0\.1:\d+\/exec$/.test(url || '');
}

/** Hoja de Administración: la guardada, la del script, la que se llame así en tu Drive o una nueva */
function hojaAdminParaInstalar_() {
  const id = PropertiesService.getScriptProperties().getProperty('ADMIN_ID');
  if (id) {
    try { return SpreadsheetApp.openById(id); } catch (e) { /* se borró: se busca otra */ }
  }
  let ss = null;
  try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) { ss = null; }
  if (ss) return ss;
  // El script está suelto (no dentro de una hoja): se usa la hoja "EDUX · Administración" de tu Drive
  const archivos = DriveApp.getFilesByName(NOMBRE_ADMIN);
  while (archivos.hasNext()) {
    const f = archivos.next();
    if (f.getMimeType() === MimeType.GOOGLE_SHEETS && !f.isTrashed()) return SpreadsheetApp.openById(f.getId());
  }
  return SpreadsheetApp.create(NOMBRE_ADMIN);
}

/* ===================================================================== */
/* 1b. PÁGINA DE INSTALACIÓN (la URL de la aplicación web en el navegador) */
/* ===================================================================== */

/** Solo el dueño del script, con su cuenta de Google, puede usar la página de instalación */
function esPropietario_() {
  const yo = Session.getEffectiveUser().getEmail();
  let activo = '';
  try { activo = Session.getActiveUser().getEmail(); } catch (e) { activo = ''; }
  return Boolean(yo) && activo === yo;
}

function exigirPropietario_() {
  if (!esPropietario_()) throw new Error('Solo el dueño del script puede hacer esto. Abre esta página con tu cuenta de Google.');
}

function adminActual_() {
  try {
    return leerUsuarios_().filter(function (x) { return x.rol === 'admin'; })[0] || null;
  } catch (e) {
    return null;   // aún sin instalar
  }
}

/** Estado de la instalación para la página */
function panelEstado() {
  if (!esPropietario_()) return { propietario: false };
  const props = PropertiesService.getScriptProperties();
  const admin = adminActual_();
  let url = props.getProperty('URL_WEBAPP') || '';
  if (!url) {
    try { url = ScriptApp.getService().getUrl() || ''; } catch (e) { url = ''; }
  }
  return {
    propietario: true,
    email: Session.getEffectiveUser().getEmail(),
    instalado: Boolean(admin),
    nombre: admin ? admin.nombre : '',
    url: urlWebAppValida_(url) ? url : '',
    hojaAdmin: admin ? hojaAdmin_().getUrl() : '',
    migracion: props.getProperty('MIGRACION') ? JSON.parse(props.getProperty('MIGRACION')) : null,
    avisos: ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'enviarRecordatorios'; }),
    zona: Session.getScriptTimeZone()
  };
}

function panelInstalar(nombre, url) {
  exigirPropietario_();
  url = texto_(url);
  if (!urlWebAppValida_(url)) throw new Error('La URL debe empezar por https://script.google.com/ y terminar en /exec.');
  nombre = texto_(nombre);
  if (!nombre && !adminActual_()) throw new Error('Escribe tu nombre.');
  const r = instalar({ sinUi: true, urlWebApp: url, nombre: nombre });
  return { nombre: r.usuario.nombre, email: r.usuario.email };
}

function panelMigrar(textoUrl) {
  exigirPropietario_();
  if (!adminActual_()) throw new Error('Primero haz el paso 1 (Instalar).');
  const m = /\/d\/([a-zA-Z0-9_-]+)/.exec(texto_(textoUrl));
  const id = m ? m[1] : texto_(textoUrl);
  if (!id) throw new Error('Pega la URL de tu hoja antigua.');
  try {
    SpreadsheetApp.openById(id);
  } catch (e) {
    throw new Error('No puedo abrir esa hoja. Copia la URL completa desde la barra de direcciones de la hoja antigua.');
  }
  const r = migrarHojaAntigua(id);
  PropertiesService.getScriptProperties().setProperty('MIGRACION', JSON.stringify(r));
  return r;
}

function panelActivarAvisos() {
  exigirPropietario_();
  if (!adminActual_()) throw new Error('Primero haz el paso 1 (Instalar).');
  activarAvisos();
  return { zona: Session.getScriptTimeZone() };
}

function panelEnviarEnlace() {
  exigirPropietario_();
  const u = adminActual_();
  if (!u) throw new Error('Primero haz el paso 1 (Instalar).');
  enviarEnlace_(u, enlaceDe_(u));
  return u.email;
}

function panelProbarResumen() {
  exigirPropietario_();
  probarResumenSemanal();
  return Session.getEffectiveUser().getEmail();
}

const HTML_PANEL = [
  '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><base target="_blank">',
  '<style>',
  'body{margin:0;background:#09080d;color:#f4f2fa;font-family:Segoe UI,Roboto,Arial,sans-serif;line-height:1.45}',
  '.caja{max-width:560px;margin:0 auto;padding:24px 16px 40px}',
  '.marca{font-weight:800;letter-spacing:4px}.marca span{color:#c4b5fd;font-weight:600;letter-spacing:6px;font-size:12px}',
  'h1{font-size:26px;margin:14px 0 4px}p{color:#c3bdd4}.tenue{color:#8a8599;font-size:13px}',
  '.paso{background:#121018;border:1px solid #262230;border-radius:18px;padding:18px;margin-top:14px}',
  '.paso.hecho{border-color:rgba(61,220,160,.45)}.paso.bloqueado{opacity:.45}',
  '.paso h2{margin:0 0 6px;font-size:17px;display:flex;gap:10px;align-items:center}',
  '.num{display:inline-grid;place-items:center;width:28px;height:28px;border-radius:9px;background:#2a2340;color:#c4b5fd;font-size:14px}',
  '.hecho .num{background:#3ddca0;color:#09080d}',
  'label{display:block;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#8a8599;font-weight:700;margin:12px 0 6px}',
  'input{width:100%;box-sizing:border-box;padding:12px;border-radius:12px;border:1px solid #2e2840;background:#1a1723;color:#f4f2fa;font-size:15px}',
  'button{margin-top:14px;width:100%;padding:13px;border:0;border-radius:999px;background:linear-gradient(135deg,#a873fb,#7c3aed 55%,#4c1d95);color:#fff;font-weight:700;font-size:15px;cursor:pointer}',
  'button.sec{background:#1a1723;border:1px solid #2e2840}button:disabled{opacity:.5;cursor:default}',
  '.ok{color:#3ddca0}.error{color:#f87171}.res{margin-top:12px;font-size:14px}a{color:#c4b5fd}',
  '</style></head><body><div class="caja">',
  '<div class="marca">EDUX <span>TRAINING</span></div>',
  '<h1>Instalación</h1><div id="contenido"><p>Cargando…</p></div>',
  '</div><script>',
  'var E = null;',
  'function $(id) { return document.getElementById(id); }',
  'function esc(t) { return String(t == null ? "" : t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }',
  'function llamar(fn, args, boton, salida, alTerminar) {',
  '  if (boton) boton.disabled = true;',
  '  if (salida) { salida.className = "res tenue"; salida.textContent = "Un momento…"; }',
  '  var r = google.script.run.withSuccessHandler(function (x) { if (boton) boton.disabled = false; alTerminar(x); })',
  '    .withFailureHandler(function (e) { if (boton) boton.disabled = false; if (salida) { salida.className = "res error"; salida.textContent = (e && e.message) || String(e); } });',
  '  r[fn].apply(r, args);',
  '}',
  'function pintar() {',
  '  var c = $("contenido");',
  '  if (!E.propietario) { c.innerHTML = "<div class=\\"paso\\"><h2>Solo para el dueño del script</h2><p>Si eres tú, abre esta página con la cuenta de Google con la que creaste el script (prueba en una ventana de incógnito entrando solo con esa cuenta).</p></div>"; return; }',
  '  var h = "<p>Cuenta: <b>" + esc(E.email) + "</b></p>";',
  '  h += "<div class=\\"paso " + (E.instalado ? "hecho" : "") + "\\"><h2><span class=\\"num\\">" + (E.instalado ? "✓" : "1") + "</span>Instalar</h2>";',
  '  if (E.instalado) {',
  '    h += "<p>Instalado. Administrador: <b>" + esc(E.nombre) + "</b>. Te envié por email tu <b>enlace de conexión</b> para el móvil.</p>";',
  '    h += "<p class=\\"tenue\\"><a href=\\"" + esc(E.hojaAdmin) + "\\">Abrir la hoja de Administración</a></p>";',
  '    h += "<button class=\\"sec\\" id=\\"b-enlace\\">Enviarme otra vez el enlace</button><div id=\\"r-enlace\\" class=\\"res\\"></div>";',
  '  } else {',
  '    h += "<p class=\\"tenue\\">Crea las carpetas EDUX TRAINING/Usuarios, tu usuario (administrador) y tu hoja nueva, y te envía por email tu enlace de conexión.</p>";',
  '    h += "<label for=\\"i-nombre\\">Tu nombre</label><input id=\\"i-nombre\\" placeholder=\\"Como quieres que te salude la app\\">";',
  '    h += "<label for=\\"i-url\\">URL de la aplicación web</label><input id=\\"i-url\\" value=\\"" + esc(E.url) + "\\" placeholder=\\"https://script.google.com/macros/s/…/exec\\">";',
  '    h += "<p class=\\"tenue\\">Es la URL de esta página: la que termina en /exec.</p>";',
  '    h += "<button id=\\"b-instalar\\">Instalar</button><div id=\\"r-instalar\\" class=\\"res\\"></div>";',
  '  }',
  '  h += "</div>";',
  '  var bloq = E.instalado ? "" : " bloqueado";',
  '  h += "<div class=\\"paso" + (E.migracion ? " hecho" : "") + bloq + "\\"><h2><span class=\\"num\\">" + (E.migracion ? "✓" : "2") + "</span>Migrar tu hoja antigua</h2>";',
  '  h += "<p class=\\"tenue\\">Solo si venías de la versión anterior. Copia rutina, series, sesiones, días de asistencia, perfil y peso. La hoja antigua no se modifica. Se puede repetir.</p>";',
  '  if (E.migracion) h += "<p class=\\"ok\\">" + resumenMigracion(E.migracion) + "</p>";',
  '  h += "<label for=\\"i-antigua\\">URL de la hoja antigua</label><input id=\\"i-antigua\\" placeholder=\\"https://docs.google.com/spreadsheets/d/…\\">";',
  '  h += "<button id=\\"b-migrar\\" " + (E.instalado ? "" : "disabled") + ">" + (E.migracion ? "Migrar otra vez" : "Migrar") + "</button><div id=\\"r-migrar\\" class=\\"res\\"></div></div>";',
  '  h += "<div class=\\"paso" + (E.avisos ? " hecho" : "") + bloq + "\\"><h2><span class=\\"num\\">" + (E.avisos ? "✓" : "3") + "</span>Emails automáticos</h2>";',
  '  h += "<p class=\\"tenue\\">Resumen semanal (lunes hacia las 7:00) y recordatorio si alguien lleva días sin entrenar (hacia las 18:00).</p>";',
  '  h += "<p class=\\"tenue\\">Zona horaria del script: <b>" + esc(E.zona) + "</b>" + (/Madrid/.test(E.zona) ? "" : " · cámbiala a Madrid en ⚙ Configuración del proyecto") + "</p>";',
  '  h += "<button id=\\"b-avisos\\" " + (E.instalado ? "" : "disabled") + ">" + (E.avisos ? "Activados · volver a activar" : "Activar") + "</button>";',
  '  if (E.avisos) h += "<button class=\\"sec\\" id=\\"b-probar\\">Enviarme ahora el resumen de la semana pasada</button>";',
  '  h += "<div id=\\"r-avisos\\" class=\\"res\\"></div></div>";',
  '  c.innerHTML = h;',
  '  if ($("b-instalar")) $("b-instalar").onclick = function () { llamar("panelInstalar", [$("i-nombre").value, $("i-url").value], this, $("r-instalar"), cargar); };',
  '  if ($("b-enlace")) $("b-enlace").onclick = function () { var s = $("r-enlace"); llamar("panelEnviarEnlace", [], this, s, function (m) { s.className = "res ok"; s.textContent = "Enviado a " + m; }); };',
  '  $("b-migrar").onclick = function () { llamar("panelMigrar", [$("i-antigua").value], this, $("r-migrar"), cargar); };',
  '  $("b-avisos").onclick = function () { llamar("panelActivarAvisos", [], this, $("r-avisos"), cargar); };',
  '  if ($("b-probar")) $("b-probar").onclick = function () { var s = $("r-avisos"); llamar("panelProbarResumen", [], this, s, function (m) { s.className = "res ok"; s.textContent = "Enviado a " + m; }); };',
  '}',
  'function resumenMigracion(r) { return "Copiado: " + r.ejercicios + " ejercicios de la rutina, " + r.series + " series, " + r.sesiones + " sesiones (" + r.asistencia + " solo de asistencia), " + r.tiempos + " tiempos y " + r.pesos + " registros de peso."; }',
  'function cargar() { llamar("panelEstado", [], null, null, function (x) { E = x; pintar(); }); }',
  'cargar();',
  '</script></body></html>'
].join('\n');

/* ===================================================================== */
/* 2. USUARIOS                                                            */
/* ===================================================================== */

function hojaAdmin_() {
  const id = PropertiesService.getScriptProperties().getProperty('ADMIN_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}

function prepararPestanaUsuarios_(admin) {
  let h = admin.getSheetByName('Usuarios');
  if (!h) {
    const hojas = admin.getSheets();
    h = hojas.length === 1 && hojas[0].getLastRow() === 0 ? hojas[0] : admin.insertSheet('Usuarios');
    h.setName('Usuarios');
  }
  h.getRange(1, 1, 1, CAB_USUARIOS.length).setValues([CAB_USUARIOS]).setFontWeight('bold');
  h.setFrozenRows(1);
  return h;
}

function pestanaUsuarios_() {
  const h = hojaAdmin_().getSheetByName('Usuarios');
  if (!h) throw new Error('El script no está instalado. Menú EDUX → 1 · Instalar.');
  return h;
}

function siNo_(v) {
  if (v === true) return true;
  const t = String(v).trim().toLowerCase();
  return t === 'sí' || t === 'si' || t === 'true' || t === '1';
}

function leerUsuarios_() {
  const h = pestanaUsuarios_();
  if (h.getLastRow() < 2) return [];
  return h.getRange(2, 1, h.getLastRow() - 1, CAB_USUARIOS.length).getValues().map(function (v, i) {
    return {
      fila: i + 2, id: texto_(v[0]), nombre: texto_(v[1]), email: texto_(v[2]), hoja: texto_(v[3]), clave: texto_(v[4]),
      rol: texto_(v[5]) || 'usuario', activo: siNo_(v[6]), alta: v[7], ultimo: v[8], recordatorio: v[9], recordatorioPor: v[10]
    };
  }).filter(function (u) { return u.id && u.clave; });
}

function usuarioPorClave_(clave) {
  if (!clave) return null;
  return leerUsuarios_().filter(function (u) { return u.activo && u.clave === String(clave); })[0] || null;
}

function crearUsuario_(d) {
  const nombre = texto_(d.nombre).slice(0, 40);
  if (!nombre) throw new Error('Falta el nombre.');
  const email = texto_(d.email);
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('El email no es válido.');
  if (leerUsuarios_().some(function (u) { return u.nombre.toLowerCase() === nombre.toLowerCase(); })) {
    throw new Error('Ya hay un usuario llamado "' + nombre + '".');
  }
  const ss = crearHojaUsuario_(nombre, email);
  const u = {
    id: 'u' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36), nombre: nombre, email: email, hoja: ss.getId(),
    clave: Utilities.getUuid().replace(/-/g, ''), rol: d.rol === 'admin' ? 'admin' : 'usuario', activo: true, alta: new Date()
  };
  const h = pestanaUsuarios_();
  const fila = Math.max(h.getLastRow(), 1) + 1;
  h.getRange(fila, 1, 1, CAB_USUARIOS.length).setValues([[u.id, u.nombre, u.email, u.hoja, u.clave, u.rol, 'Sí', u.alta, '', '', '']]);
  h.getRange(fila, COL.alta).setNumberFormat('dd/mm/yyyy');
  u.fila = fila;
  return u;
}

function enlaceDe_(u) {
  const url = PropertiesService.getScriptProperties().getProperty('URL_WEBAPP');
  const datos = Utilities.base64EncodeWebSafe(JSON.stringify({ u: url, c: u.clave }), Utilities.Charset.UTF_8).replace(/=+$/, '');
  return APP_URL + '#conectar=' + datos;
}

function usuarioPublico_(u) {
  return {
    id: u.id, nombre: u.nombre, email: u.email, rol: u.rol, activo: u.activo,
    alta: isoDe_(u.alta), ultimo: isoDe_(u.ultimo), hojaUrl: 'https://docs.google.com/spreadsheets/d/' + u.hoja + '/edit'
  };
}

function enviarEnlace_(u, enlace) {
  if (!u.email) return false;
  const html = plantillaEmail_(
    u.nombre ? 'Hola, ' + esc_(u.nombre) : 'Hola',
    '<p style="color:#c3bdd4;line-height:1.5">Este es tu acceso a <b style="color:#f4f2fa">EDUX TRAINING</b>. Ábrelo <b>desde tu móvil</b>:</p>' +
    '<p style="margin:22px 0"><a href="' + enlace + '" style="display:inline-block;padding:14px 24px;border-radius:999px;background:#7c3aed;color:#fff;font-weight:700;text-decoration:none">Abrir EDUX TRAINING</a></p>' +
    '<ol style="color:#c3bdd4;line-height:1.6;padding-left:18px">' +
    '<li>Abre el botón en <b>Chrome</b> (Android) o <b>Safari</b> (iPhone).</li>' +
    '<li>Instálala: Chrome → menú ⋮ → <i>Instalar aplicación</i> · Safari → Compartir → <i>Añadir a pantalla de inicio</i>.</li>' +
    '<li>Ya está conectada a tus datos. No compartas este enlace: es tu llave.</li></ol>');
  MailApp.sendEmail({ to: u.email, subject: 'Tu acceso a EDUX TRAINING', htmlBody: html, name: 'EDUX TRAINING' });
  return true;
}

/** Peticiones del panel de usuarios (solo administrador) */
function accionAdmin_(d) {
  const lista = leerUsuarios_();
  const buscar = function () {
    const u = lista.filter(function (x) { return x.id === d.id; })[0];
    if (!u) throw new Error('Usuario no encontrado.');
    return u;
  };
  switch (d.tipo) {
    case 'usuarios':
      return { ok: true, usuarios: lista.map(usuarioPublico_) };
    case 'crearUsuario': {
      const u = crearUsuario_({ nombre: d.nombre, email: d.email, rol: 'usuario' });
      const enlace = enlaceDe_(u);
      const enviado = d.enviarEmail ? enviarEnlace_(u, enlace) : false;
      return { ok: true, usuario: usuarioPublico_(u), enlace: enlace, enviado: enviado };
    }
    case 'enlaceUsuario': {
      const u = buscar();
      const enlace = enlaceDe_(u);
      const enviado = d.enviarEmail ? enviarEnlace_(u, enlace) : false;
      return { ok: true, enlace: enlace, enviado: enviado };
    }
    case 'activarUsuario': {
      const u = buscar();
      if (u.rol === 'admin') throw new Error('No puedes desactivar al administrador.');
      pestanaUsuarios_().getRange(u.fila, COL.activo).setValue(d.activo ? 'Sí' : 'No');
      return { ok: true };
    }
    case 'nuevaClave': {
      const u = buscar();
      u.clave = Utilities.getUuid().replace(/-/g, '');
      pestanaUsuarios_().getRange(u.fila, COL.clave).setValue(u.clave);
      return { ok: true, enlace: enlaceDe_(u) };
    }
  }
  throw new Error('Acción desconocida.');
}

/* ===================================================================== */
/* 3. HOJA DE CADA USUARIO (plantilla)                                    */
/* ===================================================================== */

function carpetaUsuarios_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('CARPETA_USUARIOS');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { /* se borró: se crea otra */ }
  }
  const raiz = DriveApp.createFolder('EDUX TRAINING');
  const usuarios = raiz.createFolder('Usuarios');
  try { DriveApp.getFileById(hojaAdmin_().getId()).moveTo(raiz); } catch (e) { /* sigue donde estaba */ }
  props.setProperty('CARPETA_USUARIOS', usuarios.getId());
  return usuarios;
}

function crearHojaUsuario_(nombre, email) {
  const ss = SpreadsheetApp.create('EDUX · ' + nombre);
  try { DriveApp.getFileById(ss.getId()).moveTo(carpetaUsuarios_()); } catch (e) { /* queda en Mi unidad */ }
  prepararHojaUsuario_(ss, nombre);
  return ss;
}

/** Crea (o completa) las pestañas de una hoja de usuario con sus cabeceras y validaciones */
function prepararHojaUsuario_(ss, nombre) {
  PESTANAS_USUARIO.forEach(function (nombrePestana, i) {
    let h = ss.getSheetByName(nombrePestana);
    if (!h) {
      const hojas = ss.getSheets();
      // La primera pestaña vacía que trae una hoja nueva se reutiliza como "Rutina"
      h = i === 0 && hojas.length === 1 && hojas[0].getLastRow() === 0 && PESTANAS_USUARIO.indexOf(hojas[0].getName()) < 0
        ? hojas[0] : ss.insertSheet(nombrePestana);
      h.setName(nombrePestana);
    }
    if (nombrePestana === 'Perfil') {
      if (h.getLastRow() === 0) {
        h.getRange(1, 1, 5, 2).setValues([['Dato', 'Valor'],
          [PERFIL_CAMPOS.nombre, nombre || ''], [PERFIL_CAMPOS.nacimiento, ''],
          [PERFIL_CAMPOS.altura, ''], [PERFIL_CAMPOS.recordatorio, RECORDATORIO_DEFECTO]]);
        h.getRange(1, 3).setNote('El email de cada usuario está en la hoja de Administración (pestaña Usuarios).');
        h.getRange(1, 4, 1, 2).setValues([['Fecha', 'Peso (kg)']]);
      }
      h.getRange(1, 1, 1, 5).setFontWeight('bold');
    } else {
      h.getRange(1, 1, 1, CABECERAS[nombrePestana].length).setValues([CABECERAS[nombrePestana]]).setFontWeight('bold');
    }
    h.setFrozenRows(1);
  });
  const rutina = ss.getSheetByName('Rutina');
  rutina.getRange(2, 7, 498, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(MUSCULOS, true).setAllowInvalid(false).build());
  rutina.getRange(2, 9, 498, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(MATERIALES, true).setAllowInvalid(false).build());
  rutina.getRange(1, 5).setNote('Una por serie separada con / (6–8 / 8–10 / 8–10) o una sola para todas (8–12).');
  rutina.getRange(1, 6).setNote('Ejemplos: 3 min · 2,5 min · 90 s');
  rutina.getRange(1, 8).setNote('Separados por comas: Hombro, Tríceps. Cuentan ½ serie en las estadísticas por músculo.');
  return ss;
}

/* ===================================================================== */
/* 4. APLICACIÓN WEB                                                      */
/* ===================================================================== */

/** La URL de la aplicación web abierta en el navegador muestra la página de instalación */
function doGet() {
  return HtmlService.createHtmlOutput(HTML_PANEL)
    .setTitle('EDUX TRAINING · Instalación')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function doPost(e) {
  let d;
  try {
    d = JSON.parse(e.postData.contents);
  } catch (err) {
    return responder_({ ok: false, error: 'Datos ilegibles (JSON inválido).' });
  }
  let u;
  try {
    u = usuarioPorClave_(d.clave);
  } catch (err) {
    return responder_({ ok: false, error: err.message });
  }
  if (!u) return responder_({ ok: false, error: 'Clave incorrecta.' });

  try {
    if (d.tipo === 'ping') return responder_({ ok: true, mensaje: 'Conexión correcta.', nombre: u.nombre, version: VERSION_SCRIPT });
    if (TIPOS_ADMIN.indexOf(d.tipo) >= 0) {
      if (u.rol !== 'admin') return responder_({ ok: false, error: 'Solo el administrador puede hacer esto.' });
      return conBloqueo_(function () { return accionAdmin_(d); });
    }
    const ss = SpreadsheetApp.openById(u.hoja);
    switch (d.tipo) {
      case 'datos': {
        const r = leerDatos_(ss, d.tengo);
        r.admin = u.rol === 'admin';
        r.usuario = { nombre: u.nombre, email: u.email };
        return responder_(r);
      }
      case 'sesion': return conBloqueo_(function () { return guardarSesion_(ss, d.sesion, u); });
      case 'perfil': return conBloqueo_(function () { return guardarPerfil_(ss, d.perfil); });
      case 'peso': return conBloqueo_(function () { return guardarPeso_(ss, d.fecha, d.peso); });
      case 'descanso': return conBloqueo_(function () { return guardarDescanso_(ss, d.ejercicio, d.segundos); });
    }
    return responder_({ ok: false, error: 'Tipo de petición desconocido.' });
  } catch (err) {
    return responder_({ ok: false, error: err.message });
  }
}

function conBloqueo_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return responder_({ ok: false, error: 'La hoja está ocupada, reintenta en un momento.' });
  try {
    return responder_(fn());
  } finally {
    lock.releaseLock();
  }
}

function responder_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ===================================================================== */
/* 5. LECTURA                                                             */
/* ===================================================================== */

/** Filas de datos (sin cabecera) de una pestaña */
function filas_(ss, nombre, columnas) {
  const h = ss.getSheetByName(nombre);
  if (!h || h.getLastRow() < 2) return [];
  return h.getRange(2, 1, h.getLastRow() - 1, columnas).getValues();
}

function leerRutina_(ss) {
  const out = [];
  const ordenSesion = [];
  filas_(ss, 'Rutina', 9).forEach(function (f, i) {
    const sesion = texto_(f[0]);
    const ejercicio = texto_(f[2]);
    if (!sesion || !ejercicio) return;
    if (ordenSesion.indexOf(sesion) < 0) ordenSesion.push(sesion);
    const series = Math.max(1, Math.min(10, Math.round(aNumero_(f[3]) || 3)));
    const reps = texto_(f[4]) || '8–12';
    const partes = reps.split('/').map(function (x) { return x.trim(); }).filter(String);
    const objetivos = [];
    for (let k = 0; k < series; k++) objetivos.push(partes[Math.min(k, partes.length - 1)] || reps);
    const material = MATERIALES.indexOf(texto_(f[8])) >= 0 ? texto_(f[8]) : 'Otro';
    out.push({
      sesion: sesion, orden: aNumero_(f[1]) || i + 1, ejercicio: ejercicio, series: series, objetivos: objetivos,
      descanso: segundosDescanso_(f[5]), principal: musculoValido_(f[6]),
      secundarios: texto_(f[7]).split(/[,;·]/).map(musculoValido_).filter(String), material: material
    });
  });
  out.sort(function (a, b) {
    return (ordenSesion.indexOf(a.sesion) - ordenSesion.indexOf(b.sesion)) || (a.orden - b.orden);
  });
  return out;
}

function leerPerfil_(ss) {
  const h = ss.getSheetByName('Perfil');
  if (!h) return null;
  const tz = ss.getSpreadsheetTimeZone();
  const v = h.getRange(1, 1, Math.max(h.getLastRow(), 6), 5).getValues();
  const dato = function (etiqueta) {
    for (let i = 0; i < v.length; i++) if (texto_(v[i][0]) === etiqueta) return v[i][1];
    return '';
  };
  const pesos = [];
  for (let i = 1; i < v.length; i++) {
    const f = normalizarFecha_(v[i][3], tz);
    const p = aNumero_(v[i][4]);
    if (f && p !== null) pesos.push([f, p]);
  }
  pesos.sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0; });
  const rec = aNumero_(dato(PERFIL_CAMPOS.recordatorio));
  return {
    nombre: texto_(dato(PERFIL_CAMPOS.nombre)),
    nacimiento: normalizarFecha_(dato(PERFIL_CAMPOS.nacimiento), tz), altura: aNumero_(dato(PERFIL_CAMPOS.altura)),
    recordatorio: rec === null ? RECORDATORIO_DEFECTO : rec, pesos: pesos
  };
}

/**
 * Todas las sesiones de la hoja: une Sesiones, Registro y Tiempos por ID de sesión.
 * Las filas añadidas a mano sin ID se agrupan por fecha y sesión.
 */
function leerSesiones_(ss) {
  const tz = ss.getSpreadsheetTimeZone();
  const mapa = {};
  const orden = [];
  const obtener = function (id, fecha, sesion) {
    if (!mapa[id]) {
      mapa[id] = { id: id, fecha: fecha, sesion: sesion, origen: '', duracion: 0, filas: [], tiempos: [] };
      orden.push(id);
    }
    return mapa[id];
  };
  filas_(ss, 'Sesiones', 9).forEach(function (f) {
    const fecha = normalizarFecha_(f[1], tz);
    if (!fecha) return;
    const id = texto_(f[0]) || ('manual:' + fecha + ':' + texto_(f[2]));
    const s = obtener(id, fecha, texto_(f[2]));
    s.origen = texto_(f[7]);
    s.duracion = aNumero_(f[4]) || 0;
  });
  filas_(ss, 'Registro', 10).forEach(function (f) {
    const fecha = normalizarFecha_(f[1], tz);
    const ejercicio = texto_(f[3]);
    const reps = aNumero_(f[6]);
    if (!fecha || !ejercicio || reps === null) return;
    const id = texto_(f[0]) || ('manual:' + fecha + ':' + texto_(f[2]));
    obtener(id, fecha, texto_(f[2])).filas.push([ejercicio, aNumero_(f[4]) || 0, aNumero_(f[5]) || 0, reps, texto_(f[7])]);
  });
  filas_(ss, 'Tiempos', 3).forEach(function (f) {
    const s = mapa[texto_(f[0])];
    const min = aNumero_(f[2]);
    if (s && texto_(f[1]) && min !== null) s.tiempos.push([texto_(f[1]), min]);
  });
  return orden.map(function (id) { return mapa[id]; }).sort(function (a, b) {
    return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0;
  });
}

/** Huella corta del contenido de una sesión (si cambia algo, cambia la huella) */
function huella_(s) {
  return md5_(JSON.stringify([s.id, s.fecha, s.sesion, s.origen, s.duracion, s.filas, s.tiempos])).slice(0, 12);
}

/**
 * Datos para la app. `tengo` = huellas de las sesiones que la app ya tiene:
 * de esas solo se devuelve {id, huella}; del resto, la sesión completa.
 */
function leerDatos_(ss, tengo) {
  const conocidas = {};
  (Array.isArray(tengo) ? tengo : []).forEach(function (h) { conocidas[h] = true; });
  let nuevas = 0;
  const sesiones = leerSesiones_(ss).map(function (s) {
    const h = huella_(s);
    if (conocidas[h]) return { id: s.id, huella: h };
    nuevas++;
    s.huella = h;
    return s;
  });
  return { ok: true, version: VERSION_SCRIPT, rutina: leerRutina_(ss), perfil: leerPerfil_(ss), sesiones: sesiones, nuevas: nuevas };
}

/* ===================================================================== */
/* 6. ESCRITURA                                                           */
/* ===================================================================== */

function guardarSesion_(ss, sesion, u) {
  if (!sesion || typeof sesion !== 'object') throw new Error('Falta la sesión.');
  if (!sesion.id || typeof sesion.id !== 'string') throw new Error('La sesión no tiene identificador.');
  const nombreSesion = texto_(sesion.sesion);
  if (!nombreSesion) throw new Error('La sesión no tiene nombre.');
  const fecha = parsearFecha_(sesion.fecha);
  if (!Array.isArray(sesion.ejercicios) || !sesion.ejercicios.length) throw new Error('La sesión no tiene ejercicios.');

  const filas = [];
  let volumen = 0;
  sesion.ejercicios.forEach(function (ej) {
    if (!ej.nombre || typeof ej.nombre !== 'string') throw new Error('Ejercicio sin nombre.');
    if (!Array.isArray(ej.series)) throw new Error('Ejercicio sin series: ' + ej.nombre);
    const nota = typeof ej.nota === 'string' ? ej.nota.trim() : '';
    ej.series.forEach(function (s, i) {
      const serie = Number(s.serie), peso = Number(s.peso), reps = Number(s.reps);
      if (!Number.isInteger(serie) || serie < 1 || serie > 10) throw new Error('Serie nº no válida en ' + ej.nombre);
      if (!isFinite(peso) || peso < 0) throw new Error('Peso no válido en ' + ej.nombre + ' (serie ' + serie + ')');
      if (!Number.isInteger(reps) || reps < 0 || reps > 100) throw new Error('Reps no válidas en ' + ej.nombre + ' (serie ' + serie + ')');
      volumen += peso * reps;
      filas.push([sesion.id, fecha, nombreSesion, ej.nombre, serie, peso, reps, i === 0 ? nota : '', peso * reps, rm1_(peso, reps)]);
    });
  });
  if (!filas.length) throw new Error('La sesión no tiene ninguna serie.');

  // Si ya la recibimos (p. ej. se cortó la conexión justo después), no se duplica
  if (filas_(ss, 'Sesiones', 1).some(function (f) { return texto_(f[0]) === sesion.id; })) {
    return { ok: true, duplicada: true, filas: 0 };
  }

  const tiempos = (sesion.tiempos || []).filter(function (t) {
    const m = Number(t.minutos);
    return t.ejercicio && isFinite(m) && m >= 0 && m <= 600;
  }).map(function (t) { return [sesion.id, String(t.ejercicio), Math.round(Number(t.minutos) * 10) / 10]; });
  const duracion = Number(sesion.duracion);
  const tz = ss.getSpreadsheetTimeZone();
  const inicio = sesion.inicio ? Utilities.formatDate(new Date(sesion.inicio), tz, 'HH:mm') : '';

  agregarFilas_(ss.getSheetByName('Registro'), filas, 2);
  if (tiempos.length) agregarFilas_(ss.getSheetByName('Tiempos'), tiempos);
  agregarFilas_(ss.getSheetByName('Sesiones'), [[sesion.id, fecha, nombreSesion, inicio,
    isFinite(duracion) && duracion > 0 ? Math.round(duracion * 10) / 10 : '', filas.length, volumen, 'App', new Date()]], 2);
  ss.getSheetByName('Sesiones').getRange(ss.getSheetByName('Sesiones').getLastRow(), 9).setNumberFormat('dd/mm/yyyy HH:mm');
  actualizarProgreso_(ss);
  if (u && u.fila) pestanaUsuarios_().getRange(u.fila, COL.ultimo).setValue(fecha).setNumberFormat('dd/mm/yyyy');
  SpreadsheetApp.flush();
  return { ok: true, filas: filas.length };
}

function agregarFilas_(h, filas, colFecha) {
  if (!filas.length) return;
  const inicio = h.getLastRow() + 1;
  const ultima = inicio + filas.length - 1;
  if (ultima > h.getMaxRows()) h.insertRowsAfter(h.getMaxRows(), ultima - h.getMaxRows() + 100);
  h.getRange(inicio, 1, filas.length, filas[0].length).setValues(filas);
  if (colFecha) h.getRange(inicio, colFecha, filas.length, 1).setNumberFormat('dd/mm/yyyy');
}

/** Rehace la pestaña Progreso (resumen por ejercicio) a partir de los datos */
function actualizarProgreso_(ss) {
  const h = ss.getSheetByName('Progreso');
  if (!h) return;
  const rutina = leerRutina_(ss);
  const porEj = {};
  leerSesiones_(ss).forEach(function (s) {
    const dias = {};
    s.filas.forEach(function (f) {
      const e = porEj[f[0]] = porEj[f[0]] || { series: 0, dias: 0, mejorPeso: 0, mejorRm: 0, ultima: '', maxUltima: 0, sesion: s.sesion };
      e.series++;
      e.mejorPeso = Math.max(e.mejorPeso, f[2]);
      e.mejorRm = Math.max(e.mejorRm, rm1_(f[2], f[3]));
      if (!dias[f[0]]) { dias[f[0]] = true; e.dias++; }
      if (s.fecha > e.ultima) { e.ultima = s.fecha; e.maxUltima = f[2]; } else if (s.fecha === e.ultima) e.maxUltima = Math.max(e.maxUltima, f[2]);
    });
  });
  const nombres = rutina.map(function (r) { return r.ejercicio; });
  Object.keys(porEj).forEach(function (n) { if (nombres.indexOf(n) < 0) nombres.push(n); });
  const sesionDe = {};
  rutina.forEach(function (r) { sesionDe[r.ejercicio] = r.sesion; });
  const filas = nombres.map(function (n) {
    const e = porEj[n];
    return e ? [n, sesionDe[n] || e.sesion, e.series, e.dias, e.mejorPeso, e.mejorRm, fechaDe_(e.ultima), e.maxUltima]
      : [n, sesionDe[n] || '', 0, 0, '', '', '', ''];
  });
  if (h.getMaxRows() > 1) h.getRange(2, 1, h.getMaxRows() - 1, CABECERAS.Progreso.length).clearContent();
  if (filas.length) {
    if (filas.length + 1 > h.getMaxRows()) h.insertRowsAfter(h.getMaxRows(), filas.length + 1 - h.getMaxRows());
    h.getRange(2, 1, filas.length, CABECERAS.Progreso.length).setValues(filas);
    h.getRange(2, 7, filas.length, 1).setNumberFormat('dd/mm/yyyy');
  }
}

function filaCampoPerfil_(h, etiqueta) {
  const v = h.getRange(1, 1, Math.max(h.getLastRow(), 6), 1).getValues();
  for (let i = 0; i < v.length; i++) if (texto_(v[i][0]) === etiqueta) return i + 1;
  return null;
}

function guardarPerfil_(ss, p) {
  if (!p || typeof p !== 'object') throw new Error('Faltan los datos del perfil.');
  const altura = p.altura === '' || p.altura === null || p.altura === undefined ? '' : Number(p.altura);
  if (altura !== '' && (!isFinite(altura) || altura < 100 || altura > 250)) throw new Error('Altura no válida (en cm).');
  const recordatorio = p.recordatorio === undefined ? undefined : Number(p.recordatorio);
  if (recordatorio !== undefined && (!Number.isInteger(recordatorio) || recordatorio < 0 || recordatorio > 60)) throw new Error('Recordatorio no válido (días, 0 = desactivado).');
  const h = ss.getSheetByName('Perfil');
  const escribir = function (etiqueta, valor, formato) {
    let f = filaCampoPerfil_(h, etiqueta);
    if (!f) { f = h.getLastRow() + 1; h.getRange(f, 1).setValue(etiqueta); }
    const celda = h.getRange(f, 2);
    celda.setValue(valor);
    if (formato) celda.setNumberFormat(formato);
  };
  if (p.nombre !== undefined) escribir(PERFIL_CAMPOS.nombre, texto_(p.nombre).slice(0, 40));
  if (p.nacimiento !== undefined) escribir(PERFIL_CAMPOS.nacimiento, p.nacimiento ? parsearFecha_(p.nacimiento) : '', 'dd/mm/yyyy');
  if (p.altura !== undefined) escribir(PERFIL_CAMPOS.altura, altura);
  if (recordatorio !== undefined) escribir(PERFIL_CAMPOS.recordatorio, recordatorio);
  SpreadsheetApp.flush();
  return { ok: true };
}

/** Añade (o corrige, si ya hay uno ese día) un registro de peso corporal */
function guardarPeso_(ss, fechaTxt, peso) {
  const kg = Number(peso);
  if (!isFinite(kg) || kg < 30 || kg > 300) throw new Error('Peso no válido.');
  const fecha = parsearFecha_(fechaTxt);
  const tz = ss.getSpreadsheetTimeZone();
  const h = ss.getSheetByName('Perfil');
  const v = h.getRange(1, 4, Math.max(h.getLastRow(), 1), 1).getValues();
  let fila = 0;
  let ultima = 1;
  for (let i = 1; i < v.length; i++) {
    if (v[i][0] !== '' && v[i][0] !== null) ultima = i + 1;
    if (normalizarFecha_(v[i][0], tz) === fechaTxt) fila = i + 1;
  }
  if (!fila) fila = ultima + 1;
  h.getRange(fila, 4, 1, 2).setValues([[fecha, kg]]);
  h.getRange(fila, 4).setNumberFormat('dd/mm/yyyy');
  SpreadsheetApp.flush();
  return { ok: true };
}

function guardarDescanso_(ss, ejercicio, segundos) {
  const seg = Number(segundos);
  if (!isFinite(seg) || seg < 15 || seg > 900) throw new Error('Descanso no válido.');
  const h = ss.getSheetByName('Rutina');
  const v = filas_(ss, 'Rutina', 3);
  for (let i = 0; i < v.length; i++) {
    if (texto_(v[i][2]) === ejercicio) {
      const t = textoDescanso_(seg);
      h.getRange(i + 2, 6).setValue(t);
      return { ok: true, descanso: t };
    }
  }
  throw new Error('No encuentro "' + ejercicio + '" en la pestaña Rutina.');
}

/* ===================================================================== */
/* 7. EMAILS AUTOMÁTICOS                                                  */
/* ===================================================================== */

/** Crea (o rehace) los dos activadores: resumen de los lunes y recordatorios diarios */
function activarAvisos() {
  const manejadores = ['enviarResumenesSemanales', 'enviarRecordatorios'];
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (manejadores.indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('enviarResumenesSemanales').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(7).nearMinute(0).everyWeeks(1).create();
  ScriptApp.newTrigger('enviarRecordatorios').timeBased().atHour(18).everyDays(1).create();
  const ui = ui_();
  if (ui) {
    ui.alert('Emails activados',
      'Resumen semanal: cada lunes hacia las 7:00.\nRecordatorio: si alguien lleva los días de su Perfil sin entrenar (7 por defecto), hacia las 18:00.\n\n' +
      'Zona horaria del script: ' + Session.getScriptTimeZone() + ' (cámbiala en ⚙ Configuración del proyecto si no es Madrid).', ui.ButtonSet.OK);
  }
}

function hoyIso_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function enviarResumenesSemanales(_evento, hoyIso) {
  const hoy = typeof hoyIso === 'string' ? hoyIso : hoyIso_();
  let enviados = 0;
  leerUsuarios_().forEach(function (u) {
    if (!u.activo || !u.email) return;
    try { enviarResumen_(u, hoy); enviados++; } catch (e) { console.error('Resumen de ' + u.nombre + ': ' + e.message); }
  });
  return enviados;
}

function enviarResumen_(u, hoy, destino) {
  const ss = SpreadsheetApp.openById(u.hoja);
  const r = calcularResumen_(leerSesiones_(ss), leerRutina_(ss), hoy);
  MailApp.sendEmail({ to: destino || u.email, subject: 'EDUX TRAINING · Tu semana (' + r.rango + ')', htmlBody: htmlResumen_(r, u.nombre), name: 'EDUX TRAINING' });
}

/** Envía ahora mismo el resumen de la semana pasada al administrador (para probarlo) */
function probarResumenSemanal() {
  const u = leerUsuarios_().filter(function (x) { return x.rol === 'admin'; })[0];
  if (!u) throw new Error('Primero: menú EDUX → 1 · Instalar.');
  enviarResumen_(u, hoyIso_(), Session.getEffectiveUser().getEmail());
  const ui = ui_();
  if (ui) ui.alert('Resumen enviado a ' + Session.getEffectiveUser().getEmail());
}

/** Recordatorio a quien lleve los días de su Perfil sin entrenar (uno por cada parón) */
function enviarRecordatorios(_evento, hoyIso) {
  const hoy = typeof hoyIso === 'string' ? hoyIso : hoyIso_();
  let enviados = 0;
  leerUsuarios_().forEach(function (u) {
    if (!u.activo || !u.email) return;
    try {
      const ss = SpreadsheetApp.openById(u.hoja);
      const perfil = leerPerfil_(ss);
      const dias = perfil ? perfil.recordatorio : RECORDATORIO_DEFECTO;
      if (!dias || dias <= 0) return;
      const sesiones = leerSesiones_(ss);
      if (!sesiones.length) return;
      const ultima = sesiones[sesiones.length - 1].fecha;
      const sin = diasEntre_(ultima, hoy);
      if (sin < dias) return;
      if (isoDe_(u.recordatorioPor) === ultima) return;   // ya se le avisó en este parón
      const siguiente = siguienteSesion_(sesiones, leerRutina_(ss));
      MailApp.sendEmail({
        to: u.email, subject: 'EDUX TRAINING · Llevas ' + sin + ' días sin entrenar', name: 'EDUX TRAINING',
        htmlBody: plantillaEmail_('¿Volvemos, ' + esc_(u.nombre) + '?',
          '<p style="color:#c3bdd4;line-height:1.5">Llevas <b style="color:#f4f2fa">' + sin + ' días</b> sin entrenar (último entreno: ' + fechaTxt_(ultima) + ').</p>' +
          (siguiente ? cajaSiguiente_(siguiente) : '') +
          '<p style="margin-top:20px"><a href="' + APP_URL + '" style="display:inline-block;padding:12px 22px;border-radius:999px;background:#7c3aed;color:#fff;font-weight:700;text-decoration:none">Abrir EDUX TRAINING</a></p>' +
          '<p style="color:#8a8599;font-size:12px;margin-top:18px">Puedes cambiar los días del aviso (o desactivarlo con 0) en tu Perfil de la app.</p>')
      });
      pestanaUsuarios_().getRange(u.fila, COL.recordatorio, 1, 2).setValues([[fechaDe_(hoy), fechaDe_(ultima)]]).setNumberFormat('dd/mm/yyyy');
      enviados++;
    } catch (e) {
      console.error('Recordatorio de ' + u.nombre + ': ' + e.message);
    }
  });
  return enviados;
}

function siguienteSesion_(sesiones, rutina) {
  const orden = [];
  rutina.forEach(function (r) { if (orden.indexOf(r.sesion) < 0) orden.push(r.sesion); });
  if (!orden.length) return null;
  for (let i = sesiones.length - 1; i >= 0; i--) {
    const k = orden.indexOf(sesiones[i].sesion);
    if (k >= 0) return orden[(k + 1) % orden.length];
  }
  return orden[0];
}

/**
 * Datos del resumen de la semana anterior a la de `hoyIso` (lunes a domingo).
 * Función pura (sin acceso a la hoja) para poder probarla.
 */
function calcularResumen_(sesiones, rutina, hoyIso) {
  const lunes = lunesDe_(hoyIso);
  const ini = sumarDias_(lunes, -7), fin = sumarDias_(lunes, -1);
  const iniPrev = sumarDias_(ini, -7), finPrev = sumarDias_(ini, -1);
  const musculosDe = {};
  rutina.forEach(function (r) { musculosDe[r.ejercicio] = [r.principal].concat(r.secundarios).filter(String); });

  const semana = function (a, b) {
    const sel = sesiones.filter(function (s) { return s.fecha >= a && s.fecha <= b; });
    let series = 0, volumen = 0, minutos = 0;
    sel.forEach(function (s) {
      minutos += s.duracion || 0;
      s.filas.forEach(function (f) { series++; volumen += f[2] * f[3]; });
    });
    return { sesiones: sel, series: series, volumen: volumen, minutos: minutos };
  };
  const act = semana(ini, fin);
  const prev = semana(iniPrev, finPrev);

  const musculos = {};
  MUSCULOS.forEach(function (m) { musculos[m] = 0; });
  act.sesiones.forEach(function (s) {
    s.filas.forEach(function (f) {
      (musculosDe[f[0]] || []).forEach(function (m, i) { if (musculos[m] !== undefined) musculos[m] += i === 0 ? 1 : 0.5; });
    });
  });

  // Récords batidos en la semana (la primera vez de un ejercicio no cuenta)
  const porEj = {};
  sesiones.forEach(function (s) {
    s.filas.forEach(function (f) {
      porEj[f[0]] = porEj[f[0]] || {};
      const d = porEj[f[0]][s.fecha] = porEj[f[0]][s.fecha] || { peso: 0, rm: 0, sp: null, sr: null };
      if (!d.sp || f[2] > d.sp[0] || (f[2] === d.sp[0] && f[3] > d.sp[1])) d.sp = [f[2], f[3]];
      if (!d.sr || rm1_(f[2], f[3]) > d.rm) d.sr = [f[2], f[3]];
      d.peso = Math.max(d.peso, f[2]);
      d.rm = Math.max(d.rm, rm1_(f[2], f[3]));
    });
  });
  const serie = function (x) { return '(' + numTxt_(x[0], 2) + ' kg × ' + x[1] + (x[1] === 1 ? ' rep' : ' reps') + ')'; };
  const records = [];
  Object.keys(porEj).forEach(function (ej) {
    let bestP = null, bestR = null;
    Object.keys(porEj[ej]).sort().forEach(function (dia) {
      const d = porEj[ej][dia];
      if (bestP !== null && dia >= ini && dia <= fin) {
        if (d.peso > bestP) records.push({ ejercicio: ej, fecha: dia, texto: 'Peso ' + numTxt_(d.peso, 2) + ' kg ' + serie(d.sp) + ' · antes ' + numTxt_(bestP, 2) + ' kg' });
        else if (d.rm > bestR) records.push({ ejercicio: ej, fecha: dia, texto: '1RM est. ' + numTxt_(d.rm) + ' kg ' + serie(d.sr) + ' · antes ' + numTxt_(bestR) + ' kg' });
      }
      bestP = bestP === null ? d.peso : Math.max(bestP, d.peso);
      bestR = bestR === null ? d.rm : Math.max(bestR, d.rm);
    });
  });

  return {
    rango: fechaTxt_(ini) + ' – ' + fechaTxt_(fin),
    act: act, prev: prev, musculos: musculos, records: records,
    siguiente: siguienteSesion_(sesiones, rutina)
  };
}

function plantillaEmail_(titulo, cuerpo) {
  return '<div style="background:#09080d;padding:24px 12px;font-family:Segoe UI,Roboto,Arial,sans-serif;color:#f4f2fa">' +
    '<div style="max-width:560px;margin:0 auto">' +
    '<div style="font-weight:800;letter-spacing:4px;font-size:15px">EDUX <span style="color:#c4b5fd;font-weight:600;letter-spacing:6px;font-size:11px">TRAINING</span></div>' +
    '<h1 style="margin:18px 0 8px;font-size:24px">' + titulo + '</h1>' + cuerpo +
    '<div style="color:#8a8599;font-size:11px;margin-top:22px;text-align:center">Enviado por EDUX TRAINING.</div></div></div>';
}

function cajaSiguiente_(nombre) {
  return '<div style="margin-top:22px;border-radius:16px;padding:18px;background:linear-gradient(135deg,#b16cf9,#7c3aed 55%,#5b21b6);background-color:#7c3aed">' +
    '<div style="font-size:11px;font-weight:800;letter-spacing:3px;opacity:.85">TE TOCA</div>' +
    '<div style="font-size:28px;font-weight:900;text-transform:uppercase;margin-top:4px">' + esc_(nombre) + '</div></div>';
}

function htmlResumen_(r, nombre) {
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
  let html = '<div style="color:#bdb7cc">Tu semana del ' + r.rango + '</div>';
  if (!a.sesiones.length) {
    html += '<div style="margin-top:18px;background:#121018;border:1px solid #262230;border-radius:14px;padding:18px">La semana pasada no registraste entrenos. ¡Esta semana a por ello!</div>';
  } else {
    html += '<table style="width:100%;border-collapse:collapse;margin-top:14px"><tr>' +
      caja(a.sesiones.length, 'Sesiones', cambio(a.sesiones.length, p.sesiones.length, function (x) { return x; })) +
      caja(a.series, 'Series', cambio(a.series, p.series, function (x) { return x; })) + '</tr><tr>' +
      caja(volTxt_(a.volumen), 'Volumen (kg × reps)', cambio(a.volumen, p.volumen, volTxt_)) +
      caja(a.minutos ? Math.round(a.minutos) + ' min' : '—', 'Tiempo entrenando', a.minutos && p.minutos ? cambio(a.minutos, p.minutos, function (x) { return Math.round(x) + ' min'; }) : '') +
      '</tr></table>';
    html += '<h2 style="font-size:13px;letter-spacing:2px;color:#8a8599;margin:22px 0 8px">SESIONES</h2><div style="color:#bdb7cc">' +
      a.sesiones.map(function (s) { return fechaTxt_(s.fecha) + ' · <b style="color:#f4f2fa">' + esc_(s.sesion) + '</b>'; }).join('<br>') + '</div>';
    html += '<h2 style="font-size:13px;letter-spacing:2px;color:#8a8599;margin:22px 0 8px">RÉCORDS</h2>';
    html += r.records.length
      ? r.records.map(function (x) { return '<div style="padding:6px 0;border-top:1px solid #262230"><b>' + esc_(x.ejercicio) + '</b><br><span style="color:#bdb7cc">' + fechaTxt_(x.fecha) + ' · ' + x.texto + '</span></div>'; }).join('')
      : '<div style="color:#bdb7cc">Ningún récord esta semana. ¡La próxima cae!</div>';
    const conSeries = MUSCULOS.filter(function (m) { return r.musculos[m] > 0; });
    if (conSeries.length) {
      const max = Math.max.apply(null, conSeries.map(function (m) { return r.musculos[m]; }));
      html += '<h2 style="font-size:13px;letter-spacing:2px;color:#8a8599;margin:22px 0 8px">SERIES POR MÚSCULO</h2><table style="width:100%;border-collapse:collapse">';
      conSeries.forEach(function (m) {
        const v = r.musculos[m];
        html += '<tr><td style="width:90px;padding:3px 8px 3px 0;color:#bdb7cc;font-size:13px">' + m + '</td>' +
          '<td style="padding:3px 0"><div style="background:#9b6cf6;height:12px;border-radius:0 4px 4px 0;width:' + Math.max(v / max * 100, 2) + '%"></div></td>' +
          '<td style="width:40px;text-align:right;font-size:13px;font-weight:700;color:#f4f2fa">' + numTxt_(v) + '</td></tr>';
      });
      html += '</table>';
    }
  }
  if (r.siguiente) html += cajaSiguiente_(r.siguiente);
  return plantillaEmail_(nombre ? 'Buenos días, ' + esc_(nombre) : 'Buenos días', html);
}

/* ===================================================================== */
/* 8. MIGRACIÓN DE LA HOJA ANTIGUA (formato de la v1–v7)                  */
/* ===================================================================== */

// Músculo principal, secundarios y material de los ejercicios de la rutina original
const MIGRACION_EJERCICIOS = {
  'Press banca': ['Pecho', 'Hombro, Tríceps', 'Barra'],
  'Press inclinado 45º': ['Pecho', 'Hombro, Tríceps', 'Barra'],
  'Fondos lastrados': ['Pecho', 'Tríceps', 'Peso corporal'],
  'Contractora de pecho': ['Pecho', '', 'Máquina'],
  'Press militar': ['Hombro', 'Tríceps', 'Barra'],
  'Elevaciones laterales en polea': ['Hombro', '', 'Polea'],
  'Press francés': ['Tríceps', '', 'Otro'],
  'Extensión de tríceps en polea cruzada': ['Tríceps', '', 'Polea'],
  'Extensión de tríceps sobre la cabeza en polea': ['Tríceps', '', 'Polea'],
  'Remo en T': ['Espalda', 'Bíceps', 'Máquina'],
  'Jalón al pecho, agarre neutro': ['Espalda', 'Bíceps', 'Polea'],
  'Remo en máquina': ['Espalda', 'Bíceps', 'Máquina'],
  'Remo en polea': ['Espalda', 'Bíceps', 'Polea'],
  'Curl predicador': ['Bíceps', '', 'Polea'],
  'Curl de bíceps en polea': ['Bíceps', '', 'Polea'],
  'Curl martillo con mancuernas': ['Bíceps', 'Antebrazo', 'Mancuernas'],
  'Sentadilla hack': ['Cuádriceps', 'Glúteo', 'Máquina'],
  'Extensión de rodilla': ['Cuádriceps', '', 'Máquina'],
  'Curl femoral sentado': ['Femoral', '', 'Máquina'],
  'Curl femoral tumbado': ['Femoral', '', 'Máquina'],
  'Peso muerto rumano': ['Femoral', 'Glúteo, Lumbar', 'Barra'],
  'Hip thrust': ['Glúteo', '', 'Barra'],
  'Aductora en máquina': ['Aductores', '', 'Máquina']
};

function migrarDesdeMenu() {
  const ui = ui_();
  const r = ui.prompt('EDUX · Migrar hoja antigua', 'Pega la URL de tu hoja antigua ("Seguimiento entreno – PPL + torso").\nNo se modifica: solo se leen sus datos.', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const m = /\/d\/([a-zA-Z0-9_-]+)/.exec(r.getResponseText()) || [null, r.getResponseText().trim()];
  const res = migrarHojaAntigua(m[1]);
  ui.alert('Migración terminada',
    'Copiado a tu hoja nueva:\n· ' + res.ejercicios + ' ejercicios de la rutina\n· ' + res.series + ' series\n· ' + res.sesiones +
    ' sesiones (' + res.asistencia + ' solo de asistencia)\n· ' + res.tiempos + ' tiempos por ejercicio\n· ' + res.pesos + ' registros de peso\n\n' +
    'Tu hoja antigua no se ha tocado. Siguiente paso: menú EDUX → 3 · Activar emails automáticos.', ui.ButtonSet.OK);
}

/**
 * Copia la hoja antigua a la hoja nueva del administrador (o a idDestino).
 * Se puede repetir: cada vez vacía la hoja nueva y vuelve a copiar.
 */
function migrarHojaAntigua(idAntigua, idDestino) {
  const vieja = SpreadsheetApp.openById(idAntigua);
  const admin = leerUsuarios_().filter(function (u) { return u.rol === 'admin'; })[0];
  const destino = SpreadsheetApp.openById(idDestino || admin.hoja);
  const tz = vieja.getSpreadsheetTimeZone();
  prepararHojaUsuario_(destino, admin ? admin.nombre : '');

  // --- Rutina: A Día · B # · C Ejercicio · D Series · E Repeticiones · F Descanso ---
  const rutina = [];
  filas_(vieja, 'Rutina', 6).forEach(function (f) {
    const ej = texto_(f[2]);
    if (!texto_(f[0]) || !ej) return;
    const m = MIGRACION_EJERCICIOS[ej] || ['', '', 'Otro'];
    rutina.push([texto_(f[0]), aNumero_(f[1]) || rutina.length + 1, ej, aNumero_(f[3]) || 3, texto_(f[4]), texto_(f[5]), m[0], m[1], m[2]]);
  });

  // --- Registro antiguo (datos desde la fila 3): A Fecha · C Sesión · D Ejercicio · E Serie · F Peso · G Reps · H Nota ---
  const hReg = vieja.getSheetByName('Registro');
  const regViejo = hReg && hReg.getLastRow() >= 3 ? hReg.getRange(3, 1, hReg.getLastRow() - 2, 8).getValues() : [];
  const sesiones = {};
  const idDe = function (fecha, sesion) { return 'mig-' + fecha + '-' + sesion.toLowerCase().replace(/[^a-z0-9áéíóúñü]+/g, '-'); };
  const sesionDe = function (fecha, nombre) {
    const id = idDe(fecha, nombre);
    return sesiones[id] = sesiones[id] || { id: id, fecha: fecha, sesion: nombre, filas: [], duracion: '', tiempos: [] };
  };
  regViejo.forEach(function (f) {
    const fecha = normalizarFecha_(f[0], tz);
    const ej = texto_(f[3]);
    const reps = aNumero_(f[6]);
    if (!fecha || !ej || reps === null) return;
    sesionDe(fecha, texto_(f[2])).filas.push([ej, aNumero_(f[4]) || 0, aNumero_(f[5]) || 0, reps, texto_(f[7])]);
  });

  // --- Tiempos antiguos: A Fecha · B Sesión · C Ejercicio · D Minutos ("Sesión completa" = duración) ---
  filas_(vieja, 'Tiempos', 4).forEach(function (f) {
    const fecha = normalizarFecha_(f[0], tz);
    const min = aNumero_(f[3]);
    if (!fecha || !texto_(f[2]) || min === null) return;
    const s = sesionDe(fecha, texto_(f[1]));
    if (texto_(f[2]) === 'Sesión completa') s.duracion = min; else s.tiempos.push([s.id, texto_(f[2]), min]);
  });

  const lista = Object.keys(sesiones).map(function (k) { return sesiones[k]; })
    .sort(function (a, b) { return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0; });
  const filasReg = [], filasSes = [], filasTie = [];
  let asistencia = 0;
  lista.forEach(function (s) {
    let vol = 0;
    s.filas.forEach(function (f) {
      vol += f[2] * f[3];
      filasReg.push([s.id, fechaDe_(s.fecha), s.sesion, f[0], f[1], f[2], f[3], f[4], f[2] * f[3], rm1_(f[2], f[3])]);
    });
    if (!s.filas.length) asistencia++;
    filasSes.push([s.id, fechaDe_(s.fecha), s.sesion, '', s.duracion === '' ? '' : s.duracion, s.filas.length, vol,
      s.filas.length ? 'Migrada' : 'Solo asistencia', '']);
    s.tiempos.forEach(function (t) { filasTie.push(t); });
  });

  // --- Perfil: A Dato · B Valor + D Fecha · E Peso ---
  const hPerf = vieja.getSheetByName('Perfil');
  const perfilViejo = hPerf ? hPerf.getRange(1, 1, Math.max(hPerf.getLastRow(), 4), 5).getValues() : [];
  const datoViejo = function (etiqueta) {
    for (let i = 0; i < perfilViejo.length; i++) if (texto_(perfilViejo[i][0]) === etiqueta) return perfilViejo[i][1];
    return '';
  };
  const pesos = [];
  for (let i = 1; i < perfilViejo.length; i++) {
    const f = normalizarFecha_(perfilViejo[i][3], tz);
    const p = aNumero_(perfilViejo[i][4]);
    if (f && p !== null) pesos.push([fechaDe_(f), p]);
  }

  // --- Escribir en la hoja nueva (vaciándola antes: la migración se puede repetir) ---
  const vaciarYEscribir = function (nombre, filas, colFecha) {
    const h = destino.getSheetByName(nombre);
    if (h.getMaxRows() > 1) h.getRange(2, 1, h.getMaxRows() - 1, CABECERAS[nombre].length).clearContent();
    agregarFilas_(h, filas, colFecha);
  };
  vaciarYEscribir('Rutina', rutina);
  vaciarYEscribir('Registro', filasReg, 2);
  vaciarYEscribir('Sesiones', filasSes, 2);
  vaciarYEscribir('Tiempos', filasTie);

  const hNueva = destino.getSheetByName('Perfil');
  const nac = normalizarFecha_(datoViejo('Fecha de nacimiento'), tz);
  guardarPerfil_(destino, {
    nombre: texto_(datoViejo('Nombre')) || (admin ? admin.nombre : ''),
    nacimiento: nac || '', altura: aNumero_(datoViejo('Altura (cm)')) || ''
  });
  if (hNueva.getMaxRows() > 1) hNueva.getRange(2, 4, hNueva.getMaxRows() - 1, 2).clearContent();
  if (pesos.length) {
    hNueva.getRange(2, 4, pesos.length, 2).setValues(pesos);
    hNueva.getRange(2, 4, pesos.length, 1).setNumberFormat('dd/mm/yyyy');
  }

  actualizarProgreso_(destino);
  if (admin && lista.length) {
    pestanaUsuarios_().getRange(admin.fila, COL.ultimo).setValue(fechaDe_(lista[lista.length - 1].fecha)).setNumberFormat('dd/mm/yyyy');
  }
  SpreadsheetApp.flush();
  return { ejercicios: rutina.length, series: filasReg.length, sesiones: filasSes.length, asistencia: asistencia, tiempos: filasTie.length, pesos: pesos.length };
}

/* ===================================================================== */
/* 9. UTILIDADES                                                          */
/* ===================================================================== */

function texto_(v) { return v === null || v === undefined ? '' : String(v).trim(); }

function esc_(t) {
  return String(t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
}

/** Número de la celda (acepta "62,5"), o null si está vacía o no es un número */
function aNumero_(v) {
  if (typeof v === 'number') return v;
  const t = texto_(v).replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return isFinite(n) ? n : null;
}

function quitarTildes_(t) {
  return t.toLowerCase().replace(/[áàä]/g, 'a').replace(/[éèë]/g, 'e').replace(/[íìï]/g, 'i').replace(/[óòö]/g, 'o').replace(/[úùü]/g, 'u');
}

function musculoValido_(v) {
  const t = quitarTildes_(texto_(v));
  if (!t) return '';
  for (let i = 0; i < MUSCULOS.length; i++) if (quitarTildes_(MUSCULOS[i]) === t) return MUSCULOS[i];
  return '';
}

/** "3,5 min" → 210 · "90 s" → 90 · "1:30" → 90 · 3 → 180 (números pequeños = minutos) */
function segundosDescanso_(v) {
  if (typeof v === 'number') return Math.round(v <= 15 ? v * 60 : v);
  const t = texto_(v).toLowerCase().replace(',', '.');
  if (!t) return 120;
  let m = /^(\d+):(\d{1,2})/.exec(t);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = /^(\d+(?:\.\d+)?)\s*(s|seg|segundos?)\b/.exec(t);
  if (m) return Math.round(Number(m[1]));
  m = /^(\d+(?:\.\d+)?)/.exec(t);
  if (m) return Math.round(Number(m[1]) <= 15 ? Number(m[1]) * 60 : Number(m[1]));
  return 120;
}

/** 210 → "3,5 min" */
function textoDescanso_(seg) {
  return String(Math.round((seg / 60) * 100) / 100).replace('.', ',') + ' min';
}

function rm1_(peso, reps) { return Math.round(peso * (1 + reps / 30) * 10) / 10; }

function md5_(t) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, t, Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}

/** "2026-11-03" → Date a las 12:00 (las 12:00 evitan saltos de día por zona horaria) */
function parsearFecha_(texto) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(texto || ''));
  if (!m) throw new Error('Fecha no válida: ' + texto);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
}
function fechaDe_(iso) { return parsearFecha_(iso); }

/** Fecha de una celda (Date o texto "dd/mm/aaaa") → "yyyy-MM-dd", o null */
function normalizarFecha_(v, tz) {
  if (v instanceof Date && !isNaN(v.getTime())) return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  const t = texto_(v);
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  return m ? t : null;
}

function isoDe_(v) {
  if (!v) return '';
  return normalizarFecha_(v, Session.getScriptTimeZone()) || '';
}

/* --- fechas "yyyy-MM-dd" sin líos de zona horaria (aritmética en UTC) --- */
function isoAUtc_(iso) { const p = iso.split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); }
function utcAIso_(d) { return d.toISOString().slice(0, 10); }
function sumarDias_(iso, n) { const d = isoAUtc_(iso); d.setUTCDate(d.getUTCDate() + n); return utcAIso_(d); }
function lunesDe_(iso) { const d = isoAUtc_(iso); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return utcAIso_(d); }
function diasEntre_(a, b) { return Math.round((isoAUtc_(b) - isoAUtc_(a)) / 86400000); }
const MESES_C = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function fechaTxt_(iso) { const d = isoAUtc_(iso); return d.getUTCDate() + ' ' + MESES_C[d.getUTCMonth()]; }
function numTxt_(n, dec) { const f = Math.pow(10, dec === undefined ? 1 : dec); return String(Math.round(n * f) / f).replace('.', ','); }
function volTxt_(kg) { return kg >= 1000 ? numTxt_(kg / 1000, 1) + ' t' : numTxt_(kg, 0) + ' kg'; }
