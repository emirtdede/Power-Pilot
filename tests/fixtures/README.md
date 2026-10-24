# Test fixture'ları

| Dosya | Amaç |
|---|---|
| `legacy-v0.json` | v0 → v2 depolama migrasyonu |
| `legacy-v1-hostnames.json` | Hostname allowlist'in düşürülmesi + LAN modunun güvenli kapanması |

Dinamik veri için `tests/helpers/fixtures.mjs` kullanın (görev, emir, muafiyet,
bakım penceresi, TLS materyali, sahte `schtasks`).
