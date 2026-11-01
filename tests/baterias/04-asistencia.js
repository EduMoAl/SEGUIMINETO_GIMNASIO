'use strict';
/* Días de solo asistencia (sin series, p. ej. importados de otra app): calendario, constancia y estadísticas. */
module.exports = async function (E) {
  E.semilla.sembrarAsistencia(E.sim, [['2026-03-10', 'Empuje', 62], ['2026-03-12', 'espalda', 55], ['2026-03-14', 'Pierna', 0]]);
  const { ctx, page, errores } = await E.nuevaPagina(E.navegador);
  await page.goto(E.app);
  await E.conectar(page, E);

  await page.click('[data-tab=inicio]');
  E.ok((await page.locator('.stats .stat', { hasText: 'Total' }).locator('.stat-valor').textContent()).trim() === '20', 'total de sesiones incluye los días de asistencia (17 + 3)');

  await page.click('[data-tab=historial]');
  E.ok(await page.locator('.constancia .cd.e').count() === 20, 'mapa de constancia con 20 días');
  while (!(await page.textContent('.cal-cabecera h3')).toLowerCase().includes('marzo')) await page.click('[data-accion=mes][data-delta="-1"]');
  E.ok(await page.locator('.cal-dia.entreno').count() === 3, 'marzo con 3 días marcados');
  await page.click('.cal-dia[data-fecha="2026-03-12"]');
  const det = await page.textContent('.dia-sesion');
  E.ok(det.includes('Asistencia registrada') && det.toLowerCase().includes('espalda'), 'detalle de un día solo con asistencia');
  E.ok((await page.textContent('.cal-dia[data-fecha="2026-03-12"]')).includes('•'), 'sesión desconocida marcada con •');
  await page.click('.cal-dia[data-fecha="2026-03-14"]');
  E.ok(!(await page.locator('.dia-sesion .tiempo-dia').count()), 'sin duración cuando el día no tiene minutos');

  E.ok(!errores.length, 'sin errores en consola' + (errores.length ? ': ' + errores.join(' | ') : ''));
  await ctx.close();
};
