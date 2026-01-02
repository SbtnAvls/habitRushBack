-- Migration: Challenges and Skills System
-- Date: 2025-12-14
-- Description: Adds support for habit categories, user stats, pending redemptions,
--              and modifies challenges system for category-specific and general challenges.

-- ============================================================================
-- PART 1: NEW TABLES
-- ============================================================================

-- HABIT_CATEGORIES: Catalog of habit categories
CREATE TABLE IF NOT EXISTS HABIT_CATEGORIES (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  icon VARCHAR(50),
  color_hex VARCHAR(7)
);

-- Seed data for categories
INSERT INTO HABIT_CATEGORIES (id, name, icon, color_hex) VALUES
('health', 'Salud', 'heart', '#FF6B6B'),
('exercise', 'Ejercicio', 'dumbbell', '#4ECDC4'),
('learning', 'Aprendizaje', 'book', '#45B7D1'),
('productivity', 'Productividad', 'briefcase', '#96CEB4'),
('mindfulness', 'Mindfulness', 'brain', '#DDA0DD'),
('creativity', 'Creatividad', 'palette', '#FFEAA7'),
('social', 'Social', 'users', '#74B9FF'),
('finance', 'Finanzas', 'wallet', '#55E6C1')
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- USER_STATS: User statistics and skills
CREATE TABLE IF NOT EXISTS USER_STATS (
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

-- Index for leaderboard queries
CREATE INDEX idx_user_stats_discipline ON USER_STATS(discipline_score DESC);

-- PENDING_REDEMPTIONS: Failed habits pending user decision (24h grace period)
CREATE TABLE IF NOT EXISTS PENDING_REDEMPTIONS (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id CHAR(36) NOT NULL,
  habit_id CHAR(36) NOT NULL,
  failed_date DATE NOT NULL,
  expires_at DATETIME NOT NULL,
  status ENUM('pending', 'redeemed_life', 'redeemed_challenge', 'expired') NOT NULL DEFAULT 'pending',
  notified_expiring BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_at DATETIME,
  challenge_id CHAR(36),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES USERS(id) ON DELETE CASCADE,
  FOREIGN KEY (habit_id) REFERENCES HABITS(id) ON DELETE CASCADE,
  FOREIGN KEY (challenge_id) REFERENCES CHALLENGES(id),
  UNIQUE KEY unique_user_habit_date (user_id, habit_id, failed_date)
);

-- Indexes for pending redemptions
CREATE INDEX idx_pending_user_status ON PENDING_REDEMPTIONS(user_id, status);
CREATE INDEX idx_pending_expires ON PENDING_REDEMPTIONS(expires_at, status);

-- CHALLENGE_PROOFS: Proof submissions for challenge validation
-- Note: This table may already exist from previous implementation
CREATE TABLE IF NOT EXISTS CHALLENGE_PROOFS (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_challenge_id CHAR(36) NOT NULL,
  proof_text TEXT,
  proof_image_url TEXT,
  proof_type ENUM('text', 'image', 'both') NOT NULL,
  validation_status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  validation_result TEXT,
  validated_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_challenge_id) REFERENCES USER_CHALLENGES(id) ON DELETE CASCADE
);

-- ============================================================================
-- PART 2: ALTER EXISTING TABLES
-- ============================================================================

-- Add category_id and disabled_reason to HABITS
ALTER TABLE HABITS
ADD COLUMN IF NOT EXISTS category_id VARCHAR(50) NOT NULL DEFAULT 'health',
ADD COLUMN IF NOT EXISTS disabled_reason ENUM('no_lives', 'manual') NULL;

-- Add foreign key for category (only if not exists)
-- Note: MySQL doesn't support IF NOT EXISTS for constraints, so we handle this carefully
SET @constraint_exists = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_NAME = 'fk_habits_category'
  AND TABLE_NAME = 'HABITS'
  AND TABLE_SCHEMA = DATABASE()
);

SET @sql = IF(@constraint_exists = 0,
  'ALTER TABLE HABITS ADD CONSTRAINT fk_habits_category FOREIGN KEY (category_id) REFERENCES HABIT_CATEGORIES(id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Index for filtering by category
CREATE INDEX IF NOT EXISTS idx_habits_category ON HABITS(category_id);

-- Add category_id and is_general to CHALLENGES
ALTER TABLE CHALLENGES
ADD COLUMN IF NOT EXISTS category_id VARCHAR(50),
ADD COLUMN IF NOT EXISTS is_general BOOLEAN NOT NULL DEFAULT FALSE;

-- Add foreign key for challenges category
SET @constraint_exists = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_NAME = 'fk_challenges_category'
  AND TABLE_NAME = 'CHALLENGES'
  AND TABLE_SCHEMA = DATABASE()
);

SET @sql = IF(@constraint_exists = 0,
  'ALTER TABLE CHALLENGES ADD CONSTRAINT fk_challenges_category FOREIGN KEY (category_id) REFERENCES HABIT_CATEGORIES(id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Indexes for challenges
CREATE INDEX IF NOT EXISTS idx_challenges_category ON CHALLENGES(category_id, is_active);
CREATE INDEX IF NOT EXISTS idx_challenges_general ON CHALLENGES(is_general, is_active);

-- Make habit_id nullable in USER_CHALLENGES (for general challenges)
ALTER TABLE USER_CHALLENGES
MODIFY COLUMN habit_id CHAR(36) NULL;

-- Index for user challenges
CREATE INDEX IF NOT EXISTS idx_user_challenges_user ON USER_CHALLENGES(user_id, status);

-- Index for challenge proofs
CREATE INDEX IF NOT EXISTS idx_challenge_proofs_user_challenge ON CHALLENGE_PROOFS(user_challenge_id);

-- ============================================================================
-- PART 3: ALTER ENUMS FOR EXISTING TABLES
-- ============================================================================

-- Update LIFE_HISTORY reason enum to include new values
-- Note: MySQL requires recreating the column to change ENUM values
ALTER TABLE LIFE_HISTORY
MODIFY COLUMN reason ENUM(
  'habit_missed',
  'challenge_completed',
  'life_challenge_redeemed',
  'pending_expired',
  'revival_reset',
  'revival_challenge'
) NOT NULL;

-- Update NOTIFICATIONS type enum to include new values
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

-- ============================================================================
-- PART 4: SEED DATA - GENERAL CHALLENGES (for revival)
-- ============================================================================

INSERT INTO CHALLENGES (id, title, description, difficulty, type, category_id, is_general, estimated_time, is_active) VALUES
(UUID(), 'Reflexión profunda', 'Escribe una reflexión de al menos 200 palabras sobre por qué fallaste y cómo mejorar. Sé honesto contigo mismo.', 'medium', 'mindfulness', NULL, TRUE, 20, TRUE),
(UUID(), 'Compromiso renovado', 'Graba un video de 1 minuto explicando tu compromiso con tus hábitos y qué cambiarás para no volver a fallar.', 'hard', 'mindfulness', NULL, TRUE, 15, TRUE),
(UUID(), 'Plan de acción', 'Escribe un plan detallado de cómo evitarás fallar de nuevo. Incluye al menos 3 estrategias específicas.', 'easy', 'learning', NULL, TRUE, 15, TRUE),
(UUID(), 'Carta a tu yo futuro', 'Escribe una carta a tu yo del futuro explicando por qué es importante mantener tus hábitos.', 'medium', 'creative', NULL, TRUE, 20, TRUE);

-- ============================================================================
-- PART 5: SEED DATA - CATEGORY-SPECIFIC CHALLENGES
-- ============================================================================

-- Health challenges
INSERT INTO CHALLENGES (id, title, description, difficulty, type, category_id, is_general, estimated_time, is_active) VALUES
(UUID(), 'Hidratación completa', 'Bebe 8 vasos de agua hoy. Toma foto de tu botella/vaso cada vez o al final del día mostrando tu registro.', 'easy', 'exercise', 'health', FALSE, 5, TRUE),
(UUID(), 'Comida casera saludable', 'Prepara una comida saludable en casa. Envía foto del plato terminado.', 'medium', 'exercise', 'health', FALSE, 45, TRUE),
(UUID(), 'Snack saludable', 'Reemplaza un snack poco saludable por frutas o verduras. Documenta tu elección.', 'easy', 'exercise', 'health', FALSE, 10, TRUE);

-- Exercise challenges
INSERT INTO CHALLENGES (id, title, description, difficulty, type, category_id, is_general, estimated_time, is_active) VALUES
(UUID(), '30 flexiones', 'Realiza 30 flexiones. Puedes dividirlas en series. Envía video o describe cómo lo hiciste.', 'easy', 'exercise', 'exercise', FALSE, 5, TRUE),
(UUID(), 'Caminata de 2km', 'Camina 2 kilómetros. Envía captura de tu app de tracking o describe tu ruta.', 'medium', 'exercise', 'exercise', FALSE, 25, TRUE),
(UUID(), 'HIIT de 15 minutos', 'Completa una rutina HIIT de 15 minutos. Envía video, captura de app, o describe los ejercicios.', 'hard', 'exercise', 'exercise', FALSE, 20, TRUE),
(UUID(), '50 sentadillas', 'Realiza 50 sentadillas a lo largo del día. Puedes dividirlas en series.', 'easy', 'exercise', 'exercise', FALSE, 10, TRUE),
(UUID(), 'Estiramientos 10 min', 'Realiza una rutina de estiramientos de al menos 10 minutos. Describe qué músculos trabajaste.', 'easy', 'exercise', 'exercise', FALSE, 12, TRUE);

-- Learning challenges
INSERT INTO CHALLENGES (id, title, description, difficulty, type, category_id, is_general, estimated_time, is_active) VALUES
(UUID(), 'Lee 15 páginas', 'Lee 15 páginas de cualquier libro. Resume en 2-3 oraciones lo que aprendiste.', 'easy', 'learning', 'learning', FALSE, 20, TRUE),
(UUID(), 'Resumen de capítulo', 'Lee y resume un capítulo completo de un libro. Mínimo 150 palabras.', 'medium', 'learning', 'learning', FALSE, 45, TRUE),
(UUID(), 'Video educativo', 'Mira un video educativo de más de 15 minutos y escribe 3 cosas que aprendiste.', 'easy', 'learning', 'learning', FALSE, 25, TRUE),
(UUID(), 'Podcast educativo', 'Escucha un podcast educativo y resume los puntos principales.', 'easy', 'learning', 'learning', FALSE, 30, TRUE),
(UUID(), 'Aprende 10 palabras', 'Aprende 10 palabras nuevas en un idioma que estés estudiando. Lista las palabras con su significado.', 'easy', 'learning', 'learning', FALSE, 20, TRUE);

-- Productivity challenges
INSERT INTO CHALLENGES (id, title, description, difficulty, type, category_id, is_general, estimated_time, is_active) VALUES
(UUID(), '3 tareas pendientes', 'Completa 3 tareas que tengas pendientes. Lista cuáles fueron y márcalas como completadas.', 'easy', 'learning', 'productivity', FALSE, 30, TRUE),
(UUID(), 'Inbox cero', 'Organiza tu bandeja de entrada hasta tener 0 emails sin procesar. Envía captura.', 'medium', 'learning', 'productivity', FALSE, 45, TRUE),
(UUID(), 'Organiza tu espacio', 'Organiza y limpia tu espacio de trabajo. Envía foto del resultado.', 'medium', 'learning', 'productivity', FALSE, 30, TRUE),
(UUID(), 'Planifica mañana', 'Crea una lista detallada de tareas para mañana con horarios estimados.', 'easy', 'learning', 'productivity', FALSE, 15, TRUE),
(UUID(), 'Elimina distracciones', 'Identifica y elimina 3 distracciones de tu entorno de trabajo. Describe cuáles fueron.', 'easy', 'learning', 'productivity', FALSE, 15, TRUE);

-- Mindfulness challenges
INSERT INTO CHALLENGES (id, title, description, difficulty, type, category_id, is_general, estimated_time, is_active) VALUES
(UUID(), 'Meditación 10 min', 'Medita durante 10 minutos. Usa una app y envía captura, o describe tu experiencia.', 'easy', 'mindfulness', 'mindfulness', FALSE, 12, TRUE),
(UUID(), 'Diario de gratitud', 'Escribe 5 cosas específicas por las que estás agradecido hoy. Sé detallado.', 'easy', 'mindfulness', 'mindfulness', FALSE, 10, TRUE),
(UUID(), 'Respiración consciente', 'Practica ejercicios de respiración por 10 minutos. Describe la técnica que usaste.', 'easy', 'mindfulness', 'mindfulness', FALSE, 12, TRUE),
(UUID(), 'Caminata consciente', 'Realiza una caminata de 15 minutos prestando atención plena a tu entorno. Describe qué notaste.', 'medium', 'mindfulness', 'mindfulness', FALSE, 18, TRUE),
(UUID(), 'Sin pantallas 1 hora', 'Pasa 1 hora sin ninguna pantalla. Describe qué hiciste en ese tiempo.', 'medium', 'mindfulness', 'mindfulness', FALSE, 60, TRUE);

-- Creativity challenges
INSERT INTO CHALLENGES (id, title, description, difficulty, type, category_id, is_general, estimated_time, is_active) VALUES
(UUID(), 'Dibuja 15 minutos', 'Dibuja lo que quieras durante 15 minutos. Envía foto de tu obra.', 'easy', 'creative', 'creativity', FALSE, 18, TRUE),
(UUID(), 'Escribe 300 palabras', 'Escribe un texto creativo de al menos 300 palabras sobre cualquier tema.', 'medium', 'creative', 'creativity', FALSE, 25, TRUE),
(UUID(), 'Foto artística', 'Toma una foto artística o creativa. Explica brevemente tu concepto o intención.', 'easy', 'creative', 'creativity', FALSE, 15, TRUE),
(UUID(), 'Manualidad simple', 'Crea algo con tus manos (origami, manualidad, etc). Envía foto del resultado.', 'medium', 'creative', 'creativity', FALSE, 30, TRUE),
(UUID(), 'Lista de ideas', 'Escribe una lista de 10 ideas creativas sobre cualquier tema que te interese.', 'easy', 'creative', 'creativity', FALSE, 15, TRUE);

-- Social challenges
INSERT INTO CHALLENGES (id, title, description, difficulty, type, category_id, is_general, estimated_time, is_active) VALUES
(UUID(), 'Llamada de 10 min', 'Llama a un amigo o familiar y habla al menos 10 minutos. Describe de qué hablaron.', 'easy', 'mindfulness', 'social', FALSE, 15, TRUE),
(UUID(), 'Mensaje de gratitud', 'Envía un mensaje sincero de agradecimiento a alguien importante para ti.', 'easy', 'mindfulness', 'social', FALSE, 10, TRUE),
(UUID(), 'Reconecta', 'Contacta a alguien con quien no hablas hace más de un mes. Cuenta cómo fue.', 'medium', 'mindfulness', 'social', FALSE, 20, TRUE),
(UUID(), 'Ayuda a alguien', 'Haz algo útil por alguien hoy (favor, ayuda, consejo). Describe qué hiciste.', 'medium', 'mindfulness', 'social', FALSE, 30, TRUE),
(UUID(), 'Cumplido genuino', 'Dale un cumplido genuino y específico a 3 personas diferentes hoy.', 'easy', 'mindfulness', 'social', FALSE, 10, TRUE);

-- Finance challenges
INSERT INTO CHALLENGES (id, title, description, difficulty, type, category_id, is_general, estimated_time, is_active) VALUES
(UUID(), 'Revisa gastos semanales', 'Revisa tus gastos de la última semana. Lista 2 áreas donde podrías ahorrar.', 'easy', 'learning', 'finance', FALSE, 15, TRUE),
(UUID(), 'Micro-ahorro', 'Transfiere cualquier cantidad (aunque sea pequeña) a tu cuenta de ahorros.', 'easy', 'learning', 'finance', FALSE, 5, TRUE),
(UUID(), 'Identifica gasto innecesario', 'Identifica un gasto recurrente innecesario y planea cómo reducirlo.', 'easy', 'learning', 'finance', FALSE, 15, TRUE),
(UUID(), 'Presupuesto semanal', 'Crea un presupuesto detallado para la próxima semana.', 'medium', 'learning', 'finance', FALSE, 25, TRUE),
(UUID(), 'Compara precios', 'Antes de tu próxima compra, compara precios en al menos 3 lugares diferentes.', 'easy', 'learning', 'finance', FALSE, 15, TRUE);

-- ============================================================================
-- PART 6: CREATE USER_STATS FOR EXISTING USERS
-- ============================================================================

INSERT INTO USER_STATS (user_id)
SELECT id FROM USERS
WHERE id NOT IN (SELECT user_id FROM USER_STATS);
