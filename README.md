# Seguimiento gimnasio

App para Android (PWA) para apuntar pesos y repeticiones de la rutina PPL + torso.
Funciona sin internet y, al terminar cada sesión, envía las series a la hoja
**"Seguimiento entreno – PPL + torso"** (pestaña `Registro`) en Google Drive.

## Archivos

| Archivo | Qué es |
|---|---|
| `index.html`, `style.css` | Estructura y aspecto de la app |
| `app.js` | Toda la lógica: pantallas, guardado automático y envío |
| `rutina.js` | La rutina, copiada exactamente de la pestaña `Rutina` |
| `sw.js` | *Service worker*: guarda la app en el móvil para usarla sin internet |
| `manifest.webmanifest`, `icons/` | Permiten instalarla como una app |
| `apps-script/Code.gs` | Script que va **dentro de la hoja de Google** y recibe las sesiones |

## Cómo funciona

1. Eliges la sesión (Empuje, Tirón, Pierna o Fullbody) y apuntas kg y reps de cada serie.
   Todo se guarda en el móvil al momento: si cierras la app, sigue ahí.
2. **Terminar y enviar** muestra un resumen. Al confirmar, la sesión pasa a la cola de envío.
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

Si algún día cambias `Code.gs`: **Implementar → Gestionar implementaciones → ✏️ → Versión: Nueva versión**.
Así se mantiene la misma URL.

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
