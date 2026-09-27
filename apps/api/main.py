from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="opt-copilot API")


class AskRequest(BaseModel):
    message: str


class AskResponse(BaseModel):
    reply: str


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/ask", response_model=AskResponse)
def ask(body: AskRequest):
    from llm_providers import get_completion

    try:
        reply = get_completion(body.message, provider="gemini")
    except EnvironmentError as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    return AskResponse(reply=reply)
