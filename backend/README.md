# FastAPI backend

From this directory:

```powershell
python -m venv .venv
.venv\\Scripts\\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn app.main:app --reload
```

Open http://127.0.0.1:8000/docs.

## OpenRouter setup

Add these values to the backend environment (or the local `.env` file):

- `OPENROUTER_BASE_URL=https://openrouter.ai/api/v1`
- `OPENROUTER_API_KEY=` your private OpenRouter key
- `OPENROUTER_MODEL=openrouter/free`
- `OPENROUTER_SITE_URL=https://kelaviai.netlify.app`
- `OPENROUTER_APP_NAME=Kelavi.ai`

Never put `OPENROUTER_API_KEY` in frontend code, a `NEXT_PUBLIC_*` variable, GitHub, or a chat message.

The `/api/v1/chat` endpoint verifies the Supabase access token before calling OpenRouter. The default `openrouter/free` model route is subject to OpenRouter free-model availability and rate limits. Select another model in the backend environment when needed.

For the frontend, set `NEXT_PUBLIC_KELAVI_API_URL` to the public URL of this FastAPI backend in Netlify, then redeploy the frontend.

This is an early development backend. Per-user quotas, usage metering, persistent chat history, abuse protection, and production deployment hardening are still pending.
