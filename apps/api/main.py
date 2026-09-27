from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="opt-copilot API")


class AskRequest(BaseModel):
    message: str
    stage: str | None = None


class AskResponse(BaseModel):
    reply: str


@app.get("/health")
def health():
    return {"status": "ok"}


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


@app.post("/ask", response_model=AskResponse)
def ask(body: AskRequest):
    from llm_providers import get_completion

    stage_line = (
        f"\nThe student's current stage is: {body.stage}." if body.stage else ""
    )
    prompt = f"{SYSTEM_PROMPT}{stage_line}\n\nStudent question: {body.message}"

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
