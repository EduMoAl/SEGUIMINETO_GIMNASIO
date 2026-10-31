'use strict';

/* =====================================================================
 * Temporizador de descanso + pantalla siempre encendida.
 * El tiempo se calcula a partir de la hora de fin, así que sigue siendo
 * correcto aunque el móvil congele la app un momento.
 * ===================================================================== */

const Descanso = {
  fin: 0,            // ms (Date.now) en que acaba
  total: 0,          // segundos totales (para la barra)
  intervalo: null,
  audio: null,
  terminado: false,

  /** Hay que llamarlo desde un toque del usuario para que el móvil permita el sonido. */
  prepararAudio() {
    try {
      if (!this.audio) this.audio = new (window.AudioContext || window.webkitAudioContext)();
      if (this.audio.state === 'suspended') this.audio.resume();
    } catch (e) { /* sin sonido */ }
  },

  iniciar(segundos) {
    this.prepararAudio();
    this.total = segundos;
    this.fin = Date.now() + segundos * 1000;
    this.terminado = false;
    guardar(K.descanso, { fin: this.fin, total: this.total });
    this.arrancar();
  },

  restaurar() {
    const d = leer(K.descanso, null);
    if (d && d.fin > Date.now()) {
      this.fin = d.fin; this.total = d.total; this.terminado = false;
      this.arrancar();
    } else {
      localStorage.removeItem(K.descanso);
    }
  },

  arrancar() {
    clearInterval(this.intervalo);
    this.intervalo = setInterval(() => this.tick(), 250);
    this.tick();
  },

  ajustar(seg) {
    if (!this.intervalo) return;
    this.fin = Math.max(Date.now() + 1000, this.fin + seg * 1000);
    this.total = Math.max(this.total + seg, 1);
    this.terminado = false;
    guardar(K.descanso, { fin: this.fin, total: this.total });
    this.tick();
  },

  parar() {
    clearInterval(this.intervalo);
    this.intervalo = null;
    localStorage.removeItem(K.descanso);
    this.pintar(null);
  },

  activo() { return Boolean(this.intervalo); },

  tick() {
    const restante = Math.ceil((this.fin - Date.now()) / 1000);
    if (restante <= 0 && !this.terminado) {
      this.terminado = true;
      this.avisar();
      localStorage.removeItem(K.descanso);
      // Mostrar "¡Vamos!" unos segundos y cerrar
      setTimeout(() => { if (this.terminado) this.parar(); }, 4000);
    }
    this.pintar(Math.max(restante, 0));
  },

  pintar(restante) {
    const caja = document.getElementById('descanso');
    if (!caja) return;
    const visible = restante !== null && this.intervalo !== null;
    caja.hidden = !visible;
    document.body.classList.toggle('con-descanso', visible);
    if (!visible) return;
    caja.classList.toggle('fin', this.terminado);
    caja.querySelector('.descanso-etiqueta').textContent = this.terminado ? '¡A por la siguiente serie!' : 'Descanso';
    const mm = Math.floor(restante / 60), ss = String(restante % 60).padStart(2, '0');
    caja.querySelector('.descanso-tiempo').textContent = `${mm}:${ss}`;
    caja.querySelector('.descanso-relleno').style.width = `${(restante / this.total) * 100}%`;
  },

  avisar() {
    vibrar([250, 120, 250, 120, 450]);
    if (!this.audio || !prefs().sonido) return;
    try {
      const t = this.audio.currentTime;
      [0, 0.25, 0.5].forEach((d, i) => {
        const o = this.audio.createOscillator();
        const g = this.audio.createGain();
        o.type = 'sine';
        o.frequency.value = i === 2 ? 1320 : 880;
        g.gain.setValueAtTime(0.0001, t + d);
        g.gain.exponentialRampToValueAtTime(0.35, t + d + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d + (i === 2 ? 0.45 : 0.18));
        o.connect(g).connect(this.audio.destination);
        o.start(t + d);
        o.stop(t + d + 0.5);
      });
    } catch (e) { /* sin sonido */ }
  }
};

/* ---------- Pantalla siempre encendida durante la sesión ---------- */
const Pantalla = {
  bloqueo: null,
  quiere: false,
  async activar() {
    this.quiere = true;
    try {
      if ('wakeLock' in navigator && !this.bloqueo) {
        this.bloqueo = await navigator.wakeLock.request('screen');
        this.bloqueo.addEventListener('release', () => { this.bloqueo = null; });
      }
    } catch (e) { /* el navegador no lo permite ahora */ }
  },
  desactivar() {
    this.quiere = false;
    if (this.bloqueo) this.bloqueo.release().catch(() => {});
    this.bloqueo = null;
  }
};

// Android suelta el bloqueo al salir de la app: lo recuperamos al volver.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (Pantalla.quiere) Pantalla.activar();
    if (Descanso.activo()) Descanso.tick();
  }
});
