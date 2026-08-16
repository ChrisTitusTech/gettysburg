BEGIN;

CREATE TABLE IF NOT EXISTS deletion_ledger (
  position bigint PRIMARY KEY CHECK (position > 0),
  game_id uuid NOT NULL UNIQUE,
  deleted_at timestamptz NOT NULL,
  purged_at timestamptz NOT NULL,
  actor text NOT NULL
);

INSERT INTO schema_migrations(version) VALUES (2) ON CONFLICT DO NOTHING;

COMMIT;
