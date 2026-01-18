# Fase 1 - Refactorizar perfiles de bots

## Objetivo
Ajustar BOT_PROFILES con limites diarios mas realistas y agregar campo para tracking de XP acumulado en el dia.

## Archivos a modificar
- src/services/league-bot.service.ts

## Cambios especificos

### 1. Nuevos limites en BOT_PROFILES
```typescript
const BOT_PROFILES: Record<BotProfile, BotProfileConfig> = {
  lazy: { dailyXpMin: 0, dailyXpMax: 30, skipDayChance: 0.4 },
  casual: { dailyXpMin: 30, dailyXpMax: 80, skipDayChance: 0.15 },
  active: { dailyXpMin: 80, dailyXpMax: 150, skipDayChance: 0.05 },
  hardcore: { dailyXpMin: 150, dailyXpMax: 250, skipDayChance: 0.02 },
};
```

### 2. Agregar interface para config de micro-simulacion
```typescript
interface BotProfileConfig {
  dailyXpMin: number;
  dailyXpMax: number;
  skipDayChance: number;
  // Nuevos campos para simulacion realista
  avgHabitsPerDay: number;      // promedio de habitos/dia
  xpPerHabitMin: number;        // XP minimo por habito
  xpPerHabitMax: number;        // XP maximo por habito
}
```

### 3. Nuevos valores con granularidad por habito
- lazy: 1-3 habitos/dia, 5-15 XP/habito
- casual: 3-6 habitos/dia, 8-20 XP/habito
- active: 5-10 habitos/dia, 10-25 XP/habito
- hardcore: 8-15 habitos/dia, 15-35 XP/habito

## Pasos
1. Modificar interface BotProfileConfig
2. Actualizar constante BOT_PROFILES con nuevos valores
3. Eliminar logica legacy de XP de golpe en fillLeagueGroupWithBotsTx (initialXp = 0)
4. Verificar que no rompe fillAllLeaguesWithBots

## Verificacion
- npm run build (sin errores de tipos)
- Los nuevos bots deben crearse con weekly_xp = 0

## Criterio de completado
- [x] BotProfileConfig tiene campos para simulacion granular (avgHabitsPerDayMin/Max, xpPerHabitMin/Max, hourlyActivityChance)
- [x] BOT_PROFILES tiene valores ajustados (lazy 10-40, casual 30-80, active 80-150, hardcore 150-250)
- [x] Bots nuevos inician con XP = 0 (initialXp = 0 en fillLeagueGroupWithBotsTx)
- [x] Build pasa sin errores (npm run build OK)

## Estado: COMPLETADA (2026-01-18)
