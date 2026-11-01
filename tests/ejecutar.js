'use strict';
/* =====================================================================
 * Ejecuta todas las baterías de pruebas de EDUX TRAINING.
 *   node tests/ejecutar.js            → todas
 *   node tests/ejecutar.js basico     → solo las que contengan "basico"
 * Cada batería empieza con una hoja simulada nueva y datos inventados.
 * ===================================================================== */
process.env.TZ = 'Europe/Madrid';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { crearSimulador } = require('./simulador');
const { crearServidorApp } = require('./servidor-app');
const semilla = require('./semilla');
const util = require('./util');

(async () => {
  const filtro = process.argv[2] || '';
  const baterias = fs.readdirSync(path.join(__dirname, 'baterias')).filter((f) => f.endsWith('.js') && f.includes(filtro)).sort();
  const app = crearServidorApp();
  const urlApp = await app.iniciar();
  const navegador = await chromium.launch();
  const resultados = [];

  for (const archivo of baterias) {
    const nombre = archivo.replace(/\.js$/, '');
    console.log(`\n▶ ${nombre}`);
    const sim = crearSimulador();
    const { base, script } = await sim.iniciar();
    const comprobaciones = [];
    const E = {
      app: urlApp, base, script, clave: sim.clave, sim, servidorApp: app, navegador,
      ok: util.crearOk(comprobaciones), ...util, semilla
    };
    const t0 = Date.now();
    try {
      await semilla.sembrarEntrenos(E);
      await require(path.join(__dirname, 'baterias', archivo))(E);
      resultados.push({ nombre, ok: true, n: comprobaciones.length, ms: Date.now() - t0 });
    } catch (e) {
      console.log(`   ✗ ${e instanceof util.FalloPrueba ? 'FALLO: ' : 'ERROR: '}${e.message}`);
      resultados.push({ nombre, ok: false, n: comprobaciones.length, error: e.message });
    } finally {
      await sim.cerrar();
    }
  }

  await navegador.close();
  await app.cerrar();
  console.log('\n──────── Resumen ────────');
  for (const r of resultados) console.log(`${r.ok ? '✓' : '✗'} ${r.nombre} · ${r.n} comprobaciones${r.ok ? ` · ${(r.ms / 1000).toFixed(1)} s` : ' · ' + r.error}`);
  const fallos = resultados.filter((r) => !r.ok).length;
  console.log(fallos ? `\n${fallos} batería(s) con fallos` : '\nTODAS LAS PRUEBAS PASAN');
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
