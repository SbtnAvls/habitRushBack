-- MySQL 8.0+

-- ============================================================================
-- HABIT CATEGORIES (must be created before HABITS)
-- ============================================================================
CREATE TABLE HABIT_CATEGORIES (
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
('finance', 'Finanzas', 'wallet', '#55E6C1');

-- ============================================================================
-- USERS
-- ============================================================================
CREATE TABLE USERS (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  name TEXT NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE COLLATE utf8mb4_general_ci,
  password_hash TEXT NOT NULL,
  lives INT NOT NULL DEFAULT 2,
  max_lives INT NOT NULL DEFAULT 2,
  total_habits INT NOT NULL DEFAULT 0,
  xp INT NOT NULL DEFAULT 0,
  weekly_xp INT NOT NULL DEFAULT 0,
  league SMALLINT NOT NULL DEFAULT 5,
  league_week_start DATE,
  theme ENUM('light','dark') NOT NULL DEFAULT 'light',
  font_size ENUM('small','medium','large') NOT NULL DEFAULT 'medium',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_users_league CHECK (league BETWEEN 1 AND 5),
  CONSTRAINT chk_users_lives CHECK (lives >= 0 AND max_lives >= 1 AND lives <= max_lives)
);

-- ============================================================================
-- USER_STATS (User statistics and skills)
-- ============================================================================
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

-- ============================================================================
-- HABITS
-- ============================================================================
CREATE TABLE HABITS (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id CHAR(36) NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category_id VARCHAR(50) NOT NULL DEFAULT 'health',
  start_date DATE NOT NULL DEFAULT (CURRENT_DATE),
  target_date DATE,
  current_streak INT NOT NULL DEFAULT 0,
  frequency_type ENUM('daily','weekly','custom') NOT NULL,
  frequency_days_of_week VARCHAR(255) NULL, -- valores 0..6; validar en app
  progress_type ENUM('yes_no','time','count') NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  active_by_user BOOLEAN NOT NULL DEFAULT TRUE,
  disabled_reason ENUM('no_lives', 'manual') NULL,
  last_completed_date DATE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME,
  UNIQUE (id, user_id),
  FOREIGN KEY (user_id) REFERENCES USERS(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES HABIT_CATEGORIES(id),
  CONSTRAINT chk_habits_current_streak CHECK (current_streak >= 0)
);

-- ============================================================================
-- HABIT COMPLETIONS
-- ============================================================================
CREATE TABLE HABIT_COMPLETIONS (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  habit_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  `date` DATE NOT NULL,
  completed BOOLEAN NOT NULL,
  progress_type ENUM('yes_no','time','count') NOT NULL,
  progress_value INT,  -- minutos o cantidad
  target_value INT,
  notes TEXT,
  completed_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (habit_id, `date`),
  FOREIGN KEY (habit_id, user_id) REFERENCES HABITS(id, user_id) ON DELETE CASCADE
);

-- COMPLETION IMAGES
CREATE TABLE COMPLETION_IMAGES (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  completion_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  image_url TEXT NOT NULL,
  thumbnail_url TEXT,
  `order` SMALLINT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (completion_id, `order`),
  FOREIGN KEY (completion_id) REFERENCES HABIT_COMPLETIONS(id) ON DELETE CASCADE,
  CONSTRAINT chk_completion_images_order CHECK (`order` BETWEEN 1 AND 5)
);

-- ============================================================================
-- CHALLENGES (catalog of challenges - general and category-specific)
-- ============================================================================
CREATE TABLE CHALLENGES (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  difficulty ENUM('easy','medium','hard') NOT NULL,
  `type` ENUM('exercise','learning','mindfulness','creative') NOT NULL,
  category_id VARCHAR(50),
  is_general BOOLEAN NOT NULL DEFAULT FALSE,
  estimated_time INT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES HABIT_CATEGORIES(id),
  CONSTRAINT chk_challenges_estimated_time CHECK (estimated_time >= 0)
);

-- Seed data: Category-specific challenges
INSERT INTO CHALLENGES (id, title, description, difficulty, `type`, category_id, is_general, estimated_time) VALUES
-- Health
(UUID(), 'Beber 8 vasos de agua', 'Bebe al menos 8 vasos de agua durante el día y toma foto de tu botella/vaso', 'easy', 'exercise', 'health', FALSE, 5),
(UUID(), 'Preparar comida saludable', 'Prepara una comida balanceada con vegetales, proteína y carbohidratos complejos', 'medium', 'creative', 'health', FALSE, 30),
(UUID(), 'Dormir 8 horas', 'Acuéstate temprano y duerme al menos 8 horas. Muestra captura de tu app de sueño', 'medium', 'mindfulness', 'health', FALSE, 480),

-- Exercise
(UUID(), 'Hacer 30 flexiones', 'Completa 30 flexiones (pueden ser en series). Graba un video corto', 'easy', 'exercise', 'exercise', FALSE, 5),
(UUID(), 'Correr 2km', 'Sal a correr al menos 2 kilómetros. Muestra tu ruta en una app', 'medium', 'exercise', 'exercise', FALSE, 20),
(UUID(), 'Rutina HIIT 20 min', 'Completa una rutina HIIT de al menos 20 minutos', 'hard', 'exercise', 'exercise', FALSE, 25),
(UUID(), 'Estiramientos 15 min', 'Realiza una sesión de estiramientos de cuerpo completo', 'easy', 'exercise', 'exercise', FALSE, 15),

-- Learning
(UUID(), 'Leer 10 páginas', 'Lee al menos 10 páginas de un libro (no redes sociales)', 'easy', 'learning', 'learning', FALSE, 15),
(UUID(), 'Resumir un capítulo', 'Lee un capítulo y escribe un resumen de los puntos principales', 'medium', 'learning', 'learning', FALSE, 30),
(UUID(), 'Ver tutorial técnico', 'Mira un tutorial de al menos 20 minutos sobre algo que quieras aprender', 'medium', 'learning', 'learning', FALSE, 25),

-- Productivity
(UUID(), 'Completar 3 tareas', 'Completa 3 tareas pendientes de tu lista de pendientes', 'easy', 'learning', 'productivity', FALSE, 30),
(UUID(), 'Organizar espacio', 'Organiza y limpia tu espacio de trabajo o habitación', 'medium', 'creative', 'productivity', FALSE, 45),
(UUID(), 'Planificar semana', 'Planifica las tareas y objetivos de tu próxima semana', 'medium', 'learning', 'productivity', FALSE, 20),

-- Mindfulness
(UUID(), 'Meditar 10 minutos', 'Realiza una sesión de meditación guiada o en silencio de 10 minutos', 'easy', 'mindfulness', 'mindfulness', FALSE, 10),
(UUID(), 'Escribir 3 gratitudes', 'Escribe 3 cosas por las que estés agradecido hoy y por qué', 'easy', 'mindfulness', 'mindfulness', FALSE, 5),
(UUID(), 'Respiración consciente', 'Practica ejercicios de respiración profunda durante 5 minutos', 'easy', 'mindfulness', 'mindfulness', FALSE, 5),
(UUID(), 'Journaling', 'Escribe en un diario sobre tu día, emociones o reflexiones (mínimo 200 palabras)', 'medium', 'mindfulness', 'mindfulness', FALSE, 15),

-- Creativity
(UUID(), 'Dibujar 15 minutos', 'Dibuja algo durante al menos 15 minutos (cualquier estilo)', 'medium', 'creative', 'creativity', FALSE, 15),
(UUID(), 'Escribir 500 palabras', 'Escribe un texto creativo de al menos 500 palabras', 'medium', 'creative', 'creativity', FALSE, 30),
(UUID(), 'Tomar 5 fotos artísticas', 'Toma 5 fotos con intención artística de tu entorno', 'easy', 'creative', 'creativity', FALSE, 15),

-- Social
(UUID(), 'Llamar a alguien', 'Llama a un amigo o familiar y conversa al menos 10 minutos', 'easy', 'mindfulness', 'social', FALSE, 15),
(UUID(), 'Acto de bondad', 'Realiza un acto de bondad para alguien (ayudar, regalar, etc)', 'medium', 'mindfulness', 'social', FALSE, 20),

-- Finance
(UUID(), 'Revisar gastos', 'Revisa tus gastos del último mes y categorízalos', 'medium', 'learning', 'finance', FALSE, 20),
(UUID(), 'Registrar gastos del día', 'Registra todos tus gastos del día en una app o libreta', 'easy', 'learning', 'finance', FALSE, 5);

-- Seed data: General challenges (for revival penance)
INSERT INTO CHALLENGES (id, title, description, difficulty, `type`, category_id, is_general, estimated_time) VALUES
(UUID(), 'Reflexión de fallos', 'Escribe una reflexión de al menos 300 palabras sobre por qué fallaste tus hábitos y cómo evitarlo', 'medium', 'mindfulness', NULL, TRUE, 20),
(UUID(), 'Plan de recuperación', 'Crea un plan detallado de cómo vas a retomar tus hábitos esta semana', 'medium', 'learning', NULL, TRUE, 15),
(UUID(), 'Ejercicio de disciplina', 'Completa 50 flexiones, 50 sentadillas y 1 minuto de plancha', 'hard', 'exercise', NULL, TRUE, 15),
(UUID(), 'Meditación extendida', 'Realiza una sesión de meditación de al menos 20 minutos', 'medium', 'mindfulness', NULL, TRUE, 20),
(UUID(), 'Lectura reflexiva', 'Lee un artículo o capítulo sobre productividad/disciplina y escribe qué aprendiste', 'medium', 'learning', NULL, TRUE, 30),
(UUID(), 'Ayuno de redes', 'Pasa 4 horas sin usar redes sociales y documenta cómo te sentiste', 'hard', 'mindfulness', NULL, TRUE, 240),
(UUID(), 'Organización total', 'Organiza completamente tu espacio de trabajo/habitación y toma fotos del antes y después', 'hard', 'creative', NULL, TRUE, 60);

-- ============================================================================
-- USER_CHALLENGES (assignments/completions - habit_id nullable for general challenges)
-- ============================================================================
CREATE TABLE USER_CHALLENGES (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id CHAR(36) NOT NULL,
  habit_id CHAR(36) NULL,
  challenge_id CHAR(36) NOT NULL,
  status ENUM('assigned','completed','expired','discarded') NOT NULL DEFAULT 'assigned',
  assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  FOREIGN KEY (user_id) REFERENCES USERS(id) ON DELETE CASCADE,
  FOREIGN KEY (challenge_id) REFERENCES CHALLENGES(id),
  FOREIGN KEY (habit_id) REFERENCES HABITS(id) ON DELETE CASCADE
);

-- ============================================================================
-- CHALLENGE_PROOFS (proof submissions for challenge validation)
-- ============================================================================
CREATE TABLE CHALLENGE_PROOFS (
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
-- LIFE CHALLENGES (catálogo)
-- ============================================================================
CREATE TABLE LIFE_CHALLENGES (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  reward SMALLINT NOT NULL,
  redeemable_type ENUM('once','unlimited') NOT NULL,
  icon TEXT NOT NULL,
  verification_function TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT chk_life_challenges_reward CHECK (reward > 0)
);

-- LIFE CHALLENGE REDEMPTIONS
CREATE TABLE LIFE_CHALLENGE_REDEMPTIONS (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id CHAR(36) NOT NULL,
  life_challenge_id CHAR(36) NOT NULL,
  lives_gained SMALLINT NOT NULL,
  redeemed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES USERS(id) ON DELETE CASCADE,
  FOREIGN KEY (life_challenge_id) REFERENCES LIFE_CHALLENGES(id),
  CONSTRAINT chk_life_challenge_redemptions_lives_gained CHECK (lives_gained > 0)
);

-- ============================================================================
-- LIFE HISTORY (tracks all life changes with expanded reasons)
-- ============================================================================
CREATE TABLE LIFE_HISTORY (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id CHAR(36) NOT NULL,
  lives_change INT NOT NULL,
  current_lives INT NOT NULL,
  reason ENUM('habit_missed','challenge_completed','life_challenge_redeemed','pending_expired','revival_reset','revival_challenge') NOT NULL,
  related_habit_id CHAR(36),
  related_user_challenge_id CHAR(36),
  related_life_challenge_id CHAR(36),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES USERS(id) ON DELETE CASCADE,
  FOREIGN KEY (related_habit_id) REFERENCES HABITS(id),
  FOREIGN KEY (related_user_challenge_id) REFERENCES USER_CHALLENGES(id),
  FOREIGN KEY (related_life_challenge_id) REFERENCES LIFE_CHALLENGES(id)
);

-- LEAGUES (catálogo estático)
CREATE TABLE LEAGUES (
  id SMALLINT PRIMARY KEY,
  name TEXT NOT NULL,
  color_hex TEXT NOT NULL,
  level SMALLINT NOT NULL UNIQUE,
  CONSTRAINT chk_leagues_id CHECK (id BETWEEN 1 AND 5),
  CONSTRAINT chk_leagues_level CHECK (level BETWEEN 1 AND 5)
);

-- LEAGUE WEEKS
CREATE TABLE LEAGUE_WEEKS (
  id INT AUTO_INCREMENT PRIMARY KEY,
  week_start DATE NOT NULL UNIQUE
);

-- LEAGUE COMPETITORS (reales y simulados)
-- league_group permite múltiples grupos por liga (matchmaking por XP similar)
CREATE TABLE LEAGUE_COMPETITORS (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  league_week_id INT NOT NULL,
  league_id SMALLINT NOT NULL,
  league_group SMALLINT NOT NULL DEFAULT 1,
  user_id CHAR(36) NULL,
  name TEXT NOT NULL,
  weekly_xp INT NOT NULL DEFAULT 0,
  position SMALLINT NOT NULL,
  is_real BOOLEAN NOT NULL DEFAULT FALSE,
  bot_profile ENUM('lazy', 'casual', 'active', 'hardcore') NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (league_week_id, league_id, league_group, position),
  UNIQUE (league_week_id, user_id),
  FOREIGN KEY (league_week_id) REFERENCES LEAGUE_WEEKS(id) ON DELETE CASCADE,
  FOREIGN KEY (league_id) REFERENCES LEAGUES(id),
  FOREIGN KEY (user_id) REFERENCES USERS(id) ON DELETE CASCADE,
  CONSTRAINT chk_league_competitors_weekly_xp CHECK (weekly_xp >= 0),
  CONSTRAINT chk_league_competitors_position CHECK (position BETWEEN 1 AND 20)
);

-- USER LEAGUE HISTORY
CREATE TABLE USER_LEAGUE_HISTORY (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id CHAR(36) NOT NULL,
  league_id SMALLINT NOT NULL,
  league_week_id INT NOT NULL,
  weekly_xp INT NOT NULL DEFAULT 0,
  position SMALLINT,
  change_type ENUM('promoted','relegated','stayed') NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, league_week_id),
  FOREIGN KEY (user_id) REFERENCES USERS(id) ON DELETE CASCADE,
  FOREIGN KEY (league_id) REFERENCES LEAGUES(id),
  FOREIGN KEY (league_week_id) REFERENCES LEAGUE_WEEKS(id) ON DELETE CASCADE
);

-- ============================================================================
-- PENDING_REDEMPTIONS (failed habits pending user decision - 24h grace period)
-- ============================================================================
CREATE TABLE PENDING_REDEMPTIONS (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id CHAR(36) NOT NULL,
  habit_id CHAR(36) NOT NULL,
  failed_date DATE NOT NULL,
  expires_at DATETIME NOT NULL,
  status ENUM('pending', 'challenge_assigned', 'redeemed_life', 'redeemed_challenge', 'expired') NOT NULL DEFAULT 'pending',
  notified_expiring BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_at DATETIME,
  challenge_id CHAR(36),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES USERS(id) ON DELETE CASCADE,
  FOREIGN KEY (habit_id) REFERENCES HABITS(id) ON DELETE CASCADE,
  FOREIGN KEY (challenge_id) REFERENCES CHALLENGES(id),
  UNIQUE KEY unique_user_habit_date (user_id, habit_id, failed_date)
);

-- ============================================================================
-- NOTIFICATIONS (expanded with new types)
-- ============================================================================
CREATE TABLE NOTIFICATIONS (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id CHAR(36) NOT NULL,
  `type` ENUM('habit_reminder','life_warning','challenge_available','league_update','pending_redemption','pending_expiring','death') NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  related_habit_id CHAR(36),
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  scheduled_for DATETIME,
  sent_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES USERS(id) ON DELETE CASCADE,
  FOREIGN KEY (related_habit_id) REFERENCES HABITS(id)
);

-- ============================================================================
-- INDEXES
-- ============================================================================
CREATE INDEX idx_habits_user ON HABITS(user_id, deleted_at);
CREATE INDEX idx_habits_category ON HABITS(category_id);
CREATE INDEX idx_completions_user_date ON HABIT_COMPLETIONS(user_id, `date`);
CREATE INDEX idx_completions_habit_date ON HABIT_COMPLETIONS(habit_id, `date`);
CREATE INDEX idx_images_completion ON COMPLETION_IMAGES(completion_id);
CREATE INDEX idx_challenges_category ON CHALLENGES(category_id, is_active);
CREATE INDEX idx_challenges_general ON CHALLENGES(is_general, is_active);
CREATE INDEX idx_user_challenges_user ON USER_CHALLENGES(user_id, status);
CREATE INDEX idx_user_stats_discipline ON USER_STATS(discipline_score DESC);
CREATE INDEX idx_pending_user_status ON PENDING_REDEMPTIONS(user_id, status);
CREATE INDEX idx_pending_expires ON PENDING_REDEMPTIONS(expires_at, status);
CREATE INDEX idx_challenge_proofs_user_challenge ON CHALLENGE_PROOFS(user_challenge_id);
CREATE INDEX idx_life_history_user_time ON LIFE_HISTORY(user_id, created_at);
CREATE INDEX idx_notifications_user_unread ON NOTIFICATIONS(user_id, is_read);

-- REFRESH TOKENS
CREATE TABLE REFRESH_TOKENS (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id CHAR(36) NOT NULL,
  token TEXT NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES USERS(id) ON DELETE CASCADE
);

-- TOKEN BLACKLIST
CREATE TABLE TOKEN_BLACKLIST (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  token TEXT NOT NULL,
  user_id CHAR(36) NOT NULL,
  expires_at DATETIME NOT NULL,
  blacklisted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES USERS(id) ON DELETE CASCADE
);

-- ÍNDICES para refresh tokens y blacklist
CREATE INDEX idx_refresh_tokens_user ON REFRESH_TOKENS(user_id);
CREATE INDEX idx_refresh_tokens_expires ON REFRESH_TOKENS(expires_at);
CREATE INDEX idx_token_blacklist_expires ON TOKEN_BLACKLIST(expires_at);