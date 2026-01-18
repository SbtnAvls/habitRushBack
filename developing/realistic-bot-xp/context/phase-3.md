# Fase 3 - Patrones de actividad humana

## Objetivo
Implementar curva de probabilidad basada en hora del dia para que los bots "completen habitos" en horarios realistas.

## Archivos a modificar
- src/services/league-bot.service.ts

## Cambios especificos

### 1. Constante HOURLY_ACTIVITY_WEIGHTS
```typescript
// Peso de actividad por hora (0-23)
// Mas peso = mas probabilidad de que un bot "complete un habito"
const HOURLY_ACTIVITY_WEIGHTS: Record<number, number> = {
  0: 0.05,  1: 0.02,  2: 0.01,  3: 0.01,  4: 0.02,  5: 0.05,
  6: 0.3,   7: 0.6,   8: 0.8,   9: 0.5,   10: 0.3,  11: 0.4,
  12: 0.7,  13: 0.6,  14: 0.4,  15: 0.3,  16: 0.4,  17: 0.5,
  18: 0.7,  19: 0.9,  20: 1.0,  21: 0.8,  22: 0.5,  23: 0.2,
};
```

Picos:
- Manana: 7-9 AM (0.6-0.8)
- Mediodia: 12-13 (0.6-0.7)
- Noche: 18-21 (0.7-1.0)
Minimos:
- Madrugada: 1-4 AM (0.01-0.02)

### 2. Funcion getActivityProbability()
```typescript
function getActivityProbability(hour: number): number {
  const baseWeight = HOURLY_ACTIVITY_WEIGHTS[hour] || 0.1;
  // Agregar variabilidad aleatoria (+/- 20%)
  const variance = (Math.random() - 0.5) * 0.4;
  return Math.max(0, Math.min(1, baseWeight + variance));
}
```

### 3. Modificar simulateBotHabitCompletion()
Integrar la probabilidad por hora:
```typescript
// Antes de decidir si un bot completa habito
const activityProb = getActivityProbability(new Date().getHours());
if (Math.random() > activityProb) {
  continue; // Este bot no esta "activo" ahora
}
```

### 4. Variabilidad entre bots
No todos los bots deben actuar al mismo tiempo:
```typescript
// Cada bot tiene su propio "offset" de actividad
// Algunos son mas matutinos, otros nocturnos
const botActivityOffset = hashStringToNumber(bot.id) % 3 - 1; // -1, 0, o 1 hora
const effectiveHour = (currentHour + botActivityOffset + 24) % 24;
```

## Pasos
1. Definir HOURLY_ACTIVITY_WEIGHTS
2. Implementar getActivityProbability()
3. Integrar en simulateBotHabitCompletion()
4. Agregar variabilidad por bot (offset de hora)
5. Testear en diferentes horas del dia

## Verificacion
- A las 3 AM: muy pocos bots activos (< 5%)
- A las 8 AM: actividad media-alta (~60-80%)
- A las 20 PM: maxima actividad (~90-100%)

## Criterio de completado
- [x] HOURLY_ACTIVITY_WEIGHTS definido
- [x] getActivityProbability() implementado
- [x] Integracion con simulateBotHabitCompletion()
- [x] Variabilidad por bot funcionando

## Implementacion realizada (2026-01-18)

### Constantes y funciones agregadas:

1. **HOURLY_ACTIVITY_WEIGHTS** - Mapa de pesos por hora (0-23):
   - Pico manana: 7-9am (0.6-0.8)
   - Pico almuerzo: 12-13 (0.6-0.7)
   - Pico noche: 18-21 (0.7-1.0)
   - Minimos madrugada: 1-4am (0.01-0.02)

2. **hashStringToNumber(str)** - Genera numero deterministico desde string (bot ID)
   - Usado para crear offsets de hora consistentes por bot
   - Permite que algunos bots sean "matutinos" y otros "nocturnos"

3. **getActivityProbability(hour, botId?)** - Calcula probabilidad de actividad
   - Aplica offset por bot (-1, 0, +1 hora)
   - Agrega varianza aleatoria (+/- 20%)
   - Retorna valor entre 0 y 1

4. **getCurrentHourActivityInfo()** - Funcion de monitoreo
   - Retorna hora actual, peso base y nivel esperado de actividad
   - Util para debugging y logs

### Cambios en simulateBotHabitCompletion():

- **Nuevo parametro de retorno**: `botsSkippedByHour` para tracking
- **Doble filtro de actividad**:
  1. Primero: Verifica patron horario (getActivityProbability)
  2. Despues: Verifica probabilidad del perfil (hourlyActivityChance)
- **Documentacion actualizada** reflejando los tres factores de decision

### Resultado esperado:
- A las 3 AM: ~1-5% de bots activos
- A las 8 AM: ~60-80% de bots activos
- A las 20 PM: ~90-100% de bots activos
