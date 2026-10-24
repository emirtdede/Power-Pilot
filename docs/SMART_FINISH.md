# Power Pilot — Smart Finish Koşul Motoru

Smart Finish, kullanıcının yalnızca süreye bağlı kalmadan bilgisayarındaki işlerin (Render, İndirme, Boşta kalma vb.) tam olarak ne zaman bittiğini algılayan akıllı durum takip motorudur.

---

## Desteklenen Koşul Türleri

1. **İşlem Takibi (Process Close)**:
   - Seçilen executable (örn: `handbrake.exe`, `premiere.exe`) kapandığında koşul sağlanır.
2. **CPU Kullanımı (CPU Threshold)**:
   - Sistem veya süreç CPU kullanımı belirlenen % eşiğinin altına düştüğünde tetiklenir.
3. **Kullanıcı Boşta Kalma (User Idle)**:
   - Klavye/Fare hareketsizliği belirlenen saniyeyi aştığında tetiklenir.
4. **Dosya & Klasör Değişimi**:
   - İndirilen veya oluşturulan dosyanın boyutu sabitleştiğinde algılar.

---

## Kararlılık Doğrulaması (Stability Duration)
Anlık performans düşüşlerinde (örneğin CPU'nun 1 saniyeliğine %5'e inmesi) yanlış kapatmayı önlemek için varsayılan 15-60 saniyelik kararlılık süresi uygulanır.
