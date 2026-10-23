CREATE TABLE IF NOT EXISTS groups (
  id   SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS associations (
  id          SERIAL PRIMARY KEY,
  group_id    INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  logo        TEXT,
  contact     TEXT,
  status      TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  UNIQUE (group_id, name)
);

CREATE TABLE IF NOT EXISTS users (
  id             SERIAL PRIMARY KEY,
  association_id INTEGER REFERENCES associations(id) ON DELETE CASCADE,
  group_id       INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  email          TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  role           TEXT NOT NULL DEFAULT 'member'
    CHECK (role IN ('admin', 'member')),
  status         TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved'))
);

CREATE TABLE IF NOT EXISTS activity_types (
  id             SERIAL PRIMARY KEY,
  association_id INTEGER REFERENCES associations(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  color          TEXT NOT NULL DEFAULT '#3788d8'
);

CREATE TABLE IF NOT EXISTS activities (
  id              SERIAL PRIMARY KEY,
  association_id  INTEGER NOT NULL REFERENCES associations(id) ON DELETE CASCADE,
  type_id         INTEGER REFERENCES activity_types(id) ON DELETE SET NULL,
  title           TEXT NOT NULL,
  description     TEXT,
  start_at        TIMESTAMPTZ NOT NULL,
  end_at          TIMESTAMPTZ NOT NULL,
  location        TEXT,
  access          TEXT NOT NULL DEFAULT 'commune'
    CHECK (access IN ('reservee', 'commune')),
  google_event_id TEXT,
  CHECK (end_at >= start_at)
);

CREATE TABLE IF NOT EXISTS offers (
  id             SERIAL PRIMARY KEY,
  association_id INTEGER NOT NULL REFERENCES associations(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL CHECK (kind IN ('offre', 'besoin')),
  title          TEXT NOT NULL,
  description    TEXT
);

CREATE TABLE IF NOT EXISTS session (
  sid    VARCHAR PRIMARY KEY,
  sess   JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_session_expire ON session (expire);

-- Groupe de départ
INSERT INTO groups (name) VALUES ('Lannion') ON CONFLICT DO NOTHING;