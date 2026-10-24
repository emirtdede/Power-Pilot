-- Power Pilot uygulama deposu — şema v3 (WP-11.T2)
-- Tüm yazmalar BEGIN IMMEDIATE transaction'ı içinde yapılır (Database.write).
-- JSON kolonları yalnızca şema evrimi kolaylığı içindir; sorgulanan alanlar
-- ayrı kolonlarda tutulur (indekslenebilir, delta yazma mümkün).

CREATE TABLE IF NOT EXISTS meta (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
    key        TEXT PRIMARY KEY,
    json       TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
    id          TEXT PRIMARY KEY,
    status      TEXT,
    action      TEXT,
    created_at  TEXT,
    updated_at  TEXT,
    data        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_updated ON tasks(updated_at);

CREATE TABLE IF NOT EXISTS history (
    id          TEXT PRIMARY KEY,
    timestamp   TEXT NOT NULL,
    result_code TEXT,
    action      TEXT,
    data        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_history_ts ON history(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_history_result ON history(result_code);

CREATE TABLE IF NOT EXISTS templates (
    row_id     TEXT PRIMARY KEY,
    id         TEXT,
    updated_at TEXT NOT NULL,
    data       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS webhooks (
    row_id     TEXT PRIMARY KEY,
    id         TEXT,
    updated_at TEXT NOT NULL,
    data       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS exemptions (
    row_id     TEXT PRIMARY KEY,
    id         TEXT,
    updated_at TEXT NOT NULL,
    data       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS maintenance_windows (
    row_id     TEXT PRIMARY KEY,
    id         TEXT,
    updated_at TEXT NOT NULL,
    data       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS device_profiles (
    row_id     TEXT PRIMARY KEY,
    id         TEXT,
    updated_at TEXT NOT NULL,
    data       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
    key        TEXT PRIMARY KEY,
    nonce      TEXT UNIQUE,
    state      TEXT NOT NULL,
    expires_at INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    data       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_orders_state ON orders(state);
CREATE INDEX IF NOT EXISTS idx_orders_expires ON orders(expires_at);

-- WP-11.T10: nonce PK → INSERT OR IGNORE ile atomik replay koruması.
CREATE TABLE IF NOT EXISTS seen_nonces (
    nonce      TEXT PRIMARY KEY,
    expires_at INTEGER NOT NULL,
    seen_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_seen_nonces_exp ON seen_nonces(expires_at);

CREATE TABLE IF NOT EXISTS audit_log (
    seq          INTEGER PRIMARY KEY,
    ts           TEXT NOT NULL,
    actor        TEXT NOT NULL,
    action       TEXT NOT NULL,
    target       TEXT,
    detail       TEXT,
    prev_hmac    TEXT NOT NULL,
    record_hmac  TEXT NOT NULL,
    created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(ts);

CREATE TABLE IF NOT EXISTS audit_checkpoints (
    day         TEXT PRIMARY KEY,
    count       INTEGER NOT NULL,
    last_seq    INTEGER NOT NULL,
    last_hmac   TEXT NOT NULL,
    file_sha256 TEXT,
    created_at  TEXT NOT NULL
);

-- H-12/P-07: boot_key = floor(ms/60000); aynı dakikada tek kayıt.
CREATE TABLE IF NOT EXISTS boot_history (
    boot_key    INTEGER PRIMARY KEY,
    boot_at     TEXT NOT NULL UNIQUE,
    recorded_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS inventory (
    id         INTEGER PRIMARY KEY CHECK (id = 1),
    data       TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS migrations (
    id         TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL,
    detail     TEXT
);
