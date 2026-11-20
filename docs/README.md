# Power Pilot Dokümantasyonu

Bu klasör; Power Pilot'un mimari, çeviri, sürüm, entegrasyon, OpenAPI, operasyon (runbook) ve mağaza belgelerini tek yerde toplar. Proje kökünde yalnızca ürün giriş belgeleri (`README.md`, `CHANGELOG.md`, `LICENSE`) ve kaynak kod dosyaları tutulur.

## Hızlı Erişim

| Konu | Belge |
|---|---|
| Ürün tanıtımı | [`../README.md`](../README.md) |
| Sürüm geçmişi | [`../CHANGELOG.md`](../CHANGELOG.md) |
| Güvenlik bildirimi | [`../.github/SECURITY.md`](../.github/SECURITY.md) |
| Katkı rehberi | [`../.github/CONTRIBUTING.md`](../.github/CONTRIBUTING.md) |

## Klasör Düzeni

### `architecture/`
Sistem mimarisi ve bileşen sözleşmeleri:
- [`architecture/POWER_PILOT_CURRENT_ARCHITECTURE.md`](architecture/POWER_PILOT_CURRENT_ARCHITECTURE.md)
- [`architecture/AUTOMATION_ENGINE.md`](architecture/AUTOMATION_ENGINE.md)
- [`architecture/SMART_FINISH.md`](architecture/SMART_FINISH.md)
- [`architecture/SAFETY_POLICIES.md`](architecture/SAFETY_POLICIES.md)
- [`architecture/LOCAL_API_SECURITY.md`](architecture/LOCAL_API_SECURITY.md)
- [`architecture/ENTERPRISE_PILOT.md`](architecture/ENTERPRISE_PILOT.md)
- [`architecture/WINDOW_AND_VIEWPORT_MATRIX.md`](architecture/WINDOW_AND_VIEWPORT_MATRIX.md)
- [`architecture/ACCESSIBILITY.md`](architecture/ACCESSIBILITY.md)
- [`architecture/KEYBOARD_SHORTCUTS.md`](architecture/KEYBOARD_SHORTCUTS.md)

### `i18n/`
- [`i18n/TRANSLATION_PLAN.md`](i18n/TRANSLATION_PLAN.md) — 73 dil mimarisi ve 17 tam yerel sözlük planı

### `integrations/` ve `openapi/`
- [`integrations/N8N_SETUP.md`](integrations/N8N_SETUP.md)
- [`integrations/POWERSHELL_AND_CLI.md`](integrations/POWERSHELL_AND_CLI.md)
- [`openapi/power-pilot-local-api.yaml`](openapi/power-pilot-local-api.yaml)

### `release/`
Sürüm, imzalama, ASAR bütünlüğü ve SBOM belgeleri:
- [`release/RELEASE_SIGNING.md`](release/RELEASE_SIGNING.md)
- [`release/RELEASE_HARDENING_1.0.1.md`](release/RELEASE_HARDENING_1.0.1.md)
- [`release/ASAR-INTEGRITY.md`](release/ASAR-INTEGRITY.md)
- [`release/SBOM.md`](release/SBOM.md)
- `release/release-ed25519.pub.pem`

### `reports/`
- [`reports/soak.md`](reports/soak.md)
- [`reports/soak.json`](reports/soak.json)
- [`reports/licenses.json`](reports/licenses.json)

### `runbooks/`
Operasyon ve olay müdahale prosedürleri:
- [`runbooks/incident-response.md`](runbooks/incident-response.md)
- [`runbooks/backup.md`](runbooks/backup.md)
- [`runbooks/db-restore.md`](runbooks/db-restore.md)
- [`runbooks/key-rotation.md`](runbooks/key-rotation.md)
- [`runbooks/rollback.md`](runbooks/rollback.md)
- [`runbooks/tls.md`](runbooks/tls.md)
- [`runbooks/tls-renewal.md`](runbooks/tls-renewal.md)
- [`runbooks/console-maintenance.md`](runbooks/console-maintenance.md)

### `store/`
- [`store/STORE_CHECKLIST.md`](store/STORE_CHECKLIST.md)
- [`store/AI_DISCLOSURE.md`](store/AI_DISCLOSURE.md)
- [`store/PRIVACY_POLICY.md`](store/PRIVACY_POLICY.md)
- [`store/privacy.html`](store/privacy.html)
- [`store/store-listing.json`](store/store-listing.json)
