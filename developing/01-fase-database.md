# Fase 1: Cambios en Base de Datos

## Objetivo
Crear las nuevas tablas y modificar las existentes para soportar el nuevo sistema.

---

## Nuevas Tablas

### 1. HABIT_CATEGORIES
```sql
CREATE TABLE HABIT_CATEGORIES (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  icon VARCHAR(50),
  color_hex VARCHAR(7)
);

-- Seed data
INSERT INTO HABIT_CATEGORIES (id, name, icon, color_hex) VALUES
('health', 'Salud', 'heart', '#FF6B6B'),
('exercise', 'Ejercicio', 'dumbbell', '#4ECDC4'),
('learning', 'Aprendizaje', 'book', '#45B7D1'),
('productivity', 'Productividad', 'briefcase', '#96CEB4'),
('mindfulness', 'Mindfulness', 'brain', '#DDA0DD'),
('creativity', 'Creatividad', 'palette', '#FFEAA7'),
('social', 'Social', 'users', '#74B9FF'),
('finance', 'Finanzas', 'wallet', '#55E6C1');
```

### 2. USER_STATS
```sql
CREATE TABLE USER_STATS (
  user_id CHAR(36) PRIMARY KEY,
  discipline_score INT NOT NULL DEFAULT 100,
  max_streak INT NOT NULL DEFAULT 0,
  total_completions INT NOT NULL DEFAULT 0,
  perfect_weeks INT NOT NULL DEFAULT 0,
  revival_count INT NOT NULL DEFAULT 0,
  reset_count INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES USERS(id) ON DELETE CASCADE,
  CONSTRAINT chk_discipline_score CHECK (discipline_score >= 0 AND discipline_score <= 1000)
);

-- Índice para queries frecuentes
CREATE INDEX idx_user_stats_discipline ON USER_STATS(discipline_score DESC);
```

### 3. PENDING_REDEMPTIONS
```sql
CREATE TABLE PENDING_REDEMPTIONS (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id CHAR(36) NOT NULL,
  habit_id CHAR(36) NOT NULL,
  failed_date DATE NOT NULL,
  expires_at DATETIME NOT NULL,
  status ENUM('pending', 'redeemed_life', 'redeemed_challenge', 'expired') NOT NULL DEFAULT 'pending',
  resolved_at DATETIME,
  challenge_id CHAR(36),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES USERS(id) ON DELETE CASCADE,
  FOREIGN KEY (habit_id) REFERENCES HABITS(id) ON DELETE CASCADE,
  FOREIGN KEY (challenge_id) REFERENCES CHALLENGES(id),
  UNIQUE (user_id, habit_id, failed_date)
);

-- Índices
CREATE INDEX idx_pending_user_status ON PENDING_REDEMPTIONS(user_id, status);
CREATE INDEX idx_pending_expires ON PENDING_REDEMPTIONS(expires_at, status);
```

---

## Modificaciones a Tablas Existentes

### 4. ALTER HABITS
```sql
-- Agregar categoría a hábitos
ALTER TABLE HABITS
ADD COLUMN category_id VARCHAR(50) NOT NULL DEFAULT 'health' AFTER description,
ADD CONSTRAINT fk_habits_category FOREIGN KEY (category_id) REFERENCES HABIT_CATEGORIES(id);

-- Índice para filtrar por categoría
CREATE INDEX idx_habits_category ON HABITS(category_id);
```

### 5. ALTER CHALLENGES
```sql
-- Agregar categoría y tipo de challenge
ALTER TABLE CHALLENGES
ADD COLUMN category_id VARCHAR(50) AFTER `type`,
ADD COLUMN is_general BOOLEAN NOT NULL DEFAULT FALSE AFTER category_id,
ADD CONSTRAINT fk_challenges_category FOREIGN KEY (category_id) REFERENCES HABIT_CATEGORIES(id);

-- Índices
CREATE INDEX idx_challenges_category ON CHALLENGES(category_id, is_active);
CREATE INDEX idx_challenges_general ON CHALLENGES(is_general, is_active);
```

### 6. ALTER USER_CHALLENGES
```sql
-- Hacer habit_id nullable (para challenges generales)
ALTER TABLE USER_CHALLENGES
MODIFY COLUMN habit_id CHAR(36) NULL;

-- Actualizar el constraint UNIQUE
-- Primero encontrar el nombre del constraint actual
-- SHOW CREATE TABLE USER_CHALLENGES;
-- Luego eliminarlo y crear uno nuevo

ALTER TABLE USER_CHALLENGES
DROP INDEX IF EXISTS user_habit_challenge_unique;

-- Nuevo índice que permite múltiples challenges por usuario
CREATE INDEX idx_user_challenges_user ON USER_CHALLENGES(user_id, status);
```

### 7. ALTER LIFE_HISTORY (agregar nuevo reason)
```sql
-- Modificar ENUM para incluir nuevos reasons
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

## Seed Data: Challenges por Categoría

```sql
-- Challenges generales (para revivir)
INSERT INTO CHALLENGES (id, title, description, difficulty, type, category_id, is_general, estimated_time, is_active) VALUES
(UUID(), 'Reflexión profunda', 'Escribe una reflexión de al menos 200 palabras sobre por qué fallaste y cómo mejorar', 'medium', 'mindfulness', NULL, TRUE, 20, TRUE),
(UUID(), 'Compromiso renovado', 'Graba un video de 1 minuto explicando tu compromiso con tus hábitos', 'hard', 'mindfulness', NULL, TRUE, 15, TRUE),
(UUID(), 'Plan de acción', 'Escribe un plan detallado de cómo evitarás fallar de nuevo', 'easy', 'learning', NULL, TRUE, 15, TRUE);

-- Challenges por categoría (para evitar perder vida)
INSERT INTO CHALLENGES (id, title, description, difficulty, type, category_id, is_general, estimated_time, is_active) VALUES
-- Health
(UUID(), 'Hidratación extra', 'Bebe 8 vasos de agua hoy y envía foto del registro', 'easy', 'exercise', 'health', FALSE, 5, TRUE),
(UUID(), 'Comida saludable', 'Prepara una comida saludable y envía foto', 'medium', 'exercise', 'health', FALSE, 30, TRUE),

-- Exercise
(UUID(), 'Mini rutina', 'Haz 30 flexiones y envía video o foto', 'easy', 'exercise', 'exercise', FALSE, 5, TRUE),
(UUID(), 'Caminata rápida', 'Camina 2km y envía captura del GPS', 'medium', 'exercise', 'exercise', FALSE, 25, TRUE),
(UUID(), 'HIIT express', 'Completa una rutina HIIT de 15 minutos', 'hard', 'exercise', 'exercise', FALSE, 20, TRUE),

-- Learning
(UUID(), 'Lectura compensatoria', 'Lee 15 páginas de un libro y resume lo aprendido', 'easy', 'learning', 'learning', FALSE, 20, TRUE),
(UUID(), 'Resumen de capítulo', 'Resume un capítulo completo por escrito', 'medium', 'learning', 'learning', FALSE, 30, TRUE),

-- Productivity
(UUID(), 'Tareas pendientes', 'Completa 3 tareas que tengas pendientes', 'easy', 'learning', 'productivity', FALSE, 30, TRUE),
(UUID(), 'Organización', 'Organiza tu espacio de trabajo y envía foto del antes/después', 'medium', 'learning', 'productivity', FALSE, 45, TRUE),

-- Mindfulness
(UUID(), 'Meditación express', 'Medita 10 minutos con una app y envía captura', 'easy', 'mindfulness', 'mindfulness', FALSE, 12, TRUE),
(UUID(), 'Gratitud', 'Escribe 5 cosas por las que estás agradecido hoy', 'easy', 'mindfulness', 'mindfulness', FALSE, 10, TRUE),

-- Creativity
(UUID(), 'Sketch rápido', 'Dibuja algo durante 15 minutos y envía foto', 'medium', 'creative', 'creativity', FALSE, 18, TRUE),
(UUID(), 'Escritura libre', 'Escribe 300 palabras sobre cualquier tema', 'medium', 'creative', 'creativity', FALSE, 20, TRUE),

-- Social
(UUID(), 'Conexión social', 'Llama a un amigo o familiar por al menos 10 minutos', 'easy', 'mindfulness', 'social', FALSE, 15, TRUE),
(UUID(), 'Mensaje significativo', 'Envía un mensaje de agradecimiento a alguien importante', 'easy', 'mindfulness', 'social', FALSE, 10, TRUE),

-- Finance
(UUID(), 'Revisión financiera', 'Revisa tus gastos del último mes y anota 3 áreas de mejora', 'medium', 'learning', 'finance', FALSE, 25, TRUE),
(UUID(), 'Mini ahorro', 'Transfiere cualquier cantidad a tu cuenta de ahorros', 'easy', 'learning', 'finance', FALSE, 5, TRUE);
```

---

## Script de Migración Completo

Ver archivo: `migrations/001_challenges_system.sql`

---

## Checklist

- [ ] Crear tabla HABIT_CATEGORIES
- [ ] Insertar categorías seed
- [ ] Crear tabla USER_STATS
- [ ] Crear tabla PENDING_REDEMPTIONS
- [ ] ALTER HABITS: agregar category_id
- [ ] ALTER CHALLENGES: agregar category_id, is_general
- [ ] ALTER USER_CHALLENGES: habit_id nullable
- [ ] ALTER LIFE_HISTORY: nuevos reasons
- [ ] Insertar challenges generales
- [ ] Insertar challenges por categoría
- [ ] Crear USER_STATS para usuarios existentes
