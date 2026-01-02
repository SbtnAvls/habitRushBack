# Fase 4: Sistema de Revival (Muerte y Resurrección)

## Objetivo
Implementar las dos opciones cuando un usuario muere (llega a 0 vidas).

---

## Flujo de Muerte

```
Usuario llega a 0 vidas
         │
         ▼
┌─────────────────────────────────────────┐
│  handleUserDeath()                      │
│  - Desactivar todos los hábitos         │
│  - disabled_reason = 'no_lives'         │
│  - Crear notificación de muerte         │
└─────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│  Usuario en estado "muerto"             │
│  - No puede completar hábitos           │
│  - Debe elegir cómo revivir             │
└─────────────────────────────────────────┘
         │
    ┌────┴────┐
    ▼         ▼
 RESET     PENITENCIA
```

---

## Opciones de Revival

### Opción A: Reset Total
- Borra streaks de todos los hábitos
- Pierde 50% de discipline_score
- Incrementa reset_count
- Revive con 1 vida
- Hábitos se reactivan

### Opción B: Penitencia (Challenge General)
- Debe completar un challenge general
- Enviar pruebas (texto/imagen)
- IA valida las pruebas
- Pierde 20% de discipline_score
- Incrementa revival_count
- Revive con 1 vida
- Mantiene progreso de hábitos

---

## 1. Controller: src/controllers/revival.controller.ts

```typescript
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { ChallengeModel } from '../models/challenge.model';
import { UserStatsModel } from '../models/user-stats.model';
import { adjustDiscipline, DISCIPLINE_CHANGES } from '../services/stats.service';
import pool from '../db';

export class RevivalController {

  // GET /revival/options
  // Obtiene las opciones de revival disponibles
  static async getOptions(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: 'Not authenticated' });
      }

      // Verificar que el usuario está muerto
      const [[user]] = await pool.query<any>(
        'SELECT lives FROM USERS WHERE id = ?',
        [userId]
      );

      if (user.lives > 0) {
        return res.status(400).json({
          message: 'No necesitas revivir, tienes vidas',
          lives: user.lives
        });
      }

      // Obtener challenges generales disponibles
      const generalChallenges = await ChallengeModel.getGeneralChallenges();

      // Obtener stats actuales para mostrar impacto
      const stats = await UserStatsModel.getOrCreate(userId);

      res.json({
        success: true,
        is_dead: true,
        options: {
          reset: {
            description: 'Empezar de cero. Pierdes todo el progreso de tus hábitos.',
            discipline_penalty: Math.floor(stats.discipline_score * 0.5),
            new_discipline: Math.floor(stats.discipline_score * 0.5),
            lives_gained: 1,
            effects: [
              'Se reinician los streaks de todos los hábitos',
              'Pierdes 50% de tu puntuación de disciplina',
              'Recibes 1 vida para empezar'
            ]
          },
          challenge: {
            description: 'Completa una penitencia para mantener tu progreso.',
            discipline_penalty: Math.floor(stats.discipline_score * 0.2),
            new_discipline: Math.floor(stats.discipline_score * 0.8),
            lives_gained: 1,
            available_challenges: generalChallenges,
            effects: [
              'Mantienes todo tu progreso y streaks',
              'Pierdes 20% de tu puntuación de disciplina',
              'Recibes 1 vida para continuar'
            ]
          }
        },
        current_stats: {
          discipline_score: stats.discipline_score,
          max_streak: stats.max_streak,
          revival_count: stats.revival_count,
          reset_count: stats.reset_count
        }
      });

    } catch (error) {
      console.error('Error getting revival options:', error);
      res.status(500).json({ message: 'Error al obtener opciones de revival' });
    }
  }

  // POST /revival/reset
  // Opción A: Reset total
  static async resetTotal(req: AuthRequest, res: Response) {
    const connection = await pool.getConnection();

    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: 'Not authenticated' });
      }

      // Verificar que está muerto
      const [[user]] = await connection.query<any>(
        'SELECT lives FROM USERS WHERE id = ?',
        [userId]
      );

      if (user.lives > 0) {
        return res.status(400).json({ message: 'No estás muerto' });
      }

      await connection.beginTransaction();

      // 1. Reiniciar streaks de todos los hábitos
      await connection.query(
        `UPDATE HABITS
         SET current_streak = 0,
             is_active = 1,
             disabled_reason = NULL
         WHERE user_id = ? AND deleted_at IS NULL`,
        [userId]
      );

      // 2. Dar 1 vida
      await connection.query(
        'UPDATE USERS SET lives = 1 WHERE id = ?',
        [userId]
      );

      // 3. Penalizar discipline (-50%)
      await connection.query(
        `UPDATE USER_STATS
         SET discipline_score = FLOOR(discipline_score * 0.5),
             reset_count = reset_count + 1
         WHERE user_id = ?`,
        [userId]
      );

      // 4. Registrar en LIFE_HISTORY
      await connection.query(
        `INSERT INTO LIFE_HISTORY
         (id, user_id, lives_change, current_lives, reason)
         VALUES (UUID(), ?, 1, 1, 'revival_reset')`,
        [userId]
      );

      await connection.commit();

      // Obtener stats actualizados
      const stats = await UserStatsModel.getForUser(userId);

      res.json({
        success: true,
        message: '¡Has renacido! Tu progreso se ha reiniciado.',
        lives: 1,
        stats
      });

    } catch (error) {
      await connection.rollback();
      console.error('Error in reset revival:', error);
      res.status(500).json({ message: 'Error al reiniciar' });
    } finally {
      connection.release();
    }
  }

  // POST /revival/challenge
  // Opción B: Penitencia
  static async reviveWithChallenge(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { challenge_id, proof_text, proof_image_url } = req.body;

      if (!userId) {
        return res.status(401).json({ message: 'Not authenticated' });
      }

      if (!challenge_id) {
        return res.status(400).json({ message: 'challenge_id es requerido' });
      }

      if (!proof_text && !proof_image_url) {
        return res.status(400).json({
          message: 'Debes enviar prueba (texto o imagen)'
        });
      }

      // Verificar que está muerto
      const [[user]] = await pool.query<any>(
        'SELECT lives FROM USERS WHERE id = ?',
        [userId]
      );

      if (user.lives > 0) {
        return res.status(400).json({ message: 'No estás muerto' });
      }

      // Verificar que es un challenge general
      const challenge = await ChallengeModel.findById(challenge_id);
      if (!challenge || !challenge.is_general) {
        return res.status(400).json({
          message: 'Challenge no válido para revival'
        });
      }

      // TODO: Validación real con IA
      // Por ahora, simulación (aprueba si hay texto >20 chars o imagen)
      const isValid = (proof_text && proof_text.length > 20) || proof_image_url;

      if (!isValid) {
        return res.status(400).json({
          success: false,
          message: 'Pruebas insuficientes. Intenta con más detalle.'
        });
      }

      const connection = await pool.getConnection();

      try {
        await connection.beginTransaction();

        // 1. Reactivar hábitos (mantener streaks)
        await connection.query(
          `UPDATE HABITS
           SET is_active = 1,
               disabled_reason = NULL
           WHERE user_id = ?
           AND disabled_reason = 'no_lives'
           AND deleted_at IS NULL`,
          [userId]
        );

        // 2. Dar 1 vida
        await connection.query(
          'UPDATE USERS SET lives = 1 WHERE id = ?',
          [userId]
        );

        // 3. Penalizar discipline (-20%)
        await connection.query(
          `UPDATE USER_STATS
           SET discipline_score = FLOOR(discipline_score * 0.8),
               revival_count = revival_count + 1
           WHERE user_id = ?`,
          [userId]
        );

        // 4. Registrar challenge completado
        await connection.query(
          `INSERT INTO USER_CHALLENGES
           (id, user_id, habit_id, challenge_id, status, completed_at)
           VALUES (UUID(), ?, NULL, ?, 'completed', NOW())`,
          [userId, challenge_id]
        );

        // 5. Registrar en LIFE_HISTORY
        await connection.query(
          `INSERT INTO LIFE_HISTORY
           (id, user_id, lives_change, current_lives, reason)
           VALUES (UUID(), ?, 1, 1, 'revival_challenge')`,
          [userId]
        );

        await connection.commit();

        const stats = await UserStatsModel.getForUser(userId);

        res.json({
          success: true,
          message: '¡Penitencia completada! Has revivido con tu progreso intacto.',
          lives: 1,
          stats
        });

      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }

    } catch (error) {
      console.error('Error in challenge revival:', error);
      res.status(500).json({ message: 'Error al completar penitencia' });
    }
  }
}
```

---

## 2. Routes: src/routes/revival.routes.ts

```typescript
import { Router } from 'express';
import { RevivalController } from '../controllers/revival.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

router.use(authMiddleware);

// GET /api/revival/options - Ver opciones disponibles
router.get('/options', RevivalController.getOptions);

// POST /api/revival/reset - Opción A: Reset total
router.post('/reset', RevivalController.resetTotal);

// POST /api/revival/challenge - Opción B: Penitencia
router.post('/challenge', RevivalController.reviveWithChallenge);

export default router;
```

---

## 3. Modificar handleUserDeath()

En `habit-evaluation.service.ts`:

```typescript
async function handleUserDeath(userId: string, connection: any): Promise<void> {
  // Desactivar todos los hábitos
  await connection.query(
    `UPDATE HABITS
     SET is_active = 0,
         disabled_reason = 'no_lives'
     WHERE user_id = ?
     AND is_active = 1
     AND deleted_at IS NULL`,
    [userId]
  );

  // Crear notificación de muerte
  await connection.query(
    `INSERT INTO NOTIFICATIONS
     (id, user_id, type, title, message)
     VALUES (UUID(), ?, 'death', 'Has perdido todas tus vidas',
             'Elige entre empezar de cero o completar una penitencia para revivir')`,
    [userId]
  );
}
```

---

## 4. Agregar 'death' a tipos de notificación

```sql
ALTER TABLE NOTIFICATIONS
MODIFY COLUMN `type` ENUM(
  'habit_reminder',
  'life_warning',
  'challenge_available',
  'league_update',
  'pending_redemption',
  'pending_expiring',
  'death'
) NOT NULL;
```

---

## 5. Agregar nuevos reasons a LIFE_HISTORY

```sql
ALTER TABLE LIFE_HISTORY
MODIFY COLUMN reason ENUM(
  'habit_missed',
  'challenge_completed',
  'life_challenge_redeemed',
  'pending_expired',
  'revival_reset',
  'revival_challenge'
) NOT NULL;
```

---

## 6. Registrar Rutas en app.ts

```typescript
import revivalRoutes from './routes/revival.routes';

// En la sección de rutas:
app.use('/api/revival', revivalRoutes);
```

---

## Middleware de Verificación de Muerte (Opcional)

Crear middleware para bloquear acciones cuando el usuario está muerto:

```typescript
// src/middleware/alive.middleware.ts
export const aliveMiddleware = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user?.id) {
    return next();
  }

  const [[user]] = await pool.query<any>(
    'SELECT lives FROM USERS WHERE id = ?',
    [req.user.id]
  );

  if (user.lives === 0) {
    return res.status(403).json({
      message: 'Estás muerto. Debes revivir primero.',
      is_dead: true,
      revival_url: '/api/revival/options'
    });
  }

  next();
};

// Aplicar a rutas que requieren estar vivo:
// router.post('/habits/:id/completions', aliveMiddleware, ...)
```

---

## Checklist

- [ ] Crear revival.controller.ts
- [ ] Crear revival.routes.ts
- [ ] Registrar rutas en app.ts
- [ ] Modificar handleUserDeath() en habit-evaluation.service.ts
- [ ] Agregar 'death' a NOTIFICATIONS type enum
- [ ] Agregar nuevos reasons a LIFE_HISTORY enum
- [ ] Crear middleware aliveMiddleware (opcional)
- [ ] Aplicar middleware a rutas de completar hábitos
- [ ] Tests para ambas opciones de revival
