import os
from google import genai


def complete(prompt: str) -> str:
    if not os.environ.get("GEMINI_API_KEY"):
        raise EnvironmentError("GEMINI_API_KEY is not set")

    client = genai.Client()
    chat = client.chats.create(model="gemini-3.5-flash")
    response = chat.send_message(prompt)
    return response.text
