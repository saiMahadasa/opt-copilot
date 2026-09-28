# opt-copilot

AI-assisted tool for F-1 international students to track OPT/STEM OPT deadlines and get answers about their immigration status.

## Structure

```
opt-copilot/
├── apps/
│   ├── web/   Next.js 14 frontend (App Router, TypeScript, Tailwind, shadcn/ui)
│   └── api/   FastAPI backend (RAG retrieval, Gemini, Supabase)
└── README.md
```

## Run locally

### API (Python)

```bash
cd apps/api
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env        # then fill in values
uvicorn main:app --reload
# http://localhost:8000/health
```

### Web (Next.js)

```bash
cd apps/web
npm install
cp .env.example .env.local  # then fill in values
npm run dev
# http://localhost:3000
```

### Ingest knowledge base (one-time, after filling knowledge/*.md)

```bash
cd apps/api
python ingest.py
```

## Environment variables

### apps/api/.env

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | yes | Google AI Studio API key |
| `SUPABASE_URL` | yes | Supabase project URL |
| `SUPABASE_KEY` | yes | Supabase service-role key |
| `MIN_SIMILARITY` | no | Cosine similarity threshold for retrieval (default `0.5`) |
| `ALLOWED_ORIGINS` | no | Comma-separated CORS origins (default `http://localhost:3000`) |

### apps/web/.env.local

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | no | Backend base URL (default `http://localhost:8000`) |
