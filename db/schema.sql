-- ===== Groupes =====
CREATE TABLE IF NOT EXISTS groups (
  id   SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

-- ===== Associations (validées par un admin du groupe) =====
CREATE TABLE IF NOT EXISTS associations (
  id          SERIAL PRIMARY KEY,
  group_id    INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  logo        TEXT,
  contact     TEXT,
  status      TEXT NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_id, name)
);

-- ===== Utilisateurs (des personnes, rattachées à une asso) =====
-- admin     : admin du groupe, aucune asso, valide les associations
-- moderator : modérateur d'une asso, valide les personnes qui la rejoignent
-- member    : membre d'une asso
CREATE TABLE IF NOT EXISTS users (
  id             SERIAL PRIMARY KEY,
  group_id       INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  association_id INTEGER REFERENCES associations(id) ON DELETE CASCADE,
  email          TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  role           TEXT NOT NULL DEFAULT 'member'
                 CHECK (role IN ('admin', 'moderator', 'member')),
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- un admin n'a pas d'asso, tous les autres en ont une
  CHECK ((role = 'admin' AND association_id IS NULL)
      OR (role <> 'admin' AND association_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_users_asso ON users (association_id);

-- ===== Types d'activités (association_id NULL = type commun) =====
CREATE TABLE IF NOT EXISTS activity_types (
  id             SERIAL PRIMARY KEY,
  association_id INTEGER REFERENCES associations(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  color          TEXT NOT NULL DEFAULT '#3788d8'
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_activity_types
  ON activity_types (COALESCE(association_id, 0), name);

-- ===== Activités =====
CREATE TABLE IF NOT EXISTS activities (
  id              SERIAL PRIMARY KEY,
  association_id  INTEGER NOT NULL REFERENCES associations(id) ON DELETE CASCADE,
  created_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
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
CREATE INDEX IF NOT EXISTS idx_activities_asso  ON activities (association_id);
CREATE INDEX IF NOT EXISTS idx_activities_start ON activities (start_at);

-- ===== Offres et besoins =====
CREATE TABLE IF NOT EXISTS offers (
  id             SERIAL PRIMARY KEY,
  association_id INTEGER NOT NULL REFERENCES associations(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL CHECK (kind IN ('offre', 'besoin')),
  title          TEXT NOT NULL,
  description    TEXT
);

-- ===== Sessions (connect-pg-simple) =====
CREATE TABLE IF NOT EXISTS session (
  sid    VARCHAR PRIMARY KEY,
  sess   JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_session_expire ON session (expire);

-- ===== Données de départ =====
INSERT INTO groups (name) VALUES ('Lannion') ON CONFLICT DO NOTHING;

INSERT INTO activity_types (association_id, name, color) VALUES
  (NULL, 'Sport',   '#2e7d32'),
  (NULL, 'Jeux',    '#ef6c00'),
  (NULL, 'Soirée',  '#8e24aa'),
  (NULL, 'Réunion', '#1565c0'),
  (NULL, 'Autre',   '#00838f')
ON CONFLICT DO NOTHING;