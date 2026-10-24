# Power Pilot — CLI ve PowerShell Kullanım Rehberi

Power Pilot, komut satırı ve PowerShell ortamlarından güvenli biçimde kontrol edilebilir.

---

## 1. Environment Variable Tanımlama

PowerShell ortamınızda API anahtarınızı tanımlayın:

```powershell
$env:POWERPILOT_API_KEY = "pp_key_sizin_anahtariz"
```

---

## 2. PowerShell Örnekleri

### Durum Sorgulama:
```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:18456/api/v1/status" -Headers @{"X-API-Key"=$env:POWERPILOT_API_KEY}
```

### Zamanlayıcı Kurma (60 Dakika Sonra Shutdown):
```powershell
$body = @{
    name = "PowerShell Timer"
    action = "shutdown"
    durationMs = 3600000
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://127.0.0.1:18456/api/v1/tasks/timer" -Method Post -Headers @{"X-API-Key"=$env:POWERPILOT_API_KEY} -Body $body -ContentType "application/json"
```

### Ekranı Kilitleme:
```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:18456/api/v1/power/lock" -Method Post -Headers @{"X-API-Key"=$env:POWERPILOT_API_KEY}
```

### Diğer Anında Güç Eylemleri (signout / restart / sleep / hibernate):
```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:18456/api/v1/power/sleep" -Method Post -Headers @{"X-API-Key"=$env:POWERPILOT_API_KEY}
```

### Görev İptali (id ile):
```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:18456/api/v1/tasks/task_123/cancel" -Method Post -Headers @{"X-API-Key"=$env:POWERPILOT_API_KEY}
```

---

## 3. CLI Kullanımı (`src/cli/powerpilot.js`)

```bash
export POWERPILOT_API_KEY="pp_key_sizin_anahtariz"
node src/cli/powerpilot.js status
node src/cli/powerpilot.js tasks
node src/cli/powerpilot.js lock|signout|restart|sleep|hibernate|shutdown
```

---

## 4. Güvenlik Notları

- API varsayılan olarak kapalıdır; **Entegrasyonlar sekmesinden** açın ve anahtar üretin.
- Anahtar başlıkta (`X-API-Key` veya `Authorization: Bearer`) gönderilir, URL'de asla yer almaz.
- Dakikada IP başına 60 istek sınırı vardır (aşımda `429`).
- LAN erişimi yalnızca izinli IP listesinden kabul edilir; liste boşsa yalnız bu bilgisayar bağlanır.
