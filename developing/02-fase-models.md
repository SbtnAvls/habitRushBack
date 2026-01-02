# Fase 2: Modelos TypeScript

## Objetivo
Crear los modelos para las nuevas tablas y modificar los existentes.

---

## Nuevos Modelos

### 1. src/models/habit-category.model.ts

```typescript
import { RowDataPacket } from 'mysql2';
import pool from '../db';

export interface HabitCategory {
  id: string;
  name: string;
  icon: string | null;
  color_hex: string | null;
}

interface HabitCategoryRow extends RowDataPacket, HabitCategory {}

export class HabitCategoryModel {
  static async getAll(): Promise<HabitCategory[]> {
    const [rows] = await pool.query<HabitCategoryRow[]>(
      'SELECT * FROM HABIT_CATEGORIES ORDER BY name'
    );
    return rows;
  }

  static async findById(id: string): Promise<HabitCategory | null> {
    const [rows] = await pool.query<HabitCategoryRow[]>(
      'SELECT * FROM HABIT_CATEGORIES WHERE id = ?',
      [id]
    );
    return rows.length > 0 ? rows[0] : null;
  }
}
```

### 2. src/models/user-stats.model.ts

```typescript
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import pool from '../db';

export interface UserStats {
  user_id: string;
  discipline_score: number;
  max_streak: number;
  total_completions: number;
  perfect_weeks: number;
  revival_count: number;
  reset_count: number;
  created_at: Date;
  updated_at: Date;
}

interface UserStatsRow extends RowDataPacket, UserStats {}

export class UserStatsModel {
  static async getForUser(userId: string): Promise<UserStats | null> {
    const [rows] = await pool.query<UserStatsRow[]>(
      'SELECT * FROM USER_STATS WHERE user_id = ?',
      [userId]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  static async createForUser(userId: string): Promise<UserStats> {
    await pool.query(
      'INSERT INTO USER_STATS (user_id) VALUES (?)',
      [userId]
    );
    return this.getForUser(userId) as Promise<UserStats>;
  }

  static async getOrCreate(userId: string): Promise<UserStats> {
    const existing = await this.getForUser(userId);
    if (existing) return existing;
    return this.createForUser(userId);
  }

  static async updateDiscipline(
    userId: string,
    change: number,
    connection?: any
  ): Promise<void> {
    const conn = connection || pool;
    await conn.query(
      `UPDATE USER_STATS
       SET discipline_score = LEAST(1000, GREATEST(0, discipline_score + ?))
       WHERE user_id = ?`,
      [change, userId]
    );
  }

  static async incrementStat(
    userId: string,
    stat: 'total_completions' | 'perfect_weeks' | 'revival_count' | 'reset_count',
    connection?: any
  ): Promise<void> {
    const conn = connection || pool;
    await conn.query(
      `UPDATE USER_STATS SET ${stat} = ${stat} + 1 WHERE user_id = ?`,
      [userId]
    );
  }

  static async updateMaxStreak(userId: string, streak: number): Promise<void> {
    await pool.query(
      `UPDATE USER_STATS
       SET max_streak = GREATEST(max_streak, ?)
       WHERE user_id = ?`,
      [streak, userId]
    );
  }
}
```

### 3. src/models/pending-redemption.model.ts

```typescript
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import pool from '../db';
import { v4 as uuidv4 } from 'uuid';

export type PendingRedemptionStatus =
  | 'pending'
  | 'redeemed_life'
  | 'redeemed_challenge'
  | 'expired';

export interface PendingRedemption {
  id: string;
  user_id: string;
  habit_id: string;
  failed_date: Date;
  expires_at: Date;
  status: PendingRedemptionStatus;
  resolved_at: Date | null;
  challenge_id: string | null;
  created_at: Date;
}

export interface PendingRedemptionWithDetails extends PendingRedemption {
  habit_name: string;
  habit_category_id: string;
  category_name: string;
}

interface PendingRedemptionRow extends RowDataPacket, PendingRedemption {}
interface PendingRedemptionDetailsRow extends RowDataPacket, PendingRedemptionWithDetails {}

export class PendingRedemptionModel {
  static async create(
    userId: string,
    habitId: string,
    failedDate: Date,
    connection?: any
  ): Promise<string> {
    const conn = connection || pool;
    const id = uuidv4();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    await conn.query(
      `INSERT INTO PENDING_REDEMPTIONS
       (id, user_id, habit_id, failed_date, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
      [id, userId, habitId, failedDate, expiresAt]
    );

    return id;
  }

  static async getPendingForUser(userId: string): Promise<PendingRedemptionWithDetails[]> {
    const [rows] = await pool.query<PendingRedemptionDetailsRow[]>(
      `SELECT pr.*,
              h.name as habit_name,
              h.category_id as habit_category_id,
              hc.name as category_name
       FROM PENDING_REDEMPTIONS pr
       JOIN HABITS h ON pr.habit_id = h.id
       JOIN HABIT_CATEGORIES hc ON h.category_id = hc.id
       WHERE pr.user_id = ? AND pr.status = 'pending'
       ORDER BY pr.expires_at ASC`,
      [userId]
    );
    return rows;
  }

  static async findById(id: string): Promise<PendingRedemption | null> {
    const [rows] = await pool.query<PendingRedemptionRow[]>(
      'SELECT * FROM PENDING_REDEMPTIONS WHERE id = ?',
      [id]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  static async resolveWithLife(id: string, connection?: any): Promise<void> {
    const conn = connection || pool;
    await conn.query(
      `UPDATE PENDING_REDEMPTIONS
       SET status = 'redeemed_life', resolved_at = NOW()
       WHERE id = ?`,
      [id]
    );
  }

  static async resolveWithChallenge(
    id: string,
    challengeId: string,
    connection?: any
  ): Promise<void> {
    const conn = connection || pool;
    await conn.query(
      `UPDATE PENDING_REDEMPTIONS
       SET status = 'redeemed_challenge',
           resolved_at = NOW(),
           challenge_id = ?
       WHERE id = ?`,
      [challengeId, id]
    );
  }

  static async expirePending(connection?: any): Promise<number> {
    const conn = connection || pool;
    const [result] = await conn.query<ResultSetHeader>(
      `UPDATE PENDING_REDEMPTIONS
       SET status = 'expired', resolved_at = NOW()
       WHERE status = 'pending' AND expires_at < NOW()`
    );
    return result.affectedRows;
  }

  static async getExpiredToProcess(): Promise<PendingRedemption[]> {
    const [rows] = await pool.query<PendingRedemptionRow[]>(
      `SELECT * FROM PENDING_REDEMPTIONS
       WHERE status = 'pending' AND expires_at < NOW()`
    );
    return rows;
  }
}
```

---

## Modelos a Modificar

### 4. Modificar src/models/habit.model.ts

Agregar `category_id` a la interfaz y queries:

```typescript
// En la interfaz Habit, agregar:
category_id: string;

// En createHabit, agregar category_id al INSERT
// En findHabitById, asegurar que se retorna category_id
// En updateHabit, permitir actualizar category_id
```

### 5. Modificar src/models/challenge.model.ts

Agregar `category_id` e `is_general`:

```typescript
// En la interfaz Challenge, agregar:
category_id: string | null;
is_general: boolean;

// Nuevos métodos:
static async getByCategory(categoryId: string): Promise<Challenge[]>
static async getGeneralChallenges(): Promise<Challenge[]>
```

### 6. Modificar src/models/user-challenge.model.ts

Hacer `habit_id` nullable:

```typescript
// En la interfaz:
habit_id: string | null;

// En assign(), hacer habitId opcional
```

---

## Nuevo Servicio: src/services/stats.service.ts

```typescript
import { UserStatsModel } from '../models/user-stats.model';

export const DISCIPLINE_CHANGES = {
  HABIT_COMPLETED: 1,
  PERFECT_WEEK: 10,
  CHALLENGE_COMPLETED: 5,
  LIFE_CHALLENGE_REDEEMED: 5,
  FAIL_REDEEMED_LIFE: -10,
  PENDING_EXPIRED: -15,
  DEATH_CHALLENGE: -20,
  DEATH_RESET: -50,
};

export async function adjustDiscipline(
  userId: string,
  event: keyof typeof DISCIPLINE_CHANGES,
  connection?: any
): Promise<void> {
  const change = DISCIPLINE_CHANGES[event];
  await UserStatsModel.updateDiscipline(userId, change, connection);
}

export async function onHabitCompleted(
  userId: string,
  currentStreak: number
): Promise<void> {
  await adjustDiscipline(userId, 'HABIT_COMPLETED');
  await UserStatsModel.incrementStat(userId, 'total_completions');
  await UserStatsModel.updateMaxStreak(userId, currentStreak);
}
```

---

## Checklist

- [x] Crear habit-category.model.ts
- [x] Crear user-stats.model.ts
- [x] Crear pending-redemption.model.ts
- [x] Crear stats.service.ts
- [x] Modificar habit.model.ts (category_id)
- [x] Modificar challenge.model.ts (category_id, is_general, nuevos métodos)
- [x] Modificar user-challenge.model.ts (habit_id nullable)
- [x] Modificar habit.controller.ts (category_id en create)
- [ ] Actualizar tests existentes (pendiente para futura fase)

## Estado: COMPLETADO
Build pasa correctamente. Esperando aprobación del usuario para continuar.
