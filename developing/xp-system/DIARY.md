# Diario de Desarrollo - Sistema XP

## 2026-01-02 - Inicio del desarrollo

### Decision
Seguir el patron de `stats.service.ts` para organizar el servicio de XP:
- Constantes exportables para valores de XP
- Funciones helper especificas para cada evento
- Soporte para transacciones con PoolConnection opcional

### Arquitectura
- `xp.service.ts`: Logica central de XP
- `user.model.ts`: Metodo updateXp para persistencia
- Integracion en controller, no en model (para mantener models simples)

## 2026-01-02 - Bugfixes Fase 3

### Problema -> Solucion

1. **Timezone bug**: `new Date("2024-01-15")` interpreta UTC, dando dia incorrecto
   -> Crear `getDayOfWeekFromDateString()` que parsea YYYY-MM-DD manualmente

2. **Race condition**: Dos requests simultaneos podian otorgar bonus duplicado
   -> UPDATE atomico con condicion `last_daily_bonus_date != ?`, verificar affectedRows

3. **start_date no verificado**: Habitos futuros contaban para bonus
   -> Agregar `AND start_date <= ?` a query

4. **Connection inconsistente**: Queries usaban pool en vez de connection
   -> Usar `const conn = connection || pool` para todas las queries

5. **active_by_user ignorado**: Solo verificaba is_active
   -> Agregar `AND active_by_user = 1` a query

## 2026-01-02 - Revision dev-debugger

### Problema -> Solucion

1. **CRITICO - grantChallengeCompletionXp sin transaccion**: XP se otorgaba fuera de la transaccion
   -> Pasar `connection` como segundo parametro: `grantChallengeCompletionXp(userId, connection)`

2. **MEDIO - Errores silenciados sin logging**: Debugging en produccion imposible
   -> Agregar `console.error('Error granting XP for habit completion:', xpError)`

## 2026-01-02 - Revision Opus

### Problema -> Solucion

1. **CRITICO - XP Farming Exploit**: Usuario podia re-enviar completion y ganar XP infinito
   -> Agregar `HabitCompletion.wasAlreadyCompleted()` para verificar estado previo
   -> Solo otorgar XP si `completed && !wasAlreadyCompleted`
