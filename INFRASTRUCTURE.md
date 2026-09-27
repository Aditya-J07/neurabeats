# Infrastructure & Deployment Guide — NeuroBeat

This guide covers deployment architectures, cloud hosting, containerization, environment variable security, and database persistence for production operation of NeuroBeat.

---

## 1. Hosting Architecture Overview

NeuroBeat utilizes a decoupled **Edge-Client / Cloud-Server** execution model:
* **Edge Layer**: Browser handles MediaPipe pose estimation, Web Audio vocal FFT, and Tone.js synthesis.
* **Server Layer**: WSGI application (Flask + Gunicorn) handles session coordination, Gemini 2.5 Flash orchestration, and database persistence.
* **Database Layer**: SQLite for single-node prototypes; managed PostgreSQL for high-availability enterprise environments.

---

## 2. Environment Variables Specification

| Variable Name | Required | Default / Example | Purpose |
| :--- | :---: | :--- | :--- |
| `SESSION_SECRET` | **Yes** | `neurobeat-prod-sec-83f92b7c4d1e0a` | Cryptographic secret for signing session cookies. |
| `JWT_SECRET_KEY` | **Yes** | `neurobeat-jwt-sec-9a8b7c6d5e4f3a` | Cryptographic key for signing API tokens. |
| `GEMINI_API_KEY` | **Yes** | `AIzaSy...` | Google AI Studio API key for Gemini 2.5 Flash clinical reports. |
| `HUGGINGFACE_API_TOKEN` | *Optional* | `hf_...` | Token for generative MusicGen auditory beat synthesis. |
| `DATABASE_URL` | *Optional* | `sqlite:///instance/neurobeat.db` | PostgreSQL connection URI for persistent cloud database. |
| `PORT` | *Auto* | `5000` / `8000` | Port assigned by hosting provider (Render, Railway, AWS). |

---

## 3. Cloud Deployment Options

### Option A: Render.com (Recommended for Fast Cloud Hosting)

1. **Create Web Service**:
   * Connect your GitHub repository.
   * **Runtime**: `Python 3`
   * **Build Command**: `pip install -r requirements.txt`
   * **Start Command**: `gunicorn main:app`
2. **Configure Environment Variables**:
   * Add `SESSION_SECRET`, `JWT_SECRET_KEY`, and `GEMINI_API_KEY`.
3. **Attach Managed PostgreSQL** *(Optional, for permanent data)*:
   * On Render, click **New +** $\rightarrow$ **PostgreSQL**.
   * Copy the **Internal Database URL**.
   * Add it as `DATABASE_URL` in your Web Service environment variables.

---

### Option B: Railway.app (Automatic Procfile Deployment)

1. Log in to [Railway](https://railway.app) and select **New Project** $\rightarrow$ **Deploy from GitHub repo**.
2. Railway detects [`Procfile`](file:///c:/Users/gurus/work/NITS_HACK_2026/Procfile) (`web: gunicorn main:app`) and [`requirements.txt`](file:///c:/Users/gurus/work/NITS_HACK_2026/requirements.txt).
3. Under **Variables**, add:
   - `SESSION_SECRET`
   - `GEMINI_API_KEY`
4. Under **Settings** $\rightarrow$ **Networking**, click **Generate Domain**.

---

### Option C: Standalone Linux VPS (Ubuntu / Debian)

#### 1. System Setup
```bash
sudo apt update && sudo apt install -y python3-pip python3-venv git nginx
git clone https://github.com/Aditya-J07/neurabeats.git /var/www/neurobeat
cd /var/www/neurobeat
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

#### 2. Systemd Service Unit (`/etc/systemd/system/neurobeat.service`)
```ini
[Unit]
Description=NeuroBeat Clinical Therapy Platform
After=network.target

[Service]
User=www-data
Group=www-data
WorkingDirectory=/var/www/neurobeat
Environment="PATH=/var/www/neurobeat/.venv/bin"
EnvironmentFile=/var/www/neurobeat/.env
ExecStart=/var/www/neurobeat/.venv/bin/gunicorn --workers 4 --bind 127.0.0.1:5000 main:app
Restart=always

[Install]
WantedBy=multi-user.target
```
Enable and start the service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable neurobeat
sudo systemctl start neurobeat
```

#### 3. Nginx Reverse Proxy (`/etc/nginx/sites-available/neurobeat`)
```nginx
server {
    server_name yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
Obtain free SSL certificate via Certbot:
```bash
sudo certbot --nginx -d yourdomain.com
```

---

## 4. Docker Containerization

To run NeuroBeat in a Dockerized environment:

### `Dockerfile`
```dockerfile
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 5000
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "4", "main:app"]
```

Build and run:
```bash
docker build -t neurobeat .
docker run -d -p 5000:5000 --env-file .env neurobeat
```

---

## 5. Performance Tuning & Concurrency

* **Gunicorn Concurrency**: Recommended formula for worker processes:
  $$\text{Workers} = (2 \times \text{CPU Cores}) + 1$$
  *(For a standard 2-core cloud VPS, run 5 Gunicorn workers).*
* **Memory Headroom**: Each worker consumes approximately 35MB–45MB. 4 workers comfortably operate in less than 200MB of total system RAM.
* **Connection Pooling**: SQLAlchemy engine options are configured with `pool_recycle=300` and `pool_pre_ping=True` in [`app.py`](file:///c:/Users/gurus/work/NITS_HACK_2026/app.py) to prevent stale database connections on managed cloud databases.
