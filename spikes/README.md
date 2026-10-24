# WP-00 Spike Sonuçları

Tüm spike'lar Windows x64 + Electron 43.4.0 (Node 24.18.1) üzerinde çalıştırıldı.

| Spike | Komut | Sonuç | Karar |
|---|---|---|---|
| S1 — `app://` + `protocol.handle` + `net.fetch(pathToFileURL)` + `realpath` | `npx electron spikes/app-protocol/spike.js` | 200 servis, traversal 404/403 | **GO** |
| S2 — `canonicalize@5.1.0` RFC 8785 | `node spikes/canonicalize/spike.js` | Deterministik anahtar sıralaması | **GO** |
| S3 — `better-sqlite3` + `@node-rs/argon2` Electron ABI | `npx electron spikes/native-modules/spike.js` | ABI 148, her iki modül yüklendi | **GO** |
| S4 — `--headless --user-data-dir` | `powershell -File spikes/headless-service/spike.ps1` | Veri dosyası oluştu, süreç ayakta | **GO** |

## Notlar

- S1'de `..` içeren URL Chromium tarafından normalize edildiği için 404 döner;
  sembolik bağ/reparse noktası hedefi `fs.realpathSync` sonrası kök dışına
  çıkarsa 403 döner. WP-10 uygulaması aynı iki katmanlı kontrolü kullanır.
- S3 spike'ı `npm run postinstall` (electron-rebuild) sonrası çalıştırılmalıdır.
- S4 geliştirme modunda `npx electron .` kullanır; paketli sürümde
  `dist\win-unpacked\Power Pilot.exe` otomatik seçilir.
- S4'te sır yazma/okuma ayrıca `tests/main/secrets.test.mjs` T-SEC-08 ile
  kapsanır (enjekte edilmiş safeStorage ve gerçek dosya sistemi).
