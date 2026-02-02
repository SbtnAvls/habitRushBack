-- HabitRush Database Schema
-- MySQL 8.0+
-- Updated: 2026-01-22 (consolidated from 14 migrations)

-- ============================================================================
-- CATALOG TABLES (no foreign keys)
-- ============================================================================

-- HABIT_CATEGORIES
CREATE TABLE HABIT_CATEGORIES (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  icon VARCHAR(50),
  color_hex VARCHAR(7)
);

-- LEAGUES (static catalog)
CREATE TABLE LEAGUES (
  id SMALLINT PRIMARY KEY,
  name TEXT NOT NULL,
  color_hex TEXT NOT NULL,
  level SMALLINT NOT NULL UNIQUE,
  CONSTRAINT chk_leagues_id CHECK (id BETWEEN 1 AND 5),
  CONSTRAINT chk_leagues_level CHECK (level BETWEEN 1 AND 5)
);

-- CHALLENGES (catalog)
CREATE TABLE CHALLENGES (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  difficulty ENUM('easy','medium','hard') NOT NULL,
  type ENUM('exercise','learning','mindfulness','creative') NOT NULL,
  category_id VARCHAR(50) DEFAULT NULL,
  is_general BOOLEAN NOT NULL DEFAULT TRUE,
  estimated_time INT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_challenges_estimated_time CHECK (estimated_time >= 0)
);

-- LIFE_CHALLENGES (catalog)
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

-- LEAGUE_WEEKS
CREATE TABLE LEAGUE_WEEKS (
  id INT AUTO_INCREMENT PRIMARY KEY,
  week_start DATE NOT NULL UNIQUE,
  processed BOOLEAN NOT NULL DEFAULT FALSE
);

-- CRON_JOB_EXECUTIONS
CREATE TABLE CRON_JOB_EXECUTIONS (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  last_execution DATETIME NOT NULL,
  last_status ENUM('success','failed','skipped') NOT NULL DEFAULT 'success',
  last_error TEXT,
  execution_count INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ============================================================================
-- USER-RELATED TABLES
-- ============================================================================

-- USERS
CREATE TABLE USERS (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  username VARCHAR(50) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE COLLATE utf8mb4_general_ci,
  password_hash TEXT NOT NULL,
  google_id VARCHAR(255) UNIQUE DEFAULT NULL,
  lives INT NOT NULL DEFAULT 2,
  max_lives INT NOT NULL DEFAULT 2,
  total_habits INT NOT NULL DEFAULT 0,
  xp INT NOT NULL DEFAULT 0,
  weekly_xp INT NOT NULL DEFAULT 0,
  league SMALLINT NOT NULL DEFAULT 5,
  league_week_start DATE,
  theme ENUM('light','dark') NOT NULL DEFAULT 'light',
  font_size ENUM('small','medium','large') NOT NULL DEFAULT 'medium',
  is_admin BOOLEAN DEFAULT FALSE,
  followers_count INT UNSIGNED DEFAULT 0,
  following_count INT UNSIGNED DEFAULT 0,
  is_profile_public BOOLEAN DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_users_league CHECK (league BETWEEN 1 AND 5),
  CONSTRAINT chk_users_lives CHECK (lives >= 0 AND max_lives >= 1 AND lives <= max_lives)
);

-- REFRESH_TOKENS
CREATE TABLE REFRESH_TOKENS (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id CHAR(36) NOT NULL,
  token TEXT NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES USERS(id) ON DELETE CASCADE
);

-- TOKEN_BLACKLIST
CREATE TABLE TOKEN_BLACKLIST (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  token TEXT NOT NULL,
  user_id CHAR(36) NOT NULL,
  expires_at DATETIME NOT NULL,
  blacklisted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES USERS(id) ON DELETE CASCADE
);

-- USER_STATS
CREATE TABLE USER_STATS (
  user_id CHAR(36) PRIMARY KEY,
  discipline_score INT NOT NULL DEFAULT 100,
  max_streak INT NOT NULL DEFAULT 0,
  total_completions INT NOT NULL DEFAULT 0,
  perfect_weeks INT NOT NULL DEFAULT 0,
  revival_count INT NOT NULL DEFAULT 0,
  reset_count INT NOT NULL DEFAULT 0,
  last_daily_bonus_date DATE DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES USERS(id) ON DELETE CASCADE,
  CONSTRAINT chk_discipline_score CHECK (discipline_score >= 0 AND discipline_score <= 1000)
);

-- USER_FOLLOWS
CREATE TABLE USER_FOLLOWS (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  follower_id CHAR(36) NOT NULL COMMENT 'User who follows',
  following_id CHAR(36) NOT NULL COMMENT 'User being followed',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_follow (follower_id, following_id),
  FOREIGN KEY (follower_id) REFERENCES USERS(id) ON DELETE CASCADE,
  FOREIGN KEY (following_id) REFERENCES USERS(id) ON DELETE CASCADE,
  CONSTRAINT no_self_follow CHECK (follower_id <> following_id)
);

-- ============================================================================
-- HABIT-RELATED TABLES
-- ============================================================================

-- HABITS
CREATE TABLE HABITS (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id CHAR(36) NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  start_date DATE NOT NULL DEFAULT (CURRENT_DATE),
  target_date DATE,
  current_streak INT NOT NULL DEFAULT 0,
  frequency_type ENUM('daily','weekly','custom') NOT NULL,
  frequency_days_of_week VARCHAR(255) NULL,
  progress_type ENUM('yes_no','time','count') NOT NULL,
  target_value INT DEFAULT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  active_by_user BOOLEAN NOT NULL DEFAULT TRUE,
  last_completed_date DATE,
  disabled_at DATETIME DEFAULT NULL,
  disabled_reason ENUM('no_lives','manual') DEFAULT NULL,
  category_id VARCHAR(50) NOT NULL DEFAULT 'health',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME,
  UNIQUE (id, user_id),
  FOREIGN KEY (user_id) REFERENCES USERS(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES HABIT_CATEGORIES(id),
  CONSTRAINT chk_habits_current_streak CHECK (current_streak >= 0)
);

-- HABIT_COMPLETIONS
CREATE TABLE HABIT_COMPLETIONS (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  habit_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  `date` DATE NOT NULL,
  completed BOOLEAN NOT NULL,
  progress_type ENUM('yes_no','time','count') NOT NULL,
  progress_value INT,
  target_value INT,
  notes TEXT,
  completed_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (habit_id, `date`),
  FOREIGN KEY (habit_id, user_id) REFERENCES HABITS(id, user_id) ON DELETE CASCADE
);

-- COMPLETION_IMAGES
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
-- CHALLENGE-RELATED TABLES
-- ============================================================================

-- USER_CHALLENGES (assignments/completions)
CREATE TABLE USER_CHALLENGES (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id CHAR(36) NOT NULL,
  habit_id CHAR(36) NOT NULL,
  challenge_id CHAR(36) NOT NULL,
  status ENUM('assigned','completed','expired','discarded') NOT NULL DEFAULT 'assigned',
  assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  UNIQUE (user_id, habit_id, challenge_id),
  FOREIGN KEY (user_id) REFERENCES USERS(id) ON DELETE CASCADE,
  FOREIGN KEY (challenge_id) REFERENCES CHALLENGES(id),
  FOREIGN KEY (habit_id, user_id) REFERENCES HABITS(id, user_id) ON DELETE CASCADE
);

-- CHALLENGE_PROOFS
CREATE TABLE CHALLENGE_PROOFS (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_challenge_id CHAR(36) NOT NULL,
  proof_text TEXT,
  proof_image_url TEXT,
  proof_type ENUM('text','image','both') NOT NULL,
  validation_status ENUM('pending','approved','rejected') DEFAULT 'pending',
  validation_result TEXT,
  validated_at DATETIME DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_challenge_id) REFERENCES USER_CHALLENGES(id)
);

-- PENDING_REDEMPTIONS
CREATE TABLE PENDING_REDEMPTIONS (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id CHAR(36) NOT NULL,
  habit_id CHAR(36) NOT NULL,
  failed_date DATE NOT NULL,
  expires_at DATETIME NOT NULL,
  status ENUM('pending','redeemed_life','redeemed_challenge','expired') NOT NULL DEFAULT 'pending',
  notified_expiring BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_at DATETIME DEFAULT NULL,
  challenge_id CHAR(36) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_user_habit_date (user_id, habit_id, failed_date),
  FOREIGN KEY (user_id) REFERENCES USERS(id) ON DELETE CASCADE,
  FOREIGN KEY (habit_id) REFERENCES HABITS(id) ON DELETE CASCADE,
  FOREIGN KEY (challenge_id) REFERENCES CHALLENGES(id)
);

-- PENDING_VALIDATIONS
CREATE TABLE PENDING_VALIDATIONS (
  id CHAR(36) PRIMARY KEY,
  pending_redemption_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  challenge_id CHAR(36) NOT NULL,
  proof_text TEXT,
  proof_image_urls JSON DEFAULT NULL,
  proof_type ENUM('text','image','both') NOT NULL,
  status ENUM('pending_review','approved_manual','rejected_manual','approved_ai','rejected_ai') NOT NULL DEFAULT 'pending_review',
  reviewer_notes TEXT,
  reviewed_by CHAR(36) DEFAULT NULL,
  reviewed_at DATETIME DEFAULT NULL,
  ai_result JSON DEFAULT NULL,
  ai_validated_at DATETIME DEFAULT NULL,
  ai_retry_count INT NOT NULL DEFAULT 0,
  last_ai_error TEXT,
  challenge_title VARCHAR(255) DEFAULT NULL,
  challenge_description TEXT,
  challenge_difficulty VARCHAR(50) DEFAULT NULL,
  habit_name VARCHAR(255) DEFAULT NULL,
  user_email VARCHAR(255) DEFAULT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (pending_redemption_id) REFERENCES PENDING_REDEMPTIONS(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES USERS(id) ON DELETE CASCADE,
  FOREIGN KEY (challenge_id) REFERENCES CHALLENGES(id) ON DELETE CASCADE
);

-- ============================================================================
-- LIFE CHALLENGE TABLES
-- ============================================================================

-- LIFE_CHALLENGE_REDEMPTIONS
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

-- LIFE_HISTORY
CREATE TABLE LIFE_HISTORY (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id CHAR(36) NOT NULL,
  lives_change INT NOT NULL,
  current_lives INT NOT NULL,
  reason ENUM('habit_missed','challenge_completed','life_challenge_redeemed','user_revived','pending_expired') DEFAULT NULL,
  related_habit_id CHAR(36),
  related_user_challenge_id CHAR(36),
  related_life_challenge_id CHAR(36),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES USERS(id) ON DELETE CASCADE,
  FOREIGN KEY (related_habit_id) REFERENCES HABITS(id),
  FOREIGN KEY (related_user_challenge_id) REFERENCES USER_CHALLENGES(id),
  FOREIGN KEY (related_life_challenge_id) REFERENCES LIFE_CHALLENGES(id)
);

-- ============================================================================
-- LEAGUE TABLES
-- ============================================================================

-- LEAGUE_COMPETITORS (real and simulated)
CREATE TABLE LEAGUE_COMPETITORS (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  league_week_id INT NOT NULL,
  league_id SMALLINT NOT NULL,
  league_group SMALLINT NOT NULL DEFAULT 1,
  user_id CHAR(36) NULL,
  username VARCHAR(50) NOT NULL,
  weekly_xp INT NOT NULL DEFAULT 0,
  position SMALLINT NOT NULL,
  is_real BOOLEAN NOT NULL DEFAULT FALSE,
  bot_profile ENUM('lazy','casual','active','hardcore') DEFAULT NULL,
  daily_xp_today INT DEFAULT 0,
  daily_xp_target INT DEFAULT 0,
  last_xp_reset_date DATE DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_week_league_group_position (league_week_id, league_id, league_group, position),
  UNIQUE (league_week_id, user_id),
  FOREIGN KEY (league_week_id) REFERENCES LEAGUE_WEEKS(id) ON DELETE CASCADE,
  FOREIGN KEY (league_id) REFERENCES LEAGUES(id),
  FOREIGN KEY (user_id) REFERENCES USERS(id) ON DELETE CASCADE,
  CONSTRAINT chk_league_competitors_weekly_xp CHECK (weekly_xp >= 0)
);

-- USER_LEAGUE_HISTORY
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
-- NOTIFICATIONS
-- ============================================================================

CREATE TABLE NOTIFICATIONS (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id CHAR(36) NOT NULL,
  type ENUM('habit_reminder','life_warning','challenge_available','league_update','pending_redemption','pending_expiring','death') NOT NULL,
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
CREATE INDEX idx_user_challenges_active ON USER_CHALLENGES(user_id, status);
CREATE INDEX idx_life_history_user_time ON LIFE_HISTORY(user_id, created_at);
CREATE INDEX idx_notifications_user_unread ON NOTIFICATIONS(user_id, is_read);
CREATE INDEX idx_refresh_tokens_user ON REFRESH_TOKENS(user_id);
CREATE INDEX idx_refresh_tokens_expires ON REFRESH_TOKENS(expires_at);
CREATE INDEX idx_token_blacklist_expires ON TOKEN_BLACKLIST(expires_at);
CREATE INDEX idx_user_stats_discipline ON USER_STATS(discipline_score DESC);
CREATE INDEX idx_user_follows_follower ON USER_FOLLOWS(follower_id);
CREATE INDEX idx_user_follows_following ON USER_FOLLOWS(following_id);
CREATE INDEX idx_users_username_search ON USERS(username);
CREATE INDEX idx_pending_user_status ON PENDING_REDEMPTIONS(user_id, status);
CREATE INDEX idx_pending_expires ON PENDING_REDEMPTIONS(expires_at, status);
CREATE INDEX idx_pending_validations_status ON PENDING_VALIDATIONS(status);
CREATE INDEX idx_pending_validations_created ON PENDING_VALIDATIONS(created_at);
CREATE INDEX idx_pending_validations_expires ON PENDING_VALIDATIONS(expires_at);
CREATE INDEX idx_pending_validations_user ON PENDING_VALIDATIONS(user_id);
CREATE INDEX idx_league_weeks_processed ON LEAGUE_WEEKS(processed);
CREATE INDEX idx_league_competitors_bot_daily ON LEAGUE_COMPETITORS(league_week_id, is_real, last_xp_reset_date);
CREATE INDEX idx_cron_last_execution ON CRON_JOB_EXECUTIONS(last_execution);

-- ============================================================================
-- CATALOG DATA
-- ============================================================================

-- HABIT_CATEGORIES
INSERT INTO HABIT_CATEGORIES (id, name, icon, color_hex) VALUES
  ('health', 'Salud', 'heart', '#FF6B6B'),
  ('exercise', 'Ejercicio', 'dumbbell', '#4ECDC4'),
  ('learning', 'Aprendizaje', 'book', '#45B7D1'),
  ('productivity', 'Productividad', 'briefcase', '#96CEB4'),
  ('mindfulness', 'Mindfulness', 'brain', '#DDA0DD'),
  ('creativity', 'Creatividad', 'palette', '#FFEAA7'),
  ('finance', 'Finanzas', 'wallet', '#55E6C1'),
  ('social', 'Social', 'users', '#74B9FF');

-- LEAGUES
INSERT INTO LEAGUES (id, name, color_hex, level) VALUES
  (1, 'Bronze', '#CD7F32', 1),
  (2, 'Silver', '#C0C0C0', 2),
  (3, 'Gold', '#FFD700', 3),
  (4, 'Diamond', '#B9F2FF', 4),
  (5, 'Master', '#9966CC', 5);

-- CHALLENGES
INSERT INTO CHALLENGES (id, title, description, difficulty, type, is_general, estimated_time) VALUES
  ('challenge_1', 'Hacer 20 flexiones', 'Completa 20 flexiones para reactivar tu habito', 'easy', 'exercise', TRUE, 5),
  ('challenge_2', 'Leer por 15 minutos', 'Dedica 15 minutos a leer algo nuevo', 'easy', 'learning', TRUE, 15),
  ('challenge_3', 'Meditar 10 minutos', 'Practica meditacion por 10 minutos', 'easy', 'mindfulness', TRUE, 10),
  ('challenge_4', 'Hacer 30 sentadillas', 'Completa 30 sentadillas para reactivar tu habito', 'medium', 'exercise', TRUE, 8),
  ('challenge_5', 'Escribir un poema', 'Escribe un poema corto sobre tus metas', 'medium', 'creative', TRUE, 20),
  ('challenge_6', 'Hacer 50 saltos', 'Completa 50 saltos para reactivar tu habito', 'hard', 'exercise', TRUE, 10);

-- LIFE_CHALLENGES
INSERT INTO LIFE_CHALLENGES (id, title, description, reward, redeemable_type, icon, verification_function) VALUES
  ('0282c5ca-a896-11f0-935b-46ccd50ad1cd', 'Semana Perfecta', 'Manten un habito durante una semana completa sin perder vidas', 1, 'once', '?', 'verifyWeekWithoutLosingLives'),
  ('0282d4cb-a896-11f0-935b-46ccd50ad1cd', 'Mes Imparable', 'Manten un habito durante un mes completo sin perder vidas', 2, 'unlimited', '?', 'verifyMonthWithoutLosingLives'),
  ('0282d828-a896-11f0-935b-46ccd50ad1cd', 'Salvacion de Ultimo Momento', 'Completa un habito faltando menos de 1 hora para acabar el dia', 1, 'once', '?', 'verifyLastHourSave'),
  ('0282d86d-a896-11f0-935b-46ccd50ad1cd', 'Madrugador', 'Registra progreso de un habito antes de la 1 AM', 1, 'once', '?', 'verifyEarlyBird'),
  ('0282d895-a896-11f0-935b-46ccd50ad1cd', 'Triple Corona', 'Completa al menos 3 habitos durante una semana completa sin faltar', 2, 'once', '?', 'verifyThreeHabitsWeek'),
  ('0282d8b7-a896-11f0-935b-46ccd50ad1cd', 'Objetivo Alcanzado', 'Completa un habito llegando a su fecha objetivo (minimo 4 meses)', 3, 'unlimited', '?', 'verifyTargetDateReached'),
  ('0282d8d5-a896-11f0-935b-46ccd50ad1cd', 'Coleccionista de Logros', 'Completa 5 retos redimibles solo una vez', 2, 'once', '?', 'verifyFiveOnceChallenges'),
  ('0282d92b-a896-11f0-935b-46ccd50ad1cd', 'Superviviente', 'No te quedes sin vidas durante 2 meses seguidos', 2, 'unlimited', '?', 'verifyTwoMonthsAlive'),
  ('0282e09a-a896-11f0-935b-46ccd50ad1cd', 'Maestro del Tiempo', 'Acumula 1000 horas en un habito', 3, 'unlimited', '?', 'verify1000Hours'),
  ('0282e0cc-a896-11f0-935b-46ccd50ad1cd', 'Escritor Prolifico', 'Escribe 200 notas entre todos tus habitos', 2, 'once', '?', 'verify200Notes');
