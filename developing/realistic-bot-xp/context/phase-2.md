# Fase 2 - Sistema de acumulacion incremental de XP

## Objetivo
Crear sistema para trackear XP diario acumulado por bot y funcion de micro-simulacion que da XP por "habito completado".

## Archivos a modificar
- src/services/league-bot.service.ts
- migrations/011_bot_daily_xp_tracking.sql (nuevo)

## Cambios especificos

### 1. Nueva tabla BOT_DAILY_XP (o campo en LEAGUE_COMPETITORS)
Opcion A - Campo adicional:
```sql
ALTER TABLE LEAGUE_COMPETITORS
ADD COLUMN daily_xp_today INT DEFAULT 0,
ADD COLUMN last_xp_date DATE DEFAULT NULL;
```

Opcion B - Tabla separada (mas limpio):
```sql
CREATE TABLE BOT_DAILY_XP (
  competitor_id VARCHAR(36) PRIMARY KEY,
  xp_today INT DEFAULT 0,
  target_xp INT DEFAULT 0,
  last_reset DATE,
  FOREIGN KEY (competitor_id) REFERENCES LEAGUE_COMPETITORS(id) ON DELETE CASCADE
);
```

### 2. Nueva funcion: simulateBotHabitCompletion()
```typescript
export async function simulateBotHabitCompletion(leagueWeekId: number): Promise<{
  botsUpdated: number;
  totalXpAdded: number;
}> {
  // 1. Obtener bots que aun no alcanzaron su limite diario
  // 2. Para cada bot, decidir si "completa un habito" ahora
  // 3. Dar XP segun perfil (xpPerHabitMin - xpPerHabitMax)
  // 4. Actualizar weekly_xp y daily_xp_today
  // 5. Retornar estadisticas
}
```

### 3. Funcion auxiliar: resetDailyBotXp()
```typescript
export async function resetDailyBotXp(leagueWeekId: number): Promise<number> {
  // Resetear daily_xp_today y establecer target aleatorio para el dia
  // Se ejecuta a las 00:00
}
```

## Pasos
1. Crear migracion SQL para tracking diario
2. Implementar simulateBotHabitCompletion()
3. Implementar resetDailyBotXp()
4. Agregar funcion para obtener progreso diario de un bot

## Verificacion
- Ejecutar migracion en DB de desarrollo
- Test manual: llamar simulateBotHabitCompletion() y verificar que da XP incremental
- Verificar que daily_xp_today no supera target

## Criterio de completado
- [x] Migracion creada (011_bot_daily_xp_tracking.sql) - pendiente aplicar en BD
- [x] simulateBotHabitCompletion() implementada
- [x] resetDailyBotXp() implementada
- [x] XP diario respeta limites del perfil (via daily_xp_target)
- [x] Build pasa sin errores
- [x] Valores de hourlyActivityChance corregidos matematicamente
