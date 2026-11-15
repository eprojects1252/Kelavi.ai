import os
import logging
import time
import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

load_dotenv()

logger = logging.getLogger("kilavi.openrouter")

APP_NAME = "Kilavi.Ai API"
SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_PUBLISHABLE_KEY = os.getenv("SUPABASE_PUBLISHABLE_KEY", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

# OpenRouter credentials stay on the backend only.
OPENROUTER_BASE_URL = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1").rstrip("/")
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "openrouter/free")
OPENROUTER_SITE_URL = os.getenv("OPENROUTER_SITE_URL", "https://kelaviai.netlify.app")
OPENROUTER_APP_NAME = os.getenv("OPENROUTER_APP_NAME", "Kilavi.Ai")

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


class CustomTokenLimitRequest(BaseModel):
    enabled: bool
    monthly_token_limit: int | None = Field(default=None, ge=1)


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


async def get_monthly_token_quota(user_id: str) -> tuple[int, int, int]:
    """Return (used_tokens, effective_monthly_limit) using trusted server-side queries."""
    if not SUPABASE_SERVICE_ROLE_KEY:
        raise HTTPException(status_code=503, detail="Token limit service is not configured")

    headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
    }
    month_start = time.strftime("%Y-%m-01T00:00:00+00:00", time.gmtime())

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            subscription_response = await client.get(
                f"{SUPABASE_URL}/rest/v1/user_subscriptions",
                headers=headers,
                params={
                    "select": "custom_monthly_token_limit,custom_limit_enabled,plans(monthly_token_limit,requests_per_minute)",
                    "user_id": f"eq.{user_id}",
                    "status": "eq.active",
                    "order": "created_at.desc",
                    "limit": "1",
                },
            )
            if subscription_response.status_code != 200:
                logger.error("Subscription lookup failed status=%s", subscription_response.status_code)
                raise HTTPException(status_code=503, detail="Could not verify your active plan")

            subscriptions = subscription_response.json()
            if not subscriptions:
                raise HTTPException(status_code=403, detail="No active plan is assigned to this account")

            subscription = subscriptions[0]
            plan_data = subscription.get("plans")
            if isinstance(plan_data, list):
                plan_data = plan_data[0] if plan_data else {}
            if not isinstance(plan_data, dict):
                plan_data = {}

            plan_limit = plan_data.get("monthly_token_limit")
            requests_per_minute = int(plan_data.get("requests_per_minute") or 0)
            custom_limit = subscription.get("custom_monthly_token_limit")
            custom_enabled = subscription.get("custom_limit_enabled") is True
            effective_limit = custom_limit if custom_enabled and custom_limit is not None else plan_limit
            if effective_limit is None or int(effective_limit) <= 0:
                raise HTTPException(status_code=503, detail="Your plan token limit is not configured")

            used_tokens = 0
            page_size = 1000
            offset = 0
            while True:
                usage_response = await client.get(
                    f"{SUPABASE_URL}/rest/v1/usage_logs",
                    headers=headers,
                    params={
                        "select": "total_tokens",
                        "user_id": f"eq.{user_id}",
                        "created_at": f"gte.{month_start}",
                        "order": "id.asc",
                        "limit": str(page_size),
                        "offset": str(offset),
                    },
                )
                if usage_response.status_code != 200:
                    logger.error("Monthly usage lookup failed status=%s", usage_response.status_code)
                    raise HTTPException(status_code=503, detail="Could not verify monthly token usage")
                rows = usage_response.json()
                used_tokens += sum(max(0, int(row.get("total_tokens") or 0)) for row in rows)
                if len(rows) < page_size:
                    break
                offset += page_size

            return used_tokens, int(effective_limit), requests_per_minute
    except httpx.HTTPError as exc:
        logger.error("Token quota lookup connection error type=%s", type(exc).__name__)
        raise HTTPException(status_code=502, detail="Could not check your token usage") from exc


async def record_usage(user_id: str, model: str, usage: dict, latency_ms: int):
    # Service-role key is backend-only and must never be exposed to the browser.
    if not SUPABASE_SERVICE_ROLE_KEY:
        logger.warning("Usage logging skipped: SUPABASE_SERVICE_ROLE_KEY is not configured")
        return
    payload = {
        "user_id": user_id, "model": model, "endpoint": "/api/v1/chat",
        "input_tokens": int(usage.get("prompt_tokens") or usage.get("input_tokens") or 0),
        "output_tokens": int(usage.get("completion_tokens") or usage.get("output_tokens") or 0),
        "total_tokens": int(usage.get("total_tokens") or (usage.get("prompt_tokens") or usage.get("input_tokens") or 0) + (usage.get("completion_tokens") or usage.get("output_tokens") or 0)), "status_code": 200,
        "latency_ms": max(0, int(latency_ms)),
    }
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            result = await client.post(
                f"{SUPABASE_URL}/rest/v1/usage_logs",
                headers={"apikey": SUPABASE_SERVICE_ROLE_KEY, "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}", "Content-Type": "application/json", "Prefer": "return=minimal"},
                json=payload,
            )
        if result.status_code not in (200, 201, 204):
            logger.error("Usage log insert failed status=%s", result.status_code)
    except httpx.HTTPError as exc:
        logger.error("Usage log insert connection error type=%s", type(exc).__name__)

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
    used_tokens, token_limit, requests_per_minute = await get_monthly_token_quota(str(user.get("id", "")))
    if used_tokens >= token_limit:
        raise HTTPException(
            status_code=429,
            detail=f"Monthly token limit reached ({used_tokens:,}/{token_limit:,}). Your limit resets at the start of next month.",
        )
    if requests_per_minute > 0:
        minute_start = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() - 60))
        headers = {
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        }
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                recent_response = await client.get(
                    f"{SUPABASE_URL}/rest/v1/usage_logs",
                    headers=headers,
                    params={
                        "select": "id",
                        "user_id": f"eq.{user.get('id', '')}",
                        "created_at": f"gte.{minute_start}",
                        "order": "created_at.desc",
                        "limit": str(requests_per_minute + 1),
                    },
                )
            if recent_response.status_code != 200:
                logger.error("Rate limit usage lookup failed status=%s", recent_response.status_code)
                raise HTTPException(status_code=503, detail="Could not verify your request rate")
            recent_requests = len(recent_response.json())
        except httpx.HTTPError as exc:
            logger.error("Rate limit lookup connection error type=%s", type(exc).__name__)
            raise HTTPException(status_code=502, detail="Could not check your request rate") from exc
        if recent_requests >= requests_per_minute:
            raise HTTPException(
                status_code=429,
                detail=f"Request rate limit reached ({recent_requests}/{requests_per_minute} per minute). Please wait a minute and try again.",
            )
    if not OPENROUTER_API_KEY:
        raise HTTPException(status_code=503, detail="OpenRouter API key is not configured on the backend")
    started_at = time.perf_counter()
    provider_usage = {}
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
                            "content": "You are Kilavi.Ai, a helpful and accurate AI assistant. Reply in the user's language.",
                        },
                        {"role": "user", "content": payload.message},
                    ],
                    "temperature": 0.7,
                },
            )
            response.raise_for_status()
            data = response.json()
            provider_usage = data.get("usage") if isinstance(data.get("usage"), dict) else {}
        reply = extract_reply(data)
        if not reply:
            raise HTTPException(status_code=502, detail="OpenRouter returned an empty or unsupported response")
    except httpx.HTTPStatusError as exc:
        # Log provider diagnostics without logging request headers, API keys, or user prompts.
        provider_error = ""
        try:
            error_data = exc.response.json().get("error", {})
            if isinstance(error_data, dict):
                provider_error = str(error_data.get("message", ""))[:300]
        except (ValueError, AttributeError):
            provider_error = ""
        logger.error("OpenRouter HTTP error status=%s message=%s", exc.response.status_code, provider_error)
        if exc.response.status_code == 429:
            raise HTTPException(status_code=429, detail="OpenRouter usage limit reached. Please try again later.") from exc
        if exc.response.status_code in (401, 403):
            raise HTTPException(status_code=502, detail="OpenRouter rejected the backend API key. Check backend configuration.") from exc
        raise HTTPException(status_code=502, detail="OpenRouter request failed. Check provider status and model availability.") from exc
    except httpx.HTTPError as exc:
        logger.error("OpenRouter connection error type=%s", type(exc).__name__)
        raise HTTPException(status_code=502, detail="Could not connect to OpenRouter") from exc
    except (ValueError, KeyError, IndexError, TypeError) as exc:
        logger.error("OpenRouter response parsing error type=%s", type(exc).__name__)
        raise HTTPException(status_code=502, detail="Unexpected OpenRouter response format") from exc

    await record_usage(str(user.get("id", "")), str(data.get("model") or OPENROUTER_MODEL), provider_usage, int((time.perf_counter() - started_at) * 1000))
    return {"reply": reply, "model": OPENROUTER_MODEL, "provider": "openrouter"}

@app.get("/api/v1/admin/users")
async def list_admin_users(admin: dict = Depends(require_user)):
    """List profile records for the admin token-limit selector."""
    if not SUPABASE_SERVICE_ROLE_KEY:
        raise HTTPException(status_code=503, detail="Admin service is not configured")
    headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
    }
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            role_response = await client.get(
                f"{SUPABASE_URL}/rest/v1/profiles",
                headers=headers,
                params={"select": "role", "id": f"eq.{admin.get('id', '')}", "limit": "1"},
            )
            if role_response.status_code != 200:
                logger.error("Admin role lookup failed status=%s", role_response.status_code)
                raise HTTPException(status_code=503, detail="Could not verify admin permissions")
            role_rows = role_response.json()
            if not role_rows or role_rows[0].get("role") != "admin":
                raise HTTPException(status_code=403, detail="Admin access is required")

            users_response = await client.get(
                f"{SUPABASE_URL}/rest/v1/profiles",
                headers=headers,
                params={"select": "id,display_name,role", "order": "created_at.asc"},
            )
            if users_response.status_code != 200:
                logger.error("Admin user list failed status=%s", users_response.status_code)
                raise HTTPException(status_code=503, detail="Could not load user accounts")
            return {"users": users_response.json()}
    except httpx.HTTPError as exc:
        logger.error("Admin user list connection error type=%s", type(exc).__name__)
        raise HTTPException(status_code=502, detail="Could not load user accounts") from exc


@app.post("/api/v1/admin/users/{target_user_id}/token-limit")
async def set_user_token_limit(
    target_user_id: str,
    payload: CustomTokenLimitRequest,
    admin: dict = Depends(require_user),
):
    """Allow an authenticated admin to set or clear a user's custom monthly token limit."""
    if not SUPABASE_SERVICE_ROLE_KEY:
        raise HTTPException(status_code=503, detail="Admin service is not configured")
    if payload.enabled and payload.monthly_token_limit is None:
        raise HTTPException(status_code=400, detail="Enter a custom token limit when enabling it")

    headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            role_response = await client.get(
                f"{SUPABASE_URL}/rest/v1/profiles",
                headers=headers,
                params={"select": "role", "id": f"eq.{admin.get('id', '')}", "limit": "1"},
            )
            if role_response.status_code != 200:
                logger.error("Admin role lookup failed status=%s", role_response.status_code)
                raise HTTPException(status_code=503, detail="Could not verify admin permissions")
            role_rows = role_response.json()
            if not role_rows or role_rows[0].get("role") != "admin":
                raise HTTPException(status_code=403, detail="Admin access is required")

            update_response = await client.patch(
                f"{SUPABASE_URL}/rest/v1/user_subscriptions",
                headers=headers,
                params={
                    "user_id": f"eq.{target_user_id}",
                    "status": "eq.active",
                },
                json={
                    "custom_monthly_token_limit": payload.monthly_token_limit if payload.enabled else None,
                    "custom_limit_enabled": payload.enabled,
                    "limit_updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                    "limit_updated_by": str(admin.get("id", "")),
                },
            )
            if update_response.status_code not in (200, 204):
                logger.error("Custom token limit update failed status=%s", update_response.status_code)
                raise HTTPException(status_code=503, detail="Could not save the custom token limit")
            updated_rows = update_response.json() if update_response.content else []
            if not updated_rows:
                raise HTTPException(status_code=404, detail="The user has no active subscription")
            return {
                "success": True,
                "user_id": target_user_id,
                "custom_limit_enabled": payload.enabled,
                "custom_monthly_token_limit": payload.monthly_token_limit if payload.enabled else None,
            }
    except httpx.HTTPError as exc:
        logger.error("Custom token limit update connection error type=%s", type(exc).__name__)
        raise HTTPException(status_code=502, detail="Could not update the custom token limit") from exc

