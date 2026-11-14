import os
import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

load_dotenv()

APP_NAME = "Kelavi.ai API"
SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_PUBLISHABLE_KEY = os.getenv("SUPABASE_PUBLISHABLE_KEY", "")
AI_BASE_URL = os.getenv("AI_BASE_URL", "").rstrip("/")
AI_API_KEY = os.getenv("AI_API_KEY", "")
AI_MODEL = os.getenv("AI_MODEL", "")

app = FastAPI(title=APP_NAME, version="0.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[x.strip() for x in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",") if x.strip()],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Authorization"],
)

class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=12000)

async def require_user(authorization: str | None = Header(default=None)):
    if not SUPABASE_URL or not SUPABASE_PUBLISHABLE_KEY:
        raise HTTPException(status_code=503, detail="Supabase backend configuration is missing")
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Sign in is required")
    token = authorization.removeprefix("Bearer ").strip()
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.get(
                f"{SUPABASE_URL}/auth/v1/user",
                headers={"apikey": SUPABASE_PUBLISHABLE_KEY, "Authorization": f"Bearer {token}"},
            )
        if response.status_code != 200:
            raise HTTPException(status_code=401, detail="Your session is invalid or expired")
        return response.json()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="Could not verify your sign-in session") from exc

@app.get("/")
async def root():
    return {"name": APP_NAME, "status": "running", "docs": "/docs"}

@app.get("/health")
async def health():
    return {"status": "ok", "ai_provider_configured": bool(AI_BASE_URL and AI_API_KEY and AI_MODEL)}

@app.post("/api/v1/chat")
async def chat(payload: ChatRequest, user: dict = Depends(require_user)):
    if not (AI_BASE_URL and AI_API_KEY and AI_MODEL):
        raise HTTPException(status_code=503, detail="AI provider is not configured yet")
    try:
        async with httpx.AsyncClient(timeout=90) as client:
            response = await client.post(
                f"{AI_BASE_URL}/chat/completions",
                headers={"Authorization": f"Bearer {AI_API_KEY}"},
                json={
                    "model": AI_MODEL,
                    "messages": [
                        {"role": "system", "content": "You are Kelavi.ai, a helpful and accurate AI assistant. Reply in the user's language."},
                        {"role": "user", "content": payload.message},
                    ],
                    "temperature": 0.7,
                },
            )
            response.raise_for_status()
            data = response.json()
        reply = data["choices"][0]["message"]["content"]
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="AI provider connection failed") from exc
    except (KeyError, IndexError, TypeError) as exc:
        raise HTTPException(status_code=502, detail="Unexpected AI provider response") from exc
    return {"reply": str(reply), "model": AI_MODEL}
