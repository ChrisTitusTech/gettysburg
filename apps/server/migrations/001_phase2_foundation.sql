BEGIN;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version integer PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS service_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  snapshot jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS games (
  id uuid PRIMARY KEY,
  status text NOT NULL,
  turn integer NOT NULL CHECK (turn BETWEEN 1 AND 24),
  phase text NOT NULL,
  active_side text,
  state_version bigint NOT NULL CHECK (state_version >= 0),
  event_sequence bigint NOT NULL CHECK (event_sequence >= 0),
  ruleset_version text NOT NULL,
  content_revision text NOT NULL,
  state jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS browser_sessions (
  id uuid PRIMARY KEY,
  credential_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);

CREATE TABLE IF NOT EXISTS host_bindings (
  id uuid PRIMARY KEY,
  game_id uuid NOT NULL REFERENCES games(id),
  browser_session_id uuid NOT NULL REFERENCES browser_sessions(id),
  binding_version integer NOT NULL CHECK (binding_version > 0),
  revoked_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS one_active_host_binding_per_game
  ON host_bindings (game_id) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS seat_bindings (
  id uuid PRIMARY KEY,
  game_id uuid NOT NULL REFERENCES games(id),
  side text NOT NULL CHECK (side IN ('confederate', 'union')),
  browser_session_id uuid NOT NULL REFERENCES browser_sessions(id),
  binding_version integer NOT NULL CHECK (binding_version > 0),
  revoked_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS one_active_binding_per_game_side
  ON seat_bindings (game_id, side) WHERE revoked_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS one_active_game_binding_per_session
  ON seat_bindings (game_id, browser_session_id) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS invitations (
  lookup_id uuid PRIMARY KEY,
  game_id uuid NOT NULL REFERENCES games(id),
  allowed_side text NOT NULL CHECK (allowed_side IN ('confederate', 'union')),
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  claimed_at timestamptz,
  revoked_at timestamptz
);

CREATE TABLE IF NOT EXISTS recovery_grants (
  lookup_id uuid PRIMARY KEY,
  game_id uuid NOT NULL REFERENCES games(id),
  target_binding_type text NOT NULL CHECK (target_binding_type IN ('host', 'seat')),
  side text CHECK (side IS NULL OR side IN ('confederate', 'union')),
  target_binding_id uuid NOT NULL,
  target_binding_version integer NOT NULL CHECK (target_binding_version > 0),
  token_hash text NOT NULL,
  operator_identity text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  revoked_at timestamptz
);

CREATE TABLE IF NOT EXISTS actions (
  id bigserial PRIMARY KEY,
  game_id uuid NOT NULL REFERENCES games(id),
  sequence bigint NOT NULL CHECK (sequence > 0),
  kind text NOT NULL CHECK (kind IN ('gameplay', 'host_management', 'operator_audit')),
  command_id uuid,
  operator_request_id uuid,
  authorizing_type text NOT NULL,
  authorizing_id text NOT NULL,
  authorizing_version integer NOT NULL CHECK (authorizing_version > 0),
  canonicalization_version text,
  canonical_request_hash text,
  expected_version bigint NOT NULL CHECK (expected_version >= 0),
  resulting_version bigint NOT NULL CHECK (resulting_version >= 0),
  ruleset_version text NOT NULL,
  content_revision text NOT NULL,
  command_name text,
  payload jsonb,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (game_id, sequence),
  UNIQUE (game_id, command_id),
  UNIQUE (game_id, operator_request_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS one_gameplay_action_per_resulting_version
  ON actions (game_id, resulting_version) WHERE kind = 'gameplay';

CREATE TABLE IF NOT EXISTS snapshots (
  game_id uuid NOT NULL REFERENCES games(id),
  event_sequence bigint NOT NULL,
  state_version bigint NOT NULL,
  ruleset_version text NOT NULL,
  content_revision text NOT NULL,
  state jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (game_id, event_sequence)
);

INSERT INTO schema_migrations(version) VALUES (1) ON CONFLICT DO NOTHING;

COMMIT;
