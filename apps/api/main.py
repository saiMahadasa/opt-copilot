import logging
import os

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="opt-copilot API")
logger = logging.getLogger(__name__)


class AskRequest(BaseModel):
    message: str
    stage: str | None = None


class AskResponse(BaseModel):
    reply: str


SYSTEM_PROMPT = (
    "You are a helpful assistant for F-1 international students in the US "
    "navigating CPT, OPT, and STEM OPT. Answer clearly and specifically where "
    "the rules are well established. For anything involving a specific student's "
    "individual case, a status decision, a delayed document, or anything with "
    "real consequences for their visa status, give your best explanation but "
    "always end by telling them to confirm with their school's DSO or an "
    "immigration attorney before acting. Never present a guess as a certain "
    "answer. If a question is outside F-1/OPT/STEM OPT topics, say so and "
    "redirect."
)


def retrieve_context(message: str) -> str:
    """Embed the query, fetch the 3 closest document chunks, return a formatted
    block to inject into the prompt. Returns empty string on any failure so
    retrieval errors never block the response."""
    try:
        from google import genai
        from supabase import create_client

        url = os.environ.get("SUPABASE_URL")
        key = os.environ.get("SUPABASE_KEY")
        if not url or not key:
            raise EnvironmentError("SUPABASE_URL or SUPABASE_KEY not set")

        client = genai.Client()
        response = client.models.embed_content(
            model="gemini-embedding-001",
            contents=message,
            config={"output_dimensionality": 768, "task_type": "RETRIEVAL_QUERY"},
        )
        query_vector = response.embeddings[0].values

        db = create_client(url, key)
        result = db.rpc(
            "match_document_chunks",
            {"query_embedding": query_vector, "match_count": 3},
        ).execute()

        chunks = result.data
        if not chunks:
            return ""

        lines = ["Reference material:"]
        for chunk in chunks:
            lines.append(f"[source: {chunk['source']}] {chunk['content']}")
        return "\n".join(lines)

    except Exception as exc:
        logger.warning("Retrieval failed, proceeding without context: %s", exc)
        return ""


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/ask", response_model=AskResponse)
def ask(body: AskRequest):
    from llm_providers import get_completion

    stage_line = (
        f"\nThe student's current stage is: {body.stage}." if body.stage else ""
    )
    context_block = retrieve_context(body.message)
    context_section = f"\n\n{context_block}" if context_block else ""

    prompt = (
        f"{SYSTEM_PROMPT}{stage_line}{context_section}"
        f"\n\nStudent question: {body.message}"
    )

    try:
        reply = get_completion(prompt, provider="gemini")
    except EnvironmentError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Couldn't reach the AI service, try again in a moment.",
        )

    return AskResponse(reply=reply)
