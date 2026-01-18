# Fase 5 - Testing y ajuste de parametros

## Objetivo
Verificar que el sistema funciona correctamente y proporcionar herramientas de testing manual.

## Archivos modificados
- src/controllers/league-admin.controller.ts (nuevos endpoints de testing)
- src/routes/league-admin.routes.ts (nuevas rutas)
- src/services/league-bot.service.ts (ajuste de parametros BOT_PROFILES)

## Endpoints de Testing Implementados

### 1. GET /leagues/admin/bot-progress
Muestra el progreso diario de todos los bots.

**Respuesta:**
```json
{
  "weekId": 1,
  "currentHour": 14,
  "hourlyActivity": {
    "baseWeight": 0.4,
    "expectedLevel": "medium"
  },
  "botProgress": {
    "totalBots": 100,
    "botsActive": 60,
    "botsSkipping": 10,
    "botsAtTarget": 20,
    "botsNotInitialized": 10,
    "avgProgressPercent": 45
  }
}
```

### 2. POST /leagues/admin/bot-reset
Ejecuta el reset diario de bots (asigna targets para el dia).

**Respuesta:**
```json
{
  "message": "Daily bot reset executed successfully",
  "weekId": 1,
  "botsReset": 85,
  "botsSkippingToday": 15
}
```

### 3. POST /leagues/admin/bot-simulate-habits
Ejecuta una ronda de simulacion de habitos.

**Respuesta:**
```json
{
  "message": "Bot habit simulation executed successfully",
  "weekId": 1,
  "simulationTime": {
    "hour": 14,
    "expectedActivityLevel": "medium",
    "baseWeight": 0.4
  },
  "simulationResult": {
    "botsUpdated": 25,
    "totalXpAdded": 450,
    "botsAtLimit": 5,
    "botsSkippedByHour": 30
  },
  "positionsUpdated": {
    "usersSynced": 10,
    "groupsUpdated": 5
  }
}
```

### 4. GET /leagues/admin/activity-info
Muestra la tabla completa de pesos de actividad por hora.

**Respuesta:**
```json
{
  "currentHour": 14,
  "currentActivity": {
    "baseWeight": 0.4,
    "expectedLevel": "medium"
  },
  "description": "Activity weights determine...",
  "hourlyWeights": {
    "0": { "weight": 0.05, "level": "very low" },
    "1": { "weight": 0.02, "level": "very low" },
    ...
    "20": { "weight": 1.0, "level": "very high" },
    ...
  }
}
```

## Guia de Testing Manual

### Requisitos
- Header `X-Admin-Key` con la clave de admin configurada en `.env`
- Semana de liga activa (crear con POST /leagues/admin/start-week si no existe)

### Procedimiento de Testing Completo

#### 1. Verificar estado inicial
```bash
# Ver si hay semana activa
curl -X GET http://localhost:3000/leagues/admin/summary \
  -H "X-Admin-Key: YOUR_ADMIN_KEY"

# Ver progreso actual de bots
curl -X GET http://localhost:3000/leagues/admin/bot-progress \
  -H "X-Admin-Key: YOUR_ADMIN_KEY"
```

#### 2. Ejecutar reset diario (si bots no inicializados)
```bash
curl -X POST http://localhost:3000/leagues/admin/bot-reset \
  -H "X-Admin-Key: YOUR_ADMIN_KEY"
```
Verificar que `botsReset > 0` y `botsSkippingToday` es ~15-20% del total (segun perfiles).

#### 3. Simular habitos multiples veces
```bash
# Ejecutar 3-4 veces para ver acumulacion
curl -X POST http://localhost:3000/leagues/admin/bot-simulate-habits \
  -H "X-Admin-Key: YOUR_ADMIN_KEY"
```
Verificar que:
- `botsUpdated` varia entre ejecuciones (no siempre los mismos bots)
- `totalXpAdded` es razonable (no miles de XP)
- `botsAtLimit` crece a medida que bots alcanzan su target
- `botsSkippedByHour` varia segun la hora del dia

#### 4. Verificar patron horario
```bash
curl -X GET http://localhost:3000/leagues/admin/activity-info \
  -H "X-Admin-Key: YOUR_ADMIN_KEY"
```
Comparar `botsSkippedByHour` con el peso de la hora actual:
- Hora 3am (peso 0.01): casi todos los bots saltan
- Hora 8pm (peso 1.0): muy pocos bots saltan

#### 5. Verificar limites diarios
Despues de varias simulaciones, verificar con `/bot-progress`:
- `avgProgressPercent` deberia crecer gradualmente
- `botsAtTarget` deberia crecer (bots que alcanzaron su meta)
- Al final del dia, `botsActive` deberia ser 0

### Pruebas de Rangos Esperados

| Perfil   | XP Diario Target | Habitos/Dia | Skip Day |
|----------|------------------|-------------|----------|
| lazy     | 10-40            | 1-3         | 40%      |
| casual   | 30-80            | 3-6         | 15%      |
| active   | 80-150           | 5-10        | 5%       |
| hardcore | 150-250          | 8-15        | 2%       |

### Valores Ajustados

Se ajusto el perfil `hardcore`:
- `xpPerHabitMin`: 25 -> 15
- `xpPerHabitMax`: 50 -> 30

Razon: Los valores originales (25-50 XP/habito) eran demasiado altos comparados
con lo que un usuario real gana (10 base + 0-20 streak = 10-30 XP/habito).

## Verificacion

- [x] Endpoints de testing implementados y funcionando
- [x] Build compila sin errores
- [x] Parametros BOT_PROFILES ajustados para realismo
- [x] Documentacion de testing completa

## Criterio de completado

- [x] Tests de endpoints manuales documentados
- [x] XP por habito alineado con valores reales de la app
- [x] Distribucion horaria verificable via endpoint
- [x] Documentacion para equipo de QA
