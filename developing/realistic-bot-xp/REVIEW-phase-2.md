# Revision Fase 2 - Realistic Bot XP Simulation

## 1. Resumen de lo que se hizo

- Nuevos campos en LEAGUE_COMPETITORS via migracion 011: `daily_xp_today`, `daily_xp_target`, `last_xp_reset_date`
- Funcion `resetDailyBotXp()`: resetea tracking diario y asigna target aleatorio por perfil
- Funcion `simulateBotHabitCompletion()`: simula completar habitos con probabilidad horaria, respetando limite diario
- Funcion `getBotDailyProgress()`: estadisticas de monitoreo
- Recalculo de `hourlyActivityChance` para que los valores sean matematicamente coherentes con habitos esperados por dia

## 2. Riesgos detectados

### CRITICO - Conflicto de numeracion de migraciones
- Existen DOS archivos `011_*.sql`:
  - `migrations/011_add_google_auth.sql` (Google OAuth)
  - `migrations/011_bot_daily_xp_tracking.sql` (esta fase)
- Esto causara problemas si se ejecutan en orden incorrecto o si hay herramientas de migracion automaticas

### CRITICO - Scheduler no usa las nuevas funciones
- `league-scheduler.service.ts` sigue usando `simulateDailyBotXp()` (metodo legacy)
- Las nuevas funciones `resetDailyBotXp()` y `simulateBotHabitCompletion()` NO estan integradas
- El scheduler ejecuta una vez al dia a las 00:10, no cada 30-60 min como requiere el nuevo sistema
- Esto significa que el nuevo codigo es "dead code" hasta Fase 4

### ALTO - Modelo TypeScript desactualizado
- `/src/models/league-competitor.model.ts` no incluye los nuevos campos:
  - Falta `daily_xp_today`
  - Falta `daily_xp_target`
  - Falta `last_xp_reset_date`
- Queries funcionaran pero sin type-safety para los campos nuevos

### ALTO - Schema principal no actualizado
- `habitRush_mysql.sql` no tiene los campos de la migracion 011
- Si alguien recrea la BD desde cero, no tendra los campos necesarios

### MEDIO - Sin tests unitarios
- No existen tests para `resetDailyBotXp()`, `simulateBotHabitCompletion()`, ni `getBotDailyProgress()`
- Es dificil verificar correctitud sin pruebas automatizadas

### MEDIO - Timezone y date handling
- `getTodayDateString()` usa `new Date().toISOString().split('T')[0]` que es UTC
- Si el servidor esta en timezone diferente, el "dia" puede no coincidir con la medianoche local
- Esto puede causar que bots se reseteen a horas inesperadas

### BAJO - Potencial N+1 en resetDailyBotXp()
- La funcion itera sobre cada bot y hace un UPDATE individual dentro de un loop
- Con muchos bots (ej: 1000+), esto puede ser lento
- Podria optimizarse con CASE/WHEN o batch updates agrupados por perfil

### BAJO - Indice podria ser mas especifico
- El indice `idx_league_competitors_bot_daily` no incluye `daily_xp_target` ni `daily_xp_today`
- Los queries de `simulateBotHabitCompletion()` filtran por estos campos, podrian beneficiarse de un indice compuesto mas completo

## 3. Preguntas dificiles

1. **Cuando se ejecutara el cron de Fase 4?** - El codigo nuevo no se usa porque el scheduler actual (00:10 una vez/dia) llama a `simulateDailyBotXp()`. Si se deploya este codigo sin actualizar el scheduler, los bots seguiran recibiendo XP de golpe.

2. **Que pasa si `resetDailyBotXp()` falla a medianoche?** - Los bots quedarian sin `last_xp_reset_date = today` y `simulateBotHabitCompletion()` no les daria XP ese dia. No hay mecanismo de recuperacion ni alertas.

3. **Como se maneja la transicion de bots existentes?** - Bots creados antes de la migracion tendran `last_xp_reset_date = NULL`. El sistema los trata como "no inicializados", pero nunca se inicializaran automaticamente fuera del ciclo de reset.

4. **Timezone: que hora es "medianoche"?** - UTC? Timezone del servidor? Timezone del usuario? Si el servidor esta en UTC pero los usuarios en America, el reset ocurre a las 7pm hora local.

5. **Atomicidad del sistema completo:** - Si `simulateBotHabitCompletion()` falla a mitad de ejecucion (despues de actualizar algunos bots), la transaccion hace rollback. Pero si se ejecuta multiples veces por hora, puede haber inconsistencias entre ejecuciones.

## 4. Sugerencias de cambios

| Prioridad | Archivo | Cambio sugerido |
|-----------|---------|-----------------|
| CRITICO | migrations/ | Renumerar `011_bot_daily_xp_tracking.sql` a `012_bot_daily_xp_tracking.sql` |
| ALTO | src/models/league-competitor.model.ts | Agregar `daily_xp_today`, `daily_xp_target`, `last_xp_reset_date` a la interface |
| ALTO | habitRush_mysql.sql | Agregar los 3 campos y el indice a la tabla LEAGUE_COMPETITORS |
| MEDIO | src/services/league-bot.service.ts | Usar batch UPDATE con CASE/WHEN en `resetDailyBotXp()` en lugar de loop |
| MEDIO | src/services/league-bot.service.ts | Documentar que timezone asume el sistema (y/o hacerlo configurable) |
| BAJO | migrations/011_bot_daily_xp_tracking.sql | Considerar indice compuesto que incluya `daily_xp_target` |

## 5. Verificaciones recomendadas

### Antes de cerrar Fase 2:
- [ ] Renumerar migracion a 012 (o eliminar conflicto)
- [ ] Actualizar `league-competitor.model.ts` con campos nuevos
- [ ] Actualizar `habitRush_mysql.sql` con campos nuevos
- [ ] Ejecutar migracion en BD de desarrollo

### Tests manuales sugeridos:
- [ ] Llamar `resetDailyBotXp(weekId)` y verificar que asigna targets coherentes
- [ ] Llamar `simulateBotHabitCompletion(weekId)` multiples veces y verificar que XP se acumula hasta el limite
- [ ] Verificar que `getBotDailyProgress()` retorna estadisticas correctas
- [ ] Verificar comportamiento con bots legacy (sin profile o con `last_xp_reset_date = NULL`)

### Tests automatizados a crear (Fase 5):
- [ ] Test: resetDailyBotXp asigna target dentro del rango del perfil
- [ ] Test: simulateBotHabitCompletion no excede daily_xp_target
- [ ] Test: bots con daily_xp_target=0 (skipping) no reciben XP
- [ ] Test: bots no inicializados no reciben XP de simulateBotHabitCompletion

---
Revision realizada: 2026-01-18
Estado: **Necesita cambios** antes de continuar a Fase 3
