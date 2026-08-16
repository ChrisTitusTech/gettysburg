BEGIN;

ALTER TABLE deletion_ledger
  ALTER COLUMN purged_at DROP NOT NULL;

ALTER TABLE deletion_ledger
  DROP CONSTRAINT IF EXISTS deletion_ledger_game_id_key;

WITH snapshot_receipts AS (
  SELECT
    (receipt.value->>'position')::bigint AS position,
    (receipt.value->>'gameId')::uuid AS game_id,
    to_timestamp((receipt.value->>'deletedAt')::double precision / 1000)
      AS deleted_at,
    CASE WHEN receipt.value->>'purgedAt' IS NULL THEN NULL
      ELSE to_timestamp((receipt.value->>'purgedAt')::double precision / 1000)
    END AS purged_at,
    receipt.value->>'actor' AS actor
  FROM service_state AS service
  CROSS JOIN LATERAL jsonb_array_elements(
    coalesce(service.snapshot->'deletionLedger', '[]'::jsonb)
  ) AS receipt(value)
)
INSERT INTO deletion_ledger(position, game_id, deleted_at, purged_at, actor)
SELECT position, game_id, deleted_at, purged_at, actor
FROM snapshot_receipts
ON CONFLICT (position) DO NOTHING;

WITH ledger_base AS (
  SELECT coalesce(max(position), 0) AS position
  FROM deletion_ledger
), deleted_games AS (
  SELECT
    g.id,
    g.deleted_at,
    coalesce(
      nullif(
        (
          SELECT snapshot_game.value->1->>'deletedBy'
          FROM service_state AS service
          CROSS JOIN LATERAL jsonb_array_elements(
            coalesce(service.snapshot->'games', '[]'::jsonb)
          ) AS snapshot_game(value)
          WHERE snapshot_game.value->>0 = g.id::text
          LIMIT 1
        ),
        ''
      ),
      'migration-v3-backfill'
    ) AS actor,
    row_number() OVER (ORDER BY g.deleted_at, g.id) AS ordinal
  FROM games AS g
  WHERE g.deleted_at IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM deletion_ledger AS receipt WHERE receipt.game_id = g.id
    )
)
INSERT INTO deletion_ledger(position, game_id, deleted_at, purged_at, actor)
SELECT ledger_base.position + deleted_games.ordinal,
       deleted_games.id,
       deleted_games.deleted_at,
       NULL,
       deleted_games.actor
FROM deleted_games
CROSS JOIN ledger_base
ON CONFLICT (position) DO NOTHING;

INSERT INTO schema_migrations(version) VALUES (3) ON CONFLICT DO NOTHING;

COMMIT;
