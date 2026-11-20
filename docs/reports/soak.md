# Konsol Yük / Soak Raporu (WP-15.T4)

- Tarih: 2026-11-20T13:57:58.412Z
- Ajan: **100**
- Süre: **0.002 saat** (29 tur, 250 ms aralık; ilk 3 turda emir burst'ü)
- Emir: **300** üretildi, **300** makbuzlandı, **0** kayıp
- Gecikme: p50 **0.94 ms**, p95 **1.47 ms**, p99 **2.66 ms**
- RSS: 77.03 MB → 77.13 MB (**%0.13**)

## Kabul

- Emir kaybı: PASS (0)
- p95 < 150 ms: PASS
- RSS artışı < %5: PASS

24 saatlik üretim soak'u aynı komutla `--soak-hours 24 --interval-ms 5000` çalıştırılır; bu dosya CI/operasyon kanıtıdır.
