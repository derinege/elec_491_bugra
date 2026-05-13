# elec_491_bugra — EMG veri toplama

Web Serial ile Arduino’dan **raw_adc,envelope** okur; indirme ve isteğe bağlı sunucu kaydı **pipeline uyumlu** `sample_index,raw_adc,phase` formatındadır (`senior_project` içindeki `emg_record_core` ile aynı sütunlar).

## Gereksinimler

- Node 20+ (önerilir), Python 3.11+

## Geliştirme

Terminal 1 — backend (varsayılan port **8788**):

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 127.0.0.1 --port 8788 --reload
```

Terminal 2 — frontend (**5177**):

```bash
cd frontend
npm install
npm run dev
```

Tarayıcı: `http://127.0.0.1:5177` — Vite, `/api` isteklerini backend’e proxy’ler.

İsteğe bağlı: CSV’lerin yazılacağı klasör (varsayılan: repoda `data/`):

```bash
export COLLECTOR_DATA_DIR=/path/to/data
```

## Pipeline ile devam

Kaydedilen dosyalar: `data/<GESTURE>/instance_NNN.csv` — bunları ana proje kökünde `preprocessor.py` → `extract_features.py` ile kullanabilirsin (veya `COLLECTOR_DATA_DIR`’i doğrudan `senior_project/data` yap).

## Üretim (tek makine)

```bash
cd frontend && npm ci && npm run build
cd ../backend && pip install -r requirements.txt
COLLECTOR_DATA_DIR=./data uvicorn main:app --host 0.0.0.0 --port 8788
```

Statik dosya servisi bu sürümde yok; frontend’i ayrı host’ta (ör. nginx) `VITE_API_BASE` ile API’ye yönlendirebilirsin.
