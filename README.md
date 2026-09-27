# opt-copilot

AI-assisted tool for F-1 international students to track OPT/STEM OPT deadlines and get answers about their immigration status.

## Structure

```
opt-copilot/
├── apps/
│   ├── web/   Next.js 14 frontend (App Router, TypeScript, Tailwind, shadcn/ui)
│   └── api/   FastAPI backend (AI provider abstraction, deadline logic)
├── .env.example
└── README.md
```

## Setup

### 1. Environment

```bash
cp .env.example .env
# Fill in your API keys
```

### 2. API (Python)

```bash
cd apps/api
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
# http://localhost:8000/health
```

### 3. Web (Next.js)

```bash
cd apps/web
npm install
npm run dev
# http://localhost:3000
```
