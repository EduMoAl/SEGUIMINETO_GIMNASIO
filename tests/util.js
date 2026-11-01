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

/** Configura la conexión desde Ajustes y espera a que se descarguen los datos de la hoja */
async function conectar(page, E) {
  await page.click('[data-tab=ajustes]');
  await page.fill('#cfg-url', E.script);
  await page.fill('#cfg-clave', E.clave);
  await page.click('[data-accion=probar]');
  await page.waitForFunction(() => (JSON.parse(localStorage.getItem('gym.cache') || '{}').filas || []).length > 0);
}

module.exports = { HOY, AHORA, FalloPrueba, crearOk, nuevaPagina, conectar };
