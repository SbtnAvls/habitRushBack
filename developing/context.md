# Contexto para Retomar Desarrollo

Este documento contiene toda la información necesaria para que un agente de IA pueda retomar el desarrollo del sistema de Challenges y Skills.

---

## Estado del Proyecto

**Proyecto:** HabitRush Backend
**Stack:** Node.js + Express + TypeScript + MySQL
**Ubicación:** `/workspaces/habitRushBack`

---

## Documentación de Fases

- `00-overview.md` - Vista general del sistema
- `01-fase-database.md` - Cambios SQL (tablas, alteraciones, seeds)
- `02-fase-models.md` - Modelos TypeScript
- `03-fase-pending-redemptions.md` - Flujo de fallos pendientes de redimir
- `04-fase-revival.md` - Flujo de muerte y resurrección
- `05-fase-category-challenges.md` - Challenges específicos por categoría

---

## Resumen de Cambios

### Nuevas Tablas
1. **HABIT_CATEGORIES** - Catálogo de categorías de hábitos (health, exercise, learning, etc.)
2. **USER_STATS** - Estadísticas del usuario (discipline_score, max_streak, etc.)
3. **PENDING_REDEMPTIONS** - Fallos de hábitos pendientes de redimir (24h para decidir)

### Modificaciones a Tablas
- **HABITS** - Agregar `category_id`
- **CHALLENGES** - Agregar `category_id`, `is_general`
- **USER_CHALLENGES** - Hacer `habit_id` nullable
- **LIFE_HISTORY** - Nuevos reasons
- **NOTIFICATIONS** - Nuevos types

### Nuevos Archivos a Crear
```
src/
├── models/
│   ├── habit-category.model.ts
│   ├── user-stats.model.ts
│   └── pending-redemption.model.ts
├── controllers/
│   ├── pending-redemption.controller.ts
│   └── revival.controller.ts
├── routes/
│   ├── pending-redemption.routes.ts
│   ├── revival.routes.ts
│   └── category.routes.ts
└── services/
    └── stats.service.ts
```

### Archivos a Modificar
```
src/
├── models/
│   ├── habit.model.ts (agregar category_id)
│   ├── challenge.model.ts (agregar category_id, is_general, nuevos métodos)
│   └── user-challenge.model.ts (habit_id nullable)
├── services/
│   └── habit-evaluation.service.ts (crear pending en vez de restar vida)
├── routes/
│   └── challenge.routes.ts (nuevos endpoints)
└── app.ts (registrar nuevas rutas)
```

---

## Flujos de Negocio

### Flujo 1: Fallo de Hábito (tiene vidas)
1. Evaluación diaria detecta hábito no completado
2. Crear PENDING_REDEMPTION (expira en 24h)
3. Usuario puede:
   - No hacer nada → expira → pierde vida + stats -15
   - Redimir con vida → pierde vida + stats -10
   - Completar challenge de la categoría → NO pierde vida + stats +5

### Flujo 2: Muerte (0 vidas)
1. Usuario llega a 0 vidas → hábitos se desactivan
2. Dos opciones:
   - RESET: Borrar streaks, stats -50%, 1 vida
   - PENITENCIA: Challenge general + pruebas, stats -20%, 1 vida, mantiene progreso

---

## Decisiones de Diseño

1. **Validación IA**: Mantener simulación actual. Implementar IA real después.
2. **Notificaciones**: SÍ notificar cuando pending redemptions estén por expirar.
3. **Categorías**: 8 categorías predefinidas (health, exercise, learning, productivity, mindfulness, creativity, social, finance).

---

## Comandos Útiles

```bash
# Desarrollo
npm run dev

# Compilar
npm run build

# Tests
npm run test

# Lint
npm run lint

# Ver estructura
tree src/
```

---

## Patrones del Código

### Modelos
```typescript
export class ModelName {
  static async method(): Promise<Type> {
    const [rows] = await pool.query<RowType[]>('SELECT ...');
    return rows;
  }
}
```

### Controllers
```typescript
export class ControllerName {
  static async method(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      // ... lógica
      res.json({ success: true, data });
    } catch (error) {
      res.status(500).json({ message: 'Error' });
    }
  }
}
```

### Rutas
```typescript
const router = Router();
router.use(authMiddleware);
router.get('/', Controller.method);
export default router;
```

### Transacciones
```typescript
const connection = await pool.getConnection();
try {
  await connection.beginTransaction();
  // ... operaciones
  await connection.commit();
} catch (error) {
  await connection.rollback();
  throw error;
} finally {
  connection.release();
}
```

---

## Base de Datos

- **Motor:** MySQL 8.0+
- **Schema principal:** `/workspaces/habitRushBack/habitRush_mysql.sql`
- **IDs:** UUIDs como CHAR(36)
- **Fechas:** DATETIME con DEFAULT CURRENT_TIMESTAMP

---

## Estado de Implementación

✅ **Fase 1**: Tablas y modificaciones SQL - COMPLETADO
✅ **Fase 2**: Modelos TypeScript - COMPLETADO
✅ **Fase 3**: Pending redemptions - COMPLETADO
✅ **Fase 4**: Revival system - COMPLETADO
✅ **Fase 5**: Challenges por categoría - COMPLETADO

### Próximos pasos sugeridos (futuro):
- Implementar validación de pruebas con IA real (OpenAI/Anthropic)
- Tests unitarios para pending redemptions y revival
- Tests de integración end-to-end

---

## Archivos Clave para Leer

Si necesitas entender el código actual:

1. `src/app.ts` - Entry point, registro de rutas
2. `src/services/habit-evaluation.service.ts` - Lógica de evaluación de hábitos
3. `src/services/challenge-validation.service.ts` - Validación de pruebas (simulated)
4. `src/models/user.model.ts` - Modelo de usuario con lives
5. `habitRush_mysql.sql` - Schema completo de la BD

---

## Instrucciones para el Agente

**IMPORTANTE: Las fases NO se completan automáticamente.**
- El usuario debe aprobar cada fase antes de pasar a la siguiente
- NO marques una fase como completada hasta que el usuario lo confirme
- Después de implementar una fase, espera la revisión y aprobación del usuario

### Flujo de trabajo:
1. Lee este archivo primero para contexto
2. Consulta el archivo de la fase que toca implementar
3. Implementa siguiendo el checklist de esa fase
4. Muestra al usuario lo implementado
5. **ESPERA aprobación del usuario antes de continuar**
6. Solo después de aprobación, pasa a la siguiente fase

---

## Plan Completo

Ver: `/home/codespace/.claude/plans/linear-launching-galaxy.md`
