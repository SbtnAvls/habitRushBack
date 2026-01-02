# Fase 3: Procesamiento Semanal

## Objetivo
Procesar fin de semana: calcular posiciones finales, promociones/descensos, guardar historial.

## Archivos a Crear/Modificar

### src/services/league-weekly-processor.service.ts

Funciones requeridas:

```typescript
// Procesar fin de semana (ejecutar cada domingo noche)
processWeekEnd(leagueWeekId: number): Promise<void>

// Calcular posiciones finales por XP
calculateFinalPositions(leagueWeekId: number, leagueId: number): Promise<void>

// Determinar promociones/descensos
determineLeagueChanges(position: number, totalPositions: number): 'promoted' | 'relegated' | 'stayed'

// Guardar historial de usuario
saveUserHistory(userId: string, leagueWeekId: number, leagueId: number, position: number, weeklyXp: number, changeType: string): Promise<void>

// Obtener siguiente liga del usuario para próxima semana
getNextLeagueForUser(currentLeagueId: number, changeType: string): number
```

## Reglas de Promoción/Descenso
- Top 3 (posiciones 1-3) → promoted → suben 1 liga
- Bottom 3 (posiciones 18-20) → relegated → bajan 1 liga
- Resto (posiciones 4-17) → stayed → misma liga
- Bronze no puede bajar, Master no puede subir

## Criterio de Completado
- [ ] Procesador semanal funciona
- [ ] Historial se guarda correctamente
- [ ] Promociones/descensos calculados bien
