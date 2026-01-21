-- PostgreSQL 15+

CREATE EXTENSION IF NOT EXISTS citext;

-- ENUMS
DO $$ BEGIN
  CREATE TYPE theme_t AS ENUM ('light','dark');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE font_size_t AS ENUM ('small','medium','large');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE league_t AS ENUM ('1','2','3','4','5'); -- 1=Diamante ... 5=Inicial
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE freq_t AS ENUM ('daily','weekly','custom');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE prog_t AS ENUM ('yes_no','time','count');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE chall_diff_t AS ENUM ('easy','medium','hard');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE chall_type_t AS ENUM ('exercise','learning','mindfulness','creative');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE user_ch_status_t AS ENUM ('assigned','completed','expired','discarded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE life_redeem_t AS ENUM ('once','unlimited');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE life_reason_t AS ENUM ('habit_missed','challenge_completed','life_challenge_redeemed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE notif_t AS ENUM ('habit_reminder','life_warning','challenge_available','league_update');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE league_change_t AS ENUM ('promoted','relegated','stayed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- USERS
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email citext NOT NULL UNIQUE,
  password_hash text NOT NULL,
  lives int NOT NULL DEFAULT 2,
  max_lives int NOT NULL DEFAULT 2,
  total_habits int NOT NULL DEFAULT 0,
  xp int NOT NULL DEFAULT 0,
  weekly_xp int NOT NULL DEFAULT 0,
  league smallint NOT NULL DEFAULT 5 CHECK (league BETWEEN 1 AND 5),
  league_week_start date,
  theme theme_t NOT NULL DEFAULT 'light',
  font_size font_size_t NOT NULL DEFAULT 'medium',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (lives >= 0 AND max_lives >= 1 AND lives <= max_lives)
);

-- HABITS
CREATE TABLE habits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  start_date date NOT NULL DEFAULT current_date,
  target_date date,
  current_streak int NOT NULL DEFAULT 0 CHECK (current_streak >= 0),
  frequency_type freq_t NOT NULL,
  frequency_days_of_week int[] NULL, -- valores 0..6; validar en app o trigger
  progress_type prog_t NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  active_by_user boolean NOT NULL DEFAULT true,
  last_completed_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (id, user_id)
);

-- HABIT COMPLETIONS
CREATE TABLE habit_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  habit_id uuid NOT NULL,
  user_id uuid NOT NULL,
  date date NOT NULL,
  completed boolean NOT NULL,
  progress_type prog_t NOT NULL,
  progress_value int,  -- minutos o cantidad
  target_value int,
  notes text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (habit_id, date),
  FOREIGN KEY (habit_id, user_id) REFERENCES habits(id, user_id) ON DELETE CASCADE
);

-- COMPLETION IMAGES
CREATE TABLE completion_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  completion_id uuid NOT NULL,
  user_id uuid NOT NULL,
  image_url text NOT NULL,
  thumbnail_url text,
  "order" smallint NOT NULL CHECK ("order" BETWEEN 1 AND 5),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (completion_id, "order"),
  FOREIGN KEY (completion_id, user_id)
    REFERENCES habit_completions(id, user_id) ON DELETE CASCADE
);

-- CHALLENGES (catálogo)
CREATE TABLE challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL,
  difficulty chall_diff_t NOT NULL,
  type chall_type_t NOT NULL,
  estimated_time int NOT NULL CHECK (estimated_time >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- USER_CHALLENGES (asignaciones/completados)
CREATE TABLE user_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  habit_id uuid NOT NULL,
  challenge_id uuid NOT NULL REFERENCES challenges(id),
  status user_ch_status_t NOT NULL DEFAULT 'assigned',
  assigned_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  FOREIGN KEY (habit_id, user_id) REFERENCES habits(id, user_id) ON DELETE CASCADE,
  UNIQUE (user_id, habit_id, challenge_id)
);

-- LIFE CHALLENGES (catálogo)
CREATE TABLE life_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL,
  reward smallint NOT NULL CHECK (reward > 0),
  redeemable_type life_redeem_t NOT NULL,
  icon text NOT NULL,
  verification_function text NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);

-- LIFE CHALLENGE REDEMPTIONS
CREATE TABLE life_challenge_redeemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  life_challenge_id uuid NOT NULL REFERENCES life_challenges(id),
  lives_gained smallint NOT NULL CHECK (lives_gained > 0),
  redeemed_at timestamptz NOT NULL DEFAULT now()
);
-- Nota: si redeemable_type='once' debe validarse vía trigger para evitar múltiples redenciones.

-- LIFE HISTORY
CREATE TABLE life_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lives_change int NOT NULL,
  current_lives int NOT NULL,
  reason life_reason_t NOT NULL,
  related_habit_id uuid REFERENCES habits(id),
  related_user_challenge_id uuid REFERENCES user_challenges(id),
  related_life_challenge_id uuid REFERENCES life_challenges(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- LEAGUES (catálogo estático)
CREATE TABLE leagues (
  id smallint PRIMARY KEY CHECK (id BETWEEN 1 AND 5), -- 1 Diamante ... 5 Inicial
  name text NOT NULL,
  color_hex text NOT NULL,
  level smallint NOT NULL UNIQUE CHECK (level BETWEEN 1 AND 5)
);

-- LEAGUE WEEKS
CREATE TABLE league_weeks (
  id serial PRIMARY KEY,
  week_start date NOT NULL UNIQUE
);

-- LEAGUE COMPETITORS (reales y simulados)
CREATE TABLE league_competitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_week_id int NOT NULL REFERENCES league_weeks(id) ON DELETE CASCADE,
  league_id smallint NOT NULL REFERENCES leagues(id),
  user_id uuid NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,            -- usar nombre simulado si user_id es NULL
  weekly_xp int NOT NULL DEFAULT 0 CHECK (weekly_xp >= 0),
  position smallint NOT NULL CHECK (position BETWEEN 1 AND 20),
  is_real boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (league_week_id, league_id, position),
  UNIQUE (league_week_id, user_id) DEFERRABLE INITIALLY IMMEDIATE
);

-- USER LEAGUE HISTORY
CREATE TABLE user_league_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  league_id smallint NOT NULL REFERENCES leagues(id),
  league_week_id int NOT NULL REFERENCES league_weeks(id) ON DELETE CASCADE,
  weekly_xp int NOT NULL DEFAULT 0,
  position smallint,
  change_type league_change_t NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, league_week_id)
);

-- NOTIFICATIONS (futuro)
CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type notif_t NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  related_habit_id uuid REFERENCES habits(id),
  is_read boolean NOT NULL DEFAULT false,
  scheduled_for timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ÍNDICES sugeridos
CREATE INDEX idx_habits_user ON habits(user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_completions_user_date ON habit_completions(user_id, date);
CREATE INDEX idx_completions_habit_date ON habit_completions(habit_id, date);
CREATE INDEX idx_images_completion ON completion_images(completion_id);
CREATE INDEX idx_user_challenges_active ON user_challenges(user_id, status);
CREATE INDEX idx_life_history_user_time ON life_history(user_id, created_at);
CREATE INDEX idx_notifications_user_unread ON notifications(user_id) WHERE is_read = false;
