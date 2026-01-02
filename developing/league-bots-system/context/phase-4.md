# Fase 4: Endpoints y Jobs

## Objetivo
Crear endpoints admin y jobs/cron para ejecutar la lógica automáticamente.

## Archivos a Crear/Modificar

### src/controllers/league-admin.controller.ts

Endpoints (protegidos, solo admin):

```typescript
// POST /leagues/admin/start-week - Iniciar nueva semana
// POST /leagues/admin/end-week - Procesar fin de semana
// POST /leagues/admin/simulate-bots - Simular XP de bots (manual/debug)
```

### src/routes/league-admin.routes.ts
Configurar rutas con middleware de admin.

### src/jobs/league-scheduler.ts (opcional)
Si se usa node-cron o similar:

```typescript
// Lunes 00:00 → startNewWeek()
// Diario 23:00 → simulateBotXp()
// Domingo 23:59 → processWeekEnd()
```

## Alternativa sin Jobs
Documentar para que el frontend/admin ejecute manualmente via endpoints.

## Verificación
```bash
npm run build
# Test manual de endpoints
```

## Criterio de Completado
- [ ] Endpoints admin funcionan
- [ ] Documentación de cuándo ejecutar
- [ ] Build sin errores
- [ ] Sistema completo end-to-end
