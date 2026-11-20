# Klavye Navigasyonu ve Kısayollar Rehberi

Power Pilot'un tüm görünümleri, ayarları, diyalog pencereleri ve mini widget'ı fare kullanmadan yalnızca klavyeyle yönetilebilir.

---

## 1. Genel Kabuk ve Navigasyon

| Tuş / Kısayol | Bağlam | İşlev |
|---|---|---|
| `Tab` / `Shift + Tab` | Tüm uygulama | İlk durak olan **Ana içeriğe atla** (`#pp-skip`) bağlantısından başlayarak başlık çubuğu, 11 kenar çubuğu görünüm düğmesi ve aktif görünüm kontrolleri arasında sırayla gezinir. |
| `Enter` | `#pp-skip` (İlk Tab durağı) | Kenar çubuğunu atlayarak odağı doğrudan ana içerik alanına (`#main-content`) taşır. |
| `ArrowDown` / `ArrowUp` | Kenar çubuğu (`#app-sidebar nav`) | Görünümü değiştirmeden sonraki / önceki navigasyon düğmesine odak taşır (döngüsel). |
| `Home` / `End` | Kenar çubuğu (`#app-sidebar nav`) | Görünümü değiştirmeden ilk (**Panel**) veya son (**Hakkında**) navigasyon düğmesine odak taşır. |
| `Enter` / `Space` | Navigasyon düğmesi (`.nav-btn`) | Seçili görünümü açar, `document.title` başlığını günceller ve odağı yeni görünüme taşır. |
| `Escape` | Dar pencere çekmecesi (`< 900 px`, açıkken) | Navigasyon çekmecesini kapatır ve odağı menü açma düğmesine (`#btn-nav-toggle`) geri döndürür. |

---

## 2. Hızlı Güç Eylemi ve Uygulama Kısayolları

> **Not:** Odak bir metin girişi (`<input>`, `<textarea>`, `<select>`) içindeyken tek tuşlu / `Alt` kısayolları yazmayı engellememek için devre dışı kalır.

| Kısayol | İşlev |
|---|---|
| `Alt + S` | Pano'da **Bilgisayarı Kapat** (`shutdown`) eylemini seçer. |
| `Alt + R` | Pano'da **Yeniden Başlat** (`restart`) eylemini seçer. |
| `Alt + L` | Pano'da **Uyku Modu** (`sleep`) eylemini seçer. |
| `Alt + H` | Pano'da **Hazırda Beklet** (`hibernate`) eylemini seçer. |
| `Alt + K` | Pano'da **Kilitle** (`lock`) eylemini seçer. |
| `Ctrl + T` (veya `Cmd + T`) | Açık Tema ile Koyu Tema arasında anında geçiş yapar ve tercihi kaydeder. |
| `Escape` (Aktif Görev görünümünde) | Aktif geri sayımı iptal etme akışını (`#btn-cancel`) tetikler. |

---

## 3. Diyaloglar (Modallar) ve Bildirimler

| Tuş | Bağlam | İşlev |
|---|---|---|
| `Tab` / `Shift + Tab` | Açık modal (`EULA`, `Gizlilik`, `OSS`, `Dış Bağlantı`, `Verileri Sil`, `PIN`) | Odağı modal içindeki etkileşimli kontroller arasında döndürür (odak modal dışına çıkmaz). |
| `Escape` | Açık modal | Modalı güvenli iptal yoluyla kapatır ve odağı modalı açan tetikleyici düğmeye geri döndürür. |
| `Enter` | PIN modalı giriş alanı (`#pin-modal-input`) | Girilen PIN kodunu onaylar. |
| `Tab` → `Enter` / `Space` | Toast bildirimi kapatma düğmesi | Bildirim odaklıyken otomatik kapanma sayacı duraklar; kapatma düğmesi bildirimi anında kaldırır. |

---

## 4. Mini Widget (`mini.html`)

| Tuş | İşlev |
|---|---|
| `Tab` / `Shift + Tab` | **Arka Plana Gönder** (`#btn-hide`), **Uygulamayı Aç** (`#btn-restore`) ve **Zamanlayıcıyı İptal Et** (`#btn-cancel`) düğmeleri arasında görünür odak halkasıyla gezinir. |
| `Enter` / `Space` | Odaklı mini widget kontrolünü çalıştırır. |
