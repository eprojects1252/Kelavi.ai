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

# OpenRouter credentials stay on the backend only.
OPENROUTER_BASE_URL = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1").rstrip("/")
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "openrouter/free")
OPENROUTER_SITE_URL = os.getenv("OPENROUTER_SITE_URL", "https://kelaviai.netlify.app")
OPENROUTER_APP_NAME = os.getenv("OPENROUTER_APP_NAME", "Kelavi.ai")

app = FastAPI(title=APP_NAME, version="0.3.1")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[x.strip() for x in os.getenv("CORS_ORIGINS", "http://localhost:3000,https://kelaviai.netlify.app").split(",") if x.strip()],
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
    return {"name": APP_NAME, "status": "running", "provider": "OpenRouter"}


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "provider": "openrouter",
        "ai_provider_configured": bool(OPENROUTER_API_KEY and OPENROUTER_MODEL),
        "model": OPENROUTER_MODEL,
    }


def extract_reply(data: dict) -> str:
    choices = data.get("choices")
    if not isinstance(choices, list) or not choices or not isinstance(choices[0], dict):
        raise ValueError("Missing model choices")
    message = choices[0].get("message")
    if not isinstance(message, dict):
        raise ValueError("Missing assistant message")
    content = message.get("content")
    if isinstance(content, str):
        return content.strip()
    # Some compatible providers return text blocks instead of one string.
    if isinstance(content, list):
        parts = []
        for part in content:
            if isinstance(part, str):
                parts.append(part)
            elif isinstance(part, dict) and isinstance(part.get("text"), str):
                parts.append(part["text"])
        return "\n".join(parts).strip()
    return ""


@app.post("/api/v1/chat")
async def chat(payload: ChatRequest, user: dict = Depends(require_user)):
    if not OPENROUTER_API_KEY:
        raise HTTPException(status_code=503, detail="OpenRouter API key is not configured on the backend")
    try:
        async with httpx.AsyncClient(timeout=90) as client:
            response = await client.post(
                f"{OPENROUTER_BASE_URL}/chat/completions",
                headers={
                    "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                    "HTTP-Referer": OPENROUTER_SITE_URL,
                    "X-Title": OPENROUTER_APP_NAME,
                    "Content-Type": "application/json",
                },
                json={
                    "model": OPENROUTER_MODEL,
                    "messages": [
                        {
                            "role": "system",
                            "content": "You are Kelavi.ai, a helpful and accurate AI assistant. Reply in the user's language.",
                        },
                        {"role": "user", "content": payload.message},
                    ],
                    "temperature": 0.7,
                },
            )
            response.raise_for_status()
            data = response.json()
        reply = extract_reply(data)
        if not reply:
            raise HTTPException(status_code=502, detail="OpenRouter returned an empty or unsupported response")
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 429:
            raise HTTPException(status_code=429, detail="OpenRouter usage limit reached. Please try again later.") from exc
        if exc.response.status_code in (401, 403):
            raise HTTPException(status_code=502, detail="OpenRouter rejected the backend API key. Check backend configuration.") from exc
        raise HTTPException(status_code=502, detail="OpenRouter request failed. Check provider status and model availability.") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="Could not connect to OpenRouter") from exc
    except (ValueError, KeyError, IndexError, TypeError) as exc:
        raise HTTPException(status_code=502, detail="Unexpected OpenRouter response format") from exc

    return {"reply": reply, "model": OPENROUTER_MODEL, "provider": "openrouter"}
