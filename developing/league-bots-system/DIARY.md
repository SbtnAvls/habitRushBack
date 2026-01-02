# Diario de Desarrollo - League Bots System

## 2026-01-02 - Inicio del Desarrollo

### Decisión
Sistema de ligas competitivas semanales con bots de relleno para mantener 20 competidores por liga. Inspirado en Duolingo.

### Contexto Inicial
- Tablas ya existen: LEAGUES, LEAGUE_WEEKS, LEAGUE_COMPETITORS, USER_LEAGUE_HISTORY
- Endpoints de lectura ya implementados: GET /leagues/current, GET /users/me/league-history
- Falta: lógica de población, bots, y procesamiento semanal

## 2026-01-02 - Desarrollo Completado

### Implementación
- 4 fases completadas en una sesión
- 6 archivos nuevos creados
- Sistema funcional end-to-end

### Decisiones de Diseño
1. **Perfiles de bots**: 4 tipos (lazy/casual/active/hardcore) para simulación realista
2. **Promoción/Descenso**: Top 3 suben, Bottom 3 bajan (proporcional en grupos pequeños)
3. **Endpoints admin manuales**: Sin cron jobs automáticos por ahora
4. **Múltiples grupos por liga**: Campo `league_group` para matchmaking por XP similar
5. **Admin API Key**: Header `X-Admin-Key` para proteger endpoints admin

## 2026-01-02 - Code Reviews y Fixes

### Bugs Críticos Corregidos
- User XP no sincronizaba a LEAGUE_COMPETITORS → sync antes de actualizar posiciones
- Race condition con @pos → envuelto en transacción
- SQL injection en batch update → revertido a queries parametrizadas

### Bugs Medios Corregidos
- Bot profile no persistente → guardado en DB
- Relegación en grupos pequeños → lógica proporcional
- processWeekEnd sin transacción → agregada transacción
- Validación weeksToKeep → check NaN explícito

### Mejoras de Código
- Type annotations corregidos (ResultSetHeader)
- Date mutation fix en getCurrentMonday
- Constraint violation handling mejorado

## 2026-01-02 - Review Fase 2

### Bugs Corregidos
- `updateLeagueGroupPositions` sin transacción → añadida transacción con rollback
- Type safety: `(syncResult as any)` → `ResultSetHeader` tipado correctamente
- Colisión nombres con sufijo → verificación + fallback a UUID
- Empates XP sin desempate → añadido `ORDER BY weekly_xp DESC, id ASC`

### Bugs Bajos (No corregidos - opcionales)
- GROUP_CONCAT podría truncarse con grupos grandes
- Función `syncRealUsersXp` duplicada (DRY)
- Stats de botsUpdated excluye bots con 0 XP
- Sin validación de leagueWeekId existente

## 2026-01-02 - Review Fase 3

### Bugs Corregidos
- LIMIT en subquery sin derived table → añadido wrapper `SELECT id FROM (...) as recent`
- Idempotencia: añadido campo `processed` en LEAGUE_WEEKS + verificación antes de procesar
- Transacciones unificadas: `updateAllLeaguePositions` ahora acepta conexión externa
- Controller actualizado: retorna early si ya fue procesada, solo resetea XP si procesó

### Migración Añadida
- `migrations/005_league_week_processed.sql` - Campo `processed` BOOLEAN

### Bugs Bajos (No corregidos - opcionales)
- `resetWeeklyXp` fuera de transacción principal (ahora protegido por idempotencia)

## 2026-01-02 - Review Fase 4

### Bugs Corregidos
- Length leak en constant-time comparison → SHA-256 hash + `crypto.timingSafeEqual`

## 2026-01-02 - Integración XP ↔ Ligas

### Bug Corregido
- Matchmaking usaba `u.weekly_xp` que ya estaba reseteado a 0
- Fix: Usar `ulh.weekly_xp` (XP de semana anterior desde USER_LEAGUE_HISTORY)
- Ahora `ORDER BY COALESCE(ulh.weekly_xp, 0) DESC` para agrupar por XP similar

## Sistema Completado
- 4 fases implementadas
- 4 code reviews completos (todas las fases)
- Build sin errores
- Listo para producción
