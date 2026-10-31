'use strict';

/* =====================================================================
 * Pantallas del entreno: Sesión y Resumen.
 *
 * La sesión en curso se guarda en el móvil (K.actual) en cada pulsación:
 *   { id, sesion, fecha, inicio, ultimaMarca,
 *     datos: { [ejercicio de la rutina]: { series:[{peso,reps,hecha}], nota,
 *                                          sustituto?, inicio?, fin? } } }
 * ===================================================================== */

let abiertos = new Set();   // ejercicios completos desplegados a mano
let cerrados = new Set();   // ejercicios incompletos plegados a mano
const MAX_SERIES = 10;      // límite de la hoja (columna Serie nº)

/* ===================== Datos de la sesión ===================== */

/** "62,5" → 62.5 · "" → null · inválido → NaN */
function leerPeso(texto) {
  const t = String(texto ?? '').trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 && n <= 1000 ? n : NaN;
}
/** "8" → 8 · "" → null · inválido → NaN */
function leerReps(texto) {
  const t = String(texto ?? '').trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isInteger(n) && n >= 0 && n <= 100 ? n : NaN;
}

function crearSesion(nombreSesion) {
  const datos = {};
  for (const ej of RUTINA[nombreSesion]) {
    datos[ej.nombre] = {
      series: Array.from({ length: ej.series }, () => ({ peso: '', reps: '', hecha: false })),
      nota: ''
    };
  }
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2),
    sesion: nombreSesion, fecha: hoy(), inicio: new Date().toISOString(), datos
  };
}

function empezarSesion(nombre) {
  const actual = leer(K.actual, null);
  if (actual && actual.sesion !== nombre &&
      !confirm(`Tienes una sesión de ${actual.sesion} en curso. ¿Descartarla y empezar ${nombre}?`)) return;
  if (!actual || actual.sesion !== nombre) {
    guardar(K.actual, crearSesion(nombre));
    abiertos = new Set(); cerrados = new Set();
    Descanso.parar();
  }
  Descanso.prepararAudio();
  navegar('sesion');
}

/** Nombre con el que se registra el ejercicio (el sustituto si lo hay) */
function nombreReal(ej, d) { return d.sustituto || ej.nombre; }

/** Objetivo de reps de una serie (las extra usan el de la última serie) */
function objetivo(ej, iS) { return ej.objetivos[Math.min(iS, ej.objetivos.length - 1)]; }

function serieHecha(s) {
  const r = leerReps(s.reps);
  return Boolean(s.hecha) && r !== null && !Number.isNaN(r) && !Number.isNaN(leerPeso(s.peso));
}
function ejercicioCompleto(d) { return d.series.every(serieHecha); }

function progresoSesion(actual) {
  let hechas = 0, total = 0;
  for (const ej of RUTINA[actual.sesion]) {
    for (const s of actual.datos[ej.nombre].series) { total++; if (serieHecha(s)) hechas++; }
  }
  return { hechas, total };
}

/** Marca el inicio del ejercicio la primera vez que lo tocas:
 *  cuenta desde que terminaste lo anterior (o desde que empezó la sesión). */
function marcarInicio(actual, d) {
  if (!d.inicio) d.inicio = actual.ultimaMarca || new Date(actual.inicio).getTime();
}

/** Minutos de un ejercicio (null si no se ha hecho ninguna serie) */
function minutosEjercicio(d) {
  return d.inicio && d.fin ? Math.max(0, (d.fin - d.inicio) / 60000) : null;
}

/** Valores de referencia para una serie: última vez (misma serie) o la serie anterior de hoy */
function referencia(nombre, iS, d) {
  const u = ultimaVez(nombre);
  const ref = u && u.series.find((x) => x.serie === iS + 1);
  if (ref) return { peso: ref.peso, reps: ref.reps };
  for (let k = iS - 1; k >= 0; k--) {
    const p = leerPeso(d.series[k].peso), r = leerReps(d.series[k].reps);
    if (r !== null && !Number.isNaN(r)) return { peso: Number.isNaN(p) || p === null ? 0 : p, reps: r };
  }
  if (u && u.series.length) { const x = u.series[u.series.length - 1]; return { peso: x.peso, reps: x.reps }; }
  return null;
}

function esRecord(nombre, s) {
  if (!serieHecha(s)) return false;
  const p = leerPeso(s.peso) ?? 0, r = leerReps(s.reps);
  if (!r) return false;
  const rec = indice().records.get(nombre);
  if (!rec || rec.peso <= 0) return false;   // la primera vez no cuenta como récord
  return p > rec.peso || rm1(p, r) > rec.rm1;
}

/** Texto del récord que bate una serie: "1RM est. 93,2 kg (65 kg × 13 reps)" (o null) */
function textoRecord(nombre, s) {
  if (!esRecord(nombre, s)) return null;
  const p = leerPeso(s.peso) ?? 0, r = leerReps(s.reps);
  const rec = indice().records.get(nombre);
  return p > rec.peso ? `Peso ${prTxt(p, { peso: p, reps: r })}` : `1RM est. ${prTxt(rm1(p, r), { peso: p, reps: r }, 1)}`;
}

/**
 * Convierte la sesión en lo que se envía a la hoja.
 * Se envían las series con reps; si el peso está vacío se envía 0.
 */
function analizarSesion(actual) {
  const ejercicios = [];
  const tiempos = [];
  const problemas = [];
  const avisos = [];
  let volumen = 0;
  const records = [];   // { ejercicio, txt } — el mejor récord de cada ejercicio

  for (const ej of RUTINA[actual.sesion]) {
    const d = actual.datos[ej.nombre];
    const nombre = nombreReal(ej, d);
    const series = [];
    d.series.forEach((s, i) => {
      const peso = leerPeso(s.peso);
      const reps = leerReps(s.reps);
      if (Number.isNaN(peso)) problemas.push(`${nombre}, serie ${i + 1}: peso no válido`);
      if (Number.isNaN(reps)) problemas.push(`${nombre}, serie ${i + 1}: reps no válidas`);
      if (Number.isNaN(peso) || Number.isNaN(reps)) return;
      if (reps === null) {
        if (peso !== null) avisos.push(`${nombre}, serie ${i + 1}: tiene peso pero no reps (no se enviará)`);
        return;
      }
      series.push({ serie: i + 1, peso: peso ?? 0, reps });
      volumen += (peso ?? 0) * reps;
      const sh = { ...s, hecha: true };
      if (esRecord(nombre, sh)) {
        // Se queda el mejor récord del ejercicio (más peso; a igual peso, mejor 1RM)
        const valor = (peso ?? 0) * 1000 + rm1(peso ?? 0, reps);
        const previo = records.find((x) => x.ejercicio === nombre);
        if (!previo) records.push({ ejercicio: nombre, valor, txt: textoRecord(nombre, sh) });
        else if (valor > previo.valor) { previo.valor = valor; previo.txt = textoRecord(nombre, sh); }
      }
    });
    const nota = d.nota.trim();
    if (series.length) {
      ejercicios.push({ nombre, nota, series, original: ej.nombre });
      const min = minutosEjercicio(d);
      if (min !== null) tiempos.push({ ejercicio: nombre, minutos: Math.round(min * 10) / 10 });
    } else if (nota) {
      avisos.push(`${nombre}: tiene nota pero ninguna serie (la nota no se enviará)`);
    }
  }
  const duracion = Math.round(((actual.fin || Date.now()) - new Date(actual.inicio).getTime()) / 6000) / 10;
  const sesion = { id: actual.id, sesion: actual.sesion, fecha: actual.fecha, ejercicios, tiempos, duracion };
  const totalSeries = ejercicios.reduce((a, e) => a + e.series.length, 0);
  return { sesion, problemas, avisos, totalSeries, volumen, records };
}

function terminarSesion() {
  const actual = leer(K.actual, null);
  if (!actual) return;
  actual.fin = Date.now();
  const { sesion } = analizarSesion(actual);
  sesion.ejercicios.forEach((e) => delete e.original);
  const pendientes = leer(K.pendientes, []);
  pendientes.push(sesion);
  guardar(K.pendientes, pendientes);
  localStorage.removeItem(K.actual);
  Descanso.parar();
  Pantalla.desactivar();
  abiertos = new Set(); cerrados = new Set();
  invalidarIndice();
}

/* ===================== Vista: Sesión ===================== */

function vistaSesion() {
  const actual = leer(K.actual, null);
  if (!actual) return render('inicio');
  barra(`${BTN_ATRAS}<div class="titulo-sesion"><b>${esc(actual.sesion)}</b><span id="reloj"></span></div>`);

  const rutina = RUTINA[actual.sesion];
  const idxActual = rutina.findIndex((ej) => !ejercicioCompleto(actual.datos[ej.nombre]));

  let html = `
    <div class="fecha-sesion">
      <span>${esc(INFO_SESION[actual.sesion].grupos)}</span>
      <input type="date" id="fecha-sesion" value="${esc(actual.fecha)}" max="${hoy()}" aria-label="Fecha de la sesión">
    </div>`;
  rutina.forEach((ej, i) => { html += tarjetaEjercicio(actual, ej, i, idxActual); });
  $('#vista').innerHTML = html;

  actualizarCabeceraSesion();
  relojIntervalo = setInterval(actualizarCabeceraSesion, 1000);
}

/** Opciones para sustituir: ejercicios de la rutina que no están ya en esta sesión */
function opcionesSustituto(actual, ej, d) {
  const usados = new Set();
  for (const e of RUTINA[actual.sesion]) {
    usados.add(e.nombre);
    if (actual.datos[e.nombre].sustituto) usados.add(actual.datos[e.nombre].sustituto);
  }
  let html = `<option value="">⇄ Sustituir</option>`;
  if (d.sustituto) html += `<option value="__original">↩ Volver a ${esc(ej.nombre)}</option>`;
  for (const s of ORDEN_SESIONES) {
    const lista = RUTINA[s].filter((x) => !usados.has(x.nombre));
    if (!lista.length) continue;
    html += `<optgroup label="${esc(s)}">${lista.map((x) => `<option value="${esc(x.nombre)}">${esc(x.nombre)}</option>`).join('')}</optgroup>`;
  }
  return html;
}

function tarjetaEjercicio(actual, ej, i, idxActual) {
  const d = actual.datos[ej.nombre];
  const nombre = nombreReal(ej, d);
  const completo = ejercicioCompleto(d);
  const plegado = (completo && !abiertos.has(i)) || cerrados.has(i);
  const u = ultimaVez(nombre);
  const hechas = d.series.filter(serieHecha);
  const resumen = completo
    ? seriesTxt(hechas.map((s) => ({ peso: leerPeso(s.peso) ?? 0, reps: leerReps(s.reps) })))
    : `${hechas.length}/${d.series.length} series hechas`;
  const clases = ['ejercicio', i === idxActual ? 'actual' : '', completo ? 'completo' : '', plegado ? 'plegado' : ''].join(' ');

  let html = `
    <section class="${clases}" data-ej="${i}" id="ej-${i}">
      <button class="ej-cabecera" data-accion="plegar">
        <span class="ej-num">${completo ? '✓' : i + 1}</span>
        <span class="ej-titulo">
          <b>${esc(nombre)}</b>
          <span>${d.series.length} series · descanso ${mmss(descansoDe(nombre))}<span class="ej-tiempo" data-ej="${i}"></span></span>
          ${d.sustituto ? `<span class="ej-sustituto">en lugar de ${esc(ej.nombre)}</span>` : ''}
          <span class="ej-resumen">${esc(resumen)}</span>
        </span>
        <span class="ej-chevron">⌄</span>
      </button>
      <div class="ej-cuerpo">
        <div class="ultimo">${u
          ? `<b>Última · ${esc(fechaCorta(u.fecha))}</b><span>${esc(seriesTxt(u.series))}</span>`
          : '<b>Primera vez</b><span>Sin registros anteriores</span>'}</div>
        <div class="serie-cab"><span>kg</span><span>reps</span><span></span></div>`;

  d.series.forEach((s, iS) => {
    const ref = u && u.series.find((x) => x.serie === iS + 1);
    const extra = iS >= ej.series;
    html += `
        <div class="serie ${claseSerie(nombre, s)}" data-serie="${iS}">
          <div class="serie-info">
            <span><b>Serie ${iS + 1}</b>${extra ? ' <span class="etiqueta-extra">extra</span>' : ''} · objetivo ${esc(objetivo(ej, iS))} reps</span>
            <span class="pr">🏆 Récord</span>
            ${extra && !s.hecha ? `<button class="quitar" data-accion="quitar-serie" aria-label="Quitar serie extra">✕</button>` : ''}
          </div>
          <div class="serie-fila">
            <div class="paso">
              <button data-accion="menos" data-campo="peso" aria-label="Menos peso">−</button>
              <input class="num" data-campo="peso" inputmode="decimal" enterkeyhint="next" autocomplete="off"
                     value="${esc(s.peso)}" placeholder="${ref ? esc(num(ref.peso)) : 'kg'}" aria-label="Peso serie ${iS + 1}">
              <button data-accion="mas" data-campo="peso" aria-label="Más peso">+</button>
            </div>
            <div class="paso">
              <button data-accion="menos" data-campo="reps" aria-label="Menos reps">−</button>
              <input class="num" data-campo="reps" inputmode="numeric" enterkeyhint="next" autocomplete="off"
                     value="${esc(s.reps)}" placeholder="${ref ? esc(ref.reps) : 'reps'}" aria-label="Reps serie ${iS + 1}">
              <button data-accion="mas" data-campo="reps" aria-label="Más reps">+</button>
            </div>
            <button class="check" data-accion="check" aria-label="Marcar serie ${iS + 1} como hecha">✓</button>
          </div>
        </div>`;
  });

  html += `
        <textarea class="nota" data-campo="nota" rows="1" placeholder="Nota del ejercicio (opcional)">${esc(d.nota)}</textarea>
        <div class="ej-acciones">
          <button class="chip" data-accion="anadir-serie" ${d.series.length >= MAX_SERIES ? 'disabled' : ''}>+ Serie</button>
          <select class="chip chip-select" data-sustituir aria-label="Sustituir ejercicio">${opcionesSustituto(actual, ej, d)}</select>
        </div>
      </div>
    </section>`;
  return html;
}

function claseSerie(nombre, s) {
  const p = leerPeso(s.peso), r = leerReps(s.reps);
  const cls = [];
  if (Number.isNaN(p) || Number.isNaN(r)) cls.push('mal');
  else if (serieHecha(s)) cls.push('hecha');
  if (esRecord(nombre, s)) cls.push('es-pr');
  return cls.join(' ');
}

/** Cada segundo: reloj de la sesión, progreso y tiempo de cada ejercicio */
function actualizarCabeceraSesion() {
  const actual = leer(K.actual, null);
  if (!actual || vistaActual !== 'sesion') return;
  const { hechas, total } = progresoSesion(actual);
  const el = $('#reloj');
  if (el) el.textContent = `${reloj(Date.now() - new Date(actual.inicio).getTime())} · ${hechas}/${total} series`;
  $('#progreso-sesion .relleno').style.width = `${total ? (hechas / total) * 100 : 0}%`;
  RUTINA[actual.sesion].forEach((ej, i) => {
    const d = actual.datos[ej.nombre];
    const t = document.querySelector(`.ej-tiempo[data-ej="${i}"]`);
    if (!t) return;
    if (!d.inicio) { t.textContent = ''; return; }
    const fin = ejercicioCompleto(d) && d.fin ? d.fin : Date.now();
    t.textContent = ` · ⏱ ${Math.floor((fin - d.inicio) / 60000)} min`;
  });
}

/** Contexto (sesión, ejercicio, serie) a partir de un elemento dentro de una tarjeta */
function contexto(el) {
  const actual = leer(K.actual, null);
  const sec = el.closest('.ejercicio');
  if (!actual || !sec) return null;
  const iEj = Number(sec.dataset.ej);
  const ej = RUTINA[actual.sesion][iEj];
  const d = actual.datos[ej.nombre];
  const fila = el.closest('.serie');
  const iS = fila ? Number(fila.dataset.serie) : null;
  return { actual, iEj, ej, d, nombre: nombreReal(ej, d), fila, iS, s: iS !== null ? d.series[iS] : null };
}

function pasoSerie(el, signo) {
  const c = contexto(el);
  if (!c) return;
  const campo = el.dataset.campo;
  const paso = campo === 'peso' ? 2.5 : 1;
  const leerV = campo === 'peso' ? leerPeso : leerReps;
  let v = leerV(c.s[campo]);
  if (v === null || Number.isNaN(v)) {
    const ref = referencia(c.nombre, c.iS, c.d);
    const base = ref ? ref[campo] : 0;
    v = base > 0 ? base : Math.max(0, signo * paso);
  } else {
    v = Math.max(0, Math.round((v + signo * paso) * 100) / 100);
  }
  c.s[campo] = campo === 'peso' ? num(v) : String(v);
  marcarInicio(c.actual, c.d);
  guardar(K.actual, c.actual);
  c.fila.querySelector(`input[data-campo="${campo}"]`).value = c.s[campo];
  c.fila.className = 'serie ' + claseSerie(c.nombre, c.s);
}

function sacudir(fila) {
  fila.classList.remove('sacudir'); void fila.offsetWidth; fila.classList.add('sacudir');
}

function marcarSerie(el) {
  const c = contexto(el);
  if (!c) return;
  const s = c.s;
  let record = false;
  if (s.hecha) {
    s.hecha = false;
  } else {
    if (leerReps(s.reps) === null) {
      // Serie vacía: se rellena con la referencia (última vez o serie anterior)
      const ref = referencia(c.nombre, c.iS, c.d);
      if (!ref) {
        sacudir(c.fila);
        c.fila.querySelector('input[data-campo="reps"]').focus();
        return aviso('Apunta las repeticiones de la serie', 'atencion', 3);
      }
      if (leerPeso(s.peso) === null) s.peso = num(ref.peso);
      s.reps = String(ref.reps);
    }
    if (Number.isNaN(leerPeso(s.peso)) || Number.isNaN(leerReps(s.reps))) {
      sacudir(c.fila);
      return aviso('Revisa el peso o las reps de la serie', 'error', 3);
    }
    marcarInicio(c.actual, c.d);
    s.hecha = true;
    const ahora = Date.now();
    c.d.fin = ahora;
    c.actual.ultimaMarca = ahora;
    record = esRecord(c.nombre, s);
    if (!record) vibrar(30);
  }
  guardar(K.actual, c.actual);

  // Posición del ✓ para la animación (antes de re-pintar)
  const caja = el.getBoundingClientRect();

  const { hechas, total } = progresoSesion(c.actual);
  if (s.hecha && hechas < total) Descanso.iniciar(descansoDe(c.nombre));
  if (s.hecha && hechas === total) { Descanso.parar(); aviso('💪 ¡Sesión completa! Pulsa "Terminar sesión"', 'ok', 6); }

  if (s.hecha && ejercicioCompleto(c.d)) {
    // Ejercicio terminado: se pliega y se pasa al siguiente sin terminar
    abiertos.delete(c.iEj);
    cerrados.delete(c.iEj);
    repintar();
    const rutina = RUTINA[c.actual.sesion];
    const sig = rutina.findIndex((e) => !ejercicioCompleto(c.actual.datos[e.nombre]));
    if (sig >= 0) { cerrados.delete(sig); const t = $(`#ej-${sig}`); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  } else {
    repintar();
  }

  if (record) {
    celebrar(caja.left + caja.width / 2, caja.top + caja.height / 2);
    aviso(`🏆 ¡Récord en ${c.nombre}! ${textoRecord(c.nombre, s)}`, 'ok', 5);
    const fila = document.querySelector(`#ej-${c.iEj} .serie[data-serie="${c.iS}"] .pr`);
    if (fila) fila.classList.add('pop');
  }
}

/** Animación de récord: confeti morado y dorado desde el botón ✓ */
function celebrar(x, y) {
  vibrar([60, 40, 60, 40, 200]);
  const capa = document.createElement('div');
  capa.className = 'confeti';
  const colores = ['#9b6cf6', '#c4b5fd', '#a855f7', '#fbbf24', '#fde68a', '#ffffff'];
  for (let i = 0; i < 36; i++) {
    const p = document.createElement('i');
    const ang = Math.random() * Math.PI * 2;
    const dist = 70 + Math.random() * 130;
    p.style.left = x + 'px';
    p.style.top = y + 'px';
    p.style.background = colores[i % colores.length];
    p.style.setProperty('--dx', `${Math.cos(ang) * dist}px`);
    p.style.setProperty('--dy', `${Math.sin(ang) * dist - 60}px`);
    p.style.setProperty('--rot', `${Math.round(Math.random() * 720 - 360)}deg`);
    p.style.animationDelay = `${Math.random() * 80}ms`;
    if (i % 3 === 0) p.style.borderRadius = '50%';
    capa.appendChild(p);
  }
  const trofeo = document.createElement('div');
  trofeo.className = 'trofeo';
  trofeo.textContent = '🏆';
  trofeo.style.left = x + 'px';
  trofeo.style.top = y + 'px';
  capa.appendChild(trofeo);
  document.body.appendChild(capa);
  setTimeout(() => capa.remove(), 1400);
}

function plegar(el) {
  const sec = el.closest('.ejercicio');
  const i = Number(sec.dataset.ej);
  const plegado = sec.classList.contains('plegado');
  if (sec.classList.contains('completo')) {
    if (plegado) abiertos.add(i); else abiertos.delete(i);
  } else {
    if (plegado) cerrados.delete(i); else cerrados.add(i);
  }
  sec.classList.toggle('plegado');
}

function anadirSerie(el) {
  const c = contexto(el);
  if (!c || c.d.series.length >= MAX_SERIES) return;
  c.d.series.push({ peso: '', reps: '', hecha: false });
  guardar(K.actual, c.actual);
  if (ejercicioCompleto(c.d)) abiertos.add(c.iEj);
  repintar();
}

function quitarSerie(el) {
  const c = contexto(el);
  if (!c || c.iS < c.ej.series) return;
  c.d.series.splice(c.iS, 1);
  guardar(K.actual, c.actual);
  repintar();
}

function sustituir(sel) {
  const c = contexto(sel);
  if (!c || !sel.value) return;
  const nuevo = sel.value === '__original' ? null : sel.value;
  const conDatos = c.d.series.some((s) => s.peso !== '' || s.reps !== '');
  const destino = nuevo || c.ej.nombre;
  if (conDatos && !confirm(`Las series ya apuntadas pasarán a "${destino}". ¿Continuar?`)) { sel.value = ''; return; }
  if (nuevo) c.d.sustituto = nuevo; else delete c.d.sustituto;
  guardar(K.actual, c.actual);
  aviso(nuevo ? `Hoy: ${nuevo} en lugar de ${c.ej.nombre}` : `Vuelves a ${c.ej.nombre}`, 'info', 3);
  repintar();
}

/* ===================== Vista: Resumen ===================== */

/** Compara un ejercicio de hoy con la última vez que lo hiciste */
function compararEjercicio(ej) {
  const u = ultimaVez(ej.nombre);
  if (!u) return { clase: 'nuevo', txt: 'primera vez' };
  const top = Math.max(...ej.series.map((s) => s.peso));
  const topAntes = u.pesoMax;
  if (top > topAntes + 1e-9) return { clase: 'sube', txt: `↑ +${num(top - topAntes)} kg` };
  if (top < topAntes - 1e-9) return { clase: 'baja', txt: `↓ −${num(topAntes - top)} kg` };
  const reps = ej.series.filter((s) => s.peso === top).reduce((a, s) => a + s.reps, 0);
  const repsAntes = u.series.filter((s) => s.peso === topAntes).reduce((a, s) => a + s.reps, 0);
  const d = reps - repsAntes;
  if (d > 0) return { clase: 'sube', txt: `↑ +${d} ${d === 1 ? 'rep' : 'reps'}` };
  if (d < 0) return { clase: 'baja', txt: `↓ −${-d} ${d === -1 ? 'rep' : 'reps'}` };
  return { clase: 'igual', txt: '= igual' };
}

/** Volumen de la última vez que hiciste esta misma sesión */
function sesionAnterior(nombreSesion) {
  let ultima = null;
  for (const dia of indice().dias.values()) {
    const s = dia.sesiones.get(nombreSesion);
    // Los días de solo asistencia (sin series) no sirven para comparar volumen
    if (s && s.ejercicios.size && (!ultima || dia.fecha > ultima.fecha)) ultima = { fecha: dia.fecha, ses: s };
  }
  if (!ultima) return null;
  let volumen = 0;
  for (const ej of ultima.ses.ejercicios.values()) for (const x of ej.series) volumen += x.peso * x.reps;
  return { fecha: ultima.fecha, volumen };
}

function vistaResumen() {
  const actual = leer(K.actual, null);
  if (!actual) return render('inicio');
  barra(`${BTN_ATRAS}<h1>Resumen</h1>`);
  const { sesion, problemas, avisos, totalSeries, volumen, records } = analizarSesion(actual);
  const ant = sesionAnterior(actual.sesion);
  const minutosPorEj = new Map(sesion.tiempos.map((t) => [t.ejercicio, t.minutos]));

  let html = `<div class="tarjeta">
    <div class="hero-etiqueta" style="color:var(--morado-claro)">${esc(fechaMedia(actual.fecha)).toUpperCase()}</div>
    <div style="font-size:1.6rem;font-weight:900;text-transform:uppercase;margin-top:2px">${esc(actual.sesion)}</div>
    <div class="resumen-cifras">
      <div><b>${totalSeries}</b><span>series</span></div>
      <div><b>${volumenTxt(volumen)}</b><span>volumen</span></div>
      <div><b>${duracionTxt(Date.now() - new Date(actual.inicio).getTime())}</b><span>duración</span></div>
    </div>`;
  if (ant && ant.volumen > 0) {
    const pct = Math.round(((volumen - ant.volumen) / ant.volumen) * 100);
    const clase = pct > 0 ? 'sube' : pct < 0 ? 'baja' : 'igual';
    html += `<div class="comparativa ${clase}">${pct > 0 ? '↑ +' : pct < 0 ? '↓ −' : '= '}${Math.abs(pct)} % de volumen frente a tu último ${esc(actual.sesion)} (${esc(fechaCorta(ant.fecha))})</div>`;
  }
  if (records.length) {
    html += `<div class="resumen-records"><b>🏆 ${records.length} ${records.length === 1 ? 'récord personal' : 'récords personales'}</b>
      ${records.map((x) => `<div>${esc(x.ejercicio)}: ${esc(x.txt)}</div>`).join('')}</div>`;
  }
  if (sesion.ejercicios.length) {
    html += '<ul class="lista-resumen" style="margin-top:14px">';
    for (const ej of sesion.ejercicios) {
      const cmp = compararEjercicio(ej);
      const min = minutosPorEj.get(ej.nombre);
      html += `<li>
        <div class="resumen-ej-cab"><strong>${esc(ej.nombre)}</strong><span class="delta ${cmp.clase}">${esc(cmp.txt)}</span></div>
        <div class="series-txt">${esc(ej.series.map((s) => `${num(s.peso)} kg × ${s.reps}`).join(' · '))}</div>
        ${min !== undefined ? `<div class="tenue">⏱ ${minTxt(min)}</div>` : ''}
        ${ej.nota ? `<em class="tenue">${esc(ej.nota)}</em>` : ''}
      </li>`;
    }
    html += '</ul>';
  }
  html += '</div>';

  if (problemas.length) html += `<div class="tarjeta alerta"><strong>Corrige antes de terminar:</strong><ul>${problemas.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>`;
  if (avisos.length) html += `<div class="tarjeta atencion"><ul style="margin:0">${avisos.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>`;
  if (!totalSeries) html += `<div class="tarjeta alerta">No hay ninguna serie con repeticiones.</div>`;

  const puede = !problemas.length && totalSeries > 0;
  html += `
    <div class="fila-botones">
      <button class="btn" data-accion="atras">Seguir editando</button>
      <button class="btn primario" data-accion="confirmar" ${puede ? '' : 'disabled'}>Guardar en la hoja</button>
    </div>`;
  $('#vista').innerHTML = html;
}

/* ===================== Eventos de la sesión ===================== */

/** Devuelve true si la acción era de la sesión */
async function accionSesion(accion, b) {
  switch (accion) {
    case 'empezar': empezarSesion(b.dataset.sesion); return true;
    case 'continuar': Descanso.prepararAudio(); navegar('sesion'); return true;
    case 'descartar':
      if (confirm('¿Descartar la sesión en curso? Se perderá lo apuntado.')) {
        localStorage.removeItem(K.actual);
        Descanso.parar();
        repintar();
      }
      return true;
    case 'plegar': plegar(b); return true;
    case 'mas': pasoSerie(b, +1); return true;
    case 'menos': pasoSerie(b, -1); return true;
    case 'check': marcarSerie(b); return true;
    case 'anadir-serie': anadirSerie(b); return true;
    case 'quitar-serie': quitarSerie(b); return true;
    case 'descanso-mas': Descanso.ajustar(15); return true;
    case 'descanso-menos': Descanso.ajustar(-15); return true;
    case 'descanso-saltar': Descanso.parar(); return true;
    case 'terminar': navegar('resumen'); return true;
    case 'confirmar':
      terminarSesion();
      history.go(-2);   // vuelve a la pantalla anterior a la sesión
      enviarPendientes();
      return true;
  }
  return false;
}

/** Guardado automático en cada pulsación */
function entradaSesion(el) {
  if (el.id === 'fecha-sesion') {
    const actual = leer(K.actual, null);
    if (actual && el.value) { actual.fecha = el.value; guardar(K.actual, actual); }
    return;
  }
  const campo = el.dataset.campo;
  if (!campo) return;
  const c = contexto(el);
  if (!c) return;
  if (campo === 'nota') {
    c.d.nota = el.value;
  } else {
    c.s[campo] = el.value;
    if (leerReps(c.s.reps) === null) c.s.hecha = false;
    marcarInicio(c.actual, c.d);
    c.fila.className = 'serie ' + claseSerie(c.nombre, c.s);
  }
  guardar(K.actual, c.actual);
  if (campo !== 'nota') actualizarCabeceraSesion();
}

function cambioSesion(el) {
  if (el.hasAttribute('data-sustituir')) { sustituir(el); return true; }
  return false;
}
