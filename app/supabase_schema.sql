-- Run this in Supabase SQL Editor (supabase.com → your project → SQL Editor → New Query)

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id        SERIAL PRIMARY KEY,
  name      TEXT NOT NULL,
  email     TEXT UNIQUE NOT NULL,
  role      TEXT NOT NULL DEFAULT 'EMPLOYEE',
  department TEXT,
  job_title  TEXT,
  manager_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pulse check-ins
CREATE TABLE IF NOT EXISTS pulse_checkins (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER REFERENCES users(id) ON DELETE CASCADE,
  mood_score   INTEGER NOT NULL,
  energy_score INTEGER NOT NULL,
  stress_score INTEGER NOT NULL,
  note         TEXT,
  submitted_at TIMESTAMPTZ DEFAULT NOW()
);

-- Feedback forms
CREATE TABLE IF NOT EXISTS feedback_forms (
  id          SERIAL PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Feedback responses
CREATE TABLE IF NOT EXISTS feedback_responses (
  id                    SERIAL PRIMARY KEY,
  form_id               INTEGER REFERENCES feedback_forms(id) ON DELETE CASCADE,
  user_id               INTEGER REFERENCES users(id) ON DELETE SET NULL,
  respondent_name       TEXT DEFAULT 'Anonymous',
  satisfaction_score    INTEGER,
  manager_support_score INTEGER,
  workload_score        INTEGER,
  comments              TEXT,
  submitted_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Action items
CREATE TABLE IF NOT EXISTS action_items (
  id          SERIAL PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT,
  assignee    TEXT,
  status      TEXT DEFAULT 'OPEN',
  priority    INTEGER DEFAULT 2,
  due_date    DATE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default feedback form
INSERT INTO feedback_forms (title, description)
SELECT 'May 2026 Pulse Survey', 'Monthly pulse check'
WHERE NOT EXISTS (SELECT 1 FROM feedback_forms);
