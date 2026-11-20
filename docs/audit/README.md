# Denetim Raporları

Bu klasör, tarih bazlı kod ve yayın öncesi denetimlerini içerir. Güncel rapor ile arşiv ayrı tutulur.

| Tarih | Rapor | Kapsam |
|---|---|---|
| 2026-11-18 | [`2026-11-18/PRE_DEPLOYMENT_QA_AUDIT.md`](2026-11-18/PRE_DEPLOYMENT_QA_AUDIT.md) | **Güncel** yayın öncesi denetim — 26 düzeltme (P0–P3), açık P0/P1 yok + kurulum/kapı kanıtları |
| 2026-10-26 | [`2026-10-26/QA_AUDIT_REPORT.md`](2026-10-26/QA_AUDIT_REPORT.md) | Arşiv denetim — 36 bulgu (4 Kritik, 11 Yüksek, 13 Orta, 8 Düşük) |
| 2026-10-26 | [`2026-10-26/PRE_DEPLOYMENT_QA_AUDIT.md`](2026-10-26/PRE_DEPLOYMENT_QA_AUDIT.md) | Arşiv yayın öncesi denetim — 34 bulgu |
| 2026-10-22 | [`2026-10-22/denetim-raporu-2026-10-22.md`](2026-10-22/denetim-raporu-2026-10-22.md) | İlk dağıtım öncesi denetim |

## Kanıt matrisi

V3 remediation planı uygulanırken her bulgu için kırmızı/yeşil test kanıtı, commit, artefakt ve gözden geçiren bilgisi `V3_EVIDENCE_MATRIX.md` dosyasında toplanacaktır. Bu dosya plan aşamasında değil, WP-00 yürütülürken oluşturulur.

## Kural

Yeni denetimler `audit/YYYY-MM-DD/` klasörüne eklenir. Eski raporlar silinmez; tarih klasöründe arşivlenir. Güncel rapordan eski rapora bağlantı verilirken tarih klasörü açıkça yazılır.
