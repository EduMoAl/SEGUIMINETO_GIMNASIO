# EDUX TRAINING

App para Android (PWA) para apuntar pesos y repeticiones de tu rutina de gimnasio.
Funciona sin internet y, al terminar cada sesión, la envía a **tu hoja de Google**.
Admite **varios usuarios**: cada uno tiene su propia hoja (en el Drive del administrador)
y desde la app solo puede ver y guardar sus datos.

**La hoja es la única fuente de datos.** La rutina, el historial, el calendario, las gráficas,
los récords y "última vez" salen de la hoja. El móvil solo guarda: la sesión en curso,
las sesiones pendientes de enviar (hasta que la hoja las confirma) y una copia de solo
lectura para consultar todo sin internet (se actualiza descargando solo lo que cambia).

## Cómo está montado

```
Drive del administrador
└── EDUX TRAINING/
    ├── EDUX · Administración      ← hoja con el script central (pestaña Usuarios)
    └── Usuarios/
        ├── EDUX · Ana             ← hoja de cada usuario
        └── EDUX · …
```

- **Un solo script** (el de la hoja de Administración), publicado como aplicación web.
- Cada usuario tiene una **clave**. Su **enlace de conexión** (`…#conectar=…`) lleva la URL
  del script y su clave: al abrirlo, la app se conecta sola. Con esa clave el script solo abre su hoja.
- Los amigos **no tienen acceso a las hojas**: solo usan la app. Su rutina la escribe el administrador en su hoja.

## Archivos

| Archivo | Qué es |
|---|---|
| `index.html`, `style.css` | Estructura, juego de iconos y sistema de diseño "Noche violeta" (negro y morado) |
| `fuentes/` | Barlow y Barlow Condensed (licencia OFL), incluidas para funcionar sin internet |
| `cuerpo-datos.js`, `cuerpo.js` | Mapa muscular (frente y espalda). Dibujo de [react-native-body-highlighter](https://github.com/HichamELBSI/react-native-body-highlighter) (MIT, ver `licencias/`) |
| `app.js` | Base: navegación, Inicio, enlace de conexión, eventos y arranque |
| `sesion.js` | Entreno y resumen: series, sustitutos, series extra, tiempos, récords |
| `vistas.js` | Historial, Progreso, Perfil, Récords y Ajustes |
| `usuarios.js` | Panel de usuarios (solo administrador): altas, enlaces con QR, desactivar, clave nueva |
| `lib/qrcode.js` | [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) (MIT) para dibujar los QR |
| `almacen.js` | Qué se guarda en el móvil y utilidades de formato |
| `datos.js` | Calcula historial, evolución, récords y estadísticas a partir de la hoja |
| `rutina.js` | Convierte la rutina descargada de la hoja en sesiones, letras y músculos |
| `red.js` | Envío de sesiones, descarga incremental y conexión de la cuenta |
| `grafico.js` | Gráfico de evolución en SVG (sin librerías) |
| `descanso.js` | Temporizador de descanso y pantalla siempre encendida |
| `sw.js` | *Service worker*: guarda la app en el móvil para usarla sin internet |
| `manifest.webmanifest`, `icons/` | Permiten instalarla como una app |
| `apps-script/Code.gs` | **Script central**: va en la hoja de Administración |
| `apps-script/antiguo/Code.gs` | Script de la versión de un solo usuario (v1–v7), como referencia |
| `tests/` | Pruebas automáticas con un simulador de Google (hojas, Drive, email) y datos inventados |

## Hojas

**EDUX · Administración → pestaña `Usuarios`:** ID · Nombre · Email · Hoja · Clave · Rol · Activo · Alta ·
Último entreno · Último recordatorio · Recordatorio por el entreno del. La gestiona el script
(desde la app, Ajustes → Usuarios). Puedes corregir a mano el nombre o el email.

**Hoja de cada usuario** (la crea el script):

| Pestaña | Para qué |
|---|---|
| `Rutina` | **La rutina del usuario** (una fila por ejercicio): Sesión · Orden · Ejercicio · Series · Repeticiones · Descanso · Músculo principal · Músculos secundarios · Material |
| `Registro` | Una fila por serie: ID sesión · Fecha · Sesión · Ejercicio · Serie · Peso · Reps · Nota · Volumen · 1RM |
| `Sesiones` | Una fila por sesión: ID · Fecha · Sesión · Inicio · Duración · Series · Volumen · Origen · Enviada |
| `Tiempos` | Minutos de cada ejercicio (por ID de sesión) |
| `Perfil` | Nombre, fecha de nacimiento, altura, días del recordatorio e historial de peso |
| `Progreso` | Resumen por ejercicio (lo rehace el script; no hay fórmulas) |

En `Rutina`: las sesiones salen en el orden de la hoja (esa es la rotación). *Repeticiones* puede ser
una por serie (`6–8 / 8–10 / 8–10`) o una para todas (`8–12`). *Descanso*: `3 min`, `2,5 min` o `90 s`.
*Músculo principal* y *Material* tienen lista desplegable; los secundarios van separados por comas.
Músculos: Pecho, Espalda, Hombro, Bíceps, Tríceps, Antebrazo, Abdomen, Lumbar, Cuádriceps, Femoral,
Glúteo, Aductores y Gemelos. Si cambias la rutina, la app la recoge al actualizar (una sesión ya
empezada no cambia).

Si apuntas series a mano en `Registro` sin ID de sesión, la app las agrupa por fecha y sesión.

## Cómo funciona

1. Eliges la sesión (Inicio propone la siguiente de la rotación) y apuntas kg y reps de cada serie.
   - Los campos muestran en gris lo que hiciste la última vez; **✓** marca la serie y arranca el descanso.
   - **+ Serie** añade una serie extra; **⇄ Sustituir** cambia el ejercicio solo para esa sesión.
   - Todo se guarda en el móvil al momento: si se cierra la app, vuelves directo a la sesión.
2. **Terminar sesión** muestra un resumen. Al guardar, la sesión pasa a la cola de envío.
3. El script la escribe en `Registro`, `Sesiones` y `Tiempos` de tu hoja (y rehace `Progreso`).
4. Sin internet, la sesión queda **pendiente** y se envía sola cuando vuelve la conexión.
   Cada sesión tiene un identificador y el script ignora las repetidas: nunca se duplica.

## Instalación (administrador, una sola vez)

### 1. Hoja de Administración y script

1. En Google Drive crea una hoja de cálculo nueva y llámala **EDUX · Administración**.
2. **Extensiones → Apps Script**. Borra lo que haya en `Código.gs`, pega [`apps-script/Code.gs`](apps-script/Code.gs) y guarda (💾).
3. **⚙ Configuración del proyecto** → *Zona horaria*: `(GMT+01:00) Madrid`.
4. **Implementar → Nueva implementación** → tipo (⚙) **Aplicación web**:
   *Ejecutar como*: **Yo** · *Quién tiene acceso*: **Cualquier usuario** → **Implementar**.
   - Google pedirá permisos: *Revisar permisos* → tu cuenta → *Configuración avanzada* →
     *Ir a … (no seguro)* → *Permitir*. Es normal: el script es tuyo y no está verificado por Google.
     Pide acceso a hojas, Drive (para crear las hojas de los usuarios en su carpeta) y enviar emails.
   - Copia la **URL de la aplicación web** (termina en `/exec`).

> "Cualquier usuario" es necesario para que la app pueda llamar al script sin iniciar sesión.
> Sin una clave válida el script no abre ninguna hoja.

### 2. Página de instalación

Abre la **URL de la aplicación web** (la que termina en `/exec`) en el navegador, con tu cuenta de Google.
Es una página con tres pasos que **solo funciona para el dueño del script** (a cualquier otra persona
le dice que no es para ella):

1. **Instalar**: escribe tu nombre (la URL ya viene puesta). Crea las carpetas `EDUX TRAINING/Usuarios`,
   tu usuario (administrador) y tu hoja, y te envía por email tu **enlace de conexión**.
2. **Migrar tu hoja antigua** (solo si venías de la versión de un solo usuario): pega la URL de la
   hoja antigua. Copia rutina (con músculos y material), series, sesiones, días de asistencia, tiempos,
   perfil y peso. La hoja antigua no se toca. Se puede repetir: cada vez vacía tu hoja nueva y vuelve a copiar.
3. **Emails automáticos**: cada usuario activo con email recibe
   - el **resumen semanal** (lunes hacia las 7:00), con sus sesiones, récords y series por músculo;
   - un **recordatorio** (hacia las 18:00) si lleva los días de su Perfil sin entrenar (7 por defecto,
     0 = desactivado; se cambia en la app, Perfil → Editar datos). Solo uno por parón.

La página también sirve después para reenviarte el enlace o probar el resumen semanal.
(Si en la hoja de Administración aparece el menú **EDUX**, tiene las mismas opciones.)

Si venías de la versión de un solo usuario, en el Apps Script de la **hoja antigua** ejecuta
`desactivarResumenSemanal` (si no, te llegarían dos resúmenes) y, en *Implementar → Gestionar
implementaciones*, archiva su implementación.

### 3. Comprobar

Abre la hoja de Administración (enlace en la página): la pestaña `Usuarios` tiene tu fila, y tu hoja
está en `EDUX TRAINING/Usuarios`.

### 4. Publicar la app (GitHub Pages)

**Settings → Pages → Source: Deploy from a branch → `main` / `(root)`**. Queda en
`https://edumoal.github.io/SEGUIMINETO_GIMNASIO/`.

### 5. En el móvil

Abre el **enlace de conexión** del email en **Chrome** y después **⋮ → Instalar aplicación**.
La app ya queda conectada a tu cuenta. (Si ya la tenías instalada: abre la app, pulsa *Actualizar*
si lo pide y luego abre el enlace.)

No borres los "datos de sitios" de Chrome o perderás las sesiones no enviadas.

## Añadir amigos

En la app: **Ajustes → Usuarios → Añadir usuario** (nombre y, si quieres, email).
El script crea su hoja en `EDUX TRAINING/Usuarios` y muestra su enlace con un **código QR**
(para escanearlo con la cámara), botones para copiarlo o compartirlo, y opción de enviárselo por email.

Después, rellena su pestaña `Rutina` (botón *Hoja* en su tarjeta). Él solo verá la app.
- **Desactivar**: deja de poder usar la app (su hoja no se borra).
- **Nueva clave**: su enlace anterior deja de funcionar; dale el nuevo.

## Actualizar el script (cuando cambie `Code.gs`)

1. **Extensiones → Apps Script** de la hoja de Administración, sustituye todo el código y guarda.
2. **Implementar → Gestionar implementaciones → ✏️ → Versión: Nueva versión → Implementar**.

Así se mantiene la misma URL y los enlaces de todos siguen valiendo.

## Hacer cambios en la app

1. Edita los archivos.
2. **Sube el número de `VERSION` en `sw.js`**. Si no, el móvil seguirá usando la versión guardada.
3. Haz *commit* y *push*. Al abrir la app con internet aparece **"Nueva versión disponible · Actualizar"**.

Para probar en el ordenador: `python3 -m http.server 8000` en esta carpeta y abre `http://localhost:8000`.

## Pruebas automáticas

En cada cambio que se sube a `main`, GitHub ejecuta las pruebas (pestaña **Actions**).
Usan un simulador de Google (hojas, Drive, emails y activadores) que ejecuta el `Code.gs` real,
con **datos inventados**: varios usuarios, descarga incremental, emails y migración de una hoja antigua.

Para ejecutarlas en un ordenador: `cd tests && npm install && npx playwright install chromium && node ejecutar.js`
(o `node ejecutar.js multiusuario` para una sola batería).
