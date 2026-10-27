# Power Pilot Dokümantasyonu

Bu klasör, Power Pilot'un mimari, denetim, planlama, sürüm, operasyon ve mağaza belgelerini tek yerde toplar. Proje kökünde yalnızca ürün giriş belgeleri (`README.md`, `CHANGELOG.md`, `LICENSE`) ve kaynak/kod dosyaları tutulur.

## Hızlı erişim

| Konu | Belge |
|---|---|
| Ürün tanıtımı | [`../README.md`](../README.md) |
| Sürüm geçmişi | [`../CHANGELOG.md`](../CHANGELOG.md) |
| Test baseline | [`../tests/BASELINE.md`](../tests/BASELINE.md) |
| Güncel denetim (36 bulgu) | [`audit/2026-10-26/QA_AUDIT_REPORT.md`](audit/2026-10-26/QA_AUDIT_REPORT.md) |
| Güncel remediation planı | [`planning/REMEDIATION_PLAN_WBS_V3.md`](planning/REMEDIATION_PLAN_WBS_V3.md) |
| Açık yayın işleri | [`planning/YAPILACAKLAR.md`](planning/YAPILACAKLAR.md) |
| Güvenlik bildirimi | [`../.github/SECURITY.md`](../.github/SECURITY.md) |
| Katkı rehberi | [`../.github/CONTRIBUTING.md`](../.github/CONTRIBUTING.md) |

## Klasör düzeni

### `architecture/`
Sistem mimarisi ve bileşen sözleşmeleri:

- [`architecture/POWER_PILOT_CURRENT_ARCHITECTURE.md`](architecture/POWER_PILOT_CURRENT_ARCHITECTURE.md)
- [`architecture/AUTOMATION_ENGINE.md`](architecture/AUTOMATION_ENGINE.md)
- [`architecture/SMART_FINISH.md`](architecture/SMART_FINISH.md)
- [`architecture/SAFETY_POLICIES.md`](architecture/SAFETY_POLICIES.md)
- [`architecture/LOCAL_API_SECURITY.md`](architecture/LOCAL_API_SECURITY.md)
- [`architecture/ENTERPRISE_PILOT.md`](architecture/ENTERPRISE_PILOT.md)

### `audit/`
Tarih bazlı denetim raporları. Güncel rapor ile arşiv ayrı tutulur:

- [`audit/2026-10-26/QA_AUDIT_REPORT.md`](audit/2026-10-26/QA_AUDIT_REPORT.md) — güncel 36 bulguluk denetim
- [`audit/2026-10-26/PRE_DEPLOYMENT_QA_AUDIT.md`](audit/2026-10-26/PRE_DEPLOYMENT_QA_AUDIT.md) — önceki 34 bulguluk denetim
- [`audit/2026-10-22/denetim-raporu-2026-10-22.md`](audit/2026-10-22/denetim-raporu-2026-10-22.md) — ilk denetim
- `audit/V3_EVIDENCE_MATRIX.md` — V3 planı uygulanırken oluşturulacak kanıt matrisi

### `planning/`
Güncel plan ve yürütme belgeleri:

- [`planning/REMEDIATION_PLAN_WBS_V3.md`](planning/REMEDIATION_PLAN_WBS_V3.md) — 28 WP, 6 kapı, 36/36 bulgu
- [`planning/YAPILACAKLAR.md`](planning/YAPILACAKLAR.md) — yayın öncesi açık işler
- [`planning/archive/REMEDIATION_PLAN_WBS.md`](planning/archive/REMEDIATION_PLAN_WBS.md) — önceki 34 bulguluk plan
- [`planning/archive/cozum-plani-2026-10-22.md`](planning/archive/cozum-plani-2026-10-22.md) — 22 Ekim çözüm planı

### `release/`
Sürüm, imzalama ve paket kanıtları:

- [`release/RELEASE_SIGNING.md`](release/RELEASE_SIGNING.md)
- [`release/RELEASE_HARDENING_1.0.1.md`](release/RELEASE_HARDENING_1.0.1.md)
- [`release/ASAR-INTEGRITY.md`](release/ASAR-INTEGRITY.md)
- [`release/SBOM.md`](release/SBOM.md)
- `release/release-ed25519.pub.pem`

### `runbooks/`
Operasyon ve olay müdahale prosedürleri. Başlangıç noktası: [`runbooks/incident-response.md`](runbooks/incident-response.md).

### `integrations/` ve `openapi/`
- [`integrations/N8N_SETUP.md`](integrations/N8N_SETUP.md)
- [`integrations/POWERSHELL_AND_CLI.md`](integrations/POWERSHELL_AND_CLI.md)
- [`openapi/power-pilot-local-api.yaml`](openapi/power-pilot-local-api.yaml)

### `store/`
- [`store/STORE_CHECKLIST.md`](store/STORE_CHECKLIST.md)
- [`store/AI_DISCLOSURE.md`](store/AI_DISCLOSURE.md)
- `store/assets/microsoft-store/` — mağaza görselleri (yerel, git dışı)

### `reports/`
- [`reports/soak.md`](reports/soak.md)
- [`reports/soak.json`](reports/soak.json)
- [`reports/licenses.json`](reports/licenses.json)

### `assets/`
- [`assets/README.md`](assets/README.md)
- `assets/design/` — UI tasarım exportları, logolar ve tasarım promptu (yerel, git dışı)

### GitHub politikaları
- [`../.github/SECURITY.md`](../.github/SECURITY.md) — güvenlik açığı bildirimi ve desteklenen sürümler
- [`../.github/CONTRIBUTING.md`](../.github/CONTRIBUTING.md) — yetkili katkıcılar için dal, commit ve kalite kapıları
- [`../.github/CODE_OF_CONDUCT.md`](../.github/CODE_OF_CONDUCT.md) — işbirliği ve gizlilik beklentileri
- [`../.github/SUPPORT.md`](../.github/SUPPORT.md) — destek kanalları
- [`../.github/ISSUE_TEMPLATE/`](../.github/ISSUE_TEMPLATE/) — hata ve özellik talebi formları
- [`../.github/workflows/`](../.github/workflows/) — CI ve haftalık bağımlılık denetimi

## Bakım kuralları

1. Yeni denetim raporu `audit/YYYY-MM-DD/` altına eklenir; eski raporlar silinmez, tarih klasöründe tutulur.
2. Güncel plan `planning/` altında tutulur; tamamlanmış veya geçersiz planlar `planning/archive/` altına taşınır.
3. Sürüm ve imza belgeleri `release/`, operasyon adımları `runbooks/` altında tutulur.
4. Dokümanlar arası bağlantılar göreli (`../`) verilir; kök dizine mutlak yol yazılmaz.
5. Build çıktıları (`dist/`, `coverage/`, `test-results/`), loglar ve geçici scriptler `docs/` altına konmaz.
6. Büyük tasarım/mağaza görselleri `docs/assets/design/` ve `docs/store/assets/` altında yerel olarak tutulur; `.gitignore` ile repo dışında bırakılır.
