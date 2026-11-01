'use strict';
/* Instalación desde el menú EDUX y migración de una hoja con el formato antiguo (v1–v7). */
const { crearSimulador } = require('../simulador');

module.exports = async function (E) {
  const sim = E.sim;
  const D = (y, m, d) => new Date(y, m - 1, d, 12);

  // ---------- Instalar desde el menú (simulador nuevo, sin instalar) ----------
  const nuevo = crearSimulador();
  await nuevo.iniciar({ instalar: false });
  try {
    nuevo.ui.activa = true;
    nuevo.ejecutar('onOpen');
    nuevo.ui.respuestas.push('https://script.google.com/macros/s/AKfyPRUEBA/exec', 'Edu');
    nuevo.ejecutar('instalar');
    const us = nuevo.usuarios();
    E.ok(us.length === 1 && us[0].nombre === 'Edu' && us[0].rol === 'admin' && us[0].email === 'admin@ejemplo.com', 'Instalar: crea el usuario administrador con tu nombre y tu email');
    E.ok(nuevo.props.URL_WEBAPP === 'https://script.google.com/macros/s/AKfyPRUEBA/exec', 'guarda la URL de la aplicación web');
    const carpetas = Object.values(nuevo.carpetas).map((c) => c.getName()).sort();
    E.ok(carpetas.join() === 'EDUX TRAINING,Usuarios' && nuevo.admin.carpeta && nuevo.admin.carpeta.getName() === 'EDUX TRAINING', 'crea las carpetas EDUX TRAINING/Usuarios y mueve ahí la hoja de Administración');
    E.ok(nuevo.admin.getSheetByName('Usuarios') && !nuevo.admin.getSheetByName('Hoja 1'), 'pestaña Usuarios en la hoja de Administración');
    const mail = nuevo.correos[0];
    const enlace = /href="([^"]+#conectar=[^"]+)"/.exec(mail.htmlBody)[1];
    const datos = JSON.parse(Buffer.from(enlace.split('#conectar=')[1], 'base64url').toString());
    E.ok(mail.to === 'admin@ejemplo.com' && datos.u === 'https://script.google.com/macros/s/AKfyPRUEBA/exec' && datos.c === us[0].clave, 'te envía por email tu enlace de conexión (URL del script + tu clave)');
    E.ok(nuevo.ui.alertas.some((a) => a.texto.includes('Migrar hoja antigua')), 'al terminar indica el siguiente paso');
    nuevo.ejecutar('instalar');
    E.ok(nuevo.usuarios().length === 1, 'instalar otra vez no duplica al administrador');
    nuevo.props.URL_WEBAPP = '';
    nuevo.ui.respuestas.push('https://example.com/no-vale');
    let error = '';
    try { nuevo.ejecutar('instalar'); } catch (e) { error = e.message; }
    E.ok(/termina(r)? en \/exec/.test(error), 'una URL que no es de la aplicación web se rechaza');
  } finally {
    await nuevo.cerrar();
  }

  // ---------- Hoja antigua con datos inventados ----------
  const idAntigua = sim.crearHojaAntigua({
    registro: [
      [D(2026, 9, 1), 'Empuje', 'Press banca', 1, 60, 8, 'Buena sensación'],
      [D(2026, 9, 1), 'Empuje', 'Press banca', 2, '57,5', 9, ''],
      [D(2026, 9, 1), 'Empuje', 'Press militar', 1, 35, 8, ''],
      [D(2026, 9, 3), 'Tirón', 'Remo en T', 1, 50, 10, ''],
      [D(2026, 9, 3), 'Pierna', 'Hip thrust', 1, 100, 10, ''],
      ['05/09/2026', 'Fullbody', 'Curl martillo con mancuernas', 1, 14, 12, ''],
      [D(2026, 9, 6), 'Empuje', 'Press banca', 1, 62.5, '', 'sin reps: no se migra']
    ],
    tiempos: [
      [D(2026, 9, 1), 'Empuje', 'Press banca', 12.5],
      [D(2026, 9, 1), 'Empuje', 'Sesión completa', 55],
      [D(2026, 8, 15), 'Empuje', 'Sesión completa', 60],
      [D(2026, 8, 17), 'espalda', 'Sesión completa', 0]
    ],
    perfil: { nombre: 'Prueba', nacimiento: D(2000, 3, 15), altura: 180 },
    pesos: [[D(2026, 10, 1), 80.4], [D(2026, 10, 15), 79.8]]
  });
  const antigua = sim.libros[idAntigua];
  const fotoAntigua = JSON.stringify(antigua.pestanas.map((p) => [p.nombre, p.g]));

  // ---------- Migrar desde el menú ----------
  sim.ui.activa = true;
  sim.ui.respuestas.push(`https://docs.google.com/spreadsheets/d/${idAntigua}/edit#gid=0`);
  sim.ejecutar('migrarDesdeMenu');
  const alerta = sim.ui.alertas.find((a) => a.titulo === 'Migración terminada');
  E.ok(alerta && /23 ejercicios[\s\S]*6 series[\s\S]*6 sesiones \(2 solo de asistencia\)[\s\S]*1 tiempos[\s\S]*2 registros de peso/.test(alerta.texto), 'migrar desde el menú (pegando la URL): ' + (alerta ? alerta.texto.split('\n').slice(1, 6).join(' ').replace(/·/g, '') : 'sin aviso'));
  sim.ui.respuestas.push(null);
  sim.ejecutar('migrarDesdeMenu');
  E.ok(sim.ui.alertas.filter((a) => a.titulo === 'Migración terminada').length === 1, 'Cancelar no migra nada');
  sim.ui.activa = false;
  E.ok(JSON.stringify(antigua.pestanas.map((p) => [p.nombre, p.g])) === fotoAntigua, 'la hoja antigua no se modifica');

  const v = (n) => sim.volcar(sim.hojas[n]).slice(1);
  const rutina = v('Rutina');
  const fila = (ej) => rutina.find((f) => f[2] === ej);
  E.ok(rutina.length === 23 && fila('Press banca').slice(6, 9).join('|') === 'Pecho|Hombro, Tríceps|Barra' && fila('Curl martillo con mancuernas').slice(6, 9).join('|') === 'Bíceps|Antebrazo|Mancuernas',
    'Rutina: los 23 ejercicios con músculo principal, secundarios y material');
  E.ok(fila('Press banca')[4] === '6–8 / 8–10 / 8–10' && fila('Press banca')[5] === '3,5 min', 'Rutina: repeticiones y descansos copiados');
  const reg = v('Registro');
  E.ok(reg.length === 6 && reg.every((f) => f[0].startsWith('mig-')) && reg.find((f) => f[5] === 57.5) && reg.find((f) => f[3] === 'Curl martillo con mancuernas' && f[1] === '2026-09-05'),
    'Registro: 6 series con ID de sesión (acepta "57,5" y fechas escritas como texto)');
  E.ok(reg[0][7] === 'Buena sensación' && reg[0][8] === 480 && reg[0][9] === 76, 'Registro: notas, volumen y 1RM');
  const ses = v('Sesiones');
  const s1 = ses.find((f) => f[1] === '2026-09-01');
  E.ok(ses.length === 6 && s1[4] === 55 && s1[5] === 3 && s1[7] === 'Migrada', 'Sesiones: duración, series y origen');
  E.ok(ses.filter((f) => f[7] === 'Solo asistencia').map((f) => f[1]).join() === '2026-08-15,2026-08-17', 'días de solo asistencia');
  E.ok(ses.filter((f) => f[1] === '2026-09-03').length === 2, 'dos sesiones el mismo día se mantienen separadas');
  E.ok(v('Tiempos').length === 1 && v('Tiempos')[0][1] === 'Press banca' && v('Tiempos')[0][2] === 12.5, 'Tiempos por ejercicio');
  const perfil = sim.volcar(sim.hojas.Perfil);
  E.ok(perfil[1][1] === 'Prueba' && perfil[2][1] === '2000-03-15' && perfil[3][1] === 180 && perfil[4][1] === 7 && perfil[2][3] === '2026-10-15',
    'Perfil: datos personales, recordatorio de 7 días e historial de peso');
  E.ok(v('Progreso').find((f) => f[0] === 'Press banca')[4] === 60, 'Progreso calculado');
  E.ok(sim.usuarios()[0].ultimo instanceof Date, 'Último entreno anotado en Usuarios');

  // Repetir la migración no duplica nada (y sustituye lo que hubiera en la hoja nueva)
  const r2 = sim.ejecutar('migrarHojaAntigua', idAntigua);
  E.ok(r2.series === 6 && r2.sesiones === 6 && v('Registro').length === 6 && v('Sesiones').length === 6, 'migrar otra vez no duplica nada');

  // ---------- La app con los datos migrados ----------
  const { ctx, page, errores } = await E.nuevaPagina(E.navegador);
  await E.conectar(page, E);
  E.ok((await E.cacheApp(page)).sesiones.length === 6, 'la app descarga las 6 sesiones migradas');
  await page.click('[data-tab=inicio]');
  E.ok((await page.locator('.stats .stat', { hasText: 'Total' }).locator('.stat-valor').textContent()).trim() === '6', 'Inicio: 6 sesiones en total');
  await page.click('[data-tab=historial]');
  while (!(await page.textContent('.cal-cabecera h3')).toLowerCase().includes('septiembre')) await page.click('[data-accion=mes][data-delta="-1"]');
  await page.click('.cal-dia[data-fecha="2026-09-01"]');
  const det = await page.textContent('.dia-sesion');
  E.ok(det.includes('60×8') && det.includes('57,5×9') && det.includes('55 min') && det.includes('Buena sensación'), 'Historial: series, duración y nota del 1 sep');
  await page.click('.cal-dia[data-fecha="2026-09-03"]');
  E.ok(await page.locator('.dia-sesion').count() === 2, 'Historial: dos sesiones el 3 sep');
  await page.click('[data-accion=mes][data-delta="-1"]');
  await page.click('.cal-dia[data-fecha="2026-08-17"]');
  E.ok((await page.textContent('.dia-sesion')).includes('Asistencia registrada'), 'Historial: día de solo asistencia');
  await page.click('[data-tab=perfil]');
  E.ok((await page.textContent('#vista')).includes('79,8') && (await page.textContent('#vista')).includes('26 años'), 'Perfil migrado (peso y edad)');

  E.ok(!errores.length, 'sin errores en consola' + (errores.length ? ': ' + errores.join(' | ') : ''));
  await ctx.close();
};
