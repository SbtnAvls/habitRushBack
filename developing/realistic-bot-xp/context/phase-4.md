# Fase 4 - Nuevo scheduler con ejecucion frecuente

## Objetivo
Modificar LeagueSchedulerService para ejecutar simulacion de bots cada 30-60 minutos durante horas de actividad, en vez de 1x/dia.

## Archivos a modificar
- src/services/league-scheduler.service.ts

## Cambios especificos

### 1. Reemplazar job diario por job frecuente
Antes:
```typescript
// Bot XP simulation at 00:10 daily
setTimeout(() => {
  this.runDailyBotXpSimulation();
  this.dailyInterval = setInterval(() => {
    this.runDailyBotXpSimulation();
  }, 24 * 60 * 60 * 1000); // cada 24h
}, timeUntilBotXp);
```

Despues:
```typescript
// Bot XP simulation every 30-45 minutes
this.botSimulationInterval = setInterval(() => {
  this.runBotHabitSimulation();
}, this.getRandomInterval(30, 45) * 60 * 1000);

// Daily reset at 00:05
this.scheduleDailyBotReset();
```

### 2. Nueva funcion runBotHabitSimulation()
```typescript
private async runBotHabitSimulation(): Promise<void> {
  try {
    const currentWeek = await getCurrentLeagueWeek();
    if (!currentWeek) return;

    const result = await simulateBotHabitCompletion(currentWeek.id);

    // Solo loggear si hubo actividad
    if (result.botsUpdated > 0) {
      console.log(
        `[LeagueScheduler] Bot simulation: ${result.botsUpdated} habits, ${result.totalXpAdded} XP`
      );
    }
  } catch (error) {
    console.error('[LeagueScheduler] Error in bot simulation:', error);
  }
}
```

### 3. Job de reset diario
```typescript
private scheduleDailyBotReset(): void {
  const timeUntilReset = this.getTimeUntilHour(0, 5); // 00:05

  setTimeout(async () => {
    await this.runDailyBotReset();
    // Repetir cada 24h
    setInterval(() => this.runDailyBotReset(), 24 * 60 * 60 * 1000);
  }, timeUntilReset);
}

private async runDailyBotReset(): Promise<void> {
  const currentWeek = await getCurrentLeagueWeek();
  if (!currentWeek) return;

  const count = await resetDailyBotXp(currentWeek.id);
  console.log(`[LeagueScheduler] Daily bot reset: ${count} bots`);
}
```

### 4. Intervalo aleatorio para evitar patrones
```typescript
private getRandomInterval(minMinutes: number, maxMinutes: number): number {
  return Math.floor(Math.random() * (maxMinutes - minMinutes + 1)) + minMinutes;
}
```

## Pasos
1. Agregar imports de nuevas funciones (simulateBotHabitCompletion, resetDailyBotXp)
2. Crear startBotSimulationJobs() con intervalo frecuente
3. Crear scheduleDailyBotReset()
4. Actualizar start() y stop() con nuevos intervals
5. Eliminar codigo legacy de runDailyBotXpSimulation()

## Verificacion
- Server logs muestran simulacion cada ~30-45 min
- Reset diario ocurre a las 00:05
- Bots acumulan XP gradualmente durante el dia

## Criterio de completado
- [x] Intervalo frecuente configurado (30-45 min)
- [x] Reset diario a las 00:00
- [x] Logs apropiados sin spam
- [x] stop() limpia todos los intervals

## Implementacion Final

### Cambios realizados en league-scheduler.service.ts:

1. **Imports actualizados:**
   - Removido: `simulateDailyBotXp` (deprecado)
   - Agregados: `simulateBotHabitCompletion`, `resetDailyBotXp`, `getCurrentHourActivityInfo`

2. **Variables de instancia nuevas:**
   - `botSimulationInterval` - para simulacion frecuente
   - `dailyResetTimeout` - timeout inicial para reset a las 00:00
   - `dailyResetInterval` - intervalo de 24h para resets
   - `positionUpdateInterval` - separado del antiguo dailyInterval

3. **Nuevos metodos:**
   - `getRandomIntervalMs(min, max)` - genera intervalo aleatorio entre min y max minutos
   - `isActiveHour()` - verifica si estamos en horas activas (7am-11pm)
   - `startBotSimulationJobs()` - inicia reset diario + simulacion frecuente
   - `scheduleBotSimulation()` - programa siguiente simulacion con intervalo aleatorio
   - `startPositionUpdateJob()` - separado, solo para posiciones a las 08:00
   - `runDailyBotReset()` - ejecuta resetDailyBotXp()
   - `runBotHabitSimulation()` - ejecuta simulateBotHabitCompletion() con logging inteligente
   - `triggerBotHabitSimulation()` - para testing manual
   - `triggerDailyBotReset()` - para testing manual

4. **Metodos eliminados:**
   - `startDailyJobs()` - reemplazado por startBotSimulationJobs() + startPositionUpdateJob()
   - `runDailyBotXpSimulation()` - reemplazado por runBotHabitSimulation()
   - `triggerBotXpSimulation()` - reemplazado por triggerBotHabitSimulation()

5. **Comportamiento:**
   - Reset diario a las 00:00 (asigna targets a todos los bots)
   - Simulacion cada 30-45 min (intervalo aleatorio para evitar patrones)
   - Solo ejecuta simulacion durante horas activas (7am-11pm)
   - Logging inteligente: solo loguea si hubo actividad real
   - stop() limpia todos los nuevos timeouts/intervals
