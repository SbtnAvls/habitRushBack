# Fase 5: Challenges por Categoría

## Objetivo
Permitir que los usuarios completen challenges específicos de la categoría de su hábito fallado para evitar perder vidas.

---

## Flujo

```
Usuario falla hábito de categoría "exercise"
                    │
                    ▼
┌─────────────────────────────────────────┐
│  Se crea PENDING_REDEMPTION             │
│  habit_category_id = 'exercise'         │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│  Usuario consulta pending redemptions   │
│  GET /pending-redemptions               │
│                                         │
│  Response incluye:                      │
│  - available_challenges (de 'exercise') │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│  Usuario elige challenge de ejercicio   │
│  "Hacer 30 flexiones"                   │
│                                         │
│  POST /pending-redemptions/:id/         │
│        redeem-challenge                 │
│  { challenge_id, proof_image_url }      │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│  Validación (simulada por ahora)        │
│  Si válida → No pierde vida, +5 stats   │
│  Si no → Puede reintentar               │
└─────────────────────────────────────────┘
```

---

## 1. Modificar src/models/challenge.model.ts

Agregar métodos para obtener challenges por categoría:

```typescript
import { RowDataPacket } from 'mysql2';
import pool from '../db';

export interface Challenge {
  id: string;
  title: string;
  description: string;
  difficulty: 'easy' | 'medium' | 'hard';
  type: 'exercise' | 'learning' | 'mindfulness' | 'creative';
  category_id: string | null;
  is_general: boolean;
  estimated_time: number;
  is_active: boolean;
  created_at: Date;
}

interface ChallengeRow extends RowDataPacket, Challenge {}

export class ChallengeModel {
  // ... métodos existentes ...

  /**
   * Obtiene challenges específicos de una categoría
   */
  static async getByCategory(categoryId: string): Promise<Challenge[]> {
    const [rows] = await pool.query<ChallengeRow[]>(
      `SELECT * FROM CHALLENGES
       WHERE category_id = ?
       AND is_active = TRUE
       AND is_general = FALSE
       ORDER BY difficulty, estimated_time`,
      [categoryId]
    );
    return rows;
  }

  /**
   * Obtiene challenges generales (para revival)
   */
  static async getGeneralChallenges(): Promise<Challenge[]> {
    const [rows] = await pool.query<ChallengeRow[]>(
      `SELECT * FROM CHALLENGES
       WHERE is_general = TRUE
       AND is_active = TRUE
       ORDER BY difficulty, estimated_time`
    );
    return rows;
  }

  /**
   * Obtiene un challenge aleatorio de una categoría
   */
  static async getRandomByCategory(categoryId: string): Promise<Challenge | null> {
    const [rows] = await pool.query<ChallengeRow[]>(
      `SELECT * FROM CHALLENGES
       WHERE category_id = ?
       AND is_active = TRUE
       AND is_general = FALSE
       ORDER BY RAND()
       LIMIT 1`,
      [categoryId]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Verifica que un challenge pertenece a una categoría
   */
  static async belongsToCategory(
    challengeId: string,
    categoryId: string
  ): Promise<boolean> {
    const [rows] = await pool.query<ChallengeRow[]>(
      `SELECT id FROM CHALLENGES
       WHERE id = ? AND category_id = ? AND is_active = TRUE`,
      [challengeId, categoryId]
    );
    return rows.length > 0;
  }
}
```

---

## 2. Nuevo Endpoint: GET /challenges/by-category/:categoryId

En `src/controllers/challenge.controller.ts`:

```typescript
// GET /api/challenges/by-category/:categoryId
static async getByCategory(req: AuthRequest, res: Response) {
  try {
    const { categoryId } = req.params;

    // Verificar que la categoría existe
    const category = await HabitCategoryModel.findById(categoryId);
    if (!category) {
      return res.status(404).json({ message: 'Categoría no encontrada' });
    }

    const challenges = await ChallengeModel.getByCategory(categoryId);

    res.json({
      success: true,
      category,
      challenges
    });

  } catch (error) {
    console.error('Error getting challenges by category:', error);
    res.status(500).json({ message: 'Error al obtener challenges' });
  }
}

// GET /api/challenges/general
static async getGeneralChallenges(req: AuthRequest, res: Response) {
  try {
    const challenges = await ChallengeModel.getGeneralChallenges();
    res.json({ success: true, challenges });
  } catch (error) {
    console.error('Error getting general challenges:', error);
    res.status(500).json({ message: 'Error al obtener challenges generales' });
  }
}
```

---

## 3. Actualizar Rutas de Challenges

En `src/routes/challenge.routes.ts`:

```typescript
// Agregar nuevas rutas
router.get('/by-category/:categoryId', ChallengeController.getByCategory);
router.get('/general', ChallengeController.getGeneralChallenges);
```

---

## 4. Validación en Pending Redemptions

Modificar `redeemWithChallenge` para validar que el challenge corresponde a la categoría:

```typescript
// POST /pending-redemptions/:id/redeem-challenge
static async redeemWithChallenge(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    const { challenge_id, proof_text, proof_image_url } = req.body;

    // ... validaciones básicas ...

    // Obtener el pending con detalles del hábito
    const [pendingRows] = await pool.query<any>(
      `SELECT pr.*, h.category_id
       FROM PENDING_REDEMPTIONS pr
       JOIN HABITS h ON pr.habit_id = h.id
       WHERE pr.id = ? AND pr.user_id = ?`,
      [id, userId]
    );

    if (pendingRows.length === 0 || pendingRows[0].status !== 'pending') {
      return res.status(404).json({ message: 'Redención no encontrada' });
    }

    const pending = pendingRows[0];

    // Verificar que el challenge pertenece a la categoría correcta
    const isValidChallenge = await ChallengeModel.belongsToCategory(
      challenge_id,
      pending.category_id
    );

    if (!isValidChallenge) {
      return res.status(400).json({
        message: `Este challenge no es de la categoría correcta. Necesitas un challenge de "${pending.category_id}"`
      });
    }

    // ... resto de la lógica de validación y guardado ...
  }
}
```

---

## 5. Seed Data de Challenges por Categoría

Archivo: `migrations/002_category_challenges_seed.sql`

```sql
-- Health challenges
INSERT INTO CHALLENGES (id, title, description, difficulty, type, category_id, is_general, estimated_time) VALUES
(UUID(), 'Hidratación completa', 'Bebe 8 vasos de agua hoy. Toma foto de tu botella/vaso cada vez.', 'easy', 'exercise', 'health', FALSE, 5),
(UUID(), 'Comida casera', 'Prepara una comida saludable en casa. Envía foto del plato.', 'medium', 'exercise', 'health', FALSE, 45),
(UUID(), 'Día sin azúcar', 'Pasa un día completo sin consumir azúcar añadida. Documenta tus comidas.', 'hard', 'exercise', 'health', FALSE, 1440);

-- Exercise challenges
INSERT INTO CHALLENGES (id, title, description, difficulty, type, category_id, is_general, estimated_time) VALUES
(UUID(), '30 flexiones', 'Realiza 30 flexiones. Puedes dividirlas en series. Envía video.', 'easy', 'exercise', 'exercise', FALSE, 5),
(UUID(), 'Caminata de 2km', 'Camina 2 kilómetros. Envía captura de tu app de tracking.', 'medium', 'exercise', 'exercise', FALSE, 25),
(UUID(), 'HIIT de 20 minutos', 'Completa una rutina HIIT de 20 minutos. Envía video o captura de app.', 'hard', 'exercise', 'exercise', FALSE, 25),
(UUID(), '100 sentadillas', 'Realiza 100 sentadillas a lo largo del día. Documenta tu progreso.', 'medium', 'exercise', 'exercise', FALSE, 15);

-- Learning challenges
INSERT INTO CHALLENGES (id, title, description, difficulty, type, category_id, is_general, estimated_time) VALUES
(UUID(), 'Lee 15 páginas', 'Lee 15 páginas de cualquier libro. Resume lo que aprendiste.', 'easy', 'learning', 'learning', FALSE, 20),
(UUID(), 'Resumen de capítulo', 'Lee y resume un capítulo completo de un libro. Mínimo 150 palabras.', 'medium', 'learning', 'learning', FALSE, 45),
(UUID(), 'Video educativo', 'Mira un video educativo de +20 min y escribe 3 cosas que aprendiste.', 'easy', 'learning', 'learning', FALSE, 30),
(UUID(), 'Aprende algo nuevo', 'Dedica 30 min a aprender algo nuevo (idioma, skill, etc). Documenta tu progreso.', 'medium', 'learning', 'learning', FALSE, 35);

-- Productivity challenges
INSERT INTO CHALLENGES (id, title, description, difficulty, type, category_id, is_general, estimated_time) VALUES
(UUID(), '3 tareas pendientes', 'Completa 3 tareas que tengas pendientes. Lista cuáles fueron.', 'easy', 'learning', 'productivity', FALSE, 30),
(UUID(), 'Inbox cero', 'Organiza tu bandeja de entrada hasta tener 0 emails sin leer/procesar.', 'medium', 'learning', 'productivity', FALSE, 45),
(UUID(), 'Organiza tu espacio', 'Organiza y limpia tu espacio de trabajo. Envía foto antes/después.', 'medium', 'learning', 'productivity', FALSE, 30),
(UUID(), 'Planifica la semana', 'Crea un plan detallado para la próxima semana. Envía captura.', 'easy', 'learning', 'productivity', FALSE, 20);

-- Mindfulness challenges
INSERT INTO CHALLENGES (id, title, description, difficulty, type, category_id, is_general, estimated_time) VALUES
(UUID(), 'Meditación 10 min', 'Medita durante 10 minutos. Usa una app y envía captura.', 'easy', 'mindfulness', 'mindfulness', FALSE, 12),
(UUID(), 'Diario de gratitud', 'Escribe 5 cosas por las que estás agradecido hoy con detalle.', 'easy', 'mindfulness', 'mindfulness', FALSE, 10),
(UUID(), 'Respiración consciente', 'Practica ejercicios de respiración por 15 minutos. Describe tu experiencia.', 'medium', 'mindfulness', 'mindfulness', FALSE, 18),
(UUID(), 'Desconexión digital', 'Pasa 2 horas sin pantallas. Describe qué hiciste en ese tiempo.', 'hard', 'mindfulness', 'mindfulness', FALSE, 120);

-- Creativity challenges
INSERT INTO CHALLENGES (id, title, description, difficulty, type, category_id, is_general, estimated_time) VALUES
(UUID(), 'Dibuja 15 minutos', 'Dibuja lo que quieras durante 15 minutos. Envía foto de tu obra.', 'easy', 'creative', 'creativity', FALSE, 18),
(UUID(), 'Escribe 300 palabras', 'Escribe un texto de al menos 300 palabras sobre cualquier tema.', 'medium', 'creative', 'creativity', FALSE, 20),
(UUID(), 'Foto artística', 'Toma una foto artística/creativa. Explica tu concepto.', 'easy', 'creative', 'creativity', FALSE, 15),
(UUID(), 'Crea algo nuevo', 'Crea algo con tus manos (manualidad, cocina creativa, etc). Envía foto.', 'medium', 'creative', 'creativity', FALSE, 45);

-- Social challenges
INSERT INTO CHALLENGES (id, title, description, difficulty, type, category_id, is_general, estimated_time) VALUES
(UUID(), 'Llamada de 10 min', 'Llama a un amigo o familiar y habla al menos 10 minutos.', 'easy', 'mindfulness', 'social', FALSE, 15),
(UUID(), 'Mensaje de gratitud', 'Envía un mensaje sincero de agradecimiento a alguien importante.', 'easy', 'mindfulness', 'social', FALSE, 10),
(UUID(), 'Reconecta', 'Contacta a alguien con quien no hablas hace tiempo. Cuenta cómo fue.', 'medium', 'mindfulness', 'social', FALSE, 20),
(UUID(), 'Ayuda a alguien', 'Haz algo útil por alguien hoy. Describe qué hiciste.', 'medium', 'mindfulness', 'social', FALSE, 30);

-- Finance challenges
INSERT INTO CHALLENGES (id, title, description, difficulty, type, category_id, is_general, estimated_time) VALUES
(UUID(), 'Revisa gastos', 'Revisa tus gastos del último mes. Lista 3 áreas donde podrías ahorrar.', 'medium', 'learning', 'finance', FALSE, 25),
(UUID(), 'Micro-ahorro', 'Transfiere cualquier cantidad a tu cuenta de ahorros. Envía comprobante.', 'easy', 'learning', 'finance', FALSE, 5),
(UUID(), 'Cancela suscripción', 'Identifica y cancela una suscripción que no uses. Documenta cuál.', 'easy', 'learning', 'finance', FALSE, 15),
(UUID(), 'Presupuesto mensual', 'Crea un presupuesto detallado para el próximo mes. Envía captura.', 'medium', 'learning', 'finance', FALSE, 30);
```

---

## 6. Endpoint para Categorías

Crear `src/routes/category.routes.ts`:

```typescript
import { Router } from 'express';
import { HabitCategoryModel } from '../models/habit-category.model';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

router.use(authMiddleware);

// GET /api/categories
router.get('/', async (req, res) => {
  try {
    const categories = await HabitCategoryModel.getAll();
    res.json({ success: true, categories });
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener categorías' });
  }
});

export default router;
```

---

## Checklist

- [ ] Modificar challenge.model.ts (nuevos métodos)
- [ ] Agregar endpoint GET /challenges/by-category/:categoryId
- [ ] Agregar endpoint GET /challenges/general
- [ ] Crear category.routes.ts
- [ ] Registrar rutas en app.ts
- [ ] Validar categoría en redeemWithChallenge
- [ ] Insertar challenges seed por categoría
- [ ] Tests para filtrado por categoría
