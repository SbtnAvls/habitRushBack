# Fase 4: XP por Completar Challenges

## Objetivo
Otorgar +50 XP cuando el usuario completa un challenge de redencion.

## Archivos a Modificar

### 1. `src/services/challenge-validation.service.ts`
En la funcion `submitChallengeProof`, despues de validacion exitosa:
```typescript
if (validationResult.is_valid) {
  // ... codigo existente de marcar challenge como completado ...

  // Otorgar XP por challenge
  await grantXp(userId, XP_VALUES.CHALLENGE_COMPLETED, 'challenge_completed');

  // ... resto del codigo ...
}
```

## Consideraciones
- El challenge ya tiene su propio efecto (revivir al usuario)
- El XP es adicional a ese efecto
- Usar la misma transaccion si es posible

## Verificacion
- Completar un challenge exitosamente otorga +50 XP
- El XP aparece en USERS.weekly_xp

## Criterio de Completado
- [ ] submitChallengeProof otorga XP al completar
- [ ] XP se refleja correctamente
- [ ] Tests existentes siguen pasando

---

## Post-Implementacion

### Testing Manual
1. Completar un habito -> verificar weekly_xp aumenta
2. Completar habito con racha alta -> verificar bonus
3. Completar todos los habitos del dia -> verificar +25 bonus
4. Completar challenge -> verificar +50 XP

### Verificar Sincronizacion Liga
- LEAGUE_COMPETITORS.weekly_xp se sincroniza desde USERS.weekly_xp
- Esta sincronizacion ya existe, solo verificar que funciona
