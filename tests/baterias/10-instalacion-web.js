'use strict';
/* Página de instalación (la URL de la aplicación web abierta en el navegador), con el script
   suelto (fuera de la hoja): solo para el dueño, instalar, migrar y activar los emails. */
const { crearSimulador } = require('../simulador');

module.exports = async function (E) {
  const sim = crearSimulador({ suelto: true });
  const { script } = await sim.iniciar({ instalar: false });
  const { ctx, page, errores } = await E.nuevaPagina(E.navegador);
  try {
    // google.script.run → llama a la función del script real dentro del simulador
    await page.exposeFunction('__gas', (fn, args) => {
      try { return { valor: sim.ejecutar(fn, ...args) }; } catch (e) { return { error: e.message }; }
    });
    await page.addInitScript(() => {
      const crear = (ok, mal) => new Proxy({}, {
        get: (_, k) => {
          if (k === 'withSuccessHandler') return (f) => crear(f, mal);
          if (k === 'withFailureHandler') return (f) => crear(ok, f);
          return (...args) => { window.__gas(k, args).then((r) => (r.error ? mal && mal(new Error(r.error)) : ok && ok(r.valor))); };
        }
      });
      window.google = { script: { get run() { return crear(null, null); } } };
    });
    const abrir = async () => { await page.goto(script); await page.waitForSelector('.paso'); };

    // Desde el editor, onOpen explica qué hacer en vez de un error críptico
    let error = '';
    try { sim.ejecutar('onOpen'); } catch (e) { error = e.message; }
    E.ok(/página de instalación/.test(error) && /\/exec/.test(error), 'onOpen sin hoja abierta: explica que se use la página de instalación');

    // Otra persona con la URL
    sim.sesion.usuarioActivo = '';
    await abrir();
    E.ok((await page.textContent('#contenido')).includes('Solo para el dueño'), 'otra persona que abra la URL no ve la instalación');
    error = '';
    try { sim.ejecutar('panelInstalar', 'Intruso', script); } catch (e) { error = e.message; }
    E.ok(/dueño del script/.test(error) && !sim.props.ADMIN_ID, 'y el script rechaza instalar si no eres el dueño');

    // El dueño
    sim.sesion.usuarioActivo = 'admin@ejemplo.com';
    await abrir();
    E.ok((await page.inputValue('#i-url')) === script, 'la URL de la aplicación web viene ya rellenada');
    E.ok(await page.locator('#b-migrar').isDisabled() && await page.locator('#b-avisos').isDisabled(), 'los pasos 2 y 3 esperan a la instalación');
    await page.click('#b-instalar');
    await page.waitForSelector('#r-instalar.error');
    E.ok((await page.textContent('#r-instalar')).includes('Escribe tu nombre'), 'pide el nombre');
    await page.fill('#i-nombre', 'Edu');
    await page.click('#b-instalar');
    await page.waitForSelector('.paso.hecho');
    E.ok((await page.textContent('.paso.hecho')).includes('Administrador: Edu'), 'Instalar: paso 1 hecho');
    const admins = Object.values(sim.libros).filter((l) => l.nombre === 'EDUX · Administración');
    E.ok(admins.length === 1 && admins[0].getSheetByName('Usuarios') && sim.props.ADMIN_ID === admins[0].id, 'con el script suelto usa la hoja "EDUX · Administración" de tu Drive (no crea otra)');
    E.ok(sim.correos.length === 1 && sim.correos[0].to === 'admin@ejemplo.com' && sim.correos[0].htmlBody.includes('#conectar='), 'te envía el enlace de conexión por email');
    await page.click('#b-enlace');
    await page.waitForSelector('#r-enlace.ok');
    E.ok(sim.correos.length === 2, '"Enviarme otra vez el enlace"');

    // Migrar
    await page.fill('#i-antigua', 'https://docs.google.com/spreadsheets/d/noexiste123/edit');
    await page.click('#b-migrar');
    await page.waitForSelector('#r-migrar.error');
    E.ok((await page.textContent('#r-migrar')).includes('No puedo abrir esa hoja'), 'una URL que no es una hoja da un error claro');
    const idAntigua = sim.crearHojaAntigua({
      registro: [[new Date(2026, 8, 1, 12), 'Empuje', 'Press banca', 1, 60, 8, '']],
      tiempos: [[new Date(2026, 7, 15, 12), 'Pierna', 'Sesión completa', 50]],
      perfil: { nombre: 'Edu', nacimiento: new Date(2000, 0, 1, 12), altura: 180 }
    });
    await page.fill('#i-antigua', `https://docs.google.com/spreadsheets/d/${idAntigua}/edit#gid=0`);
    await page.click('#b-migrar');
    await page.waitForFunction(() => document.querySelectorAll('.paso.hecho').length === 2);
    E.ok((await page.textContent('#contenido')).includes('1 series, 2 sesiones (1 solo de asistencia)'), 'Migrar: paso 2 hecho con el resumen');

    // Emails
    await page.click('#b-avisos');
    await page.waitForFunction(() => document.querySelectorAll('.paso.hecho').length === 3);
    E.ok(sim.triggers.length === 2, 'Emails: paso 3 hecho (2 activadores)');
    E.ok((await page.textContent('#contenido')).includes('Europe/Madrid'), 'muestra la zona horaria del script');
    await page.click('#b-probar');
    await page.waitForSelector('#r-avisos.ok');
    E.ok(sim.correos.some((c) => c.subject.includes('Tu semana')), '"Enviarme ahora el resumen"');

    // Después de instalar, la app funciona con la URL de la aplicación web
    const r = await (await fetch(script, { method: 'POST', body: JSON.stringify({ clave: sim.usuarios()[0].clave, tipo: 'datos' }) })).json();
    E.ok(r.ok && r.sesiones.length === 2 && r.rutina.length === 23 && r.admin, 'la app ya puede conectarse (2 sesiones migradas, rutina de 23 ejercicios)');

    E.ok(!errores.length, 'sin errores en consola' + (errores.length ? ': ' + errores.join(' | ') : ''));
  } finally {
    await ctx.close();
    await sim.cerrar();
  }
};
