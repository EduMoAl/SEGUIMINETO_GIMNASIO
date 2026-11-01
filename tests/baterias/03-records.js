'use strict';
/* Récords: la serie real junto a cada récord en Progreso, Perfil, Muro, aviso y Resumen. */
module.exports = async function (E) {
  const filas = (await (await fetch(E.base + '/hoja')).json()).filas;
  const num = (n) => Number(n).toLocaleString('es-ES', { maximumFractionDigits: 2 });
  const rm1 = (p, r) => Math.round(p * (1 + r / 30) * 10) / 10;
  // Mejor 1RM estimado de Press banca según los datos de la hoja simulada
  let mejor = null;
  for (const f of filas.filter((f) => f[3] === 'Press banca')) {
    const v = rm1(f[5], f[6]);
    if (!mejor || v > mejor.v) mejor = { v, p: f[5], r: f[6] };
  }
  const pesoMax = Math.max(...filas.filter((f) => f[3] === 'Press banca').map((f) => f[5]));
  const serieTxt = `(${num(mejor.p)} kg × ${mejor.r} reps)`;
  const limpio = (t) => t.replace(/\s+/g, ' ').trim();

  const { ctx, page, errores } = await E.nuevaPagina(E.navegador);
  await page.goto(E.app);
  await E.conectar(page, E);

  await page.click('[data-tab=progreso]');
  await page.selectOption('#sel-ejercicio', 'Press banca');
  const tiles = (await page.locator('.records .stat').allTextContents()).map(limpio);
  E.ok(tiles[1].includes(num(mejor.v)) && tiles[1].includes(serieTxt), `Progreso: mejor 1RM ${num(mejor.v)} kg ${serieTxt}`);

  await page.click('[data-tab=perfil]');
  const recs = (await page.locator('.record-txt').allTextContents()).map(limpio);
  E.ok(recs.length > 0 && recs.every((r) => /\(\d+(,\d+)? kg × \d+ reps?\)/.test(r)), 'Perfil: últimos récords con la serie real');

  await page.click('[data-accion=ver-records]');
  const muro = limpio(await page.locator('.muro-fila', { hasText: 'Press banca' }).textContent());
  E.ok(muro.includes(num(mejor.v) + ' kg') && muro.includes(serieTxt), 'Muro: mejores marcas con la serie real');

  // Batir un récord en Press banca
  await page.click('[data-tab=inicio]');
  await page.click('[data-accion=empezar][data-sesion=Empuje]');
  const nuevoPeso = pesoMax + 10;
  await page.fill('#ej-0 .serie[data-serie="0"] input[data-campo=peso]', String(nuevoPeso));
  await page.fill('#ej-0 .serie[data-serie="0"] input[data-campo=reps]', '8');
  await page.click('#ej-0 .serie[data-serie="0"] [data-accion=check]');
  const toast = limpio(await page.textContent('#toast'));
  E.ok(toast.includes('Récord en Press banca') && toast.includes(`(${num(nuevoPeso)} kg × 8 reps)`), 'aviso de récord con la serie real: ' + toast);
  E.ok(await page.locator('.confeti .trofeo').count() === 1, 'animación de récord');
  await page.click('#dock [data-accion=terminar]');
  const res = limpio(await page.textContent('.resumen-records'));
  E.ok(res.includes('Press banca') && res.includes(`(${num(nuevoPeso)} kg × 8 reps)`), 'Resumen: récords con la serie real');

  E.ok(!errores.length, 'sin errores en consola' + (errores.length ? ': ' + errores.join(' | ') : ''));
  await ctx.close();
};
