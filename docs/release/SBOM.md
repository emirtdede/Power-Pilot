# SBOM ve Yayın Manifesti (WP-15.T8)

Her release için iki dosya üretilir:

| Dosya | İçerik |
|---|---|
| `dist/sbom.cdx.json` | CycloneDX 1.5; tüm çalışma zamanı npm bileşenleri, purl, SHA hash, lisans |
| `dist/release-manifest.json` | Sürüm, lockfile/SBOM SHA-256, artefakt hash'leri ve Ed25519 imza |

## Üretim

```powershell
npm run pack
npm run dist:nsis
$env:PP_SBOM_SIGNING_KEY = "$env:USERPROFILE\.powerpilot\keys\release-ed25519.pem"
$env:PP_SBOM_KEY_ID = "release-2026"
npm run sbom -- --require-signature
```

- `PP_SBOM_INCLUDE_DEV=1` ile dev bağımlılıkları da eklenir (varsayılan: yalnızca üretim).
- İmza anahtarı çevrimdışı HSM'de tutulur; CI'ya kopyalanmaz.
- `--require-signature` anahtar yoksa **fail-closed** çıkar.

### Ücretsiz anahtar üretimi (bütçesiz kurulum)

```powershell
node -e "const c=require('crypto'),fs=require('fs');const k=c.generateKeyPairSync('ed25519');fs.writeFileSync('release-ed25519.pem',k.privateKey.export({type:'pkcs8',format:'pem'}));fs.writeFileSync('release-ed25519.pub.pem',k.publicKey.export({type:'spki',format:'pem'}));"
```

- Özel anahtar repoya **girmez** (`%USERPROFILE%\.powerpilot\keys\` gibi repo dışı bir yol).
- Açık anahtar `docs/release/release-ed25519.pub.pem` olarak yayınlanır.
- Özel anahtar kaybolursa eski sürümlerin imzası doğrulanamaz; şifreli yedek alın.

## Doğrulama

1. `sbom.cdx.json` içindeki `metadata.component.version` = `package.json` sürümü.
2. `release-manifest.json.sbom.sha256` = `Get-FileHash dist/sbom.cdx.json`.
3. Her artefaktın SHA-256 değeri installer ile eşleşir.
4. `signature.value`, manifestin `signature` alanı çıkarılmış JSON'u üzerinde
   Ed25519 imzasıyla doğrulanır. Açık anahtar release ekibinde saklanır.

```powershell
node -e "const fs=require('fs'),c=require('crypto');const m=JSON.parse(fs.readFileSync('dist/release-manifest.json','utf8'));const pub=fs.readFileSync('docs/release/release-ed25519.pub.pem','utf8');const cp={...m};delete cp.signature;console.log(c.verify(null,Buffer.from(JSON.stringify(cp),'utf8'),pub,Buffer.from(m.signature.value,'base64')));"
# beklenen: true
```

## Saklama

SBOM + manifest + imzalı tag, yayın artefaktlarıyla birlikte en az 5 yıl
saklanır. Bir artefakt yeniden üretilirse eski manifest geçersizdir; yeni
sürüm numarası gerekir.
