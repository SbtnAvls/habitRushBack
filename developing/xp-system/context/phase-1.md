# Fase 1: Servicio Base de XP

## Objetivo
Crear la infraestructura base para otorgar XP a usuarios.

## Archivos a Crear/Modificar

### 1. Crear `src/services/xp.service.ts`
```typescript
// Constantes de XP
export const XP_VALUES = {
  HABIT_COMPLETED: 10,
  STREAK_BONUS_PER_DAY: 2,
  STREAK_BONUS_MAX: 20,
  ALL_HABITS_DAILY_BONUS: 25,
  CHALLENGE_COMPLETED: 50,
} as const;

// Funcion principal
async function grantXp(userId: string, amount: number, reason: string, connection?: PoolConnection): Promise<void>
// - Actualiza USERS.xp (total) y USERS.weekly_xp (semanal)
// - Usa transaccion si se proporciona connection

// Funciones helper
async function grantHabitCompletionXp(userId: string, currentStreak: number, connection?: PoolConnection): Promise<number>
// - Calcula XP base + bonus por racha
// - Retorna cantidad total otorgada
```

### 2. Modificar `src/models/user.model.ts`
Agregar metodo:
```typescript
static async updateXp(userId: string, xpToAdd: number, connection?: PoolConnection): Promise<void>
// UPDATE USERS SET xp = xp + ?, weekly_xp = weekly_xp + ? WHERE id = ?
```

## Verificacion
- El servicio compila sin errores
- El metodo updateXp existe en UserModel

## Criterio de Completado
- [x] xp.service.ts creado con constantes y grantXp
- [x] UserModel.updateXp implementado
- [x] npm run build pasa sin errores
