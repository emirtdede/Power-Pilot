# Konsol Yük / Soak Raporu (WP-15.T4)

- Tarih: 2026-10-23T17:14:54.313Z
- Ajan: **100**
- Süre: **1 saat** (720 tur, 5000 ms aralık; ilk 3 turda emir burst'ü)
- Emir: **300** üretildi, **300** makbuzlandı, **0** kayıp
- Gecikme: p50 **0.92 ms**, p95 **1.64 ms**, p99 **3.16 ms**
- RSS: 82.34 MB → 80.93 MB (**%-1.71**)

## Kabul

- Emir kaybı: PASS (0)
- p95 < 150 ms: PASS
- RSS artışı < %5: PASS

24 saatlik üretim soak'u aynı komutla `--soak-hours 24 --interval-ms 5000` çalıştırılır; bu dosya CI/operasyon kanıtıdır.
