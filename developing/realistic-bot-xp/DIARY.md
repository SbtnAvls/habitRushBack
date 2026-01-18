# Diario de Desarrollo - Realistic Bot XP

## [2026-01-18] - Inicializacion

### Decision
Se define el desarrollo para hacer la simulacion de XP de bots mas realista,
imitando patrones de actividad humana en vez de dar XP de golpe a medianoche.

### Analisis del sistema actual
- `simulateDailyBotXp()` se ejecuta 1x/dia a las 00:10
- Da entre 0-350 XP de golpe segun perfil (lazy/casual/active/hardcore)
- Perfiles actuales tienen rangos muy amplios:
  - lazy: 0-50 XP, 60% skip
  - casual: 30-120 XP, 30% skip
  - active: 80-200 XP, 10% skip
  - hardcore: 150-350 XP, 5% skip

### Estrategia de implementacion
1. Ajustar perfiles con limites diarios mas ajustados
2. Agregar tracking de XP acumulado por dia para cada bot
3. Crear funcion de "micro-simulacion" que da XP por habito individual
4. Implementar curva de probabilidad basada en hora del dia
5. Cambiar scheduler de 1x/dia a cada 30-60 min durante horas activas

## [2026-01-18] - Fase 1 - Refactorizar perfiles de bots

### Decision
Se actualizaron los perfiles de bots con valores mas realistas basados en
comportamiento humano tipico de usuarios de apps de habitos.

### Cambios realizados
- **Interface BotProfileConfig**: Se agregaron campos para simulacion granular:
  - `avgHabitsPerDayMin/Max`: rango de habitos completados por dia
  - `xpPerHabitMin/Max`: XP ganado por cada habito completado
  - `hourlyActivityChance`: probabilidad de completar habito en cada hora activa

- **BOT_PROFILES ajustados**:
  | Perfil   | XP Diario | Habitos/Dia | XP/Habito | Prob. Horaria |
  |----------|-----------|-------------|-----------|---------------|
  | lazy     | 10-40     | 1-3         | 5-15      | 5%            |
  | casual   | 30-80     | 3-6         | 10-25     | 12%           |
  | active   | 80-150    | 5-10        | 15-35     | 20%           |
  | hardcore | 150-250   | 8-15        | 25-50     | 30%           |

- **XP inicial eliminado**: Los bots ahora inician con `weekly_xp = 0`.
  El XP se acumulara incrementalmente via el nuevo scheduler (Fase 4).

### Notas de implementacion
- La variable `config` ya no se usa en `fillLeagueGroupWithBotsTx` pero
  no genera error porque TypeScript permite variables no usadas (aunque
  eslint podria advertir).
- Los nuevos campos de perfil se usaran en Fase 2 para la simulacion granular.

## [2026-01-18] - Fase 2 - Sistema de acumulacion incremental

### Decision
Se implemento un sistema de tracking diario para que los bots acumulen XP
de forma gradual durante el dia, en vez de recibirlo todo de golpe.

### Problema -> Solucion

**Problema de inconsistencia matematica en hourlyActivityChance:**
Los valores originales (5%, 12%, 20%, 30%) eran muy bajos para alcanzar
los habitos esperados por dia.

**Solucion:**
Recalcular asumiendo 15 horas activas (7am-10pm):
| Perfil   | Prob. Antigua | Prob. Nueva | Habitos Esperados |
|----------|---------------|-------------|-------------------|
| lazy     | 5%            | 13%         | ~2/dia            |
| casual   | 12%           | 30%         | ~4.5/dia          |
| active   | 20%           | 50%         | ~7.5/dia          |
| hardcore | 30%           | 77%         | ~11.5/dia         |

### Cambios realizados

**Nueva migracion `011_bot_daily_xp_tracking.sql`:**
```sql
ALTER TABLE LEAGUE_COMPETITORS
ADD COLUMN daily_xp_today INT DEFAULT 0,
ADD COLUMN daily_xp_target INT DEFAULT 0,
ADD COLUMN last_xp_reset_date DATE DEFAULT NULL;
```

**Nuevas funciones en `league-bot.service.ts`:**

1. `resetDailyBotXp(leagueWeekId)`:
   - Ejecutar a medianoche (00:00)
   - Resetea `daily_xp_today` a 0
   - Asigna `daily_xp_target` aleatorio segun perfil
   - Determina si el bot "salta" el dia (skipDayChance)

2. `simulateBotHabitCompletion(leagueWeekId)`:
   - Ejecutar cada 30-60 minutos durante horas activas
   - Cada bot tiene probabilidad `hourlyActivityChance` de completar habito
   - XP ganado = random(xpPerHabitMin, xpPerHabitMax)
   - Respeta limite `daily_xp_target`
   - Actualiza tanto `daily_xp_today` como `weekly_xp`

3. `getBotDailyProgress(leagueWeekId)`:
   - Funcion de monitoreo/debug
   - Retorna stats: activos, saltando, en limite, sin inicializar

### Notas de implementacion
- Todas las funciones usan transacciones para atomicidad
- La funcion legacy `simulateDailyBotXp()` se mantiene pero sera deprecada en Fase 4
- El indice `idx_league_competitors_bot_daily` optimiza queries frecuentes

## [2026-01-18] - Fase 3 - Patrones de actividad humana

### Decision
Implementar curva de probabilidad basada en hora del dia para que los bots
tengan actividad realista. Los humanos no completan habitos uniformemente
durante el dia - tienen picos y valles de actividad.

### Problema -> Solucion

**Problema:** Antes, la probabilidad de completar habito era constante
durante todas las horas (solo dependia de `hourlyActivityChance` del perfil).

**Solucion:** Agregar una capa de filtro basada en la hora actual:
1. Definir `HOURLY_ACTIVITY_WEIGHTS` con pesos 0.01-1.0 por hora
2. Aplicar variabilidad por bot (offset de hora) para evitar sincronizacion
3. Agregar varianza aleatoria (+/- 20%) para naturalidad

### Cambios realizados

**Nuevas constantes/funciones en `league-bot.service.ts`:**

1. `HOURLY_ACTIVITY_WEIGHTS` - Pesos por hora:
   ```
   Hora  | Peso | Descripcion
   ------+------+-------------
   0-5   | 0.01-0.05 | Madrugada (casi nadie)
   6-9   | 0.3-0.8   | Manana (rutinas matutinas)
   10-11 | 0.3-0.4   | Media manana
   12-13 | 0.6-0.7   | Almuerzo
   14-17 | 0.3-0.5   | Tarde/trabajo
   18-21 | 0.7-1.0   | Noche (pico maximo)
   22-23 | 0.2-0.5   | Noche tardia
   ```

2. `hashStringToNumber(str)` - Hash deterministico para crear offset por bot

3. `getActivityProbability(hour, botId?)` - Calcula probabilidad final con:
   - Offset por bot (-1, 0, +1 hora)
   - Varianza aleatoria (+/- 20%)

4. `getCurrentHourActivityInfo()` - Funcion de monitoreo para debugging

**Modificaciones a `simulateBotHabitCompletion()`:**
- Nuevo campo en retorno: `botsSkippedByHour`
- Doble filtro: primero patron horario, luego probabilidad del perfil
- Documentacion actualizada

### Notas de implementacion
- El doble filtro (horario + perfil) crea un comportamiento muy realista
- Los bots "matutinos" (offset -1) tienen pico a las 6-8am
- Los bots "nocturnos" (offset +1) tienen pico a las 21-22pm
- La varianza aleatoria evita que todos los bots actuen exactamente igual

## [2026-01-18] - Fase 4 - Nuevo scheduler con ejecucion frecuente

### Decision
Modificar LeagueSchedulerService para ejecutar simulacion de bots cada 30-45
minutos durante horas de actividad (7am-11pm), en vez de una sola vez al dia.

### Problema -> Solucion

**Problema:** El scheduler antiguo ejecutaba `simulateDailyBotXp()` una vez
al dia a las 00:10, dando todo el XP de golpe. Esto no era realista.

**Solucion:**
1. Crear job de reset diario a las 00:00 que ejecuta `resetDailyBotXp()`
2. Crear job de simulacion frecuente cada 30-45 min que ejecuta `simulateBotHabitCompletion()`
3. Solo ejecutar simulacion durante horas activas (7am-11pm)
4. Deprecar la funcion `simulateDailyBotXp()` (se mantiene en league-bot.service.ts pero no se usa)

### Cambios realizados

**Imports actualizados:**
```typescript
import {
  simulateBotHabitCompletion,  // NUEVO
  resetDailyBotXp,              // NUEVO
  updateAllLeaguePositions,
  fillAllLeaguesWithBots,
  getCurrentHourActivityInfo,   // NUEVO
} from './league-bot.service';
```

**Variables de instancia:**
- Removido: `dailyInterval`
- Agregados: `positionUpdateInterval`, `botSimulationInterval`, `dailyResetTimeout`, `dailyResetInterval`

**Nuevos metodos:**
| Metodo | Descripcion |
|--------|-------------|
| `getRandomIntervalMs(min, max)` | Genera intervalo aleatorio en ms |
| `isActiveHour()` | Retorna true si hora actual esta entre 7-23 |
| `startBotSimulationJobs()` | Inicia reset diario + simulacion frecuente |
| `scheduleBotSimulation()` | Programa siguiente simulacion con intervalo aleatorio |
| `startPositionUpdateJob()` | Job de posiciones separado a las 08:00 |
| `runDailyBotReset()` | Wrapper que llama a resetDailyBotXp() |
| `runBotHabitSimulation()` | Wrapper que llama a simulateBotHabitCompletion() |
| `triggerBotHabitSimulation()` | Para testing manual |
| `triggerDailyBotReset()` | Para testing manual |

**Metodos eliminados:**
- `startDailyJobs()` -> dividido en `startBotSimulationJobs()` + `startPositionUpdateJob()`
- `runDailyBotXpSimulation()` -> reemplazado por `runBotHabitSimulation()`
- `triggerBotXpSimulation()` -> reemplazado por `triggerBotHabitSimulation()`

### Notas de implementacion
- El intervalo de 30-45 minutos es aleatorio para evitar patrones predecibles
- Se usa `setTimeout` recursivo en `scheduleBotSimulation()` para variar el intervalo
- El logging es inteligente: solo loguea si hubo actividad real (evita spam)
- El metodo `stop()` fue actualizado para limpiar todos los nuevos timers
- La funcion `simulateDailyBotXp()` en league-bot.service.ts se mantiene como legacy por si acaso

## [2026-01-18] - Fase 5 - Testing y ajuste de parametros

### Decision
Implementar endpoints de testing manual y ajustar parametros de BOT_PROFILES
para alinearlos con el sistema de XP real de la aplicacion.

### Problema -> Solucion

**Problema:** No habia forma de probar el sistema manualmente sin esperar a que
el scheduler ejecutara los jobs automaticamente.

**Solucion:** Crear endpoints admin para ejecutar manualmente cada funcion:
- `GET /leagues/admin/bot-progress` - Ver estadisticas de bots
- `POST /leagues/admin/bot-reset` - Ejecutar reset diario
- `POST /leagues/admin/bot-simulate-habits` - Simular una ronda de habitos
- `GET /leagues/admin/activity-info` - Ver tabla de pesos horarios

### Ajuste de parametros BOT_PROFILES

**Analisis del sistema de XP real:**
| Evento                | XP      |
|-----------------------|---------|
| HABIT_COMPLETED       | 10      |
| STREAK_BONUS_PER_DAY  | 2 (max 20) |
| ALL_HABITS_DAILY_BONUS| 25      |
| CHALLENGE_COMPLETED   | 50      |

Un usuario real gana **10-30 XP por habito** (10 base + 0-20 streak bonus).

**Problema detectado:** El perfil `hardcore` tenia `xpPerHabit: 25-50`, que es
demasiado alto comparado con usuarios reales.

**Ajuste realizado:**
```typescript
hardcore: {
  xpPerHabitMin: 25 -> 15,
  xpPerHabitMax: 50 -> 30,
}
```

Esto alinea los bots hardcore con el rango real de 10-30 XP/habito.

### Archivos modificados
- `src/controllers/league-admin.controller.ts` - Nuevos endpoints: getBotProgress,
  triggerBotReset, triggerBotHabitSimulation, getActivityInfo
- `src/routes/league-admin.routes.ts` - Nuevas rutas de testing
- `src/services/league-bot.service.ts` - Ajuste xpPerHabit en perfil hardcore

### Notas de implementacion
- Todos los endpoints requieren header `X-Admin-Key`
- El endpoint `/bot-simulate-habits` tambien actualiza posiciones automaticamente
- El endpoint `/activity-info` genera la tabla completa de 24 horas para debugging
- Documentacion completa de testing en `context/phase-5.md`

## [2026-01-18] - Desarrollo Completado

### Resumen Final

El sistema de simulacion de XP de bots ahora:
1. Acumula XP gradualmente durante el dia (no de golpe a medianoche)
2. Simula patrones de actividad humana (picos en manana/noche)
3. Tiene variabilidad por bot (algunos matutinos, otros nocturnos)
4. Respeta limites diarios realistas por perfil
5. Es completamente testeable via endpoints admin

**Proximos pasos sugeridos:**
1. Desplegar en staging
2. Monitorear comportamiento por 2-3 dias
3. Ajustar parametros si es necesario
4. Desplegar en produccion
