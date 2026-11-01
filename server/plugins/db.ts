import { runMigrations } from '@agent-native/core/db'

const OWNABLE = `owner_email TEXT NOT NULL DEFAULT 'local@localhost',
  org_id TEXT,
  visibility TEXT NOT NULL DEFAULT 'private'`

export default runMigrations(
  [
    {
      version: 1,
      name: 'blueprint-core',
      sql: `CREATE TABLE IF NOT EXISTS sheets (
  id TEXT PRIMARY KEY,
  sheet_number TEXT NOT NULL,
  title TEXT NOT NULL,
  project_code TEXT NOT NULL,
  scale_unit TEXT NOT NULL DEFAULT 'in',
  sprinklered BOOLEAN NOT NULL DEFAULT FALSE,
  geometry_hash TEXT NOT NULL,
  audited_geometry_hash TEXT,
  seal_status TEXT NOT NULL DEFAULT 'UNSEALED' CHECK (seal_status IN ('UNSEALED', 'SEALED', 'STALE_REQUIRES_REAUDIT')),
  sealed_by TEXT,
  sealed_at TEXT,
  sealed_geometry_hash TEXT,
  updated_at TEXT NOT NULL DEFAULT (now()),
  ${OWNABLE}
);
CREATE TABLE IF NOT EXISTS sheet_shares (
  id TEXT PRIMARY KEY,
  resource_id TEXT NOT NULL,
  principal_type TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (now()),
  notified_at TEXT
);
CREATE TABLE IF NOT EXISTS spatial_zones (
  id TEXT PRIMARY KEY,
  sheet_id TEXT NOT NULL REFERENCES sheets(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  zone_type TEXT NOT NULL CHECK (zone_type IN ('corridor', 'office', 'assembly', 'restroom', 'exit_stair', 'lobby')),
  vertices_json TEXT NOT NULL,
  doors_json TEXT NOT NULL DEFAULT '[]',
  computed_area_sqft DOUBLE PRECISION,
  perimeter_ft DOUBLE PRECISION,
  min_dimension_in DOUBLE PRECISION,
  occupant_load INTEGER,
  egress_distance_ft DOUBLE PRECISION,
  door_width_in DOUBLE PRECISION,
  dead_end_ft DOUBLE PRECISION,
  agent_draft_vertices_json TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  ${OWNABLE}
);
CREATE TABLE IF NOT EXISTS code_clauses (
  id TEXT PRIMARY KEY,
  code_standard TEXT NOT NULL,
  section_ref TEXT NOT NULL,
  title TEXT NOT NULL,
  verbatim_text TEXT NOT NULL,
  threshold_metric TEXT NOT NULL,
  threshold_operator TEXT NOT NULL CHECK (threshold_operator IN ('>=', '<=')),
  threshold_value DOUBLE PRECISION NOT NULL,
  sprinklered_threshold_value DOUBLE PRECISION,
  per_occupant_in DOUBLE PRECISION,
  latch_side_in DOUBLE PRECISION,
  unit TEXT NOT NULL,
  clause_hash TEXT NOT NULL,
  ${OWNABLE}
);
CREATE TABLE IF NOT EXISTS violation_receipts (
  id TEXT PRIMARY KEY,
  sheet_id TEXT NOT NULL REFERENCES sheets(id) ON DELETE CASCADE,
  zone_id TEXT NOT NULL,
  clause_id TEXT NOT NULL,
  clause_hash TEXT NOT NULL,
  section_ref TEXT NOT NULL,
  geometry_hash TEXT NOT NULL,
  subject_ref TEXT NOT NULL,
  measured_value DOUBLE PRECISION NOT NULL,
  required_value DOUBLE PRECISION NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('CRITICAL', 'WARNING', 'PASS')),
  detail TEXT NOT NULL,
  pin_x DOUBLE PRECISION NOT NULL,
  pin_y DOUBLE PRECISION NOT NULL,
  created_at TEXT NOT NULL DEFAULT (now()),
  ${OWNABLE}
);
CREATE TABLE IF NOT EXISTS redline_proposals (
  id TEXT PRIMARY KEY,
  sheet_id TEXT NOT NULL REFERENCES sheets(id) ON DELETE CASCADE,
  zone_id TEXT NOT NULL,
  violation_receipt_id TEXT NOT NULL,
  clause_id TEXT NOT NULL,
  clause_hash TEXT NOT NULL,
  base_geometry_hash TEXT NOT NULL,
  proposed_vertices_json TEXT NOT NULL,
  predicted_value DOUBLE PRECISION,
  rationale TEXT NOT NULL,
  architect_note TEXT,
  author_role TEXT NOT NULL CHECK (author_role IN ('agent', 'architect')),
  status TEXT NOT NULL DEFAULT 'STAGED' CHECK (status IN ('STAGED', 'APPLIED', 'REJECTED')),
  created_at TEXT NOT NULL DEFAULT (now()),
  ${OWNABLE}
);
CREATE INDEX IF NOT EXISTS sheets_owner_org_idx ON sheets (owner_email, org_id, updated_at);
CREATE INDEX IF NOT EXISTS sheet_shares_resource_idx ON sheet_shares (resource_id, principal_type, principal_id);
CREATE INDEX IF NOT EXISTS spatial_zones_sheet_idx ON spatial_zones (sheet_id, sort_order);
CREATE INDEX IF NOT EXISTS code_clauses_owner_idx ON code_clauses (owner_email, section_ref);
CREATE INDEX IF NOT EXISTS violation_receipts_sheet_hash_idx ON violation_receipts (sheet_id, geometry_hash);
CREATE INDEX IF NOT EXISTS redline_proposals_sheet_idx ON redline_proposals (sheet_id, created_at)`,
    },
    {
      version: 2,
      name: 'learned-spatial-rules',
      sql: `CREATE TABLE IF NOT EXISTS learned_spatial_rules (
  id TEXT PRIMARY KEY,
  sheet_id TEXT NOT NULL,
  zone_id TEXT NOT NULL,
  zone_type TEXT NOT NULL,
  rule_md TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (now()),
  ${OWNABLE}
);
CREATE INDEX IF NOT EXISTS learned_spatial_rules_owner_idx ON learned_spatial_rules (owner_email, created_at)`,
    },
  ],
  { table: 'blueprintos_migrations' },
)
