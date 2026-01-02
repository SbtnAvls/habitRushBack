# Fase 2: Sistema de Bots

## Objetivo
Generar bots para rellenar ligas hasta 20 competidores y simular su XP.

## Archivos a Crear/Modificar

### src/services/league-bot.service.ts

Funciones requeridas:

```typescript
// Lista de nombres para bots
const BOT_NAMES: string[]

// Generar bots para completar una liga
fillLeagueWithBots(leagueWeekId: number, leagueId: number, currentCount: number): Promise<void>

// Simular XP de bots (variación realista)
simulateBotXp(leagueWeekId: number): Promise<void>

// Generar nombre aleatorio único para bot
generateBotName(usedNames: string[]): string
```

## Lógica de Simulación XP
- Bots ganan XP aleatorio entre 50-300 por día
- Algunos bots son "flojos" (menos XP), otros "activos"
- Distribuir para que haya competencia real

## Criterio de Completado
- [ ] Servicio de bots creado
- [ ] Puede rellenar liga hasta 20
- [ ] Simulación de XP funciona
