'use strict';
/* Funciones v3: perfil, peso, muro de récords, descansos, constancia, músculos, sustituir, series extra, tiempos. */
module.exports = async function (E) {
  const hoja = async () => (await (await fetch(E.base + '/hoja')).json()).filas;
  const get = async (p) => (await fetch(E.base + p)).json();
  const HOY = E.HOY;
  await E.semilla.sembrarPerfil(E);

  const { ctx, page, errores } = await E.nuevaPagina(E.navegador);
  await E.conectar(page, E);
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('gym.cache') || '{}').perfil);

  // Inicio con nombre
  await page.click('[data-tab=inicio]');
  E.ok((await page.textContent('.saludo h2')).includes(', Prueba'), 'saludo con el nombre del perfil');

  // Perfil
  await page.click('[data-tab=perfil]');
  const txt = await page.textContent('#vista');
  E.ok(txt.includes('Prueba') && txt.includes('26 años') && txt.includes('1,8 m'), 'perfil: nombre, edad y altura');
  E.ok(txt.includes('79') && txt.includes('24,4'), 'perfil: peso actual e IMC');
  E.ok(await page.locator('#grafico-peso svg').count() === 1, 'gráfica de peso');
  E.ok(await page.locator('.record').count() === 3, '3 últimos récords');
  await page.click('[data-accion=registrar-peso]');
  await page.fill('#nuevo-peso', '81,6');
  await page.click('[data-accion=guardar-peso]');
  await page.waitForSelector('.toast.ok');
  let perfilHoja = await get('/pestana?n=Perfil');
  E.ok(perfilHoja.some((f) => f[3] === HOY && f[4] === 81.6) && perfilHoja.filter((f) => f[3] === HOY).length === 1, 'registrar peso escribe en la pestaña Perfil (corrige el del día)');
  await page.waitForFunction(() => document.querySelector('#vista').textContent.includes('81,6'), null, { timeout: 5000 });
  E.ok(true, 'la app muestra el peso nuevo desde la hoja');
  await page.click('[data-accion=editar-perfil]');
  await page.fill('#pf-altura', '189');
  await page.click('[data-accion=guardar-perfil]');
  await page.waitForSelector('.toast.ok');
  perfilHoja = await get('/pestana?n=Perfil');
  E.ok(perfilHoja[3][1] === 189, 'editar perfil escribe en la hoja');
  await page.click('[data-accion=editar-perfil]');
  await page.fill('#pf-altura', '180');
  await page.click('[data-accion=guardar-perfil]');
  await page.waitForSelector('.toast.ok');

  // Muro de récords
  await page.click('[data-accion=ver-records]');
  E.ok(await page.locator('.muro-fila').count() >= 20 && await page.locator('.muro-fecha').count() > 3, 'muro de récords: marcas actuales y línea de tiempo');
  await page.goBack();
  E.ok(await page.locator('.perfil-cab').count() === 1, 'atrás vuelve al perfil');

  // Ajustes: descansos y preferencias
  await page.click('[data-tab=ajustes]');
  const fila = page.locator('.descanso-ajuste', { hasText: 'Press banca' });
  E.ok((await fila.locator('b').textContent()) === '3:30', 'descanso leído de la hoja');
  await fila.locator('[data-delta="15"]').click();
  await page.waitForFunction(() => document.querySelector('.toast.ok'));
  await page.waitForTimeout(300);
  const rutina = await get('/pestana?n=Rutina');
  E.ok(rutina[1][5] === '3,75 min', 'descanso guardado en la pestaña Rutina: ' + rutina[1][5]);
  E.ok((await page.locator('.descanso-ajuste', { hasText: 'Press banca' }).locator('b').textContent()) === '3:45', 'la app muestra el descanso nuevo');
  await page.locator('label.interruptor', { hasText: 'Sonido' }).click();
  E.ok((await page.evaluate(() => JSON.parse(localStorage.getItem('gym.prefs')))).sonido === false, 'sonido desactivado en el móvil');

  // Historial: constancia
  await page.click('[data-tab=historial]');
  const marcados = await page.locator('.constancia .cd.e').count();
  E.ok(marcados === 17, `mapa de constancia con ${marcados} días`);
  await page.locator('.constancia .cd.e').first().click();
  E.ok((await page.textContent('.cal-cabecera h3')).includes('septiembre'), 'tocar el mapa lleva a ese día del calendario');
  E.ok(await page.locator('.dia-sesion .tiempo-dia').count() > 0, 'tiempos en el detalle del día');

  // Progreso por músculo
  await page.click('[data-tab=progreso]');
  E.ok(await page.locator('.stat', { hasText: 'Tiempo medio' }).locator('.stat-valor').textContent() !== '—', 'tiempo medio por ejercicio');
  await page.click('[data-accion=modo-prog][data-valor=musculo]');
  E.ok(await page.locator('.barra-fila').count() === 13, '13 grupos musculares');
  E.ok((await page.locator('.barra-fila', { hasText: 'Pecho' }).locator('.barra-num').textContent()) === '10', 'series de pecho esta semana = 10');
  await page.locator('.barra-fila', { hasText: 'Pecho' }).click();
  E.ok(await page.locator('.barra-detalle').isVisible(), 'detalle al tocar un músculo');
  await page.click('[data-accion=semana][data-delta="-1"]');
  E.ok(!(await page.textContent('.cal-cabecera h3')).includes('Esta semana'), 'semana anterior');

  // Sesión
  await page.click('[data-tab=inicio]');
  await page.click('.hero [data-accion=empezar]');
  await page.waitForSelector('.ejercicio');
  E.ok((await page.textContent('#ej-0 .ej-descanso')).includes('3:00'), 'descanso de la hoja en la tarjeta');
  // Sustituir el ejercicio 3
  await page.selectOption('#ej-2 select[data-sustituir]', 'Remo en polea');
  E.ok((await page.textContent('#ej-2 .ej-titulo b')) === 'Remo en polea' && (await page.textContent('#ej-2 .ej-sustituto')).includes('Remo en máquina'), 'sustituir ejercicio');
  // Serie extra: añadir y quitar
  await page.click('#ej-0 [data-accion=anadir-serie]');
  E.ok(await page.locator('#ej-0 .serie').count() === 4, 'añadir serie extra');
  await page.click('#ej-0 [data-accion=quitar-serie]');
  E.ok(await page.locator('#ej-0 .serie').count() === 3, 'quitar serie extra');
  await page.click('#ej-0 [data-accion=anadir-serie]');
  // Completar ejercicio 0 con un récord en la serie 4
  for (let i = 0; i < 3; i++) await page.click(`#ej-0 .serie[data-serie="${i}"] [data-accion=check]`);
  await page.fill('#ej-0 .serie[data-serie="3"] input[data-campo=peso]', '120');
  await page.fill('#ej-0 .serie[data-serie="3"] input[data-campo=reps]', '6');
  await page.click('#ej-0 .serie[data-serie="3"] [data-accion=check]');
  E.ok(await page.locator('.confeti i').count() > 20 && await page.locator('.confeti .trofeo').count() === 1, 'animación de récord (confeti + trofeo)');
  await page.waitForTimeout(250);
  await page.waitForTimeout(1500);
  E.ok(await page.locator('.confeti').count() === 0, 'la animación desaparece sola');
  E.ok((await page.textContent('#ej-0 .ej-tiempo')).includes('min') && await page.locator('#ej-0 .ej-tiempo .ico').count() === 1, 'tiempo del ejercicio visible');
  // Serie del sustituto
  await page.click('#ej-2 .ej-cabecera'); // asegurarse de que está abierto (no lo está plegado)
  if (await page.locator('#ej-2.plegado').count()) await page.click('#ej-2 .ej-cabecera');
  await page.fill('#ej-2 .serie[data-serie="0"] input[data-campo=peso]', '50');
  await page.fill('#ej-2 .serie[data-serie="0"] input[data-campo=reps]', '10');
  await page.click('#ej-2 .serie[data-serie="0"] [data-accion=check]');

  // Resumen con comparación (antes, simulamos que la sesión ha durado 40 minutos)
  await page.clock.fastForward('40:00');
  await page.click('#dock [data-accion=terminar]');
  E.ok(await page.locator('.comparativa').count() === 1, 'comparación de volumen con la sesión anterior');
  E.ok((await page.locator('.delta').first().textContent()).match(/↑|↓|=/), 'comparación por ejercicio: ' + await page.locator('.delta').first().textContent());
  E.ok(await page.locator('.lista-resumen .meta').count() > 0, 'tiempos en el resumen');
  const antes = (await get('/hoja')).filas.length;
  const tiemposAntes = (await get('/pestana?n=Tiempos')).length;
  const sesionesAntes = (await get('/pestana?n=Sesiones')).length;
  await page.click('[data-accion=confirmar]');
  await page.waitForFunction(() => !JSON.parse(localStorage.getItem('gym.pendientes') || '[]').length);
  await page.waitForTimeout(800);
  const filas = (await get('/hoja')).filas.slice(antes);
  E.ok(filas.length === 5, `${filas.length} filas nuevas (4 + 1 del sustituto)`);
  E.ok(filas.some((f) => f[4] === 4) && filas.some((f) => f[3] === 'Remo en polea' && f[2] === 'Tirón'), 'serie extra (nº 4) y sustituto guardados en Registro');
  const tiempos = (await get('/pestana?n=Tiempos')).slice(tiemposAntes);
  E.ok(tiempos.length === 2 && tiempos.every((f) => f[0] === filas[0][0] && f[2] >= 0), 'tiempos por ejercicio en la pestaña Tiempos (con el ID de la sesión)');
  const ses = (await get('/pestana?n=Sesiones')).slice(sesionesAntes);
  E.ok(ses.length === 1 && ses[0][0] === filas[0][0] && ses[0][2] === 'Tirón' && ses[0][4] >= 40 && /^\d\d:\d\d$/.test(ses[0][3]) && ses[0][5] === 5 && ses[0][7] === 'App',
    `fila en Sesiones: inicio ${ses[0] && ses[0][3]}, ${ses[0] && ses[0][4]} min, ${ses[0] && ses[0][5]} series`);

  E.ok(!errores.length, 'sin errores en consola' + (errores.length ? ': ' + errores.join(' | ') : ''));
  await ctx.close();
};
