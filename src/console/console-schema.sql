-- Power Pilot şirket konsolu — SQLite şeması (WP-03.T1)
-- Konsol tek süreçtir; WAL çoklu okuyucuya izin verir.

CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agents (
    agent_id          TEXT PRIMARY KEY,
    inventory         TEXT,
    last_heartbeat_at TEXT NOT NULL,
    disabled          INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS policies (
    id            TEXT PRIMARY KEY,
    type          TEXT,
    data          TEXT NOT NULL,
    dispatched_at TEXT NOT NULL
);

-- H-04: pending → inflight → acked/expired. Teslim silmez; makbuz/süre bitirir.
CREATE TABLE IF NOT EXISTS queues (
    nonce        TEXT PRIMARY KEY,
    agent_id     TEXT NOT NULL,
    state        TEXT NOT NULL,
    signed       TEXT NOT NULL,
    expires_at   INTEGER NOT NULL,
    delivered_at TEXT,
    acked_at     TEXT,
    attempts     INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_queues_agent_state ON queues(agent_id, state);
CREATE INDEX IF NOT EXISTS idx_queues_expires ON queues(expires_at);

-- WP-03.T4: (nonce, agent_id) tekil → aynı makbuz idempotent.
CREATE TABLE IF NOT EXISTS receipts (
    nonce       TEXT NOT NULL,
    agent_id    TEXT NOT NULL,
    code        TEXT,
    message     TEXT,
    received_at TEXT NOT NULL,
    PRIMARY KEY (nonce, agent_id)
);

CREATE TABLE IF NOT EXISTS audit (
    seq       INTEGER PRIMARY KEY,
    ts        TEXT NOT NULL,
    actor     TEXT NOT NULL,
    action    TEXT NOT NULL,
    target    TEXT,
    detail    TEXT,
    prev_hash TEXT NOT NULL,
    hash      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS keys (
    hash       TEXT PRIMARY KEY,
    role       TEXT NOT NULL,
    key_id     TEXT,
    agent_id   TEXT,
    not_after  INTEGER,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_keys_keyid ON keys(key_id);

CREATE TABLE IF NOT EXISTS migrations (
    id         TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL,
    detail     TEXT
);
