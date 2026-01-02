# Fase 1: Servicio de Gestión de Ligas

## Objetivo
Crear el servicio base para gestionar semanas de liga y asignar usuarios reales a ligas.

## Archivos a Crear

### 1. src/models/league-week.model.ts
```typescript
export interface LeagueWeek {
  id: number;
  week_start: Date;
}
```

### 2. src/services/league-management.service.ts

Funciones requeridas:

```typescript
// Crear nueva semana de liga (ejecutar cada lunes)
createLeagueWeek(weekStart: Date): Promise<number>

// Obtener semana actual activa
getCurrentLeagueWeek(): Promise<LeagueWeek | null>

// Asignar usuario real a una liga
assignUserToLeague(userId: string, leagueWeekId: number, leagueId: number): Promise<void>

// Obtener usuarios activos que deben entrar a liga
getActiveUsersForLeague(): Promise<User[]>

// Distribuir usuarios en ligas (máx 20 por liga)
distributeUsersToLeagues(leagueWeekId: number): Promise<void>
```

## Lógica de Distribución
1. Usuarios nuevos → Bronze (liga 1)
2. Usuarios con historial → Liga según última posición
3. Agrupar en slots de 20, crear múltiples grupos si necesario

## Verificación
```bash
npm run build
npm run test -- --grep "league-management"
```

## Criterio de Completado
- [ ] Servicio creado con todas las funciones
- [ ] Build sin errores
- [ ] Puede crear semana y asignar usuarios
