'use strict';
/* Descarga incremental: solo llegan las sesiones nuevas o cambiadas; cambios hechos a mano en la hoja
   (editar, borrar, filas sin ID) y cambios de rutina con una sesión empezada. */
module.exports = async function (E) {
  const { ctx, page, errores } = await E.nuevaPagina(E.navegador);
  const llamadas = [];
  page.on('response', async (resp) => {
    if (!resp.url().startsWith(E.script) || resp.request().method() !== 'POST') return;
    const cuerpo = JSON.parse(resp.request().postData());
    if (cuerpo.tipo !== 'datos') return;
    const texto = await resp.text();
    llamadas.push({ tengo: cuerpo.tengo, r: JSON.parse(texto), bytes: texto.length });
  });
  const actualizar = async () => {
    const n = llamadas.length;
    await page.click('[data-accion=actualizar]');
    await E.esperar(() => llamadas.length > n);
    await page.waitForTimeout(150);
    return llamadas[llamadas.length - 1];
  };
  const sesionCache = async (id) => (await E.cacheApp(page)).sesiones.find((s) => s.id === id);

  await E.conectar(page, E);
  await page.click('[data-tab=inicio]');
  const primera = llamadas[0];
  E.ok(primera.tengo.length === 0 && primera.r.sesiones.length === 17 && primera.r.sesiones.every((s) => Array.isArray(s.filas)), 'primera descarga: las 17 sesiones completas');

  let l = await actualizar();
  E.ok(l.tengo.length === 17 && l.r.nuevas === 0 && l.r.sesiones.every((s) => !s.filas), 'segunda descarga: la app manda sus 17 huellas y no llega ninguna sesión');
  E.ok(l.bytes < primera.bytes / 3, `respuesta mucho más pequeña (${l.bytes} frente a ${primera.bytes} bytes)`);
  E.ok((await page.textContent('#toast')).includes('Datos al día'), 'aviso "Datos al día"');
  E.ok((await E.cacheApp(page)).sesiones.length === 17, 'la copia local conserva las 17 sesiones');

  // Corregir un peso a mano en la hoja
  const reg = E.sim.hojas.Registro;
  const filaS3 = reg.g.findIndex((f) => f[0] === 'semilla3');
  reg.g[filaS3][5] = 99;
  l = await actualizar();
  E.ok(l.r.nuevas === 1 && l.r.sesiones.find((s) => s.id === 'semilla3').filas, 'cambiar un peso en la hoja: solo se descarga esa sesión');
  E.ok((await sesionCache('semilla3')).filas[0][2] === 99, 'la copia local tiene el peso corregido');

  // Borrar una sesión a mano (vaciar sus filas en Registro, Sesiones y Tiempos)
  for (const n of ['Registro', 'Sesiones', 'Tiempos']) {
    const h = E.sim.hojas[n];
    h.g.forEach((f, i) => { if (f[0] === 'semilla16') h.getRange(i + 1, 1, 1, f.length).clearContent(); });
  }
  l = await actualizar();
  E.ok(l.r.nuevas === 0 && (await E.cacheApp(page)).sesiones.length === 16 && !(await sesionCache('semilla16')), 'borrar una sesión en la hoja: desaparece de la app');

  // Filas añadidas a mano sin ID de sesión
  const f = reg.getLastRow() + 1;
  reg.getRange(f, 1, 2, 10).setValues([
    ['', new Date(2026, 9, 30, 12), 'Empuje', 'Press banca', 1, 70, 5, 'apuntado a mano', '', ''],
    ['', new Date(2026, 9, 30, 12), 'Empuje', 'Press banca', 2, 65, 6, '', '', '']
  ]);
  l = await actualizar();
  const manual = await sesionCache('manual:2026-10-30:Empuje');
  E.ok(l.r.nuevas === 1 && manual && manual.filas.length === 2, 'filas escritas a mano sin ID: se agrupan como una sesión (fecha + sesión)');
  await page.click('[data-tab=historial]');
  while (!(await page.textContent('.cal-cabecera h3')).toLowerCase().includes('octubre')) await page.click('[data-accion=mes][data-delta="-1"]');
  E.ok(await page.locator('.cal-dia.entreno[data-fecha="2026-10-30"]').count() === 1, 'y aparecen en el calendario');
  await page.click('.cal-dia[data-fecha="2026-10-30"]');
  E.ok((await page.textContent('.dia-sesion')).includes('70×5') && (await page.textContent('.dia-sesion')).includes('apuntado a mano'), 'con sus series y nota');

  // Copia local estropeada: una huella que no cuadra se vuelve a descargar
  await page.evaluate(() => {
    const c = JSON.parse(localStorage.getItem('gym.cache'));
    c.sesiones[0].huella = 'estropeada'; c.sesiones[0].filas = [];
    localStorage.setItem('gym.cache', JSON.stringify(c));
  });
  await page.click('[data-tab=inicio]');
  l = await actualizar();
  E.ok(l.r.nuevas === 1 && (await E.cacheApp(page)).sesiones[0].filas.length > 0, 'una sesión local que no cuadra se descarga de nuevo');

  // "Descargar todo de nuevo" en Ajustes
  await page.click('[data-tab=ajustes]');
  const n = llamadas.length;
  await page.click('[data-accion=actualizar-forzado]');
  await E.esperar(() => llamadas.length > n);
  E.ok(llamadas[n].tengo.length === 0 && llamadas[n].r.nuevas === 17, '"Descargar todo de nuevo" pide todas las sesiones');

  // Cambiar la rutina en la hoja con una sesión empezada
  await page.click('[data-tab=inicio]');
  await page.click('[data-accion=empezar][data-sesion=Empuje]');
  await page.waitForSelector('.ejercicio');
  const antes = await page.locator('.ejercicio').count();
  const rut = E.sim.hojas.Rutina;
  rut.getRange(rut.getLastRow() + 1, 1, 1, 9).setValues([['Empuje', 7, 'Fondos en paralelas', 2, '8–12', '2 min', 'Tríceps', 'Pecho', 'Peso corporal']]);
  await page.evaluate(() => actualizarDatos());
  await page.waitForTimeout(400);
  await page.click('#ej-0 .serie[data-serie="0"] [data-accion=check]');
  E.ok(await page.locator('.ejercicio').count() === antes, 'la sesión empezada no cambia aunque cambie la rutina');
  await page.click('[data-accion=atras]');
  await page.click('.hero [data-accion=descartar]');
  await page.click('[data-accion=empezar][data-sesion=Empuje]');
  await page.waitForSelector('.ejercicio');
  E.ok(await page.locator('.ejercicio').count() === antes + 1 && (await page.textContent('#ej-6 .ej-titulo b')) === 'Fondos en paralelas', 'una sesión nueva ya incluye el ejercicio añadido');

  E.ok(!errores.length, 'sin errores en consola' + (errores.length ? ': ' + errores.join(' | ') : ''));
  await ctx.close();
};
