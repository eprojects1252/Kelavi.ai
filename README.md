# Kilavi.Ai

Mobile-first AI platform for general assistance, coding, project knowledge, vision research, and developer APIs.

## Architecture
- `frontend/`: Next.js web application
- `backend/`: FastAPI service
- Supabase: Auth, PostgreSQL, Storage; pgvector planned
- Configurable cloud AI provider; local Ollama adapter planned

## Security
Never commit API secrets or Supabase service-role keys. Use Supabase publishable keys only in frontend with Row Level Security enabled.
