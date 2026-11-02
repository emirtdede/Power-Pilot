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
4. **Aktif Güç İsteği Kontrolü (yetenek-farkındalıklı)**:
   - Windows'ta indirme/sunum/yazdırma süren bir iş varsa otomatik kapatma engellenir.
   - Bu kontrol `powercfg.exe /requests` kullanır ve **yükseltilmiş yetki** gerektirir. Paketlenmiş uygulama `asInvoker` çalıştığı için bu komut normal kullanıcıda çalışmaz.
   - Motor açılışta bir **yetenek sondası** yapar:
     - Yetenek **VAR** → kontrol eskisi gibi fail-closed çalışır (ölçüm hatasında eylem engellenir).
     - Yetenek **YOK** → yalnız bu kapı atlanır; sonuç `loadCheck: "unavailable"` ile işaretlenir, `audit` günlüğüne `power_request_check_unavailable` kaydı yazılır ve Ayarlar → Entegrasyonlar ekranında uyarı gösterilir.
   - Diğer tüm kapılar (kill-switch, korunan uygulamalar, uzaktan-aktif kullanıcı, bakım penceresi, muafiyet, sunucu profili) yetenekten bağımsız olarak **her zaman** uygulanır.
   - Tanı: `node scripts/safety-probe.mjs` (salt-okunur; hiçbir güç eylemi yürütmez).

### Neden bu tasarım?

`powercfg /requests` yetkisiz çalıştırıldığında hata verir; bunu "fail-closed" saymak, hiçbir güç eyleminin çalışmaması demekti (ürünün CORE işlevi durur). Ölçümü **görünür biçimde** atlamak, sessizce açık bırakmaktan farklıdır: kullanıcı ve denetim zinciri durumu görür, güvenlik kararı verilirken varsayım yapılmaz. Yükseltilmiş kurulumda davranış bit-bit aynıdır.

| Ortam | `powercfg /requests` | `checkSystemLoad` davranışı | Sonuç |
| --- | --- | --- | --- |
| Yükseltilmiş oturum | Çalışır | Aktif istek varsa `POWER_REQUEST_ACTIVE` | Fail-closed |
| Yükseltilmiş oturum | Hata/boş | `POWER_REQUESTS_UNAVAILABLE` | Fail-closed |
| `asInvoker` paket | Yetki hatası | Atlanır, `loadCheck: "unavailable"` | Diğer kapılar etkin |

