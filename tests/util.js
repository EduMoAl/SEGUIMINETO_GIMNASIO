'use strict';
/* Utilidades comunes de las baterías de pruebas */
const { devices } = require('playwright');

// Todas las pruebas se ejecutan como si hoy fuera este día (los datos inventados son de sep–oct 2026)
const HOY = '2026-11-01';
const AHORA = new Date('2026-11-01T10:00:00+01:00');

class FalloPrueba extends Error {}

function crearOk(registro) {
  return (cond, msg) => {
    if (!cond) throw new FalloPrueba(msg);
    registro.push(msg);
    if (!process.env.SILENCIO) console.log('   ✓ ' + msg);
  };
}

/** Navegador "Android" con reloj fijo y zona horaria de Madrid. Devuelve página + errores de consola. */
async function nuevaPagina(navegador) {
  const ctx = await navegador.newContext({ ...devices['Pixel 7'], locale: 'es-ES', timezoneId: 'Europe/Madrid' });
  await ctx.clock.install({ time: AHORA });
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push(e.message));
  page.on('console', (m) => {
    // Las peticiones que fallan a propósito (modo sin conexión) no cuentan como error de la app
    if (m.type() === 'error' && !/Failed to load resource|ERR_INTERNET_DISCONNECTED|net::ERR/.test(m.text())) errores.push(m.text());
  });
  page.on('dialog', (d) => d.accept());
  return { ctx, page, errores };
}

/** Enlace de conexión de una cuenta (el mismo formato que genera el script, pero apuntando a la app de pruebas) */
function enlaceConexion(E, clave = E.clave) {
  return E.app + '#conectar=' + Buffer.from(JSON.stringify({ u: E.script, c: clave })).toString('base64url');
}

/** Abre el enlace de conexión y espera a que se descarguen los datos de la hoja */
async function conectar(page, E, clave = E.clave) {
  await page.goto(enlaceConexion(E, clave));
  await page.waitForFunction(() => {
    const c = JSON.parse(localStorage.getItem('gym.cache') || '{}');
    return c.formato === 2 && Array.isArray(c.sesiones) && (c.rutina || []).length >= 0 && c.actualizado;
  });
  await page.waitForTimeout(150);
}

/** Espera (en Node) hasta que se cumpla una condición */
async function esperar(cond, ms = 10000) {
  const fin = Date.now() + ms;
  while (!(await cond())) {
    if (Date.now() > fin) throw new FalloPrueba('tiempo de espera agotado');
    await new Promise((r) => setTimeout(r, 50));
  }
}

/** Lo que la app tiene en su copia local */
async function cacheApp(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('gym.cache') || 'null'));
}

/** Número de series en la copia local */
async function seriesEnCache(page) {
  return page.evaluate(() => (JSON.parse(localStorage.getItem('gym.cache') || '{}').sesiones || []).reduce((a, s) => a + s.filas.length, 0));
}

module.exports = { HOY, AHORA, FalloPrueba, crearOk, nuevaPagina, conectar, enlaceConexion, cacheApp, seriesEnCache, esperar };
