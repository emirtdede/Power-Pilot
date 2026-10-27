# Yerel Tasarım Varlıkları

Bu klasördeki büyük tasarım ve mağaza görselleri bilinçli olarak Git dışında tutulur; uygulama kaynağı veya dokümantasyon metni değildir.

## İçerik

| Yol | İçerik |
|---|---|
| `design/` | UI tasarım exportları (`ana_ekran_*`, `ayarlar_ekran`), Stitch export'u, logolar ve tasarım promptu |
| `../store/assets/microsoft-store/` | Microsoft Store logo, poster ve uygulama ekran görüntüleri |

## Git politikası

- `docs/assets/design/` ve `docs/store/assets/` `.gitignore` içindedir.
- Bu klasörlerdeki dosyalar yerel çalışma/mağaza gönderimi için saklanır; normal commit'lere eklenmez.
- Yeni bir görsel kalıcı olarak dokümante edilecekse küçük bir metin/bağlantı `docs/store/` veya `docs/architecture/` altına eklenir; büyük binary dosya repoya konmaz.
