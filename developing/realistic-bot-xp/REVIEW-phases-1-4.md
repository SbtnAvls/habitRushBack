# Revision Fases 1-4 - Realistic Bot XP

## Resumen de lo que se hizo

### Fase 1: Perfiles de bots refactorizados
- Nueva interfaz `BotProfileConfig` con campos para simulacion granular
- Cuatro perfiles (lazy, casual, active, hardcore) con valores ajustados
- Bots inician con `weekly_xp = 0` (XP se acumula incrementalmente)

### Fase 2: Sistema de acumulacion incremental
- Migracion 012 con columnas `daily_xp_today`, `daily_xp_target`, `last_xp_reset_date`
- `resetDailyBotXp()`: Reset diario a las 00:00
- `simulateBotHabitCompletion()`: Simulacion cada 30-45 min
- `getBotDailyProgress()`: Monitoreo de estado

### Fase 3: Patrones de actividad humana
- `HOURLY_ACTIVITY_WEIGHTS`: Pesos por hora (0-23)
- `hashStringToNumber()`: Hash deterministico para variacion por bot
- `getActivityProbability()`: Calcula probabilidad con offset y varianza
- Doble filtro: patron horario + probabilidad del perfil

### Fase 4: Scheduler con ejecucion frecuente
- Reset diario a las 00:00 via `runDailyBotReset()`
- Simulacion cada 30-45 min durante horas activas (7am-11pm)
- Limpieza correcta de timers en `stop()`
- Funciones de trigger manual para testing

---

## BUGS CRITICOS

### BUG-1: Race condition en simulateBotHabitCompletion() - CRITICO

**Ubicacion:** `src/services/league-bot.service.ts`, lineas 622-723

**Problema:** La funcion lee el estado del bot (`daily_xp_today`, `daily_xp_target`) y luego actualiza, pero entre la lectura y la escritura otro proceso puede haber modificado el valor.

```typescript
// Linea 682-685: Lee valores
const currentDailyXp = bot.daily_xp_today as number;
const dailyTarget = bot.daily_xp_target as number;
const remainingToTarget = dailyTarget - currentDailyXp;

// Linea 693-699: Actualiza sin verificar que el valor no cambio
await connection.query(
  `UPDATE LEAGUE_COMPETITORS
   SET daily_xp_today = daily_xp_today + ?, ...`
);
```

**Consecuencia:** Un bot podria exceder su `daily_xp_target` si dos ejecuciones del scheduler se superponen (poco probable pero posible con intervalos aleatorios).

**Solucion:** Agregar `WHERE daily_xp_today + ? <= daily_xp_target` en el UPDATE o usar `SELECT FOR UPDATE` al leer los bots.

---

### BUG-2: Timeout inicial de startPositionUpdateJob() no se guarda - MEDIO

**Ubicacion:** `src/services/league-scheduler.service.ts`, lineas 182-198

**Problema:** El `setTimeout` inicial no se guarda en ninguna variable, por lo que `stop()` no lo puede cancelar.

```typescript
private startPositionUpdateJob(): void {
  // ...
  setTimeout(() => {  // <-- Este timeout no se guarda
    this.runPositionUpdates();
    this.positionUpdateInterval = setInterval(...);
  }, timeUntilPositions);
}
```

**Consecuencia:** Si se llama a `stop()` antes de las 08:00, el timeout sigue corriendo y ejecutara `runPositionUpdates()` de todas formas.

**Solucion:** Guardar el timeout inicial en una variable de instancia y limpiarlo en `stop()`.

---

### BUG-3: Timezone no especificado - getHours() usa timezone local - MEDIO

**Ubicacion:** `src/services/league-bot.service.ts` (lineas 527-529, 616) y `src/services/league-scheduler.service.ts` (lineas 92-101, 115-118, 321-323)

**Problema:** Se usa `new Date().getHours()` y `new Date().toISOString().split('T')[0]` en diferentes lugares. `getHours()` devuelve la hora LOCAL del servidor, mientras que `toISOString()` devuelve fecha UTC.

```typescript
// league-bot.service.ts
function getTodayDateString(): string {
  return new Date().toISOString().split('T')[0];  // UTC
}

// league-scheduler.service.ts
private isActiveHour(): boolean {
  const hour = new Date().getHours();  // LOCAL
  return hour >= 7 && hour <= 23;
}
```

**Consecuencia:**
1. Un bot podria tener su `last_xp_reset_date` en UTC pero ser evaluado con hora local.
2. Si el servidor esta en UTC y los usuarios en UTC-5, a las 00:00 UTC (7pm local) se resetean los bots pero es "de dia" para los usuarios.
3. Inconsistencias entre cuando se considera "horas activas" y cuando se resetea el dia.

**Solucion:** Definir explicitamente el timezone del servidor o convertir todo a UTC. Documentar cual se usa.

---

## BUGS MEDIOS

### BUG-4: Timeout de monthly cleanup usa intervalo fijo de 30 dias - MENOR

**Ubicacion:** `src/services/league-scheduler.service.ts`, lineas 235-240

**Problema:** Despues del primer cleanup, se usa `setInterval(..., 30 * 24 * 60 * 60 * 1000)` que son exactamente 30 dias. Esto hara que el cleanup se desface del dia 1 de cada mes.

```typescript
this.monthlyInterval = setInterval(() => {
  this.runMonthlyCleanup();
}, 30 * 24 * 60 * 60 * 1000);  // Siempre 30 dias
```

**Consecuencia:** En febrero (28 dias) se ejecutara 2 dias tarde. En meses de 31 dias se ejecutara 1 dia antes. Despues de un ano estara muy desfasado.

**Solucion:** Recalcular el tiempo hasta el proximo dia 1 despues de cada ejecucion, similar a como se hace con el reset diario.

---

### BUG-5: botsAtLimit se incrementa dos veces en algunos casos - MENOR

**Ubicacion:** `src/services/league-bot.service.ts`, lineas 687-707

**Problema:** El contador `botsAtLimit` se incrementa cuando `actualXpGain <= 0` (linea 688-689) Y tambien cuando el bot alcanza el limite despues de ganar XP (linea 705-707).

```typescript
if (actualXpGain <= 0) {
  botsAtLimit++;  // Primera vez
  continue;
}

// ... actualiza XP ...

if (currentDailyXp + actualXpGain >= dailyTarget) {
  botsAtLimit++;  // Segunda vez (para bots que acaban de alcanzar el limite)
}
```

**Consecuencia:** El valor retornado de `botsAtLimit` es correcto (cuenta bots que YA estaban en limite + bots que LLEGARON al limite en esta ejecucion), pero el nombre es confuso. No es un bug funcional, pero dificulta el debugging.

**Solucion:** Separar en dos contadores: `botsAlreadyAtLimit` y `botsReachedLimit`.

---

### BUG-6: Variable no usada `ACTIVE_HOURS_PER_DAY` - CODIGO MUERTO

**Ubicacion:** `src/services/league-bot.service.ts`, linea 36

```typescript
const ACTIVE_HOURS_PER_DAY = 15;  // Nunca se usa en el codigo
```

**Consecuencia:** Codigo muerto. El valor 15 esta hardcodeado en los comentarios de los perfiles pero no se usa programaticamente.

**Solucion:** Eliminar la constante o usarla en los calculos de `hourlyActivityChance`.

---

## PROBLEMAS DE DISENO

### DESIGN-1: No hay recuperacion de bots no inicializados durante el dia

**Problema:** Si `resetDailyBotXp()` falla o no se ejecuta a las 00:00, los bots quedan con `last_xp_reset_date = NULL` o fecha anterior. `simulateBotHabitCompletion()` los ignora todo el dia.

**Ubicacion:** `src/services/league-bot.service.ts`, lineas 622-631

```typescript
const [bots] = await db.query<RowDataPacket[]>(
  `SELECT ... WHERE ...
   AND last_xp_reset_date = ?  // Solo bots inicializados HOY
   AND daily_xp_target > 0
   AND daily_xp_today < daily_xp_target`,
  [leagueWeekId, today]
);
```

**Consecuencia:** Si hay un error a las 00:00, ningun bot gana XP ese dia.

**Solucion:** Agregar logica de auto-inicializacion en `simulateBotHabitCompletion()` o un job de recuperacion que corra cada hora.

---

### DESIGN-2: No hay mecanismo de "catch-up" para horas perdidas

**Problema:** Si el servidor se reinicia a las 15:00, los bots pierden toda la actividad de 7:00-15:00. El sistema no compensa.

**Consecuencia:** En dias con reinicios, los bots tendran XP anormalmente bajo.

**Solucion:** Guardar `last_simulation_time` y calcular cuantas "rondas" se perdieron al iniciar.

---

### DESIGN-3: Logging puede ser excesivo en produccion

**Ubicacion:** `src/services/league-scheduler.service.ts`, multiples lineas

**Problema:** Cada 30-45 minutos se loguea informacion aunque no haya actividad significativa. En 24 horas son 30-40 logs solo del bot simulation.

**Consecuencia:** Logs llenos de mensajes no criticos.

**Solucion:** El codigo ya tiene logica para solo loguear si `result.botsUpdated > 0`. Verificar que funciona correctamente.

---

## VERIFICACIONES PENDIENTES

### 1. Migracion aplicada en base de datos
- [ ] Verificar que la migracion 012 se ejecuto correctamente
- [ ] Verificar que el indice `idx_league_competitors_bot_daily` existe
- [ ] Verificar que los bots existentes tienen `last_xp_reset_date = NULL`

### 2. Tests manuales necesarios
- [ ] Ejecutar `triggerDailyBotReset()` y verificar que los bots tienen targets
- [ ] Ejecutar `triggerBotHabitSimulation()` varias veces y verificar incremento gradual
- [ ] Verificar que `getBotDailyProgress()` retorna estadisticas correctas
- [ ] Probar `stop()` y `start()` del scheduler

### 3. Tests unitarios faltantes
- [ ] Test de `resetDailyBotXp()` con diferentes perfiles
- [ ] Test de `simulateBotHabitCompletion()` respeta limites
- [ ] Test de `getActivityProbability()` con diferentes horas y botIds
- [ ] Test de integracion scheduler completo

---

## SUGERENCIAS DE MEJORA

### 1. Agregar transaccion con FOR UPDATE en simulateBotHabitCompletion

```typescript
// Cambiar linea 622-630 a:
const [bots] = await connection.query<RowDataPacket[]>(
  `SELECT ... FOR UPDATE`, // Lock los rows
  [leagueWeekId, today]
);
```

### 2. Unificar timezone

```typescript
// Crear helper centralizado
function getNow(): Date {
  // Decide: UTC o timezone especifico
  return new Date(); // Documentar cual es
}

function getTodayString(): string {
  const now = getNow();
  // Usar consistentemente
}
```

### 3. Guardar timeout inicial de position updates

```typescript
private positionUpdateTimeout: NodeJS.Timeout | null = null;

private startPositionUpdateJob(): void {
  this.positionUpdateTimeout = setTimeout(() => {
    // ...
  }, timeUntilPositions);
}

stop(): void {
  if (this.positionUpdateTimeout) {
    clearTimeout(this.positionUpdateTimeout);
    this.positionUpdateTimeout = null;
  }
  // ... resto
}
```

### 4. Agregar auto-inicializacion de bots

```typescript
// Al inicio de simulateBotHabitCompletion:
const [uninitializedBots] = await db.query(...);
if (uninitializedBots.length > 0) {
  console.warn(`[BotSimulation] ${uninitializedBots.length} bots not initialized, running late reset...`);
  await resetDailyBotXp(leagueWeekId);
}
```

---

## CHECKLIST DE CORRECCIONES

### Criticas (bloquean produccion)
- [ ] Corregir race condition en simulateBotHabitCompletion (BUG-1)

### Altas (corregir pronto)
- [ ] Guardar timeout inicial de position updates (BUG-2)
- [ ] Documentar/unificar timezone usado (BUG-3)

### Medias (corregir cuando sea posible)
- [ ] Arreglar intervalo de monthly cleanup (BUG-4)
- [ ] Separar contadores de botsAtLimit (BUG-5)
- [ ] Eliminar constante no usada (BUG-6)

### Mejoras (nice-to-have)
- [ ] Agregar auto-inicializacion de bots (DESIGN-1)
- [ ] Agregar mecanismo de catch-up (DESIGN-2)
- [ ] Agregar tests unitarios

---

## VEREDICTO

**Estado: NECESITA CAMBIOS**

El codigo implementa correctamente la funcionalidad requerida y el proyecto compila sin errores. Sin embargo, hay un bug critico de race condition que podria causar que los bots excedan sus limites diarios. Ademas, los problemas de timezone pueden causar comportamiento inconsistente dependiendo de donde corre el servidor.

Recomiendo corregir BUG-1, BUG-2 y BUG-3 antes de considerar las fases 1-4 como completamente terminadas.
