# Power Pilot — Otomasyon Motoru (Automation Engine)

Power Pilot otomasyon motoru, eşzamanlı çoklu otomasyon görevlerini, zamanlamaları, Smart Finish koşullarını ve güvenlik politikalarını yöneten çekirdek modüldür.

---

## Görev Durumları (Task Statuses)
- **Draft**: Taslak halindeki otomasyon.
- **Scheduled**: Zamanlanmış ve zamanının gelmesini bekleyen otomasyon.
- **Monitoring**: Smart Finish koşullarını izleyen otomasyon.
- **Warning**: Güç işlemi öncesi geri sayım uyarısı gösteren otomasyon.
- **Snoozed**: Kullanıcı tarafından ertelenmiş otomasyon.
- **Executing**: Güç işlemini çalıştırmakta olan otomasyon.
- **Completed**: Başarıyla tamamlanmış otomasyon.
- **Blocked**: Güvenlik politikası veya çakışma nedeniyle engellenmiş otomasyon.
- **Failed**: İşletim sistemi veya izin hatası nedeniyle başarısız olmuş otomasyon.
- **Expired**: Çevrimdışı kalınan sürede zamanı geçtiği için çalıştırılmayan tek seferlik otomasyon.

---

## Çakışma Önleme (Conflict Resolution)
Aynı anda birden fazla güç işlemi tetiklendiğinde Power Pilot ilk öncelikli görevi çalıştırır. Çakışan diğer görevler `Blocked` durumuna geçirilerek loglanır.
