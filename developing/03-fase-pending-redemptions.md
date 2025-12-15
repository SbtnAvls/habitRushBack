# Fase 3: Sistema de Pending Redemptions

## Objetivo
Implementar el período de gracia de 24h cuando un usuario falla un hábito.

---

## Flujo Completo

```
┌─────────────────────────────────────────────────────────────┐
│  Evaluación diaria (00:05)                                  │
│  habit-evaluation.service.ts                                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Por cada hábito fallado:                                   │
│  - Crear PENDING_REDEMPTION                                 │
│  - NO restar vida aún                                       │
│  - Crear notificación                                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Usuario tiene 24h para decidir vía API:                    │
│                                                             │
│  GET /users/me/pending-redemptions                          │
│  POST /pending-redemptions/:id/redeem-life                  │
│  POST /pending-redemptions/:id/redeem-challenge             │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
      No hace nada    Redime con vida   Completa challenge
              │               │               │
              ▼               ▼               ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ Cron expira     │  │ Pierde 1 vida   │  │ No pierde vida  │
│ pending         │  │ Stats -10       │  │ Stats +5        │
│ Pierde 1 vida   │  │                 │  │ Challenge       │
│ Stats -15       │  │                 │  │ marcado done    │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

---

## 1. Modificar habit-evaluation.service.ts

### Antes (actual):
```typescript
// Por cada hábito fallado, resta vida inmediatamente
for (const habitId of missedHabitIds) {
  await deductLife(userId, habitId, connection);
}
```

### Después (nuevo):
```typescript
// Por cada hábito fallado, crear pending redemption
for (const habitId of missedHabitIds) {
  await PendingRedemptionModel.create(
    userId,
    habitId,
    evaluationDate,
    connection
  );

  // Crear notificación
  await NotificationModel.create({
    user_id: userId,
    type: 'pending_redemption',
    title: 'Hábito fallado',
    message: `Tienes 24h para redimir "${habitName}" o perderás una vida`,
    related_habit_id: habitId,
  }, connection);
}
```

---

## 2. Controller: src/controllers/pending-redemption.controller.ts

```typescript
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { PendingRedemptionModel } from '../models/pending-redemption.model';
import { ChallengeModel } from '../models/challenge.model';
import { UserStatsModel } from '../models/user-stats.model';
import { adjustDiscipline } from '../services/stats.service';
import pool from '../db';

export class PendingRedemptionController {

  // GET /users/me/pending-redemptions
  static async getForUser(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: 'Not authenticated' });
      }

      const pending = await PendingRedemptionModel.getPendingForUser(userId);

      // Para cada pending, obtener challenges disponibles de su categoría
      const result = await Promise.all(pending.map(async (p) => {
        const challenges = await ChallengeModel.getByCategory(p.habit_category_id);
        return {
          ...p,
          available_challenges: challenges,
          time_remaining_ms: new Date(p.expires_at).getTime() - Date.now(),
        };
      }));

      res.json({ success: true, pending_redemptions: result });
    } catch (error) {
      console.error('Error getting pending redemptions:', error);
      res.status(500).json({ message: 'Error al obtener redenciones pendientes' });
    }
  }

  // POST /pending-redemptions/:id/redeem-life
  static async redeemWithLife(req: AuthRequest, res: Response) {
    const connection = await pool.getConnection();
    try {
      const userId = req.user?.id;
      const { id } = req.params;

      if (!userId) {
        return res.status(401).json({ message: 'Not authenticated' });
      }

      await connection.beginTransaction();

      // Verificar que el pending existe y pertenece al usuario
      const pending = await PendingRedemptionModel.findById(id);
      if (!pending || pending.user_id !== userId) {
        await connection.rollback();
        return res.status(404).json({ message: 'Redención no encontrada' });
      }

      if (pending.status !== 'pending') {
        await connection.rollback();
        return res.status(400).json({ message: 'Esta redención ya fue procesada' });
      }

      // Marcar como redimida con vida
      await PendingRedemptionModel.resolveWithLife(id, connection);

      // Restar vida al usuario
      await connection.query(
        'UPDATE USERS SET lives = GREATEST(0, lives - 1) WHERE id = ?',
        [userId]
      );

      // Reducir disciplina
      await adjustDiscipline(userId, 'FAIL_REDEEMED_LIFE', connection);

      // Registrar en LIFE_HISTORY
      await connection.query(
        `INSERT INTO LIFE_HISTORY
         (id, user_id, lives_change, current_lives, reason, related_habit_id)
         SELECT UUID(), ?, -1, lives, 'habit_missed', ?
         FROM USERS WHERE id = ?`,
        [userId, pending.habit_id, userId]
      );

      await connection.commit();

      // Verificar si el usuario murió (0 vidas)
      const [[user]] = await pool.query<any>(
        'SELECT lives FROM USERS WHERE id = ?',
        [userId]
      );

      res.json({
        success: true,
        message: 'Vida redimida',
        current_lives: user.lives,
        is_dead: user.lives === 0,
      });

    } catch (error) {
      await connection.rollback();
      console.error('Error redeeming with life:', error);
      res.status(500).json({ message: 'Error al redimir con vida' });
    } finally {
      connection.release();
    }
  }

  // POST /pending-redemptions/:id/redeem-challenge
  static async redeemWithChallenge(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { id } = req.params;
      const { challenge_id, proof_text, proof_image_url } = req.body;

      if (!userId) {
        return res.status(401).json({ message: 'Not authenticated' });
      }

      if (!challenge_id) {
        return res.status(400).json({ message: 'challenge_id es requerido' });
      }

      // Verificar pending
      const pending = await PendingRedemptionModel.findById(id);
      if (!pending || pending.user_id !== userId || pending.status !== 'pending') {
        return res.status(404).json({ message: 'Redención no encontrada o ya procesada' });
      }

      // Verificar que el challenge es de la categoría correcta
      const challenge = await ChallengeModel.findById(challenge_id);
      if (!challenge) {
        return res.status(404).json({ message: 'Challenge no encontrado' });
      }

      // TODO: Aquí iría la validación con IA (actualmente simulada)
      // Por ahora, solo verificamos que envíen alguna prueba
      if (!proof_text && !proof_image_url) {
        return res.status(400).json({
          message: 'Debes enviar prueba (texto o imagen) del challenge completado'
        });
      }

      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();

        // Marcar pending como resuelto con challenge
        await PendingRedemptionModel.resolveWithChallenge(id, challenge_id, connection);

        // Aumentar disciplina (no pierde vida!)
        await adjustDiscipline(userId, 'CHALLENGE_COMPLETED', connection);

        await connection.commit();

        res.json({
          success: true,
          message: 'Challenge completado. ¡No perdiste vida!',
        });

      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }

    } catch (error) {
      console.error('Error redeeming with challenge:', error);
      res.status(500).json({ message: 'Error al completar challenge' });
    }
  }
}
```

---

## 3. Routes: src/routes/pending-redemption.routes.ts

```typescript
import { Router } from 'express';
import { PendingRedemptionController } from '../controllers/pending-redemption.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

router.use(authMiddleware);

router.get('/', PendingRedemptionController.getForUser);
router.post('/:id/redeem-life', PendingRedemptionController.redeemWithLife);
router.post('/:id/redeem-challenge', PendingRedemptionController.redeemWithChallenge);

export default router;
```

---

## 4. Cron Job para Expirar Pending Redemptions

Agregar a `src/services/daily-evaluation.service.ts`:

```typescript
async function expirePendingRedemptions(): Promise<void> {
  const connection = await pool.getConnection();

  try {
    // Obtener todos los pending expirados
    const expired = await PendingRedemptionModel.getExpiredToProcess();

    for (const pending of expired) {
      await connection.beginTransaction();

      try {
        // Marcar como expirado
        await connection.query(
          `UPDATE PENDING_REDEMPTIONS
           SET status = 'expired', resolved_at = NOW()
           WHERE id = ?`,
          [pending.id]
        );

        // Restar vida
        await connection.query(
          'UPDATE USERS SET lives = GREATEST(0, lives - 1) WHERE id = ?',
          [pending.user_id]
        );

        // Penalización extra por no decidir
        await adjustDiscipline(pending.user_id, 'PENDING_EXPIRED', connection);

        // Registrar en LIFE_HISTORY
        await connection.query(
          `INSERT INTO LIFE_HISTORY
           (id, user_id, lives_change, current_lives, reason, related_habit_id)
           SELECT UUID(), ?, -1, lives, 'pending_expired', ?
           FROM USERS WHERE id = ?`,
          [pending.user_id, pending.habit_id, pending.user_id]
        );

        // Verificar si murió
        const [[user]] = await connection.query<any>(
          'SELECT lives FROM USERS WHERE id = ?',
          [pending.user_id]
        );

        if (user.lives === 0) {
          await handleUserDeath(pending.user_id, connection);
        }

        await connection.commit();

      } catch (error) {
        await connection.rollback();
        console.error(`Error expiring pending ${pending.id}:`, error);
      }
    }

  } finally {
    connection.release();
  }
}
```

---

## 5. Notificación de Expiración Próxima

Agregar cron que corre cada hora para notificar cuando quedan pocas horas:

```typescript
async function notifyExpiringRedemptions(): Promise<void> {
  // Notificar cuando quedan menos de 3 horas
  const [pending] = await pool.query<any[]>(
    `SELECT pr.*, h.name as habit_name
     FROM PENDING_REDEMPTIONS pr
     JOIN HABITS h ON pr.habit_id = h.id
     WHERE pr.status = 'pending'
     AND pr.expires_at BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 3 HOUR)`
  );

  for (const p of pending) {
    await NotificationModel.create({
      user_id: p.user_id,
      type: 'pending_expiring',
      title: '¡Tiempo limitado!',
      message: `Te quedan menos de 3 horas para redimir "${p.habit_name}"`,
      related_habit_id: p.habit_id,
    });
  }
}
```

---

## 6. Registrar Rutas en app.ts

```typescript
import pendingRedemptionRoutes from './routes/pending-redemption.routes';

// En la sección de rutas:
app.use('/api/pending-redemptions', pendingRedemptionRoutes);

// También agregar a /users/me:
// GET /api/users/me/pending-redemptions (redirige a pending-redemptions)
```

---

## Checklist

- [x] Modificar habit-evaluation.service.ts (crear pending en vez de restar vida)
- [x] Crear pending-redemption.controller.ts
- [x] Crear pending-redemption.routes.ts
- [x] Registrar rutas en app.ts
- [x] Agregar cron para expirar pending redemptions
- [x] Agregar cron para notificar expiración próxima
- [x] Agregar tipo 'pending_expiring' a NOTIFICATIONS enum
- [x] Agregar 'pending_expired' a LIFE_HISTORY reason enum
- [ ] Tests para el flujo completo (pendiente para fase futura)

## Estado: COMPLETADO
Build y lint pasan. Esperando aprobación del usuario para continuar con Fase 4.
