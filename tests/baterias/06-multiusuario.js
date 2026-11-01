'use strict';
/* Varios usuarios: panel de usuarios, enlace de conexión, cada uno solo ve SU hoja, permisos,
   desactivar, clave nueva, cambio de cuenta en el mismo móvil y conexión antigua (v7). */
module.exports = async function (E) {
  const post = async (cuerpo) => (await fetch(E.script, { method: 'POST', body: JSON.stringify(cuerpo) })).json();
  const enlaceDeApp = (enlace) => E.app + enlace.slice(enlace.indexOf('#'));   // el enlace real apunta a GitHub Pages
  const claveDe = (enlace) => JSON.parse(Buffer.from(enlace.split('#conectar=')[1], 'base64url').toString()).c;

  // ---------- El administrador añade a un amigo desde la app ----------
  const adm = await E.nuevaPagina(E.navegador);
  await E.conectar(adm.page, E);
  await adm.page.click('[data-tab=ajustes]');
  E.ok(await adm.page.locator('[data-accion=ver-usuarios]').count() === 1, 'el administrador ve "Usuarios" en Ajustes');
  await adm.page.click('[data-accion=ver-usuarios]');
  await adm.page.waitForSelector('.usuario');
  E.ok(await adm.page.locator('.usuario').count() === 1 && (await adm.page.textContent('.usuario')).includes('admin'), 'lista de usuarios: solo el administrador');
  await adm.page.click('[data-accion=usuario-nuevo]');
  await adm.page.fill('#nu-nombre', 'Amigo');
  await adm.page.fill('#nu-email', 'amigo@ejemplo.com');
  await adm.page.click('[data-accion=usuario-crear]');
  await adm.page.waitForSelector('#panel-enlace .qr');
  await adm.page.waitForFunction(() => document.querySelectorAll('.usuario').length === 2);
  E.ok(true, 'crear usuario: aparece en la lista y se muestra su enlace con QR');
  const enlace = await adm.page.inputValue('#enlace-texto');
  E.ok(enlace.startsWith('https://edumoal.github.io/SEGUIMINETO_GIMNASIO/#conectar='), 'el enlace apunta a la app publicada');
  const amigoU = E.sim.usuarios().find((u) => u.nombre === 'Amigo');
  const libroAmigo = E.sim.libroDe('Amigo');
  E.ok(amigoU && libroAmigo && libroAmigo.carpeta && libroAmigo.carpeta.getName() === 'Usuarios', 'el script crea su hoja en la carpeta EDUX TRAINING/Usuarios');
  E.ok(['Rutina', 'Registro', 'Sesiones', 'Tiempos', 'Perfil', 'Progreso'].every((n) => libroAmigo.getSheetByName(n)) && !libroAmigo.getSheetByName('Hoja 1'), 'hoja nueva con sus 6 pestañas');
  E.ok(libroAmigo.hojas.Rutina.validaciones.some((v) => v.c === 7 && v.v.lista.length === 13), 'columna "Músculo principal" con lista desplegable de 13 músculos');
  const correo = E.sim.correos.find((c) => c.to === 'amigo@ejemplo.com');
  E.ok(correo && correo.htmlBody.includes(enlace.replace(/&/g, '&amp;')), 'email de bienvenida con su enlace');
  E.ok(claveDe(enlace) === amigoU.clave && claveDe(enlace) !== E.clave, 'el enlace lleva SU clave');

  // ---------- El amigo abre su enlace en su móvil ----------
  const ami = await E.nuevaPagina(E.navegador);
  await ami.page.goto(enlaceDeApp(enlace));
  await ami.page.waitForFunction(() => (JSON.parse(localStorage.getItem('gym.cache') || '{}').actualizado));
  await ami.page.waitForTimeout(200);
  let cacheAmigo = await E.cacheApp(ami.page);
  E.ok(cacheAmigo.sesiones.length === 0 && cacheAmigo.admin === false && cacheAmigo.usuario.nombre === 'Amigo', 'el amigo se conecta a SU cuenta (sin los datos del administrador)');
  E.ok((await ami.page.textContent('.saludo h2')).includes('Amigo'), 'saludo con su nombre');
  E.ok((await ami.page.textContent('.hero')).includes('Pídele al administrador'), 'sin rutina: le pide al administrador que la añada');
  await ami.page.click('[data-tab=ajustes]');
  E.ok(await ami.page.locator('[data-accion=ver-usuarios]').count() === 0, 'el amigo no ve el panel de usuarios');
  const r = await post({ clave: amigoU.clave, tipo: 'usuarios' });
  E.ok(!r.ok && /administrador/.test(r.error), 'el script rechaza las acciones de administrador con la clave del amigo');
  E.ok(!(await post({ clave: 'inventada', tipo: 'datos' })).ok, 'una clave inventada no abre ninguna hoja');

  // ---------- El administrador le pone una rutina y el amigo entrena ----------
  E.sim.ponerRutina(libroAmigo, [
    ['Torso', 1, 'Press banca', 3, '8–10', '2 min', 'Pecho', 'Tríceps', 'Barra'],
    ['Torso', 2, 'Dominadas', 3, '6–10', '2,5 min', 'Espalda', 'Bíceps', 'Peso corporal'],
    ['Torso', 3, 'Crunch en polea', 2, '12–15', '90 s', 'Abdomen', '', 'Polea'],
    ['Pierna', 1, 'Sentadilla', 3, '6–8', '3 min', 'Cuádriceps', 'Glúteo, Lumbar', 'Barra'],
    ['Pierna', 2, 'Gemelo de pie', 3, '10–15', '1 min', 'Gemelos', '', 'Máquina']
  ]);
  await ami.page.click('[data-tab=inicio]');
  await ami.page.click('[data-accion=actualizar]');
  await ami.page.waitForSelector('.hero [data-accion=empezar]');
  E.ok((await ami.page.textContent('.hero-nombre')).trim() === 'Torso', 'tras actualizar ve su rutina: toca Torso');
  E.ok(await ami.page.locator('.tarjeta-sesion').count() === 2, 'sus 2 sesiones');
  E.ok(await ami.page.locator('.hero .cuerpo g.activo title', { hasText: 'Abdomen' }).count() > 0, 'el mapa muscular pinta los grupos nuevos (Abdomen)');
  const filasAdminAntes = E.sim.hojas.Registro.getLastRow();
  await ami.page.click('.hero [data-accion=empezar]');
  await ami.page.waitForSelector('.ejercicio');
  E.ok(await ami.page.locator('.ejercicio').count() === 3 && (await ami.page.textContent('#ej-2 .ej-descanso')).includes('1:30'), 'sesión con sus ejercicios y descansos (90 s)');
  for (let i = 0; i < 3; i++) {
    await ami.page.fill(`#ej-0 .serie[data-serie="${i}"] input[data-campo=peso]`, '40');
    await ami.page.fill(`#ej-0 .serie[data-serie="${i}"] input[data-campo=reps]`, '10');
    await ami.page.click(`#ej-0 .serie[data-serie="${i}"] [data-accion=check]`);
  }
  await ami.page.click('#dock [data-accion=terminar]');
  await ami.page.click('[data-accion=confirmar]');
  await ami.page.waitForFunction(() => !JSON.parse(localStorage.getItem('gym.pendientes') || '[]').length);
  await ami.page.waitForTimeout(500);
  E.ok(libroAmigo.hojas.Registro.getLastRow() === 4 && E.sim.hojas.Registro.getLastRow() === filasAdminAntes, 'la sesión va a la hoja del amigo y no a la del administrador');
  E.ok(E.sim.usuarios().find((u) => u.nombre === 'Amigo').ultimo instanceof Date, 'la hoja de Administración anota su último entreno');
  cacheAmigo = await E.cacheApp(ami.page);
  E.ok(cacheAmigo.sesiones.length === 1, 'el amigo solo tiene su sesión');
  await ami.page.click('[data-tab=progreso]');
  await ami.page.click('[data-accion=modo-prog][data-valor=musculo]');
  E.ok((await ami.page.locator('.barra-fila', { hasText: 'Pecho' }).locator('.barra-num').textContent()) === '3', 'progreso por músculo con su rutina (Pecho = 3 series)');

  // ---------- Desactivar, reactivar y clave nueva ----------
  await adm.page.click('[data-accion=usuario-cerrar-enlace]');
  const filaAmigo = adm.page.locator('.usuario', { hasText: 'Amigo' });
  await filaAmigo.locator('[data-accion=usuario-activar]').click();
  await adm.page.waitForFunction(() => document.querySelector('.usuario.inactivo'));
  E.ok(!(await post({ clave: amigoU.clave, tipo: 'ping' })).ok, 'desactivado: su clave deja de funcionar');
  await ami.page.click('[data-tab=inicio]');
  await ami.page.click('[data-accion=actualizar]');
  await ami.page.waitForSelector('.toast.error');
  E.ok((await ami.page.textContent('#toast')).includes('ya no es válido'), 'el amigo ve "tu enlace ya no es válido"');
  await filaAmigo.locator('[data-accion=usuario-activar]').click();
  await adm.page.waitForFunction(() => !document.querySelector('.usuario.inactivo'));
  E.ok((await post({ clave: amigoU.clave, tipo: 'ping' })).ok, 'reactivado: vuelve a funcionar');
  await filaAmigo.locator('[data-accion=usuario-clave]').click();
  await adm.page.waitForSelector('#panel-enlace');
  const enlaceNuevo = await adm.page.inputValue('#enlace-texto');
  E.ok(!(await post({ clave: amigoU.clave, tipo: 'ping' })).ok && (await post({ clave: claveDe(enlaceNuevo), tipo: 'ping' })).nombre === 'Amigo', 'clave nueva: el enlace antiguo deja de valer y el nuevo funciona');
  await ami.page.goto(enlaceDeApp(enlaceNuevo));
  await ami.page.waitForSelector('.toast.ok');
  E.ok((await ami.page.textContent('#toast')).includes('Conectado como Amigo'), 'el amigo se reconecta con el enlace nuevo');
  E.ok((await E.cacheApp(ami.page)).sesiones.length === 1, 'y conserva sus datos (misma hoja)');

  // ---------- Cambiar de cuenta en el mismo móvil con una sesión sin enviar ----------
  await adm.page.click('[data-tab=inicio]');
  await adm.page.evaluate(() => localStorage.setItem('gym.pendientes', JSON.stringify([{
    id: 'cambio-cuenta', sesion: 'Empuje', fecha: '2026-10-31', inicio: '2026-10-31T17:00:00.000Z',
    ejercicios: [{ nombre: 'Press banca', nota: '', series: [{ serie: 1, peso: 60, reps: 8 }] }], tiempos: [], duracion: 30
  }])));
  const dialogos = [];
  adm.page.on('dialog', (d) => dialogos.push(d.message()));
  const regAmigoAntes = libroAmigo.hojas.Registro.getLastRow();
  await adm.page.goto(enlaceDeApp(enlaceNuevo));
  await adm.page.waitForFunction(() => (JSON.parse(localStorage.getItem('gym.config') || '{}').nombre === 'Amigo'));
  await adm.page.waitForFunction(() => !JSON.parse(localStorage.getItem('gym.pendientes') || '[]').length);
  await adm.page.waitForFunction(() => JSON.parse(localStorage.getItem('gym.cache') || '{}').admin === false);
  E.ok(dialogos.some((m) => m.includes('sin enviar')), 'al cambiar de cuenta con sesiones sin enviar, pregunta antes');
  E.ok(libroAmigo.hojas.Registro.getLastRow() === regAmigoAntes + 1 && E.sim.volcar(libroAmigo.hojas.Sesiones).some((f) => f[0] === 'cambio-cuenta'), 'si aceptas, la sesión pendiente va a la cuenta nueva');
  E.ok((await E.cacheApp(adm.page)).sesiones.length === 2, 'la copia local se cambia por la de la cuenta nueva');
  await adm.page.click('[data-tab=ajustes]');
  await adm.page.click('[data-accion=desconectar]');
  E.ok(!(await adm.page.evaluate(() => localStorage.getItem('gym.config'))) && (await adm.page.textContent('#vista')).includes('enlace de conexión'), 'Desconectar borra la cuenta del móvil');
  // Conectar a mano pegando el enlace
  await adm.page.fill('#cfg-enlace', E.enlaceConexion(E));
  await adm.page.click('[data-accion=conectar-enlace]');
  await adm.page.waitForFunction(() => JSON.parse(localStorage.getItem('gym.cache') || '{}').admin === true);
  E.ok(true, 'conectar a mano pegando el enlace');

  // ---------- Conexión de la versión antigua (v7) ----------
  const vieja = await E.nuevaPagina(E.navegador);
  await vieja.page.goto(E.app);
  await vieja.page.evaluate(([url, clave]) => {
    localStorage.setItem('gym.config', JSON.stringify({ url, clave }));
    localStorage.setItem('gym.cache', JSON.stringify({ actualizado: new Date().toISOString(), filas: [['2026-10-01', 'Empuje', 'Press banca', 1, 60, 8, '']] }));
    localStorage.setItem('gym.pendientes', JSON.stringify([{ id: 'v7', sesion: 'Empuje', fecha: '2026-10-31', ejercicios: [{ nombre: 'Press banca', nota: '', series: [{ serie: 1, peso: 60, reps: 8 }] }], tiempos: [], duracion: 30 }]));
  }, [E.script, E.clave]);
  await vieja.page.reload();
  await vieja.page.waitForTimeout(600);
  E.ok((await vieja.page.textContent('#vista')).includes('Abre el enlace de conexión'), 'con la conexión antigua, Inicio pide abrir el enlace nuevo');
  E.ok((await vieja.page.evaluate(() => JSON.parse(localStorage.getItem('gym.pendientes')).length)) === 1 && !E.sim.volcar(E.sim.hojas.Sesiones).some((f) => f[0] === 'v7'), 'las sesiones pendientes no se envían hasta conectar la cuenta nueva');
  await vieja.page.goto(E.enlaceConexion(E));
  await vieja.page.waitForFunction(() => !JSON.parse(localStorage.getItem('gym.pendientes') || '[]').length);
  E.ok(E.sim.volcar(E.sim.hojas.Sesiones).some((f) => f[0] === 'v7'), 'al abrir el enlace nuevo se envían a la hoja nueva');

  const errores = [...adm.errores, ...ami.errores, ...vieja.errores];
  E.ok(!errores.length, 'sin errores en consola' + (errores.length ? ': ' + errores.join(' | ') : ''));
  await adm.ctx.close(); await ami.ctx.close(); await vieja.ctx.close();
};
