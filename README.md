# EDUX TRAINING

App para Android (PWA) para apuntar pesos y repeticiones de la rutina PPL + torso.
Funciona sin internet y, al terminar cada sesión, envía las series a la hoja
**"Seguimiento entreno – PPL + torso"** (pestaña `Registro`) en Google Drive.

**La hoja es la única fuente de datos.** El historial, el calendario, las gráficas,
los récords y "última vez" se calculan a partir de la hoja. El móvil solo guarda:
la sesión en curso, las sesiones pendientes de enviar (hasta que la hoja las confirma)
y una copia de solo lectura del Registro para poder consultarlo sin internet.

## Archivos

| Archivo | Qué es |
|---|---|
| `index.html`, `style.css` | Estructura, juego de iconos y sistema de diseño "Noche violeta" (negro y morado) |
| `fuentes/` | Barlow y Barlow Condensed (licencia OFL), incluidas para funcionar sin internet |
| `cuerpo.js` | Mapa del cuerpo en SVG (frente y espalda) para Inicio y Progreso |
| `app.js` | Base: navegación, Inicio, eventos y arranque |
| `sesion.js` | Entreno y resumen: series, sustitutos, series extra, tiempos, récords |
| `vistas.js` | Historial, Progreso, Perfil, Récords y Ajustes |
| `almacen.js` | Qué se guarda en el móvil y utilidades de formato |
| `datos.js` | Calcula historial, evolución, récords y estadísticas a partir de la hoja |
| `red.js` | Envío de sesiones y descarga de datos de la hoja |
| `grafico.js` | Gráfico de evolución en SVG (sin librerías) |
| `descanso.js` | Temporizador de descanso y pantalla siempre encendida |
| `rutina.js` | La rutina, copiada exactamente de la pestaña `Rutina` |
| `sw.js` | *Service worker*: guarda la app en el móvil para usarla sin internet |
| `manifest.webmanifest`, `icons/` | Permiten instalarla como una app |
| `apps-script/Code.gs` | Script que va **dentro de la hoja de Google**: recibe sesiones, devuelve datos y envía el resumen semanal |

## Pestañas de la hoja que usa la app

| Pestaña | Para qué |
|---|---|
| `Registro` | Una fila por serie (la app escribe A–H) |
| `Rutina` | La app lee y cambia los descansos (columna F) |
| `Tiempos` | Minutos por ejercicio y total de cada sesión (la crea el script) |
| `Perfil` | Nombre, fecha de nacimiento, altura e historial de peso |

## Cómo funciona

1. Eliges la sesión (Inicio propone la siguiente de la rotación) y apuntas kg y reps de cada serie.
   - Los campos muestran en gris lo que hiciste la última vez.
   - **✓** marca la serie como hecha (si está vacía, la rellena con la última vez) y arranca el descanso.
   - **− / +** cambian el peso de 2,5 en 2,5 kg y las reps de 1 en 1.
   - Al completar un ejercicio se pliega y se pasa al siguiente. 🏆 marca los récords personales (con animación).
   - **+ Serie** añade una serie extra; **⇄ Sustituir** cambia el ejercicio solo para esa sesión
     (por otro de la rutina) y se registra con el nombre del sustituto.
   - Cada ejercicio cuenta su tiempo: desde que terminaste lo anterior hasta su última serie.
   - La pantalla se mantiene encendida durante la sesión.
   Todo se guarda en el móvil al momento: si se cierra la app, vuelves directo a la sesión.
2. **Terminar sesión** muestra un resumen. Al guardar, la sesión pasa a la cola de envío.
3. La app manda la sesión al script de la hoja, que escribe una fila por serie en `Registro`
   (columnas A–H; la columna Semana queda vacía). Volumen, 1RM y `Progreso` se calculan solos.
4. Si no hay internet, la sesión queda **pendiente** y se envía sola cuando vuelve la conexión
   (o con el botón *Enviar ahora*). Cada sesión tiene un identificador y el script ignora
   las repetidas, así que nunca se duplica.

Reglas: solo se envían las series con reps. Si el peso está vacío se envía 0 (p. ej. fondos sin lastre).
La nota de cada ejercicio va en la fila de su primera serie.

## Instalación

### 1. Script en la hoja (una sola vez)

1. Abre la hoja → **Extensiones → Apps Script**.
2. Borra lo que haya en `Código.gs` y pega el contenido de [`apps-script/Code.gs`](apps-script/Code.gs). Guarda (💾).
3. En el desplegable de funciones de arriba elige **`generarClave`** y pulsa **▶ Ejecutar**.
   - Google pedirá permisos: *Revisar permisos* → tu cuenta → *Configuración avanzada* →
     *Ir a … (no seguro)* → *Permitir*. Es normal: el script es tuyo y no está verificado por Google.
   - En el **registro de ejecución** aparece `Tu clave secreta es: …`. Cópiala.
4. **Implementar → Nueva implementación** → tipo (⚙) **Aplicación web**:
   - *Ejecutar como*: **Yo**
   - *Quién tiene acceso*: **Cualquier usuario**
   - **Implementar** y copia la **URL de la aplicación web** (termina en `/exec`).

> "Cualquier usuario" es necesario para que la app pueda llamar al script sin iniciar sesión.
> Nadie puede escribir sin la clave secreta.

### Actualizar el script (cuando cambie `Code.gs`)

1. **Extensiones → Apps Script**, sustituye todo el código por el nuevo `Code.gs` y guarda.
2. **Implementar → Gestionar implementaciones → ✏️ (editar) → Versión: Nueva versión → Implementar**.

Así se mantiene la misma URL y la misma clave. Si la app dice *"El script de la hoja es la
versión antigua"*, es que falta este paso.

### Resumen semanal por email

1. En el editor de Apps Script elige la función **`activarResumenSemanal`** y pulsa **▶ Ejecutar**.
   Acepta los permisos (enviar correo y ejecutar a una hora programada).
2. Comprueba en **⚙ Configuración del proyecto** que la zona horaria es `(GMT+01:00) Madrid`.
3. Para probarlo ya: ejecuta **`probarResumenSemanal`** (envía el resumen de la semana pasada).

Llega cada lunes hacia las 7:00 a la cuenta de Gmail dueña de la hoja.
Para quitarlo: ejecuta **`desactivarResumenSemanal`**.

### 2. Publicar la app (GitHub Pages)

En GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch →
Branch: `main` / `(root)` → Save**. En un minuto estará en
`https://edumoal.github.io/SEGUIMINETO_GIMNASIO/`.

### 3. Instalar en Android

1. Abre esa URL en **Chrome** → menú **⋮ → Instalar aplicación** (o *Añadir a pantalla de inicio*).
2. Abre la app → **⚙ Ajustes** → pega la **URL** y la **clave** → **Guardar** → **Probar conexión**.

Los datos se guardan en el almacenamiento de Chrome para esta web: no borres los
"datos de sitios" de Chrome o perderás las sesiones no enviadas.

## Hacer cambios en la app

1. Edita los archivos.
2. **Sube el número de `VERSION` en `sw.js`** (p. ej. `v1` → `v2`). Si no, el móvil seguirá usando la versión guardada.
3. Haz *commit* y *push*. La próxima vez que abras la app con internet se actualizará
   (a veces hace falta cerrarla y abrirla dos veces).

Para probar en el ordenador: `python3 -m http.server 8000` en esta carpeta y abre `http://localhost:8000`.
