'use strict';
/* Emails automáticos: activadores, recordatorio tras X días sin entrenar (una vez por parón,
   configurable en Perfil) y resumen semanal para cada usuario con email. */
module.exports = async function (E) {
  const sim = E.sim;
  const post = async (cuerpo) => (await fetch(E.script, { method: 'POST', body: JSON.stringify(cuerpo) })).json();
  const sumar = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const recordatorios = (hoy) => { const n = sim.correos.length; const r = sim.ejecutar('enviarRecordatorios', null, hoy); return { r, nuevos: sim.correos.slice(n) }; };

  // Activadores
  sim.ejecutar('activarAvisos');
  sim.ejecutar('activarAvisos');
  const t = sim.triggers.map((x) => x.cfg);
  E.ok(t.length === 2, 'activar emails crea 2 activadores (y no se duplican al repetirlo)');
  E.ok(t.some((x) => x.fn === 'enviarResumenesSemanales' && x.dia === 'MONDAY' && x.hora === 7) && t.some((x) => x.fn === 'enviarRecordatorios' && x.hora === 18 && x.dias === 1),
    'resumen los lunes a las 7 y recordatorios cada día a las 18');

  // Recordatorio del administrador (7 días por defecto)
  const ultima = sim.volcar(sim.hojas.Sesiones).slice(1).map((f) => f[1]).sort().pop();
  E.ok(recordatorios(sumar(ultima, 6)).r === 0, `6 días sin entrenar (desde ${ultima}): sin recordatorio`);
  let x = recordatorios(sumar(ultima, 7));
  E.ok(x.r === 1 && x.nuevos[0].to === 'admin@ejemplo.com' && x.nuevos[0].subject.includes('7 días'), 'a los 7 días: recordatorio por email');
  E.ok(x.nuevos[0].htmlBody.includes('TE TOCA') && x.nuevos[0].htmlBody.includes('Tirón'), 'el email dice qué sesión toca (Tirón, tras Empuje)');
  E.ok(recordatorios(sumar(ultima, 7)).r === 0 && recordatorios(sumar(ultima, 9)).r === 0, 'solo un recordatorio por parón (no se repite los días siguientes)');
  E.ok(sim.usuarios().find((u) => u.rol === 'admin').recordatorio instanceof Date, 'la hoja de Administración anota cuándo se avisó');

  // Usuarios sin email, sin entrenos o con el recordatorio desactivado
  const conEmail = sim.ejecutar('crearUsuario_', { nombre: 'Ana', email: 'ana@ejemplo.com' });
  const sinEmail = sim.ejecutar('crearUsuario_', { nombre: 'Luis', email: '' });
  E.ok(recordatorios(sumar(ultima, 30)).r === 0, 'sin recordatorio para quien aún no ha entrenado nunca ni para quien no tiene email');
  sim.ponerRutina(sim.libroDe('Ana'), [
    ['Torso', 1, 'Press banca', 3, '8–10', '2 min', 'Pecho', 'Tríceps', 'Barra'],
    ['Torso', 2, 'Crunch en polea', 2, '12–15', '1 min', 'Abdomen', '', 'Polea'],
    ['Pierna', 1, 'Gemelo de pie', 3, '10–15', '1 min', 'Gemelos', '', 'Máquina']
  ]);
  for (const [id, fecha] of [['a1', '2026-10-27'], ['a2', '2026-10-29']]) {
    await post({ clave: conEmail.clave, tipo: 'sesion', sesion: { id, sesion: 'Torso', fecha, ejercicios: [
      { nombre: 'Press banca', series: [{ serie: 1, peso: id === 'a1' ? 40 : 45, reps: 8 }] },
      { nombre: 'Crunch en polea', series: [{ serie: 1, peso: 20, reps: 15 }, { serie: 2, peso: 20, reps: 15 }] }] } });
  }
  await post({ clave: conEmail.clave, tipo: 'perfil', perfil: { recordatorio: 0 } });
  await post({ clave: sinEmail.clave, tipo: 'sesion', sesion: { id: 'l1', sesion: 'Libre', fecha: '2026-10-01', ejercicios: [{ nombre: 'Curl', series: [{ serie: 1, peso: 10, reps: 10 }] }] } });
  x = recordatorios('2026-11-20');
  E.ok(x.nuevos.every((c) => c.to !== 'ana@ejemplo.com'), 'con el recordatorio desactivado (0) no se envía');
  E.ok(!(await post({ clave: conEmail.clave, tipo: 'perfil', perfil: { recordatorio: 99 } })).ok, 'el script rechaza un recordatorio fuera de rango');

  // El usuario cambia los días desde su Perfil en la app
  const { ctx, page, errores } = await E.nuevaPagina(E.navegador);
  await E.conectar(page, E);
  await page.click('[data-tab=perfil]');
  E.ok((await page.textContent('#vista')).includes('Tras 7 días sin entrenar') && (await page.textContent('#vista')).includes('admin@ejemplo.com'), 'Perfil muestra el recordatorio (7 días) y el email');
  await page.click('[data-accion=editar-perfil]');
  await page.selectOption('#pf-recordatorio', '14');
  await page.click('[data-accion=guardar-perfil]');
  await page.waitForSelector('.toast.ok');
  const perfil = sim.volcar(sim.hojas.Perfil);
  E.ok(perfil.find((f) => f[0] === 'Recordatorio (días)')[1] === 14, 'se guarda en la pestaña Perfil de su hoja');
  E.ok((await page.textContent('#vista')).includes('Tras 14 días sin entrenar'), 'la app muestra el valor nuevo');
  await post({ clave: E.clave, tipo: 'sesion', sesion: { id: 'nueva', sesion: 'Empuje', fecha: '2026-11-01', ejercicios: [{ nombre: 'Press banca', series: [{ serie: 1, peso: 60, reps: 8 }] }] } });
  E.ok(recordatorios('2026-11-08').nuevos.every((c) => c.to !== 'admin@ejemplo.com'), 'con 14 días no avisa a los 7');
  // Un entreno apuntado más tarde con su fecha real (anterior al último aviso) también abre un parón nuevo
  await post({ clave: E.clave, tipo: 'sesion', sesion: { id: 'atrasada', sesion: 'Tirón', fecha: '2026-11-03', ejercicios: [{ nombre: 'Remo en T', series: [{ serie: 1, peso: 50, reps: 8 }] }] } });
  E.ok(recordatorios('2026-11-16').nuevos.every((c) => c.to !== 'admin@ejemplo.com'), 'un entreno apuntado con fecha anterior cuenta como el último');
  x = recordatorios('2026-11-17');
  E.ok(x.nuevos.some((c) => c.to === 'admin@ejemplo.com' && c.subject.includes('14 días')), 'tras un nuevo parón de 14 días vuelve a avisar');

  // Resumen semanal para todos los usuarios activos con email
  let n = sim.correos.length;
  E.ok(sim.ejecutar('enviarResumenesSemanales', null, '2026-11-02') === 2, 'resumen semanal: uno por cada usuario activo con email (2)');
  const res = sim.correos.slice(n);
  const deAna = res.find((c) => c.to === 'ana@ejemplo.com');
  const deAdmin = res.find((c) => c.to === 'admin@ejemplo.com');
  E.ok(deAdmin && deAdmin.subject.includes('26 oct – 1 nov') && deAdmin.htmlBody.includes('Buenos días, Prueba') && deAdmin.htmlBody.includes('SERIES POR MÚSCULO'), 'resumen del administrador con su semana');
  E.ok(deAna && deAna.htmlBody.includes('Abdomen') && deAna.htmlBody.includes('Press banca') && deAna.htmlBody.includes('antes 40 kg'), 'resumen de Ana con SUS músculos (Abdomen) y su récord');
  E.ok(!deAna.htmlBody.includes('Sentadilla hack'), 'sin datos de otros usuarios');
  sim.ejecutar('accionAdmin_', { tipo: 'activarUsuario', id: conEmail.id, activo: false });
  n = sim.correos.length;
  E.ok(sim.ejecutar('enviarResumenesSemanales', null, '2026-11-02') === 1 && sim.correos.slice(n).every((c) => c.to !== 'ana@ejemplo.com'), 'los usuarios desactivados no reciben emails');
  n = sim.correos.length;
  sim.ejecutar('probarResumenSemanal');
  E.ok(sim.correos.length === n + 1 && sim.correos[n].to === 'admin@ejemplo.com', '"Probar resumen semanal" te lo envía a ti');

  E.ok(!errores.length, 'sin errores en consola' + (errores.length ? ': ' + errores.join(' | ') : ''));
  await ctx.close();
};
