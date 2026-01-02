# Fase 2: Integrar XP en Habit Completions

## Objetivo
Otorgar XP automaticamente cuando un usuario completa un habito.

## Archivos a Modificar

### 1. `src/controllers/habit-completion.controller.ts`
En el metodo `createOrUpdateCompletion`:
- Despues de crear/actualizar la completion exitosamente
- Solo si `completed === true` (o 1)
- Llamar a `grantHabitCompletionXp(userId, currentStreak)`
- Incluir XP ganado en la respuesta

```typescript
// Despues de calcular streak
if (completed) {
  const xpGained = await grantHabitCompletionXp(userId, currentStreak);
  completion.xp_gained = xpGained;
}
```

## Logica de XP por Racha
- Base: 10 XP
- Bonus: min(streak * 2, 20)
- Total: 10 + bonus

Ejemplos:
- Streak 0-1: 10 XP
- Streak 5: 10 + 10 = 20 XP
- Streak 10+: 10 + 20 = 30 XP (max)

## Verificacion
- Completar un habito aumenta weekly_xp del usuario
- La respuesta incluye xp_gained

## Criterio de Completado
- [ ] Controller llama a grantHabitCompletionXp
- [ ] Respuesta incluye xp_gained
- [ ] XP se refleja en USERS.weekly_xp
