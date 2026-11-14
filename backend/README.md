# FastAPI backend

From this directory:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn app.main:app --reload
```

Open http://127.0.0.1:8000/docs.

Set a unique `KELAVI_DEV_API_KEY` and provider settings in `.env`. Send the development key using the `X-API-Key` header.

This is a development starter only. Before public deployment, implement real user authentication, customer API keys, quotas, rate limiting, usage metering, and secure secret management.
