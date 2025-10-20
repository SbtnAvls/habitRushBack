-- MySQL 8.0+

-- USERS
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
  frequency_days_of_week VARCHAR(255) NULL, -- valores 0..6; validar en app
  progress_type ENUM('yes_no','time','count') NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  active_by_user BOOLEAN NOT NULL DEFAULT TRUE,
  last_completed_date DATE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME,
  UNIQUE (id, user_id),
  FOREIGN KEY (user_id) REFERENCES USERS(id) ON DELETE CASCADE,
  CONSTRAINT chk_habits_current_streak CHECK (current_streak >= 0)
);

-- HABIT COMPLETIONS
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

-- CHALLENGES (catálogo)
CREATE TABLE CHALLENGES (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  difficulty ENUM('easy','medium','hard') NOT NULL,
  `type` ENUM('exercise','learning','mindfulness','creative') NOT NULL,
  estimated_time INT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_challenges_estimated_time CHECK (estimated_time >= 0)
);

-- USER_CHALLENGES (asignaciones/completados)
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

-- LIFE CHALLENGES (catálogo)
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

-- LIFE HISTORY
CREATE TABLE LIFE_HISTORY (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id CHAR(36) NOT NULL,
  lives_change INT NOT NULL,
  current_lives INT NOT NULL,
  reason ENUM('habit_missed','challenge_completed','life_challenge_redeemed') NOT NULL,
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
CREATE TABLE LEAGUE_COMPETITORS (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  league_week_id INT NOT NULL,
  league_id SMALLINT NOT NULL,
  user_id CHAR(36) NULL,
  name TEXT NOT NULL,
  weekly_xp INT NOT NULL DEFAULT 0,
  position SMALLINT NOT NULL,
  is_real BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (league_week_id, league_id, position),
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

-- NOTIFICATIONS (futuro)
CREATE TABLE NOTIFICATIONS (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id CHAR(36) NOT NULL,
  `type` ENUM('habit_reminder','life_warning','challenge_available','league_update') NOT NULL,
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

-- ÍNDICES sugeridos
CREATE INDEX idx_habits_user ON HABITS(user_id, deleted_at);
CREATE INDEX idx_completions_user_date ON HABIT_COMPLETIONS(user_id, `date`);
CREATE INDEX idx_completions_habit_date ON HABIT_COMPLETIONS(habit_id, `date`);
CREATE INDEX idx_images_completion ON COMPLETION_IMAGES(completion_id);
CREATE INDEX idx_user_challenges_active ON USER_CHALLENGES(user_id, status);
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