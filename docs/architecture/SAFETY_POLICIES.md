# Power Pilot — Güvenlik Politikası Motoru

Power Pilot, hiçbir güç işlemini güvenli doğrulamalardan geçirmeden çalıştırmaz.

---

## Güvenlik Kuralları

1. **Korunan Uygulamalar (Protected Apps)**:
   - Oyunlar, IDE'ler (VS Code, Visual Studio, IntelliJ), Render yazılımları (Photoshop, Premiere, Blender) veya Video görüşme (Teams, Zoom, Discord) uygulamaları açıkken güç işlemi engellenir.
2. **Uzaktan Komut Güvenliği (Remote Security Rules)**:
   - Yerel API veya n8n üzerinden gelen kapatma komutlarında, kullanıcı o anda bilgisayar başında aktifse uzaktan kapatma reddedilir.
3. **Zorla Kapatma Yasağı**:
   - Kaydedilmemiş verilerin kaybolmaması için uygulamaları zorla kapatma seçeneği varsayılan olarak kapalıdır.
