'use strict';
/* Calidad: Deshacer, indicador de conexión y sesiones sin enviar, aviso de versión nueva. */
module.exports = async function (E) {
  const { ctx, page, errores } = await E.nuevaPagina(E.navegador);
  const actual = () => page.evaluate(() => JSON.parse(localStorage.getItem('gym.actual') || 'null'));
  const pendientes = () => page.evaluate(() => JSON.parse(localStorage.getItem('gym.pendientes') || '[]').length);
  await E.conectar(page, E);
  await page.click('[data-tab=inicio]');

  // --- Deshacer: descartar la sesión en curso ---
  await page.click('.hero [data-accion=empezar]');
  await page.click('#ej-0 .serie[data-serie="0"] [data-accion=check]');
  await page.click('[data-accion=atras]');
  await page.click('.hero [data-accion=descartar]');
  E.ok(!(await actual()), 'descartar borra la sesión en curso (sin diálogo)');
  E.ok(await page.locator('#toast .toast-accion').isVisible(), 'aviso con botón Deshacer');
  await page.click('#toast .toast-accion');
  E.ok((await page.textContent('.hero-etiqueta')).includes('SESIÓN EN CURSO'), 'Deshacer recupera la sesión');
  const a = await actual();
  E.ok(Object.values(a.datos)[0].series[0].hecha === true, 'con la serie que ya estaba marcada');

  // --- Deshacer: quitar una serie extra ---
  await page.click('[data-accion=continuar]');
  const n0 = await page.locator('#ej-0 .serie').count();
  await page.click('#ej-0 [data-accion=anadir-serie]');
  await page.click('#ej-0 [data-accion=quitar-serie]');
  E.ok(await page.locator('#ej-0 .serie').count() === n0, 'quitar serie extra');
  await page.click('#toast .toast-accion');
  E.ok(await page.locator('#ej-0 .serie').count() === n0 + 1, 'Deshacer devuelve la serie extra');

  // --- Deshacer: sustituir un ejercicio ---
  const original = (await page.textContent('#ej-2 .ej-titulo b')).trim();
  const opcion = await page.locator('#ej-2 select[data-sustituir] optgroup option').first().getAttribute('value');
  await page.selectOption('#ej-2 select[data-sustituir]', opcion);
  E.ok((await page.textContent('#ej-2 .ej-titulo b')).trim() === opcion, `sustituir ${original} por ${opcion}`);
  await page.click('#toast .toast-accion');
  E.ok((await page.textContent('#ej-2 .ej-titulo b')).trim() === original, 'Deshacer vuelve al ejercicio original');

  // --- Sin conexión: indicador y sesiones sin enviar ---
  await ctx.setOffline(true);
  await page.waitForSelector('#estado-red.sin-red:not([hidden])');
  E.ok((await page.textContent('#estado-red')).includes('Sin conexión'), 'indicador "Sin conexión"');
  await page.click('#dock [data-accion=terminar]');
  await page.click('[data-accion=confirmar]');
  await page.waitForFunction(() => document.querySelector('.hero-etiqueta')?.textContent.includes('SIGUIENTE'));
  await page.waitForFunction(() => document.querySelector('#estado-red').textContent.includes('1 sin enviar'));
  E.ok(true, 'el indicador cuenta la sesión sin enviar');

  // --- Deshacer: descartar una sesión pendiente ---
  await page.click('[data-accion=borrar-pendiente]');
  E.ok(await pendientes() === 0, 'descartar sesión pendiente');
  await page.click('#toast .toast-accion');
  E.ok(await pendientes() === 1, 'Deshacer recupera la sesión pendiente');

  await ctx.setOffline(false);
  await page.waitForFunction(() => !JSON.parse(localStorage.getItem('gym.pendientes') || '[]').length, null, { timeout: 15000 });
  await page.waitForFunction(() => document.querySelector('#estado-red').hidden, null, { timeout: 5000 });
  E.ok(true, 'al volver la conexión se envía y el indicador desaparece');

  // --- Aviso de versión nueva ---
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 10000 });
  const cacheAntes = (await page.evaluate(() => caches.keys())).find((k) => k.startsWith('edux-'));
  E.servidorApp.publicarVersionSW('v-prueba');
  try {
    await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r.update()));
    await page.waitForSelector('#actualizacion:not([hidden])', { timeout: 15000 });
    E.ok(true, 'aviso "Nueva versión disponible"');
    await Promise.all([page.waitForNavigation(), page.click('[data-accion=actualizar-app]')]);
    const cachesDespues = await page.evaluate(() => caches.keys());
    E.ok(cachesDespues.includes('edux-v-prueba') && !cachesDespues.includes(cacheAntes), `Actualizar instala la versión nueva (${cacheAntes} → edux-v-prueba)`);
    E.ok(await page.locator('#actualizacion').isHidden(), 'tras actualizar el aviso desaparece');
  } finally {
    E.servidorApp.publicarVersionSW(null);
  }

  E.ok(!errores.length, 'sin errores en consola' + (errores.length ? ': ' + errores.join(' | ') : ''));
  await ctx.close();
};
