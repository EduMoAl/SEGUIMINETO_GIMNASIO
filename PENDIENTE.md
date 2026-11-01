# Plan en curso

## Decisiones (acordadas con Edu)

1. **Script central** en el Drive de Edu para todos los usuarios (una URL; cada clave abre solo la hoja de su dueño).
2. **Panel de usuarios dentro de la app** (Ajustes → Usuarios, visible solo para el administrador).
3. **Hoja nueva para Edu**; la actual queda como copia de seguridad "(antigua)".
4. **Músculos:** Pecho, Espalda, Hombro, Bíceps, Tríceps, Cuádriceps, Femoral, Glúteo, Aductores + **Abdomen, Gemelos, Antebrazo, Lumbar**.
5. **Recordatorio:** email tras **7 días** sin entrenar (configurable por usuario en su Perfil), a las 18:00.
6. **Calentamiento:** barra vacía × 10, 40 % × 8, 60 % × 5, 80 % × 3. Barra de 20 kg; discos de 25, 20, 15, 10, 5, 2,5 y 1,25 kg.
7. **Los amigos solo usan la app**: no tienen acceso a su hoja.

## Fases

### Fase A — Calidad
- [x] 6. Pruebas automáticas en el repositorio (`tests/`, datos inventados) y en GitHub Actions.
- [x] 1. Aviso de versión nueva con botón "Actualizar".
- [x] 3. Deshacer (descartar sesión, quitar serie extra, sustituir ejercicio, borrar pendiente).
- [x] 5. Indicador "Sin conexión" y sesiones pendientes.

### Fase B — Multiusuario
- [x] Hoja nueva por usuario (la crea el script): Rutina (con músculos y material), Registro (con ID de sesión), Sesiones, Tiempos, Perfil (con recordatorio), Progreso (lo rehace el script).
- [x] Hoja de Administración (usuarios, claves, hoja de cada uno).
- [x] Script central: alta de usuarios, datos por clave, emails semanales y recordatorios para todos.
- [x] App: rutina leída de la hoja, sesiones dinámicas, conexión por enlace/QR, panel de usuarios.
- [x] 4. Descarga incremental (huella por sesión).
- [x] 19. Recordatorio por email tras 7 días sin entrenar.
- [x] Migración probada en local con los datos reales (169 series, 185 sesiones).
- [ ] Instalación en el Drive de Edu, migración y desactivar el script antiguo.
- [ ] Publicar la v8 en `main` (solo después de la migración).

### Fase C — Entrenamiento
- [ ] 8. Detector de estancamiento (3 sesiones sin mejorar la mejor marca).
- [ ] 11. Calculadora de discos y series de calentamiento (ejercicios con barra).

## Otras ideas (sin elegir)

2. Corregir o borrar sesiones guardadas desde Historial ·
7. Sugerencia de progresión ·
9. Superseries ·
10. Versión corta de una sesión ·
12. Metas con predicción de fecha ·
13. Objetivo semanal de sesiones ·
14. Fuerza relativa ·
15. Equilibrio muscular ·
16. Tendencia de series por músculo ·
17. Medidas corporales ·
18. Entrenos en Google Calendar ·
20. Resumen mensual por email.
