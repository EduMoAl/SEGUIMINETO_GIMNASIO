'use strict';
/* Flujo básico: conexión, inicio, historial, progreso, sesión completa, envío y modo sin conexión. */
module.exports = async function (E) {
  const hoja = async () => (await (await fetch(E.base + '/hoja')).json()).filas;
  const get = async (p) => (await fetch(E.base + p)).json();
  const HOY = E.HOY;

  const { ctx, page, errores } = await E.nuevaPagina(E.navegador);
  await page.goto(E.app);

  // Configurar
  await page.click('[data-tab=ajustes]');
  await page.fill('#cfg-url', E.script);
  await page.fill('#cfg-clave', E.clave);
  await page.click('[data-accion=probar]');
  await page.waitForFunction(() => (JSON.parse(localStorage.getItem('gym.cache') || '{}').filas || []).length > 0);
  E.ok(true, 'conexión y descarga de datos de la hoja');

  // Inicio
  await page.click('[data-tab=inicio]');
  await page.waitForTimeout(300);
  const sig = await page.textContent('.hero-nombre');
  E.ok(['Empuje', 'Tirón', 'Pierna', 'Fullbody'].includes(sig.trim()), 'siguiente entreno: ' + sig);

  // Historial
  await page.click('[data-tab=historial]');
  while (!(await page.textContent('.cal-cabecera h3')).toLowerCase().includes('octubre')) await page.click('[data-accion=mes][data-delta="-1"]');
  const marcados = await page.locator('.cal-dia.entreno').count();
  E.ok(marcados > 0, `calendario con ${marcados} días marcados en octubre`);
  await page.locator('.cal-dia.entreno').first().click();
  E.ok(await page.locator('.dia-sesion').count() === 1, 'detalle del día');
  await page.click('[data-accion=mes][data-delta="-1"]');
  E.ok((await page.textContent('.cal-cabecera h3')).includes('septiembre'), 'cambio de mes');

  // Progreso
  await page.click('[data-tab=progreso]');
  await page.selectOption('#sel-ejercicio', 'Press banca');
  await page.waitForSelector('#grafico svg');
  const n = await page.locator('#grafico circle[r="4"]').count();
  E.ok(n >= 4, `gráfico con ${n} puntos`);
  await page.locator('#grafico svg').evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const box = await page.locator('#grafico svg').boundingBox();
  await page.mouse.click(box.x + box.width * 0.6, box.y + box.height / 2);
  E.ok(await page.locator('.tooltip').isVisible(), 'tooltip al tocar');
  await page.click('[data-accion=metrica][data-valor=rm1]');
  await page.click('[data-accion=rango][data-valor="1m"]');
  E.ok(await page.locator('#grafico svg').count() === 1, 'cambio de métrica y periodo');

  // Sesión
  await page.click('[data-tab=inicio]');
  await page.click('.hero [data-accion=empezar]');
  await page.waitForSelector('.ejercicio');
  const ph = await page.locator('#ej-0 .serie[data-serie="0"] input[data-campo=peso]').getAttribute('placeholder');
  E.ok(ph && ph !== 'kg', 'placeholder con la última vez: ' + ph);
  // ✓ en serie vacía → rellena con la última vez
  await page.click('#ej-0 .serie[data-serie="0"] [data-accion=check]');
  E.ok(await page.locator('#ej-0 .serie[data-serie="0"].hecha').count() === 1, '✓ rellena con la última vez y marca hecha');
  E.ok(await page.locator('#descanso').isVisible(), 'temporizador de descanso arranca');
  // + en peso vacío → toma la referencia; luego +2,5
  await page.click('#ej-0 .serie[data-serie="1"] [data-accion=mas][data-campo=peso]');
  const v1 = await page.inputValue('#ej-0 .serie[data-serie="1"] input[data-campo=peso]');
  await page.click('#ej-0 .serie[data-serie="1"] [data-accion=mas][data-campo=peso]');
  const v2 = await page.inputValue('#ej-0 .serie[data-serie="1"] input[data-campo=peso]');
  E.ok(Number(v2.replace(',', '.')) - Number(v1.replace(',', '.')) === 2.5, `botones ± (${v1} → ${v2})`);
  // Récord
  await page.fill('#ej-0 .serie[data-serie="1"] input[data-campo=peso]', '150');
  await page.fill('#ej-0 .serie[data-serie="1"] input[data-campo=reps]', '5');
  await page.click('#ej-0 .serie[data-serie="1"] [data-accion=check]');
  E.ok(await page.locator('#ej-0 .serie[data-serie="1"].es-pr').count() === 1, 'detecta récord personal');
  await page.waitForTimeout(400);
  // Completar el ejercicio → se pliega
  const nSeries = await page.locator('#ej-0 .serie').count();
  for (let i = 2; i < nSeries; i++) await page.click(`#ej-0 .serie[data-serie="${i}"] [data-accion=check]`);
  E.ok(await page.locator('#ej-0.plegado.completo').count() === 1 && await page.locator('#ej-1.actual').count() === 1, 'ejercicio completo se pliega y pasa al siguiente');
  await page.waitForTimeout(600);
  // Descanso: +15 y saltar
  const t1 = await page.textContent('.descanso-tiempo');
  await page.click('[data-accion=descanso-mas]');
  const t2 = await page.textContent('.descanso-tiempo');
  E.ok(t1 !== t2, `descanso +15 s (${t1} → ${t2})`);
  await page.click('[data-accion=descanso-saltar]');
  E.ok(!(await page.locator('#descanso').isVisible()), 'saltar descanso');
  // Recarga en mitad → vuelve a la sesión
  await page.reload();
  await page.waitForSelector('.ejercicio');
  E.ok(await page.locator('#ej-0.completo').count() === 1, 'tras recargar vuelve directo a la sesión con los datos');
  // Terminar
  const antes = (await hoja()).length;
  await page.click('#dock [data-accion=terminar]');
  await page.click('[data-accion=confirmar]');
  await page.waitForFunction(() => document.querySelector('.hero-etiqueta')?.textContent.includes('SIGUIENTE'));
  await page.waitForFunction(() => !JSON.parse(localStorage.getItem('gym.pendientes') || '[]').length);
  await page.waitForTimeout(800);
  const despues = (await hoja()).length;
  E.ok(despues - antes === nSeries, `${despues - antes} filas nuevas en la hoja`);
  const cacheN = await page.evaluate(() => JSON.parse(localStorage.getItem('gym.cache')).filas.length);
  E.ok(cacheN === despues, 'copia local actualizada tras enviar');
  E.ok((await page.textContent('.hero-nombre')).trim() !== sig.trim(), 'el siguiente entreno avanza en la rotación');
  await page.click('[data-tab=historial]');
  E.ok(await page.locator('.cal-dia.hoy.entreno').count() === 1, 'hoy aparece marcado en el calendario');

  // Sin internet
  await ctx.setOffline(true);
  await page.reload();
  await page.click('[data-tab=inicio]');
  await page.click('.hero [data-accion=empezar]');
  await page.click('#ej-0 .serie[data-serie="0"] [data-accion=check]');
  await page.click('#dock [data-accion=terminar]');
  await page.click('[data-accion=confirmar]');
  await page.waitForSelector('.toast.atencion');
  E.ok(await page.locator('text=Pendientes de enviar (1)').isVisible(), 'sin internet queda pendiente');
  await page.click('[data-tab=progreso]');
  E.ok(await page.locator('#grafico svg').count() === 1, 'las gráficas funcionan sin internet (copia local)');
  await page.click('[data-tab=inicio]');
  await ctx.setOffline(false);
  await page.waitForFunction(() => !JSON.parse(localStorage.getItem('gym.pendientes') || '[]').length, null, { timeout: 15000 });
  E.ok(true, 'al volver internet se envía sola');

  E.ok(!errores.length, 'sin errores en consola' + (errores.length ? ': ' + errores.join(' | ') : ''));
  await ctx.close();
};
