# League Bots System

## Estado Actual
- **Fase:** COMPLETADO
- **Tarea actual:** Sistema listo para producción
- **Bloqueadores:** Ninguno

## Progreso
- [x] Fase 1: Servicio de gestión de ligas (matchmaking por XP + grupos)
- [x] Fase 2: Sistema de bots (generación y simulación XP)
- [x] Fase 3: Procesamiento semanal (promociones/descensos)
- [x] Fase 4: Endpoints admin

## Pendiente (Opcional)
- [ ] Scheduler automático (`src/jobs/league-scheduler.ts`)
- [ ] Sistema de XP (otorgar XP al completar hábitos)

## Endpoints Admin Disponibles
```
POST /leagues/admin/start-week      # Iniciar semana (lunes)
POST /leagues/admin/simulate-bots   # Simular XP bots (diario)
POST /leagues/admin/update-positions # Actualizar ranking
POST /leagues/admin/end-week        # Procesar fin semana (domingo)
GET  /leagues/admin/summary         # Resumen semana actual
DELETE /leagues/admin/cleanup       # Limpiar semanas antiguas
```

Header requerido: `X-Admin-Key: <ADMIN_API_KEY>`

## Archivos del Sistema
```
src/services/
├── league-management.service.ts   # Matchmaking, crear semanas
├── league-bot.service.ts          # Bots, XP sync, posiciones
└── league-weekly-processor.service.ts # Fin de semana, historial

src/controllers/
├── league.controller.ts           # GET /leagues/current, history
└── league-admin.controller.ts     # Endpoints admin

src/routes/
└── league-admin.routes.ts         # Rutas admin con middleware

src/models/
├── league-week.model.ts           # Constantes y tipos
└── league-competitor.model.ts     # Interface competidor

src/middleware/
└── auth.middleware.ts             # adminKeyMiddleware

migrations/
├── 003_league_groups.sql          # Campo league_group
└── 004_bot_profile.sql            # Campo bot_profile
```

## Fixes Aplicados (Code Reviews)
- SQL injection prevention (queries parametrizadas)
- Race conditions (transacciones + FOR UPDATE)
- N+1 queries optimizadas
- Validación de inputs
- Type safety mejorado
