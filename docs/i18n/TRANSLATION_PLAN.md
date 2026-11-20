# Power Pilot — 73 Dil Çeviri Planı (Translation Handoff Plan)

Bu belge, Power Pilot arayüzünde (Ayarlar ve Kurulum Sihirbazı) listelenen **73 dil** için çeviri yol haritasını tanımlar.

## Mevcut Durum

- **Toplam katalog dili:** 73 (Dev Cleaner ile birebir aynı ISO kodları ve yerel adlar)
- **Çevirisi hazır olan diller (17):** `tr`, `en`, `de`, `sv`, `no`, `da`, `fr`, `pl`, `it`, `nl`, `cs`, `es`, `pt`, `ja`, `zh`, `ko`, `ar`
- **Planlanan / İngilizce fallback ile çalışan diller (56):** Aşağıdaki tabloda listelenen tüm diller arayüzde seçilebilir ve kaydedilebilir; diskte ilgili `<kod>.json` / `<kod>.server.json` dosyası eklenene kadar otomatik olarak **İngilizce (`en`)** sözlüğüne düşer.
- **RTL (Sağdan Sola) diller (4):** `ar` (hazır), `he`, `fa`, `ur` (planlandı — `dir="rtl"` otomatik uygulanır).

---

## Çevirilecek 56 Dil Listesi

| # | Kod | İngilizce Adı | Yerel Adı | Yön | Hedef Dosya |
|---:|---|---|---|---|---|
| 1 | `ru` | Russian | Русский | LTR | `src/renderer/locales/ru.json` |
| 2 | `zh-tw` | Chinese (Traditional) | 繁體中文 | LTR | `src/renderer/locales/zh-tw.json` |
| 3 | `hi` | Hindi | हिन्दी | LTR | `src/renderer/locales/hi.json` |
| 4 | `id` | Indonesian | Bahasa Indonesia | LTR | `src/renderer/locales/id.json` |
| 5 | `vi` | Vietnamese | Tiếng Việt | LTR | `src/renderer/locales/vi.json` |
| 6 | `uk` | Ukrainian | Українська | LTR | `src/renderer/locales/uk.json` |
| 7 | `el` | Greek | Ελληνικά | LTR | `src/renderer/locales/el.json` |
| 8 | `fi` | Finnish | Suomi | LTR | `src/renderer/locales/fi.json` |
| 9 | `hu` | Hungarian | Magyar | LTR | `src/renderer/locales/hu.json` |
| 10 | `ro` | Romanian | Română | LTR | `src/renderer/locales/ro.json` |
| 11 | `th` | Thai | ไทย | LTR | `src/renderer/locales/th.json` |
| 12 | `ms` | Malay | Bahasa Melayu | LTR | `src/renderer/locales/ms.json` |
| 13 | `fil` | Filipino | Filipino | LTR | `src/renderer/locales/fil.json` |
| 14 | `bn` | Bengali | বাংলা | LTR | `src/renderer/locales/bn.json` |
| 15 | `he` | Hebrew | עברית | **RTL** | `src/renderer/locales/he.json` |
| 16 | `fa` | Persian | فارسی | **RTL** | `src/renderer/locales/fa.json` |
| 17 | `ur` | Urdu | اردو | **RTL** | `src/renderer/locales/ur.json` |
| 18 | `az` | Azerbaijani | Azərbaycan dili | LTR | `src/renderer/locales/az.json` |
| 19 | `kk` | Kazakh | Қазақша | LTR | `src/renderer/locales/kk.json` |
| 20 | `uz` | Uzbek | Oʻzbekcha | LTR | `src/renderer/locales/uz.json` |
| 21 | `bg` | Bulgarian | Български | LTR | `src/renderer/locales/bg.json` |
| 22 | `sk` | Slovak | Slovenčina | LTR | `src/renderer/locales/sk.json` |
| 23 | `hr` | Croatian | Hrvatski | LTR | `src/renderer/locales/hr.json` |
| 24 | `et` | Estonian | Eesti | LTR | `src/renderer/locales/et.json` |
| 25 | `ta` | Tamil | தமிழ் | LTR | `src/renderer/locales/ta.json` |
| 26 | `te` | Telugu | తెలుగు | LTR | `src/renderer/locales/te.json` |
| 27 | `mr` | Marathi | मराठी | LTR | `src/renderer/locales/mr.json` |
| 28 | `kn` | Kannada | ಕನ್ನಡ | LTR | `src/renderer/locales/kn.json` |
| 29 | `gu` | Gujarati | ગુજરાતી | LTR | `src/renderer/locales/gu.json` |
| 30 | `ml` | Malayalam | മലയാളം | LTR | `src/renderer/locales/ml.json` |
| 31 | `pa` | Punjabi | ਪੰਜਾਬੀ | LTR | `src/renderer/locales/pa.json` |
| 32 | `lt` | Lithuanian | Lietuvių | LTR | `src/renderer/locales/lt.json` |
| 33 | `lv` | Latvian | Latviešu | LTR | `src/renderer/locales/lv.json` |
| 34 | `sr` | Serbian | Srpski | LTR | `src/renderer/locales/sr.json` |
| 35 | `sl` | Slovenian | Slovenščina | LTR | `src/renderer/locales/sl.json` |
| 36 | `bs` | Bosnian | Bosanski | LTR | `src/renderer/locales/bs.json` |
| 37 | `sq` | Albanian | Shqip | LTR | `src/renderer/locales/sq.json` |
| 38 | `mk` | Macedonian | Македонски | LTR | `src/renderer/locales/mk.json` |
| 39 | `is` | Icelandic | Íslenska | LTR | `src/renderer/locales/is.json` |
| 40 | `sw` | Swahili | Kiswahili | LTR | `src/renderer/locales/sw.json` |
| 41 | `am` | Amharic | አማርኛ | LTR | `src/renderer/locales/am.json` |
| 42 | `ha` | Hausa | Hausa | LTR | `src/renderer/locales/ha.json` |
| 43 | `yo` | Yoruba | Yorùbá | LTR | `src/renderer/locales/yo.json` |
| 44 | `af` | Afrikaans | Afrikaans | LTR | `src/renderer/locales/af.json` |
| 45 | `ka` | Georgian | ქართული | LTR | `src/renderer/locales/ka.json` |
| 46 | `hy` | Armenian | Հայերեն | LTR | `src/renderer/locales/hy.json` |
| 47 | `ky` | Kyrgyz | Кыргызча | LTR | `src/renderer/locales/ky.json` |
| 48 | `tk` | Turkmen | Türkmençe | LTR | `src/renderer/locales/tk.json` |
| 49 | `mn` | Mongolian | Монгол | LTR | `src/renderer/locales/mn.json` |
| 50 | `ca` | Catalan | Català | LTR | `src/renderer/locales/ca.json` |
| 51 | `eu` | Basque | Euskara | LTR | `src/renderer/locales/eu.json` |
| 52 | `gl` | Galician | Galego | LTR | `src/renderer/locales/gl.json` |
| 53 | `ga` | Irish | Gaeilge | LTR | `src/renderer/locales/ga.json` |
| 54 | `my` | Burmese | မြန်မာစာ | LTR | `src/renderer/locales/my.json` |
| 55 | `km` | Khmer | ភាសាខ្មែរ | LTR | `src/renderer/locales/km.json` |
| 56 | `si` | Sinhala | සිංහල | LTR | `src/renderer/locales/si.json` |

---

## Çeviri Ajanı İçin Adım Adım Entegrasyon Kuralları

1. **Referans Kaynak:** `src/renderer/locales/en.json` dosyasını kaynak olarak al (`tr.json` ikincil bağlam olarak incelenebilir).
2. **Anahtar Eşitliği (Strict Parity):** Her yeni `src/renderer/locales/<kod>.json` dosyası, `en.json` içindeki **tüm anahtarları** eksiksiz içermeli (ne eksik ne fazla), hiçbir değer boş string (`""`) olmamalıdır.
3. **Placeholder Koruması:** `{action}`, `{time}`, `{watt}`, `{count}`, `{seconds}`, `{error}`, `{path}` gibi süslü parantezli yer tutucular **birebir aynı adla** korunmalıdır (çevrilmez).
4. **Otomatik Aktivasyon (Kod Değişmeden Çalışır):**
   - Yeni `<kod>.json` dosyası `src/renderer/locales/` altına eklenip `src/main/locales/<kod>.server.json` olarak kopyalandığında `main.js` içindeki `loadLocaleForRenderer()` dosyayı otomatik algılar ve İngilizce fallback yerine gerçek çeviriyi sunar.
5. **Kalite Kapılarına Ekleme (Tamamlanan Dilleri Resmileştirme):**
   - Çevirisi biten dil kodlarını şu 4 dosyadaki aktif çeviri listelerine ekleyin:
     1. `scripts/build-locales.mjs` → `LANGUAGE_ORDER`
     2. `scripts/check-i18n.js` → `LANGS`
     3. `src/main/i18n.js` → `LANGUAGE_ORDER`
     4. `src/renderer/i18n.js` → `TRANSLATED`
   - Ardından çalıştırın:
     ```powershell
     npm run build:locales
     npm run locales:check
     npx vitest run tests/main/i18n-check.test.mjs tests/main/main-i18n.test.mjs tests/renderer/i18n.test.mjs tests/renderer/i18n-keys.test.mjs
     ```
6. **RTL Doğrulama:** `he`, `fa` ve `ur` dilleri eklendiğinde `tests/e2e/responsive.spec.js` içindeki RTL test desenini bu diller için de doğrulayın (`dir="rtl"` otomatik atanır).
