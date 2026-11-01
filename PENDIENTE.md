# Ideas y planes pendientes

## Multiusuario (amigos usando la app)

**Decisión:** una hoja de cálculo por persona. La app (GitHub Pages) es la misma para todos;
cada móvil guarda solo la URL y la clave de **su** hoja.

Las hojas de los amigos estarán en el Drive de Edu (cada una en su carpeta, p. ej. `EDUX/Nombre`).
Consecuencias de que estén todas en la misma cuenta:

- Los scripts de todas las hojas se ejecutan como Edu → comparten los límites diarios de
  Apps Script de su cuenta (de sobra para unos pocos usuarios).
- **El email semanal** hoy se envía al dueño de la hoja (`Session.getEffectiveUser()`):
  con este esquema todos los resúmenes llegarían a Edu. Hay que añadir un campo `Email`
  en la pestaña Perfil y enviar a esa dirección.
- Los amigos no necesitan cuenta de Google para usar la app. Si quieren ver su hoja,
  Edu puede compartírsela solo a ellos.
- Edu puede ver los datos de todos: avisarles antes. Si alguno deja la app, se le
  transfiere la propiedad de su hoja o se le da una copia.
- Actualizar el script: como todos son de la misma cuenta, conviene una **biblioteca**
  de Apps Script compartida; cada hoja solo tendría un script mínimo que la llama, y al
  actualizar la biblioteca se actualizan todas.

### Cambios necesarios en la app y el script

1. Leer la rutina de la pestaña `Rutina` de cada hoja (no de `rutina.js`).
2. Columnas nuevas en `Rutina`: músculo principal y secundarios de cada ejercicio
   (mapa muscular, series por músculo y email).
3. Sesiones no fijas: nombres, rotación y letras del calendario salen de la hoja.
4. Hoja plantilla limpia con el script incluido (Archivo → Hacer una copia).
5. Configuración con un toque: enlace/QR con URL y clave en el fragmento `#` (no llega a ningún servidor).
6. Aviso en la app cuando el script de una hoja esté desactualizado.
7. Email semanal a la dirección del Perfil.
8. En iPhone la app funciona, pero no vibra al acabar el descanso.

## Mejoras propuestas (aún no elegidas)

Recomendadas para la próxima tanda: 1, 2, 7, 12, 13.

1. Aviso de versión nueva con botón "Actualizar".
2. Corregir o borrar sesiones guardadas desde Historial.
3. Deshacer (descartar sesión, quitar serie, desmarcar serie).
4. Descarga incremental de datos (para cuando haya años de registros).
5. Indicador de "sin conexión".
6. Pruebas automáticas en GitHub Actions.
7. Sugerencia de progresión (doble progresión).
8. Detector de estancamiento.
9. Superseries.
10. Versión corta de una sesión.
11. Calculadora de discos y series de calentamiento.
12. Metas con predicción de fecha.
13. Objetivo semanal de sesiones.
14. Fuerza relativa (marca / peso corporal).
15. Equilibrio muscular (empuje/tirón, cuádriceps/femoral).
16. Tendencia de series por músculo a lo largo de meses.
17. Medidas corporales en Perfil.
18. Entrenos en Google Calendar.
19. Recordatorio si no entrenas en X días.
20. Resumen mensual por email.
