# Fase 3: Bonus por Completar Todos los Habitos del Dia

## Objetivo
Otorgar +25 XP bonus cuando el usuario completa TODOS sus habitos activos del dia.

## Logica

### Detectar "todos completados"
1. Obtener habitos activos del usuario (is_active = 1)
2. Obtener completions del dia actual
3. Comparar: si todos los habitos tienen completion con completed = 1

### Cuando evaluar
- Despues de cada completion exitosa
- Solo otorgar el bonus UNA vez por dia

### Evitar duplicados
Opciones:
A) Guardar flag en alguna tabla (ej: USER_DAILY_BONUS)
B) Verificar si ya se otorgo hoy antes de dar el bonus

Recomendacion: Opcion B - verificar en el momento sin tabla adicional.
Crear funcion `hasReceivedDailyBonus(userId, date)` que revise si hay un registro de XP con reason = 'all_habits_daily_bonus' para ese dia.

## Archivos a Modificar

### 1. `src/services/xp.service.ts`
Agregar:
```typescript
async function checkAndGrantDailyBonus(userId: string, date: string, connection?: PoolConnection): Promise<number>
// Retorna 25 si otorgo bonus, 0 si no
```

### 2. `src/controllers/habit-completion.controller.ts`
Despues de otorgar XP por habito:
```typescript
const dailyBonus = await checkAndGrantDailyBonus(userId, date);
if (dailyBonus > 0) {
  completion.daily_bonus_xp = dailyBonus;
}
```

## Verificacion
- Completar el ultimo habito del dia otorga +25 XP adicionales
- Completar mas habitos despues no otorga bonus extra

## Criterio de Completado
- [ ] Funcion checkAndGrantDailyBonus implementada
- [ ] Se otorga bonus solo una vez por dia
- [ ] Respuesta incluye daily_bonus_xp cuando aplica
